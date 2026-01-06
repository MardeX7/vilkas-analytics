/**
 * Run SQL via Supabase Management API
 * Requires: SUPABASE_ACCESS_TOKEN environment variable
 */
const https = require('https');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!supabaseUrl) {
  console.error('❌ Missing VITE_SUPABASE_URL');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/(.+)\.supabase\.co/)[1];
console.log('📦 Project ref:', projectRef);

// SQL to execute
const sqlStatements = `
-- Add cost_price column
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_currency TEXT DEFAULT 'EUR';
COMMENT ON COLUMN products.cost_price IS 'Purchase price (Inköpspris/GBasePurchasePrice) for gross margin calculation';

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

-- get_indicator_history RPC
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
  SELECT id INTO v_shop_id FROM shops WHERE store_id = p_store_id::text;
  IF v_shop_id IS NULL THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE(
    (SELECT jsonb_agg(jsonb_build_object('date', date, 'value', value, 'direction', direction) ORDER BY date ASC)
     FROM indicator_history WHERE shop_id = v_shop_id AND indicator_id = p_indicator_id AND date >= CURRENT_DATE - p_days),
    '[]'::jsonb
  );
END;
$$;

-- get_active_alerts RPC
CREATE OR REPLACE FUNCTION get_active_alerts(p_store_id UUID)
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
      jsonb_build_object('id', id, 'indicator_id', indicator_id, 'alert_type', alert_type, 'severity', severity, 'title', title, 'message', message, 'indicator_value', indicator_value, 'created_at', created_at)
      ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END, created_at DESC
     ) FROM alerts WHERE shop_id = v_shop_id AND acknowledged = false),
    '[]'::jsonb
  );
END;
$$;
`;

// Check if we have access token
if (!accessToken) {
  console.log('\n⚠️  No SUPABASE_ACCESS_TOKEN found.');
  console.log('\nPlease run this SQL manually in Supabase Dashboard > SQL Editor:');
  console.log('\n--- SQL TO RUN ---\n');
  console.log(sqlStatements);
  console.log('\n--- END SQL ---\n');
  console.log('\n💡 Or set SUPABASE_ACCESS_TOKEN in .env.local to run via Management API');
  process.exit(0);
}

async function runSQL(sql) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: sql });

    const options = {
      hostname: 'api.supabase.com',
      port: 443,
      path: `/v1/projects/${projectRef}/database/query`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve({ success: true, data: body });
        } else {
          resolve({ success: false, status: res.statusCode, body });
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('🚀 Running SQL via Management API...\n');

  const result = await runSQL(sqlStatements);

  if (result.success) {
    console.log('✅ SQL executed successfully!');
  } else {
    console.log('❌ Failed:', result.status, result.body);
  }
}

main();
