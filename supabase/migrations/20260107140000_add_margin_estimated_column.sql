-- ============================================
-- Add margin_estimated column to product_profitability
-- VilkasAnalytics (tlothekaphtiwvusgwzh)
--
-- Versio: 1.0
-- Luotu: 2026-01-07
-- ============================================

-- Add column to track if margin is estimated (60% default)
ALTER TABLE product_profitability
ADD COLUMN IF NOT EXISTS margin_estimated BOOLEAN DEFAULT false;

COMMENT ON COLUMN product_profitability.margin_estimated IS
'True if margin was estimated using 60% default (no cost_price available)';

-- ============================================
-- VALMIS
-- ============================================
