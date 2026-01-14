/**
 * Calculate Product Roles
 *
 * Classifies products into roles based on sales performance:
 * - hero: Top 20% by REVENUE (traffic drivers, bestsellers)
 * - anchor: Middle performers with good margin (consistent sellers)
 * - filler: Products often bought with others (basket boosters)
 * - longtail: Bottom 20% by REVENUE (rarely sold)
 */

const { supabase, STORE_ID } = require('./db.cjs')

// Configuration
const DAYS_TO_ANALYZE = 90

async function calculateProductRoles() {
  console.log('🏷️  Calculating Product Roles...\n')

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - DAYS_TO_ANALYZE * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  console.log(`📅 Period: ${startDate} to ${endDate}\n`)

  // Step 1: Get product sales data from order_line_items
  console.log('📊 Fetching product sales data...')

  const { data: salesData, error: salesError } = await supabase
    .from('order_line_items')
    .select(`
      product_id,
      quantity,
      total_price,
      unit_price,
      order_id,
      orders!inner (
        id,
        creation_date,
        store_id
      )
    `)
    .eq('orders.store_id', STORE_ID)
    .gte('orders.creation_date', startDate)
    .lte('orders.creation_date', endDate)

  if (salesError) {
    console.error('❌ Error fetching sales data:', salesError.message)
    return
  }

  console.log(`  Found ${salesData.length} line items\n`)

  // Step 2: Get product info (name, sku, cost_price)
  const productIds = [...new Set(salesData.map(s => s.product_id).filter(Boolean))]
  console.log(`📦 Fetching ${productIds.length} products...`)

  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, product_number, cost_price, price_amount')
    .in('id', productIds)

  if (productsError) {
    console.error('❌ Error fetching products:', productsError.message)
    return
  }

  const productMap = new Map(products.map(p => [p.id, p]))

  // Step 3: Aggregate sales by product
  console.log('🔢 Aggregating sales by product...')

  const productStats = new Map()

  // Track orders containing each product (for basket analysis)
  const productOrders = new Map()

  for (const item of salesData) {
    if (!item.product_id) continue

    const orderId = item.order_id

    // Initialize product stats
    if (!productStats.has(item.product_id)) {
      productStats.set(item.product_id, {
        product_id: item.product_id,
        units_sold: 0,
        revenue: 0,
        orders: new Set(),
        total_cost: 0
      })
      productOrders.set(item.product_id, new Set())
    }

    const stats = productStats.get(item.product_id)
    stats.units_sold += item.quantity || 1
    stats.revenue += parseFloat(item.total_price) || 0
    stats.orders.add(orderId)

    // Calculate cost if available
    const product = productMap.get(item.product_id)
    if (product?.cost_price) {
      stats.total_cost += parseFloat(product.cost_price) * (item.quantity || 1)
    }

    productOrders.get(item.product_id).add(orderId)
  }

  // Step 4: Calculate basket metrics
  console.log('🛒 Calculating basket metrics...')

  // Count items per order
  const orderItemCounts = new Map()
  for (const item of salesData) {
    if (!item.order_id) continue
    orderItemCounts.set(item.order_id, (orderItemCounts.get(item.order_id) || 0) + 1)
  }

  // Calculate avg basket size and solo purchase rate for each product
  for (const [productId, stats] of productStats) {
    const orders = productOrders.get(productId)
    let totalBasketSize = 0
    let soloCount = 0

    for (const orderId of orders) {
      const itemCount = orderItemCounts.get(orderId) || 1
      totalBasketSize += itemCount
      if (itemCount === 1) soloCount++
    }

    stats.orders_count = orders.size
    stats.avg_basket_size = orders.size > 0 ? totalBasketSize / orders.size : 0
    stats.solo_purchase_rate = orders.size > 0 ? (soloCount / orders.size) * 100 : 0

    // Calculate margin
    if (stats.total_cost > 0 && stats.revenue > 0) {
      stats.margin_percent = ((stats.revenue - stats.total_cost) / stats.revenue) * 100
    } else {
      stats.margin_percent = null
    }
  }

  // Step 5: Convert to array and sort by REVENUE (not units)
  const productsArray = Array.from(productStats.values())
    .filter(p => p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)

  const totalProducts = productsArray.length
  console.log(`\n📈 Total products with sales: ${totalProducts}\n`)

  if (totalProducts === 0) {
    console.log('⚠️ No products with sales found in this period')
    return
  }

  // Step 6: Classify products into roles
  console.log('🏷️  Classifying products...\n')

  // Calculate thresholds
  const heroThreshold = Math.ceil(totalProducts * 0.20)  // Top 20%
  const anchorThreshold = Math.ceil(totalProducts * 0.60)  // Next 40%
  const fillerThreshold = Math.ceil(totalProducts * 0.80)  // Next 20%
  // Remaining 20% = longtail

  const roles = {
    hero: [],
    anchor: [],
    filler: [],
    longtail: []
  }

  productsArray.forEach((product, index) => {
    let role

    if (index < heroThreshold) {
      // Top 20% by REVENUE = Hero (bestsellers, traffic drivers)
      role = 'hero'
    } else if (index < anchorThreshold) {
      // Products with good margin in middle tier = Anchor
      // Or products with low solo rate (often bought with others) = Filler
      if (product.avg_basket_size > 2 && product.solo_purchase_rate < 30) {
        role = 'filler'  // Often bought with other items
      } else {
        role = 'anchor'  // Consistent performer
      }
    } else if (index < fillerThreshold) {
      // Lower tier but still sells = mostly fillers
      role = 'filler'
    } else {
      // Bottom 20% by REVENUE = Long tail
      role = 'longtail'
    }

    product.role = role
    roles[role].push(product)
  })

  // Step 7: Print summary
  console.log('='.repeat(60))
  console.log('📊 PRODUCT ROLE SUMMARY')
  console.log('='.repeat(60))

  for (const [role, products] of Object.entries(roles)) {
    const totalUnits = products.reduce((sum, p) => sum + p.units_sold, 0)
    const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)
    const avgMargin = products.filter(p => p.margin_percent).length > 0
      ? products.filter(p => p.margin_percent).reduce((sum, p) => sum + p.margin_percent, 0) / products.filter(p => p.margin_percent).length
      : null

    const roleEmoji = {
      hero: '⭐',
      anchor: '⚓',
      filler: '📦',
      longtail: '🦎'
    }[role]

    console.log(`\n${roleEmoji} ${role.toUpperCase()} (${products.length} products)`)
    console.log(`   Units: ${totalUnits} | Revenue: ${totalRevenue.toFixed(0)} kr${avgMargin ? ` | Avg Margin: ${avgMargin.toFixed(1)}%` : ''}`)

    // Show top 3
    products.slice(0, 3).forEach(p => {
      const productInfo = productMap.get(p.product_id)
      const name = productInfo?.name?.substring(0, 40) || 'Unknown'
      console.log(`   - ${name}: ${p.units_sold} units, ${p.revenue.toFixed(0)} kr`)
    })
  }

  // Step 8: Save to database
  console.log('\n\n💾 Saving to database...')

  // Delete existing roles for this period
  const { error: deleteError } = await supabase
    .from('product_roles')
    .delete()
    .eq('store_id', STORE_ID)
    .eq('period_start', startDate)
    .eq('period_end', endDate)

  if (deleteError) {
    console.error('❌ Error deleting old roles:', deleteError.message)
  }

  // Insert new roles
  const rolesToInsert = productsArray.map(p => ({
    store_id: STORE_ID,
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

  // Insert in batches
  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < rolesToInsert.length; i += batchSize) {
    const batch = rolesToInsert.slice(i, i + batchSize)
    const { error: insertError } = await supabase
      .from('product_roles')
      .insert(batch)

    if (insertError) {
      console.error(`❌ Error inserting batch ${i / batchSize + 1}:`, insertError.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`✅ Saved ${inserted} product roles`)

  // Final summary
  console.log('\n' + '='.repeat(60))
  console.log('✅ PRODUCT ROLE CALCULATION COMPLETE')
  console.log('='.repeat(60))
  console.log(`Hero:     ${roles.hero.length} products (traffic drivers)`)
  console.log(`Anchor:   ${roles.anchor.length} products (consistent sellers)`)
  console.log(`Filler:   ${roles.filler.length} products (basket boosters)`)
  console.log(`Longtail: ${roles.longtail.length} products (rarely sold)`)
}

calculateProductRoles().catch(console.error)
