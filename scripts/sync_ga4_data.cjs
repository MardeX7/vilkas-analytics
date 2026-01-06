/**
 * Sync GA4 Data
 * Hakee behavioral-datan (sessions, bounce rate, traffic sources) GA4 Data API:sta
 */

const { supabase, printProjectInfo } = require('./db.cjs')

// GA4 Data API endpoint
const GA4_DATA_API = 'https://analyticsdata.googleapis.com/v1beta'

async function refreshToken(token) {
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token'
    })
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`)
  }

  // Päivitä token kantaan
  const expiresAt = new Date(Date.now() + data.expires_in * 1000)
  await supabase
    .from('ga4_tokens')
    .update({
      access_token: data.access_token,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', token.id)

  return data.access_token
}

async function fetchGA4Data(accessToken, propertyId, startDate, endDate) {
  const propertyNumber = propertyId.replace('properties/', '')

  const response = await fetch(`${GA4_DATA_API}/properties/${propertyNumber}:runReport`, {
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
      limit: 10000
    })
  })

  const data = await response.json()

  if (data.error) {
    throw new Error(`GA4 API error: ${data.error.message}`)
  }

  return data
}

function parseGA4Response(response, storeId, propertyId) {
  if (!response.rows || response.rows.length === 0) {
    return []
  }

  return response.rows.map(row => {
    const date = row.dimensionValues[0].value // YYYYMMDD
    const formattedDate = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}`

    return {
      store_id: storeId,
      property_id: propertyId,
      date: formattedDate,
      session_source: row.dimensionValues[1].value || null,
      session_medium: row.dimensionValues[2].value || null,
      session_default_channel_grouping: row.dimensionValues[3].value || null,
      landing_page: row.dimensionValues[4].value || null,
      sessions: parseInt(row.metricValues[0].value) || 0,
      engaged_sessions: parseInt(row.metricValues[1].value) || 0,
      bounce_rate: parseFloat(row.metricValues[2].value) || 0,
      average_session_duration: parseFloat(row.metricValues[3].value) || 0,
      new_users: parseInt(row.metricValues[4].value) || 0,
      returning_users: Math.max(0, parseInt(row.metricValues[5].value) - parseInt(row.metricValues[4].value))
    }
  })
}

async function syncGA4() {
  printProjectInfo()

  const storeId = 'a28836f6-9487-4b67-9194-e907eaf94b69'

  // 1. Hae token
  console.log('1. Fetching GA4 token...')
  const { data: tokens, error: tokenError } = await supabase
    .from('ga4_tokens')
    .select('*')
    .eq('store_id', storeId)

  if (tokenError || !tokens || tokens.length === 0) {
    console.log('❌ No GA4 token found')
    return
  }

  let token = tokens[0]
  console.log(`   Property: ${token.property_name}`)
  console.log(`   Property ID: ${token.property_id}`)

  // 2. Tarkista tokenin voimassaolo
  let accessToken = token.access_token
  const expiresAt = new Date(token.expires_at)

  if (expiresAt < new Date()) {
    console.log('\n2. Token expired, refreshing...')
    accessToken = await refreshToken(token)
    console.log('   ✅ Token refreshed')
  } else {
    console.log('\n2. Token valid until:', expiresAt.toISOString())
  }

  // 3. Hae GA4 data (viimeiset 30 päivää)
  console.log('\n3. Fetching GA4 data (last 30 days)...')
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  console.log(`   Date range: ${startDate} - ${endDate}`)

  const response = await fetchGA4Data(accessToken, token.property_id, startDate, endDate)

  if (!response.rows) {
    console.log('   ⚠️ No data returned from GA4')
    return
  }

  console.log(`   ✅ Got ${response.rows.length} rows from GA4`)

  // 4. Parsaa ja tallenna data
  console.log('\n4. Saving to database...')
  const rawRecords = parseGA4Response(response, storeId, token.property_id)

  // Deduplicate records (same key can appear multiple times in GA4 response)
  const recordMap = new Map()
  for (const record of rawRecords) {
    const key = `${record.date}|${record.session_source}|${record.session_medium}|${record.landing_page}`
    if (recordMap.has(key)) {
      // Aggregate metrics for duplicates
      const existing = recordMap.get(key)
      existing.sessions += record.sessions
      existing.engaged_sessions += record.engaged_sessions
      existing.new_users += record.new_users
      existing.returning_users += record.returning_users
      // For bounce_rate and average_session_duration, take weighted average would be complex
      // Just keep the first value for simplicity
    } else {
      recordMap.set(key, { ...record })
    }
  }
  const records = Array.from(recordMap.values())
  console.log(`   Deduplicated: ${rawRecords.length} → ${records.length} records`)

  // Insert in batches to avoid timeout
  const BATCH_SIZE = 500
  let inserted = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE)
    const { error: upsertError } = await supabase
      .from('ga4_analytics')
      .upsert(batch, {
        onConflict: 'store_id,property_id,date,session_source,session_medium,landing_page'
      })

    if (upsertError) {
      console.log(`❌ Upsert error (batch ${Math.floor(i/BATCH_SIZE) + 1}):`, upsertError.message)
      return
    }
    inserted += batch.length
    console.log(`   Batch ${Math.floor(i/BATCH_SIZE) + 1}: ${inserted}/${records.length}`)
  }

  console.log(`   ✅ Saved ${records.length} records`)

  // 5. Näytä yhteenveto
  console.log('\n5. Summary:')
  const { data: summary } = await supabase
    .from('v_ga4_daily_summary')
    .select('*')
    .eq('store_id', storeId)
    .order('date', { ascending: false })
    .limit(5)

  if (summary && summary.length > 0) {
    console.log('   Latest daily data:')
    summary.forEach(row => {
      console.log(`   ${row.date}: ${row.total_sessions} sessions, ${(row.avg_bounce_rate * 100).toFixed(1)}% bounce`)
    })
  }

  console.log('\n✅ GA4 sync complete!')
}

syncGA4().catch(err => {
  console.error('❌ Error:', err.message)
})
