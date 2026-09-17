/**
 * Calculate KPI Snapshot Cron Job
 *
 * Calculates weekly KPI snapshot on Mondays (for previous week)
 * Calculates monthly KPI snapshot on 1st of month (for previous month)
 *
 * Called from sync-data.js or manually via POST request
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// VAT rates per country
const VAT_RATES = {
  SE: 1.25,  // Sweden 25%
  FI: 1.24,  // Finland 24%
}

export const config = {
  maxDuration: 120,
}

// Get ISO week number
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

// Get ISO week year
function getISOWeekYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  return d.getUTCFullYear()
}

// Get week start (Monday) and end (Sunday) dates
function getWeekDates(year, week) {
  const simple = new Date(year, 0, 1 + (week - 1) * 7)
  const dow = simple.getDay()
  const weekStart = new Date(simple)
  if (dow <= 4) {
    weekStart.setDate(simple.getDate() - simple.getDay() + 1)
  } else {
    weekStart.setDate(simple.getDate() + 8 - simple.getDay())
  }
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  return {
    start: weekStart.toISOString().split('T')[0],
    end: weekEnd.toISOString().split('T')[0]
  }
}

// Get previous week info
function getPreviousWeek() {
  const now = new Date()
  // Go back 7 days to get previous week
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const year = getISOWeekYear(lastWeek)
  const week = getWeekNumber(lastWeek)
  return { year, week, ...getWeekDates(year, week) }
}

// Get previous month dates
function getPreviousMonth() {
  const now = new Date()
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  const start = new Date(year, month, 1).toISOString().split('T')[0]
  const end = new Date(year, month + 1, 0).toISOString().split('T')[0]
  return { year, month: month + 1, start, end }
}

// Scale value to 0-100 based on min/max
function scale(value, min, max) {
  if (max === min) return 50
  return Math.round(((value - min) / (max - min)) * 100)
}

// Multiplier that turns a VAT-inclusive amount into a net one, read from the order
// itself. Falls back to the VAT_RATES divisor when the order has no split - 12 orders
// have a null total_before_tax, all but one of them zero-value.
export function netFactor(order, vatRate) {
  const gross = parseFloat(order.grand_total) || 0
  let net = parseFloat(order.total_before_tax)
  if (!Number.isFinite(net)) {
    // Only a tax amount that is actually present tells us the split. Treating a
    // missing total_tax as zero would read as "no VAT on this order" and hand back
    // a factor of 1, which inflates the margin by the whole VAT rate.
    const tax = parseFloat(order.total_tax)
    net = Number.isFinite(tax) && tax > 0 ? gross - tax : NaN
  }
  if (gross > 0 && net > 0 && net <= gross) return net / gross
  return 1 / vatRate
}

// order_line_items.quantity is rounded to a whole number, so paint sold by the litre
// reports 1 for a 0,5 l line. The ordered amount survives in the prices.
export function trueQuantity(item) {
  const unit = parseFloat(item.unit_price) || 0
  const total = parseFloat(item.total_price) || 0
  if (unit > 0) return total / unit
  return parseFloat(item.quantity) || 0
}

/**
 * Calculate KPI for a single store
 */
async function calculateKPIForStore(supabase, storeId, granularity, force, country) {
  const VAT_RATE = VAT_RATES[country] || 1.24

  // Determine period to calculate
  let periodStart, periodEnd, periodLabel
  if (granularity === 'month') {
    const { start, end, year, month } = getPreviousMonth()
    periodStart = start
    periodEnd = end
    periodLabel = `${year}-${String(month).padStart(2, '0')}`
  } else {
    const { start, end, year, week } = getPreviousWeek()
    periodStart = start
    periodEnd = end
    periodLabel = `${year}-W${String(week).padStart(2, '0')}`
  }

  console.log(`Calculating ${granularity} KPI for ${storeId}: ${periodStart} to ${periodEnd} (${periodLabel})`)

  // Check if snapshot already exists
  const { data: existing } = await supabase
    .from('kpi_index_snapshots')
    .select('id')
    .eq('store_id', storeId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .eq('granularity', granularity)
    .maybeSingle()

  if (existing && !force) {
    return { status: 'skipped', reason: 'already exists', period: periodLabel }
  }

  // Fetch orders for this period
  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('id, creation_date, grand_total, total_before_tax, total_tax, customer_id')
    .eq('store_id', storeId)
    .gte('creation_date', periodStart)
    .lte('creation_date', periodEnd + 'T23:59:59')

  if (ordersError) throw ordersError

  // Fetch line items for these orders
  const orderIds = orders?.map(o => o.id) || []
  let lineItems = []
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from('order_line_items')
      .select('order_id, product_number, quantity, unit_price, total_price')
      .in('order_id', orderIds)
    lineItems = items || []
  }

  // Fetch products with cost_price
  const { data: products } = await supabase
    .from('products')
    .select('id, product_number, cost_price, stock_level')
    .eq('store_id', storeId)

  // Keyed by product_number, not id: order_line_items.product_id is NULL on every
  // row, so an id lookup never matched and every line fell through to the margin
  // assumption below. A handful of product_numbers occur twice within a store;
  // keep the higher cost_price so the margin is not flattered by a stale row.
  const productMap = {}
  products?.forEach(p => {
    if (!p.product_number) return
    const seen = productMap[p.product_number]
    if (!seen || (parseFloat(p.cost_price) || 0) > (parseFloat(seen.cost_price) || 0)) {
      productMap[p.product_number] = p
    }
  })

  // Group line items by order
  const lineItemsByOrder = {}
  lineItems.forEach(li => {
    if (!lineItemsByOrder[li.order_id]) lineItemsByOrder[li.order_id] = []
    lineItemsByOrder[li.order_id].push(li)
  })

  // Calculate metrics
  const orderCount = orders?.length || 0
  const nettoRevenue = orders?.reduce(
    (sum, o) => sum + (parseFloat(o.grand_total) || 0) * netFactor(o, VAT_RATE), 0) || 0
  const aov = orderCount > 0 ? nettoRevenue / orderCount : 0
  const uniqueCustomers = new Set(orders?.map(o => o.customer_id).filter(Boolean)).size

  // Calculate gross profit
  let totalCost = 0
  let totalSalesNetto = 0
  let hasLineItems = false

  orders?.forEach(order => {
    // The order carries its own VAT split; VAT_RATE is only a fallback. The table
    // is stale (it has Finland at 24 %, the real rate is 25,5 %) and a hardcoded
    // divisor silently shifts the margin whenever a rate changes.
    const orderVat = netFactor(order, VAT_RATE)
    const items = lineItemsByOrder[order.id] || []
    if (items.length > 0) {
      hasLineItems = true
      items.forEach(item => {
        const salesNetto = (parseFloat(item.total_price) || 0) * orderVat
        totalSalesNetto += salesNetto
        const product = productMap[item.product_number]
        const costPrice = parseFloat(product?.cost_price) || 0
        if (costPrice > 0) {
          totalCost += costPrice * trueQuantity(item)
        } else {
          totalCost += salesNetto * 0.4
        }
      })
    } else {
      const orderNetto = (parseFloat(order.grand_total) || 0) * orderVat
      totalSalesNetto += orderNetto
      totalCost += orderNetto * 0.4
    }
  })

  const grossProfit = totalSalesNetto - totalCost
  const marginPercent = totalSalesNetto > 0 ? (grossProfit / totalSalesNetto) * 100 : 0

  // Fetch historical data for scaling (last 12 weeks/months)
  const { data: historyData } = await supabase
    .from('kpi_index_snapshots')
    .select('core_index, product_profitability_index, raw_metrics')
    .eq('store_id', storeId)
    .eq('granularity', granularity)
    .order('period_end', { ascending: false })
    .limit(12)

  let minRevenue = nettoRevenue, maxRevenue = nettoRevenue
  let minOrders = orderCount, maxOrders = orderCount
  let minGrossProfit = grossProfit, maxGrossProfit = grossProfit

  historyData?.forEach(h => {
    const metrics = h.raw_metrics?.core || {}
    if (metrics.total_revenue) {
      minRevenue = Math.min(minRevenue, metrics.total_revenue)
      maxRevenue = Math.max(maxRevenue, metrics.total_revenue)
    }
    if (metrics.order_count) {
      minOrders = Math.min(minOrders, metrics.order_count)
      maxOrders = Math.max(maxOrders, metrics.order_count)
    }
    if (metrics.gross_profit) {
      minGrossProfit = Math.min(minGrossProfit, metrics.gross_profit)
      maxGrossProfit = Math.max(maxGrossProfit, metrics.gross_profit)
    }
  })

  const revenueIndex = orderCount >= 3 ? scale(nettoRevenue, minRevenue, maxRevenue) : 0
  const ordersIndex = orderCount >= 3 ? scale(orderCount, minOrders, maxOrders) : 0
  const grossProfitIndex = orderCount >= 3 ? scale(grossProfit, minGrossProfit, maxGrossProfit) : 0

  const coreIndex = orderCount >= 3
    ? Math.round(revenueIndex * 0.40 + ordersIndex * 0.30 + grossProfitIndex * 0.30)
    : 0

  const ppiIndex = orderCount >= 3
    ? Math.max(0, Math.min(100, Math.round((marginPercent - 30) * (100 / 30))))
    : 0

  const spiIndex = 50

  const outOfStockCount = products?.filter(p => p.stock_level === 0).length || 0
  const totalProducts = products?.length || 1
  const stockAvailability = ((totalProducts - outOfStockCount) / totalProducts) * 100
  const oiIndex = Math.round(stockAvailability * 0.7 + 15)

  const overallIndex = orderCount >= 3
    ? Math.round(coreIndex * 0.50 + ppiIndex * 0.25 + spiIndex * 0.10 + oiIndex * 0.15)
    : 0

  const { data: prevSnapshot } = await supabase
    .from('kpi_index_snapshots')
    .select('*')
    .eq('store_id', storeId)
    .eq('granularity', granularity)
    .lt('period_end', periodStart)
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()

  const deltas = {
    core: prevSnapshot ? coreIndex - prevSnapshot.core_index : null,
    ppi: prevSnapshot ? ppiIndex - prevSnapshot.product_profitability_index : null,
    spi: prevSnapshot ? spiIndex - prevSnapshot.seo_performance_index : null,
    oi: prevSnapshot ? oiIndex - prevSnapshot.operational_index : null,
    overall: prevSnapshot ? overallIndex - prevSnapshot.overall_index : null
  }

  const snapshot = {
    store_id: storeId,
    period_start: periodStart,
    period_end: periodEnd,
    granularity,
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
        margin_estimated: !hasLineItems,
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
      stock_availability: { value: stockAvailability, index: oiIndex, weight: 1.0 }
    },
    alerts: []
  }

  const { error: upsertError } = await supabase
    .from('kpi_index_snapshots')
    .upsert(snapshot, {
      onConflict: 'store_id,period_end,granularity'
    })

  if (upsertError) throw upsertError

  console.log(`KPI ${periodLabel}: Overall ${overallIndex}, Core ${coreIndex}, PPI ${ppiIndex}, SPI ${spiIndex}, OI ${oiIndex}`)

  return {
    status: 'success',
    period: periodLabel,
    granularity,
    indexes: { overall: overallIndex, core: coreIndex, ppi: ppiIndex, spi: spiIndex, oi: oiIndex },
    deltas,
    metrics: { orders: orderCount, revenue: Math.round(nettoRevenue), aov: Math.round(aov), margin: Math.round(marginPercent * 10) / 10 }
  }
}

export default async function handler(req, res) {
  console.log('Starting KPI snapshot calculation:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { granularity = 'week', force = false, store_id } = req.body || {}

  try {
    // If store_id provided, calculate for that store only
    if (store_id) {
      const { data: shop } = await supabase
        .from('shops')
        .select('currency')
        .eq('store_id', store_id)
        .maybeSingle()

      const country = shop?.currency === 'SEK' ? 'SE' : 'FI'
      const result = await calculateKPIForStore(supabase, store_id, granularity, force, country)
      return res.status(200).json(result)
    }

    // Multi-tenant: calculate for all shops
    const { data: shops, error: shopsError } = await supabase
      .from('shops')
      .select('id, name, store_id, currency')

    if (shopsError || !shops?.length) {
      return res.status(500).json({ error: 'No shops found' })
    }

    const results = []
    for (const shop of shops) {
      if (!shop.store_id) continue
      try {
        const country = shop.currency === 'SEK' ? 'SE' : 'FI'
        const result = await calculateKPIForStore(supabase, shop.store_id, granularity, force, country)
        results.push({ shop: shop.name, ...result })
      } catch (err) {
        console.error(`${shop.name} KPI error:`, err.message)
        results.push({ shop: shop.name, status: 'error', error: err.message })
      }
    }

    return res.status(200).json({ success: true, results })

  } catch (error) {
    console.error('KPI calculation failed:', error)
    return res.status(500).json({ error: error.message })
  }
}
