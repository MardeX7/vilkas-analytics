/**
 * Tutkii Automaalit.net varastotilanteen
 * Käyttö: node scripts/check_automaalit_stock.cjs
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function main() {
  printProjectInfo()

  // 1. Hae kaikki kaupat
  console.log('=== KAUPAT ===\n')
  const { data: shops } = await supabase
    .from('shops')
    .select('id, name, store_id, currency, domain')

  if (!shops || shops.length === 0) {
    console.log('Ei kauppoja löytynyt!')
    return
  }

  shops.forEach(s => {
    console.log(`  ${s.name} (${s.domain})`)
    console.log(`    shop_id: ${s.id}`)
    console.log(`    store_id: ${s.store_id}`)
    console.log(`    currency: ${s.currency}`)
    console.log('')
  })

  // Etsi Automaalit
  const automaalit = shops.find(s => s.domain?.includes('automaalit') || s.name?.includes('Automaalit'))
  if (!automaalit) {
    console.log('Automaalit.net ei löytynyt shops-taulusta!')
    return
  }

  const storeId = automaalit.store_id
  console.log(`Käytetään store_id: ${storeId}\n`)

  // 2. Tuotteet joilla stock_level < 0
  console.log('=== AUTOMAALIT: TUOTTEET JOILLA stock_level < 0 ===\n')
  const { data: negative } = await supabase
    .from('products')
    .select('id, name, product_number, stock_level, cost_price, price_amount, stock_tracked, for_sale')
    .eq('store_id', storeId)
    .lt('stock_level', 0)
    .order('stock_level', { ascending: true })

  if (!negative || negative.length === 0) {
    console.log('Ei negatiivisia stock_level arvoja. ✅\n')
  } else {
    console.log(`Löytyi ${negative.length} tuotetta:\n`)
    let totalNeg = 0
    negative.forEach(p => {
      const unitCost = p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)
      const stockValue = p.stock_level * unitCost
      totalNeg += stockValue
      console.log(`  ${p.product_number || '?'} | ${p.name}`)
      console.log(`    stock: ${p.stock_level} | cost: ${p.cost_price || 'NULL'} | price: ${p.price_amount} | value: ${Math.round(stockValue)} €`)
      console.log(`    tracked: ${p.stock_tracked} | for_sale: ${p.for_sale}`)
      console.log('')
    })
    console.log(`  YHTEENSÄ negatiivinen arvo: ${Math.round(totalNeg)} €\n`)
  }

  // 3. Yhteenveto
  console.log('=== AUTOMAALIT: VARASTOARVON YHTEENVETO ===\n')
  const { data: allProducts } = await supabase
    .from('products')
    .select('stock_level, cost_price, price_amount, stock_tracked, for_sale')
    .eq('store_id', storeId)
    .eq('for_sale', true)

  if (allProducts) {
    let totalAll = 0
    let totalTracked = 0
    let totalCorrected = 0
    let countNoCost = 0

    allProducts.forEach(p => {
      const unitCost = p.cost_price || (p.price_amount ? p.price_amount * 0.6 : 0)
      if (!p.cost_price && p.stock_level > 0) countNoCost++
      const rawValue = (p.stock_level || 0) * unitCost
      const correctedValue = Math.max(p.stock_level || 0, 0) * unitCost

      totalAll += rawValue
      if (p.stock_tracked !== false) {
        totalTracked += rawValue
        totalCorrected += correctedValue
      }
    })

    console.log(`  Tuotteita yhteensä:            ${allProducts.length}`)
    console.log(`  Tuotteita ilman cost_price:     ${countNoCost}`)
    console.log(`  Kaikki for_sale tuotteet:       ${Math.round(totalAll)} €`)
    console.log(`  + stock_tracked != false:       ${Math.round(totalTracked)} €`)
    console.log(`  + negatiiviset korjattu (≥0):   ${Math.round(totalCorrected)} €`)
    console.log(`  Ero (negat. vaikutus):          ${Math.round(totalTracked - totalCorrected)} €`)
  }

  // 4. Snapshot-tilanne
  console.log('\n=== AUTOMAALIT: VIIMEISIMMÄT SNAPSHOTIT ===\n')
  const { data: snapshots } = await supabase
    .rpc('get_inventory_history_aggregated', {
      p_store_id: storeId,
      p_days_back: 14
    })

  if (snapshots && snapshots.length > 0) {
    snapshots.forEach(s => {
      console.log(`  ${s.snapshot_date} | arvo: ${Math.round(Number(s.total_value))} € | tuotteita: ${s.product_count}`)
    })
  } else {
    console.log('  Ei snapshoteja viimeiseltä 14 päivältä!')
  }
}

main().catch(console.error)
