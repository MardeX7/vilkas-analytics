/**
 * Debug: is products.cost_price a REAL purchase price or a synthetic default
 * (cost = salePrice * fixed margin)? Compare to the real cost in the May CSV.
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const STORE_ID = 'a28836f6-9487-4b67-9194-e907eaf94b69'
const CSV_FILE = 'Produkter(14).csv'

function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i+1] === '"') { field += '"'; i++ } else q = false } else field += c }
    else { if (c === '"') q = true; else if (c === ';') { row.push(field); field = '' } else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' } else if (c === '\r') {} else field += c }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}
const num = s => { if (s==null) return null; const t=String(s).replace(/\s/g,'').replace(',','.'); if(t==='')return null; const v=parseFloat(t); return isNaN(v)?null:v }

function loadCsv() {
  const raw = fs.readFileSync(path.join(__dirname, '..', CSV_FILE), 'utf-8').replace(/^﻿/, '')
  const rows = parseCSV(raw); const h = rows[0]
  const ix = f => h.findIndex(x => x.includes(f))
  const iA=ix('[Alias]'), iCost=ix('[GBasePurchasePrice]'), iEUR=ix('[ListPrices/EUR/gross]'), iSEK=ix('[ListPrices/SEK/gross]')
  const m = new Map()
  for (let r=1;r<rows.length;r++){ const c=rows[r]; const a=(c[iA]||'').trim(); if(!a)continue
    m.set(a, { cost: num(c[iCost]), eur: num(c[iEUR]), sek: num(c[iSEK]) }) }
  return m
}

;(async () => {
  printProjectInfo()
  const csv = loadCsv()
  const db = []
  let from = 0
  for(;;){ const {data} = await supabase.from('products')
    .select('product_number, name, price_amount, price_currency, cost_price, cost_currency')
    .eq('store_id', STORE_ID).range(from, from+999)
    db.push(...data); if(data.length<1000)break; from+=1000 }

  // cost_currency distribution
  const curDist = {}
  for (const p of db) curDist[p.cost_currency] = (curDist[p.cost_currency]||0)+1
  console.log('cost_currency jakauma:', JSON.stringify(curDist))
  console.log('price_currency jakauma:', JSON.stringify(db.reduce((a,p)=>{a[p.price_currency]=(a[p.price_currency]||0)+1;return a},{})))

  // how many DB cost_price sit at a suspiciously exact ratio of price (default margin)?
  const ratios = {}
  let nearHalf=0, near35=0
  for (const p of db) {
    if (!p.cost_price || !p.price_amount) continue
    const r = p.cost_price / p.price_amount
    if (Math.abs(r-0.5) < 0.005) nearHalf++
    if (Math.abs(r-0.35) < 0.005) near35++
    const bucket = (Math.round(r*20)/20).toFixed(2) // 5% buckets
    ratios[bucket] = (ratios[bucket]||0)+1
  }
  console.log(`\ncost/price tasan ~0,50 (50% oletuskate): ${nearHalf} tuotetta`)
  console.log(`cost/price tasan ~0,35 (65% oletuskate): ${near35} tuotetta`)
  console.log('cost/price jakauma (5% bucketit):')
  Object.entries(ratios).sort((a,b)=>a[0]-b[0]).forEach(([k,v])=>console.log(`  ${k}: ${'#'.repeat(Math.min(v,60))} ${v}`))

  // side-by-side for the flagged squeeze products
  const flagged = ['300006267','14214','ultrafast','13088','260420000','1603','1374','250103','6301']
  console.log('\n=== Epäillyt tuotteet: CSV oikea osto vs DB cost_price ===')
  console.log(`${'koodi'.padEnd(13)} ${'CSVosto'.padStart(8)} ${'DBcost'.padStart(8)} ${'DBhinta'.padStart(8)} ${'DBcost/hinta'.padStart(11)} ${'DBcost/CSVosto'.padStart(13)}`)
  for (const pn of flagged) {
    const c = csv.get(pn); const p = db.find(x=>x.product_number===pn)
    if(!p) { console.log(pn, 'ei DB:ssä'); continue }
    const ratio = p.cost_price/p.price_amount
    const mult = c?.cost ? p.cost_price/c.cost : null
    console.log(`${pn.padEnd(13)} ${String(c?.cost??'–').padStart(8)} ${String(p.cost_price).padStart(8)} ${String(p.price_amount).padStart(8)} ${(ratio?ratio.toFixed(3):'–').padStart(11)} ${(mult?mult.toFixed(2)+'x':'–').padStart(13)}`)
  }
})().catch(e=>{console.error(e);process.exit(1)})
