import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Kovakoodattu store_id (billackering)
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

export function useAnalytics(dateRange = null) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    dailySales: [],
    weeklySales: [],
    monthlySales: [],
    topProducts: [],
    paymentMethods: [],
    shippingMethods: [],
    customerGeography: [],
    weekdayAnalysis: [],
    hourlyAnalysis: [],
    avgBasket: null,
    summary: null
  })

  const fetchAllData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Build date filter
      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate

      // Fetch daily sales with date filter
      let dailyQuery = supabase.from('v_daily_sales').select('*').eq('store_id', STORE_ID)
      if (startDate) dailyQuery = dailyQuery.gte('sale_date', startDate)
      if (endDate) dailyQuery = dailyQuery.lte('sale_date', endDate)
      dailyQuery = dailyQuery.order('sale_date', { ascending: false })

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

      // Summary stats for the period
      let summaryQuery = supabase
        .from('orders')
        .select('grand_total, billing_email, creation_date')
        .eq('store_id', STORE_ID)
        .neq('status', 'cancelled')

      if (startDate) summaryQuery = summaryQuery.gte('creation_date', startDate)
      if (endDate) summaryQuery = summaryQuery.lte('creation_date', endDate + 'T23:59:59')

      const [
        dailyRes,
        weeklyRes,
        monthlyRes,
        ordersForProducts,
        ordersForPayment,
        ordersForShipping,
        ordersForSummary,
        weekdayRes,
        hourlyRes
      ] = await Promise.all([
        dailyQuery,
        supabase.from('v_weekly_sales').select('*').eq('store_id', STORE_ID).order('week_start', { ascending: false }).limit(12),
        supabase.from('v_monthly_sales').select('*').eq('store_id', STORE_ID).order('sale_month', { ascending: false }).limit(12),
        productsQuery,
        paymentQuery,
        shippingQuery,
        summaryQuery,
        supabase.from('v_weekday_analysis').select('*').eq('store_id', STORE_ID),
        supabase.from('v_hourly_analysis').select('*').eq('store_id', STORE_ID)
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

      // Calculate summary
      const orders = ordersForSummary.data || []
      const totalRevenue = orders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
      const orderCount = orders.length
      const uniqueCustomers = new Set(orders.map(o => o.billing_email).filter(Boolean)).size
      const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

      setData({
        dailySales: dailyRes.data || [],
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
          totalRevenue,
          orderCount,
          uniqueCustomers,
          avgOrderValue,
          currency: 'SEK'
        }
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange?.startDate, dateRange?.endDate])

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
