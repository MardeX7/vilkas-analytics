import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { STORE_ID } from '@/config/storeConfig'

// Helper to fetch summary for a period
// KORJAUS: Käytä v_daily_sales-näkymää RLS-ongelman kiertämiseksi
async function fetchPeriodSummary(startDate, endDate) {
  // Hae peruslaskelmat v_daily_sales-näkymästä (ohittaa RLS-ongelmat)
  let viewQuery = supabase
    .from('v_daily_sales')
    .select('total_revenue, order_count, unique_customers, avg_order_value')
    .eq('store_id', STORE_ID)

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
    let ordersQuery = supabase
      .from('orders')
      .select('status, shipping_price, discount_amount, billing_email')
      .eq('store_id', STORE_ID)

    if (startDate) ordersQuery = ordersQuery.gte('creation_date', startDate)
    if (endDate) ordersQuery = ordersQuery.lte('creation_date', endDate + 'T23:59:59')

    const { data: allOrders } = await ordersQuery

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

// Helper to fetch gross margin data - REAL-TIME calculation from orders + products.cost_price
// Uses product_number (SKU) for matching since most line items don't have product_id
async function fetchGrossMargin(startDate, endDate) {
  let query = supabase
    .from('orders')
    .select(`
      id,
      grand_total,
      order_line_items (
        quantity,
        total_price,
        product_id,
        product_number
      )
    `)
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')

  if (startDate) query = query.gte('creation_date', startDate)
  if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')

  const { data: orders } = await query

  if (!orders || orders.length === 0) {
    return { grossProfit: 0, marginPercent: 0, totalCost: 0, totalRevenue: 0 }
  }

  // Collect all product_numbers (SKUs) from line items
  const productNumbers = new Set()
  orders.forEach(o => {
    o.order_line_items?.forEach(item => {
      if (item.product_number) productNumbers.add(item.product_number)
    })
  })

  // Fetch cost_price for all products by product_number (SKU)
  const { data: products } = await supabase
    .from('products')
    .select('id, product_number, cost_price')
    .eq('store_id', STORE_ID)
    .in('product_number', Array.from(productNumbers))

  // Build cost map by product_number (SKU)
  const costMapBySku = new Map()
  products?.forEach(p => {
    if (p.cost_price && p.product_number) {
      costMapBySku.set(p.product_number, p.cost_price)
    }
  })

  // Calculate totals
  let totalRevenue = 0
  let totalCost = 0

  orders.forEach(o => {
    o.order_line_items?.forEach(item => {
      const qty = item.quantity || 1
      const price = item.total_price || 0
      // Look up cost by SKU (product_number)
      const costPrice = costMapBySku.get(item.product_number) || 0

      totalRevenue += price
      totalCost += costPrice * qty
    })
  })

  const grossProfit = totalRevenue - totalCost
  const marginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // Nimetään marginRevenue erottamaan fetchPeriodSummary:n totalRevenue:sta
  return { grossProfit, marginPercent, totalCost, marginRevenue: totalRevenue }
}

// Helper to fetch daily gross margin data
// Uses product_number (SKU) for matching since most line items don't have product_id
async function fetchDailyMargin(startDate, endDate) {
  let query = supabase
    .from('orders')
    .select(`
      id,
      creation_date,
      order_line_items (
        quantity,
        total_price,
        product_number
      )
    `)
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')

  if (startDate) query = query.gte('creation_date', startDate)
  if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')

  const { data: orders } = await query

  if (!orders || orders.length === 0) {
    return []
  }

  // Collect all product_numbers (SKUs)
  const productNumbers = new Set()
  orders.forEach(o => {
    o.order_line_items?.forEach(item => {
      if (item.product_number) productNumbers.add(item.product_number)
    })
  })

  // Fetch cost_price for all products by SKU
  const { data: products } = await supabase
    .from('products')
    .select('product_number, cost_price')
    .eq('store_id', STORE_ID)
    .in('product_number', Array.from(productNumbers))

  const costMapBySku = new Map()
  products?.forEach(p => {
    if (p.cost_price && p.product_number) {
      costMapBySku.set(p.product_number, p.cost_price)
    }
  })

  // Group by date
  const dailyData = {}
  orders.forEach(o => {
    const date = o.creation_date.split('T')[0]
    if (!dailyData[date]) {
      dailyData[date] = { revenue: 0, cost: 0 }
    }
    o.order_line_items?.forEach(item => {
      const qty = item.quantity || 1
      const price = item.total_price || 0
      const costPrice = costMapBySku.get(item.product_number) || 0
      dailyData[date].revenue += price
      dailyData[date].cost += costPrice * qty
    })
  })

  // Convert to array with margin calculation
  return Object.entries(dailyData)
    .map(([date, data]) => ({
      sale_date: date,
      total_revenue: data.revenue,
      gross_profit: data.revenue - data.cost,
      margin_percent: data.revenue > 0 ? ((data.revenue - data.cost) / data.revenue) * 100 : 0
    }))
    .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
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

// Helper to fetch kit/bundle products share and margin
// Kit products are identified by name containing: paket, kit, set
// Uses product_number (SKU) for matching since most line items don't have product_id
async function fetchKitStats(startDate, endDate) {
  let query = supabase
    .from('orders')
    .select(`
      id,
      order_line_items (
        quantity,
        total_price,
        product_number,
        product_name
      )
    `)
    .eq('store_id', STORE_ID)
    .neq('status', 'cancelled')

  if (startDate) query = query.gte('creation_date', startDate)
  if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')

  const { data: orders } = await query

  if (!orders || orders.length === 0) {
    return { kitRevenue: 0, kitRevenuePercent: 0, kitGrossProfit: 0, kitMarginPercent: 0 }
  }

  // Collect all product_numbers (SKUs) from order_line_items
  const productNumbers = new Set()
  orders.forEach(o => {
    o.order_line_items?.forEach(item => {
      if (item.product_number) productNumbers.add(item.product_number)
    })
  })

  // Fetch cost_price for all products by SKU
  const { data: products } = await supabase
    .from('products')
    .select('product_number, cost_price, name')
    .eq('store_id', STORE_ID)
    .in('product_number', Array.from(productNumbers))

  const productMapBySku = new Map()
  products?.forEach(p => {
    if (p.product_number) {
      productMapBySku.set(p.product_number, { costPrice: p.cost_price || 0, name: p.name || '' })
    }
  })

  // Kit patterns: paket, kit, set (Swedish/English)
  const kitPattern = /paket|kit|set/i

  let totalRevenue = 0
  let kitRevenue = 0
  let totalCost = 0
  let kitCost = 0

  orders.forEach(o => {
    o.order_line_items?.forEach(item => {
      const qty = item.quantity || 1
      const price = item.total_price || 0
      const productInfo = productMapBySku.get(item.product_number) || { costPrice: 0, name: '' }
      const productName = item.product_name || productInfo.name || ''
      const costPrice = productInfo.costPrice
      const isKit = kitPattern.test(productName)

      totalRevenue += price
      totalCost += costPrice * qty

      if (isKit) {
        kitRevenue += price
        kitCost += costPrice * qty
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

      // Previous period top products for comparison
      let previousProductsQuery = null
      if (compare && previousStartDate && previousEndDate) {
        previousProductsQuery = supabase
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
          .gte('creation_date', previousStartDate)
          .lte('creation_date', previousEndDate + 'T23:59:59')
      }

      // Fetch product cost prices for margin calculation
      const productCostQuery = supabase
        .from('products')
        .select('product_number, cost_price')
        .eq('store_id', STORE_ID)

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
        supabase.from('v_weekly_sales').select('*').eq('store_id', STORE_ID).order('week_start', { ascending: false }).limit(12),
        supabase.from('v_monthly_sales').select('*').eq('store_id', STORE_ID).order('sale_month', { ascending: false }).limit(12),
        productsQuery,
        previousProductsQuery || Promise.resolve({ data: null }),
        paymentQuery,
        shippingQuery,
        supabase.from('v_weekday_analysis').select('*').eq('store_id', STORE_ID),
        supabase.from('v_hourly_analysis').select('*').eq('store_id', STORE_ID),
        fetchPeriodSummary(startDate, endDate),
        compare && previousStartDate ? fetchPeriodSummary(previousStartDate, previousEndDate) : Promise.resolve(null),
        previousDailyQuery || Promise.resolve({ data: null }),
        fetchGrossMargin(startDate, endDate),
        compare && previousStartDate ? fetchGrossMargin(previousStartDate, previousEndDate) : Promise.resolve(null),
        fetchItemsPerOrder(startDate, endDate),
        compare && previousStartDate ? fetchItemsPerOrder(previousStartDate, previousEndDate) : Promise.resolve({ avgItemsPerOrder: 0 }),
        fetchDailyMargin(startDate, endDate),
        compare && previousStartDate ? fetchDailyMargin(previousStartDate, previousEndDate) : Promise.resolve([]),
        fetchKitStats(startDate, endDate),
        compare && previousStartDate ? fetchKitStats(previousStartDate, previousEndDate) : Promise.resolve({ kitRevenuePercent: 0 }),
        productCostQuery
      ])

      // Build cost price map from products
      const costPriceMap = new Map()
      productCostRes.data?.forEach(p => {
        if (p.product_number && p.cost_price) {
          costPriceMap.set(p.product_number, p.cost_price)
        }
      })

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
              total_cost: 0,
              order_ids: new Set()
            })
          }
          const prod = productMap.get(key)
          const qty = item.quantity || 0
          const costPrice = costPriceMap.get(item.product_number) || 0
          prod.total_quantity += qty
          prod.total_revenue += item.total_price || 0
          prod.total_cost += costPrice * qty
          prod.order_ids.add(order.id)
        })
      })
      const topProducts = Array.from(productMap.values())
        .map(p => ({
          ...p,
          order_count: p.order_ids.size,
          gross_margin: p.total_revenue - p.total_cost,
          margin_percent: p.total_revenue > 0 ? ((p.total_revenue - p.total_cost) / p.total_revenue) * 100 : 0
        }))
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 10)

      // Aggregate previous period top products for comparison
      let previousTopProducts = []
      if (ordersForPreviousProducts?.data) {
        const prevProductMap = new Map()
        ordersForPreviousProducts.data.forEach(order => {
          order.order_line_items?.forEach(item => {
            const key = item.product_number || item.product_name
            if (!prevProductMap.has(key)) {
              prevProductMap.set(key, {
                product_name: item.product_name,
                product_number: item.product_number,
                total_quantity: 0,
                total_revenue: 0,
                total_cost: 0,
                order_ids: new Set()
              })
            }
            const prod = prevProductMap.get(key)
            const qty = item.quantity || 0
            const costPrice = costPriceMap.get(item.product_number) || 0
            prod.total_quantity += qty
            prod.total_revenue += item.total_price || 0
            prod.total_cost += costPrice * qty
            prod.order_ids.add(order.id)
          })
        })
        previousTopProducts = Array.from(prevProductMap.values())
          .map(p => ({
            ...p,
            order_count: p.order_ids.size,
            gross_margin: p.total_revenue - p.total_cost,
            margin_percent: p.total_revenue > 0 ? ((p.total_revenue - p.total_cost) / p.total_revenue) * 100 : 0
          }))
          .sort((a, b) => b.total_revenue - a.total_revenue)
      }

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
          currency: 'SEK'
        },
        previousSummary: previousSummary ? {
          ...previousSummary,
          marginPercent: previousGrossMargin?.marginPercent || 0,
          avgItemsPerOrder: previousItemsPerOrder?.avgItemsPerOrder || 0,
          kitRevenuePercent: previousKitStats?.kitRevenuePercent || 0,
          marginPerOrder: previousSummary.orderCount > 0 && previousGrossMargin
            ? previousGrossMargin.grossProfit / previousSummary.orderCount
            : 0,
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
