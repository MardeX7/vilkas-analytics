/**
 * Top 20 Troton -tuotteet viimeiseltä 90 päivältä
 *
 * Listaa per kauppa:
 * - Liikevaihto, kate-€, kate-%
 * - Varastosaldo, myyntinopeus (päivää varastoa)
 * - Ostosuositus ennen hinnankorotusta
 *
 * Käyttö: node scripts/analyze_troton_top20.cjs
 */

const { supabase } = require('./db.cjs')

const DAYS = 90
const BUFFER_DAYS = 60 // turvavarasto: kuinka monen päivän myynti halutaan turvata ennen hinnankorotusta
const TOP_N = 20

async function fetchAllRows(queryFn) {
  let all = []
  let from = 0
  const page = 1000
  while (true) {
    const { data, error } = await queryFn(from, from + page - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < page) break
    from += page
  }
  return all
}

async function fetchInBatches(table, cols, col, values, extra = {}) {
  const batch = 200
  let all = []
  for (let i = 0; i < values.length; i += batch) {
    let q = supabase.from(table).select(cols).in(col, values.slice(i, i + batch))
    for (const [k, v] of Object.entries(extra)) q = q.eq(k, v)
    const { data, error } = await q
    if (error) throw error
    all = all.concat(data || [])
  }
  return all
}

function fmt(n, currency) {
  if (n == null || isNaN(n)) return '-'
  return Math.round(n).toLocaleString('fi-FI') + ' ' + currency
}

async function analyzeStore(store) {
  const storeId = store.store_id
  const currency = store.currency === 'SEK' ? 'kr' : '€'

  console.log('\n' + '='.repeat(90))
  console.log(`🏪 ${store.name}  (${store.domain})`)
  console.log('='.repeat(90))

  // 1) Hae Troton-tuotteet (nimessä "Troton")
  const trotonProducts = await fetchAllRows((from, to) =>
    supabase.from('products')
      .select('id, name, product_number, stock_level, cost_price, price_amount, for_sale')
      .eq('store_id', storeId)
      .ilike('name', '%troton%')
      .range(from, to)
  )

  if (trotonProducts.length === 0) {
    console.log('  Ei Troton-tuotteita.')
    return
  }
  console.log(`  Trotonin tuotteita yhteensä: ${trotonProducts.length}`)

  const productById = new Map(trotonProducts.map(p => [p.id, p]))
  const productByNumber = new Map(trotonProducts.filter(p => p.product_number).map(p => [p.product_number, p]))

  // 2) Hae 90 päivän tilaukset
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - DAYS * 86400000).toISOString().split('T')[0]
  const orders = await fetchAllRows((from, to) =>
    supabase.from('orders').select('id, creation_date')
      .eq('store_id', storeId)
      .neq('status', 'cancelled')
      .gte('creation_date', startDate)
      .lte('creation_date', endDate + 'T23:59:59')
      .range(from, to)
  )
  console.log(`  Tilauksia ${DAYS} päivän aikana (${startDate} → ${endDate}): ${orders.length}`)

  if (orders.length === 0) return
  const orderIds = orders.map(o => o.id)

  // 3) Yritä order_items (shop_id, product_id), fallback order_line_items (product_number)
  const { data: shopRow } = await supabase.from('shops').select('id').eq('store_id', storeId).single()
  const shopId = shopRow?.id

  let lineItems = []
  if (shopId) {
    lineItems = await fetchInBatches(
      'order_items', 'product_id, quantity, line_total, order_id',
      'order_id', orderIds, { shop_id: shopId }
    )
    // Suodata vain Troton
    lineItems = lineItems.filter(li => productById.has(li.product_id))
  }

  if (lineItems.length === 0) {
    const raw = await fetchInBatches(
      'order_line_items', 'product_number, quantity, total_price, order_id',
      'order_id', orderIds
    )
    lineItems = raw
      .filter(li => productByNumber.has(li.product_number))
      .map(li => ({
        product_id: productByNumber.get(li.product_number).id,
        quantity: li.quantity,
        line_total: li.total_price,
        order_id: li.order_id
      }))
  }

  console.log(`  Trotonin myyntirivejä: ${lineItems.length}`)
  if (lineItems.length === 0) return

  // 4) Aggregointi tuotteittain
  const stats = new Map()
  for (const li of lineItems) {
    if (!stats.has(li.product_id)) {
      stats.set(li.product_id, { units: 0, revenue: 0, orders: new Set() })
    }
    const s = stats.get(li.product_id)
    s.units += li.quantity || 0
    s.revenue += parseFloat(li.line_total) || 0
    s.orders.add(li.order_id)
  }

  // 5) Laske kate, varasto-päivät, suositus
  const rows = []
  for (const [pid, s] of stats) {
    const p = productById.get(pid)
    if (!p) continue
    const cost = p.cost_price ? parseFloat(p.cost_price) : null
    const totalCost = cost != null ? cost * s.units : null
    const grossProfit = totalCost != null ? s.revenue - totalCost : null
    const marginPct = grossProfit != null && s.revenue > 0 ? (grossProfit / s.revenue) * 100 : null

    const dailyVelocity = s.units / DAYS
    const stock = p.stock_level || 0
    const daysOfStock = dailyVelocity > 0 ? stock / dailyVelocity : null
    // Suositus: turvaa BUFFER_DAYS päivän myynti yli nykyisen varaston
    const targetStock = Math.ceil(dailyVelocity * BUFFER_DAYS)
    const buyRecommendation = Math.max(0, targetStock - stock)

    rows.push({
      pid,
      name: p.name,
      sku: p.product_number || '-',
      units: s.units,
      revenue: s.revenue,
      grossProfit,
      marginPct,
      cost,
      stock,
      dailyVelocity,
      daysOfStock,
      buyRecommendation
    })
  }

  // 6) Yhdistetty score: liikevaihto + kate-€ (skaalattu)
  const maxRev = Math.max(...rows.map(r => r.revenue), 1)
  const maxGp = Math.max(...rows.map(r => r.grossProfit || 0), 1)
  rows.forEach(r => {
    r.combinedScore = (r.revenue / maxRev) + ((r.grossProfit || 0) / maxGp)
  })

  // Top 20 yhdistetyllä scorella
  const top = rows.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, TOP_N)

  // 7) Tulosta
  console.log(`\n  TOP ${TOP_N} TROTON-TUOTTEET (yhdistetty score: liikevaihto + kate)`)
  console.log(`  Turvavarastotavoite: ${BUFFER_DAYS} päivän myynti.\n`)

  const totalRev = top.reduce((s, r) => s + r.revenue, 0)
  const totalGp = top.reduce((s, r) => s + (r.grossProfit || 0), 0)
  const totalRecUnits = top.reduce((s, r) => s + r.buyRecommendation, 0)
  const totalRecCost = top.reduce((s, r) => s + (r.buyRecommendation * (r.cost || 0)), 0)

  console.log(
    '   #'.padEnd(4) +
    'Tuote'.padEnd(48) +
    'SKU'.padEnd(10) +
    'Myyty'.padStart(8) +
    'LV'.padStart(12) +
    'Kate€'.padStart(12) +
    'Kate%'.padStart(8) +
    'Var'.padStart(7) +
    'Pv/var'.padStart(8) +
    'Osta'.padStart(7)
  )
  console.log('   ' + '-'.repeat(112))

  top.forEach((r, i) => {
    const name = (r.name || '').substring(0, 46)
    console.log(
      `   ${(i + 1).toString().padEnd(2)}` +
      ' ' + name.padEnd(47) +
      String(r.sku).padEnd(10) +
      String(r.units).padStart(8) +
      fmt(r.revenue, currency).padStart(12) +
      fmt(r.grossProfit, currency).padStart(12) +
      (r.marginPct != null ? r.marginPct.toFixed(1) + '%' : '-').padStart(8) +
      String(r.stock).padStart(7) +
      (r.daysOfStock != null ? Math.round(r.daysOfStock) : '∞').toString().padStart(8) +
      String(r.buyRecommendation).padStart(7)
    )
  })

  console.log('   ' + '-'.repeat(112))
  console.log(
    `   YHTEENSÄ TOP ${TOP_N}: ` +
    `LV ${fmt(totalRev, currency)} | ` +
    `Kate ${fmt(totalGp, currency)} | ` +
    `Suositus ostaa ${totalRecUnits} kpl ` +
    `(arvo ostohinnoin n. ${fmt(totalRecCost, currency)})`
  )

  // Erilliset top-listat referenssiksi
  const topRev = [...rows].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  const topGp = [...rows].sort((a, b) => (b.grossProfit || 0) - (a.grossProfit || 0)).slice(0, 5)
  console.log(`\n   Top 5 LIIKEVAIHTO:  ${topRev.map(r => r.name.substring(0, 30) + ' (' + fmt(r.revenue, currency) + ')').join(' | ')}`)
  console.log(`   Top 5 KATE €:       ${topGp.map(r => r.name.substring(0, 30) + ' (' + fmt(r.grossProfit, currency) + ')').join(' | ')}`)

  // Riski: vähän varastoa suhteessa myyntiin
  const riskRows = top.filter(r => r.daysOfStock != null && r.daysOfStock < 30).sort((a, b) => a.daysOfStock - b.daysOfStock)
  if (riskRows.length > 0) {
    console.log(`\n   ⚠️ KRIITTISIMMÄT (varasto < 30 pv):`)
    riskRows.forEach(r => {
      console.log(`      • ${r.name.substring(0, 50)} — varastossa ${r.stock} kpl = ${Math.round(r.daysOfStock)} pv. Osta ${r.buyRecommendation} kpl.`)
    })
  }

  const noCost = top.filter(r => r.cost == null)
  if (noCost.length > 0) {
    console.log(`\n   ℹ️ ${noCost.length}/${TOP_N} tuotteelta puuttuu cost_price → kate-€ ja ostosuosituksen arvo aliarvioituvat.`)
  }
}

async function main() {
  console.log('🟩 Troton TOP 20 -analyysi (90 pv)\n')
  const { data: shops } = await supabase
    .from('shops')
    .select('id, store_id, name, domain, currency')
    .order('name')

  for (const shop of shops || []) {
    await analyzeStore(shop)
  }
}

main().catch(e => {
  console.error('❌ Virhe:', e.message)
  process.exit(1)
})
