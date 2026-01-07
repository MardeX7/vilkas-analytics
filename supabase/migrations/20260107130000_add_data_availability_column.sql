-- ============================================
-- Add data_availability column to kpi_index_snapshots
-- VilkasAnalytics (tlothekaphtiwvusgwzh)
--
-- Versio: 1.0
-- Luotu: 2026-01-07
-- ============================================

-- Add data_availability column to track which metrics have valid data
ALTER TABLE kpi_index_snapshots
ADD COLUMN IF NOT EXISTS data_availability JSONB DEFAULT '{}'::JSONB;

-- Add ppi_components column if missing
ALTER TABLE kpi_index_snapshots
ADD COLUMN IF NOT EXISTS ppi_components JSONB DEFAULT '{}'::JSONB;

-- Add comments
COMMENT ON COLUMN kpi_index_snapshots.data_availability IS
'Tracks which metrics have valid data vs missing/estimated data. Used to show "Ei dataa" in UI instead of 0.';

COMMENT ON COLUMN kpi_index_snapshots.ppi_components IS
'Product Profitability Index components: margin with availability info.';

-- ============================================
-- VALMIS
-- ============================================
