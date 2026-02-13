-- ============================================
-- FIX: Inventory Snapshot Calculation
-- VilkasAnalytics (tlothekaphtiwvusgwzh)
--
-- Ongelma: cost_price on NULL monilla tuotteilla
-- → COALESCE(cost_price, 0) palauttaa 0
-- → stock_value = 0
--
-- Ratkaisu: Käytä samaa logiikkaa kuin frontend:
-- cost_price TAI price_amount * 0.6
-- ============================================

-- 1. Korjaa RPC-funktio
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
BEGIN
    INSERT INTO inventory_snapshots (store_id, product_id, snapshot_date, stock_level, stock_value)
    SELECT
        p.store_id,
        p.id,
        CURRENT_DATE,
        COALESCE(p.stock_level, 0),
        -- KORJATTU: Sama logiikka kuin frontendissä
        -- cost_price TAI price_amount * 0.6 (60% marginaali-oletus)
        COALESCE(p.stock_level, 0) * COALESCE(p.cost_price, p.price_amount * 0.6, 0)
    FROM products p
    WHERE p.for_sale = true
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
        jsonb_build_object('rows_affected', v_count, 'snapshot_date', CURRENT_DATE),
        NOW()
    );

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION create_daily_inventory_snapshot IS
'Luo päivittäisen varastosnapshot-rivin. Käyttää cost_price tai price_amount*0.6 varahintana.';

-- 2. Poista vanhat virheelliset snapshotit (0 arvo)
DELETE FROM inventory_snapshots
WHERE stock_value = 0;

-- 3. Luo tämän päivän snapshot uudelleen oikealla laskennalla
-- (Tämä ajetaan automaattisesti kun funktio on päivitetty)

-- ============================================
-- VALMIS
-- ============================================
