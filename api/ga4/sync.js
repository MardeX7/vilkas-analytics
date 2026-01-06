// GA4 Sync - Hakee datan Google Analytics 4 Data API:sta ja tallentaa Supabaseen
// NOTE: GA4 is for BEHAVIORAL data only (traffic sources, bounce rate)
// NOT for transactions - ePages remains the master for sales data

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
      .from('ga4_tokens')
      .select('*')
      .eq('store_id', store_id)
      .single()

    if (tokenError || !tokenData) {
      return res.status(404).json({ error: 'GA4 not connected' })
    }

    let accessToken = tokenData.access_token

    // Check if token expired, refresh if needed
    if (new Date(tokenData.expires_at) < new Date()) {
      accessToken = await refreshToken(tokenData.refresh_token, store_id)
      if (!accessToken) {
        return res.status(401).json({ error: 'Token refresh failed' })
      }
    }

    // Calculate date range (default: last 30 days)
    const endDate = end_date || new Date().toISOString().split('T')[0]
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Fetch data from GA4 Data API (runReport)
    const reportData = await fetchGA4Report(accessToken, tokenData.property_id, startDate, endDate)

    if (reportData.error) {
      console.error('GA4 API error:', reportData.error)
      return res.status(500).json({ error: reportData.error.message || 'GA4 API error' })
    }

    // Transform and insert data
    const records = transformGA4Data(reportData, store_id, tokenData.property_id)

    // Delete old data for this period and store
    await supabase
      .from('ga4_analytics')
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
        .from('ga4_analytics')
        .insert(batch)

      if (insertError) {
        console.error('GA4 insert error:', insertError)
      } else {
        insertedCount += batch.length
      }
    }

    return res.json({
      success: true,
      rows_synced: insertedCount,
      period: { startDate, endDate },
      property: tokenData.property_name
    })

  } catch (err) {
    console.error('GA4 Sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}

/**
 * Fetch GA4 report using Data API
 */
async function fetchGA4Report(accessToken, propertyId, startDate, endDate) {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
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
          { name: 'sessionDefaultChannelGrouping' },
          { name: 'landingPage' }
        ],
        metrics: [
          { name: 'sessions' },
          { name: 'engagedSessions' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
          { name: 'newUsers' },
          { name: 'totalUsers' }  // For calculating returning users
        ],
        limit: 100000
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('GA4 API response error:', errorText)
    return { error: { message: `GA4 API error: ${response.status}` } }
  }

  return response.json()
}

/**
 * Transform GA4 response to database records
 */
function transformGA4Data(reportData, storeId, propertyId) {
  const rows = reportData.rows || []

  return rows.map(row => {
    const dims = row.dimensionValues || []
    const mets = row.metricValues || []

    const newUsers = parseInt(mets[4]?.value || 0)
    const totalUsers = parseInt(mets[5]?.value || 0)

    return {
      store_id: storeId,
      property_id: propertyId,
      date: formatGA4Date(dims[0]?.value),  // YYYYMMDD -> YYYY-MM-DD
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
  }).filter(record => record.date) // Filter out records with invalid dates
}

/**
 * Convert GA4 date format (YYYYMMDD) to ISO date (YYYY-MM-DD)
 */
function formatGA4Date(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`
}

/**
 * Refresh expired access token
 */
async function refreshToken(refreshToken, storeId) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })

  const data = await response.json()

  if (data.error) {
    console.error('Token refresh error:', data.error)
    return null
  }

  // Update token in DB
  await supabase
    .from('ga4_tokens')
    .update({
      access_token: data.access_token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('store_id', storeId)

  return data.access_token
}
