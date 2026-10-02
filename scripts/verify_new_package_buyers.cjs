#!/usr/bin/env node
/**
 * Recomputes the "new package buyers per week" KPI from raw tables, in JS,
 * and compares it with get_new_package_buyers_weekly row by row. Shares no
 * code with the SQL function; only the definition is the same.
 *
 * Usage:
 *   node scripts/verify_new_package_buyers.cjs <FI|SE> [weeks=13] [--sql-json file.json]
 *   node scripts/verify_new_package_buyers.cjs FI --anchor 08-13 09-28 2026
 *
 * Default mode calls the RPC with the service role. --sql-json compares with
 * saved function output instead (rows from `supabase db query -o json`).
 *
 * --anchor reproduces the 2026-10-01 decline analysis: orders between the two
 * dates in the given year and the year before, "new" judged against the
 * 12 months before the window start (MM-DD .. MM-DD-1 of the previous year)
 * instead of before each order. Prints both lookbacks side by side.
 */
const { supabase } = require('./db.cjs')
const crypto = require('crypto')
const fs = require('fs')

const STORES = {
  FI: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2',
  SE: 'a28836f6-9487-4b67-9194-e907eaf94b69',
}

async function pageAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999)
    if (error) throw error
    out.push(...data)
    if (data.length < 1000) return out
  }
}

// --- time helpers -----------------------------------------------------------

const DAY = 86400000
const localDate = (ts, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(ts) // YYYY-MM-DD
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10)
const mondayOf = ymd => addDays(ymd, -((new Date(ymd + 'T00:00:00Z').getUTCDay() + 6) % 7))

// Local midnight of a date in tz, as epoch ms
function localMidnight(ymd, tz) {
  const guess = Date.parse(ymd + 'T00:00:00Z')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess).reduce((a, p) => ({ ...a, [p.type]: p.value }), {})
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return guess - (asUtc - guess)
}

// Postgres `ts - interval '12 months'` in the function's UTC session: same day a year back,
// clamped to the month's last day
function minusYear(ms) {
  const d = new Date(ms)
  const y = d.getUTCFullYear() - 1, m = d.getUTCMonth()
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())
}

const customerKey = o => {
  const e = (o.billing_email || '').replace(/^ +| +$/g, '')
  if (e) return crypto.createHash('md5').update(e.toLowerCase()).digest('hex')
  return o.customer_id ? `customer:${o.customer_id}` : null
}

// --- data -------------------------------------------------------------------

async function load(storeId) {
  const { data: shop, error } = await supabase.from('shops')
    .select('timezone, package_category').eq('store_id', storeId).single()
  if (error) throw error

  const allOrders = await pageAll((a, b) => supabase.from('orders')
    .select('id, epages_order_id, creation_date, grand_total, billing_email, customer_id, status')
    .eq('store_id', storeId).order('id').range(a, b))
  const { count } = await supabase.from('orders').select('*', { count: 'exact', head: true }).eq('store_id', storeId)
  if (new Set(allOrders.map(o => o.id)).size !== count) throw new Error(`orders: ${allOrders.length} fetched, ${count} in table`)

  const history = await pageAll((a, b) => supabase.from('customer_order_history')
    .select('epages_order_id, creation_date, customer_key').eq('store_id', storeId)
    .order('epages_order_id').range(a, b))

  const cats = await pageAll((a, b) => supabase.from('categories').select('id')
    .eq('store_id', storeId).eq('level2', shop.package_category).order('id').range(a, b))
  const pcs = await pageAll((a, b) => supabase.from('product_categories').select('product_id')
    .in('category_id', cats.map(c => c.id)).order('id').range(a, b))
  const productIds = [...new Set(pcs.map(p => p.product_id))]
  const products = []
  for (let i = 0; i < productIds.length; i += 150) {
    products.push(...await pageAll((a, b) => supabase.from('products').select('product_number')
      .eq('store_id', storeId).in('id', productIds.slice(i, i + 150)).order('id').range(a, b)))
  }
  const packageNumbers = [...new Set(products.map(p => p.product_number).filter(Boolean))]

  const storeOrderIds = new Set(allOrders.map(o => o.id))
  const packageLines = await pageAll((a, b) => supabase.from('order_line_items').select('order_id')
    .in('product_number', packageNumbers).order('id').range(a, b))
  const packageOrders = new Set(packageLines.map(l => l.order_id).filter(id => storeOrderIds.has(id)))

  // First order that has any line items
  let linesFrom = null
  const byTime = [...allOrders].sort((x, y) => Date.parse(x.creation_date) - Date.parse(y.creation_date))
  for (let i = 0; i < byTime.length && linesFrom === null; i += 200) {
    const chunk = byTime.slice(i, i + 200)
    const { data, error: e } = await supabase.from('order_line_items').select('order_id')
      .in('order_id', chunk.map(o => o.id)).limit(1000)
    if (e) throw e
    const hit = new Set(data.map(l => l.order_id))
    const first = chunk.find(o => hit.has(o.id))
    if (first) linesFrom = Date.parse(first.creation_date)
  }

  return { shop, allOrders, history, packageNumbers, packageOrders, linesFrom }
}

// Every non-cancelled order and history row as (time, customer key)
function customerEvents({ allOrders, history }) {
  const orderIds = new Set(allOrders.map(o => o.epages_order_id))
  const events = []
  for (const o of allOrders) {
    if (o.status === 'cancelled') continue
    events.push({ order: o, at: Date.parse(o.creation_date), key: customerKey(o) })
  }
  for (const h of history) {
    if (orderIds.has(h.epages_order_id)) continue
    events.push({ order: null, at: Date.parse(h.creation_date), key: h.customer_key })
  }
  return events
}

// --- weekly mode ------------------------------------------------------------

function weekly(data, weeks) {
  const tz = data.shop.timezone
  const events = customerEvents(data)

  // Previous order of the same customer, ties ordered like the SQL (history first, then order id)
  const byKey = new Map()
  for (const e of events) if (e.key) (byKey.get(e.key) || byKey.set(e.key, []).get(e.key)).push(e)
  const previous = new Map()
  for (const list of byKey.values()) {
    list.sort((x, y) => x.at - y.at || (x.order ? 1 : 0) - (y.order ? 1 : 0) || (x.order && y.order ? (x.order.id < y.order.id ? -1 : 1) : 0))
    list.forEach((e, i) => { if (e.order) previous.set(e.order.id, i > 0 ? list[i - 1].at : null) })
  }

  const thisWeek = mondayOf(localDate(Date.now(), tz))
  const firstWeek = addDays(thisWeek, -7 * (Math.min(Math.max(weeks, 1), 260) - 1))
  const lastOrder = Math.max(...data.allOrders.map(o => Date.parse(o.creation_date)))
  const keyed = events.filter(e => e.key)
  const historyFrom = Math.min(...keyed.map(e => e.at))

  // Two tallies: a week can be a current row and another row's year-earlier side
  const cur = new Map(), prv = new Map()
  const add = (m, w, cents) => { const a = m.get(w) || { n: 0, cents: 0 }; a.n += 1; a.cents += cents; m.set(w, a) }
  for (const e of events) {
    if (!e.order || !data.packageOrders.has(e.order.id)) continue
    const prev = e.key ? previous.get(e.order.id) : null
    if (prev !== null && prev !== undefined && prev >= minusYear(e.at)) continue
    const day = localDate(e.at, tz)
    const inCurrent = day >= firstWeek && day < addDays(thisWeek, 7)
    const inPrevious = day >= addDays(firstWeek, -364) && day < addDays(thisWeek, 7 - 364) && e.at <= lastOrder - 364 * DAY
    const w = mondayOf(day)
    const cents = Math.round(Number(e.order.grand_total) * 100)
    if (inCurrent) add(cur, w, cents)
    if (inPrevious) add(prv, w, cents)
  }

  const complete = w => {
    const start = localMidnight(w, tz)
    return data.linesFrom !== null && start >= data.linesFrom && minusYear(start) >= historyFrom
  }
  const rows = []
  for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
    const p = addDays(w, -364)
    rows.push({
      week_start: w, is_current: w === thisWeek,
      order_count: cur.get(w)?.n ?? 0, sales: (cur.get(w)?.cents ?? 0) / 100, complete: complete(w),
      prev_week_start: p, prev_order_count: prv.get(p)?.n ?? 0, prev_sales: (prv.get(p)?.cents ?? 0) / 100,
      prev_complete: complete(p),
    })
  }
  return rows
}

// --- anchor mode ------------------------------------------------------------

function anchor(data, from, to, year) {
  const tz = data.shop.timezone
  const events = customerEvents(data)
  const out = {}
  for (const y of [year - 1, year]) {
    const start = `${y}-${from}`, end = `${y}-${to}`
    const lookStart = `${y - 1}-${from}`
    const seen = new Set()
    for (const e of events) {
      const d = localDate(e.at, tz)
      if (e.key && d >= lookStart && d < start) seen.add(e.key)
    }
    const res = { anchor: { n: 0, cents: 0 }, rolling: { n: 0, cents: 0 } }
    const byKey = new Map()
    for (const e of events) if (e.key) (byKey.get(e.key) || byKey.set(e.key, []).get(e.key)).push(e.at)
    for (const e of events) {
      if (!e.order || !data.packageOrders.has(e.order.id)) continue
      const d = localDate(e.at, tz)
      if (d < start || d > end) continue
      const cents = Math.round(Number(e.order.grand_total) * 100)
      if (!e.key || !seen.has(e.key)) { res.anchor.n++; res.anchor.cents += cents }
      const lo = minusYear(e.at)
      const returning = e.key && byKey.get(e.key).some(t => t < e.at && t >= lo)
      if (!returning) { res.rolling.n++; res.rolling.cents += cents }
    }
    out[y] = res
  }
  const fmt = r => `${r.n} orders, ${(r.cents / 100).toFixed(2)}`
  for (const mode of ['anchor', 'rolling']) {
    console.log(`${mode.padEnd(8)} ${year - 1}: ${fmt(out[year - 1][mode])}   ${year}: ${fmt(out[year][mode])}`)
  }
  return out
}

// --- main -------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const key = args[0]
  const storeId = STORES[key]
  if (!storeId) throw new Error('usage: verify_new_package_buyers.cjs <FI|SE> [weeks] [--sql-json f] | --anchor MM-DD MM-DD YYYY')
  const data = await load(storeId)
  console.log(`${key}: ${data.allOrders.length} orders, ${data.history.length} history rows, ` +
    `${data.packageNumbers.length} package product numbers, ${data.packageOrders.size} orders with a package, ` +
    `line items from ${new Date(data.linesFrom).toISOString()}`)

  const ai = args.indexOf('--anchor')
  if (ai >= 0) { anchor(data, args[ai + 1], args[ai + 2], Number(args[ai + 3])); return }

  const weeks = Number(args[1]) || 13
  const mine = weekly(data, weeks)
  const si = args.indexOf('--sql-json')
  let theirs
  if (si >= 0) {
    theirs = JSON.parse(fs.readFileSync(args[si + 1])).rows
  } else {
    const { data: rows, error } = await supabase.rpc('get_new_package_buyers_weekly', { p_store_id: storeId, p_weeks: weeks })
    if (error) throw error
    theirs = rows
  }

  let diffs = 0
  const fields = ['is_current', 'order_count', 'sales', 'complete', 'prev_week_start', 'prev_order_count', 'prev_sales', 'prev_complete']
  if (theirs.length !== mine.length) { console.log(`row count: script ${mine.length}, function ${theirs.length}`); diffs++ }
  for (const m of mine) {
    const t = theirs.find(r => String(r.week_start).slice(0, 10) === m.week_start)
    const bad = !t ? ['missing'] : fields.filter(f => String(f.endsWith('sales') ? Number(t[f]) : t[f]).slice(0, 10) !== String(m[f]))
    if (bad.length) diffs++
    console.log(`${m.week_start}${m.is_current ? '*' : ' '} ${String(m.order_count).padStart(3)} ${m.sales.toFixed(2).padStart(10)}` +
      `${m.complete ? '' : ' (incomplete)'}  |  ${m.prev_week_start} ${String(m.prev_order_count).padStart(3)} ${m.prev_sales.toFixed(2).padStart(10)}` +
      `${m.prev_complete ? '' : ' (incomplete)'}${bad.length ? '   DIFF: ' + bad.map(f => `${f} fn=${t?.[f]}`).join(', ') : ''}`)
  }
  console.log(diffs ? `${diffs} rows differ` : `all ${mine.length} weeks match the function`)
  if (diffs) process.exit(2)
}
main().catch(e => { console.error(e); process.exit(1) })
