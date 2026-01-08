/**
 * Generate KPI History from Real Data
 *
 * Laskee KPI-indeksit oikeasta orders-datasta kuukausittain.
 *
 * SKAALAUS: Suhteellinen omaan historiaan
 * - Paras kuukausi = 100, huonoin = 0
 * - Näyttää sesonkivaihtelun selvästi
 *
 * DELTA: Year-over-Year (YoY) vertailu
 * - Vertaa samaan kuukauteen viime vuonna
 * - Huomioi sesonkivaihtelun automaattisesti
 *
 * HIGH SEASON: Maaliskuu - Syyskuu
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const VAT_RATE = 1.25  // 25% ALV

async function generateHistory() {
  console.log('📊 Generating KPI history with RELATIVE scaling...\n')

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
  console.log(`📋 Found ${orders.length} orders`)

  // Get all products with cost_price
  const { data: products } = await supabase
    .from('products')
    .select('id, cost_price, stock_level')

  const productMap = {}
  products?.forEach(p => { productMap[p.id] = p })

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

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 1: Calculate raw metrics for all months FIRST
  // ═══════════════════════════════════════════════════════════════════

  const monthlyData = []

  for (const [month, monthOrders] of Object.entries(ordersByMonth).sort()) {
    const [year, monthNum] = month.split('-').map(Number)
    const periodStart = `${month}-01`
    const periodEnd = new Date(year, monthNum, 0).toISOString().split('T')[0]

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
            totalCost += salesNetto * 0.4
          }
        })
      } else {
        const orderNetto = (parseFloat(order.grand_total) || 0) / VAT_RATE
        totalSalesNetto += orderNetto
        totalCost += orderNetto * 0.4
      }
    })

    const grossProfit = totalSalesNetto - totalCost
    const marginPercent = totalSalesNetto > 0 ? (grossProfit / totalSalesNetto) * 100 : 0

    monthlyData.push({
      month,
      periodStart,
      periodEnd,
      orderCount,
      nettoRevenue,
      aov,
      grossProfit,
      marginPercent,
      marginEstimated: !hasLineItems,
      uniqueCustomers
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 2: Find min/max for relative scaling
  // ═══════════════════════════════════════════════════════════════════

  // Filter out incomplete months (< 10 orders) for min/max calculation
  const completeMonths = monthlyData.filter(m => m.orderCount >= 10)

  const minRevenue = Math.min(...completeMonths.map(m => m.nettoRevenue))
  const maxRevenue = Math.max(...completeMonths.map(m => m.nettoRevenue))
  const minOrders = Math.min(...completeMonths.map(m => m.orderCount))
  const maxOrders = Math.max(...completeMonths.map(m => m.orderCount))
  const minGrossProfit = Math.min(...completeMonths.map(m => m.grossProfit))
  const maxGrossProfit = Math.max(...completeMonths.map(m => m.grossProfit))
  const minAOV = Math.min(...completeMonths.map(m => m.aov))
  const maxAOV = Math.max(...completeMonths.map(m => m.aov))

  console.log('📈 SCALING RANGES (complete months only):')
  console.log(`   Revenue:      ${Math.round(minRevenue).toLocaleString()} - ${Math.round(maxRevenue).toLocaleString()} SEK`)
  console.log(`   Orders:       ${minOrders} - ${maxOrders}`)
  console.log(`   Gross Profit: ${Math.round(minGrossProfit).toLocaleString()} - ${Math.round(maxGrossProfit).toLocaleString()} SEK`)
  console.log(`   AOV:          ${Math.round(minAOV)} - ${Math.round(maxAOV)} SEK\n`)

  // Helper function for relative scaling (0-100)
  const scale = (value, min, max) => {
    if (max === min) return 50
    return Math.round(((value - min) / (max - min)) * 100)
  }

  // ═══════════════════════════════════════════════════════════════════
  // PHASE 3: Calculate indexes with relative scaling
  // ═══════════════════════════════════════════════════════════════════

  const snapshots = []

  // Create a map for quick lookup of same month last year
  const monthDataMap = {}
  monthlyData.forEach(m => {
    monthDataMap[m.month] = m
  })

  console.log('Kuukausi  | Revenue  | Orders | GP      | Core | PPI | Overall | YoY Δ')
  console.log('----------|----------|--------|---------|------|-----|---------|-------')

  for (const data of monthlyData) {
    const { month, periodStart, periodEnd, orderCount, nettoRevenue, aov, grossProfit, marginPercent, marginEstimated, uniqueCustomers } = data

    // Skip incomplete months for index calculation (show as 0)
    const isIncomplete = orderCount < 10

    // CORE INDEX - Business Performance
    // Weighted: Revenue 40%, Orders 30%, Gross Profit 30%
    const revenueIndex = isIncomplete ? 0 : scale(nettoRevenue, minRevenue, maxRevenue)
    const ordersIndex = isIncomplete ? 0 : scale(orderCount, minOrders, maxOrders)
    const grossProfitIndex = isIncomplete ? 0 : scale(grossProfit, minGrossProfit, maxGrossProfit)

    const coreIndex = isIncomplete ? 0 : Math.round(
      revenueIndex * 0.40 +
      ordersIndex * 0.30 +
      grossProfitIndex * 0.30
    )

    // PPI - Product Profitability Index
    // Based on margin % (absolute scale makes sense here)
    // 30% margin = 0, 60% margin = 100
    const ppiIndex = isIncomplete ? 0 : Math.max(0, Math.min(100, Math.round((marginPercent - 30) * (100 / 30))))

    // SPI - SEO Performance Index (placeholder until GSC data)
    const spiIndex = 50

    // OI - Operational Index
    // Based on current stock availability (we don't have historical stock)
    const outOfStockPercent = products?.filter(p => p.stock_level === 0).length / (products?.length || 1) * 100
    const stockIndex = Math.max(0, 100 - outOfStockPercent)
    const oiIndex = Math.round(stockIndex * 0.7 + 15) // Stock weighted heavily

    // OVERALL INDEX
    // Core is most important for seasonality visibility
    const overallIndex = isIncomplete ? 0 : Math.round(
      coreIndex * 0.50 +    // Core (seasonality) weighs most
      ppiIndex * 0.25 +     // Profitability
      spiIndex * 0.10 +     // SEO (placeholder)
      oiIndex * 0.15        // Operations
    )

    // Calculate YoY deltas - compare to same month last year
    const [yearStr, monthNumStr] = month.split('-')
    const currentYear = parseInt(yearStr)
    const lastYearMonth = `${currentYear - 1}-${monthNumStr}`
    const lastYearData = monthDataMap[lastYearMonth]

    // Calculate last year's indexes if we have data
    let lastYearIndexes = null
    if (lastYearData && lastYearData.orderCount >= 10) {
      const lyRevenueIndex = scale(lastYearData.nettoRevenue, minRevenue, maxRevenue)
      const lyOrdersIndex = scale(lastYearData.orderCount, minOrders, maxOrders)
      const lyGrossProfitIndex = scale(lastYearData.grossProfit, minGrossProfit, maxGrossProfit)
      const lyCoreIndex = Math.round(lyRevenueIndex * 0.40 + lyOrdersIndex * 0.30 + lyGrossProfitIndex * 0.30)
      const lyPpiIndex = Math.max(0, Math.min(100, Math.round((lastYearData.marginPercent - 30) * (100 / 30))))
      const lyOverallIndex = Math.round(lyCoreIndex * 0.50 + lyPpiIndex * 0.25 + spiIndex * 0.10 + oiIndex * 0.15)

      lastYearIndexes = {
        core: lyCoreIndex,
        ppi: lyPpiIndex,
        spi: spiIndex, // SEO placeholder stays same
        oi: oiIndex,   // OI based on current stock
        overall: lyOverallIndex
      }
    }

    // YoY deltas - null if no comparable data
    const deltas = {
      core: lastYearIndexes ? coreIndex - lastYearIndexes.core : null,
      ppi: lastYearIndexes ? ppiIndex - lastYearIndexes.ppi : null,
      spi: lastYearIndexes ? spiIndex - lastYearIndexes.spi : null,
      oi: lastYearIndexes ? oiIndex - lastYearIndexes.oi : null,
      overall: lastYearIndexes ? overallIndex - lastYearIndexes.overall : null
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
        revenue: { value: nettoRevenue, index: revenueIndex, weight: 0.40 },
        orders: { value: orderCount, index: ordersIndex, weight: 0.30 },
        gross_profit: { value: grossProfit, index: grossProfitIndex, weight: 0.30 }
      },
      ppi_components: {
        margin: { value: marginPercent, index: ppiIndex, weight: 1.0 }
      },
      spi_components: {},
      oi_components: {
        stock: { value: 100 - outOfStockPercent, index: stockIndex, weight: 0.70 }
      },
      alerts: []
    }

    snapshots.push(snapshot)

    const incompleteTag = isIncomplete ? ' *' : ''
    const yoyDelta = deltas.overall !== null ? (deltas.overall >= 0 ? `+${deltas.overall}` : `${deltas.overall}`) : '  —'
    console.log(
      `${month}  | ${Math.round(nettoRevenue).toLocaleString().padStart(8)} | ${String(orderCount).padStart(6)} | ${Math.round(grossProfit).toLocaleString().padStart(7)} | ${String(coreIndex).padStart(4)} | ${String(ppiIndex).padStart(3)} | ${String(overallIndex).padStart(7)} | ${yoyDelta.padStart(5)}${incompleteTag}`
    )
  }

  console.log('\n* = incomplete month (<10 orders)')
  console.log('YoY Δ = vertailu samaan kuukauteen viime vuonna')

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

  console.log(`\n✅ Generated ${snapshots.length} monthly KPI snapshots with relative scaling!`)
}

generateHistory().catch(console.error)
