/**
 * Tarkista tuotteiden cost_price ja price_amount tilanne
 *
 * VilkasAnalytics DB (tlothekaphtiwvusgwzh)
 * Store: Billackering.eu (a28836f6-9487-4b67-9194-e907eaf94b69)
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs')

async function checkCostPriceStatus() {
  printProjectInfo()

  console.log('🔍 Tarkistetaan cost_price tilanne...')
  console.log(`   Store ID: ${STORE_ID}`)
  console.log('')

  // 1. Kuinka monella tuotteella on cost_price?
  console.log('📊 1. Cost Price Tilasto:')
  const { data: stats, error: statsError } = await supabase.rpc('check_cost_price_stats', {
    p_store_id: STORE_ID
  })

  if (statsError) {
    console.log('   ⚠️  RPC-funktio ei toiminut, kokeillaan suoraa kyselyä...')

    const { data: products, error } = await supabase
      .from('products')
      .select('cost_price, price_amount, for_sale')
      .eq('store_id', STORE_ID)

    if (error) {
      console.error('❌ Virhe:', error.message)
      return
    }

    const totalProducts = products.length
    const withCostPrice = products.filter(p => p.cost_price !== null).length
    const nullCostPrice = products.filter(p => p.cost_price === null).length
    const zeroCostPrice = products.filter(p => p.cost_price === 0).length
    const withPriceAmount = products.filter(p => p.price_amount !== null).length
    const forSaleTrue = products.filter(p => p.for_sale === true).length

    console.log(`   Tuotteita yhteensä: ${totalProducts}`)
    console.log(`   - Cost price asetettu: ${withCostPrice} (${((withCostPrice/totalProducts)*100).toFixed(1)}%)`)
    console.log(`   - Cost price NULL: ${nullCostPrice} (${((nullCostPrice/totalProducts)*100).toFixed(1)}%)`)
    console.log(`   - Cost price = 0: ${zeroCostPrice} (${((zeroCostPrice/totalProducts)*100).toFixed(1)}%)`)
    console.log(`   - Price amount asetettu: ${withPriceAmount}`)
    console.log(`   - For sale = true: ${forSaleTrue}`)
    console.log('')
  } else {
    console.log(stats)
    console.log('')
  }

  // 2. Näytä muutama esimerkki tuotteista
  console.log('🛍️  2. Esimerkkituotteita (top 10 varastoltaan):')
  const { data: examples, error: examplesError } = await supabase
    .from('products')
    .select('name, product_number, stock_level, cost_price, price_amount, for_sale')
    .eq('store_id', STORE_ID)
    .eq('for_sale', true)
    .order('stock_level', { ascending: false })
    .limit(10)

  if (examplesError) {
    console.error('❌ Virhe:', examplesError.message)
  } else {
    console.table(examples)
    console.log('')
  }

  // 3. Tarkista inventory_snapshots tilanne
  console.log('📸 3. Inventory Snapshots (viimeiset 5):')
  const { data: snapshots, error: snapshotsError } = await supabase
    .from('inventory_snapshots')
    .select('snapshot_date, product_count, total_stock, total_value')
    .eq('store_id', STORE_ID)
    .order('snapshot_date', { ascending: false })
    .limit(5)

  if (snapshotsError) {
    console.error('❌ Virhe:', snapshotsError.message)

    // Jos taulu ei ole olemassa tai ei ole dataa
    if (snapshotsError.code === '42P01' || snapshotsError.message.includes('does not exist')) {
      console.log('   ⚠️  inventory_snapshots taulu ei löydy tai ei ole dataa')
    }
  } else if (!snapshots || snapshots.length === 0) {
    console.log('   ⚠️  Ei snapshot-dataa')
  } else {
    console.table(snapshots)
  }

  console.log('')
  console.log('✅ Tarkistus valmis!')
}

// Aja funktio
checkCostPriceStatus()
  .catch(error => {
    console.error('❌ Odottamaton virhe:', error)
    process.exit(1)
  })
