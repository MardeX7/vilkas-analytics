-- =====================================================
-- VILKAS ANALYTICS - SECURITY FIXES
-- Migration 006: Fix security vulnerabilities
-- Date: 2026-01-06
-- Based on: TIETOTURVARAPORTTI_2025-12-18
-- =====================================================

-- =====================================================
-- K3 (CRITICAL): Enable RLS on products table
-- =====================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view products from shops they have access to
CREATE POLICY "products_select_policy" ON products
FOR SELECT
USING (
  store_id IN (
    SELECT s.store_id::uuid
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- Policy: Only admins can insert/update/delete products
CREATE POLICY "products_admin_modify_policy" ON products
FOR ALL
USING (
  store_id IN (
    SELECT s.store_id::uuid
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
    AND sm.role = 'admin'
  )
);

-- =====================================================
-- K1 (CRITICAL): Enable RLS on indicator_history table
-- =====================================================
ALTER TABLE indicator_history ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view indicator history from shops they have access to
CREATE POLICY "indicator_history_select_policy" ON indicator_history
FOR SELECT
USING (
  shop_id IN (
    SELECT s.id
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- Policy: Only system (SECURITY DEFINER functions) can modify
-- No user-facing INSERT/UPDATE/DELETE policies needed

-- =====================================================
-- K2 (CRITICAL): Enable RLS on alerts table
-- =====================================================
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view alerts from shops they have access to
CREATE POLICY "alerts_select_policy" ON alerts
FOR SELECT
USING (
  shop_id IN (
    SELECT s.id
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- Policy: Users can acknowledge their own shop's alerts
CREATE POLICY "alerts_update_policy" ON alerts
FOR UPDATE
USING (
  shop_id IN (
    SELECT s.id
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- =====================================================
-- K1 (CRITICAL): Enable RLS on indicators table
-- =====================================================
ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view indicators from shops they have access to
CREATE POLICY "indicators_select_policy" ON indicators
FOR SELECT
USING (
  shop_id IN (
    SELECT s.id
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- =====================================================
-- Enable RLS on shops table (for user access control)
-- =====================================================
ALTER TABLE shops ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view shops they have access to
CREATE POLICY "shops_select_policy" ON shops
FOR SELECT
USING (
  id IN (
    SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
  )
);

-- Policy: Only admins can update shop settings
CREATE POLICY "shops_admin_update_policy" ON shops
FOR UPDATE
USING (
  id IN (
    SELECT shop_id FROM shop_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- =====================================================
-- H1-H4 (HIGH): Fix RPC functions to validate auth.uid()
-- =====================================================

-- H1: get_indicators - Add auth validation
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

  -- SECURITY FIX: Validate user has access to this shop
  IF NOT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = v_shop_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User does not have access to this shop';
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

-- H2: upsert_indicator - Add auth validation (admin only)
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
    RAISE EXCEPTION 'Shop not found';
  END IF;

  -- SECURITY FIX: Validate user is admin of this shop
  IF NOT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = v_shop_id
    AND user_id = auth.uid()
    AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied: Admin privileges required';
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

-- H3: get_indicator_history - Add auth validation
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

  -- SECURITY FIX: Validate user has access to this shop
  IF NOT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = v_shop_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User does not have access to this shop';
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

-- H4: get_active_alerts - Add auth validation
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

  -- SECURITY FIX: Validate user has access to this shop
  IF NOT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = v_shop_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User does not have access to this shop';
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
-- H5: acknowledge_alert - New function with auth
-- =====================================================
CREATE OR REPLACE FUNCTION acknowledge_alert(
  p_alert_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_shop_id UUID;
BEGIN
  -- Get the shop_id of the alert
  SELECT shop_id INTO v_shop_id
  FROM alerts
  WHERE id = p_alert_id;

  IF v_shop_id IS NULL THEN
    RAISE EXCEPTION 'Alert not found';
  END IF;

  -- Validate user has access to this shop
  IF NOT EXISTS (
    SELECT 1 FROM shop_members
    WHERE shop_id = v_shop_id
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied: User does not have access to this alert';
  END IF;

  -- Update the alert
  UPDATE alerts
  SET acknowledged = true,
      acknowledged_at = NOW()
  WHERE id = p_alert_id;

  RETURN true;
END;
$$;

-- =====================================================
-- M3 (MEDIUM): Fix invitation token expiration check
-- Note: accept_invitation already exists with RETURNS BOOLEAN
-- The original function in 005_auth_system.sql already has
-- expires_at > NOW() check, so this is already fixed.
-- =====================================================
-- No changes needed - original function already checks expiration

-- =====================================================
-- Enable RLS on additional tables
-- =====================================================

-- Enable RLS on orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_policy" ON orders
FOR SELECT
USING (
  store_id IN (
    SELECT s.store_id::uuid
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- Enable RLS on customers table
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select_policy" ON customers
FOR SELECT
USING (
  store_id IN (
    SELECT s.store_id::uuid
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- Enable RLS on order_line_items table
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_line_items_select_policy" ON order_line_items
FOR SELECT
USING (
  order_id IN (
    SELECT o.id FROM orders o
    WHERE o.store_id IN (
      SELECT s.store_id::uuid
      FROM shops s
      INNER JOIN shop_members sm ON sm.shop_id = s.id
      WHERE sm.user_id = auth.uid()
    )
  )
);

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON FUNCTION get_indicators IS 'Get indicators for a shop - validates user access';
COMMENT ON FUNCTION upsert_indicator IS 'Insert/update indicator - requires admin role';
COMMENT ON FUNCTION get_indicator_history IS 'Get indicator history - validates user access';
COMMENT ON FUNCTION get_active_alerts IS 'Get active alerts - validates user access';
COMMENT ON FUNCTION acknowledge_alert IS 'Acknowledge an alert - validates user access';
COMMENT ON FUNCTION accept_invitation IS 'Accept invitation - checks token expiration';

-- =====================================================
-- DONE
-- =====================================================
