/**
 * useProductRoles Hook
 *
 * Hakee tuotteiden roolitiedot (hero/anchor/filler/longtail)
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { STORE_ID } from '@/config/storeConfig'

/**
 * Hae tuoteroolien yhteenveto
 */
async function fetchProductRolesSummary(storeId, startDate, endDate) {
  // Hae roolien yhteenveto
  const { data, error } = await supabase.rpc('get_product_roles_summary', {
    p_store_id: storeId,
    p_start_date: startDate,
    p_end_date: endDate
  })

  if (error) {
    throw new Error(`Failed to fetch product roles: ${error.message}`)
  }

  // Hae laskennan päivämäärä (viimeisin calculated_at)
  const { data: metaData } = await supabase
    .from('product_roles')
    .select('calculated_at, period_start, period_end')
    .eq('store_id', storeId)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .single()

  return {
    roles: data || [],
    calculatedAt: metaData?.calculated_at || null,
    periodStart: metaData?.period_start || null,
    periodEnd: metaData?.period_end || null
  }
}

/**
 * Hae tuotteet roolin mukaan
 */
async function fetchProductsByRole(storeId, role, startDate, endDate, limit = 20) {
  const { data, error } = await supabase.rpc('get_products_by_role', {
    p_store_id: storeId,
    p_role: role,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: limit
  })

  if (error) {
    throw new Error(`Failed to fetch products by role: ${error.message}`)
  }

  return data || []
}

/**
 * Hook tuoteroolien hakuun
 */
export function useProductRoles({ startDate, endDate } = {}) {
  // Default to last 90 days
  const end = endDate || new Date().toISOString().split('T')[0]
  const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const query = useQuery({
    queryKey: ['productRoles', STORE_ID, start, end],
    queryFn: () => fetchProductRolesSummary(STORE_ID, start, end),
    staleTime: 10 * 60 * 1000, // 10 min
    cacheTime: 30 * 60 * 1000 // 30 min
  })

  const roles = query.data?.roles || []
  const calculatedAt = query.data?.calculatedAt || null

  // Calculate totals
  const totals = roles.reduce((acc, role) => {
    acc.products += parseInt(role.product_count) || 0
    acc.units += parseInt(role.total_units) || 0
    acc.revenue += parseFloat(role.total_revenue) || 0
    return acc
  }, { products: 0, units: 0, revenue: 0 })

  return {
    roles,
    totals,
    calculatedAt,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}

/**
 * Hook yksittäisen roolin tuotteiden hakuun
 */
export function useProductsByRole(role, { startDate, endDate, limit = 20 } = {}) {
  const end = endDate || new Date().toISOString().split('T')[0]
  const start = startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const query = useQuery({
    queryKey: ['productsByRole', STORE_ID, role, start, end, limit],
    queryFn: () => fetchProductsByRole(STORE_ID, role, start, end, limit),
    enabled: !!role,
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000
  })

  return {
    products: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}

/**
 * Role configuration
 */
export const PRODUCT_ROLES = {
  hero: {
    label: 'Veturit',
    description: 'Top 20% liikevaihdosta. Houkuttelevat asiakkaita kauppaan.',
    color: 'bg-yellow-500',
    textColor: 'text-yellow-500',
    icon: 'Star'
  },
  anchor: {
    label: 'Ankkurit',
    description: 'Vakaat myyjät hyvällä katteella. Kannattavuuden perusta.',
    color: 'bg-blue-500',
    textColor: 'text-blue-500',
    icon: 'Anchor'
  },
  filler: {
    label: 'Täyttäjät',
    description: 'Ostetaan usein muiden tuotteiden kanssa. Nostavat keskiostosta.',
    color: 'bg-green-500',
    textColor: 'text-green-500',
    icon: 'Package'
  },
  longtail: {
    label: 'Häntä',
    description: 'Alin 20% liikevaihdosta. Mahdollinen varastoriski.',
    color: 'bg-gray-500',
    textColor: 'text-gray-500',
    icon: 'TrendingDown'
  }
}
