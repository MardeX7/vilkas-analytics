// GSC Sync - Hakee datan Google Search Console API:sta ja tallentaa Supabaseen
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { store_id, start_date, end_date } = req.body

  if (!store_id) {
    return res.status(400).json({ error: 'store_id required' })
  }

  try {
    // Get tokens from DB
    const { data: tokenData, error: tokenError } = await supabase
      .from('gsc_tokens')
      .select('*')
      .eq('store_id', store_id)
      .single()

    if (tokenError || !tokenData) {
      console.error('GSC tokens not found for store:', store_id, tokenError?.message)
      return res.status(404).json({ error: 'GSC not connected', details: tokenError?.message })
    }

    if (!tokenData.refresh_token) {
      console.error('GSC refresh_token missing for store:', store_id)
      return res.status(401).json({ error: 'GSC refresh_token missing - reconnect GSC' })
    }

    let accessToken = tokenData.access_token

    // Check if token expired, refresh if needed
    // Also refresh if expires_at is null/undefined (safety)
    const tokenExpiry = tokenData.expires_at ? new Date(tokenData.expires_at) : new Date(0)
    if (tokenExpiry < new Date()) {
      console.log('GSC token expired, refreshing... (expired:', tokenData.expires_at, ')')

      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token'
        })
      })

      const refreshData = await refreshResponse.json()

      if (refreshData.error) {
        console.error('GSC token refresh failed:', refreshData.error, refreshData.error_description)
        return res.status(401).json({
          error: 'Token refresh failed',
          details: refreshData.error_description || refreshData.error,
          action: 'Reconnect GSC from Settings page'
        })
      }

      accessToken = refreshData.access_token
      console.log('GSC token refreshed successfully')

      // Update token in DB
      const { error: updateError } = await supabase
        .from('gsc_tokens')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('store_id', store_id)

      if (updateError) {
        console.error('Failed to update GSC token in DB:', updateError.message)
      }
    }

    // Calculate date range
    // GSC data has ~3 day lag - don't request today or yesterday
    const GSC_DATA_LAG_DAYS = 3
    const defaultEndDate = new Date(Date.now() - GSC_DATA_LAG_DAYS * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]
    const endDate = end_date || defaultEndDate
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    console.log(`GSC sync: ${startDate} - ${endDate} for store ${store_id}`)

    // 1. FETCH DAILY TOTALS (date-only dimension for accurate totals)
    const dailyResponse = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(tokenData.site_url)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ['date'],
          rowLimit: 25000
        })
      }
    )

    const dailyData = await dailyResponse.json()

    if (dailyData.error) {
      console.error('GSC Daily API error:', JSON.stringify(dailyData.error))
      return res.status(dailyResponse.status || 500).json({
        error: dailyData.error.message || 'GSC API error',
        code: dailyData.error.code,
        status: dailyData.error.status
      })
    }

    const dailyRows = dailyData.rows || []
    console.log(`GSC daily rows received: ${dailyRows.length}`)

    // Transform daily totals
    const dailyRecords = dailyRows.map(row => ({
      store_id,
      date: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
      updated_at: new Date().toISOString()
    }))

    // SAFE UPSERT: Only modify DB if we got data back from GSC API
    let dailyUpserted = 0
    if (dailyRecords.length > 0) {
      const { error: dailyUpsertError } = await supabase
        .from('gsc_daily_totals')
        .upsert(dailyRecords, {
          onConflict: 'store_id,date',
          ignoreDuplicates: false
        })

      if (dailyUpsertError) {
        console.error('Daily totals upsert error:', dailyUpsertError.message)
      } else {
        dailyUpserted = dailyRecords.length
      }
    } else {
      console.warn('GSC API returned 0 daily rows - skipping DB update (preserving existing data)')
    }

    // 2. FETCH DETAILED DATA (all dimensions for queries/pages breakdown)
    const gscResponse = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(tokenData.site_url)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ['date', 'query', 'page', 'device', 'country'],
          rowLimit: 25000
        })
      }
    )

    const gscData = await gscResponse.json()

    if (gscData.error) {
      console.error('GSC Detailed API error:', JSON.stringify(gscData.error))
      return res.status(gscResponse.status || 500).json({
        error: gscData.error.message || 'GSC API error',
        code: gscData.error.code,
        daily_totals_synced: dailyUpserted
      })
    }

    const rows = gscData.rows || []
    console.log(`GSC detailed rows received: ${rows.length}`)

    // Transform detailed data
    const records = rows.map(row => ({
      store_id,
      date: row.keys[0],
      query: row.keys[1] || null,
      page: row.keys[2] || null,
      device: row.keys[3] || null,
      country: row.keys[4] || null,
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0
    }))

    // SAFE: Only delete+insert detailed data if we got rows back
    let detailedSynced = 0
    let insertErrors = 0
    if (records.length > 0) {
      // Delete old detailed data for this period
      const { error: deleteError } = await supabase
        .from('gsc_search_analytics')
        .delete()
        .eq('store_id', store_id)
        .gte('date', startDate)
        .lte('date', endDate)

      if (deleteError) {
        console.error('Detailed data delete error:', deleteError.message)
      }

      // Insert new detailed data in batches
      const batchSize = 1000
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize)
        const { error: insertError } = await supabase
          .from('gsc_search_analytics')
          .insert(batch)

        if (insertError) {
          console.error(`Insert error (batch ${Math.floor(i / batchSize) + 1}):`, insertError.message)
          insertErrors++
        } else {
          detailedSynced += batch.length
        }
      }
    } else {
      console.warn('GSC API returned 0 detailed rows - skipping DB update (preserving existing data)')
    }

    const success = dailyUpserted > 0 || detailedSynced > 0
    const statusCode = success ? 200 : 204

    console.log(`GSC sync complete: ${dailyUpserted} daily, ${detailedSynced} detailed, ${insertErrors} batch errors`)

    return res.status(statusCode).json({
      success,
      daily_totals_synced: dailyUpserted,
      detailed_rows_synced: detailedSynced,
      insert_errors: insertErrors,
      period: { startDate, endDate },
      warning: !success ? 'No data received from GSC API - existing data preserved' : undefined
    })

  } catch (err) {
    console.error('GSC sync error:', err.message, err.stack)
    return res.status(500).json({ error: err.message })
  }
}
