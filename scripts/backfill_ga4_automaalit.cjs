/**
 * Backfill GA4 data for Automaalit.net
 * Fetches historical behavioral data and upserts to ga4_analytics
 * Uses same format as production api/ga4/sync.js (no landingPage dimension)
 */
const { supabase, printProjectInfo } = require('./db.cjs')

const AUTOMAALIT_STORE_ID = '9a0ba934-bd6c-428c-8729-791d5c7ac7c2'

async function backfillGA4() {
  printProjectInfo()
  console.log('\nBackfilling GA4 data for Automaalit.net...')

  // Get token
  const { data: tokenData, error: tokenError } = await supabase
    .from('ga4_tokens')
    .select('*')
    .eq('store_id', AUTOMAALIT_STORE_ID)
    .single()

  if (tokenError || !tokenData) {
    console.error('Token error:', tokenError?.message)
    return
  }

  console.log('Property:', tokenData.property_name || tokenData.property_id)

  let accessToken = tokenData.access_token

  // Refresh token if expired
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
    await supabase
      .from('ga4_tokens')
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('store_id', AUTOMAALIT_STORE_ID)
    console.log('Token refreshed!')
  }

  // Backfill in 3-month chunks to stay under GA4 API limits
  const chunks = [
    ['2025-01-01', '2025-03-31'],
    ['2025-04-01', '2025-06-30'],
    ['2025-07-01', '2025-09-30'],
    ['2025-10-01', '2025-11-30']
  ]

  let totalInserted = 0

  for (const [startDate, endDate] of chunks) {
    console.log(`\nFetching ${startDate} to ${endDate}...`)

    const response = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/${tokenData.property_id}:runReport`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dateRanges: [{ startDate, endDate }],
          dimensions: [
            { name: 'date' },
            { name: 'sessionSource' },
            { name: 'sessionMedium' },
            { name: 'sessionDefaultChannelGrouping' }
          ],
          metrics: [
            { name: 'sessions' },
            { name: 'engagedSessions' },
            { name: 'bounceRate' },
            { name: 'averageSessionDuration' },
            { name: 'newUsers' },
            { name: 'totalUsers' }
          ],
          limit: 100000
        })
      }
    )

    if (!response.ok) {
      console.error('API error:', response.status, await response.text())
      continue
    }

    const reportData = await response.json()
    const rows = reportData.rows || []
    console.log(`  Rows from API: ${rows.length}`)

    if (rows.length === 0) continue

    // Transform to DB format (same as api/ga4/sync.js)
    const records = rows.map(row => {
      const dims = row.dimensionValues || []
      const mets = row.metricValues || []
      const dateRaw = dims[0]?.value
      if (!dateRaw || dateRaw.length !== 8) return null

      const newUsers = parseInt(mets[4]?.value || 0)
      const totalUsers = parseInt(mets[5]?.value || 0)

      return {
        store_id: AUTOMAALIT_STORE_ID,
        property_id: tokenData.property_id,
        date: `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`,
        session_source: dims[1]?.value || null,
        session_medium: dims[2]?.value || null,
        session_default_channel_grouping: dims[3]?.value || null,
        landing_page: null,
        sessions: parseInt(mets[0]?.value || 0),
        engaged_sessions: parseInt(mets[1]?.value || 0),
        bounce_rate: parseFloat(mets[2]?.value || 0),
        average_session_duration: parseFloat(mets[3]?.value || 0),
        new_users: newUsers,
        returning_users: Math.max(0, totalUsers - newUsers)
      }
    }).filter(Boolean)

    // Delete old data for this chunk period, then insert
    await supabase
      .from('ga4_analytics')
      .delete()
      .eq('store_id', AUTOMAALIT_STORE_ID)
      .gte('date', startDate)
      .lte('date', endDate)

    // Insert in batches
    const batchSize = 500
    let inserted = 0
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error } = await supabase.from('ga4_analytics').insert(batch)
      if (error) console.error('  Insert error:', error.message)
      else inserted += batch.length
    }

    console.log(`  Inserted: ${inserted} rows`)
    totalInserted += inserted
  }

  console.log(`\n✅ GA4 backfill complete! Total: ${totalInserted} rows inserted`)

  // Verify date range
  const { data: earliest } = await supabase.from('ga4_analytics').select('date').eq('store_id', AUTOMAALIT_STORE_ID).order('date', { ascending: true }).limit(1)
  const { data: latest } = await supabase.from('ga4_analytics').select('date').eq('store_id', AUTOMAALIT_STORE_ID).order('date', { ascending: false }).limit(1)
  console.log('Date range now:', earliest?.[0]?.date, '-', latest?.[0]?.date)
}

backfillGA4().catch(console.error)
