import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * useCategoryMargin - Hook for product category margin analysis
 *
 * Uses REAL sales data from order_items joined with:
 * - products (for cost_price)
 * - product_categories (for category mapping)
 * - categories (for level3 category name)
 *
 * This gives accurate sales figures from the webshop database.
 */
export function useCategoryMargin(dateRange = null) {
  const { storeId, shopId, ready } = useCurrentShop()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState({
    categoryMargins: [],
    totalMargin: { revenue: 0, cost: 0, profit: 0, percent: 0 },
    topCategories: [],
    bottomCategories: []
  })

  const fetchCategoryMargin = useCallback(async () => {
    if (!ready || !storeId || !shopId) return

    setLoading(true)
    setError(null)

    // Helper: paginate a query to get all rows beyond Supabase 1000-row limit
    async function fetchAllRows(queryFn) {
      let allRows = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data, error } = await queryFn(from, from + pageSize - 1)
        if (error) throw error
        allRows = allRows.concat(data || [])
        if (!data || data.length < pageSize) break
        from += pageSize
      }
      return allRows
    }

    // Helper: batch .in() queries to avoid URL length limits
    async function fetchWithBatchedIn(table, selectCols, filterCol, filterValues, extraFilters = {}) {
      const batchSize = 200
      let allRows = []
      for (let i = 0; i < filterValues.length; i += batchSize) {
        const batch = filterValues.slice(i, i + batchSize)
        let query = supabase.from(table).select(selectCols).in(filterCol, batch)
        for (const [col, val] of Object.entries(extraFilters)) {
          query = query.eq(col, val)
        }
        const { data, error } = await query
        if (error) throw error
        allRows = allRows.concat(data || [])
      }
      return allRows
    }

    try {
      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate

      // 1. Get orders for the period (paginated)
      const orders = await fetchAllRows((from, to) => {
        let q = supabase
          .from('orders')
          .select('id')
          .eq('store_id', storeId)
          .neq('status', 'cancelled')
          .range(from, to)
        if (startDate) q = q.gte('creation_date', startDate)
        if (endDate) q = q.lte('creation_date', endDate + 'T23:59:59')
        return q
      })

      if (orders.length === 0) {
        setData({
          categoryMargins: [],
          totalMargin: { revenue: 0, cost: 0, profit: 0, percent: 0 },
          topCategories: [],
          bottomCategories: []
        })
        setLoading(false)
        return
      }

      const orderIds = orders.map(o => o.id)

      // 2. Get order items — try order_items (has shop_id), fall back to order_line_items
      let items = await fetchWithBatchedIn(
        'order_items', 'sku, name, quantity, line_total',
        'order_id', orderIds, { shop_id: shopId }
      )

      // If order_items is empty, use order_line_items (different column names)
      if (items.length === 0) {
        const rawItems = await fetchWithBatchedIn(
          'order_line_items', 'product_number, product_name, quantity, total_price',
          'order_id', orderIds
        )
        items = rawItems.map(r => ({
          sku: r.product_number,
          name: r.product_name,
          quantity: r.quantity,
          line_total: r.total_price
        }))
      }

      // 3. Get products with cost_price (paginated)
      const products = await fetchAllRows((from, to) =>
        supabase.from('products').select('id, product_number, cost_price')
          .eq('store_id', storeId).range(from, to)
      )

      // 4. Get product -> category mappings (paginated)
      const productCategories = await fetchAllRows((from, to) =>
        supabase.from('product_categories').select('product_id, category_id, position')
          .range(from, to)
      )

      // 5. Get categories with level3 names
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id, level3, display_name')
        .eq('store_id', storeId)

      if (catError) throw catError

      // Build lookup maps
      const skuToProductId = new Map()
      const skuToCost = new Map()
      products?.forEach(p => {
        if (p.product_number) {
          skuToProductId.set(p.product_number, p.id)
          skuToCost.set(p.product_number, p.cost_price || 0)
        }
      })

      // Build product -> primary category map (use lowest position = top category)
      const productIdToPrimaryCategory = new Map()
      productCategories?.forEach(pc => {
        const existing = productIdToPrimaryCategory.get(pc.product_id)
        // Keep the one with lowest position (top category)
        if (!existing || pc.position < existing.position) {
          productIdToPrimaryCategory.set(pc.product_id, {
            category_id: pc.category_id,
            position: pc.position
          })
        }
      })

      const categoryIdToLevel3 = new Map()
      categories?.forEach(c => {
        categoryIdToLevel3.set(c.id, c.level3 || c.display_name || 'Okänd')
      })

      // 6. Aggregate sales by category (level3)
      const categoryMap = new Map()

      items?.forEach(item => {
        const sku = item.sku
        const revenue = item.line_total || 0
        const qty = item.quantity || 1

        const productId = skuToProductId.get(sku)

        // Get cost price
        const costPrice = skuToCost.get(sku) || 0
        const cost = costPrice > 0 ? costPrice * qty : revenue * 0.3 // Estimate 30% if no cost

        // Get primary category (top position)
        let catName = 'Kategorisoimaton'
        if (productId) {
          const primaryCat = productIdToPrimaryCategory.get(productId)
          if (primaryCat) {
            catName = categoryIdToLevel3.get(primaryCat.category_id) || 'Okänd'
          }
        }

        if (!categoryMap.has(catName)) {
          categoryMap.set(catName, {
            category: catName,
            revenue: 0,
            cost: 0,
            productCount: new Set(),
            itemCount: 0
          })
        }

        const cat = categoryMap.get(catName)
        cat.revenue += revenue
        cat.cost += cost
        cat.productCount.add(sku)
        cat.itemCount += qty
      })

      // 7. Calculate margins and sort
      const categoryMargins = Array.from(categoryMap.values())
        .map(cat => ({
          category: cat.category,
          revenue: cat.revenue,
          cost: cat.cost,
          profit: cat.revenue - cat.cost,
          marginPercent: cat.revenue > 0 ? ((cat.revenue - cat.cost) / cat.revenue) * 100 : 0,
          productCount: cat.productCount.size,
          itemCount: cat.itemCount
        }))
        .filter(cat => cat.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)

      // 8. Calculate totals
      const totalRevenue = categoryMargins.reduce((sum, c) => sum + c.revenue, 0)
      const totalCost = categoryMargins.reduce((sum, c) => sum + c.cost, 0)
      const totalProfit = totalRevenue - totalCost
      const totalMarginPercent = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0

      // 9. Top 10 by revenue and bottom 10 by margin %
      const sortedByMargin = [...categoryMargins].sort((a, b) => a.marginPercent - b.marginPercent)
      const topCategories = categoryMargins.slice(0, 10) // Top 10 by revenue
      const bottomCategories = sortedByMargin.slice(0, 10) // Bottom 10 by margin (lowest first)

      setData({
        categoryMargins,
        totalMargin: {
          revenue: totalRevenue,
          cost: totalCost,
          profit: totalProfit,
          percent: totalMarginPercent
        },
        topCategories,
        bottomCategories
      })

    } catch (err) {
      console.error('Category margin error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [storeId, shopId, ready, dateRange?.startDate, dateRange?.endDate])

  useEffect(() => {
    fetchCategoryMargin()
  }, [fetchCategoryMargin])

  return {
    ...data,
    loading,
    error,
    refresh: fetchCategoryMargin
  }
}
