const { supabase } = require('./db.cjs')
const fs=require('fs'),path=require('path')
function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}
function loadCosts(file){const raw=fs.readFileSync(path.join(__dirname,'..',file),'utf-8').replace(/^﻿/,'');const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f));const iA=ix('[Alias]'),iC=ix('[GBasePurchasePrice]');const m=new Map();for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue;const cost=num(c[iC]);if(cost!=null&&cost>0)m.set(a,cost)}return m}
;(async()=>{
 for(const[name,id,csv]of[['AUTOMAALIT','9a0ba934-bd6c-428c-8729-791d5c7ac7c2','Tuotteet(29).csv'],['BILLACKERING','a28836f6-9487-4b67-9194-e907eaf94b69','Produkter(14).csv']]){
  const costs=loadCosts(csv);const db=[];let from=0;for(;;){const{data}=await supabase.from('products').select('product_number,name,price_amount,cost_price').eq('store_id',id).range(from,from+999);db.push(...data);if(data.length<1000)break;from+=1000}
  const bad=[]
  for(const p of db){const nc=costs.get(p.product_number);if(nc==null)continue;if(p.price_amount!=null&&p.price_amount>0&&nc>p.price_amount)bad.push({pn:p.product_number,name:p.name,nc,price:p.price_amount})}
  bad.sort((a,b)=>(b.nc-b.price)-(a.nc-a.price))
  console.log(`\n${name}: ${bad.length} tuotetta joilla UUSI osto > myyntihinta`)
  for(const b of bad.slice(0,15))console.log(`  ${b.pn.padEnd(14)} ${(b.name||'').slice(0,36).padEnd(37)} osto ${b.nc} > hinta ${b.price}`)
 }
})().catch(e=>{console.error(e);process.exit(1)})
