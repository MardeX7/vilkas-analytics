import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Hook for analyzing entry products - what products bring in new customers
 * Phase 3: Product Roles & First Purchase Analysis
 */
export function useEntryProducts(dateRange) {
  const { storeId, shopId, ready } = useCurrentShop()
  const [data, setData] = useState({ orders: [], orderItems: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!ready || !storeId || !shopId) return

    async function fetchData() {
      setLoading(true)
      setError(null)

      try {
        // Build date filter
        let ordersQuery = supabase
          .from('orders')
          .select('id, is_b2b, is_b2b_soft, grand_total, billing_email, creation_date')
          .eq('store_id', storeId)
          .order('creation_date', { ascending: true })

        if (dateRange?.startDate) {
          ordersQuery = ordersQuery.gte('creation_date', dateRange.startDate)
        }
        if (dateRange?.endDate) {
          ordersQuery = ordersQuery.lte('creation_date', dateRange.endDate + 'T23:59:59')
        }

        // Fetch orders
        const { data: ordersData, error: ordersError } = await ordersQuery
        if (ordersError) throw ordersError

        // Get order IDs for items query
        const orderIds = (ordersData || []).map(o => o.id)

        // Fetch order items (uses shop_id)
        let itemsData = []
        if (orderIds.length > 0) {
          const { data: items, error: itemsError } = await supabase
            .from('order_items')
            .select('order_id, sku, name, quantity, line_total')
            .eq('shop_id', shopId)
            .in('order_id', orderIds)

          if (itemsError) throw itemsError
          itemsData = items || []
        }

        setData({ orders: ordersData || [], orderItems: itemsData })
      } catch (err) {
        console.error('Failed to fetch entry products data:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [storeId, shopId, ready, dateRange?.startDate, dateRange?.endDate])

  const analytics = useMemo(() => {
    const { orders, orderItems } = data

    if (!orders.length || !orderItems.length) {
      return {
        b2bEntryProducts: [],
        b2cEntryProducts: [],
        firstPurchaseProducts: [],
        productsBySegment: { b2b: [], b2c: [] }
      }
    }

    // Group customers and find their first order
    const customerFirstOrders = {}
    orders.forEach(order => {
      const email = (order.billing_email || '').toLowerCase()
      if (!email) return

      if (!customerFirstOrders[email]) {
        customerFirstOrders[email] = {
          orderId: order.id,
          isB2B: order.is_b2b || order.is_b2b_soft,
          date: order.creation_date
        }
      } else if (order.creation_date < customerFirstOrders[email].date) {
        customerFirstOrders[email] = {
          orderId: order.id,
          isB2B: order.is_b2b || order.is_b2b_soft,
          date: order.creation_date
        }
      }
    })

    // Get first order IDs
    const firstOrderIds = new Set(Object.values(customerFirstOrders).map(c => c.orderId))

    // Create order lookup
    const orderLookup = {}
    orders.forEach(o => {
      orderLookup[o.id] = o
    })

    // Analyze products in first orders
    const productStats = {}
    orderItems.forEach(item => {
      const order = orderLookup[item.order_id]
      if (!order) return

      const isFirstOrder = firstOrderIds.has(item.order_id)
      const isB2B = order.is_b2b || order.is_b2b_soft
      const key = item.sku || item.name

      if (!productStats[key]) {
        productStats[key] = {
          sku: item.sku,
          name: item.name,
          totalOrders: 0,
          totalQuantity: 0,
          totalRevenue: 0,
          firstOrderCount: 0,
          b2bOrders: 0,
          b2cOrders: 0,
          b2bFirstOrders: 0,
          b2cFirstOrders: 0
        }
      }

      productStats[key].totalOrders++
      productStats[key].totalQuantity += item.quantity || 1
      productStats[key].totalRevenue += item.line_total || 0

      if (isFirstOrder) {
        productStats[key].firstOrderCount++
        if (isB2B) {
          productStats[key].b2bFirstOrders++
        } else {
          productStats[key].b2cFirstOrders++
        }
      }

      if (isB2B) {
        productStats[key].b2bOrders++
      } else {
        productStats[key].b2cOrders++
      }
    })

    const products = Object.values(productStats)

    // B2B Entry Products - products that appear most in B2B first orders
    const b2bEntryProducts = products
      .filter(p => p.b2bFirstOrders > 0)
      .map(p => ({
        ...p,
        entryRate: p.b2bOrders > 0 ? Math.round((p.b2bFirstOrders / p.b2bOrders) * 100) : 0,
        segment: 'B2B'
      }))
      .sort((a, b) => b.b2bFirstOrders - a.b2bFirstOrders)
      .slice(0, 10)

    // B2C Entry Products
    const b2cEntryProducts = products
      .filter(p => p.b2cFirstOrders > 0)
      .map(p => ({
        ...p,
        entryRate: p.b2cOrders > 0 ? Math.round((p.b2cFirstOrders / p.b2cOrders) * 100) : 0,
        segment: 'B2C'
      }))
      .sort((a, b) => b.b2cFirstOrders - a.b2cFirstOrders)
      .slice(0, 10)

    // All first purchase products
    const firstPurchaseProducts = products
      .filter(p => p.firstOrderCount > 0)
      .map(p => ({
        ...p,
        entryRate: p.totalOrders > 0 ? Math.round((p.firstOrderCount / p.totalOrders) * 100) : 0
      }))
      .sort((a, b) => b.firstOrderCount - a.firstOrderCount)
      .slice(0, 15)

    // Products by segment (which products are B2B vs B2C favorites)
    const productsBySegment = {
      b2b: products
        .filter(p => p.b2bOrders > 0)
        .map(p => ({
          ...p,
          b2bShare: p.totalOrders > 0 ? Math.round((p.b2bOrders / p.totalOrders) * 100) : 0
        }))
        .sort((a, b) => b.b2bShare - a.b2bShare)
        .slice(0, 10),
      b2c: products
        .filter(p => p.b2cOrders > 0)
        .map(p => ({
          ...p,
          b2cShare: p.totalOrders > 0 ? Math.round((p.b2cOrders / p.totalOrders) * 100) : 0
        }))
        .sort((a, b) => b.b2cShare - a.b2cShare)
        .slice(0, 10)
    }

    return {
      b2bEntryProducts,
      b2cEntryProducts,
      firstPurchaseProducts,
      productsBySegment
    }
  }, [data])

  return {
    ...analytics,
    loading,
    error
  }
}

export default useEntryProducts
