const { supabase } = require('./db.cjs')
const fs=require('fs'),path=require('path')
function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
function manMap(file){const raw=fs.readFileSync(path.join(__dirname,'..',file),'utf-8').replace(/^﻿/,'');const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f));const iA=ix('[Alias]'),iM=ix('[Manufacturer]');const m=new Map();for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(a)m.set(a,(c[iM]||'').trim()||'Tuntematon')}return m}
async function fetchAll(t,s,ff){const all=[];let from=0;for(;;){let q=supabase.from(t).select(s).range(from,from+999);q=ff(q);const{data,error}=await q;if(error)throw error;all.push(...data);if(data.length<1000)break;from+=1000}return all}
const f1=x=>x==null?'–':(x>=0?'+':'')+x.toFixed(1)

;(async()=>{
 for(const[name,id,csv] of [
   ['AUTOMAALIT','9a0ba934-bd6c-428c-8729-791d5c7ac7c2','Tuotteet(29).csv'],
   ['BILLACKERING','a28836f6-9487-4b67-9194-e907eaf94b69','Produkter(14).csv']]){
  const man=manMap(csv)
  const orders=await fetchAll('orders','id, creation_date',q=>q.eq('store_id',id).gte('creation_date','2026-03-01'))
  const omonth=new Map();orders.forEach(o=>omonth.set(o.id,(o.creation_date||'').slice(0,7)))
  const ids=[...omonth.keys()]
  // per product per month: sum price*qty, sum qty  (qty-weighted avg unit price)
  const pp=new Map() // key pn|month -> {sum,qty}
  for(let i=0;i<ids.length;i+=200){
    const li=await fetchAll('order_line_items','order_id, product_number, unit_price, quantity',q=>q.in('order_id',ids.slice(i,i+200)))
    for(const r of li){const m=omonth.get(r.order_id);if(!m||!r.product_number||!(r.unit_price>0))continue
      const k=r.product_number+'|'+m;const g=pp.get(k)||{sum:0,qty:0};const qn=r.quantity||1;g.sum+=r.unit_price*qn;g.qty+=qn;pp.set(k,g)}}
  const avg=(pn,mo)=>{const g=pp.get(pn+'|'+mo);return g&&g.qty?g.sum/g.qty:null}
  const pns=new Set([...pp.keys()].map(k=>k.split('|')[0]))
  // before = April (2026-04), after = June (2026-06); fallback before = May
  const groups=new Map()
  let cmp=0
  for(const pn of pns){
    const jun=avg(pn,'2026-06'); if(jun==null)continue
    const apr=avg(pn,'2026-04'); const may=avg(pn,'2026-05')
    const before = apr!=null?apr:may; if(before==null)continue
    const chg=(jun-before)/before*100
    const key=man.get(pn)||'Tuntematon';const k=key.toLowerCase()
    const g=groups.get(k)||{label:key,n:0,sum:0,up:0,down:0};g.n++;g.sum+=chg;if(chg>1)g.up++;else if(chg<-1)g.down++;groups.set(k,g);cmp++
  }
  const arr=[...groups.values()].filter(g=>g.n>=5&&g.label!=='Tuntematon').sort((a,b)=>b.sum/b.n-a.sum/a.n)
  console.log(`\n${'='.repeat(64)}\n${name} — toteutunut myyntihinnan muutos huhti→kesäkuu (tilaushistoria)`)
  console.log(`Vertailtuja tuotteita (myyty molempina): ${cmp}`)
  console.log(`${'Valmistaja'.padEnd(18)} ${'tuott.'.padStart(6)} ${'nousi'.padStart(6)} ${'laski'.padStart(6)} ${'ka muutos %'.padStart(12)}`)
  for(const g of arr) console.log(`${g.label.slice(0,17).padEnd(18)} ${String(g.n).padStart(6)} ${String(g.up).padStart(6)} ${String(g.down).padStart(6)} ${f1(g.sum/g.n).padStart(12)}`)
 }
})().catch(e=>{console.error(e);process.exit(1)})
