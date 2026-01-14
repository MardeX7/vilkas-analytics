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
      return res.status(404).json({ error: 'GSC not connected' })
    }

    let accessToken = tokenData.access_token

    // Check if token expired, refresh if needed
    if (new Date(tokenData.expires_at) < new Date()) {
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
        return res.status(401).json({ error: 'Token refresh failed' })
      }

      accessToken = refreshData.access_token

      // Update token in DB
      await supabase
        .from('gsc_tokens')
        .update({
          access_token: accessToken,
          expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('store_id', store_id)
    }

    // Calculate date range (default: last 30 days)
    const endDate = end_date || new Date().toISOString().split('T')[0]
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

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
      console.error('GSC Daily API error:', dailyData.error)
      return res.status(500).json({ error: dailyData.error.message })
    }

    const dailyRows = dailyData.rows || []

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

    // Delete old daily totals for this period
    await supabase
      .from('gsc_daily_totals')
      .delete()
      .eq('store_id', store_id)
      .gte('date', startDate)
      .lte('date', endDate)

    // Insert daily totals
    if (dailyRecords.length > 0) {
      const { error: dailyInsertError } = await supabase
        .from('gsc_daily_totals')
        .insert(dailyRecords)

      if (dailyInsertError) {
        console.error('Daily totals insert error:', dailyInsertError)
      }
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
      console.error('GSC API error:', gscData.error)
      return res.status(500).json({ error: gscData.error.message })
    }

    const rows = gscData.rows || []

    // Transform and insert detailed data
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

    // Delete old detailed data for this period and store
    await supabase
      .from('gsc_search_analytics')
      .delete()
      .eq('store_id', store_id)
      .gte('date', startDate)
      .lte('date', endDate)

    // Insert new detailed data in batches
    const batchSize = 1000
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error: insertError } = await supabase
        .from('gsc_search_analytics')
        .insert(batch)

      if (insertError) {
        console.error('Insert error:', insertError)
      }
    }

    return res.json({
      success: true,
      daily_totals_synced: dailyRecords.length,
      detailed_rows_synced: records.length,
      period: { startDate, endDate }
    })

  } catch (err) {
    console.error('Sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}
