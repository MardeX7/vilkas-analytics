/**
 * Run GA4 Migration
 * Ajaa 009_google_analytics.sql migraation Supabase-kantaan
 */

const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  printProjectInfo()

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '009_google_analytics.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  console.log('📄 Running migration: 009_google_analytics.sql')
  console.log('   Creating: ga4_tokens, ga4_analytics tables')
  console.log('   Creating: v_ga4_daily_summary, v_ga4_traffic_sources, v_ga4_landing_pages views')
  console.log('')

  // Split SQL by semicolons and run each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  let successCount = 0
  let errorCount = 0

  for (const statement of statements) {
    // Skip empty or comment-only statements
    if (!statement || statement.startsWith('--')) continue

    try {
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' })

      if (error) {
        // Try direct query for DDL statements
        const { error: directError } = await supabase.from('_exec').select('*').limit(0)

        // If RPC doesn't work, we need to run via psql or Dashboard
        console.log(`   ⚠️ Statement needs manual execution (RPC not available for DDL)`)
        console.log(`   First 60 chars: ${statement.substring(0, 60)}...`)
        errorCount++
      } else {
        successCount++
      }
    } catch (err) {
      // Expected - Supabase JS client can't run DDL directly
      errorCount++
    }
  }

  console.log('')
  console.log('━'.repeat(60))
  console.log('')
  console.log('⚠️  Supabase JS client ei voi ajaa DDL-lauseita suoraan.')
  console.log('')
  console.log('🔧 Aja migraatio manuaalisesti:')
  console.log('')
  console.log('   1. Avaa Supabase Dashboard:')
  console.log('      https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql')
  console.log('')
  console.log('   2. Kopioi ja liitä tämän tiedoston sisältö:')
  console.log(`      ${migrationPath}`)
  console.log('')
  console.log('   3. Klikkaa "Run"')
  console.log('')
}

runMigration().catch(console.error)
