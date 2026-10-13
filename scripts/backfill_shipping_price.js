/**
 * Backfill orders.shipping_price from ePages.
 *
 * Until 2026-10-13 the syncs wrote 0 on every row (they read order.shippingPrice,
 * which ePages does not send). The fee is in shippingData.price on the order list,
 * so no order detail is fetched. See api/lib/epagesShipping.js.
 *
 * Dry run by default: reads ePages and the database, writes nothing, and prints
 * per delivery method the fees found and how many stored rows would change.
 * Pass --write to update the stored rows. It never inserts or deletes an order.
 *
 * Usage:
 *   node scripts/backfill_shipping_price.js [store_id] [--write]
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
require('dotenv').config({ path: path.join(root, '.env.local') })

const { createClient } = require('@supabase/supabase-js')
const { fetchOrderList } = await import('../api/lib/epagesOrderStatus.js')
const { shippingPriceGross, writeOrderShippingPrices } = await import('../api/lib/epagesShipping.js')

const args = process.argv.slice(2)
const write = args.includes('--write')
const onlyStore = args.find(a => !a.startsWith('--'))

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const money = n => n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const WINDOW_DAYS = 30

async function storedOrders(storeId) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('orders')
      .select('epages_order_id, creation_date, shipping_price, status')
      .eq('store_id', storeId)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

const { data: stores, error: storesError } = await supabase
  .from('stores')
  .select('id, domain, epages_shop_id, access_token')
if (storesError) throw storesError

// stores.id, not shops.id: a shop id would match nothing and print nothing
if (onlyStore && !stores.some(s => s.id === onlyStore)) {
  throw new Error(`No store has id ${onlyStore} (stores.id, see the shop table in CLAUDE.md)`)
}

for (const store of stores) {
  if (onlyStore && store.id !== onlyStore) continue
  if (!store.access_token || !store.epages_shop_id) continue

  const stored = await storedOrders(store.id)
  if (stored.length === 0) continue
  const apiUrl = `https://www.${store.domain.replace(/^www\./, '')}/rs/shops/${store.epages_shop_id}`
  const first = stored.map(o => new Date(o.creation_date).getTime()).sort((a, b) => a - b)[0]

  console.log(`\n=== ${store.domain} — stored ${stored.length} orders from ${new Date(first).toISOString().slice(0, 10)}`)

  // A window at a time: one list request over the whole history fails now and then
  const byId = new Map()
  for (let from = first - 864e5; from < Date.now(); from += WINDOW_DAYS * 864e5) {
    const orders = await fetchOrderList({
      apiUrl,
      accessToken: store.access_token,
      createdAfter: new Date(from).toISOString(),
      createdBefore: new Date(from + WINDOW_DAYS * 864e5).toISOString()
    })
    for (const order of orders) byId.set(order.orderId, order)
  }
  const storedById = new Map(stored.map(o => [o.epages_order_id, o]))
  const orders = [...byId.values()].filter(o => storedById.has(o.orderId))
  console.log(`ePages: ${byId.size} orders, ${orders.length} of them stored. Stored orders ePages did not return (left as they are): ${stored.length - orders.length}`)

  const byMethod = {}
  let wouldChange = 0
  let total = 0
  for (const order of orders) {
    const fee = shippingPriceGross(order)
    const row = storedById.get(order.orderId)
    if (Math.abs((parseFloat(row.shipping_price) || 0) - fee) > 0.005) wouldChange++
    if (row.status === 'cancelled') continue
    const method = order.shippingData?.shippingMethod?.name || '(none)'
    const m = (byMethod[method] ||= { orders: 0, paid: 0, sum: 0, fees: {} })
    m.orders++
    if (fee > 0) m.paid++
    m.sum += fee
    m.fees[fee] = (m.fees[fee] || 0) + 1
    total += fee
  }
  console.table(Object.entries(byMethod).map(([method, m]) => ({
    method,
    orders: m.orders,
    paid: m.paid,
    'fee total (incl. VAT)': money(m.sum),
    'most common fees': Object.entries(m.fees).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, n]) => `${f}: ${n}`).join(', ')
  })))
  console.log(`Fee total of non-cancelled orders: ${money(total)}. Stored rows that differ: ${wouldChange}`)

  if (write) {
    const result = await writeOrderShippingPrices(supabase, store.id, orders)
    console.log('Written:', result)
  } else {
    console.log('Dry run — pass --write to update the stored rows.')
  }
}
