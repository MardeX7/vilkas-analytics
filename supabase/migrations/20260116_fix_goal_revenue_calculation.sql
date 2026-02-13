-- ============================================================================
-- Fix: Use orders.grand_total instead of order_line_items for revenue calculation
--
-- Problem: calculate_goal_progress was summing order_line_items.total_price
-- which only includes product prices, missing shipping, taxes, discounts etc.
--
-- Solution: Use orders.grand_total which is the actual order total
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_goal_progress(
  p_store_id UUID,
  p_goal_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_goal RECORD;
  v_current DECIMAL;
  v_progress DECIMAL;
  v_start_date DATE;
  v_end_date DATE;
  v_updated_count INT := 0;
BEGIN
  FOR v_goal IN
    SELECT * FROM merchant_goals
    WHERE store_id = p_store_id
      AND is_active = TRUE
      AND (p_goal_id IS NULL OR id = p_goal_id)
  LOOP
    -- Calculate date range from period_label
    IF v_goal.period_type = 'monthly' THEN
      -- period_label format: '2026-01'
      v_start_date := (v_goal.period_label || '-01')::DATE;
      v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSIF v_goal.period_type = 'quarterly' THEN
      -- period_label format: '2026-Q1'
      v_start_date := CASE
        WHEN v_goal.period_label LIKE '%-Q1' THEN (LEFT(v_goal.period_label, 4) || '-01-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q2' THEN (LEFT(v_goal.period_label, 4) || '-04-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q3' THEN (LEFT(v_goal.period_label, 4) || '-07-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q4' THEN (LEFT(v_goal.period_label, 4) || '-10-01')::DATE
      END;
      v_end_date := (v_start_date + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
    ELSIF v_goal.period_type = 'yearly' THEN
      -- period_label format: '2026'
      v_start_date := (v_goal.period_label || '-01-01')::DATE;
      v_end_date := (v_goal.period_label || '-12-31')::DATE;
    END IF;

    -- Calculate current value based on goal_type
    IF v_goal.goal_type = 'revenue' THEN
      -- FIX: Use grand_total (includes shipping, taxes, discounts) instead of line_items
      SELECT COALESCE(SUM(o.grand_total), 0) INTO v_current
      FROM orders o
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date
        AND o.status NOT IN ('cancelled');

    ELSIF v_goal.goal_type = 'orders' THEN
      SELECT COUNT(*)::DECIMAL INTO v_current
      FROM orders o
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date
        AND o.status NOT IN ('cancelled');

    ELSIF v_goal.goal_type = 'aov' THEN
      -- FIX: Use grand_total for AOV calculation too
      SELECT COALESCE(AVG(o.grand_total), 0) INTO v_current
      FROM orders o
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date
        AND o.status NOT IN ('cancelled');

    ELSIF v_goal.goal_type = 'margin' THEN
      -- Margin still needs line_items for cost calculation
      SELECT COALESCE(
        (SUM(li.total_price) - SUM(COALESCE(p.cost_price, 0) * li.quantity)) / NULLIF(SUM(li.total_price), 0) * 100,
        0
      ) INTO v_current
      FROM orders o
      JOIN order_line_items li ON li.order_id = o.id
      LEFT JOIN products p ON p.store_id = o.store_id AND p.sku = li.product_sku
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date
        AND o.status NOT IN ('cancelled');

    -- conversion would need GA4 data, skip for now
    ELSE
      v_current := 0;
    END IF;

    -- Calculate progress percent
    IF v_goal.target_value > 0 THEN
      v_progress := LEAST((v_current / v_goal.target_value) * 100, 999); -- Cap at 999%
    ELSE
      v_progress := 0;
    END IF;

    -- Update goal
    UPDATE merchant_goals
    SET current_value = ROUND(v_current, 2),
        progress_percent = ROUND(v_progress, 1),
        last_calculated_at = NOW(),
        updated_at = NOW()
    WHERE id = v_goal.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION calculate_goal_progress TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_goal_progress TO service_role;
