// Direct GA4 sync script - syncs both 2025 and 2026 data
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '/Users/markkukorkiakoski/Desktop/VilkasAnalytics/.env.local' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function formatGA4Date(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null
  return yyyymmdd.slice(0, 4) + '-' + yyyymmdd.slice(4, 6) + '-' + yyyymmdd.slice(6, 8)
}

async function fetchGA4Report(accessToken, propertyId, startDate, endDate) {
  const response = await fetch(
    'https://analyticsdata.googleapis.com/v1beta/' + propertyId + ':runReport',
    {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [
          { name: 'date' },
          { name: 'sessionSource' },
          { name: 'sessionMedium' },
          { name: 'sessionDefaultChannelGrouping' },
          { name: 'landingPage' }
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
    const errorText = await response.text()
    console.error('GA4 API response error:', errorText)
    return { error: { message: 'GA4 API error: ' + response.status } }
  }

  return response.json()
}

function transformGA4Data(reportData, storeId, propertyId) {
  const rows = reportData.rows || []

  // First, map all rows
  const allRecords = rows.map(row => {
    const dims = row.dimensionValues || []
    const mets = row.metricValues || []

    const newUsers = parseInt(mets[4]?.value || 0)
    const totalUsers = parseInt(mets[5]?.value || 0)

    return {
      store_id: storeId,
      property_id: propertyId,
      date: formatGA4Date(dims[0]?.value),
      session_source: dims[1]?.value || null,
      session_medium: dims[2]?.value || null,
      session_default_channel_grouping: dims[3]?.value || null,
      landing_page: dims[4]?.value || null,
      sessions: parseInt(mets[0]?.value || 0),
      engaged_sessions: parseInt(mets[1]?.value || 0),
      bounce_rate: parseFloat(mets[2]?.value || 0),
      average_session_duration: parseFloat(mets[3]?.value || 0),
      new_users: newUsers,
      returning_users: Math.max(0, totalUsers - newUsers)
    }
  }).filter(record => record.date)

  // Aggregate duplicates by key
  const aggregated = new Map()

  for (const record of allRecords) {
    const key = record.store_id + '|' + record.property_id + '|' + record.date + '|' +
                (record.session_source || '') + '|' + (record.session_medium || '') + '|' +
                (record.landing_page || '')

    if (aggregated.has(key)) {
      const existing = aggregated.get(key)
      existing.sessions += record.sessions
      existing.engaged_sessions += record.engaged_sessions
      existing.new_users += record.new_users
      existing.returning_users += record.returning_users
      // Average the rates weighted by sessions
      if (existing.sessions + record.sessions > 0) {
        existing.bounce_rate = (existing.bounce_rate * existing._prev_sessions + record.bounce_rate * record.sessions) / (existing._prev_sessions + record.sessions)
        existing.average_session_duration = (existing.average_session_duration * existing._prev_sessions + record.average_session_duration * record.sessions) / (existing._prev_sessions + record.sessions)
        existing._prev_sessions = existing._prev_sessions + record.sessions
      }
    } else {
      record._prev_sessions = record.sessions
      aggregated.set(key, record)
    }
  }

  // Remove helper field and return
  const result = Array.from(aggregated.values())
  result.forEach(r => delete r._prev_sessions)

  return result
}

async function syncGA4() {
  const store_id = 'a28836f6-9487-4b67-9194-e907eaf94b69'

  console.log('Fetching GA4 token...')

  // Get tokens from DB
  const { data: tokenData, error: tokenError } = await supabase
    .from('ga4_tokens')
    .select('*')
    .eq('store_id', store_id)
    .single()

  if (tokenError || !tokenData) {
    console.error('Error:', tokenError)
    return
  }

  console.log('Property:', tokenData.property_name, '(' + tokenData.property_id + ')')

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

    await supabase
      .from('ga4_tokens')
      .update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('store_id', store_id)
    console.log('Token refreshed!')
  }

  // Sync periods
  const periods = [
    { startDate: '2025-01-01', endDate: '2025-12-31', label: '2025' },
    { startDate: '2026-01-01', endDate: '2026-01-25', label: '2026' }
  ]

  for (const period of periods) {
    console.log('\n=== Syncing ' + period.label + ' ===')
    console.log('Period: ' + period.startDate + ' to ' + period.endDate)

    const reportData = await fetchGA4Report(accessToken, tokenData.property_id, period.startDate, period.endDate)

    if (reportData.error) {
      console.error('GA4 API error:', reportData.error.message)
      continue
    }

    const records = transformGA4Data(reportData, store_id, tokenData.property_id)
    console.log('Rows fetched: ' + records.length)

    if (records.length === 0) {
      console.log('No data for this period')
      continue
    }

    // Calculate totals
    const totals = records.reduce((acc, r) => ({
      sessions: acc.sessions + r.sessions,
      engaged: acc.engaged + r.engaged_sessions
    }), { sessions: 0, engaged: 0 })
    console.log('Total sessions: ' + totals.sessions)
    console.log('Engagement rate: ' + (totals.sessions > 0 ? (totals.engaged / totals.sessions * 100).toFixed(1) + '%' : 'N/A'))

    // Delete old data for this period
    await supabase
      .from('ga4_analytics')
      .delete()
      .eq('store_id', store_id)
      .gte('date', period.startDate)
      .lte('date', period.endDate)

    // Insert new data in batches using upsert
    const batchSize = 1000
    let insertedCount = 0

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error: insertError } = await supabase
        .from('ga4_analytics')
        .upsert(batch, {
          onConflict: 'store_id,property_id,date,session_source,session_medium,landing_page',
          ignoreDuplicates: false
        })

      if (insertError) {
        console.error('Upsert error:', insertError)
      } else {
        insertedCount += batch.length
      }
    }

    console.log('Rows inserted: ' + insertedCount)
  }

  console.log('\n✅ GA4 sync complete!')
}

syncGA4().catch(console.error)
