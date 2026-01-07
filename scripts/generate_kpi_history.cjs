/**
 * Generate KPI History from Real Data
 *
 * Laskee KPI-indeksit oikeasta orders-datasta kuukausittain.
 * Käyttää samaa logiikkaa kuin daily-kpi-snapshot Edge Function.
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const VAT_RATE = 1.25  // 25% ALV

async function generateHistory() {
  console.log('📊 Generating KPI history from real data...\n')

  // Get store
  const { data: store } = await supabase
    .from('stores')
    .select('id')
    .single()

  if (!store) {
    console.error('❌ No store found')
    return
  }

  console.log(`📦 Store: ${store.id}`)

  // Get all orders (paginated to avoid 1000 limit)
  let allOrders = []
  let offset = 0
  const pageSize = 1000

  while (true) {
    const { data: batch, error } = await supabase
      .from('orders')
      .select('id, creation_date, grand_total, total_before_tax, customer_id')
      .order('creation_date', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error('❌ Error fetching orders:', error.message)
      return
    }

    if (!batch || batch.length === 0) break
    allOrders = allOrders.concat(batch)
    offset += pageSize
    if (batch.length < pageSize) break
  }

  const orders = allOrders
  const ordersError = null

  if (ordersError) {
    console.error('❌ Error fetching orders:', ordersError.message)
    return
  }

  console.log(`📋 Found ${orders.length} orders`)

  // Get all products with cost_price
  const { data: products } = await supabase
    .from('products')
    .select('id, cost_price, stock_level')

  const productMap = {}
  products?.forEach(p => productMap[p.id] = p)

  // Get all line items
  const { data: lineItems } = await supabase
    .from('order_line_items')
    .select('order_id, product_id, quantity, total_price')

  // Group line items by order
  const lineItemsByOrder = {}
  lineItems?.forEach(li => {
    if (!lineItemsByOrder[li.order_id]) lineItemsByOrder[li.order_id] = []
    lineItemsByOrder[li.order_id].push(li)
  })

  // Group orders by month
  const ordersByMonth = {}
  orders.forEach(order => {
    const month = order.creation_date.substring(0, 7) // YYYY-MM
    if (!ordersByMonth[month]) ordersByMonth[month] = []
    ordersByMonth[month].push(order)
  })

  console.log(`📅 Found data for ${Object.keys(ordersByMonth).length} months\n`)

  // Calculate KPIs for each month
  const snapshots = []
  let previousSnapshot = null

  for (const [month, monthOrders] of Object.entries(ordersByMonth).sort()) {
    const [year, monthNum] = month.split('-').map(Number)
    const periodStart = `${month}-01`
    const periodEnd = new Date(year, monthNum, 0).toISOString().split('T')[0] // Last day

    // Core metrics
    const orderCount = monthOrders.length
    const totalRevenue = monthOrders.reduce((sum, o) => sum + (parseFloat(o.grand_total) || 0), 0)
    const nettoRevenue = totalRevenue / VAT_RATE
    const aov = orderCount > 0 ? nettoRevenue / orderCount : 0

    // Unique customers
    const uniqueCustomers = new Set(monthOrders.map(o => o.customer_id).filter(Boolean)).size

    // Calculate gross profit from line items (if available) or estimate from orders
    let totalCost = 0
    let totalSalesNetto = 0
    let hasLineItems = false

    monthOrders.forEach(order => {
      const items = lineItemsByOrder[order.id] || []

      if (items.length > 0) {
        hasLineItems = true
        items.forEach(item => {
          const salesNetto = (parseFloat(item.total_price) || 0) / VAT_RATE
          totalSalesNetto += salesNetto
          const product = productMap[item.product_id]
          if (product?.cost_price) {
            totalCost += product.cost_price * item.quantity
          } else {
            // Default 40% cost if no cost_price
            totalCost += salesNetto * 0.4
          }
        })
      } else {
        // No line items - estimate from order total with default 60% margin
        const orderNetto = (parseFloat(order.grand_total) || 0) / VAT_RATE
        totalSalesNetto += orderNetto
        totalCost += orderNetto * 0.4  // 40% cost = 60% margin
      }
    })

    const grossProfit = totalSalesNetto - totalCost
    const marginPercent = totalSalesNetto > 0 ? (grossProfit / totalSalesNetto) * 100 : 0
    const marginEstimated = !hasLineItems

    // Out of stock (use current snapshot - we don't have historical stock data)
    const outOfStockPercent = products?.filter(p => p.stock_level === 0).length / (products?.length || 1) * 100

    // Calculate indexes (0-100)
    // Core Index components
    const grossProfitIndex = Math.min(100, Math.max(0, grossProfit / 500 * 100)) // 500 SEK = 100
    const aovIndex = Math.min(100, Math.max(0, aov / 20 * 100)) // 20 SEK AOV = 100
    const repeatRate = 0 // Would need customer history
    const stockIndex = Math.max(0, 100 - outOfStockPercent)

    const coreIndex = Math.round(
      grossProfitIndex * 0.30 +
      aovIndex * 0.20 +
      repeatRate * 0.20 +
      50 * 0.20 + // trend placeholder
      stockIndex * 0.10
    )

    // PPI - Product Profitability Index
    const ppiIndex = Math.max(0, Math.min(100, Math.round(marginPercent * 2))) // 50% margin = 100

    // SPI - SEO Performance Index (we don't have historical GSC data)
    const spiIndex = 50 // Placeholder

    // OI - Operational Index
    const oiIndex = Math.max(0, Math.min(100, Math.round(stockIndex * 0.5 + 25))) // Based on stock only

    // Overall
    const overallIndex = Math.round(
      coreIndex * 0.35 +
      ppiIndex * 0.25 +
      spiIndex * 0.20 +
      oiIndex * 0.20
    )

    // Calculate deltas
    const deltas = {
      core: previousSnapshot ? coreIndex - previousSnapshot.core_index : 0,
      ppi: previousSnapshot ? ppiIndex - previousSnapshot.product_profitability_index : 0,
      spi: previousSnapshot ? spiIndex - previousSnapshot.seo_performance_index : 0,
      oi: previousSnapshot ? oiIndex - previousSnapshot.operational_index : 0,
      overall: previousSnapshot ? overallIndex - previousSnapshot.overall_index : 0
    }

    const snapshot = {
      store_id: store.id,
      period_start: periodStart,
      period_end: periodEnd,
      granularity: 'month',
      core_index: coreIndex,
      product_profitability_index: ppiIndex,
      seo_performance_index: spiIndex,
      operational_index: oiIndex,
      overall_index: overallIndex,
      core_index_delta: deltas.core,
      ppi_delta: deltas.ppi,
      spi_delta: deltas.spi,
      oi_delta: deltas.oi,
      overall_delta: deltas.overall,
      raw_metrics: {
        core: {
          order_count: orderCount,
          total_revenue: nettoRevenue,
          aov,
          gross_profit: grossProfit,
          margin_percent: marginPercent,
          margin_estimated: marginEstimated,
          unique_customers: uniqueCustomers
        }
      },
      core_components: {
        gross_profit: { value: grossProfit, index: grossProfitIndex, weight: 0.30 },
        aov: { value: aov, index: aovIndex, weight: 0.20 },
        stock: { value: 100 - outOfStockPercent, index: stockIndex, weight: 0.10 }
      },
      ppi_components: {
        margin: { value: marginPercent, index: ppiIndex, weight: 1.0 }
      },
      spi_components: {},
      oi_components: {
        stock: { value: 100 - outOfStockPercent, index: stockIndex, weight: 0.30 }
      },
      alerts: []
    }

    snapshots.push(snapshot)
    previousSnapshot = snapshot

    const estimatedTag = marginEstimated ? ' (estimated)' : ''
    console.log(`📈 ${month}: Orders=${orderCount}, Revenue=${Math.round(nettoRevenue)} SEK, Margin=${marginPercent.toFixed(1)}%${estimatedTag}, Overall=${overallIndex}`)
  }

  // Delete existing monthly history
  const { error: deleteError } = await supabase
    .from('kpi_index_snapshots')
    .delete()
    .eq('store_id', store.id)
    .eq('granularity', 'month')

  if (deleteError) {
    console.error('⚠️  Error deleting old monthly data:', deleteError.message)
  }

  // Insert new history
  const { error: insertError } = await supabase
    .from('kpi_index_snapshots')
    .insert(snapshots)

  if (insertError) {
    console.error('❌ Error inserting history:', insertError.message)
    return
  }

  console.log(`\n✅ Generated ${snapshots.length} monthly KPI snapshots from real data!`)
}

generateHistory().catch(console.error)
