/**
 * CORRECT margin-change analysis — sheet vs sheet, no DB cost involved.
 *
 *   OLD  = Jan/March ePages export (real old price + real old cost)
 *   NEW  = today's Desktop sheet  (real new price + real new cost)
 *   weight = units sold last 90d (orders + line_items)
 *
 * Goal check (user): did margin € per unit hold after the ~5% increase?
 *
 *   node scripts/final_margin_analysis.cjs
 */
const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')
const REF = Date.UTC(2026, 5, 10)

const STORES = {
  automaalit:  { id:'9a0ba934-bd6c-428c-8729-791d5c7ac7c2', old:'Automaalit_products_3_2026.csv', neu:'Tuotteet(29).csv',  pcol:'[ListPrices/EUR/gross]', cur:'EUR', kw:['paketti'], flag:'🇫🇮' },
  billackering:{ id:'a28836f6-9487-4b67-9194-e907eaf94b69', old:'Billackering_products_1_2026.csv', neu:'Produkter(14).csv', pcol:'[ListPrices/SEK/gross]', cur:'SEK', kw:['paket'],   flag:'🇸🇪' },
}

function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}
const eu=(x,d=2)=>x==null?'':x.toFixed(d).replace('.',',')
const f1=x=>x==null?'–':x.toFixed(1)
const pct=(a,b)=>(a&&b!=null&&a!=0)?((b-a)/a)*100:null

function load(file,pcol){
  const raw=fs.readFileSync(path.join(__dirname,'..',file),'utf-8').replace(/^﻿/,'')
  const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f))
  const iA=ix('[Alias]'),iN=ix('[Name/'),iP=ix(pcol),iC=ix('[GBasePurchasePrice]'),iB=ix('[IsBundleProduct]'),iM=ix('[Manufacturer]')
  const m=new Map()
  for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue
    m.set(a,{name:c[iN]||'',price:num(c[iP]),cost:num(c[iC]),bundle:iB>=0&&/^(1|true|x)$/i.test((c[iB]||'').trim()),man:(c[iM]||'').trim()})}
  return m
}
async function fetchAll(t,s,ff){const all=[];let from=0;for(;;){let q=supabase.from(t).select(s).range(from,from+999);q=ff(q);const{data,error}=await q;if(error)throw error;all.push(...data);if(data.length<1000)break;from+=1000}return all}
async function sales(id,sinceISO){const o=await fetchAll('orders','id',q=>q.eq('store_id',id).gte('creation_date',sinceISO));const ids=o.map(x=>x.id),u=new Map();for(let i=0;i<ids.length;i+=200){const li=await fetchAll('order_line_items','product_number, quantity',q=>q.in('order_id',ids.slice(i,i+200)));for(const r of li){if(!r.product_number)continue;u.set(r.product_number,(u.get(r.product_number)||0)+(r.quantity||0))}}return u}

async function run(name,cfg,csvOut){
  const O=load(cfg.old,cfg.pcol),N=load(cfg.neu,cfg.pcol)
  const u=await sales(cfg.id,new Date(REF-90*864e5).toISOString())
  const items=[]
  for(const[pn,n]of N){
    const o=O.get(pn);if(!o)continue
    if(o.price==null||o.cost==null||n.price==null||n.cost==null)continue
    if(o.cost<=0||n.cost<=0)continue
    const isPkg=n.bundle||cfg.kw.some(k=>(n.name||'').toLowerCase().includes(k))
    const oldM=o.price-o.cost, newM=n.price-n.cost
    const units=u.get(pn)||0
    items.push({pn,name:n.name,man:n.man,isPkg,
      oldPrice:o.price,newPrice:n.price,oldCost:o.cost,newCost:n.cost,
      priceChg:pct(o.price,n.price),costChg:pct(o.cost,n.cost),
      oldMe:oldM,newMe:newM,marginEChg:newM-oldM,
      oldMpct:o.price>0?oldM/o.price*100:null,newMpct:n.price>0?newM/n.price*100:null,
      units, impact:units*(newM-oldM)})
  }
  const pkgs=items.filter(i=>i.isPkg).sort((a,b)=>b.units-a.units)

  console.log(`\n${'='.repeat(80)}\n${cfg.flag} ${name.toUpperCase()} (${cfg.cur}) — vanha sheet (${cfg.old.match(/_(\d+)_/)?'?':''}) vs uusi sheet`)
  console.log(`Vertailtuja tuotteita: ${items.length} · paketteja: ${pkgs.length}`)

  console.log(`\nTOP 15 myydyintä PAKETTIA — kate €/kpl vanha→uusi (tavoite: ei laske):`)
  console.log(`${'koodi'.padEnd(15)} ${'nimi'.padEnd(28)} ${'kpl'.padStart(4)} ${'hinta%'.padStart(7)} ${'osto%'.padStart(7)} ${'kate€/kpl'.padStart(14)} ${'90pv vaik'.padStart(9)}`)
  for(const p of pkgs.slice(0,15)){
    console.log(`${p.pn.padEnd(15)} ${(p.name||'').slice(0,27).padEnd(28)} ${String(p.units).padStart(4)} ${(p.priceChg==null?'–':(p.priceChg>=0?'+':'')+f1(p.priceChg)).padStart(7)} ${(p.costChg==null?'–':(p.costChg>=0?'+':'')+f1(p.costChg)).padStart(7)} ${(eu(p.oldMe,0)+'→'+eu(p.newMe,0)).padStart(14)} ${eu(p.impact,0).padStart(9)}`)
  }
  const sold=pkgs.filter(p=>p.units>0)
  const tot=sold.reduce((s,p)=>s+p.impact,0)
  const lost=sold.filter(p=>p.marginEChg<-0.01), gain=sold.filter(p=>p.marginEChg>0.01)
  console.log(`\nMyydyt paketit (${sold.length}): kate-€ muutos 90 pv volyymilla = ${eu(tot,0)} ${cfg.cur}`)
  console.log(`  kate €/kpl LASKI: ${lost.length} pakettia · NOUSI/sama: ${gain.length}`)
  // all-products overall
  const soldAll=items.filter(i=>i.units>0)
  const totAll=soldAll.reduce((s,i)=>s+i.impact,0)
  console.log(`KAIKKI tuotteet (${soldAll.length} myi): kate-€ muutos 90 pv volyymilla = ${eu(totAll,0)} ${cfg.cur}`)

  for(const p of pkgs) csvOut.push({store:name,cur:cfg.cur,...p})
  return {name,cur:cfg.cur,pkgSold:sold.length,pkgImpact:tot,allImpact:totAll,lost:lost.length}
}

;(async()=>{
  printProjectInfo()
  const csvOut=[],sums=[]
  for(const[n,c]of Object.entries(STORES)) sums.push(await run(n,c,csvOut))
  const head=['Kauppa','Valuutta','Tuotekoodi','Nimi','Valmistaja','Paketti','Hinta_vanha','Hinta_uusi','Hinta_muutos_%','Osto_vanha','Osto_uusi','Osto_muutos_%','Kate_e_kpl_vanha','Kate_e_kpl_uusi','Kate_e_kpl_muutos','Kate_%_vanha','Kate_%_uusi','Myyty_kpl_90pv','Katevaikutus_90pv']
  const lines=[head.join(';')]
  for(const p of csvOut) lines.push([p.store,p.cur,p.pn,(p.name||'').replace(/;/g,','),p.man,p.isPkg?'kyllä':'',eu(p.oldPrice),eu(p.newPrice),eu(p.priceChg,1),eu(p.oldCost),eu(p.newCost),eu(p.costChg,1),eu(p.oldMe),eu(p.newMe),eu(p.marginEChg),eu(p.oldMpct,1),eu(p.newMpct,1),p.units,eu(p.impact)].join(';'))
  const out=path.join(__dirname,'..','Pakettien_katemuutos_OIKEA.csv')
  fs.writeFileSync(out,'﻿'+lines.join('\n'),'utf-8')
  console.log(`\n${'='.repeat(80)}\nYHTEENVETO (vanha sheet vs uusi sheet, myynnillä painotettu 90 pv)`)
  for(const s of sums) console.log(`  ${s.name}: paketit ${eu(s.pkgImpact,0)} ${s.cur} (${s.lost} pakettia kate laski) · kaikki tuotteet ${eu(s.allImpact,0)} ${s.cur}`)
  console.log(`\n📄 CSV: ${out}`)
})().catch(e=>{console.error(e);process.exit(1)})
