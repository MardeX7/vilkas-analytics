/**
 * Apply ONLY migration 004 (cost_price and RPC functions)
 * Uses direct SQL via node-postgres
 */
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🔧 Applying Migration 004 via Supabase JS                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Step 1: Check if cost_price exists already
  console.log('1️⃣  Checking products table structure...');
  const { data: products } = await supabase.from('products').select('*').limit(1);

  if (products && products.length > 0 && 'cost_price' in products[0]) {
    console.log('   ✅ cost_price column already exists');
  } else {
    console.log('   ❌ cost_price column NOT found - needs to be added via SQL Editor');
    console.log('\n   📋 Please run this in Supabase Dashboard > SQL Editor:');
    console.log('   ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);');
    console.log('   ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_currency TEXT DEFAULT \'EUR\';');
  }

  // Step 2: Test RPC functions
  console.log('\n2️⃣  Testing RPC functions...');

  // Test get_indicators
  try {
    const { data, error } = await supabase.rpc('get_indicators', {
      p_store_id: 'a28836f6-9487-4b67-9194-e907eaf94b69',
      p_period_label: '30d'
    });
    if (error) throw error;
    console.log('   ✅ get_indicators works');
  } catch (e) {
    console.log('   ❌ get_indicators:', e.message);
    console.log('\n   📋 RPC function needs to be created via SQL Editor');
  }

  // Test upsert_indicator
  try {
    const { data, error } = await supabase.rpc('upsert_indicator', {
      p_store_id: 'a28836f6-9487-4b67-9194-e907eaf94b69',
      p_indicator_id: 'test_indicator',
      p_indicator_category: 'test',
      p_period_start: '2026-01-01',
      p_period_end: '2026-01-06',
      p_period_label: '7d',
      p_value: { test: true },
      p_numeric_value: 100
    });
    if (error) throw error;
    console.log('   ✅ upsert_indicator works');

    // Clean up test data
    await supabase.from('indicators').delete().eq('indicator_id', 'test_indicator');
    await supabase.from('indicator_history').delete().eq('indicator_id', 'test_indicator');
    console.log('   🧹 Cleaned up test data');
  } catch (e) {
    console.log('   ❌ upsert_indicator:', e.message);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('\n📋 If any functions are missing, run this SQL in Dashboard:\n');

  console.log(`
-- Add cost_price column
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_currency TEXT DEFAULT 'EUR';

-- get_indicators RPC
CREATE OR REPLACE FUNCTION get_indicators(
  p_store_id UUID,
  p_period_label TEXT DEFAULT '30d'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
BEGIN
  SELECT id INTO v_shop_id FROM shops WHERE store_id = p_store_id::text;
  IF v_shop_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'indicator_id', indicator_id,
        'category', indicator_category,
        'period_label', period_label,
        'period_start', period_start,
        'period_end', period_end,
        'value', value,
        'numeric_value', numeric_value,
        'direction', direction,
        'change_percent', change_percent,
        'priority', priority,
        'confidence', confidence,
        'alert_triggered', alert_triggered,
        'calculated_at', calculated_at
      ) ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, indicator_id
    ) FROM indicators
    WHERE shop_id = v_shop_id
    AND period_label = p_period_label
    AND period_end = (SELECT MAX(period_end) FROM indicators WHERE shop_id = v_shop_id AND period_label = p_period_label)),
    '[]'::jsonb
  );
END;
$$;

-- upsert_indicator RPC
CREATE OR REPLACE FUNCTION upsert_indicator(
  p_store_id UUID,
  p_indicator_id TEXT,
  p_indicator_category TEXT,
  p_period_start DATE,
  p_period_end DATE,
  p_period_label TEXT,
  p_value JSONB,
  p_numeric_value DECIMAL DEFAULT NULL,
  p_direction TEXT DEFAULT NULL,
  p_change_percent DECIMAL DEFAULT NULL,
  p_priority TEXT DEFAULT 'medium',
  p_confidence TEXT DEFAULT 'high',
  p_alert_triggered BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
  v_indicator_uuid UUID;
BEGIN
  SELECT id INTO v_shop_id FROM shops WHERE store_id = p_store_id::text;
  IF v_shop_id IS NULL THEN RAISE EXCEPTION 'Shop not found for store_id: %', p_store_id; END IF;
  INSERT INTO indicators (shop_id, indicator_id, indicator_category, period_start, period_end, period_label, value, numeric_value, direction, change_percent, priority, confidence, alert_triggered, calculated_at)
  VALUES (v_shop_id, p_indicator_id, p_indicator_category, p_period_start, p_period_end, p_period_label, p_value, p_numeric_value, p_direction, p_change_percent, p_priority, p_confidence, p_alert_triggered, NOW())
  ON CONFLICT (shop_id, indicator_id, period_label, period_end)
  DO UPDATE SET value = EXCLUDED.value, numeric_value = EXCLUDED.numeric_value, direction = EXCLUDED.direction, change_percent = EXCLUDED.change_percent, priority = EXCLUDED.priority, confidence = EXCLUDED.confidence, alert_triggered = EXCLUDED.alert_triggered, calculated_at = NOW()
  RETURNING id INTO v_indicator_uuid;
  INSERT INTO indicator_history (shop_id, indicator_id, date, value, direction)
  VALUES (v_shop_id, p_indicator_id, p_period_end, p_numeric_value, p_direction)
  ON CONFLICT (shop_id, indicator_id, date) DO UPDATE SET value = EXCLUDED.value, direction = EXCLUDED.direction;
  RETURN v_indicator_uuid;
END;
$$;
`);
}

main();
