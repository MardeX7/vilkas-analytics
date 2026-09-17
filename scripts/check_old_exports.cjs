const { supabase } = require('./db.cjs')
const fs=require('fs'),path=require('path')
function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}
function load(file,pcol){const raw=fs.readFileSync(path.join(__dirname,'..',file),'utf-8').replace(/^﻿/,'');const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f));const iA=ix('[Alias]'),iP=ix(pcol),iC=ix('[GBasePurchasePrice]');const m=new Map();for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue;m.set(a,{price:num(c[iP]),cost:num(c[iC])})}return {m,rows:rows.length}}

const jan=load('Billackering_products_1_2026.csv','[ListPrices/SEK/gross]')
const now=load('Produkter(14).csv','[ListPrices/SEK/gross]')
console.log('Billackering tammikuu rivejä:',jan.rows,' nyt-CSV rivejä:',now.rows)
console.log('\nkoodi        TAMMIhinta  NYThinta  | TAMMIosto  NYTosto')
for(const pn of ['830320','12167','9001','9002','9003','trotonfiller','300006267','4785']){
  const j=jan.m.get(pn),n=now.m.get(pn)
  console.log(`${pn.padEnd(12)} ${String(j?.price??'–').padStart(9)} ${String(n?.price??'–').padStart(9)}  | ${String(j?.cost??'–').padStart(9)} ${String(n?.cost??'–').padStart(8)}`)
}
// how many products changed price jan->now
let chg=0,tot=0
for(const[pn,n]of now.m){const j=jan.m.get(pn);if(!j||j.price==null||n.price==null)continue;tot++;if(Math.abs(j.price-n.price)>0.001)chg++}
console.log(`\nBillackering: ${chg}/${tot} tuotteella hinta muuttui tammikuu→nyt`)

const marAuto=load('Automaalit_products_3_2026.csv','[ListPrices/EUR/gross]')
const nowAuto=load('Tuotteet(29).csv','[ListPrices/EUR/gross]')
let chg2=0,tot2=0
for(const[pn,n]of nowAuto.m){const j=marAuto.m.get(pn);if(!j||j.price==null||n.price==null)continue;tot2++;if(Math.abs(j.price-n.price)>0.001)chg2++}
console.log(`Automaalit: ${chg2}/${tot2} tuotteella hinta muuttui maaliskuu→nyt`)
