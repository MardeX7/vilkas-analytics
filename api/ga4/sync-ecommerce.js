// GA4 E-commerce Sync - Hakee tuotetason datan Google Analytics 4 Data API:sta
// Haetaan: itemsViewed, itemsAddedToCart, itemsPurchased, itemRevenue

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

    // Get the actual shop UUID (ga4_ecommerce.store_id references shops.id)
    const { data: shopData, error: shopError } = await supabase
      .from('shops')
      .select('id')
      .eq('store_id', store_id)
      .single()

    if (shopError || !shopData) {
      return res.status(404).json({ error: 'Shop not found' })
    }

    const shopId = shopData.id  // This is the UUID that ga4_ecommerce expects

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

    // Fetch E-commerce data from GA4 Data API
    const reportData = await fetchGA4EcommerceReport(accessToken, tokenData.property_id, startDate, endDate)

    if (reportData.error) {
      console.error('GA4 E-commerce API error:', reportData.error)
      return res.status(500).json({ error: reportData.error.message || 'GA4 E-commerce API error' })
    }

    // Transform and insert data - use shopId (shops.id) not store_id
    const records = transformEcommerceData(reportData, shopId, tokenData.property_id)

    if (records.length === 0) {
      return res.json({
        success: true,
        rows_synced: 0,
        message: 'No e-commerce data found for this period',
        period: { startDate, endDate }
      })
    }

    // Delete old data for this period and store
    await supabase
      .from('ga4_ecommerce')
      .delete()
      .eq('store_id', shopId)
      .gte('date', startDate)
      .lte('date', endDate)

    // Insert new data in batches
    const batchSize = 500
    let insertedCount = 0

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const { error: insertError } = await supabase
        .from('ga4_ecommerce')
        .upsert(batch, {
          onConflict: 'store_id,date,item_name',
          ignoreDuplicates: false
        })

      if (insertError) {
        console.error('GA4 E-commerce insert error:', insertError)
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
    console.error('GA4 E-commerce Sync error:', err)
    return res.status(500).json({ error: err.message })
  }
}

/**
 * Fetch GA4 E-commerce report using Data API
 */
async function fetchGA4EcommerceReport(accessToken, propertyId, startDate, endDate) {
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
          { name: 'itemName' },
          { name: 'itemCategory' },
          { name: 'itemBrand' },
          { name: 'itemId' }
        ],
        metrics: [
          { name: 'itemsViewed' },
          { name: 'itemsAddedToCart' },
          { name: 'itemsPurchased' },
          { name: 'itemRevenue' }
        ],
        limit: 100000,
        orderBys: [
          { metric: { metricName: 'itemsViewed' }, desc: true }
        ]
      })
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('GA4 E-commerce API response error:', errorText)
    return { error: { message: `GA4 E-commerce API error: ${response.status}` } }
  }

  return response.json()
}

/**
 * Transform GA4 E-commerce response to database records
 */
function transformEcommerceData(reportData, storeId, propertyId) {
  const rows = reportData.rows || []

  return rows.map(row => {
    const dims = row.dimensionValues || []
    const mets = row.metricValues || []

    const itemsViewed = parseInt(mets[0]?.value || 0)
    const itemsAddedToCart = parseInt(mets[1]?.value || 0)
    const itemsPurchased = parseInt(mets[2]?.value || 0)
    const itemRevenue = parseFloat(mets[3]?.value || 0)

    // Calculate conversion rates
    const viewToCartRate = itemsViewed > 0 ? itemsAddedToCart / itemsViewed : 0
    const cartToPurchaseRate = itemsAddedToCart > 0 ? itemsPurchased / itemsAddedToCart : 0

    return {
      store_id: storeId,
      property_id: propertyId,
      date: formatGA4Date(dims[0]?.value),  // YYYYMMDD -> YYYY-MM-DD
      item_name: dims[1]?.value || '(not set)',
      item_category: dims[2]?.value || null,
      item_brand: dims[3]?.value || null,
      item_id: dims[4]?.value || null,
      items_viewed: itemsViewed,
      items_added_to_cart: itemsAddedToCart,
      items_purchased: itemsPurchased,
      item_revenue: itemRevenue,
      view_to_cart_rate: viewToCartRate,
      cart_to_purchase_rate: cartToPurchaseRate
    }
  }).filter(record => record.date && record.item_name !== '(not set)')
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
