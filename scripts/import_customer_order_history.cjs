#!/usr/bin/env node
/**
 * Import ePages order lists into customer_order_history: the customer lookback
 * that get_new_package_buyers_weekly needs from before the orders table begins
 * (2025-01-01 in both shops).
 *
 * Input is the output of
 *   node .claude/skills/analyzing-category-sales/fetch-epages-orders.cjs <FI|SE> <after> <before> <out.json> --no-lines
 * which leaves rejected orders out. No email is written: the key is
 * md5(lower(btrim(email))), the same expression the SQL function applies to
 * orders.billing_email. Orders without an email are skipped.
 *
 * Usage:
 *   node scripts/import_customer_order_history.cjs <FI|SE> <file.json>... [--write]
 * Without --write it only reports what it would import.
 */
const { supabase } = require('./db.cjs')
const crypto = require('crypto')
const fs = require('fs')

const STORES = {
  FI: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2',
  SE: 'a28836f6-9487-4b67-9194-e907eaf94b69',
}

// Postgres btrim() without a second argument strips spaces only
const customerKey = email => crypto.createHash('md5').update(email.replace(/^ +| +$/g, '').toLowerCase()).digest('hex')

async function main() {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const [key, ...files] = args.filter(a => a !== '--write')
  const storeId = STORES[key]
  if (!storeId || files.length === 0) {
    console.error('usage: import_customer_order_history.cjs <FI|SE> <file.json>... [--write]')
    process.exit(1)
  }

  const byId = new Map()
  let noEmail = 0
  let nonAscii = 0
  for (const f of files) {
    for (const o of JSON.parse(fs.readFileSync(f))) {
      // Files fetched before --no-lines existed have no email field at all
      if (!('email' in o)) throw new Error(`${f}: no email field, refetch with --no-lines`)
      if (!o.email || !o.email.trim()) { noEmail++; continue }
      // JS and Postgres lower-case non-ASCII letters by different rules
      if (/[^\x00-\x7F]/.test(o.email)) nonAscii++
      byId.set(o.orderId, {
        store_id: storeId,
        epages_order_id: o.orderId,
        creation_date: o.creationDate,
        customer_key: customerKey(o.email),
      })
    }
  }
  const rows = [...byId.values()]

  const perMonth = {}
  for (const r of rows) perMonth[r.creation_date.slice(0, 7)] = (perMonth[r.creation_date.slice(0, 7)] || 0) + 1
  console.log(`${key}: ${rows.length} orders, ${new Set(rows.map(r => r.customer_key)).size} customers, ` +
    `${noEmail} skipped without email, ${nonAscii} non-ASCII emails`)
  console.log(perMonth)
  if (nonAscii) throw new Error('non-ASCII emails: check that md5(lower()) matches in Postgres before importing')
  if (!write) { console.log('dry run: add --write to import'); return }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('customer_order_history')
      .upsert(rows.slice(i, i + 500), { onConflict: 'store_id,epages_order_id' })
    if (error) throw error
  }
  const { count, error } = await supabase.from('customer_order_history')
    .select('*', { count: 'exact', head: true }).eq('store_id', storeId)
  if (error) throw error
  console.log(`written; customer_order_history now holds ${count} rows for ${key}`)
}
main().catch(e => { console.error(e); process.exit(1) })
