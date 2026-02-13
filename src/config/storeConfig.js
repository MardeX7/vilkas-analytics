/**
 * VilkasAnalytics - Store Configuration
 *
 * TÄRKEÄ: Kaikki store/shop ID:t keskitetysti yhdessä paikassa!
 *
 * ID-MAPPAUS (Billackering.eu):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  TAULU              │  SARAKE     │  UUID                       │
 * ├─────────────────────────────────────────────────────────────────┤
 * │  shops              │  id         │  3b93e9b1-d64c-4686-...     │
 * │  orders             │  store_id   │  a28836f6-9487-4b67-...     │
 * │  gsc_tokens         │  store_id   │  a28836f6-9487-4b67-...     │
 * │  gsc_search_analytics│ store_id   │  a28836f6-9487-4b67-...     │
 * │  ga4_tokens         │  store_id   │  a28836f6-9487-4b67-...     │
 * │  ga4_ecommerce      │  shop_id    │  3b93e9b1-d64c-4686-...     │
 * │  products           │  store_id   │  a28836f6-9487-4b67-...     │
 * │  weekly_analyses    │  store_id   │  3b93e9b1-d64c-4686-...     │ (FK → shops.id)
 * │  action_recommendations │ store_id │  3b93e9b1-d64c-4686-...   │ (FK → shops.id)
 * │  chat_sessions      │  store_id   │  3b93e9b1-d64c-4686-...     │ (FK → shops.id)
 * │  chat_messages      │  session_id │  (via chat_sessions)        │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * HUOM: Kaksi eri ID:tä koska:
 * - STORE_ID = ePages/Vilkas kaupan alkuperäinen ID (orders, products, gsc, ga4_tokens)
 * - SHOP_ID  = shops-taulun UUID (ga4_ecommerce foreign key)
 *
 * Tulevaisuudessa: Hae nämä kirjautuneen käyttäjän profiilista!
 */

// Billackering.eu (Bil Lackering Sverige AB)
export const BILLACKERING = {
  // shops.id - käytetään ga4_ecommerce:ssa
  SHOP_ID: '3b93e9b1-d64c-4686-a14a-bec535495f71',

  // orders.store_id - käytetään orders, products, gsc_*, ga4_tokens
  STORE_ID: 'a28836f6-9487-4b67-9194-e907eaf94b69',

  // Helpot aliakset
  name: 'Billackering.eu',
  domain: 'billackering.eu',
  currency: 'SEK',
  locale: 'sv-SE'
}

// Aktiivinen kauppa (vaihda tätä jos lisätään muita kauppoja)
export const CURRENT_STORE = BILLACKERING

// Yksinkertaiset exportit (useimmin käytetyt)
export const STORE_ID = CURRENT_STORE.STORE_ID
export const SHOP_ID = CURRENT_STORE.SHOP_ID

/**
 * Apufunktio: Palauttaa oikean ID:n taulun mukaan
 *
 * @param {string} tableName - Taulun nimi (esim. 'orders', 'ga4_ecommerce')
 * @returns {object} - { column: 'store_id' | 'shop_id', value: UUID }
 */
export function getStoreIdForTable(tableName) {
  // AI Analytics tables use shops.id FK but column is named store_id
  const shopIdTables = ['ga4_ecommerce', 'shops', 'weekly_analyses', 'action_recommendations', 'chat_sessions', 'merchant_goals', 'context_notes', 'growth_engine_snapshots']
  const storeIdTables = ['orders', 'products', 'gsc_tokens', 'gsc_search_analytics', 'ga4_tokens', 'order_line_items']

  if (shopIdTables.includes(tableName)) {
    return { column: 'shop_id', value: SHOP_ID }
  }

  if (storeIdTables.includes(tableName)) {
    return { column: 'store_id', value: STORE_ID }
  }

  // Views käyttävät yleensä store_id
  if (tableName.startsWith('v_')) {
    return { column: 'store_id', value: STORE_ID }
  }

  console.warn(`⚠️ Unknown table "${tableName}" - defaulting to store_id`)
  return { column: 'store_id', value: STORE_ID }
}
