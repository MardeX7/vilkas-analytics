-- Fix: get_order_bucket_distribution JSON array parsing
-- The original used ::INT[] which doesn't work with JSON arrays

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
  v_low_threshold INT;
  v_high_threshold INT;
  v_config JSONB;
BEGIN
  -- Get bucket configuration from store
  SELECT config INTO v_config
  FROM stores
  WHERE id = p_store_id;

  -- Parse JSON array to get bucket thresholds
  v_low_threshold := COALESCE((v_config->'order_buckets'->>0)::INT, 500);
  v_high_threshold := COALESCE((v_config->'order_buckets'->>1)::INT, 1000);

  -- Default dates if not provided
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  -- Return bucket distribution
  RETURN QUERY
  WITH order_buckets AS (
    SELECT
      o.id,
      o.grand_total,
      o.is_b2b,
      o.is_b2b_soft,
      CASE
        WHEN o.grand_total < v_low_threshold THEN
          '0-' || v_low_threshold::TEXT
        WHEN o.grand_total < v_high_threshold THEN
          v_low_threshold::TEXT || '-' || v_high_threshold::TEXT
        ELSE
          v_high_threshold::TEXT || '+'
      END AS bucket_name,
      CASE
        WHEN o.grand_total < v_low_threshold THEN 1
        WHEN o.grand_total < v_high_threshold THEN 2
        ELSE 3
      END AS bucket_order
    FROM orders o
    WHERE o.store_id = p_store_id
      AND o.creation_date::DATE >= p_start_date
      AND o.creation_date::DATE <= p_end_date
  )
  SELECT
    ob.bucket_name AS bucket,
    COUNT(*)::BIGINT AS order_count,
    ROUND(SUM(ob.grand_total)::DECIMAL, 2) AS total_revenue,
    ROUND(AVG(ob.grand_total)::DECIMAL, 2) AS avg_order_value,
    COUNT(*) FILTER (WHERE ob.is_b2b = TRUE OR ob.is_b2b_soft = TRUE)::BIGINT AS b2b_count,
    COUNT(*) FILTER (WHERE ob.is_b2b = FALSE AND ob.is_b2b_soft = FALSE)::BIGINT AS b2c_count
  FROM order_buckets ob
  GROUP BY ob.bucket_name, ob.bucket_order
  ORDER BY ob.bucket_order;
END;
$$;
