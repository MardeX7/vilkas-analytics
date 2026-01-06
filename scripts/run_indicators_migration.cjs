/**
 * Run Indicators Migration
 *
 * Runs the indicators schema migration on VilkasAnalytics Supabase (tlothekaphtiwvusgwzh)
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// VilkasAnalytics Supabase (CORRECT DATABASE!)
const SUPABASE_URL = 'https://tlothekaphtiwvusgwzh.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function runMigration() {
  console.log('🟩 VilkasAnalytics Database Migration')
  console.log('=====================================')
  console.log('Target: tlothekaphtiwvusgwzh.supabase.co')
  console.log('')

  // Read migration files
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations')

  const migrationFiles = [
    '001_create_indicators_schema.sql',
    '20260106_add_cost_price_and_indicator_rpcs.sql'
  ]

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file)

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ Migration file not found: ${file}`)
      continue
    }

    console.log(`\n📄 Running: ${file}`)

    const sql = fs.readFileSync(filePath, 'utf-8')

    // Split SQL into statements (simple split by semicolon followed by newline)
    // This is a simple approach - for complex migrations use proper SQL parser
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'))

    console.log(`   Found ${statements.length} statements`)

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i]

      // Skip empty or comment-only statements
      if (!stmt || stmt.startsWith('--')) continue

      try {
        const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' })

        if (error) {
          // Try direct execution via REST API
          const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({ query: stmt })
          })

          if (!response.ok) {
            console.log(`   ⚠️ Statement ${i + 1}: ${error.message.substring(0, 50)}...`)
            errorCount++
          } else {
            successCount++
          }
        } else {
          successCount++
        }
      } catch (err) {
        console.log(`   ❌ Statement ${i + 1}: ${err.message.substring(0, 50)}...`)
        errorCount++
      }
    }

    console.log(`   ✅ Success: ${successCount}, ⚠️ Errors/Warnings: ${errorCount}`)
  }

  // Verify tables exist
  console.log('\n📊 Verifying migration...')

  const tables = ['shops', 'indicators', 'indicator_history', 'alerts']

  for (const table of tables) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(1)

    if (error) {
      console.log(`   ❌ ${table}: ${error.message}`)
    } else {
      console.log(`   ✅ ${table}: exists`)
    }
  }

  console.log('\n✨ Migration complete!')
}

runMigration().catch(console.error)
