-- ============================================
-- FIX: Bundle products double-counted in inventory value
-- VilkasAnalytics (tlothekaphtiwvusgwzh)
-- ============================================
--
-- Bundle products ("paketti"/"paket") have no stock of their own: ePages derives
-- their level from the component products attached to them. Counting both the
-- components and the bundle counts the same goods twice.
--
-- Measured 2026-08-14: bundles were 58% of Automaalit's reported inventory value
-- (39 320 / 68 023 EUR) and 52% of Billackering's (324 411 / 624 300 SEK). They
-- also drove 83% of the +99% single-day jump on 2026-05-11 and 81% of the
-- -42.9% decline over the 30 days to 2026-08-13, because a component delivery
-- lifts every dependent bundle's inherited level at once.
--
-- Snapshot ROWS ARE LEFT UNTOUCHED. Only the aggregation changes, so the history
-- becomes correct retroactively and this migration is reversible by restoring
-- the previous function body.

CREATE OR REPLACE FUNCTION get_inventory_history_aggregated(
  p_store_id UUID,
  p_days_back INT DEFAULT 365
)
RETURNS TABLE (
  snapshot_date DATE,
  total_value NUMERIC,
  product_count BIGINT,
  bundle_value NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.snapshot_date,
    -- Stock held as components only. GREATEST guards the 745 legacy rows written
    -- before the snapshot function started clamping negative levels.
    SUM(GREATEST(s.stock_value, 0)) FILTER (WHERE p.name !~* '(paket|bundle)')::NUMERIC AS total_value,
    COUNT(*) FILTER (WHERE p.name !~* '(paket|bundle)' AND s.stock_level > 0)::BIGINT AS product_count,
    -- Reported separately so the UI can show what was excluded rather than
    -- silently dropping half the number.
    COALESCE(SUM(GREATEST(s.stock_value, 0)) FILTER (WHERE p.name ~* '(paket|bundle)'), 0)::NUMERIC AS bundle_value
  FROM inventory_snapshots s
  JOIN products p ON p.id = s.product_id
  WHERE s.store_id = p_store_id
    AND s.snapshot_date >= CURRENT_DATE - p_days_back
  GROUP BY s.snapshot_date
  ORDER BY s.snapshot_date ASC;
END;
$$;

COMMENT ON FUNCTION get_inventory_history_aggregated IS
'Daily inventory value totals, excluding bundle products whose stock level is inherited from their components (would double count). bundle_value reports the excluded amount.';
