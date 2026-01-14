const { supabase } = require('./db.cjs')

const EPAGES_API = 'https://www.billackering.eu/rs/shops/billackering'

async function fetchCampaignDetails() {
  const { data: store } = await supabase
    .from('stores')
    .select('access_token')
    .single()

  // Known campaign ID from order data
  const campaignId = '692C5933-00E4-8B83-93CF-0A320E034C07'

  console.log('Trying to fetch campaign:', campaignId)

  // Try various endpoints
  const endpoints = [
    `/coupons/${campaignId}`,
    `/coupon-campaigns/${campaignId}`,
    `/campaigns/${campaignId}`,
    `/coupons`,
    `/coupon-campaigns`,
    `/campaigns`
  ]

  for (const endpoint of endpoints) {
    console.log(`\nTrying: ${endpoint}`)
    try {
      const res = await fetch(`${EPAGES_API}${endpoint}`, {
        headers: { 'Authorization': `Bearer ${store.access_token}` }
      })
      console.log(`Status: ${res.status}`)
      if (res.ok) {
        const data = await res.json()
        console.log('SUCCESS!')
        console.log(JSON.stringify(data, null, 2).slice(0, 1000))
      }
    } catch (err) {
      console.log('Error:', err.message)
    }
  }

  // Also collect all unique campaign IDs from orders
  console.log('\n\n--- Collecting all campaign IDs from orders ---')

  const campaignIds = new Map()
  let page = 1

  while (page <= 8) {
    const pageRes = await fetch(`${EPAGES_API}/orders?resultsPerPage=50&page=${page}`, {
      headers: { 'Authorization': `Bearer ${store.access_token}` }
    })
    const pageData = await pageRes.json()

    if (!pageData.items?.length) break

    for (const orderSummary of pageData.items) {
      const fullRes = await fetch(`${EPAGES_API}/orders/${orderSummary.orderId}`, {
        headers: { 'Authorization': `Bearer ${store.access_token}` }
      })
      const fullOrder = await fullRes.json()

      const coupon = fullOrder.lineItemContainer?.couponLineItem
      if (coupon?.couponCampaignId) {
        const id = coupon.couponCampaignId
        if (!campaignIds.has(id)) {
          campaignIds.set(id, {
            count: 1,
            totalDiscount: Math.abs(coupon.lineItemPrice?.amount || 0),
            firstSeen: fullOrder.creationDate
          })
        } else {
          const existing = campaignIds.get(id)
          existing.count++
          existing.totalDiscount += Math.abs(coupon.lineItemPrice?.amount || 0)
        }
      }
    }

    page++
    process.stdout.write(`Page ${page-1} done (${campaignIds.size} unique campaigns)\r`)
  }

  console.log('\n\n--- Unique Campaign IDs Found ---')
  console.log(`Total unique campaigns: ${campaignIds.size}`)

  for (const [id, stats] of campaignIds) {
    console.log(`\nCampaign: ${id}`)
    console.log(`  Orders: ${stats.count}`)
    console.log(`  Total discount: ${stats.totalDiscount.toFixed(2)} kr`)
    console.log(`  First seen: ${stats.firstSeen?.split('T')[0]}`)
  }
}

fetchCampaignDetails()
