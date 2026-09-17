const { supabase } = require('./db.cjs')
const fs=require('fs'),path=require('path')
function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}
function load(file,pcol){const raw=fs.readFileSync(path.join(__dirname,'..',file),'utf-8').replace(/^﻿/,'');const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f));const iA=ix('[Alias]'),iP=ix(pcol),iC=ix('[GBasePurchasePrice]');const m=new Map();for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue;m.set(a,{price:num(c[iP]),cost:num(c[iC])})}return m}
const eq=(a,b)=>a!=null&&b!=null&&Math.abs(a-b)<0.01
;(async()=>{
 for(const[name,id,oldF,newF,pcol]of[
   ['BILLACKERING','a28836f6-9487-4b67-9194-e907eaf94b69','Billackering_products_1_2026.csv','Produkter(14).csv','[ListPrices/SEK/gross]'],
   ['AUTOMAALIT','9a0ba934-bd6c-428c-8729-791d5c7ac7c2','Automaalit_products_3_2026.csv','Tuotteet(29).csv','[ListPrices/EUR/gross]']]){
  const O=load(oldF,pcol),N=load(newF,pcol)
  const db=[];let from=0;for(;;){const{data}=await supabase.from('products').select('product_number,price_amount,cost_price').eq('store_id',id).range(from,from+999);db.push(...data);if(data.length<1000)break;from+=1000}
  let priceNew=0,priceOld=0,costOld=0,costNew=0,costChanged=0,priceChanged=0,n=0
  for(const p of db){const o=O.get(p.product_number),nw=N.get(p.product_number);if(!o||!nw)continue;n++
    if(eq(p.price_amount,nw.price))priceNew++; if(eq(p.price_amount,o.price))priceOld++
    if(eq(p.cost_price,o.cost))costOld++; if(eq(p.cost_price,nw.cost))costNew++
    if(o.cost!=null&&nw.cost!=null&&!eq(o.cost,nw.cost))costChanged++
    if(o.price!=null&&nw.price!=null&&!eq(o.price,nw.price))priceChanged++}
  console.log(`\n=== ${name} (${n} tuotetta vertailtu) ===`)
  console.log(`KANNAN HINTA = UUSI sheet: ${priceNew}  | = vanha sheet: ${priceOld}   -> kumpaa kanta seuraa?`)
  console.log(`KANNAN OSTO  = vanha sheet: ${costOld}  | = uusi sheet:  ${costNew}`)
  console.log(`Sheettien välillä OSTO muuttui: ${costChanged}/${n}  · HINTA muuttui: ${priceChanged}/${n}`)
 }
})().catch(e=>{console.error(e);process.exit(1)})
