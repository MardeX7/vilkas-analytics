/**
 * Create Missing RPC Functions
 *
 * Uses Supabase Management API to create missing RPC functions
 */

const { createClient } = require('@supabase/supabase-js')

// VilkasAnalytics Supabase (CORRECT DATABASE!)
const SUPABASE_URL = 'https://tlothekaphtiwvusgwzh.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsb3RoZWthcGh0aXd2dXNnd3poIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzYxOTYwMCwiZXhwIjoyMDgzMTk1NjAwfQ.PxMeALq2SEylsXwybYAASYcxjtVBzjjiWFsiOulhQyY'

async function createRPCs() {
  console.log('🟩 Creating Missing RPC Functions')
  console.log('==================================')
  console.log('Target: tlothekaphtiwvusgwzh.supabase.co')
  console.log('')

  // SQL statements to create missing functions
  const sqlStatements = [
    // upsert_indicator
    `
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
  SELECT id INTO v_shop_id
  FROM shops
  WHERE store_id = p_store_id::text;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Shop not found for store_id: %', p_store_id;
  END IF;

  INSERT INTO indicators (
    shop_id, indicator_id, indicator_category,
    period_start, period_end, period_label,
    value, numeric_value, direction, change_percent,
    priority, confidence, alert_triggered, calculated_at
  ) VALUES (
    v_shop_id, p_indicator_id, p_indicator_category,
    p_period_start, p_period_end, p_period_label,
    p_value, p_numeric_value, p_direction, p_change_percent,
    p_priority, p_confidence, p_alert_triggered, NOW()
  )
  ON CONFLICT (shop_id, indicator_id, period_label, period_end)
  DO UPDATE SET
    value = EXCLUDED.value,
    numeric_value = EXCLUDED.numeric_value,
    direction = EXCLUDED.direction,
    change_percent = EXCLUDED.change_percent,
    priority = EXCLUDED.priority,
    confidence = EXCLUDED.confidence,
    alert_triggered = EXCLUDED.alert_triggered,
    calculated_at = NOW()
  RETURNING id INTO v_indicator_uuid;

  INSERT INTO indicator_history (shop_id, indicator_id, date, value, direction)
  VALUES (v_shop_id, p_indicator_id, p_period_end, p_numeric_value, p_direction)
  ON CONFLICT (shop_id, indicator_id, date)
  DO UPDATE SET value = EXCLUDED.value, direction = EXCLUDED.direction;

  RETURN v_indicator_uuid;
END;
$$;
    `,

    // get_indicator_history
    `
CREATE OR REPLACE FUNCTION get_indicator_history(
  p_store_id UUID,
  p_indicator_id TEXT,
  p_days INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
BEGIN
  SELECT id INTO v_shop_id
  FROM shops
  WHERE store_id = p_store_id::text;

  IF v_shop_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object('date', date, 'value', value, 'direction', direction)
        ORDER BY date ASC
      )
      FROM indicator_history
      WHERE shop_id = v_shop_id
      AND indicator_id = p_indicator_id
      AND date >= CURRENT_DATE - p_days
    ),
    '[]'::jsonb
  );
END;
$$;
    `,

    // get_active_alerts
    `
CREATE OR REPLACE FUNCTION get_active_alerts(
  p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
BEGIN
  SELECT id INTO v_shop_id
  FROM shops
  WHERE store_id = p_store_id::text;

  IF v_shop_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'indicator_id', indicator_id,
          'alert_type', alert_type,
          'severity', severity,
          'title', title,
          'message', message,
          'indicator_value', indicator_value,
          'created_at', created_at
        )
        ORDER BY
          CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
          created_at DESC
      )
      FROM alerts
      WHERE shop_id = v_shop_id
      AND acknowledged = false
    ),
    '[]'::jsonb
  );
END;
$$;
    `
  ]

  console.log('SQL statements to run in Supabase Dashboard:')
  console.log('============================================\n')

  for (let i = 0; i < sqlStatements.length; i++) {
    console.log(`-- Statement ${i + 1}:`)
    console.log(sqlStatements[i])
    console.log('\n')
  }

  console.log('\n📋 Instructions:')
  console.log('1. Go to: https://supabase.com/dashboard/project/tlothekaphtiwvusgwzh/sql')
  console.log('2. Copy each SQL statement above')
  console.log('3. Run them one by one in the SQL Editor')
  console.log('')
}

createRPCs()
