/**
 * useNewPackageBuyers Hook
 *
 * Uudet pakettiostajat viikoittain: tilaukset ja myynti (verollinen) asiakkailta,
 * joilla ei ole tilausta edeltävän 12 kk aikana ja joiden tilauksessa on paketti.
 * Vertailu samaan viikkoon vuotta aiemmin (364 pv).
 * Käyttää get_new_package_buyers_weekly RPC:tä. Tyhjä lista = kaupalle ei ole
 * määritelty pakettikategoriaa (shops.package_category).
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

async function fetchNewPackageBuyers(storeId, weeks) {
  const { data, error } = await supabase.rpc('get_new_package_buyers_weekly', {
    p_store_id: storeId,
    p_weeks: weeks
  })

  if (error) {
    throw new Error(`Failed to fetch new package buyers: ${error.message}`)
  }

  return (data || []).map(row => ({
    weekStart: row.week_start,
    isCurrent: row.is_current,
    orders: Number(row.order_count),
    sales: Number(row.sales),
    complete: row.complete,
    prevWeekStart: row.prev_week_start,
    prevOrders: Number(row.prev_order_count),
    prevSales: Number(row.prev_sales),
    prevComplete: row.prev_complete
  }))
}

/**
 * @param {object} options
 * @param {number} options.weeks - Viikkoja kuluva viikko mukaan lukien
 * @returns {{ weeks: Array, isLoading: boolean, error: Error|null }}
 */
export function useNewPackageBuyers({ weeks = 13 } = {}) {
  const { storeId, ready } = useCurrentShop()

  const query = useQuery({
    queryKey: ['newPackageBuyers', storeId, weeks],
    queryFn: () => fetchNewPackageBuyers(storeId, weeks),
    staleTime: 5 * 60 * 1000,
    enabled: ready && !!storeId
  })

  return {
    weeks: query.data || [],
    isLoading: query.isLoading,
    error: query.error
  }
}
