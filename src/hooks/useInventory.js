import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Bundle/package product detection
 * Bundle products don't have their own stock - they're composed of other products.
 * We identify them by name pattern since ePages API doesn't provide a product_type field.
 */
const BUNDLE_NAME_PATTERN = /paket|paketet|bundle/i
function isBundle(product) {
  return BUNDLE_NAME_PATTERN.test(product?.name || '')
}

/**
 * useInventory - Hook for inventory data and analytics
 *
 * Returns:
 * - summary: Total value, product count, alerts
 * - reorderAlerts: Products that need restocking
 * - slowMovers: Products with low turnover (dead stock)
 * - stockHistory: Historical inventory snapshots
 * - productInventory: Detailed product-level inventory data
 */
export function useInventory() {
  const { storeId, ready } = useCurrentShop()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Summary metrics
  const [summary, setSummary] = useState({
    totalValue: 0,
    totalProducts: 0,
    productsInStock: 0,
    outOfStockCount: 0,
    lowStockCount: 0,
    avgStockDays: 0
  })

  // Reorder alerts - products below min_stock or running out soon
  const [reorderAlerts, setReorderAlerts] = useState([])

  // Slow movers - products with high stock but low sales
  const [slowMovers, setSlowMovers] = useState([])

  // Top sellers at risk - best sellers with low stock
  const [topSellersAtRisk, setTopSellersAtRisk] = useState([])

  // Stock history for trend chart
  const [stockHistory, setStockHistory] = useState([])

  // All products with inventory info
  const [productInventory, setProductInventory] = useState([])

  // ABC Analysis
  const [abcAnalysis, setAbcAnalysis] = useState({
    A: { products: [], revenue: 0, stockValue: 0, count: 0 },
    B: { products: [], revenue: 0, stockValue: 0, count: 0 },
    C: { products: [], revenue: 0, stockValue: 0, count: 0 }
  })

  // Turnover rate
  const [turnoverMetrics, setTurnoverMetrics] = useState({
    avgTurnover: 0,
    fastMovers: [],
    slowTurnover: []
  })

  // Stock value by category
  const [categoryBreakdown, setCategoryBreakdown] = useState([])

  // Stockout history
  const [stockoutHistory, setStockoutHistory] = useState([])

  // Order recommendations
  const [orderRecommendations, setOrderRecommendations] = useState([])

  // Seasonal forecast
  const [seasonalForecast, setSeasonalForecast] = useState({
    lastYearSales: 0,
    projectedNeed: 0,
    currentStock: 0,
    stockGap: 0,
    atRiskProducts: []
  })

  // Value changes over time periods
  const [valueChanges, setValueChanges] = useState({
    day1: { value: 0, change: 0, changePercent: 0 },
    day7: { value: 0, change: 0, changePercent: 0 },
    day30: { value: 0, change: 0, changePercent: 0 },
    day90: { value: 0, change: 0, changePercent: 0 },
    day180: { value: 0, change: 0, changePercent: 0 },
    day360: { value: 0, change: 0, changePercent: 0 }
  })

  const fetchInventoryData = useCallback(async () => {
    if (!ready || !storeId) return

    setLoading(true)
    setError(null)

    try {
      // 1. Fetch all products with stock data
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name, product_number, stock_level, min_stock_level, cost_price, price_amount, for_sale, stock_tracked')
        .eq('store_id', storeId)
        .eq('for_sale', true)
        .neq('stock_tracked', false)
        .order('stock_level', { ascending: true })

      if (productsError) throw productsError

      // 2. Fetch sales velocity (last 30 days) per product
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0]

      const { data: salesData, error: salesError } = await supabase
        .from('order_line_items')
        .select(`
          product_number,
          quantity,
          orders!inner(creation_date, status, store_id)
        `)
        .eq('orders.store_id', storeId)
        .gte('orders.creation_date', thirtyDaysAgoStr)
        .neq('orders.status', 'cancelled')

      if (salesError) throw salesError

      // 2b. Fetch last year same period sales (for seasonal forecast)
      const lastYearStart = new Date()
      lastYearStart.setFullYear(lastYearStart.getFullYear() - 1)
      const lastYearEnd = new Date(lastYearStart)
      lastYearEnd.setDate(lastYearEnd.getDate() + 30)
      const lastYearStartStr = lastYearStart.toISOString().split('T')[0]
      const lastYearEndStr = lastYearEnd.toISOString().split('T')[0]

      const { data: lastYearSalesData } = await supabase
        .from('order_line_items')
        .select(`
          product_number,
          quantity,
          total_price,
          orders!inner(creation_date, status, store_id)
        `)
        .eq('orders.store_id', storeId)
        .gte('orders.creation_date', lastYearStartStr)
        .lte('orders.creation_date', lastYearEndStr)
        .neq('orders.status', 'cancelled')

      // Build last year sales map
      const lastYearSalesByProduct = {}
      let totalLastYearRevenue = 0
      if (lastYearSalesData) {
        lastYearSalesData.forEach(item => {
          const sku = item.product_number
          if (sku) {
            if (!lastYearSalesByProduct[sku]) {
              lastYearSalesByProduct[sku] = { quantity: 0, revenue: 0 }
            }
            lastYearSalesByProduct[sku].quantity += item.quantity || 1
            lastYearSalesByProduct[sku].revenue += item.total_price || 0
            totalLastYearRevenue += item.total_price || 0
          }
        })
      }

      // Calculate sales velocity per product (by SKU)
      const salesByProduct = {}
      if (salesData) {
        salesData.forEach(item => {
          const sku = item.product_number
          if (sku) {
            salesByProduct[sku] = (salesByProduct[sku] || 0) + (item.quantity || 1)
          }
        })
      }

      // 3. Enrich products with velocity and days until stockout
      const enrichedProducts = products.map(p => {
        const salesLast30Days = salesByProduct[p.product_number] || 0
        const dailyVelocity = salesLast30Days / 30
        const daysUntilStockout = dailyVelocity > 0
          ? Math.floor(p.stock_level / dailyVelocity)
          : p.stock_level > 0 ? 999 : 0
        // Use cost_price if available, otherwise estimate at 60% of price_amount
        const unitCost = p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)
        const stockValue = (p.stock_level || 0) * unitCost
        const revenue30d = salesLast30Days * (p.price_amount || 0)
        const lastYearData = lastYearSalesByProduct[p.product_number] || { quantity: 0, revenue: 0 }

        // Turnover rate: (COGS / Avg Inventory) annualized
        // Simplified: (sales velocity * 365) / current stock
        const annualizedSales = dailyVelocity * 365
        const turnoverRate = p.stock_level > 0 ? annualizedSales / p.stock_level : 0

        return {
          ...p,
          salesLast30Days,
          dailyVelocity: Math.round(dailyVelocity * 100) / 100,
          daysUntilStockout,
          stockValue,
          revenue30d,
          lastYearQty: lastYearData.quantity,
          lastYearRevenue: lastYearData.revenue,
          turnoverRate: Math.round(turnoverRate * 10) / 10,
          // Extract category from product name (first word or brand)
          category: (p.name || '').split(' ')[0] || 'Uncategorized'
        }
      })

      setProductInventory(enrichedProducts)

      // 4. Calculate summary metrics
      const totalValue = enrichedProducts.reduce((sum, p) => sum + p.stockValue, 0)
      const productsInStock = enrichedProducts.filter(p => p.stock_level > 0).length
      const outOfStockCount = enrichedProducts.filter(p => p.stock_level === 0 && p.salesLast30Days > 0).length
      const lowStockCount = enrichedProducts.filter(p =>
        p.stock_level > 0 &&
        (p.stock_level <= (p.min_stock_level || 0) || p.daysUntilStockout <= 14)
      ).length

      // Average stock days for products that are selling
      const sellingProducts = enrichedProducts.filter(p => p.dailyVelocity > 0)
      const avgStockDays = sellingProducts.length > 0
        ? Math.round(sellingProducts.reduce((sum, p) => sum + p.daysUntilStockout, 0) / sellingProducts.length)
        : 0

      setSummary({
        totalValue,
        totalProducts: products.length,
        productsInStock,
        outOfStockCount,
        lowStockCount,
        avgStockDays
      })

      // 5. Reorder alerts - low stock or running out soon
      // Exclude bundle products - they don't have their own stock
      const alerts = enrichedProducts
        .filter(p =>
          !isBundle(p) && (
            (p.stock_level <= (p.min_stock_level || 0) && p.salesLast30Days > 0) ||
            (p.daysUntilStockout <= 14 && p.daysUntilStockout > 0)
          )
        )
        .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
        .slice(0, 20)

      setReorderAlerts(alerts)

      // 6. Slow movers - high stock value but low/no sales
      // Exclude bundle products - they don't have their own stock
      const slowMoversData = enrichedProducts
        .filter(p => p.stockValue > 100 && p.salesLast30Days < 2 && !isBundle(p))
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 15)

      setSlowMovers(slowMoversData)

      // 7. Top sellers at risk - products with high sales but low stock
      // Exclude bundle products - they don't have their own stock
      const topSellersRisk = enrichedProducts
        .filter(p => p.salesLast30Days >= 5 && p.daysUntilStockout <= 30 && p.stock_level > 0 && !isBundle(p))
        .sort((a, b) => b.salesLast30Days - a.salesLast30Days)
        .slice(0, 10)

      setTopSellersAtRisk(topSellersRisk)

      // 8. ABC Analysis - classify products by revenue contribution
      const sortedByRevenue = [...enrichedProducts]
        .filter(p => p.revenue30d > 0)
        .sort((a, b) => b.revenue30d - a.revenue30d)

      const totalRevenue30d = sortedByRevenue.reduce((sum, p) => sum + p.revenue30d, 0)
      let cumulativeRevenue = 0
      const abcClassified = { A: [], B: [], C: [] }

      sortedByRevenue.forEach(p => {
        cumulativeRevenue += p.revenue30d
        const percentOfTotal = (cumulativeRevenue / totalRevenue30d) * 100
        if (percentOfTotal <= 80) {
          abcClassified.A.push({ ...p, abcClass: 'A' })
        } else if (percentOfTotal <= 95) {
          abcClassified.B.push({ ...p, abcClass: 'B' })
        } else {
          abcClassified.C.push({ ...p, abcClass: 'C' })
        }
      })

      // Add products with no sales to C
      enrichedProducts
        .filter(p => p.revenue30d === 0 && p.stockValue > 0)
        .forEach(p => abcClassified.C.push({ ...p, abcClass: 'C' }))

      setAbcAnalysis({
        A: {
          products: abcClassified.A.slice(0, 20),
          revenue: abcClassified.A.reduce((sum, p) => sum + p.revenue30d, 0),
          stockValue: abcClassified.A.reduce((sum, p) => sum + p.stockValue, 0),
          count: abcClassified.A.length
        },
        B: {
          products: abcClassified.B.slice(0, 20),
          revenue: abcClassified.B.reduce((sum, p) => sum + p.revenue30d, 0),
          stockValue: abcClassified.B.reduce((sum, p) => sum + p.stockValue, 0),
          count: abcClassified.B.length
        },
        C: {
          products: abcClassified.C.slice(0, 20),
          revenue: abcClassified.C.reduce((sum, p) => sum + p.revenue30d, 0),
          stockValue: abcClassified.C.reduce((sum, p) => sum + p.stockValue, 0),
          count: abcClassified.C.length
        }
      })

      // 9. Turnover metrics
      const productsWithTurnover = enrichedProducts.filter(p => p.turnoverRate > 0)
      const avgTurnover = productsWithTurnover.length > 0
        ? productsWithTurnover.reduce((sum, p) => sum + p.turnoverRate, 0) / productsWithTurnover.length
        : 0

      const fastMovers = [...productsWithTurnover]
        .sort((a, b) => b.turnoverRate - a.turnoverRate)
        .slice(0, 5)

      const slowTurnover = [...productsWithTurnover]
        .filter(p => p.stockValue > 100) // Products with meaningful stock value
        .sort((a, b) => a.turnoverRate - b.turnoverRate)
        .slice(0, 5)

      // 10. Category breakdown with turnover calculation
      const categoryMap = {}
      enrichedProducts.forEach(p => {
        const cat = p.category
        if (!categoryMap[cat]) {
          categoryMap[cat] = {
            name: cat,
            stockValue: 0,
            productCount: 0,
            revenue30d: 0,
            totalSales30d: 0,
            totalStock: 0
          }
        }
        categoryMap[cat].stockValue += p.stockValue
        categoryMap[cat].productCount++
        categoryMap[cat].revenue30d += p.revenue30d
        categoryMap[cat].totalSales30d += p.salesLast30Days || 0
        categoryMap[cat].totalStock += p.stock_level || 0
      })

      // Calculate turnover rate per category
      Object.values(categoryMap).forEach(cat => {
        // Turnover = (annual sales) / stock
        // Annual sales = daily sales * 365 = (sales30d / 30) * 365
        const dailySales = cat.totalSales30d / 30
        const annualSales = dailySales * 365
        cat.turnoverRate = cat.totalStock > 0
          ? Math.round((annualSales / cat.totalStock) * 10) / 10
          : 0
      })

      const categoryList = Object.values(categoryMap)
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 10)

      // Top 5 categories by turnover (best)
      const fastCategories = Object.values(categoryMap)
        .filter(c => c.turnoverRate > 0 && c.productCount >= 3) // At least 3 products
        .sort((a, b) => b.turnoverRate - a.turnoverRate)
        .slice(0, 5)

      // Bottom 5 categories by turnover (worst)
      const slowCategories = Object.values(categoryMap)
        .filter(c => c.stockValue > 500 && c.productCount >= 3) // Meaningful stock value
        .sort((a, b) => a.turnoverRate - b.turnoverRate)
        .slice(0, 5)

      setTurnoverMetrics({
        avgTurnover: Math.round(avgTurnover * 10) / 10,
        fastMovers,
        slowTurnover,
        fastCategories,
        slowCategories
      })

      setCategoryBreakdown(categoryList)

      // 11. Stockout history - products that are currently out of stock but have had sales
      // Exclude bundle products - they don't have their own stock
      const stockouts = enrichedProducts
        .filter(p => p.stock_level === 0 && p.salesLast30Days > 0 && !isBundle(p))
        .map(p => ({
          ...p,
          estimatedLostSales: Math.round(p.dailyVelocity * 7 * (p.price_amount || 0)) // 1 week of lost sales
        }))
        .sort((a, b) => b.estimatedLostSales - a.estimatedLostSales)
        .slice(0, 15)

      setStockoutHistory(stockouts)

      // 12. Order recommendations - what to order based on velocity + lead time
      // Exclude bundle products - they don't have their own stock
      const LEAD_TIME_DAYS = 14 // Default lead time assumption
      const SAFETY_STOCK_DAYS = 7

      const recommendations = enrichedProducts
        .filter(p => p.dailyVelocity > 0 && p.daysUntilStockout <= (LEAD_TIME_DAYS + SAFETY_STOCK_DAYS) && !isBundle(p))
        .map(p => {
          const daysToOrder = LEAD_TIME_DAYS + SAFETY_STOCK_DAYS
          const optimalStock = Math.ceil(p.dailyVelocity * daysToOrder)
          const orderQty = Math.max(0, optimalStock - p.stock_level)
          const orderValue = orderQty * (p.cost_price || 0)

          return {
            ...p,
            optimalStock,
            orderQty,
            orderValue,
            urgency: p.daysUntilStockout <= 7 ? 'critical' : p.daysUntilStockout <= 14 ? 'high' : 'medium'
          }
        })
        .filter(p => p.orderQty > 0)
        .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
        .slice(0, 20)

      setOrderRecommendations(recommendations)

      // 13. Seasonal forecast - compare to last year same period
      // Exclude bundle products from at-risk calculation
      const productsWithLastYear = enrichedProducts.filter(p => p.lastYearQty > 0 && !isBundle(p))
      const currentTotalStock = enrichedProducts.reduce((sum, p) => sum + p.stock_level, 0)
      const projectedNeed = productsWithLastYear.reduce((sum, p) => sum + p.lastYearQty, 0)

      // Products that sold well last year but have low stock now
      const atRiskProducts = productsWithLastYear
        .filter(p => p.lastYearQty > p.stock_level * 2) // Need 2x more than current stock
        .map(p => ({
          ...p,
          stockGap: p.lastYearQty - p.stock_level,
          lastYearGrowth: p.salesLast30Days > 0 ? ((p.salesLast30Days - p.lastYearQty) / p.lastYearQty) * 100 : 0
        }))
        .sort((a, b) => b.stockGap - a.stockGap)
        .slice(0, 10)

      setSeasonalForecast({
        lastYearSales: totalLastYearRevenue,
        projectedNeed,
        currentStock: currentTotalStock,
        stockGap: Math.max(0, projectedNeed - currentTotalStock),
        atRiskProducts
      })

      // 14. Fetch stock history (last 365 days of snapshots for value changes)
      // Use RPC function to aggregate in database (avoids 1000 row limit)
      const { data: historyData, error: historyError } = await supabase
        .rpc('get_inventory_history_aggregated', {
          p_store_id: storeId,
          p_days_back: 365
        })

      if (!historyError && historyData) {
        // Map RPC result to expected format
        const validHistory = historyData
          .filter(h => h.total_value > 0)
          .map(h => ({
            date: h.snapshot_date,
            totalValue: Number(h.total_value),
            productCount: Number(h.product_count)
          }))

        // Add today's calculated value (from products, not snapshots)
        const today = new Date().toISOString().split('T')[0]
        const todayEntry = validHistory.find(h => h.date === today)
        if (!todayEntry && totalValue > 0) {
          validHistory.push({ date: today, totalValue, productCount: productsInStock })
        } else if (todayEntry && todayEntry.totalValue === 0 && totalValue > 0) {
          // Replace buggy snapshot with calculated value
          todayEntry.totalValue = totalValue
          todayEntry.productCount = productsInStock
        }

        // Sort by date
        validHistory.sort((a, b) => a.date.localeCompare(b.date))

        setStockHistory(validHistory)

        // 15. Calculate value changes for different time periods
        // IMPORTANT: Use snapshot values for both current and past to ensure
        // consistent comparison (avoid comparing calculated vs snapshot values)
        const now = new Date()

        // Get latest snapshot value (for short-term comparisons)
        // For current value, prefer today's snapshot if available, otherwise use calculated
        const latestSnapshot = validHistory.length > 0 ? validHistory[validHistory.length - 1] : null
        const latestSnapshotValue = latestSnapshot?.totalValue || totalValue

        const getValueAtDaysAgo = (daysAgo) => {
          const targetDate = new Date(now)
          targetDate.setDate(targetDate.getDate() - daysAgo)
          const targetDateStr = targetDate.toISOString().split('T')[0]

          // Find closest date in history (on or before target date)
          const candidates = validHistory.filter(h => h.date <= targetDateStr)
          if (candidates.length === 0) return null

          // Get the most recent one before target date
          return candidates[candidates.length - 1]?.totalValue || null
        }

        const getExactValueAtDaysAgo = (daysAgo) => {
          const targetDate = new Date(now)
          targetDate.setDate(targetDate.getDate() - daysAgo)
          const targetDateStr = targetDate.toISOString().split('T')[0]

          // Find exact date match only
          const match = validHistory.find(h => h.date === targetDateStr)
          return match?.totalValue || null
        }

        const calculateChange = (daysAgo) => {
          // For short periods (1-7 days), require exact date match to avoid misleading data
          // For longer periods (30+ days), allow closest date match
          const useExactMatch = daysAgo <= 7
          const pastValue = useExactMatch ? getExactValueAtDaysAgo(daysAgo) : getValueAtDaysAgo(daysAgo)

          if (pastValue === null || pastValue === 0) {
            return { value: pastValue, change: 0, changePercent: 0 }
          }

          // For short periods, compare snapshot to snapshot (not calculated to snapshot)
          // This ensures consistent comparison
          const currentValue = useExactMatch ? latestSnapshotValue : totalValue

          const change = currentValue - pastValue
          const changePercent = (change / pastValue) * 100
          return {
            value: pastValue,
            change: Math.round(change),
            changePercent: Math.round(changePercent * 10) / 10
          }
        }

        setValueChanges({
          day1: calculateChange(1),
          day7: calculateChange(7),
          day30: calculateChange(30),
          day90: calculateChange(90),
          day180: calculateChange(180),
          day360: calculateChange(360)
        })
      }

    } catch (err) {
      console.error('Inventory fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [storeId])

  useEffect(() => {
    fetchInventoryData()
  }, [fetchInventoryData])

  return {
    summary,
    reorderAlerts,
    slowMovers,
    topSellersAtRisk,
    stockHistory,
    productInventory,
    abcAnalysis,
    turnoverMetrics,
    categoryBreakdown,
    stockoutHistory,
    orderRecommendations,
    seasonalForecast,
    valueChanges,
    loading,
    error,
    refresh: fetchInventoryData
  }
}
