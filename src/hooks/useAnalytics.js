import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'
import { pricingFor, buildCostMap, priceOrderLines, marginTotals, isEstimatedMargin } from '@/lib/margin'

// Supabase caps every response at 1000 rows regardless of .limit(); a 90-day range has
// ~2 300 Automaalit orders, so every order-level figure below silently covered the first
// 1000 only. buildQuery must return a fresh query sorted on a unique key.
async function fetchAllRows(buildQuery, pageSize = 1000) {
  const rows = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
  }
  return rows
}

// Cost prices for the whole store: one small table (~500 rows) instead of an
// .in('product_number', ...) list that grows with the range until the URL is rejected
function fetchStoreProducts(storeId, columns) {
  return fetchAllRows(() => supabase
    .from('products')
    .select(columns)
    .eq('store_id', storeId)
    .order('id', { ascending: true }))
}

// Helper to fetch summary for a period
// KORJAUS: Käytä v_daily_sales-näkymää RLS-ongelman kiertämiseksi
async function fetchPeriodSummary(storeId, startDate, endDate) {
  // Hae peruslaskelmat v_daily_sales-näkymästä (ohittaa RLS-ongelmat)
  let viewQuery = supabase
    .from('v_daily_sales')
    .select('total_revenue, order_count, unique_customers, avg_order_value')
    .eq('store_id', storeId)

  if (startDate) viewQuery = viewQuery.gte('sale_date', startDate)
  if (endDate) viewQuery = viewQuery.lte('sale_date', endDate)

  const { data: dailyData } = await viewQuery

  // Aggregoi päivittäiset summat
  if (!dailyData || dailyData.length === 0) {
    return {
      totalRevenue: 0, orderCount: 0, uniqueCustomers: 0, avgOrderValue: 0,
      cancelledCount: 0, cancelledPercent: 0,
      totalShipping: 0, shippingPercent: 0,
      totalDiscount: 0, discountPercent: 0,
      returningCustomerPercent: 0
    }
  }

  const totalRevenue = dailyData.reduce((sum, d) => sum + (parseFloat(d.total_revenue) || 0), 0)
  const orderCount = dailyData.reduce((sum, d) => sum + (d.order_count || 0), 0)
  // unique_customers is approximate when summing daily - take max as estimate
  const uniqueCustomers = dailyData.reduce((sum, d) => sum + (d.unique_customers || 0), 0)
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0

  // Lisätiedot (cancelled, shipping, discount) - koita hakea orders-taulusta
  // Jos RLS estää, palauta 0
  let cancelledCount = 0
  let cancelledPercent = 0
  let totalShipping = 0
  let shippingPercent = 0
  let totalDiscount = 0
  let discountPercent = 0
  let returningCustomerPercent = 0

  try {
    const allOrders = await fetchAllRows(() => {
      let ordersQuery = supabase
        .from('orders')
        .select('id, status, shipping_price, discount_amount, billing_email')
        .eq('store_id', storeId)

      if (startDate) ordersQuery = ordersQuery.gte('creation_date', startDate)
      if (endDate) ordersQuery = ordersQuery.lte('creation_date', endDate + 'T23:59:59')
      return ordersQuery.order('id', { ascending: true })
    })

    if (allOrders && allOrders.length > 0) {
      const cancelledOrders = allOrders.filter(o => o.status === 'cancelled')
      const activeOrders = allOrders.filter(o => o.status !== 'cancelled')

      cancelledCount = cancelledOrders.length
      cancelledPercent = allOrders.length > 0 ? (cancelledCount / allOrders.length) * 100 : 0

      totalShipping = activeOrders.reduce((sum, o) => sum + (o.shipping_price || 0), 0)
      shippingPercent = totalRevenue > 0 ? (totalShipping / totalRevenue) * 100 : 0

      totalDiscount = activeOrders.reduce((sum, o) => sum + (o.discount_amount || 0), 0)
      discountPercent = totalRevenue > 0 ? (totalDiscount / totalRevenue) * 100 : 0

      // Returning customers
      const customerOrderCount = {}
      activeOrders.forEach(o => {
        if (o.billing_email) {
          customerOrderCount[o.billing_email] = (customerOrderCount[o.billing_email] || 0) + 1
        }
      })
      const returningCustomers = Object.values(customerOrderCount).filter(count => count > 1).length
      const totalCustomers = Object.keys(customerOrderCount).length
      returningCustomerPercent = totalCustomers > 0 ? (returningCustomers / totalCustomers) * 100 : 0
    }
  } catch (err) {
    // RLS estää orders-taulun haun - jatka ilman lisätietoja
    console.log('Could not fetch additional order details:', err.message)
  }

  return {
    totalRevenue, orderCount, uniqueCustomers, avgOrderValue,
    cancelledCount, cancelledPercent,
    totalShipping, shippingPercent,
    totalDiscount, discountPercent,
    returningCustomerPercent
  }
}

// Orders in the range with the columns the margin needs: the order's VAT split and each
// line's prices. Margin itself comes from src/lib/margin.js, the definition the KPI
// snapshots on the Indicators page use, so both pages show the same margin.
function fetchOrdersForMargin(storeId, startDate, endDate, extraColumns = '') {
  return fetchAllRows(() => {
    let query = supabase
      .from('orders')
      .select(`
        id, grand_total, total_before_tax, total_tax${extraColumns},
        order_line_items (quantity, unit_price, total_price, product_number, product_name)
      `)
      .eq('store_id', storeId)
      .neq('status', 'cancelled')

    if (startDate) query = query.gte('creation_date', startDate)
    if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')
    return query.order('id', { ascending: true })
  })
}

// Gross margin for the period (VAT 0 %, like the rest of the sales page)
async function fetchGrossMargin(storeId, startDate, endDate, pricing) {
  const [orders, products] = await Promise.all([
    fetchOrdersForMargin(storeId, startDate, endDate),
    fetchStoreProducts(storeId, 'id, product_number, cost_price')
  ])

  if (orders.length === 0) {
    return { grossProfit: 0, marginPercent: 0, totalCost: 0, marginRevenue: 0, isEstimated: false }
  }

  const m = marginTotals(orders, buildCostMap(products), pricing)
  // Mostly priced by the 60 % assumption rather than real cost prices
  const isEstimated = isEstimatedMargin(m)

  // Nimetään marginRevenue erottamaan fetchPeriodSummary:n totalRevenue:sta
  return { grossProfit: m.grossProfit, marginPercent: m.marginPercent, totalCost: m.cost, marginRevenue: m.sales, isEstimated }
}

// Daily gross margin, same definition as fetchGrossMargin; days are UTC dates like v_daily_sales
async function fetchDailyMargin(storeId, startDate, endDate, pricing) {
  const [orders, products] = await Promise.all([
    fetchOrdersForMargin(storeId, startDate, endDate, ', creation_date'),
    fetchStoreProducts(storeId, 'id, product_number, cost_price')
  ])

  if (orders.length === 0) {
    return []
  }

  const costMap = buildCostMap(products)
  const byDate = {}
  orders.forEach(o => {
    const date = o.creation_date.split('T')[0]
    ;(byDate[date] = byDate[date] || []).push(o)
  })

  return Object.entries(byDate)
    .map(([date, dayOrders]) => {
      const m = marginTotals(dayOrders, costMap, pricing)
      return { sale_date: date, total_revenue: m.sales, gross_profit: m.grossProfit, margin_percent: m.marginPercent }
    })
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
}

// Helper to fetch average items per order
async function fetchItemsPerOrder(storeId, startDate, endDate) {
  const orders = await fetchAllRows(() => {
    let query = supabase
      .from('orders')
    .select(`
        id,
        order_line_items (quantity)
      `)
      .eq('store_id', storeId)
      .neq('status', 'cancelled')

    if (startDate) query = query.gte('creation_date', startDate)
    if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')
    return query.order('id', { ascending: true })
  })

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

// Helper to fetch kit/bundle products share and margin
// Kit products are identified by name containing: paket, kit, set
async function fetchKitStats(storeId, startDate, endDate, pricing) {
  const [orders, products] = await Promise.all([
    fetchOrdersForMargin(storeId, startDate, endDate),
    fetchStoreProducts(storeId, 'id, product_number, cost_price, name')
  ])

  if (orders.length === 0) {
    return { kitRevenue: 0, kitRevenuePercent: 0, kitGrossProfit: 0, kitMarginPercent: 0 }
  }

  const costMap = buildCostMap(products)
  const nameBySku = new Map(products.filter(p => p.product_number).map(p => [p.product_number, p.name || '']))

  // Kit patterns: paket, kit, set (Swedish/English)
  const kitPattern = /paket|kit|set/i

  let totalRevenue = 0
  let kitRevenue = 0
  let kitCost = 0

  orders.forEach(o => {
    const items = o.order_line_items || []
    if (!items.length) return
    priceOrderLines(o, items, costMap, pricing).forEach(({ item, sales, cost }) => {
      totalRevenue += sales
      const productName = item.product_name || nameBySku.get(item.product_number) || ''
      if (kitPattern.test(productName)) {
        kitRevenue += sales
        kitCost += cost
      }
    })
  })

  const kitGrossProfit = kitRevenue - kitCost
  const kitMarginPercent = kitRevenue > 0 ? (kitGrossProfit / kitRevenue) * 100 : 0
  const kitRevenuePercent = totalRevenue > 0 ? (kitRevenue / totalRevenue) * 100 : 0

  return {
    kitRevenue,
    kitRevenuePercent,
    kitGrossProfit,
    kitMarginPercent
  }
}

export function useAnalytics(dateRange = null) {
  const { storeId, currency, ready } = useCurrentShop()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    dailySales: [],
    dailyMargin: [],
    previousDailySales: [],
    previousDailyMargin: [],
    weeklySales: [],
    monthlySales: [],
    topProducts: [],
    previousTopProducts: [],
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
    if (!ready || !storeId) return

    setLoading(true)
    setError(null)

    try {
      // Build date filter
      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate
      const compare = dateRange?.compare
      const previousStartDate = dateRange?.previousStartDate
      const previousEndDate = dateRange?.previousEndDate
      const pricing = pricingFor(currency)

      // Fetch daily sales with date filter
      let dailyQuery = supabase.from('v_daily_sales').select('*').eq('store_id', storeId)
      if (startDate) dailyQuery = dailyQuery.gte('sale_date', startDate)
      if (endDate) dailyQuery = dailyQuery.lte('sale_date', endDate)
      dailyQuery = dailyQuery.order('sale_date', { ascending: false })

      // Fetch previous period daily sales for comparison
      let previousDailyQuery = null
      if (compare && previousStartDate && previousEndDate) {
        previousDailyQuery = supabase.from('v_daily_sales').select('*').eq('store_id', storeId)
          .gte('sale_date', previousStartDate)
          .lte('sale_date', previousEndDate)
          .order('sale_date', { ascending: false })
      }

      // For other data, we need to query orders directly with date filter
      // Top products in date range
      // Paginated order reads resolve to { data } so the consumers below stay as they were
      const allRows = (build) => fetchAllRows(() => build().order('id', { ascending: true })).then(data => ({ data }))

      const productsQuery = fetchOrdersForMargin(storeId, startDate, endDate).then(data => ({ data }))

      // Previous period top products for comparison
      let previousProductsQuery = null
      if (compare && previousStartDate && previousEndDate) {
        previousProductsQuery = fetchOrdersForMargin(storeId, previousStartDate, previousEndDate).then(data => ({ data }))
      }

      // Fetch product cost prices for margin calculation
      const productCostQuery = fetchStoreProducts(storeId, 'id, product_number, cost_price').then(data => ({ data }))

      // Payment methods in date range
      const paymentQuery = allRows(() => {
        let q = supabase
          .from('orders')
          .select('id, payment_method, grand_total, total_before_tax, total_tax')
          .eq('store_id', storeId)
          .neq('status', 'cancelled')
        if (startDate) q = q.gte('creation_date', startDate)
        if (endDate) q = q.lte('creation_date', endDate + 'T23:59:59')
        return q
      })

      // Shipping methods in date range
      const shippingQuery = allRows(() => {
        let q = supabase
          .from('orders')
          .select('id, shipping_method, grand_total, total_before_tax, total_tax')
          .eq('store_id', storeId)
          .neq('status', 'cancelled')
        if (startDate) q = q.gte('creation_date', startDate)
        if (endDate) q = q.lte('creation_date', endDate + 'T23:59:59')
        return q
      })

      const [
        dailyRes,
        weeklyRes,
        monthlyRes,
        ordersForProducts,
        ordersForPreviousProducts,
        ordersForPayment,
        ordersForShipping,
        weekdayRes,
        hourlyRes,
        currentSummary,
        previousSummary,
        previousDailyRes,
        grossMargin,
        previousGrossMargin,
        itemsPerOrder,
        previousItemsPerOrder,
        dailyMarginData,
        previousDailyMarginData,
        kitStats,
        previousKitStats,
        productCostRes
      ] = await Promise.all([
        dailyQuery,
        supabase.from('v_weekly_sales').select('*').eq('store_id', storeId).order('week_start', { ascending: false }).limit(12),
        supabase.from('v_monthly_sales').select('*').eq('store_id', storeId).order('sale_month', { ascending: false }).limit(12),
        productsQuery,
        previousProductsQuery || Promise.resolve({ data: null }),
        paymentQuery,
        shippingQuery,
        supabase.from('v_weekday_analysis').select('*').eq('store_id', storeId),
        supabase.from('v_hourly_analysis').select('*').eq('store_id', storeId),
        fetchPeriodSummary(storeId, startDate, endDate),
        compare && previousStartDate ? fetchPeriodSummary(storeId, previousStartDate, previousEndDate) : Promise.resolve(null),
        previousDailyQuery || Promise.resolve({ data: null }),
        fetchGrossMargin(storeId, startDate, endDate, pricing),
        compare && previousStartDate ? fetchGrossMargin(storeId, previousStartDate, previousEndDate, pricing) : Promise.resolve(null),
        fetchItemsPerOrder(storeId, startDate, endDate),
        compare && previousStartDate ? fetchItemsPerOrder(storeId, previousStartDate, previousEndDate) : Promise.resolve({ avgItemsPerOrder: 0 }),
        fetchDailyMargin(storeId, startDate, endDate, pricing),
        compare && previousStartDate ? fetchDailyMargin(storeId, previousStartDate, previousEndDate, pricing) : Promise.resolve([]),
        fetchKitStats(storeId, startDate, endDate, pricing),
        compare && previousStartDate ? fetchKitStats(storeId, previousStartDate, previousEndDate, pricing) : Promise.resolve({ kitRevenuePercent: 0 }),
        productCostQuery
      ])

      // Top products: net sales and margin per product, same definition as the margin card
      const costPriceMap = buildCostMap(productCostRes.data)
      const aggregateProducts = (orders) => {
        const productMap = new Map()
        orders.forEach(order => {
          const items = order.order_line_items || []
          if (!items.length) return
          priceOrderLines(order, items, costPriceMap, pricing).forEach(({ item, sales, cost }) => {
            const key = item.product_number || item.product_name
            if (!productMap.has(key)) {
              productMap.set(key, {
                product_name: item.product_name,
                product_number: item.product_number,
                total_quantity: 0,
                total_revenue: 0,
                total_cost: 0,
                order_ids: new Set()
              })
            }
            const prod = productMap.get(key)
            prod.total_quantity += item.quantity || 0
            prod.total_revenue += sales
            prod.total_cost += cost
            prod.order_ids.add(order.id)
          })
        })
        return Array.from(productMap.values())
          .map(p => ({
            ...p,
            order_count: p.order_ids.size,
            gross_margin: p.total_revenue - p.total_cost,
            margin_percent: p.total_revenue > 0 ? ((p.total_revenue - p.total_cost) / p.total_revenue) * 100 : 0
          }))
          .sort((a, b) => b.total_revenue - a.total_revenue)
      }
      const topProducts = aggregateProducts(ordersForProducts.data || []).slice(0, 10)
      // Aggregate previous period top products for comparison
      const previousTopProducts = ordersForPreviousProducts?.data ? aggregateProducts(ordersForPreviousProducts.data) : []

      // Aggregate payment methods
      const paymentMap = new Map()
      ordersForPayment.data?.forEach(order => {
        const method = order.payment_method || 'Unknown'
        if (!paymentMap.has(method)) {
          paymentMap.set(method, { payment_method: method, order_count: 0, total_revenue: 0 })
        }
        const pm = paymentMap.get(method)
        pm.order_count += 1
        pm.total_revenue += order.total_before_tax || (order.grand_total - (order.total_tax || 0)) || 0
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
        sm.total_revenue += order.total_before_tax || (order.grand_total - (order.total_tax || 0)) || 0
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
        dailyMargin: dailyMarginData || [],
        previousDailySales: previousDailyRes?.data || [],
        previousDailyMargin: previousDailyMarginData || [],
        weeklySales: weeklyRes.data || [],
        monthlySales: monthlyRes.data || [],
        topProducts,
        previousTopProducts,
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
          ...kitStats,
          // Kate per tilaus (gross profit / order count)
          marginPerOrder: currentSummary.orderCount > 0 ? grossMargin.grossProfit / currentSummary.orderCount : 0,
          currency
        },
        previousSummary: previousSummary ? {
          ...previousSummary,
          marginPercent: previousGrossMargin?.marginPercent || 0,
          isEstimated: previousGrossMargin?.isEstimated || false,
          avgItemsPerOrder: previousItemsPerOrder?.avgItemsPerOrder || 0,
          kitRevenuePercent: previousKitStats?.kitRevenuePercent || 0,
          marginPerOrder: previousSummary.orderCount > 0 && previousGrossMargin
            ? previousGrossMargin.grossProfit / previousSummary.orderCount
            : 0,
          currency
        } : null,
        comparison
      })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [storeId, currency, ready, dateRange?.startDate, dateRange?.endDate, dateRange?.compare, dateRange?.previousStartDate, dateRange?.previousEndDate])

  useEffect(() => {
    fetchAllData()
  }, [fetchAllData])

  return { ...data, loading, error, refresh: fetchAllData }
}

// KPI summary hook
export function useKPISummary() {
  const { storeId, ready } = useCurrentShop()
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState(null)

  useEffect(() => {
    if (!ready || !storeId) return

    async function fetch() {
      const { data: monthly } = await supabase
        .from('v_monthly_sales')
        .select('*')
        .eq('store_id', storeId)
        .order('sale_month', { ascending: false })
        .limit(2)

      const { data: daily } = await supabase
        .from('v_daily_sales')
        .select('*')
        .eq('store_id', storeId)
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
        currency: thisMonth?.currency || 'EUR'
      })
      setLoading(false)
    }
    fetch()
  }, [storeId, ready])

  return { kpi, loading }
}
