const { supabase, printProjectInfo } = require('./db.cjs');

(async () => {
  printProjectInfo()
  const store_id = '9a0ba934-bd6c-428c-8729-791d5c7ac7c2'

  console.log('\nFetching GSC token for Automaalit.net...')

  const { data: tokenData, error: tokenError } = await supabase
    .from('gsc_tokens')
    .select('*')
    .eq('store_id', store_id)
    .single()

  if (tokenError || !tokenData) {
    console.error('Token error:', tokenError?.message)
    return
  }

  console.log('Token found, site:', tokenData.site_url)

  let accessToken = tokenData.access_token

  // Refresh if expired
  const tokenExpiry = tokenData.expires_at ? new Date(tokenData.expires_at) : new Date(0)
  if (tokenExpiry < new Date()) {
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
      console.error('Token refresh failed:', refreshData.error, refreshData.error_description)
      return
    }

    accessToken = refreshData.access_token
    console.log('Token refreshed!')

    await supabase
      .from('gsc_tokens')
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('store_id', store_id)
  }

  // Date range: from CLI args or default to last 90 days
  // Usage: node sync_automaalit_gsc.cjs 2025-01-01 2025-06-30
  const endDate = process.argv[3] || new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const startDate = process.argv[2] || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  console.log('\nSyncing:', startDate, 'to', endDate)

  const encodedSiteUrl = encodeURIComponent(tokenData.site_url)
  const apiBase = 'https://www.googleapis.com/webmasters/v3/sites/' + encodedSiteUrl + '/searchAnalytics/query'
  const headers = {
    'Authorization': 'Bearer ' + accessToken,
    'Content-Type': 'application/json'
  }

  // 1. Daily totals
  console.log('\n1. Fetching daily totals...')
  const dailyResponse = await fetch(apiBase, {
    method: 'POST', headers,
    body: JSON.stringify({ startDate, endDate, dimensions: ['date'], rowLimit: 25000 })
  })

  const dailyData = await dailyResponse.json()
  if (dailyData.error) {
    console.error('API error:', JSON.stringify(dailyData.error, null, 2))
    return
  }

  const dailyRows = dailyData.rows || []
  console.log('Daily rows:', dailyRows.length)

  if (dailyRows.length > 0) {
    const totals = dailyRows.reduce((a, r) => ({ clicks: a.clicks + (r.clicks || 0), impressions: a.impressions + (r.impressions || 0) }), { clicks: 0, impressions: 0 })
    console.log('Total clicks:', totals.clicks, '| impressions:', totals.impressions)

    const { error } = await supabase
      .from('gsc_daily_totals')
      .upsert(dailyRows.map(r => ({
        store_id, date: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0,
        ctr: r.ctr || 0, position: r.position || 0, updated_at: new Date().toISOString()
      })), { onConflict: 'store_id,date' })

    if (error) console.error('Daily upsert error:', error.message)
    else console.log('Daily totals saved')
  }

  // 2. Detailed data
  console.log('\n2. Fetching detailed data...')
  const detailedResponse = await fetch(apiBase, {
    method: 'POST', headers,
    body: JSON.stringify({ startDate, endDate, dimensions: ['date', 'query', 'page', 'device', 'country'], rowLimit: 25000 })
  })

  const detailedData = await detailedResponse.json()
  if (detailedData.error) {
    console.error('API error:', JSON.stringify(detailedData.error, null, 2))
    return
  }

  const rows = detailedData.rows || []
  console.log('Detailed rows:', rows.length)

  if (rows.length > 0) {
    await supabase.from('gsc_search_analytics').delete().eq('store_id', store_id).gte('date', startDate).lte('date', endDate)

    const batchSize = 1000
    let inserted = 0
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map(r => ({
        store_id, date: r.keys[0], query: r.keys[1] || null, page: r.keys[2] || null,
        device: r.keys[3] || null, country: r.keys[4] || null,
        clicks: r.clicks || 0, impressions: r.impressions || 0, ctr: r.ctr || 0, position: r.position || 0
      }))
      const { error } = await supabase.from('gsc_search_analytics').insert(batch)
      if (error) console.error('Batch error:', error.message)
      else inserted += batch.length
    }
    console.log('Detailed rows inserted:', inserted)
  }

  console.log('\nDone!')
})()
