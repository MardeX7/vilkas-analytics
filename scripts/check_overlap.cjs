const { supabase } = require('./db.cjs')
;(async()=>{
  const get=async id=>{const s=new Set();let f=0;for(;;){const{data}=await supabase.from('products').select('product_number').eq('store_id',id).range(f,f+999);data.forEach(p=>s.add(p.product_number));if(data.length<1000)break;f+=1000}return s}
  const au=await get('9a0ba934-bd6c-428c-8729-791d5c7ac7c2')
  const bi=await get('a28836f6-9487-4b67-9194-e907eaf94b69')
  let shared=0;for(const x of au)if(bi.has(x))shared++
  console.log(`Automaalit: ${au.size} tuotetta · Billackering: ${bi.size}`)
  console.log(`Jaettuja tuotekoodeja: ${shared}`)
  console.log(`→ jos lataa Billackering-tiedoston Automaalitiin, osuma-aste olisi ~${(shared/au.size*100).toFixed(0)}% (oikealla tiedostolla ~100%)`)
})().catch(e=>{console.error(e);process.exit(1)})
