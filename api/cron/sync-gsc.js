/**
 * GSC Daily Sync Cron Job
 *
 * Syncs Google Search Console data for all connected stores.
 * Runs daily at 06:05 UTC (before morning brief).
 * Fetches last 10 days to cover GSC's ~3 day data lag.
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export const config = {
  maxDuration: 120
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    console.log('🔍 Starting GSC sync cron...')

    // Get all stores with GSC tokens
    const { data: tokens, error: tokensError } = await supabase
      .from('gsc_tokens')
      .select('store_id, site_url, access_token, refresh_token, expires_at')

    if (tokensError) {
      console.error('Failed to fetch GSC tokens:', tokensError.message)
      return res.status(500).json({ error: tokensError.message })
    }

    if (!tokens || tokens.length === 0) {
      console.log('🔍 No stores with GSC connected, skipping')
      return res.json({ success: true, message: 'No GSC-connected stores', stores_synced: 0 })
    }

    console.log(`🔍 Found ${tokens.length} store(s) with GSC connected`)

    // Sync date range: last 10 days (covers GSC's ~3 day lag + buffer)
    const GSC_DATA_LAG_DAYS = 3
    const SYNC_WINDOW_DAYS = 10
    const endDate = new Date(Date.now() - GSC_DATA_LAG_DAYS * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]
    const startDate = new Date(Date.now() - SYNC_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0]

    const results = []

    for (const tokenData of tokens) {
      try {
        console.log(`\n🔍 Syncing GSC for store ${tokenData.store_id} (${tokenData.site_url})`)
        const result = await syncStoreGSC(tokenData, startDate, endDate)
        results.push({ store_id: tokenData.store_id, ...result })
      } catch (err) {
        console.error(`❌ GSC sync failed for ${tokenData.store_id}:`, err.message)
        results.push({ store_id: tokenData.store_id, error: err.message })
      }
    }

    console.log(`\n✅ GSC sync cron complete: ${results.filter(r => !r.error).length}/${results.length} stores synced`)

    return res.json({
      success: true,
      stores_synced: results.filter(r => !r.error).length,
      period: { startDate, endDate },
      results
    })

  } catch (err) {
    console.error('GSC sync cron error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}

/**
 * Sync GSC data for a single store
 */
async function syncStoreGSC(tokenData, startDate, endDate) {
  let accessToken = tokenData.access_token

  // Refresh token if expired
  const tokenExpiry = tokenData.expires_at ? new Date(tokenData.expires_at) : new Date(0)
  if (tokenExpiry < new Date()) {
    console.log('   Token expired, refreshing...')
    accessToken = await refreshGSCToken(tokenData)
  }

  const encodedSiteUrl = encodeURIComponent(tokenData.site_url)
  const gscApiBase = `https://www.googleapis.com/webmasters/v3/sites/${encodedSiteUrl}/searchAnalytics/query`
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  }

  // 1. Fetch daily totals
  const dailyResponse = await fetch(gscApiBase, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['date'],
      rowLimit: 25000
    })
  })

  const dailyData = await dailyResponse.json()
  if (dailyData.error) {
    throw new Error(`GSC Daily API: ${dailyData.error.message || dailyData.error.status}`)
  }

  const dailyRows = dailyData.rows || []
  let dailyUpserted = 0

  if (dailyRows.length > 0) {
    const dailyRecords = dailyRows.map(row => ({
      store_id: tokenData.store_id,
      date: row.keys[0],
      clicks: row.clicks || 0,
      impressions: row.impressions || 0,
      ctr: row.ctr || 0,
      position: row.position || 0,
      updated_at: new Date().toISOString()
    }))

    const { error } = await supabase
      .from('gsc_daily_totals')
      .upsert(dailyRecords, { onConflict: 'store_id,date' })

    if (error) {
      console.error('   Daily upsert error:', error.message)
    } else {
      dailyUpserted = dailyRecords.length
    }
  }

  // 2. Fetch detailed data (query, page, device, country)
  const detailedResponse = await fetch(gscApiBase, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      startDate,
      endDate,
      dimensions: ['date', 'query', 'page', 'device', 'country'],
      rowLimit: 25000
    })
  })

  const detailedData = await detailedResponse.json()
  if (detailedData.error) {
    throw new Error(`GSC Detailed API: ${detailedData.error.message || detailedData.error.status}`)
  }

  const rows = detailedData.rows || []
  let detailedSynced = 0

  if (rows.length > 0) {
    const records = rows.map(row => ({
      store_id: tokenData.store_id,
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

    // Delete old detailed data for this period, then insert
    await supabase
      .from('gsc_search_analytics')
      .delete()
      .eq('store_id', tokenData.store_id)
      .gte('date', startDate)
      .lte('date', endDate)

    const batchSize = 1000
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error } = await supabase
        .from('gsc_search_analytics')
        .insert(batch)

      if (error) {
        console.error(`   Detailed batch error:`, error.message)
      } else {
        detailedSynced += batch.length
      }
    }
  }

  console.log(`   ✅ Daily: ${dailyUpserted}, Detailed: ${detailedSynced}`)
  return { daily_synced: dailyUpserted, detailed_synced: detailedSynced }
}

/**
 * Refresh an expired GSC access token
 */
async function refreshGSCToken(tokenData) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token'
    })
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`)
  }

  // Update token in DB
  await supabase
    .from('gsc_tokens')
    .update({
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('store_id', tokenData.store_id)

  console.log('   Token refreshed')
  return data.access_token
}
