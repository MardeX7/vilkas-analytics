/**
 * useKPIDashboard Hook
 *
 * Hakee KPI-indeksit dashboardia varten.
 * Tukee viikko- ja kuukausigranulariteettia.
 */

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getIndexInterpretation, INDEX_INFO } from '@/lib/kpi/types'

// Billackering store ID
const DEFAULT_STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

/**
 * Hae KPI dashboard RPC:llä
 */
async function fetchKPIDashboard(storeId, granularity) {
  const { data, error } = await supabase.rpc('get_kpi_dashboard', {
    p_store_id: storeId,
    p_granularity: granularity
  })

  if (error) {
    // Jos RPC ei vielä ole, fallback suoraan tauluun
    if (error.message.includes('does not exist')) {
      return fetchKPIDashboardFallback(storeId, granularity)
    }
    throw new Error(`Failed to fetch KPI dashboard: ${error.message}`)
  }

  return data
}

/**
 * Fallback: hae suoraan taulusta jos RPC ei ole vielä käytössä
 */
async function fetchKPIDashboardFallback(storeId, granularity) {
  const { data, error } = await supabase
    .from('kpi_index_snapshots')
    .select('*')
    .eq('store_id', storeId)
    .eq('granularity', granularity)
    .order('period_end', { ascending: false })
    .limit(2)

  if (error) {
    throw new Error(`Failed to fetch KPI snapshots: ${error.message}`)
  }

  if (!data || data.length === 0) {
    return null
  }

  const current = data[0]
  const previous = data.length > 1 ? data[1] : null

  return {
    period: {
      start: current.period_start,
      end: current.period_end,
      granularity
    },
    indexes: {
      overall: current.overall_index,
      core: current.core_index,
      ppi: current.product_profitability_index,
      spi: current.seo_performance_index,
      oi: current.operational_index
    },
    deltas: {
      overall: current.overall_delta || (previous ? current.overall_index - previous.overall_index : 0),
      core: current.core_index_delta || (previous ? current.core_index - previous.core_index : 0),
      ppi: current.ppi_delta || (previous ? current.product_profitability_index - previous.product_profitability_index : 0),
      spi: current.spi_delta || (previous ? current.seo_performance_index - previous.seo_performance_index : 0),
      oi: current.oi_delta || (previous ? current.operational_index - previous.operational_index : 0)
    },
    components: {
      core: current.core_components || {},
      ppi: current.ppi_components || {},
      spi: current.spi_components || {},
      oi: current.oi_components || {}
    },
    alerts: current.alerts || [],
    calculated_at: current.created_at
  }
}

/**
 * Hae KPI-historia trendigraafia varten
 */
async function fetchKPIHistory(storeId, granularity, limit = 12) {
  const { data, error } = await supabase
    .from('kpi_index_snapshots')
    .select('period_end, overall_index, core_index, product_profitability_index, seo_performance_index, operational_index')
    .eq('store_id', storeId)
    .eq('granularity', granularity)
    .order('period_end', { ascending: true })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch KPI history: ${error.message}`)
  }

  return data || []
}

/**
 * Hae myyntikatteen yhteenveto
 */
async function fetchProfitSummary(storeId) {
  const { data, error } = await supabase
    .from('product_profitability')
    .select('revenue, cost, gross_profit')
    .eq('store_id', storeId)

  if (error) {
    console.warn('Failed to fetch profit summary:', error)
    return null
  }

  if (!data || data.length === 0) return null

  const totalRevenue = data.reduce((sum, p) => sum + (p.revenue || 0), 0)
  const totalCost = data.reduce((sum, p) => sum + (p.cost || 0), 0)
  const totalGrossProfit = data.reduce((sum, p) => sum + (p.gross_profit || 0), 0)
  const marginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0

  return {
    revenue: totalRevenue,
    cost: totalCost,
    grossProfit: totalGrossProfit,
    marginPercent,
    currency: 'SEK'
  }
}

/**
 * Hae top profit drivers
 */
async function fetchTopDrivers(storeId) {
  const { data, error } = await supabase
    .from('product_profitability')
    .select(`
      product_id,
      total_score,
      margin_index,
      sales_index,
      revenue,
      margin_percent,
      profitability_tier,
      products (name, product_number)
    `)
    .eq('store_id', storeId)
    .eq('profitability_tier', 'top_driver')
    .order('total_score', { ascending: false })
    .limit(10)

  if (error) {
    console.warn('Failed to fetch top drivers:', error)
    return []
  }

  return data || []
}

/**
 * Hae capital traps
 */
async function fetchCapitalTraps(storeId) {
  const { data, error } = await supabase
    .from('product_profitability')
    .select(`
      product_id,
      total_score,
      stock_days,
      stock_level,
      revenue,
      products (name, product_number, cost_price)
    `)
    .eq('store_id', storeId)
    .eq('profitability_tier', 'capital_trap')
    .order('stock_days', { ascending: false })
    .limit(10)

  if (error) {
    console.warn('Failed to fetch capital traps:', error)
    return []
  }

  return data || []
}

/**
 * Main hook: useKPIDashboard
 *
 * @param {Object} options
 * @param {string} options.storeId - Store UUID (default: Billackering)
 * @param {'week' | 'month'} options.granularity - Aikajakson tarkkuus
 * @returns {Object} Dashboard data, loading state, error, helpers
 */
export function useKPIDashboard({
  storeId = DEFAULT_STORE_ID,
  granularity = 'week'
} = {}) {
  const queryClient = useQueryClient()

  // KPI Dashboard query
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard
  } = useQuery({
    queryKey: ['kpi-dashboard', storeId, granularity],
    queryFn: () => fetchKPIDashboard(storeId, granularity),
    staleTime: 5 * 60 * 1000, // 5 min
    cacheTime: 30 * 60 * 1000, // 30 min
    retry: 2
  })

  // KPI History query (for trends) - follows granularity selection
  const {
    data: history,
    isLoading: historyLoading
  } = useQuery({
    queryKey: ['kpi-history', storeId, granularity],
    queryFn: () => fetchKPIHistory(storeId, granularity, granularity === 'week' ? 52 : 12),
    staleTime: 10 * 60 * 1000,
    cacheTime: 60 * 60 * 1000
  })

  // Top Drivers query
  const {
    data: topDrivers,
    isLoading: driversLoading
  } = useQuery({
    queryKey: ['kpi-top-drivers', storeId],
    queryFn: () => fetchTopDrivers(storeId),
    staleTime: 10 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
    enabled: !!dashboard
  })

  // Capital Traps query
  const {
    data: capitalTraps,
    isLoading: trapsLoading
  } = useQuery({
    queryKey: ['kpi-capital-traps', storeId],
    queryFn: () => fetchCapitalTraps(storeId),
    staleTime: 10 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
    enabled: !!dashboard
  })

  // Profit Summary query (myyntikate yhteenveto)
  const {
    data: profitSummary
  } = useQuery({
    queryKey: ['kpi-profit-summary', storeId],
    queryFn: () => fetchProfitSummary(storeId),
    staleTime: 10 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
    enabled: !!dashboard
  })

  // Indeksien tulkinnat
  const interpretations = useMemo(() => {
    if (!dashboard?.indexes) return null

    return {
      overall: getIndexInterpretation(dashboard.indexes.overall),
      core: getIndexInterpretation(dashboard.indexes.core),
      ppi: getIndexInterpretation(dashboard.indexes.ppi),
      spi: getIndexInterpretation(dashboard.indexes.spi),
      oi: getIndexInterpretation(dashboard.indexes.oi)
    }
  }, [dashboard])

  // Indeksit UI-muodossa
  const indexes = useMemo(() => {
    if (!dashboard?.indexes) return []

    return [
      {
        id: 'overall',
        ...INDEX_INFO.overall,
        value: dashboard.indexes.overall,
        delta: dashboard.deltas?.overall || 0,
        interpretation: interpretations?.overall
      },
      {
        id: 'core',
        ...INDEX_INFO.core,
        value: dashboard.indexes.core,
        delta: dashboard.deltas?.core || 0,
        interpretation: interpretations?.core,
        components: dashboard.components?.core
      },
      {
        id: 'ppi',
        ...INDEX_INFO.ppi,
        value: dashboard.indexes.ppi,
        delta: dashboard.deltas?.ppi || 0,
        interpretation: interpretations?.ppi,
        components: dashboard.components?.ppi
      },
      {
        id: 'spi',
        ...INDEX_INFO.spi,
        value: dashboard.indexes.spi,
        delta: dashboard.deltas?.spi || 0,
        interpretation: interpretations?.spi,
        components: dashboard.components?.spi
      },
      {
        id: 'oi',
        ...INDEX_INFO.oi,
        value: dashboard.indexes.oi,
        delta: dashboard.deltas?.oi || 0,
        interpretation: interpretations?.oi,
        components: dashboard.components?.oi
      }
    ]
  }, [dashboard, interpretations])

  // Refresh all
  const refresh = useCallback(() => {
    queryClient.invalidateQueries(['kpi-dashboard', storeId])
    queryClient.invalidateQueries(['kpi-history', storeId])
    queryClient.invalidateQueries(['kpi-top-drivers', storeId])
    queryClient.invalidateQueries(['kpi-capital-traps', storeId])
  }, [queryClient, storeId])

  // Trigger manual calculation (calls Edge Function)
  const triggerCalculation = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('daily-kpi-snapshot', {
        body: { store_id: storeId, granularity }
      })

      if (error) throw error

      // Refresh after calculation
      setTimeout(() => refresh(), 1000)

      return data
    } catch (error) {
      console.error('KPI calculation failed:', error)
      throw error
    }
  }, [storeId, granularity, refresh])

  return {
    // Data
    dashboard,
    indexes,
    history: history || [],
    topDrivers: topDrivers || [],
    capitalTraps: capitalTraps || [],
    profitSummary: profitSummary || null,
    alerts: dashboard?.alerts || [],

    // Period info
    period: dashboard?.period,

    // State
    isLoading: dashboardLoading,
    isLoadingHistory: historyLoading,
    isLoadingProducts: driversLoading || trapsLoading,
    error: dashboardError,

    // Helpers
    interpretations,
    hasData: !!dashboard && dashboard.indexes?.overall != null,

    // Actions
    refresh,
    refetch: refetchDashboard,
    triggerCalculation
  }
}

/**
 * Hook for single index details
 */
export function useKPIIndexDetail(indexId, options = {}) {
  const { dashboard, indexes, history, isLoading } = useKPIDashboard(options)

  const index = useMemo(() => {
    return indexes.find(i => i.id === indexId) || null
  }, [indexes, indexId])

  const indexHistory = useMemo(() => {
    if (!history) return []

    const fieldMap = {
      overall: 'overall_index',
      core: 'core_index',
      ppi: 'product_profitability_index',
      spi: 'seo_performance_index',
      oi: 'operational_index'
    }

    const field = fieldMap[indexId]
    if (!field) return []

    return history.map(h => ({
      date: h.period_end,
      value: h[field]
    }))
  }, [history, indexId])

  return {
    index,
    history: indexHistory,
    components: index?.components || {},
    isLoading
  }
}

export default useKPIDashboard
