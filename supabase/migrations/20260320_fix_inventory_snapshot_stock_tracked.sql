-- ============================================
-- FIX: Inventory Snapshots - luo taulu + korjaa funktiot
-- VilkasAnalytics (tlothekaphtiwvusgwzh)
-- ============================================

-- 1. Luo taulu (jos puuttuu)
CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    stock_level INTEGER NOT NULL DEFAULT 0,
    stock_value DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(store_id, product_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_store_date
ON inventory_snapshots(store_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_product
ON inventory_snapshots(product_id, snapshot_date DESC);

-- 2. Snapshot-funktio (korjattu)
CREATE OR REPLACE FUNCTION create_daily_inventory_snapshot(
    p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
    v_snapshot_date DATE;
BEGIN
    -- Cron ajaa aamulla klo 06:00 UTC → data kuvaa eilisen tilannetta
    v_snapshot_date := (CURRENT_DATE - INTERVAL '1 day')::DATE;

    INSERT INTO inventory_snapshots (store_id, product_id, snapshot_date, stock_level, stock_value)
    SELECT
        p.store_id,
        p.id,
        v_snapshot_date,
        GREATEST(COALESCE(p.stock_level, 0), 0),
        -- cost_price TAI price_amount * 0.6 (60% marginaali-oletus)
        -- GREATEST estää negatiiviset varastoarvot
        GREATEST(COALESCE(p.stock_level, 0), 0) * COALESCE(p.cost_price, p.price_amount * 0.6, 0)
    FROM products p
    WHERE p.for_sale = true
      AND COALESCE(p.stock_tracked, true) = true   -- LISÄTTY: ohita untracked-tuotteet
      AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ON CONFLICT (store_id, product_id, snapshot_date)
    DO UPDATE SET
        stock_level = EXCLUDED.stock_level,
        stock_value = EXCLUDED.stock_value;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Logita
    INSERT INTO kpi_calculation_log (store_id, calculation_type, status, metrics, completed_at)
    VALUES (
        COALESCE(p_store_id, '00000000-0000-0000-0000-000000000000'::UUID),
        'inventory_snapshot',
        'completed',
        jsonb_build_object('rows_affected', v_count, 'snapshot_date', v_snapshot_date),
        NOW()
    );

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION create_daily_inventory_snapshot IS
'Luo päivittäisen varastosnapshot-rivin EILISELLE päivälle. Suodattaa pois stock_tracked=false tuotteet ja estää negatiiviset stock_level arvot.';

-- Korjaa vanhat negatiiviset snapshotit → aseta stock_value = 0 ja stock_level = 0
-- Näin historiadata säilyy mutta negatiiviset eivät vedä summaa alas
UPDATE inventory_snapshots
SET stock_value = 0, stock_level = 0
WHERE stock_value < 0;

-- Poista untracked-tuotteiden snapshotit
DELETE FROM inventory_snapshots
WHERE product_id IN (
    SELECT id FROM products WHERE stock_tracked = false
);

-- Korjaa aggregointifunktio: käytä GREATEST(stock_value, 0) turvaksi
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
    SUM(GREATEST(s.stock_value, 0))::NUMERIC as total_value,
    COUNT(*)::BIGINT as product_count
  FROM inventory_snapshots s
  WHERE s.store_id = p_store_id
    AND s.snapshot_date >= CURRENT_DATE - p_days_back
  GROUP BY s.snapshot_date
  ORDER BY s.snapshot_date ASC;
END;
$$;

COMMENT ON FUNCTION get_inventory_history_aggregated IS 'Returns daily inventory value totals with GREATEST(0) protection against negative values';

-- 6. Luo tämän päivän snapshot heti
SELECT create_daily_inventory_snapshot();

-- ============================================
-- VALMIS
-- ============================================
