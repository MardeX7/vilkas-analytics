const fs=require('fs'),path=require('path')
function parseCSV(t){const R=[];let r=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c==='"'){if(t[i+1]==='"'){f+='"';i++}else q=false}else f+=c}else{if(c==='"')q=true;else if(c===';'){r.push(f);f=''}else if(c==='\n'){r.push(f);R.push(r);r=[];f=''}else if(c==='\r'){}else f+=c}}if(f!==''||r.length){r.push(f);R.push(r)}return R}
const num=s=>{const t=String(s||'').replace(/\s/g,'').replace(',','.');const v=parseFloat(t);return isFinite(v)?v:null}
function load(file,pcol){const raw=fs.readFileSync(path.join(__dirname,'..',file),'utf-8').replace(/^﻿/,'');const rows=parseCSV(raw);const h=rows[0];const ix=f=>h.findIndex(x=>x.includes(f));const iA=ix('[Alias]'),iP=ix(pcol),iM=ix('[Manufacturer]');const m=new Map();for(let r=1;r<rows.length;r++){const c=rows[r];const a=(c[iA]||'').trim();if(!a)continue;m.set(a,{price:num(c[iP]),man:(c[iM]||'').trim()})}return m}
const f1=x=>x==null?'–':x.toFixed(1)

for(const[name,oldF,newF,pcol] of [
  ['AUTOMAALIT','Automaalit_products_3_2026.csv','Tuotteet(29).csv','[ListPrices/EUR/gross]'],
  ['BILLACKERING','Billackering_products_1_2026.csv','Produkter(14).csv','[ListPrices/SEK/gross]']]){
  const O=load(oldF,pcol),N=load(newF,pcol)
  const groups=new Map()
  for(const[pn,n]of N){const o=O.get(pn);if(!o||!o.price||!n.price||o.price<=0)continue
    const chg=(n.price-o.price)/o.price*100
    const key=(n.man||o.man||'Tuntematon').trim()||'Tuntematon';const k=key.toLowerCase()
    const g=groups.get(k)||{label:key,n:0,raised:0,lowered:0,raisedSum:0};g.n++
    if(chg>0.5){g.raised++;g.raisedSum+=chg}else if(chg<-0.5)g.lowered++
    groups.set(k,g)}
  const arr=[...groups.values()].filter(g=>g.n>=6&&g.label!=='Tuntematon').sort((a,b)=>b.raised/b.n-a.raised/a.n)
  console.log(`\n${'='.repeat(66)}\n${name} — myyntihinnan muutos per valmistaja (tammi/maalis → nyt)`)
  console.log(`${'Valmistaja'.padEnd(18)} ${'tuott.'.padStart(6)} ${'nousi'.padStart(6)} ${'laski'.padStart(6)} ${'ka nousu(nostetut)'.padStart(18)}`)
  for(const g of arr){const avgR=g.raised?g.raisedSum/g.raised:null
    console.log(`${g.label.slice(0,17).padEnd(18)} ${String(g.n).padStart(6)} ${String(g.raised).padStart(6)} ${String(g.lowered).padStart(6)} ${(g.raised?'+'+f1(avgR)+' %':'–').padStart(18)}`)}
}
