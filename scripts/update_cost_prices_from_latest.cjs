/**
 * Update products.cost_price from the LATEST ePages sheets.
 *   Tuotteet(29).csv  -> automaalit
 *   Produkter(14).csv -> billackering
 *
 * SAFE by design:
 *   - robust CSV parser (handles embedded newlines)
 *   - updates ONLY real costs ([GBasePurchasePrice] > 0); NEVER invents defaults
 *   - skips rows where cost is unchanged
 *   - dry-run unless called with `--apply`
 *
 *   node scripts/update_cost_prices_from_latest.cjs          # dry run
 *   node scripts/update_cost_prices_from_latest.cjs --apply  # write
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

const APPLY = process.argv.includes('--apply')
const STORES = {
  automaalit:  { id:'9a0ba934-bd6c-428c-8729-791d5c7ac7c2', csv:'Tuotteet(29).csv',  cur:'EUR' },
  billackering:{ id:'a28836f6-9487-4b67-9194-e907eaf94b69', csv:'Produkter(14).csv', cur:'SEK' },
}

function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}
const eq=(a,b)=>a!=null&&b!=null&&Math.abs(a-b)<0.005

function loadCosts(file){
  const raw=fs.readFileSync(path.join(__dirname,'..',file),'utf-8').replace(/^﻿/,'')
  const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f))
  const iA=ix('[Alias]'),iC=ix('[GBasePurchasePrice]')
  const m=new Map()
  for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue
    const cost=num(c[iC]); if(cost!=null&&cost>0) m.set(a,cost)}
  return m
}

async function fetchAll(id){const all=[];let from=0;for(;;){const{data,error}=await supabase.from('products').select('id, product_number, name, price_amount, cost_price').eq('store_id',id).range(from,from+999);if(error)throw error;all.push(...data);if(data.length<1000)break;from+=1000}return all}

async function run(name,cfg){
  const costs=loadCosts(cfg.csv)
  const db=await fetchAll(cfg.id)
  const updates=[]; let unchanged=0, noCost=0
  for(const p of db){
    const newCost=costs.get(p.product_number)
    if(newCost==null){ noCost++; continue }           // no real cost in sheet -> leave alone
    if(eq(p.cost_price,newCost)){ unchanged++; continue }
    updates.push({id:p.id, pn:p.product_number, name:p.name, old:p.cost_price, neu:newCost})
  }
  updates.sort((a,b)=>Math.abs((b.neu-(b.old||0)))-Math.abs((a.neu-(a.old||0))))

  console.log(`\n${'='.repeat(70)}\n${name.toUpperCase()} (${cfg.cur}) — ${cfg.csv}`)
  console.log(`DB tuotteita: ${db.length} · sheetissä oikea osto: ${costs.size}`)
  console.log(`→ päivitettäviä: ${updates.length} · ennallaan: ${unchanged} · ei ostoa sheetissä (ei kosketa): ${noCost}`)
  console.log(`\nSuurimmat muutokset (osto vanha → uusi):`)
  for(const u of updates.slice(0,12)) console.log(`  ${u.pn.padEnd(14)} ${(u.name||'').slice(0,34).padEnd(35)} ${String(u.old??'–').padStart(8)} → ${String(u.neu).padStart(8)}`)

  if(APPLY && updates.length){
    let done=0
    for(let i=0;i<updates.length;i+=50){
      const batch=updates.slice(i,i+50)
      const res=await Promise.all(batch.map(u=>supabase.from('products').update({cost_price:u.neu}).eq('id',u.id)))
      done+=batch.length-res.filter(r=>r.error).length
    }
    console.log(`\n✅ KIRJOITETTU: ${done}/${updates.length} päivitetty kantaan`)
  } else if(updates.length){
    console.log(`\n(kuivaharjoitus — ei kirjoitettu. Aja --apply kun ok)`)
  }
  return {name, updates:updates.length, unchanged, noCost}
}

;(async()=>{
  printProjectInfo()
  console.log(APPLY ? '⚠️  APPLY-TILA: kirjoitetaan kantaan' : '🧪 KUIVAHARJOITUS')
  const sums=[]
  for(const[n,c]of Object.entries(STORES)) sums.push(await run(n,c))
  console.log(`\n${'='.repeat(70)}\nYHTEENVETO: ${sums.map(s=>`${s.name} ${s.updates} päivitystä`).join(' · ')}`)
})().catch(e=>{console.error(e);process.exit(1)})
