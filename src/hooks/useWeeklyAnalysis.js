/**
 * useWeeklyAnalysis Hook
 *
 * Hakee ja generoi viikko- ja kuukausianalyysejä AI:n avulla.
 * Käyttää taulua: weekly_analyses (week_number or month_number)
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Get ISO week number from date
 */
function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return { week: weekNumber, year: d.getFullYear() }
}

/**
 * Get month and year from date
 */
function getMonthYear(date) {
  const d = new Date(date)
  return { month: d.getMonth() + 1, year: d.getFullYear() } // 1-indexed month
}

/**
 * Get the previous week's date (7 days ago)
 */
function getPreviousWeekDate() {
  const date = new Date()
  date.setDate(date.getDate() - 7)
  return date
}

/**
 * Get the previous month's date
 */
function getPreviousMonthDate() {
  const date = new Date()
  date.setMonth(date.getMonth() - 1)
  return date
}

/**
 * Main hook
 * Supports both weekly and monthly analyses
 * @param {object} dateRange - Optional date range
 * @param {string} language - Language code (fi/sv) for AI generation
 * @param {string} granularity - 'week' or 'month'
 */
export function useWeeklyAnalysis(dateRange = null, language = 'fi', granularity = 'week') {
  const { shopId, storeId, ready } = useCurrentShop()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [analysis, setAnalysis] = useState(null)

  const isMonthly = granularity === 'month'

  // Determine which period to fetch
  const targetDate = dateRange?.endDate
    ? new Date(dateRange.endDate)
    : (isMonthly ? getPreviousMonthDate() : getPreviousWeekDate())

  const { week, year: weekYear } = getISOWeek(targetDate)
  const { month, year: monthYear } = getMonthYear(targetDate)

  // Use the appropriate values based on granularity
  const periodNumber = isMonthly ? month : week
  const year = isMonthly ? monthYear : weekYear

  /**
   * Fetch existing analysis from database
   */
  const fetchAnalysis = useCallback(async () => {
    if (!ready || !shopId) return

    setLoading(true)
    setError(null)

    try {
      // Build query based on granularity
      let query = supabase
        .from('weekly_analyses')
        .select('*')
        .eq('store_id', shopId)
        .eq('year', year)

      if (isMonthly) {
        // For monthly, use month_number field
        query = query.eq('month_number', periodNumber).is('week_number', null)
      } else {
        // For weekly, use week_number field
        query = query.eq('week_number', periodNumber)
      }

      const { data, error: fetchError } = await query.single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        throw fetchError
      }

      if (data) {
        setAnalysis({
          id: data.id,
          week_number: data.week_number,
          month_number: data.month_number,
          year: data.year,
          summary: data.analysis_content?.summary,
          bullets: data.analysis_content?.bullets || [],
          full_analysis: data.analysis_content?.full_analysis,
          key_metrics: data.analysis_content?.key_metrics,
          generated_at: data.generated_at,
          language: data.analysis_content?.language
        })
      } else {
        // No analysis exists for this period yet
        setAnalysis(null)
      }
    } catch (err) {
      console.error('Failed to fetch analysis:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [shopId, ready, periodNumber, year, isMonthly])

  /**
   * Generate new analysis using AI
   */
  const generateAnalysis = useCallback(async () => {
    if (!ready || !shopId) return

    setIsGenerating(true)
    setError(null)

    try {
      // Call the API endpoint to generate analysis
      const response = await fetch('/api/generate-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          week_number: isMonthly ? null : periodNumber,
          month_number: isMonthly ? periodNumber : null,
          year: year,
          date_range: dateRange,
          language: language,
          granularity: granularity,
          store_id: storeId,
          shop_id: shopId
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to generate analysis')
      }

      const result = await response.json()

      // Update local state with new analysis
      setAnalysis({
        id: result.id,
        week_number: isMonthly ? null : periodNumber,
        month_number: isMonthly ? periodNumber : null,
        year: year,
        summary: result.analysis_content?.summary,
        bullets: result.analysis_content?.bullets || [],
        full_analysis: result.analysis_content?.full_analysis,
        key_metrics: result.analysis_content?.key_metrics,
        generated_at: result.generated_at,
        language: result.analysis_content?.language
      })

    } catch (err) {
      console.error('Failed to generate analysis:', err)
      setError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }, [shopId, ready, periodNumber, year, dateRange, language, granularity, isMonthly])

  // Fetch on mount and when period changes
  useEffect(() => {
    fetchAnalysis()
  }, [fetchAnalysis])

  return {
    analysis,
    loading,
    error,
    isGenerating,
    generateAnalysis,
    refresh: fetchAnalysis,
    currentWeek: week,
    currentMonth: month,
    currentYear: year
  }
}

export default useWeeklyAnalysis
