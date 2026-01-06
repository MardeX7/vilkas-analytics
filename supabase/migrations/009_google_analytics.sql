-- Google Analytics 4 Integration
-- Stores OAuth tokens and behavioral analytics data
-- NOTE: GA4 is for BEHAVIORAL data only, NOT transactions (ePages = master)

-- ============================================
-- 1. GA4 OAUTH TOKENS
-- ============================================
CREATE TABLE IF NOT EXISTS ga4_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL UNIQUE,
    property_id TEXT NOT NULL,           -- GA4 property ID (e.g., 'properties/123456789')
    account_id TEXT,                      -- GA4 account ID
    property_name TEXT,                   -- Human-readable property name
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_ga4_tokens_store_id ON ga4_tokens(store_id);

-- RLS - disabled for now (service role access)
ALTER TABLE ga4_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to ga4_tokens" ON ga4_tokens
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 2. GA4 ANALYTICS DATA (Behavioral only)
-- ============================================
CREATE TABLE IF NOT EXISTS ga4_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL,
    property_id TEXT NOT NULL,
    date DATE NOT NULL,

    -- Traffic source dimensions
    session_source TEXT,                  -- 'google', 'facebook', 'direct', etc.
    session_medium TEXT,                  -- 'organic', 'cpc', 'referral', 'none'
    session_default_channel_grouping TEXT, -- 'Organic Search', 'Paid Search', 'Social', etc.
    landing_page TEXT,                    -- Landing page path

    -- Metrics (behavioral only - NO transactions)
    sessions INTEGER DEFAULT 0,
    engaged_sessions INTEGER DEFAULT 0,
    bounce_rate DECIMAL(5,4),             -- 0.0000 - 1.0000
    average_session_duration DECIMAL(10,2), -- In seconds
    new_users INTEGER DEFAULT 0,
    returning_users INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(store_id, property_id, date, session_source, session_medium, landing_page)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_ga4_analytics_store_date
ON ga4_analytics(store_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_ga4_analytics_source
ON ga4_analytics(store_id, session_default_channel_grouping);

CREATE INDEX IF NOT EXISTS idx_ga4_analytics_landing
ON ga4_analytics(store_id, landing_page)
WHERE landing_page IS NOT NULL;

-- RLS
ALTER TABLE ga4_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access to ga4_analytics" ON ga4_analytics
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 3. GA4 DAILY SUMMARY VIEW
-- ============================================
DROP VIEW IF EXISTS v_ga4_daily_summary;
CREATE VIEW v_ga4_daily_summary AS
SELECT
    store_id,
    property_id,
    date,
    SUM(sessions) as total_sessions,
    SUM(engaged_sessions) as total_engaged_sessions,
    CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(sessions) - SUM(engaged_sessions))::decimal / SUM(sessions)::decimal, 4)
        ELSE 0
    END as avg_bounce_rate,
    ROUND(AVG(average_session_duration)::numeric, 2) as avg_session_duration,
    SUM(new_users) as total_new_users,
    SUM(returning_users) as total_returning_users
FROM ga4_analytics
GROUP BY store_id, property_id, date
ORDER BY date DESC;

-- ============================================
-- 4. TRAFFIC SOURCE BREAKDOWN VIEW
-- ============================================
DROP VIEW IF EXISTS v_ga4_traffic_sources;
CREATE VIEW v_ga4_traffic_sources AS
SELECT
    store_id,
    property_id,
    session_default_channel_grouping as channel,
    SUM(sessions) as total_sessions,
    SUM(engaged_sessions) as total_engaged_sessions,
    CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(sessions) - SUM(engaged_sessions))::decimal / SUM(sessions)::decimal, 4)
        ELSE 0
    END as avg_bounce_rate,
    ROUND(AVG(average_session_duration)::numeric, 2) as avg_session_duration
FROM ga4_analytics
WHERE session_default_channel_grouping IS NOT NULL
GROUP BY store_id, property_id, session_default_channel_grouping
ORDER BY total_sessions DESC;

-- ============================================
-- 5. LANDING PAGE PERFORMANCE VIEW
-- ============================================
DROP VIEW IF EXISTS v_ga4_landing_pages;
CREATE VIEW v_ga4_landing_pages AS
SELECT
    store_id,
    property_id,
    landing_page,
    SUM(sessions) as total_sessions,
    SUM(engaged_sessions) as total_engaged_sessions,
    CASE WHEN SUM(sessions) > 0
        THEN ROUND((SUM(sessions) - SUM(engaged_sessions))::decimal / SUM(sessions)::decimal, 4)
        ELSE 0
    END as bounce_rate,
    ROUND(AVG(average_session_duration)::numeric, 2) as avg_session_duration
FROM ga4_analytics
WHERE landing_page IS NOT NULL
GROUP BY store_id, property_id, landing_page
ORDER BY total_sessions DESC;

-- ============================================
-- 6. UPDATE shops TABLE (ensure ga4_property_id exists)
-- ============================================
ALTER TABLE shops ADD COLUMN IF NOT EXISTS ga4_property_id TEXT;

-- ============================================
-- 7. COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE ga4_tokens IS 'Google Analytics 4 OAuth tokens per store';
COMMENT ON TABLE ga4_analytics IS 'GA4 behavioral data - traffic sources, bounce rate, sessions. NO transactions!';
COMMENT ON COLUMN ga4_analytics.bounce_rate IS 'Bounce rate as decimal 0.0000 - 1.0000';
COMMENT ON COLUMN ga4_analytics.session_default_channel_grouping IS 'GA4 channel: Organic Search, Paid Search, Social, Direct, Referral, etc.';
