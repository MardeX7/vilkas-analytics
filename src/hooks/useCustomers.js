import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { STORE_ID } from '@/config/storeConfig'

/**
 * Hook for customer analytics data
 * Provides B2B vs B2C breakdown, new vs returning, and top customers
 */
export function useCustomers(dateRange) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch orders with customer data
  useEffect(() => {
    async function fetchOrders() {
      setLoading(true)
      setError(null)

      try {
        let query = supabase
          .from('orders')
          .select('id, is_b2b, is_b2b_soft, grand_total, total_before_tax, billing_email, billing_company, billing_country, billing_city, billing_first_name, billing_last_name, creation_date, customer_id, locale, note')
          .eq('store_id', STORE_ID)
          .order('creation_date', { ascending: false })

        // Apply date filter if provided
        if (dateRange?.startDate) {
          query = query.gte('creation_date', dateRange.startDate)
        }
        if (dateRange?.endDate) {
          query = query.lte('creation_date', dateRange.endDate + 'T23:59:59')
        }

        const { data, error: fetchError } = await query

        if (fetchError) throw fetchError
        setOrders(data || [])
      } catch (err) {
        console.error('Failed to fetch customer data:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchOrders()
  }, [dateRange?.startDate, dateRange?.endDate])

  // Computed analytics
  const analytics = useMemo(() => {
    if (!orders.length) {
      return {
        totalOrders: 0,
        totalRevenue: 0,
        uniqueCustomers: 0,
        b2b: { orders: 0, revenue: 0, aov: 0, customers: 0 },
        b2c: { orders: 0, revenue: 0, aov: 0, customers: 0 },
        newCustomers: { count: 0, revenue: 0, percentage: 0 },
        returningCustomers: { count: 0, revenue: 0, percentage: 0 },
        returnRate: 0,
        topCustomers: [],
        countries: [],
        monthlyTrend: []
      }
    }

    // Aggregate by email
    const customerMap = {}
    orders.forEach(order => {
      const email = (order.billing_email || '').toLowerCase()
      if (!email) return

      if (!customerMap[email]) {
        customerMap[email] = {
          email,
          orders: 0,
          revenue: 0,
          isB2B: order.is_b2b || order.is_b2b_soft,
          company: order.billing_company,
          firstName: order.billing_first_name,
          lastName: order.billing_last_name,
          country: order.billing_country,
          city: order.billing_city,
          firstOrder: order.creation_date,
          lastOrder: order.creation_date
        }
      }

      customerMap[email].orders++
      customerMap[email].revenue += order.grand_total || 0
      if (order.creation_date < customerMap[email].firstOrder) {
        customerMap[email].firstOrder = order.creation_date
      }
      if (order.creation_date > customerMap[email].lastOrder) {
        customerMap[email].lastOrder = order.creation_date
      }
    })

    const customers = Object.values(customerMap)

    // B2B vs B2C
    const b2bCustomers = customers.filter(c => c.isB2B)
    const b2cCustomers = customers.filter(c => !c.isB2B)

    const b2bOrders = orders.filter(o => o.is_b2b || o.is_b2b_soft)
    const b2cOrders = orders.filter(o => !o.is_b2b && !o.is_b2b_soft)

    const b2bRevenue = b2bOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)
    const b2cRevenue = b2cOrders.reduce((sum, o) => sum + (o.grand_total || 0), 0)

    // New vs Returning (1 order = new, 2+ = returning)
    const newCust = customers.filter(c => c.orders === 1)
    const returningCust = customers.filter(c => c.orders > 1)

    const newRevenue = newCust.reduce((sum, c) => sum + c.revenue, 0)
    const returningRevenue = returningCust.reduce((sum, c) => sum + c.revenue, 0)
    const totalRevenue = newRevenue + returningRevenue

    // Top customers by LTV
    const topCustomers = customers
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20)
      .map((c, i) => {
        // For B2B: show company name, for B2C: show full name
        let displayName = ''
        if (c.isB2B && c.company) {
          displayName = c.company
        } else {
          const firstName = c.firstName || ''
          const lastName = c.lastName || ''
          displayName = `${firstName} ${lastName}`.trim()
        }
        // Fallback to anonymized email if no name available
        if (!displayName) {
          displayName = c.email.slice(0, 2) + '***' + c.email.slice(-4)
        }

        return {
          rank: i + 1,
          id: displayName,
          name: displayName,
          company: c.company,
          email: c.email,
          orders: c.orders,
          revenue: c.revenue,
          aov: c.revenue / c.orders,
          isB2B: c.isB2B,
          country: c.country,
          daysSinceLastOrder: Math.floor((Date.now() - new Date(c.lastOrder).getTime()) / (1000 * 60 * 60 * 24))
        }
      })

    // Countries
    const countryMap = {}
    orders.forEach(o => {
      const country = o.billing_country || 'Unknown'
      if (!countryMap[country]) {
        countryMap[country] = { orders: 0, revenue: 0 }
      }
      countryMap[country].orders++
      countryMap[country].revenue += o.grand_total || 0
    })

    const countries = Object.entries(countryMap)
      .map(([country, data]) => ({
        country,
        orders: data.orders,
        revenue: data.revenue,
        percentage: Math.round((data.orders / orders.length) * 100)
      }))
      .sort((a, b) => b.orders - a.orders)

    // Monthly trend (new vs returning)
    const monthlyMap = {}
    orders.forEach(order => {
      const month = order.creation_date?.slice(0, 7) // YYYY-MM
      if (!month) return

      const email = (order.billing_email || '').toLowerCase()
      const customer = customerMap[email]
      const isReturning = customer && customer.orders > 1

      if (!monthlyMap[month]) {
        monthlyMap[month] = { month, newRevenue: 0, returningRevenue: 0, newOrders: 0, returningOrders: 0 }
      }

      if (isReturning) {
        monthlyMap[month].returningRevenue += order.grand_total || 0
        monthlyMap[month].returningOrders++
      } else {
        monthlyMap[month].newRevenue += order.grand_total || 0
        monthlyMap[month].newOrders++
      }
    })

    const monthlyTrend = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month))

    // PHASE 2: Customer Lifecycle Analysis
    // Analyze 1st → 2nd → 3rd order conversion funnel
    const orderCounts = customers.map(c => c.orders)
    const with1Order = orderCounts.filter(n => n >= 1).length
    const with2Orders = orderCounts.filter(n => n >= 2).length
    const with3Orders = orderCounts.filter(n => n >= 3).length
    const with4PlusOrders = orderCounts.filter(n => n >= 4).length

    const lifecycle = {
      funnel: [
        { step: 1, label: '1st', count: with1Order, rate: 100 },
        { step: 2, label: '2nd', count: with2Orders, rate: with1Order > 0 ? Math.round((with2Orders / with1Order) * 100) : 0 },
        { step: 3, label: '3rd', count: with3Orders, rate: with2Orders > 0 ? Math.round((with3Orders / with2Orders) * 100) : 0 },
        { step: 4, label: '4+', count: with4PlusOrders, rate: with3Orders > 0 ? Math.round((with4PlusOrders / with3Orders) * 100) : 0 }
      ],
      dropoffs: {
        firstToSecond: with1Order - with2Orders,
        firstToSecondRate: with1Order > 0 ? Math.round(((with1Order - with2Orders) / with1Order) * 100) : 0,
        secondToThird: with2Orders - with3Orders,
        secondToThirdRate: with2Orders > 0 ? Math.round(((with2Orders - with3Orders) / with2Orders) * 100) : 0
      }
    }

    // PHASE 2: LTV by Segment (B2B vs B2C)
    const b2bLTV = b2bCustomers.length > 0
      ? Math.round(b2bCustomers.reduce((sum, c) => sum + c.revenue, 0) / b2bCustomers.length)
      : 0
    const b2cLTV = b2cCustomers.length > 0
      ? Math.round(b2cCustomers.reduce((sum, c) => sum + c.revenue, 0) / b2cCustomers.length)
      : 0

    // Average orders per customer by segment
    const b2bAvgOrders = b2bCustomers.length > 0
      ? (b2bCustomers.reduce((sum, c) => sum + c.orders, 0) / b2bCustomers.length).toFixed(1)
      : '0'
    const b2cAvgOrders = b2cCustomers.length > 0
      ? (b2cCustomers.reduce((sum, c) => sum + c.orders, 0) / b2cCustomers.length).toFixed(1)
      : '0'

    // Time between orders (for returning customers)
    const timeBetweenOrders = []
    returningCust.forEach(c => {
      const custOrders = orders
        .filter(o => (o.billing_email || '').toLowerCase() === c.email)
        .sort((a, b) => new Date(a.creation_date) - new Date(b.creation_date))

      for (let i = 1; i < custOrders.length; i++) {
        const daysBetween = Math.floor(
          (new Date(custOrders[i].creation_date) - new Date(custOrders[i-1].creation_date)) / (1000 * 60 * 60 * 24)
        )
        timeBetweenOrders.push(daysBetween)
      }
    })

    const avgDaysBetweenOrders = timeBetweenOrders.length > 0
      ? Math.round(timeBetweenOrders.reduce((a, b) => a + b, 0) / timeBetweenOrders.length)
      : 0

    const ltvAnalysis = {
      b2b: { ltv: b2bLTV, avgOrders: b2bAvgOrders, customers: b2bCustomers.length },
      b2c: { ltv: b2cLTV, avgOrders: b2cAvgOrders, customers: b2cCustomers.length },
      ltvDifference: b2cLTV > 0 ? Math.round(((b2bLTV - b2cLTV) / b2cLTV) * 100) : 0,
      avgDaysBetweenOrders,
      avgOrdersPerCustomer: customers.length > 0
        ? (orders.length / customers.length).toFixed(1)
        : '0'
    }

    // Market/Locale Segmentation
    const localeMap = {}
    orders.forEach(o => {
      const locale = o.locale || 'unknown'
      if (!localeMap[locale]) {
        localeMap[locale] = { orders: 0, revenue: 0, customers: new Set() }
      }
      localeMap[locale].orders++
      localeMap[locale].revenue += o.grand_total || 0
      if (o.billing_email) {
        localeMap[locale].customers.add(o.billing_email.toLowerCase())
      }
    })

    const markets = Object.entries(localeMap)
      .filter(([locale]) => locale !== 'unknown') // Exclude orders without locale data
      .map(([locale, data]) => {
        // Parse locale to get language
        const [lang] = locale.split('_')
        const marketName = locale === 'sv_SE' ? 'Sverige'
          : locale === 'en_GB' ? 'UK/International'
          : locale === 'fi_FI' ? 'Finland'
          : locale === 'no_NO' ? 'Norge'
          : locale === 'da_DK' ? 'Danmark'
          : locale === 'de_DE' ? 'Tyskland'
          : locale

        return {
          locale,
          name: marketName,
          language: lang || 'unknown',
          orders: data.orders,
          revenue: data.revenue,
          customers: data.customers.size,
          percentage: Math.round((data.orders / orders.length) * 100),
          aov: data.orders > 0 ? Math.round(data.revenue / data.orders) : 0
        }
      })
      .sort((a, b) => b.orders - a.orders)

    // Customer Notes/Feedback Analysis
    const ordersWithNotes = orders.filter(o => o.note && o.note.trim())
    const customerNotes = ordersWithNotes.map(o => ({
      orderDate: o.creation_date,
      note: o.note.trim(),
      isB2B: o.is_b2b || o.is_b2b_soft,
      company: o.billing_company,
      customerName: `${o.billing_first_name || ''} ${o.billing_last_name || ''}`.trim() || 'Anonym',
      total: o.grand_total
    })).sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))

    const notesStats = {
      totalWithNotes: ordersWithNotes.length,
      percentage: orders.length > 0 ? Math.round((ordersWithNotes.length / orders.length) * 100) : 0,
      recentNotes: customerNotes.slice(0, 10)
    }

    // Data quality: how many orders have email (needed for accurate customer count)
    const ordersWithEmail = orders.filter(o => o.billing_email && o.billing_email.trim())
    const dataQuality = {
      ordersWithEmail: ordersWithEmail.length,
      ordersWithoutEmail: orders.length - ordersWithEmail.length,
      emailCoverage: orders.length > 0 ? Math.round((ordersWithEmail.length / orders.length) * 100) : 100,
      isReliable: orders.length === 0 || (ordersWithEmail.length / orders.length) >= 0.9 // 90%+ = reliable
    }

    return {
      totalOrders: orders.length,
      totalRevenue,
      uniqueCustomers: customers.length,
      dataQuality,

      b2b: {
        orders: b2bOrders.length,
        revenue: b2bRevenue,
        aov: b2bOrders.length > 0 ? Math.round(b2bRevenue / b2bOrders.length) : 0,
        customers: b2bCustomers.length,
        percentage: Math.round((b2bOrders.length / orders.length) * 100)
      },

      b2c: {
        orders: b2cOrders.length,
        revenue: b2cRevenue,
        aov: b2cOrders.length > 0 ? Math.round(b2cRevenue / b2cOrders.length) : 0,
        customers: b2cCustomers.length,
        percentage: Math.round((b2cOrders.length / orders.length) * 100)
      },

      newCustomers: {
        count: newCust.length,
        revenue: newRevenue,
        percentage: totalRevenue > 0 ? Math.round((newRevenue / totalRevenue) * 100) : 0,
        aov: newCust.length > 0 ? Math.round(newRevenue / newCust.length) : 0
      },

      returningCustomers: {
        count: returningCust.length,
        revenue: returningRevenue,
        percentage: totalRevenue > 0 ? Math.round((returningRevenue / totalRevenue) * 100) : 0,
        ltv: returningCust.length > 0 ? Math.round(returningRevenue / returningCust.length) : 0
      },

      returnRate: customers.length > 0 ? Math.round((returningCust.length / customers.length) * 100) : 0,
      ltvMultiplier: newCust.length > 0 && returningCust.length > 0
        ? ((returningRevenue / returningCust.length) / (newRevenue / newCust.length)).toFixed(1)
        : '0',

      topCustomers,
      countries,
      monthlyTrend,
      lifecycle,
      ltvAnalysis,
      markets,
      notesStats
    }
  }, [orders])

  return {
    ...analytics,
    loading,
    error,
    refresh: () => {
      setOrders([])
      setLoading(true)
    }
  }
}

export default useCustomers
