-- ============================================
-- FIX: Inventory Snapshot uses YESTERDAY's date
-- VilkasAnalytics (tlothekaphtiwvusgwzh)
--
-- Ongelma: Cron ajaa klo 06:00 UTC ja luo snapshotin
-- CURRENT_DATE:lla (tänään), mutta datan pitäisi
-- kuvata EILISEN lopputilannetta.
--
-- Ratkaisu: Käytä CURRENT_DATE - INTERVAL '1 day'
-- ============================================

-- 1. Korjaa RPC-funktio käyttämään eilistä päivämäärää
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
    -- KORJAUS: Käytä EILISTÄ päivämäärää
    -- Cron ajaa aamulla klo 06:00 UTC, joten data kuvaa eilisen tilannetta
    v_snapshot_date := (CURRENT_DATE - INTERVAL '1 day')::DATE;

    INSERT INTO inventory_snapshots (store_id, product_id, snapshot_date, stock_level, stock_value)
    SELECT
        p.store_id,
        p.id,
        v_snapshot_date,  -- EILINEN, ei tänään
        COALESCE(p.stock_level, 0),
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
        jsonb_build_object('rows_affected', v_count, 'snapshot_date', v_snapshot_date),
        NOW()
    );

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION create_daily_inventory_snapshot IS
'Luo päivittäisen varastosnapshot-rivin EILISELLE päivälle. Cron ajaa aamulla joten data kuvaa edellisen päivän lopputilannetta.';

-- 2. Korjaa tämän päivän virheellinen data
-- Poista tänään (18.1.) luotu snapshot ja siirrä se eiliselle (17.1.)
-- HUOM: Aja tämä vain kerran!

-- Poista tänään luodut snapshotit
DELETE FROM inventory_snapshots
WHERE snapshot_date = CURRENT_DATE;

-- ============================================
-- VALMIS - Aja Supabase SQL Editorissa
-- ============================================
