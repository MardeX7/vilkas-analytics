/**
 * VilkasAnalytics - Store Configuration (Multi-tenant)
 *
 * ID-MAPPAUS:
 * - STORE_ID = stores.id (UUID) = shops.store_id (TEXT) — orders, products, gsc_*, ga4_tokens
 * - SHOP_ID  = shops.id (UUID) — ga4_ecommerce, weekly_analyses, chat_sessions jne.
 *
 * Molemmat haetaan dynaamisesti AuthContextista (currentShop).
 * get_user_shops() RPC palauttaa: { shop_id, shop_name, store_id, role, joined_at }
 */

import { useAuth } from '@/contexts/AuthContext'

/**
 * useCurrentShop - Hook joka palauttaa aktiivisen kaupan ID:t
 *
 * @returns {{ storeId: string, shopId: string, currency: string, shopName: string, ready: boolean }}
 */
export function useCurrentShop() {
  const { currentShop } = useAuth()

  if (!currentShop) {
    return { storeId: null, shopId: null, currency: 'EUR', shopName: '', ready: false }
  }

  const currency = currentShop.currency || 'EUR'
  return {
    storeId: currentShop.store_id,   // stores.id (UUID as TEXT) — orders, products, gsc_*, ga4_tokens
    shopId: currentShop.shop_id,     // shops.id (UUID) — ga4_ecommerce, weekly_analyses, chat_sessions
    currency,
    currencySymbol: currency === 'EUR' ? '€' : 'kr',
    shopName: currentShop.shop_name || '',
    domain: currentShop.domain || '',
    ready: true
  }
}

/**
 * Apufunktio: Palauttaa oikean sarakkeen ja ID:n taulun mukaan
 *
 * @param {string} tableName - Taulun nimi
 * @param {string} storeId - stores.id (ePages)
 * @param {string} shopId - shops.id (analytics)
 * @returns {{ column: string, value: string }}
 */
export function getStoreIdForTable(tableName, storeId, shopId) {
  const shopIdTables = ['ga4_ecommerce', 'shops', 'weekly_analyses', 'action_recommendations', 'chat_sessions', 'merchant_goals', 'context_notes', 'growth_engine_snapshots']
  const storeIdTables = ['orders', 'products', 'gsc_tokens', 'gsc_search_analytics', 'ga4_tokens', 'order_line_items']

  if (shopIdTables.includes(tableName)) {
    return { column: 'shop_id', value: shopId }
  }

  if (storeIdTables.includes(tableName)) {
    return { column: 'store_id', value: storeId }
  }

  // Views use store_id
  if (tableName.startsWith('v_')) {
    return { column: 'store_id', value: storeId }
  }

  console.warn(`Unknown table "${tableName}" - defaulting to store_id`)
  return { column: 'store_id', value: storeId }
}
