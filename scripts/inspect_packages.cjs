/**
 * Inspect how "paketti" bundle products are represented:
 *  - In the May CSV: do they have a real [GBasePurchasePrice]? [IsBundleProduct]? [SuperProduct]?
 *  - In the DB: cost_price vs price_amount for those product_numbers.
 *  - Probe for any bundle/component table in the DB.
 * Runs for BOTH stores.
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const STORES = {
  automaalit:  { id: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2', csv: 'Tuotteet(29).csv',  pcol: '[ListPrices/EUR/gross]', cur: 'EUR', kw: ['paketti'] },
  billackering:{ id: 'a28836f6-9487-4b67-9194-e907eaf94b69', csv: 'Produkter(14).csv', pcol: '[ListPrices/SEK/gross]', cur: 'SEK', kw: ['paket'] },
}

function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}

async function run(name, cfg){
  const raw = fs.readFileSync(path.join(__dirname,'..',cfg.csv),'utf-8').replace(/^﻿/,'')
  const rows = parseCSV(raw); const h = rows[0]
  const ix=f=>h.findIndex(x=>x.includes(f))
  const iA=ix('[Alias]'), iName=ix('[Name/'), iCost=ix('[GBasePurchasePrice]'),
        iP=ix(cfg.pcol), iBundle=ix('[IsBundleProduct]'), iSuper=ix('[SuperProduct]')
  console.log(`\n${'='.repeat(72)}\n${name.toUpperCase()} (${cfg.cur})  bundle-col idx=${iBundle} super-col idx=${iSuper}`)

  // CSV bundles
  const csvPkgs = []
  let bundleFlagCount = 0
  for(let r=1;r<rows.length;r++){
    const c=rows[r]; const a=(c[iA]||'').trim(); if(!a)continue
    const isBundle = iBundle>=0 && /^(1|true|x)$/i.test((c[iBundle]||'').trim())
    if (isBundle) bundleFlagCount++
    const nm = (c[iName]||'')
    const looksPkg = cfg.kw.some(k=>nm.toLowerCase().includes(k))
    if (isBundle || looksPkg) csvPkgs.push({ a, nm: nm.slice(0,40), isBundle, cost:num(c[iCost]), price:num(c[iP]) })
  }
  console.log(`CSV: [IsBundleProduct]=1 rivejä: ${bundleFlagCount} · nimessä "${cfg.kw[0]}": ${csvPkgs.filter(p=>!p.isBundle).length} · yhteensä tarkasteltavia: ${csvPkgs.length}`)
  const withCost = csvPkgs.filter(p=>p.cost!=null && p.cost>0).length
  console.log(`Niistä joilla CSV:ssä oikea [GBasePurchasePrice] > 0: ${withCost}/${csvPkgs.length}`)

  // DB lookup for these
  const nums = [...new Set(csvPkgs.map(p=>p.a))]
  const db = new Map()
  for(let i=0;i<nums.length;i+=200){
    const {data} = await supabase.from('products')
      .select('product_number, name, price_amount, cost_price')
      .eq('store_id', cfg.id).in('product_number', nums.slice(i,i+200))
    for(const d of data) db.set(d.product_number, d)
  }

  console.log(`\nNäyte paketteja — CSVosto | DBcost | DBhinta | DBcost/hinta:`)
  for(const p of csvPkgs.slice(0,18)){
    const d = db.get(p.a)
    const ratio = d&&d.cost_price&&d.price_amount ? (d.cost_price/d.price_amount).toFixed(2) : '–'
    console.log(`  ${p.a.padEnd(14)} ${(d?.name||p.nm).slice(0,34).padEnd(35)} bundle=${p.isBundle?'Y':'n'} CSVosto=${String(p.cost??'–').padStart(7)} DBcost=${String(d?.cost_price??'–').padStart(7)} hinta=${String(d?.price_amount??'–').padStart(7)} r=${ratio}`)
  }

  return { name, csvPkgs: csvPkgs.length, withCost, bundleFlagCount }
}

;(async()=>{
  printProjectInfo()
  // probe bundle tables
  for (const t of ['product_bundles','bundle_items','product_components','bundles']){
    const { error } = await supabase.from(t).select('*').limit(1)
    console.log(`taulu ${t}: ${error ? 'EI OLE ('+error.message.slice(0,40)+')' : 'ON OLEMASSA'}`)
  }
  for (const [n,c] of Object.entries(STORES)) await run(n,c)
})().catch(e=>{console.error(e);process.exit(1)})
