/**
 * Run GSC Daily Totals Migration
 *
 * Ajaa migraation ja synkkaa GSC-datan uudelleen
 */

const { supabase, printProjectInfo, STORE_ID } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  printProjectInfo()
  console.log('📦 Running GSC Daily Totals migration...\n')

  // Read migration SQL
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260113_gsc_daily_totals.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  // Run migration
  const { error: migrationError } = await supabase.rpc('exec_sql', { sql_text: sql })

  if (migrationError) {
    console.log('⚠️ RPC exec_sql not available, please run migration manually in Supabase Dashboard')
    console.log('\nSQL to run:')
    console.log('=' .repeat(50))
    console.log(sql)
    console.log('=' .repeat(50))
    return
  }

  console.log('✅ Migration completed!')
}

runMigration().catch(console.error)
