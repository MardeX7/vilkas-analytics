/**
 * Trotonin hinnankorotuksen läpivienti -analyysi
 *
 * Tilanne: Trotonin ostohinnat nousevat 4–11 % (per tuote vielä auki).
 * Kysymys: paljonko myyntihintaa kannattaa ja voi nostaa per tuote?
 *
 * Skenaariot per tuote:
 *   - Ostohinta +4 %, +7,5 %, +11 %
 *   - Jos myyntihinta pidetään → uusi marginaali
 *   - Jos pidetään marginaali samana → tarvittava myyntihinnan korotus
 *   - Mallin suosittama TURVALLINEN myyntihinnan korotuskatto (score-perusteinen)
 *   - Verdikti: PASS_THROUGH / PARTIAL / ABSORB
 *
 * Käyttö: node scripts/analyze_troton_cost_pass_through.cjs
 */

const { supabase } = require('./db.cjs')

const DAYS = 90
const RECENT_DAYS = 30
const PRIOR_DAYS = 60
const MIN_ORDERS = 5
const COST_SCENARIOS = [4, 7.5, 11] // %
const SAFE_RETAIL_CAPS = { 85: 8, 70: 5, 60: 3, 0: 0 } // score → max safe retail %

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

function safeRetailCap(score) {
  if (score >= 85) return 8
  if (score >= 70) return 5
  if (score >= 60) return 3
  return 0
}

function verdict(safeCap, costIncreasePct) {
  // Voiko myyntihinnan korottaa täysin = kustannusten verran?
  if (safeCap >= costIncreasePct) return 'PASS_FULL'
  if (safeCap >= costIncreasePct * 0.5) return 'PASS_PARTIAL'
  return 'ABSORB'
}

async function analyzeStore(shop) {
  const storeId = shop.store_id
  const currency = shop.currency === 'SEK' ? 'kr' : '€'

  console.log('\n' + '='.repeat(140))
  console.log(`🏪 ${shop.name}  (${shop.domain})`)
  console.log('='.repeat(140))

  // 1) Hae Troton-tuotteet (myynnissä, cost_price tiedossa, varastoa)
  const products = await fetchAllRows((from, to) =>
    supabase.from('products')
      .select('id, name, product_number, stock_level, cost_price, price_amount')
      .eq('store_id', storeId)
      .eq('for_sale', true)
      .ilike('name', '%troton%')
      .gt('cost_price', 0)
      .gt('price_amount', 0)
      .range(from, to)
  )
  console.log(`  Trotonin tuotteita (cost_price tiedossa): ${products.length}`)

  const productById = new Map(products.map(p => [p.id, p]))
  const productByNumber = new Map(products.filter(p => p.product_number).map(p => [p.product_number, p]))

  // 2) Hae 90 pv tilaukset
  const recentCutoff = new Date(Date.now() - RECENT_DAYS * 86400000)
  const startStr = new Date(Date.now() - DAYS * 86400000).toISOString().split('T')[0]
  const endStr = new Date().toISOString().split('T')[0]

  const orders = await fetchAllRows((from, to) =>
    supabase.from('orders').select('id, creation_date')
      .eq('store_id', storeId).neq('status', 'cancelled')
      .gte('creation_date', startStr).lte('creation_date', endStr + 'T23:59:59')
      .range(from, to)
  )
  const orderDateById = new Map(orders.map(o => [o.id, new Date(o.creation_date)]))
  const orderIds = orders.map(o => o.id)

  // 3) Line items
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

  // 4) Aggregointi + recent vs prior split
  const stats = new Map()
  for (const li of lineItems) {
    if (!stats.has(li.product_id)) {
      stats.set(li.product_id, {
        units: 0, revenue: 0, orders: new Set(),
        recentRevenue: 0, priorRevenue: 0
      })
    }
    const s = stats.get(li.product_id)
    s.units += li.quantity || 0
    s.revenue += parseFloat(li.line_total) || 0
    s.orders.add(li.order_id)
    if (orderDateById.get(li.order_id) >= recentCutoff) {
      s.recentRevenue += parseFloat(li.line_total) || 0
    } else {
      s.priorRevenue += parseFloat(li.line_total) || 0
    }
  }

  // 5) Suodata + perustiedot
  const items = []
  for (const [pid, s] of stats) {
    if (s.orders.size < MIN_ORDERS) continue
    const p = productById.get(pid)
    if (!p) continue
    const cost = parseFloat(p.cost_price)
    const price = parseFloat(p.price_amount)
    const marginPct = ((price - cost) / price) * 100
    const recentDaily = s.recentRevenue / RECENT_DAYS
    const priorDaily = s.priorRevenue / PRIOR_DAYS
    const momentum = priorDaily > 0 ? recentDaily / priorDaily : (recentDaily > 0 ? 2.0 : 1.0)

    items.push({
      pid, name: p.name, sku: p.product_number || '-',
      stock: p.stock_level, cost, price, marginPct,
      revenue: s.revenue, units: s.units, orderCount: s.orders.size,
      momentum
    })
  }

  if (items.length === 0) {
    console.log('  Ei Troton-tuotteita joilla ≥5 tilausta.')
    return
  }

  // 6) Pisteytys (sama 3-osainen kuin yleisanalyysissa, vain Troton-jouko sisällä)
  const medianMargin = median(items.map(c => c.marginPct))
  const medianOrders = median(items.map(c => c.orderCount))

  items.forEach(c => {
    const marginRatio = c.marginPct / medianMargin
    const marginScore = Math.max(0, Math.min(35, 35 * (1 - (marginRatio - 0.5) / 1.5)))
    const momentumScore = Math.max(0, Math.min(35, 35 * (c.momentum / 2)))
    const breadthRatio = c.orderCount / medianOrders
    const breadthScore = Math.max(0, Math.min(30, 15 * breadthRatio))
    c.score = marginScore + momentumScore + breadthScore
    c.safeRetailCap = safeRetailCap(c.score)
  })

  // 7) Skenaariot per tuote
  items.forEach(c => {
    c.scenarios = COST_SCENARIOS.map(costPct => {
      const newCost = c.cost * (1 + costPct / 100)

      // Jos myyntihinta pidetään: uusi marginaali
      const heldMarginPct = ((c.price - newCost) / c.price) * 100
      const heldMarginDelta = heldMarginPct - c.marginPct // pp

      // Jos halutaan pitää marginaali (€): hinnankorotus = costPct%
      const keepMarginRetailPct = costPct

      // Mallin suositus: pass through max safe cap, absorboi loput
      const recRetailPct = Math.min(c.safeRetailCap, costPct)
      const newPriceRec = c.price * (1 + recRetailPct / 100)
      const recMarginPct = ((newPriceRec - newCost) / newPriceRec) * 100

      // Vuosivaikutus jos volyymi pysyy
      const yearlyUnits = (c.units / DAYS) * 365
      const annualRevenueDelta = (newPriceRec - c.price) * yearlyUnits
      const annualGrossProfitDelta = ((newPriceRec - newCost) - (c.price - c.cost)) * yearlyUnits

      return {
        costPct,
        heldMarginPct,
        heldMarginDelta,
        keepMarginRetailPct,
        recRetailPct,
        recMarginPct,
        verdict: verdict(c.safeRetailCap, costPct),
        annualRevenueDelta,
        annualGrossProfitDelta
      }
    })
  })

  // Lajittele 90 pv liikevaihdon mukaan
  items.sort((a, b) => b.revenue - a.revenue)

  // 8) Tulosta päätaulukko
  console.log(`\n  ${items.length} Troton-tuotetta joilla ≥${MIN_ORDERS} tilausta.`)
  console.log(`  Ostohinnan korotusskenaariot: ${COST_SCENARIOS.map(s => '+' + s + '%').join(', ')}\n`)

  console.log(
    '  #'.padEnd(4) +
    'Tuote'.padEnd(44) +
    'Hinta'.padStart(8) +
    'Cost'.padStart(8) +
    'Mar%'.padStart(7) +
    'LV90'.padStart(10) +
    'Score'.padStart(7) +
    'Cap%'.padStart(6) +
    '  | +4% cost                          | +7,5% cost                        | +11% cost'
  )
  console.log(
    ' '.repeat(94) +
    'Mar→  Suos%  Verdikti       ' +
    'Mar→  Suos%  Verdikti       ' +
    'Mar→  Suos%  Verdikti'
  )
  console.log('  ' + '-'.repeat(196))

  items.forEach((c, i) => {
    let line =
      `  ${(i + 1).toString().padEnd(2)}` +
      ' ' + (c.name || '').substring(0, 43).padEnd(43) +
      fmt(c.price, currency, 0).padStart(8) +
      fmt(c.cost, currency, 0).padStart(8) +
      c.marginPct.toFixed(0).padStart(6) + '%' +
      fmt(c.revenue, currency, 0).padStart(10) +
      c.score.toFixed(0).padStart(7) +
      ('+' + c.safeRetailCap + '%').padStart(6) + '  | '

    line += c.scenarios.map(sc => {
      const marTo = sc.recMarginPct.toFixed(0) + '%'
      const rec = sc.recRetailPct > 0 ? '+' + sc.recRetailPct + '%' : '0%'
      return `${marTo.padStart(4)}  ${rec.padStart(5)}  ${sc.verdict.padEnd(13)}`
    }).join(' ')

    console.log(line)
  })
  console.log('  ' + '-'.repeat(196))
  console.log('  Cap% = mallin suosittama turvallinen myyntihinnan korotuskatto. Mar→ = uusi marginaali kun ostohinta nousee ja myyntihinta korotetaan suosituksen mukaan.')
  console.log('  PASS_FULL = pass through koko ostohinnankorotus turvallisesti. PARTIAL = osa pass through, osa absorboitava. ABSORB = älä korota myyntihintaa, tai vain pieni testikorotus.\n')

  // 9) Yhteenveto skenaarioittain
  console.log('  📊 SKENAARIOYHTEENVETO (vuositason vaikutus, jos myyntivolyymi pysyy):\n')

  COST_SCENARIOS.forEach((costPct, idx) => {
    const totalRevDelta = items.reduce((s, c) => s + c.scenarios[idx].annualRevenueDelta, 0)
    const totalGpDelta = items.reduce((s, c) => s + c.scenarios[idx].annualGrossProfitDelta, 0)

    // Jos EI tehtäisi mitään (myyntihinta pidetään): yearly GP delta
    const yearlyUnitsTotal = items.map(c => (c.units / DAYS) * 365)
    const noActionGpDelta = items.reduce((sum, c, i) => {
      const newCost = c.cost * (1 + costPct / 100)
      const oldGpPerUnit = c.price - c.cost
      const newGpPerUnit = c.price - newCost
      return sum + (newGpPerUnit - oldGpPerUnit) * yearlyUnitsTotal[i]
    }, 0)

    const counts = items.reduce((acc, c) => {
      acc[c.scenarios[idx].verdict] = (acc[c.scenarios[idx].verdict] || 0) + 1
      return acc
    }, {})

    console.log(`  Ostohinta +${costPct} %:`)
    console.log(`    Verdiktit: PASS_FULL ${counts.PASS_FULL || 0} | PARTIAL ${counts.PASS_PARTIAL || 0} | ABSORB ${counts.ABSORB || 0}`)
    console.log(`    Jos EI korotettaisi myyntihintaa: kateromahdus ${fmt(noActionGpDelta, currency, 0)}/v`)
    console.log(`    Mallin suosituksen mukaan korotettuna: liikevaihtomuutos ${fmt(totalRevDelta, currency, 0)}/v, katemuutos ${fmt(totalGpDelta, currency, 0)}/v`)
    console.log(`    → suhteellinen palautusaste: ${noActionGpDelta < 0 ? ((1 - Math.abs(totalGpDelta - noActionGpDelta) / Math.abs(noActionGpDelta)) * 100).toFixed(0) + ' % katemenetyksestä torjuttu' : 'ei katemenetystä'}\n`)
  })

  // 10) Top 5 ABSORB-tuotteet (näille ei kannata korottaa)
  const absorbItems = items.filter(c => c.scenarios[2].verdict === 'ABSORB' && c.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
  if (absorbItems.length > 0) {
    console.log(`  ⚠️ TUOTTEET JOILLA SUURIN ABSORB-RISKI (myyntihintaa ei voi korottaa, marginaali kärsii eniten):`)
    absorbItems.slice(0, 5).forEach(c => {
      const sc11 = c.scenarios[2]
      console.log(`     • ${c.name.substring(0, 55)} — score ${c.score.toFixed(0)}, marginaali ${c.marginPct.toFixed(0)}% → ${sc11.heldMarginPct.toFixed(0)}% (jos +11% cost), 90pv LV ${fmt(c.revenue, currency, 0)}`)
    })
  }
}

async function main() {
  console.log('🟩 Trotonin ostohinnan korotus → myyntihinnan läpivienti -analyysi (90 pv)\n')
  console.log('Skenaariot: ostohinta +4 %, +7,5 %, +11 %.')
  console.log('Mallin suositus = pass through TURVALLISEEN kattoon asti, absorboi loput.\n')

  const { data: shops } = await supabase
    .from('shops').select('id, store_id, name, domain, currency').order('name')

  for (const shop of shops || []) {
    await analyzeStore(shop)
  }

  console.log('\n💡 KÄYTTÖOHJE:')
  console.log('  • Kun saat Trotonilta tarkat per-tuote -korotusprosentit, katso kunkin tuotteen lähin sarake (4 / 7,5 / 11 %).')
  console.log('  • PASS_FULL: korota myyntihintaa täysimääräisesti.')
  console.log('  • PARTIAL: korota suos% verran, hyväksy pieni marginaaliromahdus.')
  console.log('  • ABSORB: pidä myyntihinta, kate kärsii. Vaihtoehto: vaihda toimittajaa tai korvaa tuote.')
}

main().catch(e => { console.error('❌ Virhe:', e.message); process.exit(1) })
