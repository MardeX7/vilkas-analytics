/**
 * Test RPC Functions
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = 'https://tlothekaphtiwvusgwzh.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function test() {
  console.log('🧪 Testing RPC Functions\n')

  // First get a valid store_id from shops table
  const { data: shops } = await supabase.from('shops').select('id, store_id').limit(1)

  if (!shops || shops.length === 0) {
    console.log('❌ No shops found in database')
    return
  }

  const storeId = shops[0].store_id
  console.log(`Using store_id: ${storeId}\n`)

  // Test get_indicators
  console.log('1. get_indicators:')
  const { data: indicators, error: indError } = await supabase.rpc('get_indicators', {
    p_store_id: storeId,
    p_period_label: '30d'
  })
  if (indError) {
    console.log(`   ❌ ${indError.message}`)
  } else {
    console.log(`   ✅ Returns: ${Array.isArray(indicators) ? indicators.length + ' indicators' : typeof indicators}`)
  }

  // Test get_indicator_history
  console.log('2. get_indicator_history:')
  const { data: history, error: histError } = await supabase.rpc('get_indicator_history', {
    p_store_id: storeId,
    p_indicator_id: 'sales_trend',
    p_days: 30
  })
  if (histError) {
    console.log(`   ❌ ${histError.message}`)
  } else {
    console.log(`   ✅ Returns: ${Array.isArray(history) ? history.length + ' entries' : typeof history}`)
  }

  // Test get_active_alerts
  console.log('3. get_active_alerts:')
  const { data: alerts, error: alertError } = await supabase.rpc('get_active_alerts', {
    p_store_id: storeId
  })
  if (alertError) {
    console.log(`   ❌ ${alertError.message}`)
  } else {
    console.log(`   ✅ Returns: ${Array.isArray(alerts) ? alerts.length + ' alerts' : typeof alerts}`)
  }

  // Test upsert_indicator (with test data)
  console.log('4. upsert_indicator:')
  const { data: upserted, error: upsertError } = await supabase.rpc('upsert_indicator', {
    p_store_id: storeId,
    p_indicator_id: 'test_indicator',
    p_indicator_category: 'test',
    p_period_start: '2026-01-01',
    p_period_end: '2026-01-06',
    p_period_label: '7d',
    p_value: { test: true },
    p_numeric_value: 123.45,
    p_direction: 'up',
    p_change_percent: 5.5,
    p_priority: 'low',
    p_confidence: 'high',
    p_alert_triggered: false
  })
  if (upsertError) {
    console.log(`   ❌ ${upsertError.message}`)
  } else {
    console.log(`   ✅ Returns UUID: ${upserted}`)
  }

  console.log('\n✨ Test complete!')
}

test().catch(console.error)
