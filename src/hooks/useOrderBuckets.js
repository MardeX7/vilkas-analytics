/**
 * useOrderBuckets Hook
 *
 * Laskee tilausten histogrammijakauman client-sidella.
 * Käyttää dynaamista bucket-kokoa tilausdatan perusteella.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Hae tilaukset ja laske histogrammi
 */
async function fetchOrderHistogram(storeId, startDate, endDate) {
  // Paginate orders to get all
  let allOrders = []
  let from = 0
  const pageSize = 1000
  while (true) {
    let query = supabase
      .from('orders')
      .select('grand_total, total_before_tax, total_tax, is_b2b')
      .eq('store_id', storeId)
      .neq('status', 'cancelled')
      .range(from, from + pageSize - 1)

    if (startDate) query = query.gte('creation_date', startDate)
    if (endDate) query = query.lte('creation_date', endDate + 'T23:59:59')

    const { data, error } = await query
    if (error) throw new Error(`Failed to fetch orders: ${error.message}`)
    allOrders = allOrders.concat(data || [])
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  if (allOrders.length === 0) return { buckets: [], summary: null }

  // Get order values (use total_before_tax if available, else grand_total)
  const values = allOrders.map(o => {
    const val = o.total_before_tax || (o.grand_total - (o.total_tax || 0)) || o.grand_total || 0
    return { value: val, isB2B: o.is_b2b }
  })

  // Find range
  const allValues = values.map(v => v.value).sort((a, b) => a - b)
  const maxValue = allValues[Math.floor(allValues.length * 0.98)] || allValues[allValues.length - 1] // 98th percentile as max

  // Determine bucket size based on data range
  let bucketSize
  if (maxValue <= 100) bucketSize = 10
  else if (maxValue <= 300) bucketSize = 25
  else if (maxValue <= 500) bucketSize = 50
  else if (maxValue <= 1000) bucketSize = 100
  else if (maxValue <= 3000) bucketSize = 200
  else if (maxValue <= 10000) bucketSize = 500
  else bucketSize = 1000

  // Create buckets
  const numBuckets = Math.ceil(maxValue / bucketSize) + 1 // +1 for overflow
  const buckets = []

  for (let i = 0; i < numBuckets; i++) {
    const low = i * bucketSize
    const high = (i + 1) * bucketSize
    buckets.push({
      low,
      high,
      name: `${low}`,
      tilaukset: 0,
      liikevaihto: 0,
      b2b: 0,
      b2c: 0
    })
  }

  // Overflow bucket for values above 98th percentile
  const overflowLabel = `${numBuckets * bucketSize}+`

  // Fill buckets
  let overflowCount = 0, overflowRevenue = 0, overflowB2B = 0, overflowB2C = 0

  for (const { value, isB2B } of values) {
    const idx = Math.min(Math.floor(value / bucketSize), numBuckets - 1)
    if (idx >= buckets.length) {
      overflowCount++
      overflowRevenue += value
      if (isB2B) overflowB2B++; else overflowB2C++
    } else {
      buckets[idx].tilaukset++
      buckets[idx].liikevaihto += value
      if (isB2B) buckets[idx].b2b++; else buckets[idx].b2c++
    }
  }

  // Remove empty trailing buckets (but keep overflow if it has data)
  let lastNonEmpty = buckets.length - 1
  while (lastNonEmpty > 0 && buckets[lastNonEmpty].tilaukset === 0) lastNonEmpty--
  const trimmedBuckets = buckets.slice(0, lastNonEmpty + 1)

  // Add overflow bucket if needed
  if (overflowCount > 0) {
    trimmedBuckets.push({
      name: overflowLabel,
      tilaukset: overflowCount,
      liikevaihto: Math.round(overflowRevenue),
      b2b: overflowB2B,
      b2c: overflowB2C
    })
  }

  // Add keskiostos
  trimmedBuckets.forEach(b => {
    b.liikevaihto = Math.round(b.liikevaihto)
    b.keskiostos = b.tilaukset > 0 ? Math.round(b.liikevaihto / b.tilaukset) : 0
  })

  const totalOrders = values.length
  const totalRevenue = values.reduce((sum, v) => sum + v.value, 0)

  return {
    buckets: trimmedBuckets,
    bucketSize,
    summary: {
      totalOrders,
      totalRevenue,
      b2bOrders: values.filter(v => v.isB2B).length,
      b2cOrders: values.filter(v => !v.isB2B).length,
      avgOrderValue: totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0,
      medianOrderValue: Math.round(allValues[Math.floor(allValues.length / 2)] || 0)
    }
  }
}

/**
 * Hook tilausten histogrammiin
 */
export function useOrderBuckets({ startDate: propStartDate, endDate: propEndDate } = {}) {
  const { storeId, ready } = useCurrentShop()

  const endDate = propEndDate || new Date().toISOString().split('T')[0]
  const startDate = propStartDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const query = useQuery({
    queryKey: ['orderBuckets', storeId, startDate, endDate],
    queryFn: () => fetchOrderHistogram(storeId, startDate, endDate),
    staleTime: 5 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
    enabled: ready && !!storeId
  })

  return {
    chartData: query.data?.buckets || [],
    summary: query.data?.summary || null,
    bucketSize: query.data?.bucketSize || 100,
    isLoading: !ready || query.isLoading,
    error: query.error,
    refetch: query.refetch
  }
}
