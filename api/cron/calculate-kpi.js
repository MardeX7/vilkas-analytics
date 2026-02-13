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

const VAT_RATE = 1.25 // 25% ALV (Sweden)

export const config = {
  maxDuration: 60, // 1 minute should be enough
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

export default async function handler(req, res) {
  console.log('📊 Starting KPI snapshot calculation:', new Date().toISOString())

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing Supabase credentials')
    return res.status(500).json({ error: 'Missing Supabase credentials' })
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Get parameters
  const { granularity = 'week', force = false } = req.body || {}

  try {
    // Get store
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id')
      .single()

    if (storeError || !store) {
      throw new Error('No store found')
    }

    const storeId = store.id

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

    console.log(`📅 Calculating ${granularity} KPI for period: ${periodStart} to ${periodEnd} (${periodLabel})`)

    // Check if snapshot already exists
    const { data: existing } = await supabase
      .from('kpi_index_snapshots')
      .select('id')
      .eq('store_id', storeId)
      .eq('period_start', periodStart)
      .eq('period_end', periodEnd)
      .eq('granularity', granularity)
      .single()

    if (existing && !force) {
      console.log(`⏭️ Snapshot already exists for ${periodLabel}`)
      return res.status(200).json({
        status: 'skipped',
        reason: 'Snapshot already exists',
        period: periodLabel
      })
    }

    // Fetch orders for this period
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, creation_date, grand_total, customer_id')
      .gte('creation_date', periodStart)
      .lte('creation_date', periodEnd + 'T23:59:59')

    if (ordersError) throw ordersError

    console.log(`📋 Found ${orders?.length || 0} orders in period`)

    // Fetch line items for these orders
    const orderIds = orders?.map(o => o.id) || []
    let lineItems = []
    if (orderIds.length > 0) {
      const { data: items } = await supabase
        .from('order_line_items')
        .select('order_id, product_id, quantity, total_price')
        .in('order_id', orderIds)
      lineItems = items || []
    }

    // Fetch products with cost_price
    const { data: products } = await supabase
      .from('products')
      .select('id, cost_price, stock_level')

    const productMap = {}
    products?.forEach(p => { productMap[p.id] = p })

    // Group line items by order
    const lineItemsByOrder = {}
    lineItems.forEach(li => {
      if (!lineItemsByOrder[li.order_id]) lineItemsByOrder[li.order_id] = []
      lineItemsByOrder[li.order_id].push(li)
    })

    // Calculate metrics
    const orderCount = orders?.length || 0
    const totalRevenue = orders?.reduce((sum, o) => sum + (parseFloat(o.grand_total) || 0), 0) || 0
    const nettoRevenue = totalRevenue / VAT_RATE
    const aov = orderCount > 0 ? nettoRevenue / orderCount : 0
    const uniqueCustomers = new Set(orders?.map(o => o.customer_id).filter(Boolean)).size

    // Calculate gross profit
    let totalCost = 0
    let totalSalesNetto = 0
    let hasLineItems = false

    orders?.forEach(order => {
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
            totalCost += salesNetto * 0.4 // Default 40% cost
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

    // Fetch historical data for scaling (last 12 weeks/months)
    const { data: historyData } = await supabase
      .from('kpi_index_snapshots')
      .select('core_index, product_profitability_index, raw_metrics')
      .eq('store_id', storeId)
      .eq('granularity', granularity)
      .order('period_end', { ascending: false })
      .limit(12)

    // Calculate scaling ranges from history
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

    // Calculate indexes
    const revenueIndex = orderCount >= 3 ? scale(nettoRevenue, minRevenue, maxRevenue) : 0
    const ordersIndex = orderCount >= 3 ? scale(orderCount, minOrders, maxOrders) : 0
    const grossProfitIndex = orderCount >= 3 ? scale(grossProfit, minGrossProfit, maxGrossProfit) : 0

    // CORE INDEX (40% revenue, 30% orders, 30% gross profit)
    const coreIndex = orderCount >= 3
      ? Math.round(revenueIndex * 0.40 + ordersIndex * 0.30 + grossProfitIndex * 0.30)
      : 0

    // PPI - Product Profitability Index (30% margin = 0, 60% margin = 100)
    const ppiIndex = orderCount >= 3
      ? Math.max(0, Math.min(100, Math.round((marginPercent - 30) * (100 / 30))))
      : 0

    // SPI - SEO Performance Index (simplified, use 50 as default)
    const spiIndex = 50

    // OI - Operational Index (simplified)
    const outOfStockCount = products?.filter(p => p.stock_level === 0).length || 0
    const totalProducts = products?.length || 1
    const stockAvailability = ((totalProducts - outOfStockCount) / totalProducts) * 100
    const oiIndex = Math.round(stockAvailability * 0.7 + 15)

    // OVERALL INDEX
    const overallIndex = orderCount >= 3
      ? Math.round(coreIndex * 0.50 + ppiIndex * 0.25 + spiIndex * 0.10 + oiIndex * 0.15)
      : 0

    // Get previous period for delta calculation
    const { data: prevSnapshot } = await supabase
      .from('kpi_index_snapshots')
      .select('*')
      .eq('store_id', storeId)
      .eq('granularity', granularity)
      .lt('period_end', periodStart)
      .order('period_end', { ascending: false })
      .limit(1)
      .single()

    const deltas = {
      core: prevSnapshot ? coreIndex - prevSnapshot.core_index : null,
      ppi: prevSnapshot ? ppiIndex - prevSnapshot.product_profitability_index : null,
      spi: prevSnapshot ? spiIndex - prevSnapshot.seo_performance_index : null,
      oi: prevSnapshot ? oiIndex - prevSnapshot.operational_index : null,
      overall: prevSnapshot ? overallIndex - prevSnapshot.overall_index : null
    }

    // Create snapshot
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

    // Upsert snapshot
    const { error: upsertError } = await supabase
      .from('kpi_index_snapshots')
      .upsert(snapshot, {
        onConflict: 'store_id,period_end,granularity'
      })

    if (upsertError) {
      throw upsertError
    }

    console.log(`✅ KPI snapshot created for ${periodLabel}`)
    console.log(`   Overall: ${overallIndex}, Core: ${coreIndex}, PPI: ${ppiIndex}, SPI: ${spiIndex}, OI: ${oiIndex}`)

    return res.status(200).json({
      status: 'success',
      period: periodLabel,
      granularity,
      indexes: {
        overall: overallIndex,
        core: coreIndex,
        ppi: ppiIndex,
        spi: spiIndex,
        oi: oiIndex
      },
      deltas,
      metrics: {
        orders: orderCount,
        revenue: Math.round(nettoRevenue),
        aov: Math.round(aov),
        margin: Math.round(marginPercent * 10) / 10
      }
    })

  } catch (error) {
    console.error('❌ KPI calculation failed:', error)
    return res.status(500).json({
      error: error.message
    })
  }
}
