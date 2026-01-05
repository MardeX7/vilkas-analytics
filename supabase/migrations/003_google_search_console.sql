-- Google Search Console Integration
-- Stores OAuth tokens and search analytics data

-- ============================================
-- 1. GSC OAUTH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS gsc_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    site_url TEXT NOT NULL, -- e.g., 'sc-domain:billackering.eu' or 'https://www.billackering.eu/'
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expiry TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(store_id, site_url)
);

-- ============================================
-- 2. GSC SEARCH ANALYTICS DATA
-- ============================================
CREATE TABLE IF NOT EXISTS gsc_search_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    site_url TEXT NOT NULL,
    date DATE NOT NULL,
    query TEXT, -- Search query (can be null for page-level data)
    page TEXT, -- Landing page URL
    country TEXT,
    device TEXT, -- 'DESKTOP', 'MOBILE', 'TABLET'
    clicks INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    ctr DECIMAL(5,4), -- Click-through rate (0.0000 - 1.0000)
    position DECIMAL(5,2), -- Average position
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(store_id, site_url, date, query, page, country, device)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_gsc_analytics_store_date
ON gsc_search_analytics(store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_gsc_analytics_query
ON gsc_search_analytics(store_id, query)
WHERE query IS NOT NULL;

-- ============================================
-- 3. GSC DAILY SUMMARY VIEW
-- ============================================
DROP VIEW IF EXISTS v_gsc_daily_summary;
CREATE VIEW v_gsc_daily_summary AS
SELECT
    store_id,
    site_url,
    date,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE WHEN SUM(impressions) > 0
        THEN ROUND((SUM(clicks)::decimal / SUM(impressions))::numeric, 4)
        ELSE 0
    END as avg_ctr,
    ROUND(AVG(position)::numeric, 2) as avg_position
FROM gsc_search_analytics
GROUP BY store_id, site_url, date
ORDER BY date DESC;

-- ============================================
-- 4. TOP QUERIES VIEW
-- ============================================
DROP VIEW IF EXISTS v_gsc_top_queries;
CREATE VIEW v_gsc_top_queries AS
SELECT
    store_id,
    site_url,
    query,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE WHEN SUM(impressions) > 0
        THEN ROUND((SUM(clicks)::decimal / SUM(impressions))::numeric, 4)
        ELSE 0
    END as avg_ctr,
    ROUND(AVG(position)::numeric, 2) as avg_position
FROM gsc_search_analytics
WHERE query IS NOT NULL
GROUP BY store_id, site_url, query
ORDER BY total_clicks DESC;

-- ============================================
-- 5. TOP PAGES VIEW
-- ============================================
DROP VIEW IF EXISTS v_gsc_top_pages;
CREATE VIEW v_gsc_top_pages AS
SELECT
    store_id,
    site_url,
    page,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE WHEN SUM(impressions) > 0
        THEN ROUND((SUM(clicks)::decimal / SUM(impressions))::numeric, 4)
        ELSE 0
    END as avg_ctr,
    ROUND(AVG(position)::numeric, 2) as avg_position
FROM gsc_search_analytics
WHERE page IS NOT NULL
GROUP BY store_id, site_url, page
ORDER BY total_clicks DESC;

-- ============================================
-- 6. DEVICE BREAKDOWN VIEW
-- ============================================
DROP VIEW IF EXISTS v_gsc_device_breakdown;
CREATE VIEW v_gsc_device_breakdown AS
SELECT
    store_id,
    site_url,
    device,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE WHEN SUM(impressions) > 0
        THEN ROUND((SUM(clicks)::decimal / SUM(impressions))::numeric, 4)
        ELSE 0
    END as avg_ctr,
    ROUND(AVG(position)::numeric, 2) as avg_position
FROM gsc_search_analytics
WHERE device IS NOT NULL
GROUP BY store_id, site_url, device
ORDER BY total_clicks DESC;

-- ============================================
-- 7. COUNTRY BREAKDOWN VIEW
-- ============================================
DROP VIEW IF EXISTS v_gsc_country_breakdown;
CREATE VIEW v_gsc_country_breakdown AS
SELECT
    store_id,
    site_url,
    country,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE WHEN SUM(impressions) > 0
        THEN ROUND((SUM(clicks)::decimal / SUM(impressions))::numeric, 4)
        ELSE 0
    END as avg_ctr,
    ROUND(AVG(position)::numeric, 2) as avg_position
FROM gsc_search_analytics
WHERE country IS NOT NULL
GROUP BY store_id, site_url, country
ORDER BY total_clicks DESC;
