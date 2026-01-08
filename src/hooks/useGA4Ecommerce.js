import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Kovakoodattu shop_id (billackering) - this is shops.id UUID
const SHOP_ID = '3b93e9b1-d64c-4686-a14a-bec535495f71'
// ga4_tokens.store_id for API calls
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

/**
 * useGA4Ecommerce - Hook for Google Analytics 4 E-commerce data
 *
 * Provides product-level analytics:
 * - Items viewed
 * - Items added to cart
 * - Items purchased
 * - Item revenue
 * - Conversion rates (view→cart, cart→purchase)
 */
export function useGA4Ecommerce(dateRange = null) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    topProducts: [],
    productFunnel: {
      totalViews: 0,
      totalAddToCart: 0,
      totalPurchased: 0,
      totalRevenue: 0,
      viewToCartRate: 0,
      cartToPurchaseRate: 0
    },
    lowConversionProducts: [],  // High views, low cart adds
    highPerformers: [],         // High conversion rate
    summary: null
  })

  const fetchEcommerceData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // E-commerce data: Try with date range first, fallback to all data
      // This is because GA4 E-commerce data may have gaps or not be available for recent dates
      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate

      // First try: with date range filter
      let query = supabase
        .from('ga4_ecommerce')
        .select('*')
        .eq('store_id', SHOP_ID)
        .order('items_viewed', { ascending: false })

      if (startDate) query = query.gte('date', startDate)
      if (endDate) query = query.lte('date', endDate)

      let { data: rawData, error: queryError } = await query
      if (queryError) throw queryError

      // Fallback: if no data found with date range, fetch ALL available data
      if (!rawData || rawData.length === 0) {
        const { data: allData, error: allError } = await supabase
          .from('ga4_ecommerce')
          .select('*')
          .eq('store_id', SHOP_ID)
          .order('items_viewed', { ascending: false })

        if (!allError) {
          rawData = allData
        }
      }

      if (!rawData || rawData.length === 0) {
        setData({
          topProducts: [],
          productFunnel: {
            totalViews: 0,
            totalAddToCart: 0,
            totalPurchased: 0,
            totalRevenue: 0,
            viewToCartRate: 0,
            cartToPurchaseRate: 0
          },
          lowConversionProducts: [],
          highPerformers: [],
          summary: null
        })
        setLoading(false)
        return
      }

      // Aggregate by product name
      const productMap = new Map()
      rawData.forEach(row => {
        const name = row.item_name
        if (!productMap.has(name)) {
          productMap.set(name, {
            item_name: name,
            item_category: row.item_category,
            items_viewed: 0,
            items_added_to_cart: 0,
            items_purchased: 0,
            item_revenue: 0
          })
        }
        const p = productMap.get(name)
        p.items_viewed += row.items_viewed || 0
        p.items_added_to_cart += row.items_added_to_cart || 0
        p.items_purchased += row.items_purchased || 0
        p.item_revenue += parseFloat(row.item_revenue) || 0
      })

      // Calculate rates and sort
      const products = Array.from(productMap.values()).map(p => ({
        ...p,
        view_to_cart_rate: p.items_viewed > 0 ? p.items_added_to_cart / p.items_viewed : 0,
        cart_to_purchase_rate: p.items_added_to_cart > 0 ? p.items_purchased / p.items_added_to_cart : 0,
        overall_conversion: p.items_viewed > 0 ? p.items_purchased / p.items_viewed : 0
      }))

      // Top products by views
      const topProducts = [...products]
        .sort((a, b) => b.items_viewed - a.items_viewed)
        .slice(0, 20)

      // Calculate funnel totals
      const totalViews = products.reduce((sum, p) => sum + p.items_viewed, 0)
      const totalAddToCart = products.reduce((sum, p) => sum + p.items_added_to_cart, 0)
      const totalPurchased = products.reduce((sum, p) => sum + p.items_purchased, 0)
      const totalRevenue = products.reduce((sum, p) => sum + p.item_revenue, 0)

      const productFunnel = {
        totalViews,
        totalAddToCart,
        totalPurchased,
        totalRevenue,
        viewToCartRate: totalViews > 0 ? totalAddToCart / totalViews : 0,
        cartToPurchaseRate: totalAddToCart > 0 ? totalPurchased / totalAddToCart : 0
      }

      // Low conversion products (high views, low cart rate)
      // Minimum 10 views to be relevant
      const lowConversionProducts = [...products]
        .filter(p => p.items_viewed >= 10 && p.view_to_cart_rate < 0.05)
        .sort((a, b) => b.items_viewed - a.items_viewed)
        .slice(0, 10)

      // High performers (good conversion rate, at least some views)
      const highPerformers = [...products]
        .filter(p => p.items_viewed >= 5 && p.overall_conversion > 0.02)
        .sort((a, b) => b.overall_conversion - a.overall_conversion)
        .slice(0, 10)

      setData({
        topProducts,
        productFunnel,
        lowConversionProducts,
        highPerformers,
        summary: {
          uniqueProducts: products.length,
          totalViews,
          totalAddToCart,
          totalPurchased,
          totalRevenue
        }
      })

    } catch (err) {
      console.error('GA4 Ecommerce error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange?.startDate, dateRange?.endDate])

  useEffect(() => {
    fetchEcommerceData()
  }, [fetchEcommerceData])

  // Sync E-commerce data function
  // Always sync last 365 days for comprehensive product data
  const syncEcommerce = async (startDate, endDate) => {
    // For E-commerce, we want to fetch a full year of data
    // to ensure we have comprehensive product performance metrics
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const syncStartDate = oneYearAgo.toISOString().split('T')[0]
    const syncEndDate = new Date().toISOString().split('T')[0]

    const response = await fetch('/api/ga4/sync-ecommerce', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        store_id: STORE_ID,
        start_date: syncStartDate,
        end_date: syncEndDate
      })
    })
    const result = await response.json()
    if (result.success) {
      await fetchEcommerceData()
    }
    return result
  }

  return {
    ...data,
    loading,
    error,
    refresh: fetchEcommerceData,
    syncEcommerce
  }
}
