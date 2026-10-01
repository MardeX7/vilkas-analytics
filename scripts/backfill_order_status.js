/**
 * Backfill orders.status and the status timestamps from ePages, and compare the
 * stored orders with ePages month by month.
 *
 * Until 2026-10-01 the syncs wrote status 'pending' and NULL paid_on/dispatched_on/
 * delivered_on on every row (they read order.status, which ePages does not send),
 * so rejected orders counted as sales. See api/lib/epagesOrderStatus.js.
 *
 * Dry run by default: reads ePages and the database, writes nothing, and prints
 *   - the status changes the backfill would make
 *   - per month: ePages orders without rejected ones vs stored orders without
 *     cancelled ones as they will be after the backfill (count, grand total)
 *   - orders ePages has that are not stored, and stored orders ePages does not have
 * Pass --write to update the stored rows. It never inserts or deletes an order.
 *
 * Usage:
 *   node scripts/backfill_order_status.js [store_id] [--write]
 */
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
require('dotenv').config({ path: path.join(root, '.env.local') })

const { createClient } = require('@supabase/supabase-js')
const { fetchOrderList, orderStatusColumns, writeOrderStatuses } = await import('../api/lib/epagesOrderStatus.js')

const args = process.argv.slice(2)
const write = args.includes('--write')
const onlyStore = args.find(a => !a.startsWith('--'))

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const ms = ts => (ts ? new Date(ts).getTime() : null)
const money = n => n.toLocaleString('fi-FI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const STALE_DAYS = 14

async function storedOrders(storeId) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('orders')
      .select('epages_order_id, order_number, creation_date, grand_total, status, paid_on, dispatched_on, delivered_on, closed_on')
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
  .select('id, domain, locale, epages_shop_id, access_token')
if (storesError) throw storesError

for (const store of stores) {
  if (onlyStore && store.id !== onlyStore) continue
  if (!store.access_token || !store.epages_shop_id) continue

  const timeZone = store.locale === 'sv_SE' ? 'Europe/Stockholm' : 'Europe/Helsinki'
  const monthOf = ts => new Date(ts).toLocaleString('sv-SE', { timeZone }).slice(0, 7)
  const apiUrl = `https://www.${store.domain.replace(/^www\./, '')}/rs/shops/${store.epages_shop_id}`

  const stored = await storedOrders(store.id)
  if (stored.length === 0) continue
  const firstMonth = stored.map(o => monthOf(o.creation_date)).sort()[0]
  // Local midnight on the 1st is 21:00-23:00 UTC the day before in both zones;
  // orders before firstMonth are fetched but left out of the comparison.
  const createdAfter = new Date(Date.parse(`${firstMonth}-01T00:00:00Z`) - 3 * 3600e3).toISOString()

  console.log(`\n=== ${store.domain} (${timeZone}) — stored ${stored.length} orders from ${firstMonth}`)
  const orders = await fetchOrderList({ apiUrl, accessToken: store.access_token, createdAfter })
  console.log(`ePages: ${orders.length} orders created after ${createdAfter}`)

  const storedById = new Map(stored.map(o => [o.epages_order_id, o]))
  const epagesById = new Map(orders.map(o => [o.orderId, o]))

  const transitions = {}
  const stale = { paid: 0, pending: 0 }
  const now = Date.now()
  for (const order of orders) {
    const row = storedById.get(order.orderId)
    if (!row) continue
    const next = orderStatusColumns(order)
    const differs = next.status !== row.status
      || ms(next.paid_on) !== ms(row.paid_on)
      || ms(next.dispatched_on) !== ms(row.dispatched_on)
      || ms(next.delivered_on) !== ms(row.delivered_on)
      || ms(next.closed_on) !== ms(row.closed_on)
    if (differs) {
      const key = `${row.status} -> ${next.status}`
      transitions[key] = (transitions[key] || 0) + 1
    }
    if (next.status in stale && now - ms(order.creationDate) > STALE_DAYS * 864e5) stale[next.status]++
  }
  console.log('Status changes:', Object.keys(transitions).length ? transitions : 'none')
  console.log(`Older than ${STALE_DAYS} days and still paid/pending after backfill:`, stale)

  // Month by month, as the stored rows will be after the backfill
  const months = {}
  const bucket = m => (months[m] ||= { ep: 0, epSum: 0, db: 0, dbSum: 0, missing: [], extra: [], cancelled: 0 })
  for (const order of orders) {
    const m = monthOf(order.creationDate)
    if (m < firstMonth) continue
    const b = bucket(m)
    if (order.rejectedOn) {
      b.cancelled++
      continue
    }
    b.ep++
    b.epSum += parseFloat(order.grandTotal) || 0
    if (!storedById.has(order.orderId)) b.missing.push(order.orderNumber)
  }
  for (const row of stored) {
    const order = epagesById.get(row.epages_order_id)
    const status = order ? orderStatusColumns(order).status : row.status
    if (status === 'cancelled') continue
    const b = bucket(monthOf(row.creation_date))
    b.db++
    b.dbSum += parseFloat(row.grand_total) || 0
    if (!order) b.extra.push(row.order_number)
  }

  const table = Object.keys(months).sort().map(m => {
    const b = months[m]
    return {
      month: m,
      'ePages orders': b.ep,
      'stored orders': b.db,
      'ePages total': money(b.epSum),
      'stored total': money(b.dbSum),
      difference: money(b.dbSum - b.epSum),
      rejected: b.cancelled,
      'missing from DB': b.missing.length,
      'not in ePages': b.extra.length
    }
  })
  console.table(table)
  for (const m of Object.keys(months).sort()) {
    const b = months[m]
    if (b.missing.length) console.log(`${m} missing from DB: ${b.missing.join(', ')}`)
    if (b.extra.length) console.log(`${m} not in ePages: ${b.extra.length} orders, e.g. ${b.extra.slice(0, 5).join(', ')}`)
  }

  if (write) {
    const result = await writeOrderStatuses(supabase, store.id, orders.filter(o => storedById.has(o.orderId)))
    console.log('Written:', result)
  } else {
    console.log('Dry run — pass --write to update the stored rows.')
  }
}
