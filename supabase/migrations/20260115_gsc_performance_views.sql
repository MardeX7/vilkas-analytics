-- GSC Performance Views
-- Aggregates data server-side to improve frontend performance
-- Before: Frontend loaded 400k+ rows and aggregated in browser
-- After: Database aggregates, frontend gets only top 20-50 rows

-- 1. Top Queries View (aggregated by query)
CREATE OR REPLACE VIEW v_gsc_top_queries AS
SELECT
  store_id,
  query,
  SUM(clicks) as clicks,
  SUM(impressions) as impressions,
  CASE WHEN SUM(impressions) > 0
    THEN SUM(clicks)::float / SUM(impressions)
    ELSE 0
  END as ctr,
  AVG(position) as position,
  MIN(date) as first_seen,
  MAX(date) as last_seen
FROM gsc_search_analytics
WHERE query IS NOT NULL
GROUP BY store_id, query;

-- 2. Top Pages View (aggregated by page)
CREATE OR REPLACE VIEW v_gsc_top_pages AS
SELECT
  store_id,
  page,
  SUM(clicks) as clicks,
  SUM(impressions) as impressions,
  CASE WHEN SUM(impressions) > 0
    THEN SUM(clicks)::float / SUM(impressions)
    ELSE 0
  END as ctr,
  AVG(position) as position,
  MIN(date) as first_seen,
  MAX(date) as last_seen
FROM gsc_search_analytics
WHERE page IS NOT NULL
GROUP BY store_id, page;

-- 3. Device Breakdown View
CREATE OR REPLACE VIEW v_gsc_device_breakdown AS
SELECT
  store_id,
  device,
  SUM(clicks) as clicks,
  SUM(impressions) as impressions,
  MIN(date) as first_seen,
  MAX(date) as last_seen
FROM gsc_search_analytics
WHERE device IS NOT NULL
GROUP BY store_id, device;

-- 4. Country Breakdown View
CREATE OR REPLACE VIEW v_gsc_country_breakdown AS
SELECT
  store_id,
  country,
  SUM(clicks) as clicks,
  SUM(impressions) as impressions,
  MIN(date) as first_seen,
  MAX(date) as last_seen
FROM gsc_search_analytics
WHERE country IS NOT NULL
GROUP BY store_id, country;

-- 5. Keyword Buckets Function (calculates position distribution)
CREATE OR REPLACE FUNCTION get_gsc_keyword_buckets(
  p_store_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  total_keywords INT,
  top3 INT,
  top10 INT,
  top20 INT,
  beyond20 INT,
  page1_keywords INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_top3 INT := 0;
  v_top10 INT := 0;
  v_top20 INT := 0;
  v_beyond20 INT := 0;
BEGIN
  -- Get best position per keyword in period
  WITH keyword_positions AS (
    SELECT
      query,
      MIN(position) as best_position
    FROM gsc_search_analytics
    WHERE store_id = p_store_id
      AND query IS NOT NULL
      AND date >= p_start_date
      AND date <= p_end_date
    GROUP BY query
  )
  SELECT
    COUNT(*) FILTER (WHERE best_position <= 3),
    COUNT(*) FILTER (WHERE best_position > 3 AND best_position <= 10),
    COUNT(*) FILTER (WHERE best_position > 10 AND best_position <= 20),
    COUNT(*) FILTER (WHERE best_position > 20)
  INTO v_top3, v_top10, v_top20, v_beyond20
  FROM keyword_positions;

  RETURN QUERY SELECT
    (v_top3 + v_top10 + v_top20 + v_beyond20)::INT as total_keywords,
    v_top3,
    v_top10,
    v_top20,
    v_beyond20,
    (v_top3 + v_top10)::INT as page1_keywords;
END;
$$;

-- 6. Risk Radar Function (weekly page comparison)
CREATE OR REPLACE FUNCTION get_gsc_risk_radar(
  p_store_id UUID
)
RETURNS TABLE (
  page TEXT,
  week1_clicks INT,
  week1_impressions INT,
  week1_position FLOAT,
  week2_clicks INT,
  week2_impressions INT,
  week2_position FLOAT,
  week3_clicks INT,
  week3_impressions INT,
  week3_position FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_one_week_ago DATE := CURRENT_DATE - 7;
  v_two_weeks_ago DATE := CURRENT_DATE - 14;
  v_three_weeks_ago DATE := CURRENT_DATE - 21;
BEGIN
  RETURN QUERY
  SELECT
    g.page::TEXT,
    -- Week 1 (oldest: 3 weeks ago to 2 weeks ago)
    COALESCE(SUM(g.clicks) FILTER (WHERE g.date >= v_three_weeks_ago AND g.date < v_two_weeks_ago), 0)::INT as week1_clicks,
    COALESCE(SUM(g.impressions) FILTER (WHERE g.date >= v_three_weeks_ago AND g.date < v_two_weeks_ago), 0)::INT as week1_impressions,
    COALESCE(AVG(g.position) FILTER (WHERE g.date >= v_three_weeks_ago AND g.date < v_two_weeks_ago), 0)::FLOAT as week1_position,
    -- Week 2 (middle: 2 weeks ago to 1 week ago)
    COALESCE(SUM(g.clicks) FILTER (WHERE g.date >= v_two_weeks_ago AND g.date < v_one_week_ago), 0)::INT as week2_clicks,
    COALESCE(SUM(g.impressions) FILTER (WHERE g.date >= v_two_weeks_ago AND g.date < v_one_week_ago), 0)::INT as week2_impressions,
    COALESCE(AVG(g.position) FILTER (WHERE g.date >= v_two_weeks_ago AND g.date < v_one_week_ago), 0)::FLOAT as week2_position,
    -- Week 3 (newest: 1 week ago to today)
    COALESCE(SUM(g.clicks) FILTER (WHERE g.date >= v_one_week_ago AND g.date <= v_today), 0)::INT as week3_clicks,
    COALESCE(SUM(g.impressions) FILTER (WHERE g.date >= v_one_week_ago AND g.date <= v_today), 0)::INT as week3_impressions,
    COALESCE(AVG(g.position) FILTER (WHERE g.date >= v_one_week_ago AND g.date <= v_today), 0)::FLOAT as week3_position
  FROM gsc_search_analytics g
  WHERE g.store_id = p_store_id
    AND g.page IS NOT NULL
    AND g.date >= v_three_weeks_ago
  GROUP BY g.page
  -- Only pages with meaningful traffic in at least one week
  HAVING SUM(g.impressions) FILTER (WHERE g.date >= v_one_week_ago) >= 10
     OR SUM(g.impressions) FILTER (WHERE g.date >= v_two_weeks_ago AND g.date < v_one_week_ago) >= 10;
END;
$$;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_gsc_search_analytics_store_date
ON gsc_search_analytics(store_id, date);

CREATE INDEX IF NOT EXISTS idx_gsc_search_analytics_store_query
ON gsc_search_analytics(store_id, query)
WHERE query IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gsc_search_analytics_store_page
ON gsc_search_analytics(store_id, page)
WHERE page IS NOT NULL;

-- Grant access
GRANT SELECT ON v_gsc_top_queries TO anon, authenticated;
GRANT SELECT ON v_gsc_top_pages TO anon, authenticated;
GRANT SELECT ON v_gsc_device_breakdown TO anon, authenticated;
GRANT SELECT ON v_gsc_country_breakdown TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_gsc_keyword_buckets TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_gsc_risk_radar TO anon, authenticated;
