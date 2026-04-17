/**
 * Sync Campaigns from ePages Orders (Multi-tenant)
 *
 * Scans orders for coupon usage and syncs campaign data to database.
 * Works for all stores in the shops table.
 *
 * Usage:
 *   node scripts/sync_campaigns.cjs              # All stores
 *   node scripts/sync_campaigns.cjs automaalit   # Specific store by epages_shop_id
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options)
      return res
    } catch (err) {
      if (i === retries - 1) throw err
      const delay = 2000 * (i + 1)
      process.stdout.write(`\n  ⚠️ Connection error, retrying in ${delay / 1000}s...\n`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
}

async function syncCampaignsForStore(store) {
  const domainWithoutWww = store.domain.replace(/^www\./, '')
  const apiUrl = `https://www.${domainWithoutWww}/rs/shops/${store.epages_shop_id}`
  const currencySymbol = store.currency === 'SEK' ? 'kr' : '€'

  console.log(`\n${'='.repeat(60)}`)
  console.log(`🏪 ${store.name} (${store.domain})`)
  console.log(`   API: ${apiUrl}`)
  console.log('='.repeat(60))

  // Step 1: Collect all campaign usage from orders
  console.log('\n📦 Scanning orders for coupon usage...')

  const campaignStats = new Map()
  let page = 1
  let totalOrders = 0
  let ordersWithCoupons = 0

  while (true) {
    const pageRes = await fetchWithRetry(`${apiUrl}/orders?resultsPerPage=50&page=${page}&sortBy=creationDate&sortDirection=desc`, {
      headers: { 'Authorization': `Bearer ${store.access_token}` }
    })
    const pageData = await pageRes.json()

    if (!pageData.items?.length) break

    for (const orderSummary of pageData.items) {
      totalOrders++

      const fullRes = await fetchWithRetry(`${apiUrl}/orders/${orderSummary.orderId}`, {
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

  if (campaignStats.size === 0) {
    console.log('ℹ️  No campaigns found for this store')
    return
  }

  // Step 2: Fetch campaign details from API
  console.log('🔍 Fetching campaign details from API...\n')

  const campaigns = []

  for (const [campaignId, stats] of campaignStats) {
    try {
      const res = await fetchWithRetry(`${apiUrl}/coupon-campaigns/${campaignId}`, {
        headers: { 'Authorization': `Bearer ${store.access_token}` }
      })

      if (res.ok) {
        const campaign = await res.json()

        let campaignType = 'discount'
        if (campaign.type?.shippingCostsIncluded) {
          campaignType = 'free_shipping'
        }

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
          store_id: store.id,
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
          is_active: false
        })

        console.log(`  ✅ ${campaign.identifier} (${campaign.name}): ${stats.orders.length} orders, ${stats.totalDiscount.toFixed(0)} ${currencySymbol} discounts`)
      } else {
        campaigns.push({
          store_id: store.id,
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
    const { data: existing } = await supabase
      .from('campaigns')
      .select('id')
      .eq('store_id', campaign.store_id)
      .eq('epages_campaign_id', campaign.epages_campaign_id)
      .maybeSingle()

    let error
    if (existing) {
      const { error: updateError } = await supabase
        .from('campaigns')
        .update({
          orders_count: campaign.orders_count,
          revenue: campaign.revenue,
          discount_given: campaign.discount_given,
          start_date: campaign.start_date,
          end_date: campaign.end_date,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)
      error = updateError
    } else {
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

  // Summary
  console.log('\n' + '-'.repeat(50))
  console.log(`📊 ${store.name} SUMMARY`)
  console.log('-'.repeat(50))
  console.log(`Total orders scanned: ${totalOrders}`)
  console.log(`Orders with coupons: ${ordersWithCoupons} (${(ordersWithCoupons / totalOrders * 100).toFixed(1)}%)`)
  console.log(`Unique campaigns: ${campaigns.length}`)
  const totalDiscounts = campaigns.reduce((sum, c) => sum + (c.discount_given || 0), 0)
  const totalRevenue = campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0)
  console.log(`Total discounts given: ${totalDiscounts.toFixed(0)} ${currencySymbol}`)
  console.log(`Total campaign revenue: ${totalRevenue.toFixed(0)} ${currencySymbol}`)
}

async function main() {
  printProjectInfo()

  const filter = process.argv[2] // Optional: epages_shop_id to filter

  const { data: stores, error } = await supabase
    .from('stores')
    .select('id, name, domain, epages_shop_id, access_token, currency')

  if (error) {
    console.error('❌ Failed to fetch stores:', error.message)
    return
  }

  const targetStores = filter
    ? stores.filter(s => s.epages_shop_id === filter || s.domain.includes(filter))
    : stores

  if (targetStores.length === 0) {
    console.error(`❌ No stores found${filter ? ` matching "${filter}"` : ''}`)
    return
  }

  console.log(`🎯 Syncing campaigns for ${targetStores.length} store(s)`)

  for (const store of targetStores) {
    if (!store.access_token || !store.epages_shop_id) {
      console.log(`⏭️  Skipping ${store.name} — no ePages connection`)
      continue
    }
    await syncCampaignsForStore(store)
  }

  console.log('\n✅ Campaign sync complete!')
}

main().catch(console.error)
