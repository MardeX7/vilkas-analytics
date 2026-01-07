/**
 * Testaa KPI-laskenta
 *
 * Käyttö: node scripts/test_kpi_calculation.cjs
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function testKPI() {
  console.log('🟩 VilkasAnalytics - KPI Test')
  console.log(`   URL: ${SUPABASE_URL}`)
  console.log('')

  // 1. Tarkista uudet taulut
  console.log('📋 Tarkistetaan uudet taulut...')

  const tables = [
    'kpi_index_snapshots',
    'inventory_snapshots',
    'product_profitability',
    'seo_performance_metrics',
    'ai_context_snapshots',
    'marketing_costs',
    'kpi_calculation_log'
  ]

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1)

    if (error) {
      console.log(`   ❌ ${table}: ${error.message}`)
    } else {
      console.log(`   ✅ ${table}: OK`)
    }
  }

  console.log('')

  // 2. Hae store_id testiin
  console.log('📋 Haetaan store_id...')
  const { data: stores, error: storesError } = await supabase
    .from('stores')
    .select('id, name')
    .limit(1)
    .single()

  if (storesError) {
    console.error('❌ Ei löytynyt kauppoja:', storesError.message)
    return
  }

  console.log(`   ✅ Löytyi: ${stores.name} (${stores.id})`)
  console.log('')

  // 3. Testaa RPC-funktiot
  console.log('📋 Testataan RPC-funktiot...')

  // calculate_core_metrics
  const periodEnd = new Date().toISOString().split('T')[0]
  const periodStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  console.log(`   Period: ${periodStart} - ${periodEnd}`)

  const { data: coreMetrics, error: coreError } = await supabase.rpc('calculate_core_metrics', {
    p_store_id: stores.id,
    p_period_start: periodStart,
    p_period_end: periodEnd
  })

  if (coreError) {
    console.log(`   ❌ calculate_core_metrics: ${coreError.message}`)
  } else {
    console.log(`   ✅ calculate_core_metrics:`, coreMetrics)
  }

  // 4. Kutsu Edge Function
  console.log('')
  console.log('📋 Testataan Edge Function...')

  const { data: edgeResult, error: edgeError } = await supabase.functions.invoke('daily-kpi-snapshot', {
    body: {
      store_id: stores.id,
      granularity: 'week'
    }
  })

  if (edgeError) {
    console.log(`   ❌ Edge Function: ${edgeError.message}`)
  } else {
    console.log(`   ✅ Edge Function:`, JSON.stringify(edgeResult, null, 2))
  }

  // 5. Tarkista tulokset
  console.log('')
  console.log('📋 Tarkistetaan tulokset...')

  const { data: snapshots, error: snapshotsError } = await supabase
    .from('kpi_index_snapshots')
    .select('*')
    .eq('store_id', stores.id)
    .order('created_at', { ascending: false })
    .limit(1)

  if (snapshotsError) {
    console.log(`   ❌ kpi_index_snapshots: ${snapshotsError.message}`)
  } else if (snapshots.length === 0) {
    console.log(`   ⚠️ Ei snapshot-dataa vielä`)
  } else {
    console.log(`   ✅ Viimeisin snapshot:`)
    console.log(`      Overall Index: ${snapshots[0].overall_index}`)
    console.log(`      Core Index: ${snapshots[0].core_index}`)
    console.log(`      PPI: ${snapshots[0].product_profitability_index}`)
    console.log(`      SPI: ${snapshots[0].seo_performance_index}`)
    console.log(`      OI: ${snapshots[0].operational_index}`)
  }

  console.log('')
  console.log('🎉 Testi valmis!')
}

testKPI().catch(console.error)
