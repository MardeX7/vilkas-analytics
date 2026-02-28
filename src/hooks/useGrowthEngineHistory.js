import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * useGrowthEngineHistory - Hook for fetching Growth Engine historical snapshots
 *
 * Returns real historical data from growth_engine_snapshots table.
 * Only shows data that was actually collected (not simulated).
 *
 * @param {Object} options
 * @param {'week' | 'month'} options.periodType - Type of period to fetch
 * @param {number} options.limit - Maximum number of periods to fetch
 */
export function useGrowthEngineHistory({ periodType = 'week', limit = 52 } = {}) {
  const { storeId, ready } = useCurrentShop()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (!ready || !storeId) return

    async function fetchHistory() {
      setLoading(true)
      setError(null)

      try {
        const { data, error: fetchError } = await supabase
          .from('growth_engine_snapshots')
          .select(`
            id,
            period_type,
            period_start,
            period_end,
            period_label,
            overall_index,
            index_level,
            demand_growth_score,
            traffic_quality_score,
            sales_efficiency_score,
            product_leverage_score,
            created_at
          `)
          .eq('store_id', storeId)
          .eq('period_type', periodType)
          .order('period_end', { ascending: true })
          .limit(limit)

        if (fetchError) {
          throw fetchError
        }

        // Transform data for chart display
        const transformedHistory = (data || []).map(snapshot => ({
          period: snapshot.period_label,
          periodEnd: snapshot.period_end,
          overall: snapshot.overall_index,
          level: snapshot.index_level,
          demandGrowth: snapshot.demand_growth_score,
          trafficQuality: snapshot.traffic_quality_score,
          salesEfficiency: snapshot.sales_efficiency_score,
          productLeverage: snapshot.product_leverage_score,
          // For bar chart coloring
          color: getBarColor(snapshot.overall_index)
        }))

        setHistory(transformedHistory)
      } catch (err) {
        console.error('Error fetching Growth Engine history:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [storeId, periodType, limit])

  return {
    history,
    loading,
    error,
    hasData: history.length > 0
  }
}

/**
 * Get bar color based on index value
 */
function getBarColor(index) {
  if (index >= 70) return 'hsl(var(--success))'     // Green - excellent
  if (index >= 50) return 'hsl(142, 76%, 45%)'      // Light green - good
  if (index >= 40) return 'hsl(48, 96%, 53%)'       // Yellow - OK
  if (index >= 30) return 'hsl(30, 100%, 50%)'      // Orange - weak
  return 'hsl(var(--destructive))'                   // Red - critical
}

export default useGrowthEngineHistory
