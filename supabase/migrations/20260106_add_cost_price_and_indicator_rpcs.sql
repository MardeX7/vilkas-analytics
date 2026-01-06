-- =====================================================
-- VILKAS ANALYTICS - INDICATOR ENGINE
-- Migration: Add cost_price and RPC functions
-- Date: 2026-01-06
-- =====================================================

-- =====================================================
-- 1. ADD COST_PRICE TO PRODUCTS
-- =====================================================
-- Vilkas/ePages field: Inköpspris [GBasePurchasePrice]

ALTER TABLE products
ADD COLUMN IF NOT EXISTS cost_price DECIMAL(10,2);

ALTER TABLE products
ADD COLUMN IF NOT EXISTS cost_currency TEXT DEFAULT 'EUR';

COMMENT ON COLUMN products.cost_price IS 'Purchase price (Inköpspris/GBasePurchasePrice) for gross margin calculation';

-- =====================================================
-- 2. GET INDICATORS RPC
-- =====================================================
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
  -- Find shop by store_id
  SELECT id INTO v_shop_id
  FROM shops
  WHERE store_id = p_store_id::text;

  IF v_shop_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Return latest indicators for this shop and period
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
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
        )
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END,
          indicator_id
      )
      FROM indicators
      WHERE shop_id = v_shop_id
      AND period_label = p_period_label
      AND period_end = (
        SELECT MAX(period_end)
        FROM indicators
        WHERE shop_id = v_shop_id
        AND period_label = p_period_label
      )
    ),
    '[]'::jsonb
  );
END;
$$;

-- =====================================================
-- 3. UPSERT INDICATOR RPC
-- =====================================================
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
  -- Find shop by store_id
  SELECT id INTO v_shop_id
  FROM shops
  WHERE store_id = p_store_id::text;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Shop not found for store_id: %', p_store_id;
  END IF;

  -- Upsert indicator
  INSERT INTO indicators (
    shop_id,
    indicator_id,
    indicator_category,
    period_start,
    period_end,
    period_label,
    value,
    numeric_value,
    direction,
    change_percent,
    priority,
    confidence,
    alert_triggered,
    calculated_at
  ) VALUES (
    v_shop_id,
    p_indicator_id,
    p_indicator_category,
    p_period_start,
    p_period_end,
    p_period_label,
    p_value,
    p_numeric_value,
    p_direction,
    p_change_percent,
    p_priority,
    p_confidence,
    p_alert_triggered,
    NOW()
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

  -- Also insert into history for trending
  INSERT INTO indicator_history (
    shop_id,
    indicator_id,
    date,
    value,
    direction
  ) VALUES (
    v_shop_id,
    p_indicator_id,
    p_period_end,
    p_numeric_value,
    p_direction
  )
  ON CONFLICT (shop_id, indicator_id, date)
  DO UPDATE SET
    value = EXCLUDED.value,
    direction = EXCLUDED.direction;

  RETURN v_indicator_uuid;
END;
$$;

-- =====================================================
-- 4. GET INDICATOR HISTORY RPC
-- =====================================================
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
        jsonb_build_object(
          'date', date,
          'value', value,
          'direction', direction
        )
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

-- =====================================================
-- 5. GET ALERTS RPC
-- =====================================================
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
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'warning' THEN 2
            ELSE 3
          END,
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

-- =====================================================
-- DONE
-- =====================================================
