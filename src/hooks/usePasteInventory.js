import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * usePasteInventory - Hook for color paste inventory data and analytics
 *
 * Data sources:
 * - paste_products: current stock levels (from CSV sync)
 * - paste_orders: consumption data (from XML import)
 * - paste_snapshots: historical stock value (from CSV sync)
 *
 * Consumption is calculated from real order data (paste_orders),
 * not from stock level diffs. Each order = a paste jar consumed and reordered.
 */
export function usePasteInventory() {
  const { shopId, ready } = useCurrentShop()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [importing, setImporting] = useState(false)

  const [summary, setSummary] = useState({
    totalValue: 0,
    totalProducts: 0,
    inStock: 0,
    outOfStock: 0,
    lowStockCount: 0,
    avgDaysLeft: 0,
  })

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [alerts, setAlerts] = useState([])
  const [topConsumers, setTopConsumers] = useState([])
  const [deadStock, setDeadStock] = useState([])
  const [abcAnalysis, setAbcAnalysis] = useState({
    A: { products: [], count: 0, consumption: 0, stockValue: 0 },
    B: { products: [], count: 0, consumption: 0, stockValue: 0 },
    C: { products: [], count: 0, consumption: 0, stockValue: 0 },
  })
  const [valueHistory, setValueHistory] = useState([])
  const [monthlyOrders, setMonthlyOrders] = useState([])
  const [lastSyncedAt, setLastSyncedAt] = useState(null)

  const fetchData = useCallback(async () => {
    if (!ready || !shopId) return
    setLoading(true)
    setError(null)

    try {
      // 1. Fetch all paste products
      const { data: pasteProducts, error: prodError } = await supabase
        .from('paste_products')
        .select('*')
        .eq('shop_id', shopId)
        .order('name')

      if (prodError) throw prodError

      // 2. Fetch consumption data (last 90 days) via RPC
      const { data: consumption, error: consError } = await supabase
        .rpc('get_paste_consumption', { p_shop_id: shopId, p_days_back: 90 })

      if (consError) throw consError

      // 3. Fetch value history (snapshots)
      const { data: history, error: histError } = await supabase
        .rpc('get_paste_history', { p_shop_id: shopId, p_days_back: 180 })

      if (histError) throw histError

      // 4. Fetch monthly order aggregates
      const { data: orderData, error: orderError } = await supabase
        .from('paste_orders')
        .select('order_date, quantity, total_price, external_id')
        .eq('shop_id', shopId)
        .order('order_date', { ascending: true })

      if (orderError) throw orderError

      // Build consumption map: external_id → consumption data
      const consumptionMap = new Map()
      for (const c of (consumption || [])) {
        consumptionMap.set(c.external_id, c)
      }

      // Enrich products with consumption data
      const enriched = (pasteProducts || []).map(p => {
        const cons = consumptionMap.get(p.external_id)
        const unitCost = p.cost_price || p.list_price || 0
        const stockValue = Math.max(p.stock_level || 0, 0) * unitCost
        const dailyConsumption = cons?.avg_daily_consumption || 0
        const consumedQty90d = Number(cons?.consumed_qty) || 0
        const daysUntilStockout = dailyConsumption > 0
          ? Math.floor((p.stock_level || 0) / dailyConsumption)
          : (p.stock_level > 0 ? 999 : 0)
        const turnoverRate = (p.stock_level || 0) > 0
          ? Math.round((dailyConsumption * 365 / p.stock_level) * 10) / 10
          : 0

        return {
          ...p,
          stockValue,
          dailyConsumption: Math.round(dailyConsumption * 1000) / 1000,
          consumedQty90d,
          daysUntilStockout,
          turnoverRate,
          orderCount: Number(cons?.order_count) || 0,
          totalSpent: Number(cons?.total_spent) || 0,
        }
      })

      // --- Summary ---
      const totalValue = enriched.reduce((s, p) => s + p.stockValue, 0)
      const inStock = enriched.filter(p => (p.stock_level || 0) > 0).length
      const outOfStock = enriched.filter(p => (p.stock_level || 0) <= 0).length
      const lowStockProducts = enriched.filter(p =>
        p.daysUntilStockout <= 14 && p.daysUntilStockout > 0
      )
      const consumingProducts = enriched.filter(p => p.dailyConsumption > 0 && p.daysUntilStockout < 999)
      const avgDaysLeft = consumingProducts.length > 0
        ? Math.round(consumingProducts.reduce((s, p) => s + p.daysUntilStockout, 0) / consumingProducts.length)
        : 0

      setSummary({
        totalValue,
        totalProducts: enriched.length,
        inStock,
        outOfStock,
        lowStockCount: lowStockProducts.length,
        avgDaysLeft,
      })

      // --- Alerts (daysUntilStockout <= 14, sorted by urgency) ---
      const alertProducts = enriched
        .filter(p => p.daysUntilStockout <= 14 && p.daysUntilStockout > 0)
        .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
        .slice(0, 20)
      setAlerts(alertProducts)

      // --- Top consumers (highest consumption in 90 days) ---
      const topCons = enriched
        .filter(p => p.consumedQty90d > 0)
        .sort((a, b) => b.consumedQty90d - a.consumedQty90d)
        .slice(0, 15)
      setTopConsumers(topCons)

      // --- Dead stock (has stock but no consumption in 90 days) ---
      const dead = enriched
        .filter(p => (p.stock_level || 0) > 0 && p.consumedQty90d === 0 && p.stockValue > 0)
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 15)
      setDeadStock(dead)

      // --- ABC Analysis (by consumption value) ---
      const withConsumption = enriched
        .filter(p => p.consumedQty90d > 0)
        .sort((a, b) => b.totalSpent - a.totalSpent)

      const totalConsumptionValue = withConsumption.reduce((s, p) => s + p.totalSpent, 0)
      let cumulative = 0
      const abc = { A: { products: [], count: 0, consumption: 0, stockValue: 0 },
                    B: { products: [], count: 0, consumption: 0, stockValue: 0 },
                    C: { products: [], count: 0, consumption: 0, stockValue: 0 } }

      for (const p of withConsumption) {
        cumulative += p.totalSpent
        const pct = totalConsumptionValue > 0 ? (cumulative / totalConsumptionValue) * 100 : 100
        const cls = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C'
        p.abcClass = cls
        abc[cls].products.push(p)
        abc[cls].count++
        abc[cls].consumption += p.totalSpent
        abc[cls].stockValue += p.stockValue
      }
      // Products with no consumption go to C
      for (const p of enriched.filter(ep => ep.consumedQty90d === 0 && ep.stockValue > 0)) {
        p.abcClass = 'C'
        abc.C.products.push(p)
        abc.C.count++
        abc.C.stockValue += p.stockValue
      }
      setAbcAnalysis(abc)

      // --- Category breakdown ---
      const categoryMap = new Map()
      for (const p of enriched) {
        const cat = p.category_prefix || 'Muut'
        if (!categoryMap.has(cat)) {
          categoryMap.set(cat, { name: cat, stockValue: 0, consumption: 0, productCount: 0, totalStock: 0 })
        }
        const c = categoryMap.get(cat)
        c.stockValue += p.stockValue
        c.consumption += p.consumedQty90d
        c.productCount++
        c.totalStock += Math.max(p.stock_level || 0, 0)
      }
      const cats = Array.from(categoryMap.values())
        .sort((a, b) => b.consumption - a.consumption)
      setCategories(cats)

      // --- Monthly orders aggregation ---
      const monthMap = new Map()
      for (const o of (orderData || [])) {
        const month = o.order_date.substring(0, 7) // YYYY-MM
        if (!monthMap.has(month)) {
          monthMap.set(month, { month, orderValue: 0, quantity: 0, uniqueProducts: new Set() })
        }
        const m = monthMap.get(month)
        m.orderValue += o.total_price || 0
        m.quantity += o.quantity || 0
        m.uniqueProducts.add(o.external_id)
      }
      const monthly = Array.from(monthMap.values())
        .map(m => ({ ...m, uniqueProducts: m.uniqueProducts.size }))
        .sort((a, b) => a.month.localeCompare(b.month))
      setMonthlyOrders(monthly)

      // --- Value history ---
      setValueHistory((history || []).map(h => ({
        date: h.snapshot_date,
        totalValue: Number(h.total_value),
        productCount: h.product_count,
        totalStock: h.total_stock,
      })))

      // --- Last synced ---
      const syncDates = (pasteProducts || [])
        .map(p => p.last_synced_at)
        .filter(Boolean)
        .sort()
      if (syncDates.length > 0) {
        setLastSyncedAt(syncDates[syncDates.length - 1])
      }

      setProducts(enriched)

    } catch (err) {
      console.error('Paste inventory fetch error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [shopId, ready])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Sync stock levels from CSV
  const syncFromCSV = useCallback(async () => {
    setSyncing(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/cron/sync-pastes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || 'Sync failed')
      // Refresh data after sync
      await fetchData()
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setSyncing(false)
    }
  }, [fetchData])

  // Import orders from XML
  const importOrders = useCallback(async (xmlText) => {
    setImporting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/paste-orders-import', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ xml: xmlText }),
      })
      const result = await resp.json()
      if (!resp.ok) throw new Error(result.error || 'Import failed')
      // Refresh data after import
      await fetchData()
      return result
    } catch (err) {
      setError(err.message)
      throw err
    } finally {
      setImporting(false)
    }
  }, [fetchData])

  return {
    summary,
    products,
    categories,
    alerts,
    topConsumers,
    deadStock,
    abcAnalysis,
    valueHistory,
    monthlyOrders,
    lastSyncedAt,
    loading,
    error,
    syncing,
    importing,
    refresh: fetchData,
    syncFromCSV,
    importOrders,
  }
}
