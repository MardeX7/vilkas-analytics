-- ============================================================================
-- ADD MARGIN: Customer Segment Summary with gross margin calculation
-- ============================================================================

-- Drop existing function first because return type is changing
DROP FUNCTION IF EXISTS get_customer_segment_summary(UUID, DATE, DATE);

CREATE OR REPLACE FUNCTION get_customer_segment_summary(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  segment TEXT,
  order_count BIGINT,
  total_revenue DECIMAL,
  total_cost DECIMAL,
  gross_margin DECIMAL,
  margin_percent DECIMAL,
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

  -- Return segment summary using line items with margin
  RETURN QUERY
  SELECT
    CASE
      WHEN o.is_b2b = TRUE THEN 'B2B'
      WHEN o.is_b2b_soft = TRUE THEN 'B2B (soft)'
      ELSE 'B2C'
    END AS segment,
    COUNT(DISTINCT o.id)::BIGINT AS order_count,
    ROUND(COALESCE(SUM(li.total_price), 0)::DECIMAL, 2) AS total_revenue,
    ROUND(COALESCE(SUM(
      CASE
        WHEN p.cost_price IS NOT NULL AND p.cost_price > 0
        THEN li.quantity * p.cost_price
        ELSE li.total_price * 0.6  -- Fallback: assume 40% margin if no cost_price
      END
    ), 0)::DECIMAL, 2) AS total_cost,
    ROUND(COALESCE(
      SUM(li.total_price) - SUM(
        CASE
          WHEN p.cost_price IS NOT NULL AND p.cost_price > 0
          THEN li.quantity * p.cost_price
          ELSE li.total_price * 0.6
        END
      )
    , 0)::DECIMAL, 2) AS gross_margin,
    CASE
      WHEN COALESCE(SUM(li.total_price), 0) > 0 THEN
        ROUND((
          (COALESCE(SUM(li.total_price), 0) - COALESCE(SUM(
            CASE
              WHEN p.cost_price IS NOT NULL AND p.cost_price > 0
              THEN li.quantity * p.cost_price
              ELSE li.total_price * 0.6
            END
          ), 0)) / SUM(li.total_price) * 100
        )::DECIMAL, 1)
      ELSE 0
    END AS margin_percent,
    ROUND(COALESCE(SUM(li.total_price) / NULLIF(COUNT(DISTINCT o.id), 0), 0)::DECIMAL, 2) AS avg_order_value,
    COUNT(DISTINCT o.customer_id)::BIGINT AS unique_customers,
    CASE
      WHEN v_total_revenue > 0 THEN
        ROUND((COALESCE(SUM(li.total_price), 0) / v_total_revenue * 100)::DECIMAL, 1)
      ELSE 0
    END AS revenue_share
  FROM orders o
  LEFT JOIN order_line_items li ON li.order_id = o.id
  LEFT JOIN products p ON p.product_number = li.product_number AND p.store_id = o.store_id
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

COMMENT ON FUNCTION get_customer_segment_summary IS 'Returns B2B/B2C segment summary with margin calculation (consistent with Dashboard)';
