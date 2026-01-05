/**
 * Google Search Console Data Sync
 *
 * Fetches search analytics data from GSC API and stores in Supabase.
 *
 * Endpoints:
 * - POST /gsc-sync { store_id, start_date?, end_date? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || ''
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || ''

// Refresh access token if expired
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    console.error('❌ Token refresh failed:', await response.text())
    return null
  }

  const data = await response.json()
  return data.access_token
}

// Fetch search analytics from GSC API
async function fetchSearchAnalytics(
  accessToken: string,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<any[]> {
  const response = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: ['date', 'query', 'page', 'device', 'country'],
        rowLimit: 25000, // Max allowed
      }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GSC API error: ${error}`)
  }

  const data = await response.json()
  return data.rows || []
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'POST method required' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { store_id, start_date, end_date } = await req.json()

    if (!store_id) {
      return new Response(
        JSON.stringify({ error: 'store_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Default date range: last 28 days
    const endDate = end_date || new Date().toISOString().split('T')[0]
    const startDate = start_date || new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    console.log(`📊 Syncing GSC data for store ${store_id}: ${startDate} to ${endDate}`)

    // Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get stored tokens for this store
    const { data: tokens, error: tokenError } = await supabase
      .from('gsc_tokens')
      .select('*')
      .eq('store_id', store_id)

    if (tokenError || !tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No GSC tokens found. Please connect Google Search Console first.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let totalRowsInserted = 0
    const results: any[] = []

    for (const token of tokens) {
      console.log(`📡 Fetching data for site: ${token.site_url}`)

      // Check if token is expired and refresh if needed
      let accessToken = token.access_token
      const tokenExpiry = new Date(token.token_expiry)

      if (tokenExpiry < new Date()) {
        console.log('🔄 Token expired, refreshing...')
        const newToken = await refreshAccessToken(token.refresh_token)

        if (!newToken) {
          results.push({
            site_url: token.site_url,
            status: 'error',
            message: 'Failed to refresh token'
          })
          continue
        }

        accessToken = newToken

        // Update token in database
        await supabase
          .from('gsc_tokens')
          .update({
            access_token: newToken,
            token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', token.id)
      }

      try {
        // Fetch search analytics
        const rows = await fetchSearchAnalytics(accessToken, token.site_url, startDate, endDate)
        console.log(`📈 Received ${rows.length} rows`)

        // Transform and insert data
        const analyticsData = rows.map((row: any) => ({
          store_id,
          site_url: token.site_url,
          date: row.keys[0], // date
          query: row.keys[1], // query
          page: row.keys[2], // page
          device: row.keys[3], // device
          country: row.keys[4], // country
          clicks: row.clicks || 0,
          impressions: row.impressions || 0,
          ctr: row.ctr || 0,
          position: row.position || 0,
        }))

        // Upsert in batches of 1000
        const batchSize = 1000
        for (let i = 0; i < analyticsData.length; i += batchSize) {
          const batch = analyticsData.slice(i, i + batchSize)

          const { error: insertError } = await supabase
            .from('gsc_search_analytics')
            .upsert(batch, {
              onConflict: 'store_id,site_url,date,query,page,country,device'
            })

          if (insertError) {
            console.error('❌ Insert error:', insertError)
          } else {
            totalRowsInserted += batch.length
          }
        }

        results.push({
          site_url: token.site_url,
          status: 'success',
          rows_synced: rows.length
        })

      } catch (err) {
        console.error(`❌ Error fetching data for ${token.site_url}:`, err)
        results.push({
          site_url: token.site_url,
          status: 'error',
          message: err.message
        })
      }
    }

    console.log(`✅ Sync complete. Total rows: ${totalRowsInserted}`)

    return new Response(
      JSON.stringify({
        success: true,
        date_range: { start: startDate, end: endDate },
        total_rows_synced: totalRowsInserted,
        sites: results
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
