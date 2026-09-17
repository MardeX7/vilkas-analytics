#!/usr/bin/env node
/**
 * Read-only fetch of orders + line items straight from the ePages API.
 * Use when check-coverage.cjs shows the DB is missing line items for a period.
 * Writes NOTHING to Supabase — it only reads store credentials.
 *
 * Usage:
 *   node fetch-epages-orders.cjs <FI|SE> <afterISO> <beforeISO> <outFile.json>
 * Example:
 *   node fetch-epages-orders.cjs SE 2025-05-01T00:00:00.000Z 2025-08-21T00:00:00.000Z se2025.json
 *
 * Field notes (these bite if you guess):
 *   - line items live at  detail.lineItemContainer.productLineItems
 *   - the product code is `sku`, NOT `productNumber` — and sku may carry a
 *     suffix (`830320S`) that products.product_number lacks. Match on
 *     `productId` <-> products.epages_product_id instead.
 *   - `quantity` is {amount, unit}; unit is not always pieces (can be "l").
 *   - price is lineItemPrice.amount, gross (taxModel GROSS).
 */
const { supabase } = require('../../../scripts/db.cjs')
const fs = require('fs')

const STORES = {
  FI: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2',
  SE: 'a28836f6-9487-4b67-9194-e907eaf94b69',
}
const CONCURRENCY = 6

async function get(url, token, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.epages.v1+json' },
    })
    if (r.ok) return r.json()
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 800 * (i + 1))); continue }
    throw new Error(`HTTP ${r.status} ${url} — ${await r.text()}`)
  }
  throw new Error(`retries exhausted: ${url}`)
}

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (true) { const k = i++; if (k >= items.length) break; out[k] = await fn(items[k], k) }
  }))
  return out
}

async function main() {
  const [key, after, before, outFile] = process.argv.slice(2)
  if (!key || !after || !before || !outFile) {
    console.error('usage: fetch-epages-orders.cjs <FI|SE> <afterISO> <beforeISO> <outFile.json>')
    process.exit(1)
  }
  if (fs.existsSync(outFile)) { console.log(`cached: ${outFile} (delete to refetch)`); return }

  const { data: store, error } = await supabase.from('stores')
    .select('id,name,domain,epages_shop_id,access_token').eq('id', STORES[key] || key).single()
  if (error || !store) throw new Error(`store not found: ${key}`)
  if (!store.access_token) throw new Error(`store ${store.name} has no ePages access_token`)

  const api = `https://www.${store.domain.replace(/^www\./, '')}/rs/shops/${store.epages_shop_id}`

  const summaries = []
  for (let page = 1; ; page++) {
    const u = new URL(`${api}/orders`)
    u.searchParams.append('page', page)
    u.searchParams.append('resultsPerPage', 100)
    u.searchParams.append('createdAfter', after)
    u.searchParams.append('createdBefore', before)
    const j = await get(u.toString(), store.access_token)
    const items = j.items || []
    summaries.push(...items)
    if (items.length < 100) break
  }
  console.log(`${store.name}: ${summaries.length} orders listed`)

  const orders = await pool(summaries, CONCURRENCY, async (o, k) => {
    if (k % 100 === 0) process.stderr.write(`  ${k}/${summaries.length}\n`)
    const d = await get(`${api}/orders/${o.orderId}`, store.access_token)
    return {
      orderId: o.orderId,
      orderNumber: o.orderNumber,
      creationDate: o.creationDate,
      grandTotal: parseFloat(o.grandTotal),
      currency: o.currencyId,
      lineItems: (d.lineItemContainer?.productLineItems || []).map(li => ({
        sku: li.sku,
        productId: li.productId,
        name: li.name,
        qty: li.quantity?.amount ?? li.quantity,
        unit: li.quantity?.unit ?? null,
        lineTotal: parseFloat(li.lineItemPrice?.amount ?? 0),
      })),
    }
  })

  fs.writeFileSync(outFile, JSON.stringify(orders))
  console.log(`saved ${outFile}: ${orders.length} orders, ${orders.reduce((s, o) => s + o.lineItems.length, 0)} line items`)
  console.log('NEXT: cross-validate against the DB on a window where coverage is 100%. Expect a 0 difference.')
}
main().catch(e => { console.error(e); process.exit(1) })
