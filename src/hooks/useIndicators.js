/**
 * useIndicators Hook
 *
 * Fetches calculated indicators from the database.
 * Provides real-time access to MVP indicators (sales_trend, aov, gross_margin,
 * position_change, brand_vs_nonbrand, organic_conversion_rate, stock_availability_risk).
 *
 * Supports MoM (Month-over-Month) and YoY (Year-over-Year) comparison modes.
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Default store ID (Billackering) - this is shops.store_id, NOT shops.id
const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'

/**
 * Calculate YoY change for an indicator using history data
 * Compares current value with value from ~365 days ago
 */
function calculateYoYChange(currentValue, historyData) {
  if (!currentValue || !historyData || historyData.length === 0) {
    return { yoyChangePercent: null, yoyDirection: 'stable' }
  }

  // Find value from approximately 1 year ago (330-400 days range)
  const now = new Date()
  const yearAgoStart = new Date(now)
  yearAgoStart.setDate(yearAgoStart.getDate() - 400)
  const yearAgoEnd = new Date(now)
  yearAgoEnd.setDate(yearAgoEnd.getDate() - 330)

  // Find historical values in the year-ago range
  const yearAgoValues = historyData.filter(h => {
    const date = new Date(h.date)
    return date >= yearAgoStart && date <= yearAgoEnd
  })

  if (yearAgoValues.length === 0) {
    return { yoyChangePercent: null, yoyDirection: 'stable' }
  }

  // Use the closest value to exactly 365 days ago
  const targetDate = new Date(now)
  targetDate.setDate(targetDate.getDate() - 365)

  const closestValue = yearAgoValues.reduce((closest, current) => {
    const currentDiff = Math.abs(new Date(current.date) - targetDate)
    const closestDiff = Math.abs(new Date(closest.date) - targetDate)
    return currentDiff < closestDiff ? current : closest
  })

  const yearAgoValue = closestValue.value

  if (!yearAgoValue || yearAgoValue === 0) {
    return { yoyChangePercent: null, yoyDirection: 'stable' }
  }

  const changePercent = ((currentValue - yearAgoValue) / Math.abs(yearAgoValue)) * 100
  const direction = changePercent > 1 ? 'up' : changePercent < -1 ? 'down' : 'stable'

  return {
    yoyChangePercent: Math.round(changePercent * 10) / 10,
    yoyDirection: direction,
    yoyCompareValue: yearAgoValue,
    yoyCompareDate: closestValue.date
  }
}

/**
 * Fetch indicators from database
 */
async function fetchIndicators(storeId, periodLabel) {
  const { data, error } = await supabase.rpc('get_indicators', {
    p_store_id: storeId,
    p_period_label: periodLabel
  })

  if (error) {
    throw new Error(`Failed to fetch indicators: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch indicator history for trending
 */
async function fetchIndicatorHistory(storeId, indicatorId, days = 90) {
  const { data, error } = await supabase.rpc('get_indicator_history', {
    p_store_id: storeId,
    p_indicator_id: indicatorId,
    p_days: days
  })

  if (error) {
    throw new Error(`Failed to fetch history: ${error.message}`)
  }

  return data || []
}

/**
 * Fetch active alerts
 */
async function fetchAlerts(storeId) {
  const { data, error } = await supabase.rpc('get_active_alerts', {
    p_store_id: storeId
  })

  if (error) {
    throw new Error(`Failed to fetch alerts: ${error.message}`)
  }

  return data || []
}

/**
 * Main hook for fetching indicators
 *
 * @param {Object} options
 * @param {string} options.storeId - Store UUID (default: Billackering)
 * @param {'7d' | '30d' | '90d'} options.period - Period label
 * @param {'mom' | 'yoy'} options.comparisonMode - Comparison mode (MoM or YoY)
 * @param {boolean} options.includeAlerts - Include active alerts
 * @returns {Object} Indicators data, loading state, and error
 */
export function useIndicators({
  storeId = STORE_ID,
  period = '30d',
  comparisonMode = 'mom',
  includeAlerts = true
} = {}) {
  const queryClient = useQueryClient()

  // Main indicators query
  const {
    data: indicators,
    isLoading: indicatorsLoading,
    error: indicatorsError,
    refetch: refetchIndicators
  } = useQuery({
    queryKey: ['indicators', storeId, period],
    queryFn: () => fetchIndicators(storeId, period),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
    retry: 2
  })

  // Fetch history for all indicators for YoY calculation
  const indicatorIds = useMemo(() =>
    (indicators || []).map(i => i.indicator_id),
    [indicators]
  )

  // Fetch history for YoY calculation (only when YoY mode is active)
  const {
    data: historyData,
    isLoading: historyLoading
  } = useQuery({
    queryKey: ['all-indicator-history', storeId, indicatorIds.join(',')],
    queryFn: async () => {
      const histories = {}
      for (const id of indicatorIds) {
        const data = await fetchIndicatorHistory(storeId, id, 400) // 400 days for YoY
        histories[id] = data
      }
      return histories
    },
    enabled: comparisonMode === 'yoy' && indicatorIds.length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 60 * 60 * 1000 // 1 hour
  })

  // Calculate indicators with YoY data if needed
  const indicatorsWithComparison = useMemo(() => {
    if (!indicators) return []

    if (comparisonMode === 'mom') {
      // MoM uses the pre-calculated change_percent from DB
      return indicators.map(ind => ({
        ...ind,
        display_change_percent: ind.change_percent,
        display_direction: ind.direction,
        comparison_mode: 'mom'
      }))
    }

    // YoY calculation
    if (!historyData) {
      // Still loading history, show indicators without comparison data
      return indicators.map(ind => ({
        ...ind,
        display_change_percent: null,
        display_direction: 'stable',
        comparison_mode: 'yoy',
        yoy_loading: true
      }))
    }

    return indicators.map(ind => {
      const history = historyData[ind.indicator_id] || []
      const currentValue = ind.numeric_value ?? ind.value?.value

      const yoyData = calculateYoYChange(currentValue, history)

      return {
        ...ind,
        display_change_percent: yoyData.yoyChangePercent,
        display_direction: yoyData.yoyDirection,
        yoy_compare_value: yoyData.yoyCompareValue,
        yoy_compare_date: yoyData.yoyCompareDate,
        comparison_mode: 'yoy'
      }
    })
  }, [indicators, comparisonMode, historyData])

  // Alerts query (optional)
  const {
    data: alerts,
    isLoading: alertsLoading,
    error: alertsError
  } = useQuery({
    queryKey: ['alerts', storeId],
    queryFn: () => fetchAlerts(storeId),
    enabled: includeAlerts,
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 10 * 60 * 1000 // 10 minutes
  })

  // Helper to get a specific indicator
  const getIndicator = useCallback((indicatorId) => {
    if (!indicatorsWithComparison) return null
    return indicatorsWithComparison.find(ind => ind.indicator_id === indicatorId) || null
  }, [indicatorsWithComparison])

  // Helper to get indicators by category
  const getByCategory = useCallback((category) => {
    if (!indicatorsWithComparison) return []
    return indicatorsWithComparison.filter(ind => ind.category === category)
  }, [indicatorsWithComparison])

  // Helper to get critical/high priority indicators
  const getCriticalIndicators = useCallback(() => {
    if (!indicatorsWithComparison) return []
    return indicatorsWithComparison.filter(ind =>
      ind.priority === 'critical' || ind.priority === 'high' || ind.alert_triggered
    )
  }, [indicatorsWithComparison])

  // Refresh all data
  const refresh = useCallback(() => {
    queryClient.invalidateQueries(['indicators', storeId])
    queryClient.invalidateQueries(['alerts', storeId])
    queryClient.invalidateQueries(['all-indicator-history', storeId])
  }, [queryClient, storeId])

  return {
    // Data
    indicators: indicatorsWithComparison || [],
    alerts: alerts || [],

    // Helpers
    getIndicator,
    getByCategory,
    getCriticalIndicators,

    // Shortcuts for common indicators
    salesTrend: getIndicator('sales_trend'),
    aov: getIndicator('aov'),
    grossMargin: getIndicator('gross_margin'),
    positionChange: getIndicator('position_change'),
    brandVsNonBrand: getIndicator('brand_vs_nonbrand'),
    organicCR: getIndicator('organic_conversion_rate'),
    stockRisk: getIndicator('stock_availability_risk'),

    // State
    isLoading: indicatorsLoading || (includeAlerts && alertsLoading) || (comparisonMode === 'yoy' && historyLoading),
    error: indicatorsError || alertsError,

    // Actions
    refresh,
    refetch: refetchIndicators
  }
}

/**
 * Hook for fetching indicator history (for charts/trends)
 *
 * @param {string} indicatorId - Indicator ID
 * @param {Object} options
 * @param {string} options.storeId - Store UUID
 * @param {number} options.days - Number of days of history
 */
export function useIndicatorHistory(indicatorId, {
  storeId = STORE_ID,
  days = 90
} = {}) {
  const {
    data: history,
    isLoading,
    error
  } = useQuery({
    queryKey: ['indicator-history', storeId, indicatorId, days],
    queryFn: () => fetchIndicatorHistory(storeId, indicatorId, days),
    enabled: !!indicatorId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 60 * 60 * 1000 // 1 hour
  })

  return {
    history: history || [],
    isLoading,
    error
  }
}

/**
 * Summary hook - provides key metrics at a glance
 */
export function useIndicatorsSummary(options = {}) {
  const {
    indicators,
    alerts,
    getCriticalIndicators,
    isLoading,
    error
  } = useIndicators(options)

  // Calculate summary stats
  const summary = {
    totalIndicators: indicators.length,
    criticalCount: getCriticalIndicators().length,
    alertCount: alerts.length,

    // Direction counts
    up: indicators.filter(i => i.direction === 'up').length,
    down: indicators.filter(i => i.direction === 'down').length,
    stable: indicators.filter(i => i.direction === 'stable').length,

    // Health score (0-100)
    healthScore: calculateHealthScore(indicators)
  }

  return {
    summary,
    isLoading,
    error
  }
}

/**
 * Calculate overall health score from indicators
 */
function calculateHealthScore(indicators) {
  if (!indicators || indicators.length === 0) return 50

  let score = 50 // Base score

  for (const ind of indicators) {
    // Positive signals
    if (ind.direction === 'up' && ['sales_trend', 'organic_conversion_rate'].includes(ind.indicator_id)) {
      score += 8
    }
    if (ind.indicator_id === 'brand_vs_nonbrand' && ind.numeric_value >= 40) {
      score += 5 // Good non-brand share
    }

    // Negative signals
    if (ind.alert_triggered) {
      score -= 10
    }
    if (ind.direction === 'down' && ['sales_trend', 'aov'].includes(ind.indicator_id)) {
      score -= 8
    }
    if (ind.indicator_id === 'stock_availability_risk' && ind.numeric_value > 5000) {
      score -= 10 // High stock risk
    }
  }

  // Clamp between 0-100
  return Math.max(0, Math.min(100, score))
}

export default useIndicators
