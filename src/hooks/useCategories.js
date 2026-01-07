/**
 * useCategories - Hook for category sales data
 *
 * Fetches category performance data from Supabase
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// Kovakoodattu store_id (billackering) - sama kuin useAnalytics
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

export function useCategories(days = 30) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: rpcError } = await supabase.rpc('get_category_summary', {
        p_store_id: STORE_ID,
        p_days: days
      })

      if (rpcError) throw rpcError

      setCategories(data || [])
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // Calculate totals
  const totals = categories.reduce((acc, cat) => ({
    revenue: acc.revenue + parseFloat(cat.revenue || 0),
    units: acc.units + parseInt(cat.units_sold || 0),
    orders: acc.orders + parseInt(cat.order_count || 0)
  }), { revenue: 0, units: 0, orders: 0 })

  return {
    categories,
    totals,
    loading,
    error,
    refresh: fetchCategories
  }
}

export default useCategories
