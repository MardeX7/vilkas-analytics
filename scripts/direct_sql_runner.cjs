/**
 * Ajaa SQL suoraan Supabase-tietokantaan
 *
 * Käyttö:
 *   node scripts/direct_sql_runner.cjs supabase/migrations/020_create_kpi_index_tables.sql
 *   node scripts/direct_sql_runner.cjs supabase/migrations/021_create_kpi_helper_functions.sql
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function runSqlFile(filePath) {
  console.log('🟩 VilkasAnalytics - Direct SQL Runner')
  console.log(`   URL: ${SUPABASE_URL}`)
  console.log(`   File: ${filePath}`)
  console.log('')

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Tiedostoa ei löydy: ${filePath}`)
    process.exit(1)
  }

  const sql = fs.readFileSync(filePath, 'utf-8')
  console.log(`📄 SQL luettu: ${sql.length} merkkiä`)

  // Kokeillaan ensin testata yhteys
  console.log('🔌 Testataan yhteyttä...')
  const { data: testData, error: testError } = await supabase
    .from('stores')
    .select('id')
    .limit(1)

  if (testError) {
    console.error(`❌ Yhteysvirhe: ${testError.message}`)
    process.exit(1)
  }

  console.log('✅ Yhteys toimii')
  console.log('')

  // Supabase JS ei tue suoraa SQL:ää
  // Mutta voimme kutsua rpc-funktiota joka ajaa SQL:n
  // Luodaan se ensin:

  console.log('📦 Luodaan exec_sql helper-funktio...')

  // Tämä pitää tehdä Supabase Dashboardissa ensin
  // Tai käyttää psql:ää

  console.log('')
  console.log('⚠️  Supabase JS client ei tue suoraa SQL-ajoa.')
  console.log('')
  console.log('📋 RATKAISU: Aja SQL Supabase Dashboard SQL Editorissa:')
  console.log('')
  console.log('   1. Avaa: https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql/new')
  console.log('')
  console.log('   2. Kopioi ja aja seuraava SQL:')
  console.log('')

  // Tulosta SQL tiedoston sisältö
  console.log('--- SQL ALKAA ---')
  console.log(sql)
  console.log('--- SQL LOPPUU ---')
}

const args = process.argv.slice(2)
if (args.length === 0) {
  console.log('Käyttö: node scripts/direct_sql_runner.cjs <sql-tiedosto>')
  console.log('')
  console.log('Esim:')
  console.log('  node scripts/direct_sql_runner.cjs supabase/migrations/020_create_kpi_index_tables.sql')
  process.exit(1)
}

runSqlFile(args[0])
