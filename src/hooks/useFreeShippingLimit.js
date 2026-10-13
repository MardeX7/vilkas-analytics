/**
 * useFreeShippingLimit Hook
 *
 * Ilmaisen toimituksen rajan seuranta viikoittain: kate + toimitusmaksut (veroton),
 * rajan lähellä olevat korit ja uudella rajalla ilmaiseksi kulkeneet tilaukset.
 * Vertailu samaan viikkoon vuotta aiemmin (364 pv), ilmaistoimituskampanjoiden
 * päivät pois molemmilta puolilta.
 * Käyttää get_free_shipping_limit_weekly RPC:tä. Tyhjä lista = kaupalle ei ole
 * määritelty seurattavaa muutosta (shops.free_shipping_change).
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

async function fetchFreeShippingLimit(storeId, weeks) {
  const { data, error } = await supabase.rpc('get_free_shipping_limit_weekly', {
    p_store_id: storeId,
    p_weeks: weeks
  })

  if (error) {
    throw new Error(`Failed to fetch free shipping limit KPI: ${error.message}`)
  }

  return (data || []).map(row => ({
    weekStart: row.week_start,
    isCurrent: row.is_current,
    phase: row.phase,
    orders: Number(row.order_count),
    contribution: Number(row.contribution),
    nearBelow: Number(row.near_below),
    nearAbove: Number(row.near_above),
    freeOrders: Number(row.free_orders),
    feeGivenUp: Number(row.fee_given_up),
    campaignDays: Number(row.campaign_days),
    complete: row.complete,
    prevWeekStart: row.prev_week_start,
    prevOrders: Number(row.prev_order_count),
    prevContribution: Number(row.prev_contribution),
    prevNearBelow: Number(row.prev_near_below),
    prevNearAbove: Number(row.prev_near_above),
    prevCampaignDays: Number(row.prev_campaign_days),
    prevComplete: row.prev_complete,
    changedOn: row.changed_on,
    oldLimit: Number(row.old_limit),
    newLimit: Number(row.new_limit),
    nearFrom: Number(row.near_from),
    nearTo: Number(row.near_to),
    freeOrdersTotal: Number(row.free_orders_total),
    feeGivenUpTotal: Number(row.fee_given_up_total)
  }))
}

/**
 * @param {object} options
 * @param {number} options.weeks - Viikkoja kuluva viikko mukaan lukien
 * @returns {{ weeks: Array, isLoading: boolean, error: Error|null }}
 */
export function useFreeShippingLimit({ weeks = 13 } = {}) {
  const { storeId, ready } = useCurrentShop()

  const query = useQuery({
    queryKey: ['freeShippingLimit', storeId, weeks],
    queryFn: () => fetchFreeShippingLimit(storeId, weeks),
    staleTime: 5 * 60 * 1000,
    enabled: ready && !!storeId
  })

  return {
    weeks: query.data || [],
    isLoading: query.isLoading,
    error: query.error
  }
}
