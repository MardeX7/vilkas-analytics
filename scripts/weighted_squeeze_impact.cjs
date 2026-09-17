/**
 * Sales-weighted margin-leak for the SE (Billackering) products whose purchase
 * price was raised but sale price left unchanged ("kateleikkaus").
 *
 *   node scripts/weighted_squeeze_impact.cjs
 *
 * OLD  = Produkter(14).csv (early May, before increase)
 * CURR = products table (current cost_price / price_amount)
 * Sales = order_line_items joined to orders.creation_date (last 30 & 90 days)
 *
 * Leak per period = units_sold * (newCost - oldCost)
 *   (price unchanged => every unit now earns exactly Δcost less margin)
 *
 * Writes: Billackering_kateleikkaus_42.csv  (semicolon, UTF-8 BOM, EU decimals)
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const CSV_FILE = 'Produkter(14).csv'
const PRICE_COL = '[ListPrices/SEK/gross]'
const REF = Date.UTC(2026, 5, 10) // 2026-06-10 reference "today" (Date.now unavailable in some contexts)

// ---- robust CSV parser (quoted fields, embedded newlines, "" escapes) ----
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else {
      if (c === '"') q = true
      else if (c === ';') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') {}
      else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}
const num = (s) => {
  if (s == null) return null
  const t = String(s).replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const v = parseFloat(t); return isNaN(v) ? null : v
}
const eu = (x, d = 2) => x == null ? '' : x.toFixed(d).replace('.', ',') // EU decimal for CSV
const f1 = (x) => x == null ? '–' : x.toFixed(1)
const f2 = (x) => x == null ? '–' : x.toFixed(2)

function loadOldCsv() {
  const raw = fs.readFileSync(path.join(__dirname, '..', CSV_FILE), 'utf-8').replace(/^﻿/, '')
  const rows = parseCSV(raw)
  const h = rows[0]
  const ix = (f) => h.findIndex(x => x.includes(f))
  const iA = ix('[Alias]'), iC = ix('[GBasePurchasePrice]'), iP = ix(PRICE_COL), iM = ix('[Manufacturer]')
  const m = new Map()
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r]; const a = (c[iA] || '').trim()
    if (!a) continue
    m.set(a, { oldCost: num(c[iC]), oldPrice: num(c[iP]), man: (c[iM] || '').trim() })
  }
  return m
}

async function fetchAll(table, select, filterFn) {
  const all = []; let from = 0
  for (;;) {
    let q = supabase.from(table).select(select).range(from, from + 999)
    q = filterFn(q)
    const { data, error } = await q
    if (error) throw error
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

async function salesByProduct(sinceISO) {
  // 1) billackering orders in window -> id set
  const orders = await fetchAll('orders', 'id, creation_date',
    q => q.eq('store_id', STORE_ID).gte('creation_date', sinceISO))
  const ids = new Set(orders.map(o => o.id))
  if (ids.size === 0) return new Map()
  // 2) line items for those orders, aggregate qty by product_number
  const idArr = [...ids]
  const units = new Map()
  for (let i = 0; i < idArr.length; i += 200) {
    const chunk = idArr.slice(i, i + 200)
    const li = await fetchAll('order_line_items', 'product_number, quantity',
      q => q.in('order_id', chunk))
    for (const r of li) {
      if (!r.product_number) continue
      units.set(r.product_number, (units.get(r.product_number) || 0) + (r.quantity || 0))
    }
  }
  return units
}

const pct = (a, b) => (a && b != null) ? ((b - a) / a) * 100 : null

async function main() {
  printProjectInfo()
  const old = loadOldCsv()
  const db = await fetchAll('products',
    'product_number, name, price_amount, cost_price, manufacturer, for_sale, stock_level',
    q => q.eq('store_id', STORE_ID))

  // identify the squeeze list (same criteria as compare_cost_increase.cjs)
  const squeeze = []
  for (const p of db) {
    const o = old.get(p.product_number)
    if (!o || o.oldCost == null || o.oldPrice == null) continue
    if (p.cost_price == null || p.price_amount == null) continue
    const dCost = p.cost_price - o.oldCost
    if (dCost <= 0.001) continue
    if (!(pct(o.oldPrice, p.price_amount) < pct(o.oldCost, p.cost_price) - 2)) continue
    squeeze.push({
      pn: p.product_number, name: p.name,
      man: (p.manufacturer || o.man || 'Tuntematon').trim() || 'Tuntematon',
      oldCost: o.oldCost, newCost: p.cost_price, dCost,
      oldPrice: o.oldPrice, newPrice: p.price_amount,
      oldMargin: o.oldPrice > 0 ? (1 - o.oldCost / o.oldPrice) * 100 : null,
      newMargin: p.price_amount > 0 ? (1 - p.cost_price / p.price_amount) * 100 : null,
      forSale: p.for_sale, stock: p.stock_level,
    })
  }

  // sales weighting
  const since30 = new Date(REF - 30 * 864e5).toISOString()
  const since90 = new Date(REF - 90 * 864e5).toISOString()
  const u30 = await salesByProduct(since30)
  const u90 = await salesByProduct(since90)

  for (const s of squeeze) {
    s.units30 = u30.get(s.pn) || 0
    s.units90 = u90.get(s.pn) || 0
    s.leak30 = s.units30 * s.dCost          // SEK margin lost over 30d vs old baseline
    s.leak90 = s.units90 * s.dCost
    s.leakWeek = s.leak90 / (90 / 7)        // weekly run-rate from 90d
  }

  squeeze.sort((a, b) => b.leak90 - a.leak90)

  // ---- console report ----
  const tot30 = squeeze.reduce((s, x) => s + x.leak30, 0)
  const tot90 = squeeze.reduce((s, x) => s + x.leak90, 0)
  console.log(`\n🇸🇪 BILLACKERING — kateleikkauksen myynnillä painotettu vaikutus`)
  console.log(`${squeeze.length} tuotetta (osto nousi, hinta ennallaan)`)
  console.log(`Vuoto vs. vanha kate: 30 pv = ${f1(tot30)} SEK · 90 pv = ${f1(tot90)} SEK · ~${f1(tot90 / (90 / 7))} SEK/vko`)
  console.log(`\nTOP 15 vuotavinta (90 pv):`)
  console.log(`${'Tuote'.padEnd(13)} ${'Nimi'.padEnd(30)} ${'kpl90'.padStart(6)} ${'Δosto'.padStart(7)} ${'vuoto90'.padStart(9)} kate%`)
  for (const s of squeeze.slice(0, 15)) {
    console.log(`${s.pn.padEnd(13)} ${(s.name || '').slice(0, 29).padEnd(30)} ${String(s.units90).padStart(6)} ${f2(s.dCost).padStart(7)} ${f1(s.leak90).padStart(9)}  ${f1(s.oldMargin)}→${f1(s.newMargin)}`)
  }
  const noSales = squeeze.filter(s => s.units90 === 0).length
  console.log(`\n${noSales}/${squeeze.length} tuotetta ei myynyt yhtään kpl 90 pv:ssä (ei kiireellinen).`)

  // ---- write CSV (semicolon, BOM, EU decimals) ----
  const headers = [
    'Tuotekoodi', 'Nimi', 'Valmistaja',
    'Ostohinta_vanha_SEK', 'Ostohinta_uusi_SEK', 'Ostohinnan_nousu_SEK', 'Ostohinnan_nousu_%',
    'Myyntihinta_SEK', 'Kate_vanha_%', 'Kate_uusi_%', 'Kate_pudotus_pp',
    'Myyty_kpl_30pv', 'Myyty_kpl_90pv', 'Vuoto_30pv_SEK', 'Vuoto_90pv_SEK', 'Vuoto_per_vko_SEK',
    'Suositushinta_70%_kate_SEK', 'Myynnissa', 'Varasto',
  ]
  const lines = [headers.join(';')]
  for (const s of squeeze) {
    const recPrice = s.newCost / (1 - 0.70) // price to restore 70% margin
    lines.push([
      s.pn, (s.name || '').replace(/;/g, ','), s.man,
      eu(s.oldCost), eu(s.newCost), eu(s.dCost), eu(pct(s.oldCost, s.newCost), 1),
      eu(s.newPrice), eu(s.oldMargin, 1), eu(s.newMargin, 1), eu((s.oldMargin - s.newMargin), 1),
      s.units30, s.units90, eu(s.leak30), eu(s.leak90), eu(s.leakWeek),
      eu(Math.round(recPrice)), s.forSale ? 'kyllä' : 'ei', s.stock,
    ].join(';'))
  }
  const outPath = path.join(__dirname, '..', 'Billackering_kateleikkaus_42.csv')
  fs.writeFileSync(outPath, '﻿' + lines.join('\n'), 'utf-8')
  console.log(`\n📄 CSV kirjoitettu: ${outPath} (${squeeze.length} riviä)`)
}
main().catch(e => { console.error(e); process.exit(1) })
