/**
 * Calculate Product Roles (Multi-tenant)
 *
 * Classifies products into roles based on sales performance:
 * - hero: Top 20% by REVENUE (traffic drivers, bestsellers)
 * - anchor: Middle performers with good margin (consistent sellers)
 * - filler: Products often bought with others (basket boosters)
 * - longtail: Bottom 20% by REVENUE (rarely sold)
 *
 * Usage:
 *   node scripts/calculate_product_roles.cjs              # All stores
 *   node scripts/calculate_product_roles.cjs automaalit   # Specific store
 */

const { supabase, printProjectInfo } = require('./db.cjs')

const DAYS_TO_ANALYZE = 90

async function fetchAllRows(queryFn) {
  let allRows = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await queryFn(from, from + pageSize - 1)
    if (error) throw error
    allRows = allRows.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return allRows
}

async function fetchWithBatchedIn(table, selectCols, filterCol, filterValues, extraFilters = {}) {
  const batchSize = 200
  let allRows = []
  for (let i = 0; i < filterValues.length; i += batchSize) {
    const batch = filterValues.slice(i, i + batchSize)
    let query = supabase.from(table).select(selectCols).in(filterCol, batch)
    for (const [col, val] of Object.entries(extraFilters)) {
      query = query.eq(col, val)
    }
    const { data, error } = await query
    if (error) throw error
    allRows = allRows.concat(data || [])
  }
  return allRows
}

async function calculateForStore(store) {
  const storeId = store.id
  const currencySymbol = store.currency === 'SEK' ? 'kr' : '€'

  console.log(`\n${'='.repeat(60)}`)
  console.log(`🏪 ${store.name}`)
  console.log('='.repeat(60))

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - DAYS_TO_ANALYZE * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  console.log(`📅 Period: ${startDate} to ${endDate}\n`)

  // Step 1: Get orders in period (paginated)
  const orders = await fetchAllRows((from, to) =>
    supabase.from('orders').select('id')
      .eq('store_id', storeId).neq('status', 'cancelled')
      .gte('creation_date', startDate).lte('creation_date', endDate + 'T23:59:59')
      .range(from, to)
  )

  if (orders.length === 0) {
    console.log('⚠️ No orders in this period')
    return
  }

  const orderIds = orders.map(o => o.id)
  console.log(`📦 ${orders.length} orders in period`)

  // Step 2: Get line items — try order_items (has shop_id), fall back to order_line_items
  // Get shop_id for this store
  const { data: shop } = await supabase.from('shops').select('id').eq('store_id', storeId).single()
  const shopId = shop?.id

  let salesData = []
  if (shopId) {
    salesData = await fetchWithBatchedIn(
      'order_items', 'product_id, quantity, line_total, order_id',
      'order_id', orderIds, { shop_id: shopId }
    )
  }

  // Fall back to order_line_items if order_items is empty
  if (salesData.length === 0) {
    const rawItems = await fetchWithBatchedIn(
      'order_line_items', 'product_number, quantity, total_price, order_id',
      'order_id', orderIds
    )
    // Map to consistent format - need to resolve product_id from product_number
    const products = await fetchAllRows((from, to) =>
      supabase.from('products').select('id, product_number, cost_price, name')
        .eq('store_id', storeId).range(from, to)
    )
    const skuToProduct = new Map(products.filter(p => p.product_number).map(p => [p.product_number, p]))

    salesData = rawItems.map(item => {
      const product = skuToProduct.get(item.product_number)
      return {
        product_id: product?.id || null,
        quantity: item.quantity,
        line_total: item.total_price,
        order_id: item.order_id
      }
    }).filter(item => item.product_id)
  }

  console.log(`📊 ${salesData.length} line items\n`)

  if (salesData.length === 0) {
    console.log('⚠️ No line items found')
    return
  }

  // Step 3: Get product info
  const productIds = [...new Set(salesData.map(s => s.product_id).filter(Boolean))]
  const products = await fetchWithBatchedIn(
    'products', 'id, name, product_number, cost_price',
    'id', productIds
  )
  const productMap = new Map(products.map(p => [p.id, p]))

  // Step 4: Aggregate sales by product
  const productStats = new Map()
  const orderItemCounts = new Map()

  for (const item of salesData) {
    if (!item.product_id) continue
    const orderId = item.order_id

    if (!productStats.has(item.product_id)) {
      productStats.set(item.product_id, {
        product_id: item.product_id,
        units_sold: 0,
        revenue: 0,
        orders: new Set(),
        total_cost: 0
      })
    }

    const stats = productStats.get(item.product_id)
    stats.units_sold += item.quantity || 1
    stats.revenue += parseFloat(item.line_total) || 0
    stats.orders.add(orderId)

    const product = productMap.get(item.product_id)
    if (product?.cost_price) {
      stats.total_cost += parseFloat(product.cost_price) * (item.quantity || 1)
    }

    orderItemCounts.set(orderId, (orderItemCounts.get(orderId) || 0) + 1)
  }

  // Step 5: Calculate basket metrics
  for (const [productId, stats] of productStats) {
    let totalBasketSize = 0
    let soloCount = 0

    for (const orderId of stats.orders) {
      const itemCount = orderItemCounts.get(orderId) || 1
      totalBasketSize += itemCount
      if (itemCount === 1) soloCount++
    }

    stats.orders_count = stats.orders.size
    stats.avg_basket_size = stats.orders.size > 0 ? totalBasketSize / stats.orders.size : 0
    stats.solo_purchase_rate = stats.orders.size > 0 ? (soloCount / stats.orders.size) * 100 : 0
    stats.margin_percent = (stats.total_cost > 0 && stats.revenue > 0)
      ? ((stats.revenue - stats.total_cost) / stats.revenue) * 100
      : null
  }

  // Step 6: Sort and classify
  const productsArray = Array.from(productStats.values())
    .filter(p => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)

  const totalProducts = productsArray.length
  if (totalProducts === 0) {
    console.log('⚠️ No products with sales found')
    return
  }

  const heroThreshold = Math.ceil(totalProducts * 0.20)
  const anchorThreshold = Math.ceil(totalProducts * 0.60)
  const fillerThreshold = Math.ceil(totalProducts * 0.80)

  const roles = { hero: [], anchor: [], filler: [], longtail: [] }

  productsArray.forEach((product, index) => {
    let role
    if (index < heroThreshold) {
      role = 'hero'
    } else if (index < anchorThreshold) {
      if (product.avg_basket_size > 2 && product.solo_purchase_rate < 30) {
        role = 'filler'
      } else {
        role = 'anchor'
      }
    } else if (index < fillerThreshold) {
      role = 'filler'
    } else {
      role = 'longtail'
    }
    product.role = role
    roles[role].push(product)
  })

  // Print summary
  const roleEmoji = { hero: '⭐', anchor: '⚓', filler: '📦', longtail: '🦎' }
  for (const [role, prods] of Object.entries(roles)) {
    const totalRevenue = prods.reduce((sum, p) => sum + p.revenue, 0)
    console.log(`${roleEmoji[role]} ${role.toUpperCase()} (${prods.length}): ${totalRevenue.toFixed(0)} ${currencySymbol}`)
    prods.slice(0, 3).forEach(p => {
      const name = productMap.get(p.product_id)?.name?.substring(0, 40) || 'Unknown'
      console.log(`   - ${name}: ${p.revenue.toFixed(0)} ${currencySymbol}`)
    })
  }

  // Step 7: Save to database
  console.log('\n💾 Saving...')

  const { error: deleteError } = await supabase
    .from('product_roles')
    .delete()
    .eq('store_id', storeId)
  if (deleteError) console.error('❌ Delete error:', deleteError.message)

  const rolesToInsert = productsArray.map(p => ({
    store_id: storeId,
    product_id: p.product_id,
    role: p.role,
    units_sold: p.units_sold,
    revenue: p.revenue,
    orders_count: p.orders_count,
    margin_percent: p.margin_percent,
    avg_basket_size: p.avg_basket_size,
    solo_purchase_rate: p.solo_purchase_rate,
    period_start: startDate,
    period_end: endDate
  }))

  const batchSize = 100
  let inserted = 0
  for (let i = 0; i < rolesToInsert.length; i += batchSize) {
    const batch = rolesToInsert.slice(i, i + batchSize)
    const { error: insertError } = await supabase.from('product_roles').insert(batch)
    if (insertError) console.error(`❌ Insert error:`, insertError.message)
    else inserted += batch.length
  }

  console.log(`✅ ${inserted} product roles saved`)
}

async function main() {
  printProjectInfo()

  const filter = process.argv[2]

  const { data: shops } = await supabase
    .from('shops')
    .select('id, store_id, name, domain')

  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, domain, epages_shop_id, currency')

  const storesWithShops = stores.map(s => ({
    ...s,
    shop: shops.find(sh => sh.store_id === s.id)
  }))

  const targets = filter
    ? storesWithShops.filter(s => s.epages_shop_id === filter || s.domain?.includes(filter))
    : storesWithShops

  for (const store of targets) {
    await calculateForStore(store)
  }

  console.log('\n✅ Product role calculation complete!')
}

main().catch(console.error)
