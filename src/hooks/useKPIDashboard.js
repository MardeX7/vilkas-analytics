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
 * @param {string} storeId
 * @param {string} granularity
 * @param {number} periodOffset - 0 = uusin, 1 = edellinen, jne.
 */
async function fetchKPIDashboardFallback(storeId, granularity, periodOffset = 0) {
  // Hae enemmän snapshoteja jotta voimme navigoida historiassa
  const { data, error } = await supabase
    .from('kpi_index_snapshots')
    .select('*')
    .eq('store_id', storeId)
    .eq('granularity', granularity)
    .order('period_end', { ascending: false })
    .limit(52) // Max 52 viikkoa tai 12 kuukautta historiaa

  if (error) {
    throw new Error(`Failed to fetch KPI snapshots: ${error.message}`)
  }

  if (!data || data.length === 0) {
    return null
  }

  // Valitse snapshot offsetin perusteella
  const currentIndex = Math.min(periodOffset, data.length - 1)
  const current = data[currentIndex]
  const previous = currentIndex + 1 < data.length ? data[currentIndex + 1] : null

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
    calculated_at: current.created_at,
    // Lisätietoja navigointia varten
    totalPeriods: data.length,
    currentPeriodIndex: currentIndex
  }
}

/**
 * Hae saatavilla olevat periodit navigointia varten
 */
async function fetchAvailablePeriods(storeId, granularity) {
  const { data, error } = await supabase
    .from('kpi_index_snapshots')
    .select('period_start, period_end')
    .eq('store_id', storeId)
    .eq('granularity', granularity)
    .order('period_end', { ascending: false })
    .limit(52)

  if (error) {
    console.warn('Failed to fetch available periods:', error)
    return []
  }

  return data || []
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
 * Hae myyntikatteen yhteenveto granulariteetin mukaan
 * Sisältää YoY-vertailun (sama periodi viime vuonna)
 */
async function fetchProfitSummary(storeId, granularity) {
  // For weekly granularity, get from latest snapshot's raw_metrics
  if (granularity === 'week') {
    // Get latest 2 years of weekly snapshots to find YoY comparison
    const { data: snapshots, error } = await supabase
      .from('kpi_index_snapshots')
      .select('period_end, raw_metrics')
      .eq('store_id', storeId)
      .eq('granularity', 'week')
      .order('period_end', { ascending: false })
      .limit(104) // ~2 years of weeks

    if (error || !snapshots || snapshots.length === 0) {
      return null
    }

    const currentSnapshot = snapshots[0]
    const currentCore = currentSnapshot?.raw_metrics?.core

    if (!currentCore) return null

    // Find same week last year
    const currentDate = new Date(currentSnapshot.period_end)
    const lastYearDate = new Date(currentDate)
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1)

    // Find closest snapshot to last year's date (within 7 days)
    let lastYearSnapshot = null
    for (const snap of snapshots) {
      const snapDate = new Date(snap.period_end)
      const diff = Math.abs(snapDate.getTime() - lastYearDate.getTime())
      if (diff < 7 * 24 * 60 * 60 * 1000) { // Within 7 days
        lastYearSnapshot = snap
        break
      }
    }

    const lastYearCore = lastYearSnapshot?.raw_metrics?.core

    // Calculate YoY changes
    const grossProfitYoY = lastYearCore?.gross_profit
      ? ((currentCore.gross_profit - lastYearCore.gross_profit) / lastYearCore.gross_profit) * 100
      : null
    const revenueYoY = lastYearCore?.total_revenue
      ? ((currentCore.total_revenue - lastYearCore.total_revenue) / lastYearCore.total_revenue) * 100
      : null

    return {
      revenue: currentCore.total_revenue || 0,
      cost: (currentCore.total_revenue || 0) - (currentCore.gross_profit || 0),
      grossProfit: currentCore.gross_profit || 0,
      marginPercent: currentCore.margin_percent || 0,
      currency: 'SEK',
      period: '7 pv',
      // YoY comparison data
      yoy: lastYearCore ? {
        grossProfit: lastYearCore.gross_profit || 0,
        grossProfitChange: grossProfitYoY,
        revenue: lastYearCore.total_revenue || 0,
        revenueChange: revenueYoY,
        marginPercent: lastYearCore.margin_percent || 0
      } : null
    }
  }

  // For monthly granularity, get from snapshots with YoY
  const { data: snapshots, error } = await supabase
    .from('kpi_index_snapshots')
    .select('period_end, raw_metrics')
    .eq('store_id', storeId)
    .eq('granularity', 'month')
    .order('period_end', { ascending: false })
    .limit(24) // ~2 years of months

  if (error || !snapshots || snapshots.length === 0) {
    // Fallback to product_profitability table (no YoY)
    const { data, error: ppError } = await supabase
      .from('product_profitability')
      .select('revenue, cost, gross_profit')
      .eq('store_id', storeId)

    if (ppError || !data || data.length === 0) return null

    const totalRevenue = data.reduce((sum, p) => sum + (p.revenue || 0), 0)
    const totalCost = data.reduce((sum, p) => sum + (p.cost || 0), 0)
    const totalGrossProfit = data.reduce((sum, p) => sum + (p.gross_profit || 0), 0)
    const marginPercent = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : 0

    return {
      revenue: totalRevenue,
      cost: totalCost,
      grossProfit: totalGrossProfit,
      marginPercent,
      currency: 'SEK',
      period: '30 pv',
      yoy: null
    }
  }

  const currentSnapshot = snapshots[0]
  const currentCore = currentSnapshot?.raw_metrics?.core

  if (!currentCore) return null

  // Find same month last year
  const currentDate = new Date(currentSnapshot.period_end)
  const lastYearMonth = `${currentDate.getFullYear() - 1}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`

  let lastYearSnapshot = null
  for (const snap of snapshots) {
    if (snap.period_end.startsWith(lastYearMonth)) {
      lastYearSnapshot = snap
      break
    }
  }

  const lastYearCore = lastYearSnapshot?.raw_metrics?.core

  // Calculate YoY changes
  const grossProfitYoY = lastYearCore?.gross_profit
    ? ((currentCore.gross_profit - lastYearCore.gross_profit) / lastYearCore.gross_profit) * 100
    : null
  const revenueYoY = lastYearCore?.total_revenue
    ? ((currentCore.total_revenue - lastYearCore.total_revenue) / lastYearCore.total_revenue) * 100
    : null

  return {
    revenue: currentCore.total_revenue || 0,
    cost: (currentCore.total_revenue || 0) - (currentCore.gross_profit || 0),
    grossProfit: currentCore.gross_profit || 0,
    marginPercent: currentCore.margin_percent || 0,
    currency: 'SEK',
    period: '30 pv',
    // YoY comparison data
    yoy: lastYearCore ? {
      grossProfit: lastYearCore.gross_profit || 0,
      grossProfitChange: grossProfitYoY,
      revenue: lastYearCore.total_revenue || 0,
      revenueChange: revenueYoY,
      marginPercent: lastYearCore.margin_percent || 0
    } : null
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
 * @param {number} options.periodOffset - 0 = uusin, 1 = edellinen, jne.
 * @returns {Object} Dashboard data, loading state, error, helpers
 */
export function useKPIDashboard({
  storeId = DEFAULT_STORE_ID,
  granularity = 'week',
  periodOffset = 0
} = {}) {
  const queryClient = useQueryClient()

  // Available periods query (for navigation)
  const {
    data: availablePeriods
  } = useQuery({
    queryKey: ['kpi-available-periods', storeId, granularity],
    queryFn: () => fetchAvailablePeriods(storeId, granularity),
    staleTime: 10 * 60 * 1000,
    cacheTime: 60 * 60 * 1000
  })

  // KPI Dashboard query - now with periodOffset
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard
  } = useQuery({
    queryKey: ['kpi-dashboard', storeId, granularity, periodOffset],
    queryFn: () => fetchKPIDashboardFallback(storeId, granularity, periodOffset),
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

  // Profit Summary query (myyntikate yhteenveto) - follows granularity
  const {
    data: profitSummary
  } = useQuery({
    queryKey: ['kpi-profit-summary', storeId, granularity],
    queryFn: () => fetchProfitSummary(storeId, granularity),
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

    // Navigation info
    availablePeriods: availablePeriods || [],
    totalPeriods: dashboard?.totalPeriods || availablePeriods?.length || 0,
    currentPeriodIndex: dashboard?.currentPeriodIndex ?? periodOffset,

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
