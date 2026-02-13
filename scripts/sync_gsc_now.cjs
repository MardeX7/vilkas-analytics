// Direct GSC sync script
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '/Users/markkukorkiakoski/Desktop/VilkasAnalytics/.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function syncGSC() {
  const store_id = 'a28836f6-9487-4b67-9194-e907eaf94b69'

  console.log('Fetching GSC token...')

  // Get tokens from DB
  const { data: tokenData, error: tokenError } = await supabase
    .from('gsc_tokens')
    .select('*')
    .eq('store_id', store_id)
    .single()

  if (tokenError || !tokenData) {
    console.error('Error:', tokenError)
    return
  }

  let accessToken = tokenData.access_token

  // Check if token expired, refresh if needed
  if (new Date(tokenData.expires_at) < new Date()) {
    console.log('Token expired, refreshing...')
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
      console.error('Token refresh failed:', refreshData.error)
      return
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
    console.log('Token refreshed!')
  }

  // Sync date range
  // Command line args: node sync_gsc_now.cjs 2025-01-01 2025-12-31
  const startDate = process.argv[2] || '2026-01-01'
  const endDate = process.argv[3] || '2026-01-25'

  console.log('Syncing GSC data for ' + startDate + ' to ' + endDate + '...')
  console.log('Site URL:', tokenData.site_url)

  const encodedSiteUrl = encodeURIComponent(tokenData.site_url)

  // 1. FETCH DAILY TOTALS
  console.log('\n1. Fetching daily totals...')
  const dailyResponse = await fetch(
    'https://www.googleapis.com/webmasters/v3/sites/' + encodedSiteUrl + '/searchAnalytics/query',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
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
    console.error('GSC Daily API error:', JSON.stringify(dailyData.error, null, 2))
    return
  }

  const dailyRows = dailyData.rows || []
  console.log('Daily rows fetched: ' + dailyRows.length)

  if (dailyRows.length > 0) {
    console.log('Sample daily row:', dailyRows[0])

    // Calculate totals
    const totals = dailyRows.reduce((acc, row) => ({
      clicks: acc.clicks + (row.clicks || 0),
      impressions: acc.impressions + (row.impressions || 0)
    }), { clicks: 0, impressions: 0 })
    console.log('Total clicks:', totals.clicks)
    console.log('Total impressions:', totals.impressions)
  }

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
    } else {
      console.log('Daily totals inserted: ' + dailyRecords.length)
    }
  }

  // 2. FETCH DETAILED DATA
  console.log('\n2. Fetching detailed data (query, page, device, country)...')
  const gscResponse = await fetch(
    'https://www.googleapis.com/webmasters/v3/sites/' + encodedSiteUrl + '/searchAnalytics/query',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
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
    console.error('GSC API error:', JSON.stringify(gscData.error, null, 2))
    return
  }

  const rows = gscData.rows || []
  console.log('Detailed rows fetched: ' + rows.length)

  // Transform records
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

  // Delete old data for this period
  await supabase
    .from('gsc_search_analytics')
    .delete()
    .eq('store_id', store_id)
    .gte('date', startDate)
    .lte('date', endDate)

  // Insert new data in batches
  const batchSize = 1000
  let insertedCount = 0
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error: insertError } = await supabase
      .from('gsc_search_analytics')
      .insert(batch)

    if (insertError) {
      console.error('Insert error:', insertError)
    } else {
      insertedCount += batch.length
    }
  }

  console.log('Detailed rows inserted: ' + insertedCount)
  console.log('\n✅ GSC sync complete!')
}

syncGSC().catch(console.error)
