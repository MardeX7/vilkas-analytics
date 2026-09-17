/**
 * Hinnankorotuskandidaatit (TOP 20 per kauppa, 90 pv)
 *
 * Käyttää vain ePages-dataa (master). 3 osatekijää, paino yhteensä 100:
 *   - Marginaali (35 p): matala kategorian mediaaniin nähden → korkeat pisteet
 *   - Myyntimomentum (35 p): 30 pv keskimyynti / edelliset 60 pv keskimyynti
 *   - Asiakaskunnan laajuus (30 p): uniikit tilaukset → kysynnän vakaus
 *
 * Suodatus: for_sale=true, cost_price>0, stock_level>0, ≥5 tilausta 90 pv
 *
 * Käyttö: node scripts/analyze_price_increase_candidates.cjs
 */

const { supabase } = require('./db.cjs')

const DAYS = 90
const RECENT_DAYS = 30
const PRIOR_DAYS = 60
const MIN_ORDERS = 5
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

function fmt(n, currency, decimals = 0) {
  if (n == null || isNaN(n)) return '-'
  return n.toLocaleString('fi-FI', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + ' ' + currency
}

function median(arr) {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// Suositeltu hinnankorotus pisteiden perusteella
function recommendedIncrease(score) {
  if (score >= 85) return 8
  if (score >= 70) return 5
  if (score >= 60) return 3
  return 0
}

async function analyzeStore(shop) {
  const storeId = shop.store_id
  const currency = shop.currency === 'SEK' ? 'kr' : '€'

  console.log('\n' + '='.repeat(120))
  console.log(`🏪 ${shop.name}  (${shop.domain})`)
  console.log('='.repeat(120))

  // 1) Hae kaikki for_sale-tuotteet joilla cost_price ja stock_level
  const products = await fetchAllRows((from, to) =>
    supabase.from('products')
      .select('id, name, product_number, stock_level, cost_price, price_amount, category_name, for_sale')
      .eq('store_id', storeId)
      .eq('for_sale', true)
      .gt('stock_level', 0)
      .not('cost_price', 'is', null)
      .gt('cost_price', 0)
      .gt('price_amount', 0)
      .range(from, to)
  )
  console.log(`  Tuotteita kelpoisuussuodatuksen jälkeen: ${products.length}`)

  const productById = new Map(products.map(p => [p.id, p]))
  const productByNumber = new Map(products.filter(p => p.product_number).map(p => [p.product_number, p]))

  // 2) Hae 90 pv tilaukset
  const endDate = new Date()
  const startDate = new Date(Date.now() - DAYS * 86400000)
  const recentCutoff = new Date(Date.now() - RECENT_DAYS * 86400000) // 30 pv sitten
  const startStr = startDate.toISOString().split('T')[0]
  const endStr = endDate.toISOString().split('T')[0]

  const orders = await fetchAllRows((from, to) =>
    supabase.from('orders')
      .select('id, creation_date')
      .eq('store_id', storeId)
      .neq('status', 'cancelled')
      .gte('creation_date', startStr)
      .lte('creation_date', endStr + 'T23:59:59')
      .range(from, to)
  )
  console.log(`  Tilauksia 90 pv: ${orders.length}`)
  if (orders.length === 0) return

  const orderDateById = new Map(orders.map(o => [o.id, new Date(o.creation_date)]))
  const orderIds = orders.map(o => o.id)

  // 3) Line items — order_items (shop_id) ensisijainen, fallback order_line_items
  const { data: shopRow } = await supabase.from('shops').select('id').eq('store_id', storeId).single()
  const shopId = shopRow?.id

  let lineItems = []
  if (shopId) {
    lineItems = await fetchInBatches(
      'order_items', 'product_id, quantity, line_total, order_id',
      'order_id', orderIds, { shop_id: shopId }
    )
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
  console.log(`  Myyntirivejä kelpoisille tuotteille: ${lineItems.length}`)

  // 4) Aggregoi tuotteittain — split recent (30 pv) vs prior (60 pv)
  const stats = new Map()
  for (const li of lineItems) {
    if (!stats.has(li.product_id)) {
      stats.set(li.product_id, {
        units: 0, revenue: 0, orders: new Set(),
        recentRevenue: 0, priorRevenue: 0,
        recentUnits: 0, priorUnits: 0
      })
    }
    const s = stats.get(li.product_id)
    const orderDate = orderDateById.get(li.order_id)
    const isRecent = orderDate >= recentCutoff
    const rev = parseFloat(li.line_total) || 0
    const qty = li.quantity || 0

    s.units += qty
    s.revenue += rev
    s.orders.add(li.order_id)
    if (isRecent) {
      s.recentRevenue += rev
      s.recentUnits += qty
    } else {
      s.priorRevenue += rev
      s.priorUnits += qty
    }
  }

  // 5) Suodata: ≥5 tilausta
  const candidates = []
  for (const [pid, s] of stats) {
    if (s.orders.size < MIN_ORDERS) continue
    const p = productById.get(pid)
    if (!p) continue

    const cost = parseFloat(p.cost_price)
    const price = parseFloat(p.price_amount)
    const marginPct = ((price - cost) / price) * 100
    const grossProfit = s.revenue - cost * s.units

    // Myyntimomentum: päivittäinen myynti viim. 30 pv vs edelliset 60 pv
    const recentDaily = s.recentRevenue / RECENT_DAYS
    const priorDaily = s.priorRevenue / PRIOR_DAYS
    const momentum = priorDaily > 0 ? recentDaily / priorDaily : (recentDaily > 0 ? 2.0 : 1.0)

    candidates.push({
      pid,
      name: p.name,
      sku: p.product_number || '-',
      category: p.category_name || '-',
      stock: p.stock_level,
      price, cost,
      marginPct,
      revenue: s.revenue,
      grossProfit,
      units: s.units,
      orderCount: s.orders.size,
      momentum,
      recentRevenue: s.recentRevenue,
      priorRevenue: s.priorRevenue
    })
  }

  console.log(`  Kandidaatteja (≥${MIN_ORDERS} tilausta): ${candidates.length}\n`)
  if (candidates.length === 0) return

  // 6) Pisteytys — vertaa shop-mediaaniin
  const marginValues = candidates.map(c => c.marginPct)
  const orderCountValues = candidates.map(c => c.orderCount)
  const medianMargin = median(marginValues)
  const medianOrders = median(orderCountValues)

  candidates.forEach(c => {
    // Marginaalipisteet (35 p) — matala marginaali → korkeat pisteet
    // Suhteellinen: jos marginaali on 50% mediaanista → 35p, jos 200% mediaanista → 0p
    const marginRatio = c.marginPct / medianMargin // <1 = matalampi kuin mediaani
    const marginScore = Math.max(0, Math.min(35, 35 * (1 - (marginRatio - 0.5) / 1.5)))

    // Momentum (35 p) — 1.0 = neutraali (17.5p), 2.0+ = täydet 35p, 0 = 0p
    const momentumScore = Math.max(0, Math.min(35, 35 * (c.momentum / 2)))

    // Breadth (30 p) — verrataan tilausmäärää mediaaniin. 1x mediaani = 15p, 2x+ = 30p
    const breadthRatio = c.orderCount / medianOrders
    const breadthScore = Math.max(0, Math.min(30, 15 * breadthRatio))

    c.marginScore = marginScore
    c.momentumScore = momentumScore
    c.breadthScore = breadthScore
    c.score = marginScore + momentumScore + breadthScore
    c.recommendedIncreasePct = recommendedIncrease(c.score)
    c.newPrice = c.price * (1 + c.recommendedIncreasePct / 100)
    c.newMarginPct = ((c.newPrice - c.cost) / c.newPrice) * 100
    c.estAnnualUpside = c.recommendedIncreasePct > 0
      ? (c.newPrice - c.price) * (c.units / DAYS) * 365
      : 0
  })

  // 7) TOP 20 score-järjestyksessä
  const top = candidates.sort((a, b) => b.score - a.score).slice(0, TOP_N)

  console.log(`  TOP ${TOP_N} HINNANKOROTUSKANDIDAATIT`)
  console.log(`  (mediaani: marginaali ${medianMargin.toFixed(1)}%, tilauksia ${medianOrders.toFixed(0)})\n`)

  console.log(
    '  #'.padEnd(4) +
    'Tuote'.padEnd(46) +
    'SKU'.padEnd(14) +
    'Hinta'.padStart(9) +
    'Mar%'.padStart(7) +
    'Tilauks'.padStart(8) +
    'Mom'.padStart(6) +
    'M'.padStart(5) +
    'Mo'.padStart(5) +
    'B'.padStart(5) +
    'Score'.padStart(7) +
    'Korot.'.padStart(8) +
    'Vuositulo'.padStart(13)
  )
  console.log('  ' + '-'.repeat(140))

  top.forEach((c, i) => {
    const rec = c.recommendedIncreasePct > 0 ? `+${c.recommendedIncreasePct}%` : '—'
    console.log(
      `  ${(i + 1).toString().padEnd(2)}` +
      ' ' + (c.name || '').substring(0, 45).padEnd(45) +
      String(c.sku).substring(0, 13).padEnd(14) +
      fmt(c.price, currency, 0).padStart(9) +
      c.marginPct.toFixed(0).padStart(6) + '%' +
      String(c.orderCount).padStart(8) +
      c.momentum.toFixed(2).padStart(6) +
      c.marginScore.toFixed(0).padStart(5) +
      c.momentumScore.toFixed(0).padStart(5) +
      c.breadthScore.toFixed(0).padStart(5) +
      c.score.toFixed(0).padStart(7) +
      rec.padStart(8) +
      fmt(c.estAnnualUpside, currency, 0).padStart(13)
    )
  })
  console.log('  ' + '-'.repeat(140))

  const upsideTotal = top.reduce((s, c) => s + c.estAnnualUpside, 0)
  const recommendedCount = top.filter(c => c.recommendedIncreasePct > 0).length
  console.log(
    `  Sarakkeet: M=Marginaali (35), Mo=Momentum (35), B=Breadth (30), Score=yhteensä, Korot.=suositeltu hinnankorotus, Vuositulo=arvioitu lisätuotto/v\n` +
    `  YHTEENSÄ: ${recommendedCount}/${TOP_N} tuotetta saa korotussuosituksen. Arvioitu lisäliikevaihto/vuosi: ${fmt(upsideTotal, currency, 0)}.`
  )

  // Erilliset luokat
  const aggressive = top.filter(c => c.recommendedIncreasePct === 8)
  const moderate = top.filter(c => c.recommendedIncreasePct === 5)
  const conservative = top.filter(c => c.recommendedIncreasePct === 3)

  if (aggressive.length > 0) {
    console.log(`\n  🔥 VAHVAT (+8%, score ≥ 85): ${aggressive.length} kpl`)
    aggressive.forEach(c => {
      console.log(`     • ${c.name.substring(0, 60)} — score ${c.score.toFixed(0)}, marginaali ${c.marginPct.toFixed(0)}% → ${c.newMarginPct.toFixed(0)}%, vuosihyöty ${fmt(c.estAnnualUpside, currency, 0)}`)
    })
  }
  if (moderate.length > 0) {
    console.log(`\n  💪 KESKIVAHVAT (+5%, score 70–84): ${moderate.length} kpl`)
    moderate.slice(0, 5).forEach(c => {
      console.log(`     • ${c.name.substring(0, 60)} — score ${c.score.toFixed(0)}, vuosihyöty ${fmt(c.estAnnualUpside, currency, 0)}`)
    })
    if (moderate.length > 5) console.log(`     … ja ${moderate.length - 5} muuta`)
  }
  if (conservative.length > 0) {
    console.log(`\n  🤏 KONSERVATIIVISET (+3%, score 60–69): ${conservative.length} kpl`)
  }
}

async function main() {
  console.log('🟩 Hinnankorotuskandidaatit (90 pv, vain ePages-data)\n')
  console.log('Pisteytys: Marginaali (35) + Momentum (35) + Breadth (30) = 100 max\n')

  const { data: shops } = await supabase
    .from('shops')
    .select('id, store_id, name, domain, currency')
    .order('name')

  for (const shop of shops || []) {
    await analyzeStore(shop)
  }

  console.log('\n💡 HUOMIOITAVAA:')
  console.log('  • Mallissa ei ole kilpailijahintoja → testaa korotukset A/B tai vaiheittain.')
  console.log('  • Korotukset ovat varovaisia (max +8 %). Seuraa myyntiä 4–6 viikkoa korotuksen jälkeen.')
  console.log('  • Jos myynti tippuu yli 15 %, palauta hinta. Jos pysyy ennallaan, voit harkita uutta korotusta.')
  console.log('  • Vuositulo-arvio olettaa että myyntivolyymi pysyy ennallaan. Konservatiivinen tulkinta: kerro 0,7–0,9.')
}

main().catch(e => { console.error('❌ Virhe:', e.message); process.exit(1) })
