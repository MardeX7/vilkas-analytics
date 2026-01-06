/**
 * Check VilkasAnalytics Database Tables
 *
 * Verifies which tables exist in the correct database (tlothekaphtiwvusgwzh)
 */

const { createClient } = require('@supabase/supabase-js')

// VilkasAnalytics Supabase (CORRECT DATABASE!)
const SUPABASE_URL = 'https://tlothekaphtiwvusgwzh.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function checkTables() {
  console.log('🟩 VilkasAnalytics Database Check')
  console.log('=================================')
  console.log('URL: tlothekaphtiwvusgwzh.supabase.co')
  console.log('')

  // Tables we expect to exist
  const expectedTables = [
    // Core tables (from initial schema)
    'orders',
    'products',
    'order_line_items',

    // GSC tables
    'gsc_tokens',
    'gsc_search_analytics',

    // Indicator Engine tables (need migration)
    'shops',
    'indicators',
    'indicator_history',
    'alerts'
  ]

  console.log('📊 Checking tables:\n')

  for (const table of expectedTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1)

      if (error) {
        if (error.message.includes('not found')) {
          console.log(`   ❌ ${table}: NOT FOUND (needs migration)`)
        } else {
          console.log(`   ⚠️ ${table}: ${error.message}`)
        }
      } else {
        console.log(`   ✅ ${table}: exists (${data.length} sample rows)`)
      }
    } catch (err) {
      console.log(`   ❌ ${table}: ${err.message}`)
    }
  }

  // Check RPC functions
  console.log('\n📋 Checking RPC functions:\n')

  const rpcs = ['get_indicators', 'upsert_indicator', 'get_indicator_history', 'get_active_alerts']

  for (const rpc of rpcs) {
    try {
      // Try to call with dummy params to see if function exists
      const { error } = await supabase.rpc(rpc, {
        p_store_id: '00000000-0000-0000-0000-000000000000',
        p_period_label: '30d'
      })

      if (error) {
        if (error.message.includes('not find the function')) {
          console.log(`   ❌ ${rpc}: NOT FOUND (needs migration)`)
        } else {
          // Function exists but params might be wrong
          console.log(`   ✅ ${rpc}: exists`)
        }
      } else {
        console.log(`   ✅ ${rpc}: exists`)
      }
    } catch (err) {
      console.log(`   ❌ ${rpc}: ${err.message}`)
    }
  }

  console.log('\n✨ Check complete!')
}

checkTables().catch(console.error)
