/**
 * useCustomerSegments Hook
 *
 * Hakee B2B/B2C-segmenttien yhteenvedon.
 * Käyttää get_customer_segment_summary RPC:tä.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

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
 * Laske yhteenvetotilastot segmenttidatasta
 */
function calculateSummary(data) {
  if (!data || data.length === 0) return null

  const summary = data.reduce((acc, segment) => {
    const revenue = parseFloat(segment.total_revenue) || 0
    const cost = parseFloat(segment.total_cost) || 0
    const margin = parseFloat(segment.gross_margin) || 0

    if (segment.segment === 'B2B' || segment.segment === 'B2B (soft)') {
      acc.b2b.orders += segment.order_count
      acc.b2b.revenue += revenue
      acc.b2b.cost += cost
      acc.b2b.margin += margin
    } else {
      acc.b2c.orders += segment.order_count
      acc.b2c.revenue += revenue
      acc.b2c.cost += cost
      acc.b2c.margin += margin
    }
    acc.total.orders += segment.order_count
    acc.total.revenue += revenue
    acc.total.cost += cost
    acc.total.margin += margin
    return acc
  }, {
    b2b: { orders: 0, revenue: 0, cost: 0, margin: 0 },
    b2c: { orders: 0, revenue: 0, cost: 0, margin: 0 },
    total: { orders: 0, revenue: 0, cost: 0, margin: 0 }
  })

  // Laske marginaaliprosentit
  summary.b2b.marginPercent = summary.b2b.revenue > 0
    ? ((summary.b2b.margin / summary.b2b.revenue) * 100).toFixed(1)
    : 0
  summary.b2c.marginPercent = summary.b2c.revenue > 0
    ? ((summary.b2c.margin / summary.b2c.revenue) * 100).toFixed(1)
    : 0
  summary.total.marginPercent = summary.total.revenue > 0
    ? ((summary.total.margin / summary.total.revenue) * 100).toFixed(1)
    : 0

  return summary
}

/**
 * Hook asiakassegmenttien hakuun
 *
 * @param {object} options
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @param {string} options.previousStartDate - Previous period start date (for comparison)
 * @param {string} options.previousEndDate - Previous period end date (for comparison)
 * @param {boolean} options.compare - Enable comparison
 * @returns {object} - { summary, previousSummary, percentages, comparison, isLoading, error, refetch }
 */
export function useCustomerSegments({
  startDate: propStartDate,
  endDate: propEndDate,
  previousStartDate,
  previousEndDate,
  compare = false
} = {}) {
  const { storeId, ready } = useCurrentShop()

  // Use provided dates or default to last 30 days
  const endDate = propEndDate || new Date().toISOString().split('T')[0]
  const startDate = propStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Current period query
  const query = useQuery({
    queryKey: ['customerSegments', storeId, startDate, endDate],
    queryFn: () => fetchCustomerSegments(storeId, startDate, endDate),
    staleTime: 5 * 60 * 1000, // 5 min
    cacheTime: 30 * 60 * 1000, // 30 min
    enabled: ready && !!storeId
  })

  // Previous period query (for MoM/YoY comparison)
  const previousQuery = useQuery({
    queryKey: ['customerSegments', storeId, previousStartDate, previousEndDate],
    queryFn: () => fetchCustomerSegments(storeId, previousStartDate, previousEndDate),
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    enabled: ready && !!storeId && compare && !!previousStartDate && !!previousEndDate
  })

  // Laske yhteenvetotilastot
  const summary = calculateSummary(query.data)
  const previousSummary = calculateSummary(previousQuery.data)

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

  // Laske vertailu (MoM/YoY muutosprosentit)
  const getChangePercent = (current, previous) => {
    if (!previous || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  const comparison = (compare && summary && previousSummary) ? {
    b2b: {
      revenueChange: getChangePercent(summary.b2b.revenue, previousSummary.b2b.revenue),
      marginChange: getChangePercent(summary.b2b.margin, previousSummary.b2b.margin),
      ordersChange: getChangePercent(summary.b2b.orders, previousSummary.b2b.orders)
    },
    b2c: {
      revenueChange: getChangePercent(summary.b2c.revenue, previousSummary.b2c.revenue),
      marginChange: getChangePercent(summary.b2c.margin, previousSummary.b2c.margin),
      ordersChange: getChangePercent(summary.b2c.orders, previousSummary.b2c.orders)
    },
    total: {
      revenueChange: getChangePercent(summary.total.revenue, previousSummary.total.revenue),
      marginChange: getChangePercent(summary.total.margin, previousSummary.total.margin),
      ordersChange: getChangePercent(summary.total.orders, previousSummary.total.orders)
    }
  } : null

  return {
    segments: query.data,
    summary,
    previousSummary,
    percentages,
    comparison,
    isLoading: !ready || query.isLoading || previousQuery.isLoading,
    error: query.error || previousQuery.error,
    refetch: query.refetch
  }
}
