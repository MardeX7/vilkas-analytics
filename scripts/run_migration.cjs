/**
 * Run SQL migration using Supabase client
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment from .env.local
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

console.log('🔧 Connecting to:', supabaseUrl);

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runMigration() {
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '004_add_cost_price_and_indicator_rpcs.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Split SQL into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`📝 Running ${statements.length} SQL statements...`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];

    // Skip comments only
    if (stmt.startsWith('--')) continue;

    console.log(`\n[${i + 1}/${statements.length}] Executing...`);
    console.log(stmt.substring(0, 80) + (stmt.length > 80 ? '...' : ''));

    const { data, error } = await supabase.rpc('exec_sql', { query: stmt + ';' });

    if (error) {
      // Try direct query if exec_sql doesn't exist
      console.log('   Trying direct approach...');
      // For DDL, we need to use postgres.js or similar
    }
  }
}

// Alternative: just test if we can read products table and check for cost_price
async function checkCurrentState() {
  console.log('\n📊 Checking current database state...\n');

  // Check products table structure
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('*')
    .limit(1);

  if (productsError) {
    console.log('❌ Products table error:', productsError.message);
  } else if (products.length > 0) {
    const columns = Object.keys(products[0]);
    console.log('✅ Products table columns:', columns.join(', '));
    console.log('   Has cost_price?', columns.includes('cost_price') ? 'YES ✅' : 'NO ❌');
  }

  // Check if RPC functions exist
  try {
    const { data, error } = await supabase.rpc('get_indicators', {
      p_store_id: 'a28836f6-9487-4b67-9194-e907eaf94b69',
      p_period_label: '30d'
    });

    if (error) {
      console.log('❌ get_indicators RPC:', error.message);
    } else {
      console.log('✅ get_indicators RPC exists');
    }
  } catch (e) {
    console.log('❌ get_indicators RPC not found');
  }

  // Check indicators table
  const { data: indicators, error: indicatorsError } = await supabase
    .from('indicators')
    .select('count')
    .limit(1);

  if (indicatorsError) {
    console.log('❌ Indicators table:', indicatorsError.message);
  } else {
    console.log('✅ Indicators table exists');
  }
}

checkCurrentState();
