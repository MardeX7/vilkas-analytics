/**
 * useCustomerSegments Hook
 *
 * Hakee B2B/B2C-segmenttien yhteenvedon.
 * Käyttää get_customer_segment_summary RPC:tä.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { STORE_ID } from '@/config/storeConfig'

/**
 * Hae asiakassegmenttien yhteenveto
 */
async function fetchCustomerSegments(storeId, startDate, endDate) {
  const { data, error } = await supabase.rpc('get_customer_segment_summary', {
    p_store_id: storeId,
    p_start_date: startDate,
    p_end_date: endDate
  })

  if (error) {
    throw new Error(`Failed to fetch customer segments: ${error.message}`)
  }

  return data || []
}

/**
 * Hook asiakassegmenttien hakuun
 *
 * @param {object} options
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @returns {object} - { data, isLoading, error, refetch }
 */
export function useCustomerSegments({ startDate: propStartDate, endDate: propEndDate } = {}) {
  // Use provided dates or default to last 30 days
  const endDate = propEndDate || new Date().toISOString().split('T')[0]
  const startDate = propStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const query = useQuery({
    queryKey: ['customerSegments', STORE_ID, startDate, endDate],
    queryFn: () => fetchCustomerSegments(STORE_ID, startDate, endDate),
    staleTime: 5 * 60 * 1000, // 5 min
    cacheTime: 30 * 60 * 1000 // 30 min
  })

  // Laske yhteenvetotilastot
  const summary = query.data?.reduce((acc, segment) => {
    if (segment.segment === 'B2B' || segment.segment === 'B2B (soft)') {
      acc.b2b.orders += segment.order_count
      acc.b2b.revenue += parseFloat(segment.total_revenue) || 0
    } else {
      acc.b2c.orders += segment.order_count
      acc.b2c.revenue += parseFloat(segment.total_revenue) || 0
    }
    acc.total.orders += segment.order_count
    acc.total.revenue += parseFloat(segment.total_revenue) || 0
    return acc
  }, {
    b2b: { orders: 0, revenue: 0 },
    b2c: { orders: 0, revenue: 0 },
    total: { orders: 0, revenue: 0 }
  })

  // Laske prosentit
  const percentages = summary ? {
    b2b: {
      ordersPercent: summary.total.orders > 0
        ? ((summary.b2b.orders / summary.total.orders) * 100).toFixed(1)
        : 0,
      revenuePercent: summary.total.revenue > 0
        ? ((summary.b2b.revenue / summary.total.revenue) * 100).toFixed(1)
        : 0
    },
    b2c: {
      ordersPercent: summary.total.orders > 0
        ? ((summary.b2c.orders / summary.total.orders) * 100).toFixed(1)
        : 0,
      revenuePercent: summary.total.revenue > 0
        ? ((summary.b2c.revenue / summary.total.revenue) * 100).toFixed(1)
        : 0
    }
  } : null

  return {
    segments: query.data,
    summary,
    percentages,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
