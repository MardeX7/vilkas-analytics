/**
 * Update products.cost_price from the latest ePages product export(s).
 *
 * Auto-finds the newest Tuotteet*.csv and Produkter*.csv in ~/Desktop and ~/Downloads,
 * auto-detects which store each file belongs to (by product_number overlap),
 * and updates cost_price SAFELY:
 *   - robust CSV parser (handles embedded newlines)
 *   - real costs only ([GBasePurchasePrice] > 0); never invents defaults
 *   - skips unchanged rows
 *   - warns about cost > price (does not block)
 *   - dry-run unless --apply
 *
 *   node scripts/update_costs.cjs           # dry run, auto-find files
 *   node scripts/update_costs.cjs --apply   # write
 *   node scripts/update_costs.cjs --apply /path/to/file.csv ...   # explicit files
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const os = require('os')
const path = require('path')

const APPLY = process.argv.includes('--apply')
const explicitFiles = process.argv.slice(2).filter(a => a !== '--apply' && a.toLowerCase().endsWith('.csv'))

const STORES = {
  automaalit:  { id:'9a0ba934-bd6c-428c-8729-791d5c7ac7c2', cur:'EUR' },
  billackering:{ id:'a28836f6-9487-4b67-9194-e907eaf94b69', cur:'SEK' },
}

function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}
const eq=(a,b)=>a!=null&&b!=null&&Math.abs(a-b)<0.005

function findLatest() {
  const dirs = [path.join(os.homedir(),'Desktop'), path.join(os.homedir(),'Downloads'), path.join(os.homedir(),'Desktop','VilkasAnalytics')]
  const pick = (re) => {
    let best=null
    for (const d of dirs) {
      let entries=[]; try { entries=fs.readdirSync(d) } catch { continue }
      for (const n of entries) {
        if (!re.test(n)) continue
        const fp=path.join(d,n)
        let st; try { st=fs.statSync(fp) } catch { continue }
        if (!best || st.mtimeMs>best.mtime) best={fp, mtime:st.mtimeMs, name:n}
      }
    }
    return best
  }
  return [pick(/^Tuotteet.*\.csv$/i), pick(/^Produkter.*\.csv$/i)].filter(Boolean).map(b=>b.fp)
}

function loadCosts(file){
  const raw=fs.readFileSync(file,'utf-8').replace(/^﻿/,'')
  const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f))
  const iA=ix('[Alias]'),iC=ix('[GBasePurchasePrice]')
  if(iA<0||iC<0) return null
  const aliases=[], costs=new Map()
  for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue
    aliases.push(a); const cost=num(c[iC]); if(cost!=null&&cost>0) costs.set(a,cost)}
  return {aliases, costs}
}

async function fetchProducts(id){const all=[];let from=0;for(;;){const{data,error}=await supabase.from('products').select('id, product_number, name, price_amount, cost_price').eq('store_id',id).range(from,from+999);if(error)throw error;all.push(...data);if(data.length<1000)break;from+=1000}return all}

async function detectStore(aliases){
  const sample=aliases.slice(0,400)
  let best=null
  for(const[name,cfg]of Object.entries(STORES)){
    let hits=0
    for(let i=0;i<sample.length;i+=200){
      const{data}=await supabase.from('products').select('product_number').eq('store_id',cfg.id).in('product_number',sample.slice(i,i+200))
      hits+=data.length
    }
    if(!best||hits>best.hits) best={name,cfg,hits}
  }
  return best
}

async function processFile(file){
  const loaded=loadCosts(file)
  if(!loaded){ console.log(`\n⚠️  ${path.basename(file)}: ei [Alias]/[GBasePurchasePrice]-sarakkeita – ohitetaan`); return null }
  const det=await detectStore(loaded.aliases)
  const db=await fetchProducts(det.cfg.id)
  const stat=fs.statSync(file)
  console.log(`\n${'='.repeat(64)}\n📄 ${path.basename(file)}  (tallennettu ${new Date(stat.mtime).toLocaleString('fi-FI')})`)
  console.log(`   → tunnistettu kauppa: ${det.name.toUpperCase()} (${det.cfg.cur}) – ${det.hits} tuotetta täsmäsi`)

  const updates=[]; let unchanged=0, noCost=0, costGtPrice=[]
  for(const p of db){
    const nc=loaded.costs.get(p.product_number)
    if(nc==null){noCost++;continue}
    if(eq(p.cost_price,nc)){unchanged++;continue}
    updates.push({id:p.id,pn:p.product_number,name:p.name,old:p.cost_price,neu:nc})
    if(p.price_amount>0&&nc>p.price_amount) costGtPrice.push({pn:p.product_number,name:p.name,nc,price:p.price_amount})
  }
  updates.sort((a,b)=>Math.abs(b.neu-(b.old||0))-Math.abs(a.neu-(a.old||0)))
  console.log(`   päivitettäviä: ${updates.length} · ennallaan: ${unchanged} · ei ostoa sheetissä: ${noCost}`)
  if(costGtPrice.length){
    console.log(`   ⚠️  ${costGtPrice.length} tuotetta joilla uusi osto > myyntihinta (tarkista hinnoittelu):`)
    for(const b of costGtPrice.slice(0,8)) console.log(`      ${b.pn} ${(b.name||'').slice(0,30)} osto ${b.nc} > hinta ${b.price}`)
  }
  if(updates.length){
    console.log(`   Suurimmat muutokset:`)
    for(const u of updates.slice(0,6)) console.log(`      ${u.pn.padEnd(13)} ${(u.name||'').slice(0,32).padEnd(33)} ${String(u.old??'–').padStart(8)} → ${String(u.neu).padStart(8)}`)
  }

  if(APPLY&&updates.length){
    let done=0
    for(let i=0;i<updates.length;i+=50){
      const batch=updates.slice(i,i+50)
      const res=await Promise.all(batch.map(u=>supabase.from('products').update({cost_price:u.neu}).eq('id',u.id)))
      done+=batch.length-res.filter(r=>r.error).length
    }
    console.log(`   ✅ KIRJOITETTU: ${done}/${updates.length}`)
  } else if(updates.length){
    console.log(`   (kuivaharjoitus – aja --apply kun ok)`)
  }
  return {store:det.name, updates:updates.length}
}

;(async()=>{
  printProjectInfo()
  console.log(APPLY?'⚠️  APPLY: kirjoitetaan kantaan':'🧪 KUIVAHARJOITUS (ei kirjoiteta)')
  const files = explicitFiles.length ? explicitFiles : findLatest()
  if(!files.length){ console.log('\n❌ Ei löytynyt Tuotteet*.csv / Produkter*.csv tiedostoja Desktopilta tai Downloadsista.'); process.exit(1) }
  const sums=[]
  for(const f of files){ const s=await processFile(f); if(s)sums.push(s) }
  console.log(`\n${'='.repeat(64)}\nVALMIS: ${sums.map(s=>`${s.store} ${s.updates}`).join(' · ')||'ei muutoksia'}`)
  if(!APPLY) console.log('Tämä oli esikatselu. Aja --apply (tai tuplaklikkaa kuvaketta) kun haluat kirjoittaa.')
})().catch(e=>{console.error(e);process.exit(1)})
