/**
 * Run Emma RAG Migration
 *
 * This script runs the pgvector migration for Emma RAG documents.
 * Run with: node scripts/run_rag_migration.cjs
 */

const { supabase, printProjectInfo } = require('./db.cjs')
const fs = require('fs')
const path = require('path')

async function runMigration() {
  printProjectInfo()
  console.log('\n=== Running Emma RAG Migration ===\n')

  // Read migration file
  const migrationPath = path.join(__dirname, '../supabase/migrations/20260123_emma_rag_documents.sql')
  const sql = fs.readFileSync(migrationPath, 'utf8')

  // Split into individual statements (simple split by semicolon + newline)
  const statements = sql
    .split(/;\s*\n/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  console.log(`Found ${statements.length} SQL statements to execute\n`)

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i]
    const preview = stmt.slice(0, 60).replace(/\n/g, ' ')
    console.log(`[${i + 1}/${statements.length}] ${preview}...`)

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt + ';' })
      if (error) {
        // Try direct query if RPC doesn't exist
        const { error: queryError } = await supabase.from('_dummy_').select('*').limit(0)
        if (queryError?.code === '42P01') {
          // Table doesn't exist, which is expected
        }
        throw error
      }
      console.log('  ✓ Success')
      successCount++
    } catch (err) {
      // Some errors are expected (like "already exists")
      if (err.message?.includes('already exists') || err.code === '42710') {
        console.log('  ⚠ Already exists (skipped)')
        successCount++
      } else if (err.message?.includes('does not exist') && stmt.includes('DROP')) {
        console.log('  ⚠ Does not exist (skipped)')
        successCount++
      } else {
        console.log(`  ✗ Error: ${err.message || err}`)
        errorCount++
      }
    }
  }

  console.log(`\n=== Migration Complete ===`)
  console.log(`Success: ${successCount}, Errors: ${errorCount}`)

  // Verify table exists
  console.log('\n--- Verification ---')
  const { data, error } = await supabase
    .from('emma_documents')
    .select('id')
    .limit(1)

  if (error) {
    if (error.code === '42P01') {
      console.log('❌ Table emma_documents does NOT exist')
      console.log('\nPlease run the migration manually in Supabase Dashboard:')
      console.log('https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql')
    } else {
      console.log(`⚠ Verification error: ${error.message}`)
    }
  } else {
    console.log('✅ Table emma_documents exists!')
    console.log(`   Rows: ${data?.length || 0}`)
  }
}

runMigration().catch(console.error)
