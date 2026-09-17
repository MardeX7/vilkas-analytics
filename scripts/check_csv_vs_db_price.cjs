const { supabase } = require('./db.cjs')
const fs=require('fs'),path=require('path')
function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{if(s==null)return null;const t=String(s).replace(/\s/g,'').replace(',','.');if(t==='')return null;const v=parseFloat(t);return isNaN(v)?null:v}
function load(file,pcol,ccol){const raw=fs.readFileSync(path.join(__dirname,'..',file),'utf-8').replace(/^﻿/,'');const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f));const iA=ix('[Alias]'),iP=ix(pcol),iC=ix('[GBasePurchasePrice]');const m=new Map();for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue;m.set(a,{price:num(c[iP]),cost:num(c[iC])})}return m}
;(async()=>{
  const tests=[
    ['automaalit','9a0ba934-bd6c-428c-8729-791d5c7ac7c2','Tuotteet(29).csv','[ListPrices/EUR/gross]',['830320','12167','9001','300005446','spraypac2']],
    ['billackering','a28836f6-9487-4b67-9194-e907eaf94b69','Produkter(14).csv','[ListPrices/SEK/gross]',['830320','12167','9001','300006267','trotonfiller']],
  ]
  for(const[name,id,csv,pcol,pns]of tests){
    const m=load(csv,pcol)
    console.log(`\n=== ${name} : CSV vs DB ===`)
    for(const pn of pns){
      const {data}=await supabase.from('products').select('price_amount,cost_price,name').eq('store_id',id).eq('product_number',pn)
      const d=data&&data[0];const o=m.get(pn)
      console.log(`${pn.padEnd(12)} CSVhinta=${String(o?.price??'–').padStart(7)} DBhinta=${String(d?.price_amount??'–').padStart(7)} | CSVosto=${String(o?.cost??'–').padStart(7)} DBosto=${String(d?.cost_price??'–').padStart(7)}  ${d?.name||''}`)
    }
  }
})().catch(e=>{console.error(e);process.exit(1)})
