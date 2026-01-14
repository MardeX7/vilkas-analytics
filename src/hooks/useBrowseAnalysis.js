import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { SHOP_ID } from '@/config/storeConfig'

/**
 * useBrowseAnalysis - Hook for browse/conversion analysis
 *
 * Analyzes GA4 ecommerce data to find:
 * - High views, low purchases (opportunity products)
 * - Low views, high purchases (hidden gems)
 * - Overall funnel metrics
 * - Category-level conversion insights
 */
export function useBrowseAnalysis(dateRange = null) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    opportunityProducts: [],    // High views, low conversions
    hiddenGems: [],             // Low views, high conversions
    funnelSummary: null,
    categoryConversions: [],
    recommendations: []
  })

  const fetchAnalysis = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate

      // Fetch GA4 ecommerce data
      let query = supabase
        .from('ga4_ecommerce')
        .select('item_id, item_name, item_category, items_viewed, items_added_to_cart, items_purchased, item_revenue')
        .eq('store_id', SHOP_ID)

      if (startDate) query = query.gte('date', startDate)
      if (endDate) query = query.lte('date', endDate)

      const { data: ga4Data, error: ga4Error } = await query

      if (ga4Error) throw ga4Error

      if (!ga4Data || ga4Data.length === 0) {
        setData({
          opportunityProducts: [],
          hiddenGems: [],
          funnelSummary: null,
          categoryConversions: [],
          recommendations: []
        })
        setLoading(false)
        return
      }

      // Aggregate by product (can have multiple rows per product for different dates)
      const productMap = new Map()
      ga4Data.forEach(row => {
        const key = row.item_id || row.item_name
        if (!productMap.has(key)) {
          productMap.set(key, {
            itemId: row.item_id,
            name: row.item_name,
            category: row.item_category,
            views: 0,
            addedToCart: 0,
            purchased: 0,
            revenue: 0
          })
        }
        const p = productMap.get(key)
        p.views += row.items_viewed || 0
        p.addedToCart += row.items_added_to_cart || 0
        p.purchased += row.items_purchased || 0
        p.revenue += parseFloat(row.item_revenue) || 0
      })

      // Calculate conversion rates
      const products = Array.from(productMap.values()).map(p => ({
        ...p,
        viewToCartRate: p.views > 0 ? (p.addedToCart / p.views) * 100 : 0,
        cartToPurchaseRate: p.addedToCart > 0 ? (p.purchased / p.addedToCart) * 100 : 0,
        overallConversion: p.views > 0 ? (p.purchased / p.views) * 100 : 0
      }))

      // Calculate average conversion rate for comparison
      const totalViews = products.reduce((sum, p) => sum + p.views, 0)
      const totalPurchased = products.reduce((sum, p) => sum + p.purchased, 0)
      const avgConversion = totalViews > 0 ? (totalPurchased / totalViews) * 100 : 0

      // 1. Opportunity Products: High views (>10), low conversion (<50% of average)
      const opportunityProducts = products
        .filter(p => p.views >= 10 && p.overallConversion < avgConversion * 0.5)
        .sort((a, b) => b.views - a.views)
        .slice(0, 15)
        .map(p => ({
          ...p,
          issue: 'Korkea liikenne, matala konversio',
          lostPotential: Math.round(p.views * (avgConversion / 100) - p.purchased)
        }))

      // 2. Hidden Gems: Good conversion (>2x average), lower views
      const hiddenGems = products
        .filter(p => p.purchased >= 1 && p.overallConversion >= avgConversion * 2 && p.views < 50)
        .sort((a, b) => b.overallConversion - a.overallConversion)
        .slice(0, 15)
        .map(p => ({
          ...p,
          highlight: 'Hyvä konversio, potentiaalia lisäliikenteelle',
          potentialRevenue: Math.round(p.revenue / (p.views || 1) * 100) // Revenue if views were 100
        }))

      // 3. Funnel summary
      const totalAddedToCart = products.reduce((sum, p) => sum + p.addedToCart, 0)
      const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)

      const funnelSummary = {
        totalViews,
        totalAddedToCart,
        totalPurchased,
        totalRevenue,
        viewToCartRate: totalViews > 0 ? (totalAddedToCart / totalViews) * 100 : 0,
        cartToPurchaseRate: totalAddedToCart > 0 ? (totalPurchased / totalAddedToCart) * 100 : 0,
        overallConversion: avgConversion,
        avgRevenuePerPurchase: totalPurchased > 0 ? totalRevenue / totalPurchased : 0
      }

      // 4. Category-level conversions
      const categoryMap = new Map()
      products.forEach(p => {
        const cat = p.category || 'Kategorisoimaton'
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, {
            category: cat,
            views: 0,
            addedToCart: 0,
            purchased: 0,
            revenue: 0,
            productCount: 0
          })
        }
        const c = categoryMap.get(cat)
        c.views += p.views
        c.addedToCart += p.addedToCart
        c.purchased += p.purchased
        c.revenue += p.revenue
        c.productCount++
      })

      const categoryConversions = Array.from(categoryMap.values())
        .map(c => ({
          ...c,
          viewToCartRate: c.views > 0 ? (c.addedToCart / c.views) * 100 : 0,
          cartToPurchaseRate: c.addedToCart > 0 ? (c.purchased / c.addedToCart) * 100 : 0,
          overallConversion: c.views > 0 ? (c.purchased / c.views) * 100 : 0
        }))
        .sort((a, b) => b.views - a.views)

      // 5. Generate recommendations
      const recommendations = []

      // Products that drop off at cart
      const cartDropoffs = products
        .filter(p => p.addedToCart >= 3 && p.cartToPurchaseRate < 30)
        .sort((a, b) => b.addedToCart - a.addedToCart)
        .slice(0, 3)

      if (cartDropoffs.length > 0) {
        recommendations.push({
          type: 'cart_dropoff',
          priority: 'high',
          title: 'Tuotteet jotka lisätään koriin mutta ei osteta',
          products: cartDropoffs.map(p => p.name),
          suggestion: 'Harkitse alennuskoodia, ilmaista toimitusta tai parempaa tuotekuvausta'
        })
      }

      // Best converting category
      const bestConvertingCategory = categoryConversions
        .filter(c => c.views >= 20)
        .sort((a, b) => b.overallConversion - a.overallConversion)[0]

      if (bestConvertingCategory) {
        recommendations.push({
          type: 'best_category',
          priority: 'medium',
          title: 'Parhaiten konvertoiva kategoria',
          category: bestConvertingCategory.category,
          conversion: bestConvertingCategory.overallConversion,
          suggestion: 'Laajenna valikoimaa tai lisää markkinointia tälle kategorialle'
        })
      }

      // Hidden gems that need promotion
      if (hiddenGems.length > 0) {
        recommendations.push({
          type: 'hidden_gems',
          priority: 'medium',
          title: 'Piilotetut helmet - tuotteet jotka myyvät hyvin vähällä liikenteellä',
          products: hiddenGems.slice(0, 3).map(p => p.name),
          suggestion: 'Nämä tuotteet voivat kasvattaa myyntiä lisänäkyvyydellä'
        })
      }

      // Worst converting category with significant traffic
      const worstConvertingCategory = categoryConversions
        .filter(c => c.views >= 50 && c.overallConversion < avgConversion * 0.5)
        .sort((a, b) => b.views - a.views)[0]

      if (worstConvertingCategory) {
        recommendations.push({
          type: 'worst_category',
          priority: 'low',
          title: 'Matalan konversion kategoria',
          category: worstConvertingCategory.category,
          conversion: worstConvertingCategory.overallConversion,
          suggestion: 'Tarkista hinnoittelu, tuotekuvat ja kuvaukset'
        })
      }

      setData({
        opportunityProducts,
        hiddenGems,
        funnelSummary,
        categoryConversions,
        recommendations
      })

    } catch (err) {
      console.error('Browse analysis error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [dateRange?.startDate, dateRange?.endDate])

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
