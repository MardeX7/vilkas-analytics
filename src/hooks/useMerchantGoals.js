/**
 * useMerchantGoals Hook
 *
 * Hakee ja hallinnoi kauppiaan tavoitteita (max 3 aktiivista).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { STORE_ID } from '@/config/storeConfig'

/**
 * Hae aktiiviset tavoitteet ja päivitä niiden edistyminen automaattisesti
 */
async function fetchActiveGoals(storeId) {
  // First, calculate/refresh all goals progress (ensures current_value is up to date)
  await supabase.rpc('calculate_goal_progress', {
    p_store_id: storeId,
    p_goal_id: null
  })

  // Then fetch the goals with fresh data
  const { data, error } = await supabase.rpc('get_active_goals', {
    p_store_id: storeId
  })

  if (error) {
    throw new Error(`Failed to fetch goals: ${error.message}`)
  }

  return data || []
}

/**
 * Luo tai päivitä tavoite
 */
async function upsertGoal(storeId, goalData) {
  const { data, error } = await supabase.rpc('upsert_goal', {
    p_store_id: storeId,
    p_goal_type: goalData.goalType,
    p_target_value: goalData.targetValue,
    p_period_type: goalData.periodType,
    p_period_label: goalData.periodLabel
  })

  if (error) {
    throw new Error(`Failed to save goal: ${error.message}`)
  }

  return data
}

/**
 * Deaktivoi tavoite
 */
async function deactivateGoal(goalId) {
  const { error } = await supabase
    .from('merchant_goals')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', goalId)

  if (error) {
    throw new Error(`Failed to deactivate goal: ${error.message}`)
  }
}

/**
 * Laske tavoitteen edistyminen
 */
async function calculateProgress(storeId, goalId = null) {
  const { data, error } = await supabase.rpc('calculate_goal_progress', {
    p_store_id: storeId,
    p_goal_id: goalId
  })

  if (error) {
    throw new Error(`Failed to calculate progress: ${error.message}`)
  }

  return data
}

/**
 * Hook kauppiaan tavoitteiden hallintaan
 *
 * @returns {object} - { goals, isLoading, error, createGoal, deactivateGoal, refreshProgress }
 */
export function useMerchantGoals() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['merchantGoals', STORE_ID],
    queryFn: () => fetchActiveGoals(STORE_ID),
    staleTime: 60 * 1000, // 1 min - refresh frequently since it recalculates progress
    cacheTime: 5 * 60 * 1000 // 5 min
  })

  // Upsert mutation
  const upsertMutation = useMutation({
    mutationFn: (goalData) => upsertGoal(STORE_ID, goalData),
    onSuccess: () => {
      queryClient.invalidateQueries(['merchantGoals', STORE_ID])
    }
  })

  // Deactivate mutation
  const deactivateMutation = useMutation({
    mutationFn: (goalId) => deactivateGoal(goalId),
    onSuccess: () => {
      queryClient.invalidateQueries(['merchantGoals', STORE_ID])
    }
  })

  // Calculate progress mutation
  const progressMutation = useMutation({
    mutationFn: (goalId) => calculateProgress(STORE_ID, goalId),
    onSuccess: () => {
      queryClient.invalidateQueries(['merchantGoals', STORE_ID])
    }
  })

  // Check if can add more goals (max 3)
  const canAddGoal = (query.data?.length || 0) < 3

  return {
    goals: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createGoal: upsertMutation.mutateAsync,
    deactivateGoal: deactivateMutation.mutateAsync,
    refreshProgress: progressMutation.mutateAsync,
    isCreating: upsertMutation.isPending,
    isDeactivating: deactivateMutation.isPending,
    isCalculating: progressMutation.isPending,
    canAddGoal
  }
}

/**
 * Goal type configuration
 */
export const GOAL_TYPES = {
  revenue: { label: 'Liikevaihto', unit: 'kr', icon: 'TrendingUp', color: 'text-green-500' },
  orders: { label: 'Tilaukset', unit: 'kpl', icon: 'ShoppingCart', color: 'text-blue-500' },
  aov: { label: 'Keskiostos', unit: 'kr', icon: 'Receipt', color: 'text-purple-500' },
  margin: { label: 'Kate', unit: '%', icon: 'PieChart', color: 'text-orange-500' },
  conversion: { label: 'Konversio', unit: '%', icon: 'Target', color: 'text-cyan-500' }
}

/**
 * Period type configuration
 */
export const PERIOD_TYPES = {
  monthly: { label: 'Kuukausi' },
  quarterly: { label: 'Kvartaali' },
  yearly: { label: 'Vuosi' }
}

/**
 * Get current period label based on type
 */
export function getCurrentPeriodLabel(periodType) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  if (periodType === 'monthly') {
    return `${year}-${month.toString().padStart(2, '0')}`
  } else if (periodType === 'quarterly') {
    const quarter = Math.ceil(month / 3)
    return `${year}-Q${quarter}`
  } else {
    return `${year}`
  }
}
