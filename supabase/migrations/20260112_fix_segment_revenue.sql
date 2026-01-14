-- ============================================================================
-- FIX: Customer Segment Summary should use line item total_price (like Dashboard)
-- instead of grand_total (which includes VAT and shipping)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_customer_segment_summary(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  segment TEXT,
  order_count BIGINT,
  total_revenue DECIMAL,
  avg_order_value DECIMAL,
  unique_customers BIGINT,
  revenue_share DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_revenue DECIMAL;
BEGIN
  -- Default dates if not provided
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  -- Calculate total revenue using line items (same as Dashboard)
  SELECT COALESCE(SUM(li.total_price), 0) INTO v_total_revenue
  FROM orders o
  JOIN order_line_items li ON li.order_id = o.id
  WHERE o.store_id = p_store_id
    AND o.creation_date::DATE >= p_start_date
    AND o.creation_date::DATE <= p_end_date;

  -- Return segment summary using line items
  RETURN QUERY
  SELECT
    CASE
      WHEN o.is_b2b = TRUE THEN 'B2B'
      WHEN o.is_b2b_soft = TRUE THEN 'B2B (soft)'
      ELSE 'B2C'
    END AS segment,
    COUNT(DISTINCT o.id)::BIGINT AS order_count,
    ROUND(COALESCE(SUM(li.total_price), 0)::DECIMAL, 2) AS total_revenue,
    ROUND(COALESCE(SUM(li.total_price) / NULLIF(COUNT(DISTINCT o.id), 0), 0)::DECIMAL, 2) AS avg_order_value,
    COUNT(DISTINCT o.customer_id)::BIGINT AS unique_customers,
    CASE
      WHEN v_total_revenue > 0 THEN
        ROUND((COALESCE(SUM(li.total_price), 0) / v_total_revenue * 100)::DECIMAL, 1)
      ELSE 0
    END AS revenue_share
  FROM orders o
  LEFT JOIN order_line_items li ON li.order_id = o.id
  WHERE o.store_id = p_store_id
    AND o.creation_date::DATE >= p_start_date
    AND o.creation_date::DATE <= p_end_date
  GROUP BY
    CASE
      WHEN o.is_b2b = TRUE THEN 'B2B'
      WHEN o.is_b2b_soft = TRUE THEN 'B2B (soft)'
      ELSE 'B2C'
    END
  ORDER BY segment;
END;
$$;

-- Also fix bucket distribution to use line items
CREATE OR REPLACE FUNCTION get_order_bucket_distribution(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  bucket TEXT,
  order_count BIGINT,
  total_revenue DECIMAL,
  avg_order_value DECIMAL,
  b2b_count BIGINT,
  b2c_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_config JSONB;
  v_low_threshold INT;
  v_high_threshold INT;
BEGIN
  -- Default dates if not provided
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  -- Get store config for bucket thresholds
  SELECT COALESCE(config, '{}'::JSONB) INTO v_config
  FROM stores
  WHERE id = p_store_id;

  -- Parse thresholds from JSON array: [low, high] e.g. [800, 1500]
  v_low_threshold := COALESCE((v_config->'order_buckets'->>0)::INT, 800);
  v_high_threshold := COALESCE((v_config->'order_buckets'->>1)::INT, 1500);

  -- Return bucket distribution using line items
  RETURN QUERY
  WITH order_totals AS (
    SELECT
      o.id,
      o.is_b2b,
      o.is_b2b_soft,
      COALESCE(SUM(li.total_price), 0) AS order_total
    FROM orders o
    LEFT JOIN order_line_items li ON li.order_id = o.id
    WHERE o.store_id = p_store_id
      AND o.creation_date::DATE >= p_start_date
      AND o.creation_date::DATE <= p_end_date
    GROUP BY o.id, o.is_b2b, o.is_b2b_soft
  )
  SELECT
    CASE
      WHEN ot.order_total < v_low_threshold THEN '0-' || v_low_threshold::TEXT
      WHEN ot.order_total < v_high_threshold THEN v_low_threshold::TEXT || '-' || v_high_threshold::TEXT
      ELSE v_high_threshold::TEXT || '+'
    END AS bucket,
    COUNT(*)::BIGINT AS order_count,
    ROUND(SUM(ot.order_total)::DECIMAL, 2) AS total_revenue,
    ROUND(AVG(ot.order_total)::DECIMAL, 2) AS avg_order_value,
    COUNT(*) FILTER (WHERE ot.is_b2b = TRUE OR ot.is_b2b_soft = TRUE)::BIGINT AS b2b_count,
    COUNT(*) FILTER (WHERE ot.is_b2b = FALSE AND (ot.is_b2b_soft = FALSE OR ot.is_b2b_soft IS NULL))::BIGINT AS b2c_count
  FROM order_totals ot
  GROUP BY
    CASE
      WHEN ot.order_total < v_low_threshold THEN '0-' || v_low_threshold::TEXT
      WHEN ot.order_total < v_high_threshold THEN v_low_threshold::TEXT || '-' || v_high_threshold::TEXT
      ELSE v_high_threshold::TEXT || '+'
    END
  ORDER BY
    MIN(CASE
      WHEN ot.order_total < v_low_threshold THEN 1
      WHEN ot.order_total < v_high_threshold THEN 2
      ELSE 3
    END);
END;
$$;

COMMENT ON FUNCTION get_customer_segment_summary IS 'Returns B2B/B2C segment summary using line item prices (consistent with Dashboard)';
COMMENT ON FUNCTION get_order_bucket_distribution IS 'Returns order bucket distribution using line item prices (consistent with Dashboard)';
