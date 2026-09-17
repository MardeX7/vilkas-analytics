/**
 * One-off: compare OLD prices (early-May ePages CSV export) vs CURRENT prices (DB)
 * to quantify the manual cost/price increase Rahu & Pia did.
 *
 *   node scripts/compare_cost_increase.cjs
 *
 * OLD  = CSV  (Tuotteet(29).csv = FI/EUR, Produkter(14).csv = SE/SEK)  -> before increase
 * CURR = products table (cost_price, price_amount)                     -> current
 * Join = CSV [Alias] === products.product_number
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const STORES = {
  automaalit: {
    store_id: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2',
    csv: 'Tuotteet(29).csv',
    priceCol: '[ListPrices/EUR/gross]',
    cur: 'EUR', flag: '🇫🇮',
  },
  billackering: {
    store_id: 'a28836f6-9487-4b67-9194-e907eaf94b69',
    csv: 'Produkter(14).csv',
    priceCol: '[ListPrices/SEK/gross]',
    cur: 'SEK', flag: '🇸🇪',
  },
}

// ---- robust CSV parser: handles ; separator, quoted fields, embedded newlines, "" escapes
function parseCSV(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ';') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else if (c === '\r') { /* skip */ }
      else field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

const num = (s) => {
  if (s == null) return null
  const t = String(s).replace(/ /g, '').replace(/\s/g, '').replace(',', '.')
  if (t === '') return null
  const v = parseFloat(t)
  return isNaN(v) ? null : v
}

function loadCSV(file, priceCol) {
  const raw = fs.readFileSync(path.join(__dirname, '..', file), 'utf-8').replace(/^﻿/, '')
  const rows = parseCSV(raw)
  const header = rows[0]
  const ix = (frag) => header.findIndex(h => h.includes(frag))
  const iAlias = ix('[Alias]')
  const iCost = ix('[GBasePurchasePrice]')
  const iPrice = ix(priceCol)
  const iMan = ix('[Manufacturer]')
  const map = new Map()
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r]
    const alias = (cols[iAlias] || '').trim()
    if (!alias) continue
    map.set(alias, {
      oldCost: num(cols[iCost]),
      oldPrice: num(cols[iPrice]),
      manufacturer: (cols[iMan] || '').trim(),
    })
  }
  return map
}

async function fetchDbProducts(storeId) {
  const all = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('products')
      .select('product_number, name, price_amount, cost_price, manufacturer, for_sale, stock_level')
      .eq('store_id', storeId)
      .range(from, from + 999)
    if (error) throw error
    all.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  return all
}

const pct = (a, b) => (a && b != null) ? ((b - a) / a) * 100 : null
const f2 = (x) => x == null ? '–' : x.toFixed(2)
const f1 = (x) => x == null ? '–' : x.toFixed(1)

async function analyzeStore(name, cfg) {
  const csv = loadCSV(cfg.csv, cfg.priceCol)
  const db = await fetchDbProducts(cfg.store_id)

  const rows = []
  let matched = 0, noOld = 0
  for (const p of db) {
    const old = csv.get(p.product_number)
    if (!old) { noOld++; continue }
    matched++
    const man = (p.manufacturer || old.manufacturer || 'Tuntematon').trim() || 'Tuntematon'
    rows.push({
      pn: p.product_number, name: p.name, man,
      oldCost: old.oldCost, newCost: p.cost_price,
      oldPrice: old.oldPrice, newPrice: p.price_amount,
      forSale: p.for_sale, stock: p.stock_level,
    })
  }

  console.log(`\n${'='.repeat(70)}\n${cfg.flag}  ${name.toUpperCase()}  (${cfg.cur})`)
  console.log(`DB-tuotteita: ${db.length} · löytyi touko-CSV:stä: ${matched} · ei vanhaa dataa: ${noOld}`)

  // ---- 1) cost increase per manufacturer group
  const bothCost = rows.filter(r => r.oldCost != null && r.newCost != null && r.oldCost > 0)
  const groups = new Map()
  for (const r of bothCost) {
    const g = groups.get(r.man) || { n: 0, dAbs: 0, dPctSum: 0, raised: 0, raisedDAbs: 0, raisedDPctSum: 0 }
    g.n++
    const dAbs = r.newCost - r.oldCost
    g.dAbs += dAbs
    g.dPctSum += pct(r.oldCost, r.newCost)
    if (dAbs > 0.001) { g.raised++; g.raisedDAbs += dAbs; g.raisedDPctSum += pct(r.oldCost, r.newCost) }
    groups.set(r.man, g)
  }
  const groupArr = [...groups.entries()]
    .map(([man, g]) => ({ man, ...g, avgRaisedPct: g.raised ? g.raisedDPctSum / g.raised : 0 }))
    .filter(g => g.n >= 3)
    .sort((a, b) => b.avgRaisedPct - a.avgRaisedPct)

  console.log(`\n— Ostohinnan nousu per valmistaja (vain tuotteet joilla nousi, ≥3 tuotteen ryhmät) —`)
  console.log(`${'Valmistaja'.padEnd(22)} ${'nosti/yht'.padEnd(10)} ${'ka €'.padStart(8)} ${'ka %'.padStart(7)}`)
  for (const g of groupArr.slice(0, 20)) {
    const avgEur = g.raised ? g.raisedDAbs / g.raised : 0
    console.log(`${g.man.slice(0, 21).padEnd(22)} ${(g.raised + '/' + g.n).padEnd(10)} ${f2(avgEur).padStart(8)} ${f1(g.avgRaisedPct).padStart(7)}`)
  }
  // overall
  const totRaised = bothCost.filter(r => r.newCost - r.oldCost > 0.001)
  const ovAbs = totRaised.reduce((s, r) => s + (r.newCost - r.oldCost), 0) / (totRaised.length || 1)
  const ovPct = totRaised.reduce((s, r) => s + pct(r.oldCost, r.newCost), 0) / (totRaised.length || 1)
  console.log(`KAIKKI: ${totRaised.length}/${bothCost.length} tuotteella ostohinta nousi · ka +${f2(ovAbs)} ${cfg.cur} · ka +${f1(ovPct)} %`)

  // ---- 2) products left un-updated (cost unchanged) among for-sale items
  const unchanged = bothCost.filter(r => Math.abs(r.newCost - r.oldCost) < 0.001 && r.forSale)
  console.log(`\n— Ostohinta EI muuttunut (myynnissä olevat): ${unchanged.length} tuotetta —`)

  // ---- 3) margin squeeze: cost rose but price flat -> margin shrank; and below-cost
  const squeeze = rows.filter(r =>
    r.oldCost != null && r.newCost != null && r.oldPrice != null && r.newPrice != null &&
    r.newCost - r.oldCost > 0.001 &&            // cost went up
    pct(r.oldPrice, r.newPrice) < pct(r.oldCost, r.newCost) - 2  // price rose less than cost (>2pp gap)
  ).map(r => ({
    ...r,
    oldMargin: r.oldPrice > 0 ? (1 - r.oldCost / r.oldPrice) * 100 : null,
    newMargin: r.newPrice > 0 ? (1 - r.newCost / r.newPrice) * 100 : null,
  })).sort((a, b) => (a.newMargin - a.oldMargin) - (b.newMargin - b.oldMargin))

  console.log(`\n— Katteen kavennus: ostohinta nousi mutta myyntihinta ei seurannut: ${squeeze.length} tuotetta —`)
  console.log(`  (top 12 suurin kateromahdus, kate% vanha→uusi)`)
  for (const r of squeeze.slice(0, 12)) {
    console.log(`  ${r.pn.padEnd(12)} ${(r.name || '').slice(0, 32).padEnd(33)} osto ${f2(r.oldCost)}→${f2(r.newCost)}  hinta ${f2(r.oldPrice)}→${f2(r.newPrice)}  kate ${f1(r.oldMargin)}%→${f1(r.newMargin)}%`)
  }

  // below cost now
  const belowCost = rows.filter(r => r.newCost != null && r.newPrice != null && r.newCost > 0 && r.newPrice < r.newCost)
    .map(r => ({ ...r, marginPct: (1 - r.newCost / r.newPrice) * 100 }))
    .sort((a, b) => a.marginPct - b.marginPct)
  console.log(`\n— Myydään ALLE ostohinnan NYT: ${belowCost.length} tuotetta —`)
  for (const r of belowCost.slice(0, 15)) {
    console.log(`  ${r.pn.padEnd(12)} ${(r.name || '').slice(0, 34).padEnd(35)} osto ${f2(r.newCost)} > hinta ${f2(r.newPrice)}  (kate ${f1(r.marginPct)}%)  ${r.forSale ? 'MYYNNISSÄ' : 'piilossa'}`)
  }

  return { name, matched, bothCost: bothCost.length, raised: totRaised.length, ovAbs, ovPct, squeeze: squeeze.length, belowCost: belowCost.length }
}

async function main() {
  printProjectInfo()
  const out = []
  for (const [name, cfg] of Object.entries(STORES)) out.push(await analyzeStore(name, cfg))
  console.log(`\n${'='.repeat(70)}\nYHTEENVETO`)
  for (const o of out) {
    console.log(`${o.name}: ${o.raised}/${o.bothCost} ostohinta nousi (ka +${f1(o.ovPct)}%), katekavennus ${o.squeeze}, alle oston ${o.belowCost}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
