/**
 * Package (bundle) margin change around the manual ~5% increase.
 *
 * Reliable data only:
 *   OLD cost  + OLD price  = May CSV (real values)
 *   NEW price = DB price_amount (measured actual increase)
 *   NEW cost  = MODELLED as OLD cost * (1 + costPct)  [Troton +5% per user]
 *   weight    = units sold last 90d (orders+line_items)
 *
 * Key outputs per package:
 *   actual price change %  (did they really raise ~5%?)
 *   old margin% (real) vs modelled new margin%
 *   margin € impact = units * ((newPrice-oldPrice) - oldCost*costPct)
 *      >0 = price increase MORE than covered the cost rise
 *      <0 = margin leaking (price didn't follow cost)
 *
 *   node scripts/package_margin_change.cjs [costPctTroton]   (default 0.05)
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const COST_PCT = parseFloat(process.argv[2] || '0.05')
const REF = Date.UTC(2026, 5, 10)

const STORES = {
  automaalit:  { id: '9a0ba934-bd6c-428c-8729-791d5c7ac7c2', csv: 'Tuotteet(29).csv',  pcol: '[ListPrices/EUR/gross]', cur: 'EUR', kw:['paketti'], flag:'🇫🇮' },
  billackering:{ id: 'a28836f6-9487-4b67-9194-e907eaf94b69', csv: 'Produkter(14).csv', pcol: '[ListPrices/SEK/gross]', cur: 'SEK', kw:['paket'],   flag:'🇸🇪' },
}

function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}
const eu=(x,d=2)=>x==null?'':x.toFixed(d).replace('.',',')
const f1=x=>x==null?'–':x.toFixed(1)
const pct=(a,b)=>(a&&b!=null)?((b-a)/a)*100:null

async function fetchAll(table, select, ffn){const all=[];let from=0;for(;;){let q=supabase.from(table).select(select).range(from,from+999);q=ffn(q);const{data,error}=await q;if(error)throw error;all.push(...data);if(data.length<1000)break;from+=1000}return all}

async function salesByProduct(storeId, sinceISO){
  const orders = await fetchAll('orders','id',q=>q.eq('store_id',storeId).gte('creation_date',sinceISO))
  const ids = orders.map(o=>o.id); const units=new Map()
  for(let i=0;i<ids.length;i+=200){
    const li = await fetchAll('order_line_items','product_number, quantity',q=>q.in('order_id',ids.slice(i,i+200)))
    for(const r of li){if(!r.product_number)continue;units.set(r.product_number,(units.get(r.product_number)||0)+(r.quantity||0))}
  }
  return units
}

async function run(name,cfg,outRows){
  const raw=fs.readFileSync(path.join(__dirname,'..',cfg.csv),'utf-8').replace(/^﻿/,'')
  const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f))
  const iA=ix('[Alias]'),iName=ix('[Name/'),iCost=ix('[GBasePurchasePrice]'),iP=ix(cfg.pcol),iB=ix('[IsBundleProduct]'),iMan=ix('[Manufacturer]')
  const csv=new Map()
  for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue
    const nm=c[iName]||''
    const isBundle = iB>=0 && /^(1|true|x)$/i.test((c[iB]||'').trim())
    const isPkg = isBundle || cfg.kw.some(k=>nm.toLowerCase().includes(k))
    csv.set(a,{name:nm,cost:num(c[iCost]),price:num(c[iP]),isPkg,man:(c[iMan]||'').trim()})}

  const db = await fetchAll('products','product_number, name, price_amount, cost_price, manufacturer, for_sale',q=>q.eq('store_id',cfg.id))
  const units = await salesByProduct(cfg.id, new Date(REF-90*864e5).toISOString())

  const pkgs=[]
  for(const p of db){
    const o=csv.get(p.product_number)
    if(!o||!o.isPkg)continue
    if(o.cost==null||o.cost<=0||o.price==null||p.price_amount==null)continue   // need real old cost+price
    const man=(p.manufacturer||o.man||'').trim()
    const isTroton=/troton/i.test(man)||/troton/i.test(o.name||'')||/troton/i.test(p.name||'')
    const newCost=o.cost*(1+COST_PCT)
    const oldMargin=(o.price-o.cost)/o.price*100
    const newMargin=(p.price_amount-newCost)/p.price_amount*100
    const u=units.get(p.product_number)||0
    const priceChgPct=pct(o.price,p.price_amount)
    const impact=u*((p.price_amount-o.price)-o.cost*COST_PCT)  // SEK/EUR margin vs covering the cost rise
    pkgs.push({pn:p.product_number,name:p.name||o.name,man,isTroton,oldCost:o.cost,newCost,oldPrice:o.price,newPrice:p.price_amount,priceChgPct,oldMargin,newMargin,marginChg:newMargin-oldMargin,units:u,impact,forSale:p.for_sale})
  }

  pkgs.sort((a,b)=>b.units-a.units)
  console.log(`\n${'='.repeat(78)}\n${cfg.flag} ${name.toUpperCase()} (${cur(cfg)}) — paketit, olettaen Troton-osto +${(COST_PCT*100).toFixed(0)}%`)
  console.log(`Paketteja joilla oikea vanha osto+hinta: ${pkgs.length}`)
  console.log(`\nTOP 18 myydyintä pakettia (90 pv):`)
  console.log(`${'koodi'.padEnd(15)} ${'nimi'.padEnd(30)} ${'kpl'.padStart(4)} ${'hinta€muutos'.padStart(12)} ${'kate vanha→uusi'.padStart(16)} ${'€vaik'.padStart(8)}`)
  for(const p of pkgs.slice(0,18)){
    const pc = p.priceChgPct==null?'–':(p.priceChgPct>=0?'+':'')+f1(p.priceChgPct)+'%'
    console.log(`${p.pn.padEnd(15)} ${(p.name||'').slice(0,29).padEnd(30)} ${String(p.units).padStart(4)} ${(eu(p.oldPrice,0)+'→'+eu(p.newPrice,0)).padStart(12)} ${(f1(p.oldMargin)+'→'+f1(p.newMargin)+'%').padStart(16)} ${eu(p.impact,0).padStart(8)} ${p.isTroton?'T':''}`)
  }
  // aggregates
  const sold=pkgs.filter(p=>p.units>0)
  const totImpact=sold.reduce((s,p)=>s+p.impact,0)
  const notRaised=sold.filter(p=>p.priceChgPct!=null && p.priceChgPct < COST_PCT*100 - 1)
  console.log(`\nMyyneistä paketeista (${sold.length} kpl): nettokatevaikutus 90 pv = ${eu(totImpact,0)} ${cur(cfg)}`)
  console.log(`Paketteja joilla hinta nousi VÄHEMMÄN kuin osto (+${(COST_PCT*100).toFixed(0)}%): ${notRaised.length} → näissä kate kaventui`)
  for(const p of notRaised.slice(0,8)) console.log(`   ${p.pn.padEnd(14)} ${(p.name||'').slice(0,32).padEnd(33)} hinta ${p.priceChgPct==null?'–':(p.priceChgPct>=0?'+':'')+f1(p.priceChgPct)+'%'}  kate ${f1(p.oldMargin)}→${f1(p.newMargin)}%  (${p.units} kpl, ${eu(p.impact,0)} ${cur(cfg)})`)

  for(const p of pkgs) outRows.push({store:name,cur:cur(cfg),...p})
  return {name,n:pkgs.length,sold:sold.length,totImpact,cur:cur(cfg),notRaised:notRaised.length}
}
const cur=cfg=>cfg.cur

;(async()=>{
  printProjectInfo()
  const outRows=[];const sums=[]
  for(const[n,c]of Object.entries(STORES)) sums.push(await run(n,c,outRows))
  // CSV
  const head=['Kauppa','Valuutta','Tuotekoodi','Nimi','Valmistaja','Troton','Osto_vanha','Osto_uusi_+5%','Hinta_vanha','Hinta_nyky','Hinta_muutos_%','Kate_vanha_%','Kate_uusi_%','Kate_muutos_pp','Myyty_kpl_90pv','Katevaikutus_90pv','Myynnissa']
  const lines=[head.join(';')]
  for(const p of outRows) lines.push([p.store,p.cur,p.pn,(p.name||'').replace(/;/g,','),p.man,p.isTroton?'kyllä':'',eu(p.oldCost),eu(p.newCost),eu(p.oldPrice),eu(p.newPrice),eu(p.priceChgPct,1),eu(p.oldMargin,1),eu(p.newMargin,1),eu(p.marginChg,1),p.units,eu(p.impact),p.forSale?'kyllä':'ei'].join(';'))
  const outPath=path.join(__dirname,'..','Pakettien_katemuutos.csv')
  fs.writeFileSync(outPath,'﻿'+lines.join('\n'),'utf-8')
  console.log(`\n${'='.repeat(78)}\nYHTEENVETO (olettaen Troton-osto +${(COST_PCT*100).toFixed(0)}%)`)
  for(const s of sums) console.log(`  ${s.name}: ${s.n} pakettia, ${s.sold} myi 90pv:ssä, nettokatevaikutus ${eu(s.totImpact,0)} ${s.cur}, ${s.notRaised} jäi alle 5% hinnankorotuksen`)
  console.log(`\n📄 CSV: ${outPath} (${outRows.length} riviä)`)
})().catch(e=>{console.error(e);process.exit(1)})
