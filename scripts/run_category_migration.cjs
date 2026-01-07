/**
 * Run Category Migration using Supabase REST API
 *
 * Creates:
 * - categories table
 * - product_categories junction table
 * - Category views and RPC functions
 *
 * Usage: node scripts/run_category_migration.cjs
 */

const fs = require('fs')
const path = require('path')
const { supabase, printProjectInfo, SUPABASE_URL, SERVICE_ROLE_KEY } = require('./db.cjs')

const MIGRATION_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '010_product_categories.sql')

async function runMigration() {
  printProjectInfo()

  // Read migration file
  const sql = fs.readFileSync(MIGRATION_FILE, 'utf8')
  console.log('📄 Loaded migration file:', MIGRATION_FILE)

  // Split into individual statements (careful with $$ blocks)
  const statements = []
  let current = ''
  let inDollarBlock = false

  for (const line of sql.split('\n')) {
    const trimmed = line.trim()

    // Skip empty lines and comments at statement level
    if (!inDollarBlock && (trimmed === '' || trimmed.startsWith('--'))) {
      if (current.trim()) current += '\n' + line
      continue
    }

    // Track $$ blocks (functions)
    if (trimmed.includes('$$')) {
      const count = (line.match(/\$\$/g) || []).length
      if (count === 1) {
        inDollarBlock = !inDollarBlock
      }
      // count === 2 means opening and closing on same line, stay same state
    }

    current += '\n' + line

    // End of statement (not in $$ block and ends with ;)
    if (!inDollarBlock && trimmed.endsWith(';')) {
      const stmt = current.trim()
      if (stmt && !stmt.startsWith('--')) {
        statements.push(stmt)
      }
      current = ''
    }
  }

  // Add any remaining statement
  if (current.trim()) {
    statements.push(current.trim())
  }

  console.log(`📝 Found ${statements.length} SQL statements to execute`)

  // Execute via Supabase REST API (pg_execute or direct postgres connection would be better)
  // For now, we'll use fetch to the Supabase SQL endpoint

  const sqlEndpoint = `${SUPABASE_URL}/rest/v1/rpc/`

  // First, check if we can use postgres directly via the management API
  // Or try running each DDL statement

  console.log('\n⚠️  DDL statements need to be run via Supabase Dashboard SQL Editor')
  console.log('    Copy the SQL from: supabase/migrations/010_product_categories.sql')
  console.log('    Paste into: https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql\n')

  // Alternative: Check if tables already exist
  console.log('🔍 Checking if tables already exist...\n')

  const { data: catCheck, error: catError } = await supabase
    .from('categories')
    .select('id')
    .limit(1)

  if (catError && catError.message.includes('does not exist')) {
    console.log('❌ categories table does not exist')
    console.log('   Please run the migration SQL in Supabase Dashboard')
  } else if (catError) {
    console.log('⚠️  categories table check error:', catError.message)
  } else {
    console.log('✅ categories table exists')
  }

  const { data: pcCheck, error: pcError } = await supabase
    .from('product_categories')
    .select('id')
    .limit(1)

  if (pcError && pcError.message.includes('does not exist')) {
    console.log('❌ product_categories table does not exist')
    console.log('   Please run the migration SQL in Supabase Dashboard')
  } else if (pcError) {
    console.log('⚠️  product_categories table check error:', pcError.message)
  } else {
    console.log('✅ product_categories table exists')
  }

  // Print the SQL for easy copy-paste
  console.log('\n' + '='.repeat(60))
  console.log('SQL TO RUN IN SUPABASE DASHBOARD:')
  console.log('='.repeat(60) + '\n')
  console.log(sql)
  console.log('\n' + '='.repeat(60))
}

runMigration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Error:', err)
    process.exit(1)
  })
