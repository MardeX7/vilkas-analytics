/**
 * Sync Campaigns from ePages Orders
 *
 * Scans orders for coupon usage and syncs campaign data to database.
 */

const { supabase, STORE_ID } = require('./db.cjs')

const EPAGES_API = 'https://www.billackering.eu/rs/shops/billackering'

async function syncCampaigns() {
  console.log('🔄 Starting campaign sync...\n')

  const { data: store } = await supabase
    .from('stores')
    .select('access_token')
    .single()

  if (!store?.access_token) {
    console.error('❌ No access token found')
    return
  }

  // Step 1: Collect all campaign usage from orders
  console.log('📦 Scanning orders for coupon usage...')

  const campaignStats = new Map()
  let page = 1
  let totalOrders = 0
  let ordersWithCoupons = 0

  while (page <= 20) { // Check up to 1000 orders
    const pageRes = await fetch(`${EPAGES_API}/orders?resultsPerPage=50&page=${page}`, {
      headers: { 'Authorization': `Bearer ${store.access_token}` }
    })
    const pageData = await pageRes.json()

    if (!pageData.items?.length) break

    for (const orderSummary of pageData.items) {
      totalOrders++

      const fullRes = await fetch(`${EPAGES_API}/orders/${orderSummary.orderId}`, {
        headers: { 'Authorization': `Bearer ${store.access_token}` }
      })
      const order = await fullRes.json()

      const coupon = order.lineItemContainer?.couponLineItem
      if (coupon?.couponCampaignId) {
        ordersWithCoupons++
        const id = coupon.couponCampaignId
        const discount = Math.abs(coupon.lineItemPrice?.amount || 0)
        const orderDate = order.creationDate?.split('T')[0]
        const orderTotal = parseFloat(order.grandTotal) || 0

        if (!campaignStats.has(id)) {
          campaignStats.set(id, {
            orders: [],
            totalDiscount: 0,
            totalRevenue: 0,
            firstDate: orderDate,
            lastDate: orderDate
          })
        }

        const stats = campaignStats.get(id)
        stats.orders.push({
          orderNumber: order.orderNumber,
          date: orderDate,
          discount: discount,
          total: orderTotal
        })
        stats.totalDiscount += discount
        stats.totalRevenue += orderTotal
        if (orderDate < stats.firstDate) stats.firstDate = orderDate
        if (orderDate > stats.lastDate) stats.lastDate = orderDate
      }
    }

    process.stdout.write(`  Page ${page} done (${totalOrders} orders, ${ordersWithCoupons} with coupons)\r`)
    page++
  }

  console.log(`\n\n✅ Scanned ${totalOrders} orders, ${ordersWithCoupons} had coupons`)
  console.log(`📊 Found ${campaignStats.size} unique campaigns\n`)

  // Step 2: Fetch campaign details from API
  console.log('🔍 Fetching campaign details from API...\n')

  const campaigns = []

  for (const [campaignId, stats] of campaignStats) {
    try {
      const res = await fetch(`${EPAGES_API}/coupon-campaigns/${campaignId}`, {
        headers: { 'Authorization': `Bearer ${store.access_token}` }
      })

      if (res.ok) {
        const campaign = await res.json()

        // Determine campaign type
        let campaignType = 'discount'
        if (campaign.type?.name === 'PERCENT') {
          campaignType = 'discount'
        } else if (campaign.type?.shippingCostsIncluded) {
          campaignType = 'free_shipping'
        }

        // Determine discount type
        let discountType = 'percentage'
        let discountValue = 0
        if (campaign.type?.percentage) {
          discountType = 'percentage'
          discountValue = campaign.type.percentage
        } else if (campaign.type?.amount) {
          discountType = 'fixed_amount'
          discountValue = campaign.type.amount
        }

        campaigns.push({
          store_id: STORE_ID,
          epages_campaign_id: campaignId,
          name: campaign.name || campaign.identifier,
          coupon_code: campaign.identifier,
          campaign_type: campaignType,
          discount_type: discountType,
          discount_value: discountValue,
          minimum_order: campaign.minimumOrderValue || 0,
          start_date: stats.firstDate,
          end_date: stats.lastDate,
          orders_count: stats.orders.length,
          revenue: stats.totalRevenue,
          discount_given: stats.totalDiscount,
          is_active: false // Past campaigns
        })

        console.log(`  ✅ ${campaign.identifier} (${campaign.name}): ${stats.orders.length} orders, ${stats.totalDiscount.toFixed(0)} kr discounts`)
      } else {
        // API didn't return details, use what we have
        campaigns.push({
          store_id: STORE_ID,
          epages_campaign_id: campaignId,
          name: `Campaign ${campaignId.slice(0, 8)}`,
          coupon_code: null,
          campaign_type: 'discount',
          discount_type: 'unknown',
          discount_value: 0,
          minimum_order: 0,
          start_date: stats.firstDate,
          end_date: stats.lastDate,
          orders_count: stats.orders.length,
          revenue: stats.totalRevenue,
          discount_given: stats.totalDiscount,
          is_active: false
        })
        console.log(`  ⚠️ Unknown campaign ${campaignId.slice(0, 8)}: ${stats.orders.length} orders`)
      }
    } catch (err) {
      console.error(`  ❌ Error fetching ${campaignId}:`, err.message)
    }
  }

  // Step 3: Upsert to database
  console.log('\n💾 Saving to database...\n')

  for (const campaign of campaigns) {
    // First try to find existing
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id')
      .eq('store_id', campaign.store_id)
      .eq('epages_campaign_id', campaign.epages_campaign_id)
      .single()

    let error
    if (existing) {
      // Update existing
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({
          orders_count: campaign.orders_count,
          revenue: campaign.revenue,
          discount_given: campaign.discount_given,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
      error = updateError
    } else {
      // Insert new
      const { error: insertError } = await supabase
        .from('campaigns')
        .insert(campaign)
      error = insertError
    }

    if (error) {
      console.error(`  ❌ Error saving ${campaign.coupon_code} (${campaign.name}):`, error.message)
    } else {
      console.log(`  ✅ Saved: ${campaign.coupon_code} (${campaign.name})`)
    }
  }

  // Step 4: Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 CAMPAIGN SYNC SUMMARY')
  console.log('='.repeat(50))
  console.log(`Total orders scanned: ${totalOrders}`)
  console.log(`Orders with coupons: ${ordersWithCoupons} (${(ordersWithCoupons/totalOrders*100).toFixed(1)}%)`)
  console.log(`Unique campaigns: ${campaigns.length}`)
  const totalDiscounts = campaigns.reduce((sum, c) => sum + (c.discount_given || 0), 0)
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0)
  console.log(`Total discounts given: ${totalDiscounts.toFixed(0)} kr`)
  console.log(`Total campaign revenue: ${totalRevenue.toFixed(0)} kr`)
}

syncCampaigns().catch(console.error)
