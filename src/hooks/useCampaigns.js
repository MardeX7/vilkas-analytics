/**
 * useCampaigns Hook
 *
 * Hakee ja hallinnoi markkinointikampanjoita.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Hae kampanjat aikavälille
 */
async function fetchCampaigns(storeId, startDate, endDate, activeOnly = false) {
  const { data, error } = await supabase.rpc('get_campaigns', {
    p_store_id: storeId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_active_only: activeOnly
  })

  if (error) {
    throw new Error(`Failed to fetch campaigns: ${error.message}`)
  }

  return data || []
}

/**
 * Luo uusi kampanja
 */
async function createCampaign(storeId, campaignData) {
  const { data, error } = await supabase.rpc('create_campaign', {
    p_store_id: storeId,
    p_name: campaignData.name,
    p_campaign_type: campaignData.campaignType,
    p_start_date: campaignData.startDate,
    p_end_date: campaignData.endDate,
    p_description: campaignData.description || null,
    p_coupon_code: campaignData.couponCode || null,
    p_discount_type: campaignData.discountType || null,
    p_discount_value: campaignData.discountValue || null
  })

  if (error) {
    throw new Error(`Failed to create campaign: ${error.message}`)
  }

  return data
}

/**
 * Poista kampanja
 */
async function deleteCampaign(campaignId) {
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', campaignId)

  if (error) {
    throw new Error(`Failed to delete campaign: ${error.message}`)
  }
}

/**
 * Laske kampanjan suorituskyky
 */
async function calculatePerformance(storeId, campaignId = null) {
  const { data, error } = await supabase.rpc('calculate_campaign_performance', {
    p_store_id: storeId,
    p_campaign_id: campaignId
  })

  if (error) {
    throw new Error(`Failed to calculate performance: ${error.message}`)
  }

  return data
}

/**
 * Hook kampanjoiden hallintaan
 */
export function useCampaigns({ startDate, endDate, activeOnly = false } = {}) {
  const { storeId, ready } = useCurrentShop()
  const queryClient = useQueryClient()

  // Default to wide date range
  const end = endDate || '2100-12-31'
  const start = startDate || '1900-01-01'

  const query = useQuery({
    queryKey: ['campaigns', storeId, start, end, activeOnly],
    queryFn: () => fetchCampaigns(storeId, start, end, activeOnly),
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    enabled: ready && !!storeId
  })

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (campaignData) => createCampaign(storeId, campaignData),
    onSuccess: () => {
      queryClient.invalidateQueries(['campaigns', storeId])
    }
  })

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: (campaignId) => deleteCampaign(campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries(['campaigns', storeId])
    }
  })

  // Calculate performance mutation
  const performanceMutation = useMutation({
    mutationFn: (campaignId) => calculatePerformance(storeId, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries(['campaigns', storeId])
    }
  })

  // Summary stats
  const summary = query.data?.reduce((acc, campaign) => {
    acc.totalCampaigns++
    if (campaign.is_active) acc.activeCampaigns++
    acc.totalRevenue += parseFloat(campaign.revenue) || 0
    return acc
  }, {
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalRevenue: 0
  })

  return {
    campaigns: query.data || [],
    summary,
    isLoading: !ready || query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createCampaign: createMutation.mutateAsync,
    deleteCampaign: deleteMutation.mutateAsync,
    calculatePerformance: performanceMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isCalculating: performanceMutation.isPending
  }
}

/**
 * Campaign type configuration
 */
export const CAMPAIGN_TYPES = {
  discount: { label: 'Alennus', icon: 'Percent', color: 'bg-green-500' },
  bundle: { label: 'Paketti', icon: 'Package', color: 'bg-blue-500' },
  free_shipping: { label: 'Ilmainen toimitus', icon: 'Truck', color: 'bg-purple-500' },
  gift: { label: 'Lahja', icon: 'Gift', color: 'bg-pink-500' },
  other: { label: 'Muu', icon: 'Tag', color: 'bg-gray-500' }
}

/**
 * Discount type labels
 */
export const DISCOUNT_TYPES = {
  percentage: { label: 'Prosentti', suffix: '%' },
  fixed: { label: 'Kiinteä', suffix: '' },
  none: { label: 'Ei alennusta', suffix: '' }
}
