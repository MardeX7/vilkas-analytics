-- ============================================
-- KPI INDEX ENGINE - Tietokantataulut
-- VilkasAnalytics (tlothekaphtiwvusgwzh)
--
-- Versio: 1.0
-- Luotu: 2026-01-07
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. KPI_INDEX_SNAPSHOTS - Pääindeksitaulu
-- ============================================
CREATE TABLE IF NOT EXISTS kpi_index_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Aikajakso
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    granularity TEXT NOT NULL CHECK (granularity IN ('week', 'month')),

    -- Indeksit (0-100)
    core_index DECIMAL(5,2),
    product_profitability_index DECIMAL(5,2),
    seo_performance_index DECIMAL(5,2),
    operational_index DECIMAL(5,2),

    -- Yhdistetty kokonaisindeksi
    overall_index DECIMAL(5,2),

    -- Muutokset edellisestä jaksosta
    core_index_delta DECIMAL(5,2),
    ppi_delta DECIMAL(5,2),
    spi_delta DECIMAL(5,2),
    oi_delta DECIMAL(5,2),
    overall_delta DECIMAL(5,2),

    -- Raakadata JSON-muodossa (debug + AI context)
    raw_metrics JSONB,

    -- Komponenttien yksityiskohdat
    core_components JSONB,
    ppi_components JSONB,
    spi_components JSONB,
    oi_components JSONB,

    -- Hälytykset
    alerts TEXT[],

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, period_end, granularity)
);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_store_period
ON kpi_index_snapshots(store_id, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_granularity
ON kpi_index_snapshots(granularity, period_end DESC);

COMMENT ON TABLE kpi_index_snapshots IS
'Pääindeksitaulu: viikko/kuukausi-snapshotit kaikista KPI-indekseistä (0-100)';

-- ============================================
-- 2. INVENTORY_SNAPSHOTS - Varastohistoria
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    snapshot_date DATE NOT NULL,

    stock_level INTEGER NOT NULL DEFAULT 0,
    stock_value DECIMAL(12,2),  -- stock_level * cost_price

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, product_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_store_date
ON inventory_snapshots(store_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_snapshots_product
ON inventory_snapshots(product_id, snapshot_date DESC);

COMMENT ON TABLE inventory_snapshots IS
'Päivittäiset varastosnapshotit kiertonopeuden laskentaa varten (Phase 2 täysi hyöty)';

-- ============================================
-- 3. PRODUCT_PROFITABILITY - SKU-tason kannattavuus
-- ============================================
CREATE TABLE IF NOT EXISTS product_profitability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

    -- Aikajakso
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    granularity TEXT NOT NULL DEFAULT 'week' CHECK (granularity IN ('week', 'month')),

    -- Indeksit (0-100)
    margin_index DECIMAL(5,2),
    sales_index DECIMAL(5,2),
    stock_efficiency_index DECIMAL(5,2),
    total_score DECIMAL(5,2),

    -- Raakametriikat
    revenue DECIMAL(12,2),
    cost DECIMAL(12,2),
    gross_profit DECIMAL(12,2),
    margin_percent DECIMAL(5,2),
    units_sold INTEGER,
    stock_level INTEGER,
    stock_days DECIMAL(6,1),  -- Varaston peitto päivinä

    -- Luokittelu
    profitability_tier TEXT CHECK (profitability_tier IN ('top_driver', 'healthy', 'underperformer', 'capital_trap')),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, product_id, period_end, granularity)
);

CREATE INDEX IF NOT EXISTS idx_product_profitability_store_period
ON product_profitability(store_id, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_product_profitability_score
ON product_profitability(store_id, total_score DESC);

CREATE INDEX IF NOT EXISTS idx_product_profitability_tier
ON product_profitability(store_id, profitability_tier);

COMMENT ON TABLE product_profitability IS
'SKU-tason kannattavuusindeksit Product Profitability Index (PPI) laskentaa varten';

-- ============================================
-- 4. SEO_PERFORMANCE_METRICS - SEO-aggregaatit
-- ============================================
CREATE TABLE IF NOT EXISTS seo_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Aikajakso
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    granularity TEXT NOT NULL DEFAULT 'week' CHECK (granularity IN ('week', 'month')),

    -- GSC-metriikat
    total_clicks INTEGER,
    total_impressions INTEGER,
    avg_position DECIMAL(5,2),
    avg_ctr DECIMAL(7,4),

    -- Trendit (vs edellinen jakso)
    clicks_change_percent DECIMAL(6,2),
    impressions_change_percent DECIMAL(6,2),
    position_change DECIMAL(5,2),  -- Negatiivinen = parantunut

    -- Segmentointi
    brand_clicks INTEGER,
    nonbrand_clicks INTEGER,
    nonbrand_percent DECIMAL(5,2),

    -- Nousevat haut (impressions ↑ mutta clicks ↓ tai vakaa)
    rising_queries_count INTEGER,
    rising_queries JSONB,  -- Top 10 nousevaa hakua

    -- Indeksit (0-100)
    clicks_trend_index DECIMAL(5,2),
    position_index DECIMAL(5,2),
    nonbrand_index DECIMAL(5,2),
    rising_index DECIMAL(5,2),
    spi_total DECIMAL(5,2),

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, period_end, granularity)
);

CREATE INDEX IF NOT EXISTS idx_seo_metrics_store_period
ON seo_performance_metrics(store_id, period_end DESC);

COMMENT ON TABLE seo_performance_metrics IS
'Aggregoidut SEO-metriikat korrelaatiolaskentaan (ei suoraa €-attribuutiota)';

-- ============================================
-- 5. AI_CONTEXT_SNAPSHOTS - AI-agentin konteksti
-- ============================================
CREATE TABLE IF NOT EXISTS ai_context_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    period_label TEXT NOT NULL,  -- '2026-W02' tai '2026-01'
    granularity TEXT NOT NULL CHECK (granularity IN ('week', 'month')),

    -- Strukturoitu konteksti AI:lle
    context JSONB NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, period_label, granularity)
);

CREATE INDEX IF NOT EXISTS idx_ai_context_store_period
ON ai_context_snapshots(store_id, period_label DESC);

COMMENT ON TABLE ai_context_snapshots IS
'Strukturoitu JSON-konteksti AI-agentille (Emma/Esko)';

-- ============================================
-- 6. MARKETING_COSTS - Phase 2 valmius
-- ============================================
CREATE TABLE IF NOT EXISTS marketing_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    -- Aikajakso
    date DATE NOT NULL,

    -- Kanava
    channel TEXT NOT NULL,  -- 'meta', 'google_ads', 'tiktok', 'manual'
    campaign_id TEXT,
    campaign_name TEXT,

    -- Kustannukset
    spend DECIMAL(10,2) NOT NULL,
    currency TEXT DEFAULT 'SEK',

    -- Metriikat (API:sta)
    impressions INTEGER,
    clicks INTEGER,
    conversions INTEGER,
    conversion_value DECIMAL(10,2),

    -- Lasketut metriikat
    cpc DECIMAL(8,4),  -- Cost per click
    cpm DECIMAL(8,4),  -- Cost per mille
    cpa DECIMAL(10,2), -- Cost per acquisition
    roas DECIMAL(6,2), -- Return on ad spend

    -- Lähde
    source TEXT DEFAULT 'manual' CHECK (source IN ('api', 'manual', 'import')),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique index with COALESCE for nullable campaign_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_costs_unique
ON marketing_costs(store_id, date, channel, COALESCE(campaign_id, 'none'));

CREATE INDEX IF NOT EXISTS idx_marketing_costs_store_date
ON marketing_costs(store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_costs_channel
ON marketing_costs(store_id, channel, date DESC);

COMMENT ON TABLE marketing_costs IS
'Phase 2: Markkinointikustannukset Meta/Google Ads API:sta tai manuaalisesti syötettynä';

-- ============================================
-- 7. KPI_CALCULATION_LOG - Debug/audit log
-- ============================================
CREATE TABLE IF NOT EXISTS kpi_calculation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

    calculation_type TEXT NOT NULL,  -- 'snapshot', 'inventory', 'ppi', 'spi'
    period_start DATE,
    period_end DATE,
    granularity TEXT,

    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    error_message TEXT,

    metrics JSONB,  -- Laskennan tilastot (rivimäärät, kesto jne.)

    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_kpi_log_store_type
ON kpi_calculation_log(store_id, calculation_type, started_at DESC);

COMMENT ON TABLE kpi_calculation_log IS
'Audit log KPI-laskennoista debuggausta ja seurantaa varten';

-- ============================================
-- 8. HELPER VIEWS
-- ============================================

-- Viimeisin KPI-snapshot per kauppa
CREATE OR REPLACE VIEW v_latest_kpi_snapshot AS
SELECT DISTINCT ON (store_id, granularity)
    id,
    store_id,
    period_start,
    period_end,
    granularity,
    core_index,
    product_profitability_index,
    seo_performance_index,
    operational_index,
    overall_index,
    core_index_delta,
    ppi_delta,
    spi_delta,
    oi_delta,
    overall_delta,
    alerts,
    created_at
FROM kpi_index_snapshots
ORDER BY store_id, granularity, period_end DESC;

-- Top profit drivers (viimeisin jakso)
CREATE OR REPLACE VIEW v_top_profit_drivers AS
SELECT
    pp.store_id,
    pp.product_id,
    p.name as product_name,
    p.product_number as sku,
    pp.total_score,
    pp.margin_index,
    pp.sales_index,
    pp.stock_efficiency_index,
    pp.revenue,
    pp.margin_percent,
    pp.profitability_tier,
    pp.period_end
FROM product_profitability pp
JOIN products p ON pp.product_id = p.id
WHERE pp.period_end = (
    SELECT MAX(period_end)
    FROM product_profitability
    WHERE store_id = pp.store_id AND granularity = pp.granularity
)
AND pp.profitability_tier = 'top_driver'
ORDER BY pp.store_id, pp.total_score DESC;

-- Capital traps (tuotteet joissa pääoma jumissa)
CREATE OR REPLACE VIEW v_capital_traps AS
SELECT
    pp.store_id,
    pp.product_id,
    p.name as product_name,
    p.product_number as sku,
    pp.total_score,
    pp.stock_days,
    pp.stock_level,
    p.cost_price,
    (pp.stock_level * COALESCE(p.cost_price, 0)) as tied_capital,
    pp.revenue,
    pp.units_sold,
    pp.period_end
FROM product_profitability pp
JOIN products p ON pp.product_id = p.id
WHERE pp.period_end = (
    SELECT MAX(period_end)
    FROM product_profitability
    WHERE store_id = pp.store_id AND granularity = pp.granularity
)
AND pp.profitability_tier = 'capital_trap'
ORDER BY pp.store_id, (pp.stock_level * COALESCE(p.cost_price, 0)) DESC;

-- ============================================
-- 9. GRANTS & RLS (kun tarvitaan)
-- ============================================

-- Toistaiseksi RLS pois päältä (kehitys)
-- ALTER TABLE kpi_index_snapshots ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE inventory_snapshots ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE product_profitability ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE seo_performance_metrics ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE ai_context_snapshots ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE marketing_costs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- VALMIS
-- ============================================
