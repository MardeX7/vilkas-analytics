import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'
import { pricingFor, buildCostMap, priceOrderLines } from '@/lib/margin'

/**
 * useCategoryMargin - Hook for product category margin analysis
 *
 * Uses order_line_items joined with:
 * - products (for cost_price)
 * - product_categories (for category mapping)
 * - categories (for level3 category name)
 *
 * Net sales and cost come from src/lib/margin.js, the same margin definition as the
 * margin card and the KPI snapshots.
 */
export function useCategoryMargin(dateRange = null) {
  const { storeId, shopId, currency, ready } = useCurrentShop()
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
        // A batch of 200 orders can still pass 1000 lines, so page within it too
        const rows = await fetchAllRows((from, to) => {
          let query = supabase.from(table).select(selectCols).in(filterCol, batch)
          for (const [col, val] of Object.entries(extraFilters)) {
            query = query.eq(col, val)
          }
          return query.order('id', { ascending: true }).range(from, to)
        })
        allRows = allRows.concat(rows)
      }
      return allRows
    }

    try {
      const startDate = dateRange?.startDate
      const endDate = dateRange?.endDate

      // 1. Get orders for the period (paginated; the unique sort keeps pages from
      // overlapping or skipping)
      const orders = await fetchAllRows((from, to) => {
        let q = supabase
          .from('orders')
          .select('id, grand_total, total_before_tax, total_tax')
          .eq('store_id', storeId)
          .neq('status', 'cancelled')
          .order('id', { ascending: true })
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

      // 2. Get order line items. (The legacy order_items table holds a partial copy
      // for one store only; order_line_items is complete for both.)
      const lineItems = await fetchWithBatchedIn(
        'order_line_items', 'order_id, product_number, product_name, quantity, unit_price, total_price',
        'order_id', orderIds
      )

      // 3. Get products with cost_price (paginated)
      const products = await fetchAllRows((from, to) =>
        supabase.from('products').select('id, product_number, cost_price')
          .eq('store_id', storeId).order('id', { ascending: true }).range(from, to)
      )

      // 4. Get product -> category mappings (paginated)
      const productCategories = await fetchAllRows((from, to) =>
        supabase.from('product_categories').select('product_id, category_id, position')
          .order('id', { ascending: true }).range(from, to)
      )

      // 5. Get categories with level3 names
      const { data: categories, error: catError } = await supabase
        .from('categories')
        .select('id, level3, display_name')
        .eq('store_id', storeId)

      if (catError) throw catError

      // Build lookup maps
      const skuToProductId = new Map()
      products?.forEach(p => {
        if (p.product_number) skuToProductId.set(p.product_number, p.id)
      })

      // Price every line: net sales and cost, per the shared margin definition
      const costMap = buildCostMap(products)
      const pricing = pricingFor(currency)
      const linesByOrder = {}
      lineItems.forEach(li => { (linesByOrder[li.order_id] = linesByOrder[li.order_id] || []).push(li) })
      const pricedLines = orders.flatMap(o =>
        linesByOrder[o.id] ? priceOrderLines(o, linesByOrder[o.id], costMap, pricing) : [])

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

      pricedLines.forEach(({ item, sales: revenue, cost }) => {
        const sku = item.product_number
        const qty = item.quantity || 1

        const productId = skuToProductId.get(sku)

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
      const allCategories = Array.from(categoryMap.values())
        .map(cat => ({
          category: cat.category,
          revenue: cat.revenue,
          cost: cat.cost,
          profit: cat.revenue - cat.cost,
          marginPercent: cat.revenue > 0 ? ((cat.revenue - cat.cost) / cat.revenue) * 100 : 0,
          productCount: cat.productCount.size,
          itemCount: cat.itemCount
        }))
      const categoryMargins = allCategories
        .filter(cat => cat.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)

      // 8. Calculate totals over every category: one holding only free BONUS lines has
      // no revenue but real cost, and leaving it out lifted the total above the card's
      const totalRevenue = allCategories.reduce((sum, c) => sum + c.revenue, 0)
      const totalCost = allCategories.reduce((sum, c) => sum + c.cost, 0)
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
  }, [storeId, shopId, currency, ready, dateRange?.startDate, dateRange?.endDate])

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
