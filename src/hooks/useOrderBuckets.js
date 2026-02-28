/**
 * useOrderBuckets Hook
 *
 * Hakee tilausten jakautuman arvo-bucketeihin.
 * Käyttää get_order_bucket_distribution RPC:tä.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Hae tilausten bucket-jakauma
 */
async function fetchOrderBuckets(storeId, startDate, endDate) {
  const { data, error } = await supabase.rpc('get_order_bucket_distribution', {
    p_store_id: storeId,
    p_start_date: startDate,
    p_end_date: endDate
  })

  if (error) {
    throw new Error(`Failed to fetch order buckets: ${error.message}`)
  }

  return data || []
}

/**
 * Hook tilausten bucket-jakaumaan
 *
 * @param {object} options
 * @param {string} options.startDate - Start date (YYYY-MM-DD)
 * @param {string} options.endDate - End date (YYYY-MM-DD)
 * @returns {object} - { data, isLoading, error, refetch }
 */
export function useOrderBuckets({ startDate: propStartDate, endDate: propEndDate } = {}) {
  const { storeId, ready } = useCurrentShop()

  // Use provided dates or default to last 30 days
  const endDate = propEndDate || new Date().toISOString().split('T')[0]
  const startDate = propStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const query = useQuery({
    queryKey: ['orderBuckets', storeId, startDate, endDate],
    queryFn: () => fetchOrderBuckets(storeId, startDate, endDate),
    staleTime: 5 * 60 * 1000, // 5 min
    cacheTime: 30 * 60 * 1000, // 30 min
    enabled: ready && !!storeId
  })

  // Laske yhteenvetotilastot
  const summary = query.data?.reduce((acc, bucket) => {
    acc.totalOrders += bucket.order_count
    acc.totalRevenue += parseFloat(bucket.total_revenue) || 0
    acc.b2bOrders += bucket.b2b_count
    acc.b2cOrders += bucket.b2c_count
    return acc
  }, {
    totalOrders: 0,
    totalRevenue: 0,
    b2bOrders: 0,
    b2cOrders: 0
  })

  // Muunna chart-dataksi
  const chartData = query.data?.map(bucket => ({
    name: bucket.bucket,
    tilaukset: bucket.order_count,
    liikevaihto: Math.round(parseFloat(bucket.total_revenue) || 0),
    keskiostos: Math.round(parseFloat(bucket.avg_order_value) || 0),
    b2b: bucket.b2b_count,
    b2c: bucket.b2c_count
  })) || []

  return {
    buckets: query.data,
    chartData,
    summary,
    isLoading: !ready || query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
