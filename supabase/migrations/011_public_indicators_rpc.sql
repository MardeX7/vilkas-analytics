-- =====================================================
-- Public Indicators RPC (no auth check)
-- For development/demo purposes - kovakoodattu store
-- =====================================================

-- Public get_indicators - no auth check, returns indicators
CREATE OR REPLACE FUNCTION get_indicators_public(
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

  -- Return latest indicators for this shop and period (NO AUTH CHECK)
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

-- Public get_indicator_history - no auth check
CREATE OR REPLACE FUNCTION get_indicator_history_public(
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

-- Public get_active_alerts - no auth check
CREATE OR REPLACE FUNCTION get_active_alerts_public(
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

COMMENT ON FUNCTION get_indicators_public IS 'Public version - no auth check (development)';
COMMENT ON FUNCTION get_indicator_history_public IS 'Public version - no auth check (development)';
COMMENT ON FUNCTION get_active_alerts_public IS 'Public version - no auth check (development)';
