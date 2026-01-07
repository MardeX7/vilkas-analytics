/**
 * Luo KPI Index Engine taulut käyttäen supabase.rpc()
 *
 * Käyttö: node scripts/run_kpi_tables.cjs
 */

const { createClient } = require('@supabase/supabase-js')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function createTables() {
  console.log('🟩 VilkasAnalytics - KPI Index Tables')
  console.log(`   URL: ${SUPABASE_URL}`)
  console.log('')

  // Testataan yhteys
  const { data: testData, error: testError } = await supabase
    .from('stores')
    .select('id, name')
    .limit(1)

  if (testError) {
    console.error('❌ Yhteysvirhe:', testError.message)
    return
  }

  console.log('✅ Yhteys OK')
  console.log(`   Löytyi ${testData.length} kauppa(a)`)
  console.log('')

  // Tarkistetaan onko tauluja jo olemassa
  console.log('📋 Tarkistetaan olemassa olevat taulut...')

  const { data: tables, error: tablesError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .in('table_name', [
      'kpi_index_snapshots',
      'inventory_snapshots',
      'product_profitability',
      'seo_performance_metrics',
      'ai_context_snapshots',
      'marketing_costs',
      'kpi_calculation_log'
    ])

  // information_schema ei ole suoraan queryable Supabase JS:llä
  // Kokeillaan muuta tapaa

  // Kokeillaan SELECT:iä kpi_index_snapshots:sta
  const { data: kpiTest, error: kpiError } = await supabase
    .from('kpi_index_snapshots')
    .select('id')
    .limit(1)

  if (kpiError && kpiError.code === '42P01') {
    console.log('   kpi_index_snapshots: ❌ Ei olemassa')
  } else if (kpiError) {
    console.log(`   kpi_index_snapshots: ⚠️ ${kpiError.message}`)
  } else {
    console.log('   kpi_index_snapshots: ✅ Olemassa')
  }

  console.log('')
  console.log('⚠️  Supabase JS ei tue CREATE TABLE -komentoja.')
  console.log('')
  console.log('📋 Aja SQL Supabase Dashboardissa:')
  console.log('   https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql/new')
  console.log('')
  console.log('   1. Kopioi: supabase/migrations/020_create_kpi_index_tables.sql')
  console.log('   2. Kopioi: supabase/migrations/021_create_kpi_helper_functions.sql')
}

createTables().catch(console.error)
