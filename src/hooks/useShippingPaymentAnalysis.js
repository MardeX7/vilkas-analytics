import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * useShippingPaymentAnalysis - Hook for shipping and payment method cross-analysis
 *
 * Analyzes:
 * - Which shipping methods are used with which order sizes
 * - Which payment methods are used with which order sizes
 * - Cross-tabulation of shipping vs payment methods
 * - Average order value by shipping/payment combination
 */
export function useShippingPaymentAnalysis(dateRange = null) {
  const { storeId, ready, currency, currencySymbol } = useCurrentShop()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    shippingByOrderSize: [],
    paymentByOrderSize: [],
    crossAnalysis: [],
    shippingSummary: [],
    paymentSummary: [],
    insights: []
  })

  const fetchAnalysis = useCallback(async () => {
    if (!ready || !storeId) return

    setLoading(true)
    setError(null)

    try {
      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate

      // Fetch orders with shipping and payment info
      let query = supabase
        .from('orders')
        .select('id, grand_total, shipping_method, payment_method, creation_date')
        .eq('store_id', storeId)
        .neq('status', 'cancelled')

      if (startDate) query = query.gte('creation_date', startDate)
      if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')

      const { data: orders, error: ordError } = await query

      if (ordError) throw ordError

      if (!orders || orders.length === 0) {
        setData({
          shippingByOrderSize: [],
          paymentByOrderSize: [],
          crossAnalysis: [],
          shippingSummary: [],
          paymentSummary: [],
          insights: []
        })
        setLoading(false)
        return
      }

      // Define order size buckets
      const getOrderSizeBucket = (amount) => {
        if (amount < 500) return `< 500 ${currency}`
        if (amount < 1000) return `500-999 ${currency}`
        if (amount < 2000) return `1000-1999 ${currency}`
        if (amount < 5000) return `2000-4999 ${currency}`
        return `5000+ ${currency}`
      }

      const bucketOrder = [`< 500 ${currency}`, `500-999 ${currency}`, `1000-1999 ${currency}`, `2000-4999 ${currency}`, `5000+ ${currency}`]

      // 1. Shipping by order size
      const shippingMap = new Map()
      orders.forEach(o => {
        const method = o.shipping_method || 'Tuntematon'
        const bucket = getOrderSizeBucket(o.grand_total)
        const key = `${method}|${bucket}`

        if (!shippingMap.has(key)) {
          shippingMap.set(key, {
            method,
            bucket,
            count: 0,
            totalValue: 0
          })
        }
        const entry = shippingMap.get(key)
        entry.count++
        entry.totalValue += o.grand_total || 0
      })

      const shippingByOrderSize = Array.from(shippingMap.values())
        .map(e => ({
          ...e,
          avgValue: e.count > 0 ? e.totalValue / e.count : 0
        }))
        .sort((a, b) => {
          const methodDiff = a.method.localeCompare(b.method)
          if (methodDiff !== 0) return methodDiff
          return bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket)
        })

      // 2. Payment by order size
      const paymentMap = new Map()
      orders.forEach(o => {
        const method = o.payment_method || 'Tuntematon'
        const bucket = getOrderSizeBucket(o.grand_total)
        const key = `${method}|${bucket}`

        if (!paymentMap.has(key)) {
          paymentMap.set(key, {
            method,
            bucket,
            count: 0,
            totalValue: 0
          })
        }
        const entry = paymentMap.get(key)
        entry.count++
        entry.totalValue += o.grand_total || 0
      })

      const paymentByOrderSize = Array.from(paymentMap.values())
        .map(e => ({
          ...e,
          avgValue: e.count > 0 ? e.totalValue / e.count : 0
        }))
        .sort((a, b) => {
          const methodDiff = a.method.localeCompare(b.method)
          if (methodDiff !== 0) return methodDiff
          return bucketOrder.indexOf(a.bucket) - bucketOrder.indexOf(b.bucket)
        })

      // 3. Cross-analysis: shipping x payment
      const crossMap = new Map()
      orders.forEach(o => {
        const shipping = o.shipping_method || 'Tuntematon'
        const payment = o.payment_method || 'Tuntematon'
        const key = `${shipping}|${payment}`

        if (!crossMap.has(key)) {
          crossMap.set(key, {
            shipping,
            payment,
            count: 0,
            totalValue: 0
          })
        }
        const entry = crossMap.get(key)
        entry.count++
        entry.totalValue += o.grand_total || 0
      })

      const crossAnalysis = Array.from(crossMap.values())
        .map(e => ({
          ...e,
          avgValue: e.count > 0 ? e.totalValue / e.count : 0,
          percentage: (e.count / orders.length) * 100
        }))
        .sort((a, b) => b.count - a.count)

      // 4. Shipping summary
      const shippingSummaryMap = new Map()
      orders.forEach(o => {
        const method = o.shipping_method || 'Tuntematon'
        if (!shippingSummaryMap.has(method)) {
          shippingSummaryMap.set(method, { method, count: 0, totalValue: 0, minValue: Infinity, maxValue: 0 })
        }
        const entry = shippingSummaryMap.get(method)
        entry.count++
        entry.totalValue += o.grand_total || 0
        entry.minValue = Math.min(entry.minValue, o.grand_total || 0)
        entry.maxValue = Math.max(entry.maxValue, o.grand_total || 0)
      })

      const shippingSummary = Array.from(shippingSummaryMap.values())
        .map(e => ({
          ...e,
          avgValue: e.count > 0 ? e.totalValue / e.count : 0,
          percentage: (e.count / orders.length) * 100
        }))
        .sort((a, b) => b.count - a.count)

      // 5. Payment summary
      const paymentSummaryMap = new Map()
      orders.forEach(o => {
        const method = o.payment_method || 'Tuntematon'
        if (!paymentSummaryMap.has(method)) {
          paymentSummaryMap.set(method, { method, count: 0, totalValue: 0, minValue: Infinity, maxValue: 0 })
        }
        const entry = paymentSummaryMap.get(method)
        entry.count++
        entry.totalValue += o.grand_total || 0
        entry.minValue = Math.min(entry.minValue, o.grand_total || 0)
        entry.maxValue = Math.max(entry.maxValue, o.grand_total || 0)
      })

      const paymentSummary = Array.from(paymentSummaryMap.values())
        .map(e => ({
          ...e,
          avgValue: e.count > 0 ? e.totalValue / e.count : 0,
          percentage: (e.count / orders.length) * 100
        }))
        .sort((a, b) => b.count - a.count)

      // 6. Generate insights
      const insights = []

      // Highest AOV shipping method
      const highestAovShipping = shippingSummary.reduce((max, s) =>
        s.avgValue > (max?.avgValue || 0) ? s : max, null)
      if (highestAovShipping) {
        insights.push({
          type: 'shipping_aov',
          title: 'Korkein keskitilaus toimitustavan mukaan',
          message: `${highestAovShipping.method} korkein keskitilaus: ${Math.round(highestAovShipping.avgValue)} ${currencySymbol}`,
          value: highestAovShipping.avgValue
        })
      }

      // Most popular payment method
      const mostPopularPayment = paymentSummary[0]
      if (mostPopularPayment) {
        insights.push({
          type: 'payment_popular',
          title: 'Suosituin maksutapa',
          message: `${mostPopularPayment.method}: ${mostPopularPayment.percentage.toFixed(1)}% tilauksista`,
          value: mostPopularPayment.percentage
        })
      }

      // Large orders shipping preference
      const largeOrderShipping = orders
        .filter(o => o.grand_total >= 2000)
        .reduce((acc, o) => {
          const method = o.shipping_method || 'Tuntematon'
          acc[method] = (acc[method] || 0) + 1
          return acc
        }, {})
      const topLargeOrderShipping = Object.entries(largeOrderShipping)
        .sort((a, b) => b[1] - a[1])[0]
      if (topLargeOrderShipping) {
        const largeOrderCount = orders.filter(o => o.grand_total >= 2000).length
        const percentage = (topLargeOrderShipping[1] / largeOrderCount) * 100
        insights.push({
          type: 'large_order_shipping',
          title: `Suuret tilaukset (2000+ ${currencySymbol})`,
          message: `${percentage.toFixed(0)}% valitsee ${topLargeOrderShipping[0]}`,
          value: percentage
        })
      }

      setData({
        shippingByOrderSize,
        paymentByOrderSize,
        crossAnalysis,
        shippingSummary,
        paymentSummary,
        insights
      })

    } catch (err) {
      console.error('Shipping/Payment analysis error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [storeId, ready, dateRange?.startDate, dateRange?.endDate])

  useEffect(() => {
    fetchAnalysis()
  }, [fetchAnalysis])

  return {
    ...data,
    loading,
    error,
    refresh: fetchAnalysis
  }
}
