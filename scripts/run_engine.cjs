/**
 * Run Indicator Engine
 *
 * Calculates all indicators for the store and saves them to database.
 * Run: node scripts/run_engine.cjs
 */

const { supabase, printProjectInfo } = require('./db.cjs')

// Import ESM module dynamically
async function runEngine() {
  printProjectInfo()

  console.log('🔧 Running Indicator Engine\n')
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
  console.log(`   ID: ${store.id}`)

  // 2. Import engine (ESM)
  const { calculateAllIndicators } = await import('../src/lib/indicators/engine.js')

  // 3. Run calculations
  console.log('\n📊 Calculating indicators...\n')

  const results = await calculateAllIndicators({
    storeId: store.id,
    supabase,
    periodLabel: '30d',
    periodEnd: new Date()
  })

  // 4. Summary
  console.log('\n' + '='.repeat(50))
  console.log('📊 Results:')
  console.log(`   ✅ Success: ${results.success.join(', ') || 'none'}`)
  console.log(`   ❌ Errors: ${results.errors.map(e => e.id).join(', ') || 'none'}`)
  console.log(`   ⏭️ Skipped: ${results.skipped.join(', ') || 'none'}`)

  if (results.errors.length > 0) {
    console.log('\nError details:')
    for (const err of results.errors) {
      console.log(`   ${err.id}: ${err.error}`)
    }
  }

  console.log('\n✨ Engine run complete!')
  console.log('   Run "node scripts/test_indicators.cjs" to verify results')
}

runEngine().catch(console.error)
