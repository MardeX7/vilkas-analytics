-- GSC Search Analytics - hakutulokset Google Search Consolesta
CREATE TABLE IF NOT EXISTS gsc_search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL,
  date DATE NOT NULL,
  query TEXT,
  page TEXT,
  device TEXT,
  country TEXT,
  clicks INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  ctr DECIMAL(5,4) DEFAULT 0,
  position DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_gsc_analytics_store_date ON gsc_search_analytics(store_id, date);
CREATE INDEX IF NOT EXISTS idx_gsc_analytics_query ON gsc_search_analytics(store_id, query);
CREATE INDEX IF NOT EXISTS idx_gsc_analytics_page ON gsc_search_analytics(store_id, page);

-- Daily summary view
CREATE OR REPLACE VIEW v_gsc_daily_summary AS
SELECT
  store_id,
  date,
  SUM(clicks) as total_clicks,
  SUM(impressions) as total_impressions,
  CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::decimal / SUM(impressions) ELSE 0 END as avg_ctr,
  AVG(position) as avg_position
FROM gsc_search_analytics
GROUP BY store_id, date
ORDER BY date DESC;
