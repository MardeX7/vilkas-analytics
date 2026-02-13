-- RPC function to get aggregated inventory history by date
-- This avoids the 1000 row limit issue by aggregating in the database

CREATE OR REPLACE FUNCTION get_inventory_history_aggregated(
  p_store_id UUID,
  p_days_back INT DEFAULT 365
)
RETURNS TABLE (
  snapshot_date DATE,
  total_value NUMERIC,
  product_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.snapshot_date,
    SUM(s.stock_value)::NUMERIC as total_value,
    COUNT(*)::BIGINT as product_count
  FROM inventory_snapshots s
  WHERE s.store_id = p_store_id
    AND s.snapshot_date >= CURRENT_DATE - p_days_back
  GROUP BY s.snapshot_date
  ORDER BY s.snapshot_date ASC;
END;
$$;

COMMENT ON FUNCTION get_inventory_history_aggregated IS 'Returns daily inventory value totals, avoiding row limits';
