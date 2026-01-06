/**
 * Test Indicator Engine
 *
 * Run: node scripts/test_indicators.cjs
 */

const { supabase, printProjectInfo } = require('./db.cjs')

async function testIndicators() {
  printProjectInfo()

  console.log('📊 Testing Indicator Engine\n')
  console.log('='.repeat(50))

  // 1. Get store
  const { data: stores, error: storesError } = await supabase
    .from('stores')
    .select('id, name, domain')
    .limit(1)

  if (storesError || !stores?.length) {
    console.error('❌ Failed to get store:', storesError?.message || 'No stores found')
    return
  }

  const store = stores[0]
  console.log(`\n🏪 Store: ${store.name} (${store.domain})`)
  console.log(`   Store ID: ${store.id}`)

  // Get shop_id from shops table (indicators use shop_id, not store_id)
  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('store_id', store.id)
    .single()

  const shopId = shop?.id
  console.log(`   Shop ID: ${shopId}`)

  if (!shopId) {
    console.error('❌ No shop found for store')
    return
  }

  // 2. Check current indicators
  const { data: indicators, error: indicatorsError } = await supabase
    .from('indicators')
    .select('indicator_id, numeric_value, direction, change_percent, value, confidence')
    .eq('shop_id', shopId)
    .eq('period_label', '30d')
    .order('indicator_id')

  if (indicatorsError) {
    console.error('❌ Failed to get indicators:', indicatorsError.message)
    return
  }

  console.log(`\n📈 Current Indicators (30d):`)
  console.log('-'.repeat(50))

  for (const ind of indicators) {
    const numVal = ind.numeric_value !== null ? ind.numeric_value : 'null'
    const direction = ind.direction || '-'
    const change = ind.change_percent !== null ? `${ind.change_percent}%` : '-'
    const context = ind.value?.context || {}
    const estimated = context.is_estimated ? ' (ESTIMATED)' : ''
    console.log(`   ${ind.indicator_id.padEnd(25)} : ${String(numVal).padStart(10)} (${direction}) ${change}${estimated}`)
    if (context.notes) {
      console.log(`     └─ ${context.notes}`)
    }
  }

  // 3. Check products cost_price coverage
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, cost_price')
    .eq('store_id', store.id)

  if (!productsError && products) {
    const withCost = products.filter(p => p.cost_price && parseFloat(p.cost_price) > 0).length
    console.log(`\n💰 Cost Price Coverage:`)
    console.log(`   ${withCost}/${products.length} products have cost_price (${Math.round(withCost/products.length*100)}%)`)
  }

  // 4. Check orders
  const { count: orderCount } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', store.id)

  console.log(`\n📦 Orders: ${orderCount || 0} total`)

  console.log('\n' + '='.repeat(50))
  console.log('✅ Test complete!')
  console.log('\n💡 To recalculate indicators, run:')
  console.log('   node scripts/run_engine.cjs')
}

testIndicators().catch(console.error)
