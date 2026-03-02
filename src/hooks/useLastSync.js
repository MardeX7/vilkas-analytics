import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCurrentShop } from '@/config/storeConfig'

/**
 * Returns the latest order creation_date for the current store.
 * This effectively shows "data freshness" — how recent the synced data is.
 */
export function useLastSync() {
  const { storeId, ready } = useCurrentShop()
  const [lastOrderDate, setLastOrderDate] = useState(null)

  useEffect(() => {
    if (!ready || !storeId) return

    async function fetch() {
      const { data } = await supabase
        .from('orders')
        .select('creation_date')
        .eq('store_id', storeId)
        .order('creation_date', { ascending: false })
        .limit(1)

      if (data?.[0]) {
        setLastOrderDate(new Date(data[0].creation_date))
      }
    }
    fetch()
  }, [storeId, ready])

  return { lastOrderDate }
}
