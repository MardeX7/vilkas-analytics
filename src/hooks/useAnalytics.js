import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Kovakoodattu store_id (billackering)
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

// Helper to fetch summary for a period
async function fetchPeriodSummary(startDate, endDate) {
  let query = supabase
    .from('orders')
    .select('grand_total, billing_email, creation_date, status, shipping_price, discount_amount')
    .eq('store_id', STORE_ID)

  if (startDate) query = query.gte('creation_date', startDate)
  if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')

  const { data: allOrders } = await query

  if (!allOrders || allOrders.length === 0) {
    return {
      totalRevenue: 0, orderCount: 0, uniqueCustomers: 0, avgOrderValue: 0,
      cancelledCount: 0, cancelledPercent: 0,
      totalShipping: 0, shippingPercent: 0,
      totalDiscount: 0, discountPercent: 0,
      returningCustomerPercent: 0
    }
  }

  // Separate cancelled vs non-cancelled
  const cancelledOrders = allOrders.filter(o => o.status === 'cancelled')
  const activeOrders = allOrders.filter(o => o.status !== 'cancelled')

  const totalRevenue = activeOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
  const orderCount = activeOrders.length
  const uniqueCustomers = new Set(activeOrders.map(o => o.billing_email).filter(Boolean)).size
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

  // Cancelled orders metrics
  const cancelledCount = cancelledOrders.length
  const cancelledPercent = allOrders.length > 0 ? (cancelledCount / allOrders.length) * 100 : 0

  // Shipping cost metrics
  const totalShipping = activeOrders.reduce((sum, o) => sum + (o.shipping_price || 0), 0)
  const shippingPercent = totalRevenue > 0 ? (totalShipping / totalRevenue) * 100 : 0

  // Discount metrics
  const totalDiscount = activeOrders.reduce((sum, o) => sum + (o.discount_amount || 0), 0)
  const discountPercent = totalRevenue > 0 ? (totalDiscount / totalRevenue) * 100 : 0

  // Returning customers - customers with more than 1 order
  const customerOrderCount = {}
  activeOrders.forEach(o => {
    if (o.billing_email) {
      customerOrderCount[o.billing_email] = (customerOrderCount[o.billing_email] || 0) + 1
    }
  })
  const returningCustomers = Object.values(customerOrderCount).filter(count => count > 1).length
  const returningCustomerPercent = uniqueCustomers > 0 ? (returningCustomers / uniqueCustomers) * 100 : 0

  return {
    totalRevenue, orderCount, uniqueCustomers, avgOrderValue,
    cancelledCount, cancelledPercent,
    totalShipping, shippingPercent,
    totalDiscount, discountPercent,
    returningCustomerPercent
  }
}

// Helper to fetch gross margin data from KPI snapshots
// Uses pre-calculated data from kpi_index_snapshots.raw_metrics.core
// Falls back to snapshot closest to the requested period
async function fetchGrossMargin(startDate, endDate) {
  // Get snapshots for both week and month granularity to find best match
  const { data: snapshots } = await supabase
    .from('kpi_index_snapshots')
    .select('period_start, period_end, granularity, raw_metrics')
    .eq('store_id', STORE_ID)
    .order('period_end', { ascending: false })
    .limit(24) // ~6 months of weekly + monthly snapshots

  if (!snapshots || snapshots.length === 0) {
    return { grossProfit: 0, marginPercent: 0, totalCost: 0, totalRevenue: 0 }
  }

  // Find the snapshot that best matches the requested period
  // Prefer weekly for shorter periods, monthly for longer
  let bestSnapshot = null

  if (startDate && endDate) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24))

    // For periods <= 14 days, prefer weekly; for longer, prefer monthly
    const preferredGranularity = daysDiff <= 14 ? 'week' : (daysDiff <= 45 ? 'week' : 'month')

    // Find snapshot that overlaps with the requested period
    for (const snap of snapshots) {
      if (snap.granularity === preferredGranularity && snap.raw_metrics?.core) {
        const snapStart = new Date(snap.period_start)
        const snapEnd = new Date(snap.period_end)

        // Check if periods overlap
        if (start <= snapEnd && end >= snapStart) {
          bestSnapshot = snap
          break
        }
      }
    }

    // Fallback: take the latest snapshot with core data
    if (!bestSnapshot) {
      bestSnapshot = snapshots.find(s => s.raw_metrics?.core)
    }
  } else {
    // No date range specified, use latest snapshot with core data
    bestSnapshot = snapshots.find(s => s.raw_metrics?.core)
  }

  if (bestSnapshot?.raw_metrics?.core) {
    const core = bestSnapshot.raw_metrics.core
    return {
      grossProfit: core.gross_profit || 0,
      marginPercent: core.margin_percent || 0,
      totalCost: (core.total_revenue || 0) - (core.gross_profit || 0),
      totalRevenue: core.total_revenue || 0
    }
  }

  // Fallback: return zeros if no snapshot available
  return { grossProfit: 0, marginPercent: 0, totalCost: 0, totalRevenue: 0 }
}

// Helper to fetch average items per order
async function fetchItemsPerOrder(startDate, endDate) {
  let query = supabase
    .from('orders')
    .select(`
      id,
      order_line_items (quantity)
    `)
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')

  if (startDate) query = query.gte('creation_date', startDate)
  if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')

  const { data: orders } = await query

  if (!orders || orders.length === 0) {
    return { avgItemsPerOrder: 0, totalItems: 0 }
  }

  let totalItems = 0
  orders.forEach(o => {
    o.order_line_items?.forEach(item => {
      totalItems += item.quantity || 0
    })
  })

  const avgItemsPerOrder = orders.length > 0 ? totalItems / orders.length : 0

  return { avgItemsPerOrder, totalItems }
}

export function useAnalytics(dateRange = null) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    dailySales: [],
    previousDailySales: [],
    weeklySales: [],
    monthlySales: [],
    topProducts: [],
    paymentMethods: [],
    shippingMethods: [],
    customerGeography: [],
    weekdayAnalysis: [],
    hourlyAnalysis: [],
    avgBasket: null,
    summary: null,
    previousSummary: null,
    comparison: null
  })

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Build date filter
      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate
      const compare = dateRange?.compare
      const previousStartDate = dateRange?.previousStartDate
      const previousEndDate = dateRange?.previousEndDate

      // Fetch daily sales with date filter
      let dailyQuery = supabase.from('v_daily_sales').select('*').eq('store_id', STORE_ID)
      if (startDate) dailyQuery = dailyQuery.gte('sale_date', startDate)
      if (endDate) dailyQuery = dailyQuery.lte('sale_date', endDate)
      dailyQuery = dailyQuery.order('sale_date', { ascending: false })

      // Fetch previous period daily sales for comparison
      let previousDailyQuery = null
      if (compare && previousStartDate && previousEndDate) {
        previousDailyQuery = supabase.from('v_daily_sales').select('*').eq('store_id', STORE_ID)
          .gte('sale_date', previousStartDate)
          .lte('sale_date', previousEndDate)
          .order('sale_date', { ascending: false })
      }

      // For other data, we need to query orders directly with date filter
      // Top products in date range
      let productsQuery = supabase
        .from('orders')
        .select(`
          id,
          order_line_items (
            product_name,
            product_number,
            quantity,
            total_price
          )
        `)
        .eq('store_id', STORE_ID)
        .neq('status', 'cancelled')

      if (startDate) productsQuery = productsQuery.gte('creation_date', startDate)
      if (endDate) productsQuery = productsQuery.lte('creation_date', endDate + 'T23:59:59')

      // Payment methods in date range
      let paymentQuery = supabase
        .from('orders')
        .select('payment_method, grand_total')
        .eq('store_id', STORE_ID)
        .neq('status', 'cancelled')

      if (startDate) paymentQuery = paymentQuery.gte('creation_date', startDate)
      if (endDate) paymentQuery = paymentQuery.lte('creation_date', endDate + 'T23:59:59')

      // Shipping methods in date range
      let shippingQuery = supabase
        .from('orders')
        .select('shipping_method, grand_total')
        .eq('store_id', STORE_ID)
        .neq('status', 'cancelled')

      if (startDate) shippingQuery = shippingQuery.gte('creation_date', startDate)
      if (endDate) shippingQuery = shippingQuery.lte('creation_date', endDate + 'T23:59:59')

      const [
        dailyRes,
        weeklyRes,
        monthlyRes,
        ordersForProducts,
        ordersForPayment,
        ordersForShipping,
        weekdayRes,
        hourlyRes,
        currentSummary,
        previousSummary,
        previousDailyRes,
        grossMargin,
        previousGrossMargin,
        itemsPerOrder
      ] = await Promise.all([
        dailyQuery,
        supabase.from('v_weekly_sales').select('*').eq('store_id', STORE_ID).order('week_start', { ascending: false }).limit(12),
        supabase.from('v_monthly_sales').select('*').eq('store_id', STORE_ID).order('sale_month', { ascending: false }).limit(12),
        productsQuery,
        paymentQuery,
        shippingQuery,
        supabase.from('v_weekday_analysis').select('*').eq('store_id', STORE_ID),
        supabase.from('v_hourly_analysis').select('*').eq('store_id', STORE_ID),
        fetchPeriodSummary(startDate, endDate),
        compare && previousStartDate ? fetchPeriodSummary(previousStartDate, previousEndDate) : Promise.resolve(null),
        previousDailyQuery || Promise.resolve({ data: null }),
        fetchGrossMargin(startDate, endDate),
        compare && previousStartDate ? fetchGrossMargin(previousStartDate, previousEndDate) : Promise.resolve(null),
        fetchItemsPerOrder(startDate, endDate)
      ])

      // Aggregate top products from orders
      const productMap = new Map()
      ordersForProducts.data?.forEach(order => {
        order.order_line_items?.forEach(item => {
          const key = item.product_number || item.product_name
          if (!productMap.has(key)) {
            productMap.set(key, {
              product_name: item.product_name,
              product_number: item.product_number,
              total_quantity: 0,
              total_revenue: 0,
              order_count: 0
            })
          }
          const prod = productMap.get(key)
          prod.total_quantity += item.quantity || 0
          prod.total_revenue += item.total_price || 0
          prod.order_count += 1
        })
      })
      const topProducts = Array.from(productMap.values())
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 10)

      // Aggregate payment methods
      const paymentMap = new Map()
      ordersForPayment.data?.forEach(order => {
        const method = order.payment_method || 'Unknown'
        if (!paymentMap.has(method)) {
          paymentMap.set(method, { payment_method: method, order_count: 0, total_revenue: 0 })
        }
        const pm = paymentMap.get(method)
        pm.order_count += 1
        pm.total_revenue += order.grand_total || 0
      })
      const totalPaymentOrders = ordersForPayment.data?.length || 1
      const paymentMethods = Array.from(paymentMap.values())
        .map(pm => ({ ...pm, percentage: ((pm.order_count / totalPaymentOrders) * 100).toFixed(1) }))
        .sort((a, b) => b.order_count - a.order_count)

      // Aggregate shipping methods
      const shippingMap = new Map()
      ordersForShipping.data?.forEach(order => {
        const method = order.shipping_method || 'Unknown'
        if (!shippingMap.has(method)) {
          shippingMap.set(method, { shipping_method: method, order_count: 0, total_revenue: 0 })
        }
        const sm = shippingMap.get(method)
        sm.order_count += 1
        sm.total_revenue += order.grand_total || 0
      })
      const totalShippingOrders = ordersForShipping.data?.length || 1
      const shippingMethods = Array.from(shippingMap.values())
        .map(sm => ({ ...sm, percentage: ((sm.order_count / totalShippingOrders) * 100).toFixed(1) }))
        .sort((a, b) => b.order_count - a.order_count)

      // Calculate comparison percentages
      let comparison = null
      if (compare && previousSummary && previousSummary.totalRevenue > 0) {
        comparison = {
          revenue: ((currentSummary.totalRevenue - previousSummary.totalRevenue) / previousSummary.totalRevenue) * 100,
          orders: previousSummary.orderCount > 0
            ? ((currentSummary.orderCount - previousSummary.orderCount) / previousSummary.orderCount) * 100
            : 0,
          customers: previousSummary.uniqueCustomers > 0
            ? ((currentSummary.uniqueCustomers - previousSummary.uniqueCustomers) / previousSummary.uniqueCustomers) * 100
            : 0,
          aov: previousSummary.avgOrderValue > 0
            ? ((currentSummary.avgOrderValue - previousSummary.avgOrderValue) / previousSummary.avgOrderValue) * 100
            : 0,
          // New metrics comparison
          margin: previousGrossMargin?.marginPercent > 0
            ? grossMargin.marginPercent - previousGrossMargin.marginPercent
            : 0,
          returningCustomers: previousSummary.returningCustomerPercent > 0
            ? currentSummary.returningCustomerPercent - previousSummary.returningCustomerPercent
            : 0,
          cancelledPercent: previousSummary.cancelledPercent > 0
            ? currentSummary.cancelledPercent - previousSummary.cancelledPercent
            : 0
        }
      }

      setData({
        dailySales: dailyRes.data || [],
        previousDailySales: previousDailyRes?.data || [],
        weeklySales: weeklyRes.data || [],
        monthlySales: monthlyRes.data || [],
        topProducts,
        paymentMethods,
        shippingMethods,
        customerGeography: [],
        weekdayAnalysis: weekdayRes.data || [],
        hourlyAnalysis: hourlyRes.data || [],
        avgBasket: null,
        summary: {
          ...currentSummary,
          ...grossMargin,
          ...itemsPerOrder,
          currency: 'SEK'
        },
        previousSummary: previousSummary ? {
          ...previousSummary,
          marginPercent: previousGrossMargin?.marginPercent || 0,
          currency: 'SEK'
        } : null,
        comparison
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange?.startDate, dateRange?.endDate, dateRange?.compare, dateRange?.previousStartDate, dateRange?.previousEndDate])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  return { ...data, loading, error, refresh: fetchAllData }
}

// KPI summary hook
export function useKPISummary() {
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState(null)

  useEffect(() => {
    async function fetch() {
      const { data: monthly } = await supabase
        .from('v_monthly_sales')
        .select('*')
        .eq('store_id', STORE_ID)
        .order('sale_month', { ascending: false })
        .limit(2)

      const { data: daily } = await supabase
        .from('v_daily_sales')
        .select('*')
        .eq('store_id', STORE_ID)
        .order('sale_date', { ascending: false })
        .limit(7)

      const thisMonth = monthly?.[0]
      const lastMonth = monthly?.[1]

      // Viimeisen 7 päivän summat
      const last7Days = daily?.reduce((acc, d) => ({
        revenue: acc.revenue + (d.total_revenue || 0),
        orders: acc.orders + (d.order_count || 0)
      }), { revenue: 0, orders: 0 }) || { revenue: 0, orders: 0 }

      setKpi({
        thisMonth: {
          revenue: thisMonth?.total_revenue || 0,
          orders: thisMonth?.order_count || 0,
          aov: thisMonth?.avg_order_value || 0,
          customers: thisMonth?.unique_customers || 0,
          label: thisMonth?.month_label || '-'
        },
        lastMonth: {
          revenue: lastMonth?.total_revenue || 0,
          orders: lastMonth?.order_count || 0,
          aov: lastMonth?.avg_order_value || 0,
          customers: lastMonth?.unique_customers || 0,
          label: lastMonth?.month_label || '-'
        },
        last7Days,
        currency: thisMonth?.currency || 'SEK'
      })
      setLoading(false)
    }
    fetch()
  }, [])

  return { kpi, loading }
}
