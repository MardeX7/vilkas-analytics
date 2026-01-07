/**
 * Ajaa KPI Index Engine migraatiot
 *
 * Käyttö: node scripts/run_kpi_migrations.cjs
 */

const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

async function runMigrations() {
  printProjectInfo()

  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations')

  const migrations = [
    '020_create_kpi_index_tables.sql',
    '021_create_kpi_helper_functions.sql'
  ]

  console.log('🚀 Aloitetaan KPI Index Engine migraatiot...\n')

  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration)

    if (!fs.existsSync(filePath)) {
      console.error(`❌ Migraatiotiedostoa ei löydy: ${migration}`)
      continue
    }

    console.log(`📄 Ajetaan: ${migration}`)

    const sql = fs.readFileSync(filePath, 'utf-8')

    // Supabase JS ei tue suoraan raakaa SQL:ää, joten käytetään rpc:tä tai pg_query
    // Tässä tapauksessa pitää ajaa Supabase Dashboardissa tai supabase db push
    console.log(`   ⚠️ SQL-tiedosto luettu (${sql.length} merkkiä)`)
    console.log(`   ℹ️  Aja tämä Supabase SQL Editorissa tai käytä supabase db push\n`)
  }

  console.log('📋 Migraatiot valmiina ajettavaksi Supabase SQL Editorissa.')
  console.log('   URL: https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql')
}

runMigrations().catch(console.error)
