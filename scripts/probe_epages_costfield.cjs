/**
 * Probe: does the ePages product API return a purchase/cost price field?
 * Fetches one product per store and searches the JSON for cost-like keys.
 */
const { supabase, printProjectInfo } = require('./db.cjs')

function findCostKeys(obj, prefix = '', hits = []) {
  if (obj == null || typeof obj !== 'object') return hits
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (/cost|purchas|buying|gbase|einkauf|inkop|inköp|wholesale|margin|profit/i.test(k)) {
      hits.push(`${path} = ${JSON.stringify(v)?.slice(0, 120)}`)
    }
    if (v && typeof v === 'object') findCostKeys(v, path, hits)
  }
  return hits
}

;(async () => {
  printProjectInfo()
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, domain, epages_shop_id, access_token')

  for (const store of stores || []) {
    console.log(`\n${'='.repeat(60)}\n${store.name} (${store.domain})`)
    if (!store.access_token || !store.epages_shop_id) { console.log('  ei ePages-yhteyttä'); continue }
    const dom = store.domain.replace(/^www\./, '')
    const url = `https://www.${dom}/rs/shops/${store.epages_shop_id}/products?resultsPerPage=1&page=1`
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${store.access_token}`, Accept: 'application/vnd.epages.v1+json' } })
      if (!r.ok) { console.log(`  API ${r.status}: ${(await r.text()).slice(0, 200)}`); continue }
      const data = await r.json()
      const p = (data.items || [])[0]
      if (!p) { console.log('  ei tuotteita'); continue }
      console.log(`  tuote: ${p.name} (${p.productNumber})`)
      console.log(`  top-level kentät: ${Object.keys(p).join(', ')}`)
      const hits = findCostKeys(p)
      console.log(`  KUSTANNUS-/OSTOHINTAKENTÄT: ${hits.length ? '\n   - ' + hits.join('\n   - ') : 'EI LÖYTYNYT'}`)
      // also try fetching the single product resource (may expose more fields than the list)
      if (p.productId) {
        const r2 = await fetch(`https://www.${dom}/rs/shops/${store.epages_shop_id}/products/${p.productId}`, { headers: { Authorization: `Bearer ${store.access_token}`, Accept: 'application/vnd.epages.v1+json' } })
        if (r2.ok) {
          const single = await r2.json()
          const extra = Object.keys(single).filter(k => !Object.keys(p).includes(k))
          console.log(`  yksittäisresurssin LISÄkentät: ${extra.join(', ') || '(ei lisää)'}`)
          const h2 = findCostKeys(single)
          if (h2.length) console.log(`  yksittäisresurssin kustannuskentät:\n   - ${h2.join('\n   - ')}`)
        }
      }
    } catch (e) { console.log('  virhe:', e.message) }
  }
})().catch(e => { console.error(e); process.exit(1) })
