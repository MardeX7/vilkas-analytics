/**
 * useActionRecommendations Hook
 *
 * Hakee ja hallinnoi AI-generoituja toimenpidesuosituksia.
 * Käyttää taulua: action_recommendations
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
 * Main hook
 */
export function useActionRecommendations() {
  const { shopId, ready } = useCurrentShop()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [data, setData] = useState({
    recommendations: [],
    weekNumber: null,
    year: null,
    generatedAt: null
  })

  const { week, year } = getISOWeek(new Date())

  /**
   * Fetch recommendations from database
   */
  const fetchRecommendations = useCallback(async () => {
    if (!ready || !shopId) return

    setLoading(true)
    setError(null)

    try {
      // Fetch latest recommendations
      const { data: recData, error: fetchError } = await supabase
        .from('action_recommendations')
        .select('*')
        .eq('store_id', shopId)
        .order('year', { ascending: false })
        .order('week_number', { ascending: false })
        .limit(1)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError
      }

      if (recData) {
        setData({
          id: recData.id,
          recommendations: recData.recommendations || [],
          weekNumber: recData.week_number,
          year: recData.year,
          generatedAt: recData.generated_at
        })
      } else {
        setData({
          recommendations: [],
          weekNumber: null,
          year: null,
          generatedAt: null
        })
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [shopId, ready])

  /**
   * Mark a recommendation as completed or uncompleted
   */
  const markCompleted = useCallback(async (recommendationId, completed = true) => {
    if (!data.id || !ready || !shopId) return

    setIsUpdating(true)
    setError(null)

    try {
      // Call RPC function to update the recommendation
      const { data: result, error: updateError } = await supabase
        .rpc('mark_recommendation_completed', {
          p_store_id: shopId,
          p_recommendation_id: recommendationId,
          p_completed: completed
        })

      if (updateError) {
        throw updateError
      }

      // Update local state
      setData(prev => ({
        ...prev,
        recommendations: prev.recommendations.map(rec =>
          rec.id === recommendationId
            ? {
                ...rec,
                completed_at: completed ? new Date().toISOString() : null
              }
            : rec
        )
      }))
    } catch (err) {
      console.error('Failed to update recommendation:', err)
      setError(err.message)
      // Refresh data to ensure consistency
      fetchRecommendations()
    } finally {
      setIsUpdating(false)
    }
  }, [data.id, shopId, ready, fetchRecommendations])

  // Fetch on mount
  useEffect(() => {
    fetchRecommendations()
  }, [fetchRecommendations])

  return {
    recommendations: data.recommendations,
    weekNumber: data.weekNumber,
    year: data.year,
    generatedAt: data.generatedAt,
    loading,
    error,
    isUpdating,
    markCompleted,
    refresh: fetchRecommendations,
    currentWeek: week,
    currentYear: year
  }
}

export default useActionRecommendations
