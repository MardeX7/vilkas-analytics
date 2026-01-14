-- ============================================================================
-- PHASE 3: Campaign Intelligence
-- KPI Intelligence Layer v1
--
-- Since ePages coupon API is not available for this store,
-- we implement manual campaign management with future extensibility.
-- ============================================================================

-- ============================================================================
-- 1. CAMPAIGNS TABLE
-- Manual campaign tracking with optional coupon code
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Campaign info
  name TEXT NOT NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('discount', 'bundle', 'free_shipping', 'gift', 'other')),
  description TEXT,

  -- Optional coupon code (for matching with order data if available)
  coupon_code TEXT,

  -- Date range
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Discount details
  discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed', 'none')),
  discount_value DECIMAL,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Performance metrics (calculated)
  orders_count INT DEFAULT 0,
  revenue DECIMAL DEFAULT 0,
  avg_order_value DECIMAL DEFAULT 0,
  conversion_lift DECIMAL, -- % lift vs non-campaign period

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_calculated_at TIMESTAMPTZ,

  CONSTRAINT valid_campaign_dates CHECK (end_date >= start_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_store_dates
ON campaigns(store_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_campaigns_coupon_code
ON campaigns(store_id, coupon_code) WHERE coupon_code IS NOT NULL;

-- RLS (simplified for single-tenant app)
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view campaigns" ON campaigns
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert campaigns" ON campaigns
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update campaigns" ON campaigns
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete campaigns" ON campaigns
  FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access to campaigns" ON campaigns
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

COMMENT ON TABLE campaigns IS 'Marketing campaigns with performance tracking';

-- ============================================================================
-- 2. RPC: Get campaigns for date range
-- ============================================================================

CREATE OR REPLACE FUNCTION get_campaigns(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_active_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  campaign_type TEXT,
  description TEXT,
  coupon_code TEXT,
  start_date DATE,
  end_date DATE,
  discount_type TEXT,
  discount_value DECIMAL,
  is_active BOOLEAN,
  orders_count INT,
  revenue DECIMAL,
  avg_order_value DECIMAL,
  conversion_lift DECIMAL,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Default to all time if no dates provided
  IF p_start_date IS NULL THEN
    p_start_date := '1900-01-01'::DATE;
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := '2100-12-31'::DATE;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.campaign_type,
    c.description,
    c.coupon_code,
    c.start_date,
    c.end_date,
    c.discount_type,
    c.discount_value,
    c.is_active,
    c.orders_count,
    c.revenue,
    c.avg_order_value,
    c.conversion_lift,
    c.created_at
  FROM campaigns c
  WHERE c.store_id = p_store_id
    AND c.start_date <= p_end_date
    AND c.end_date >= p_start_date
    AND (NOT p_active_only OR c.is_active = TRUE)
  ORDER BY c.start_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_campaigns TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaigns TO service_role;

-- ============================================================================
-- 3. RPC: Create campaign
-- ============================================================================

CREATE OR REPLACE FUNCTION create_campaign(
  p_store_id UUID,
  p_name TEXT,
  p_campaign_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_description TEXT DEFAULT NULL,
  p_coupon_code TEXT DEFAULT NULL,
  p_discount_type TEXT DEFAULT NULL,
  p_discount_value DECIMAL DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign_id UUID;
BEGIN
  INSERT INTO campaigns (
    store_id, name, campaign_type, start_date, end_date,
    description, coupon_code, discount_type, discount_value
  ) VALUES (
    p_store_id, p_name, p_campaign_type, p_start_date, p_end_date,
    p_description, p_coupon_code, p_discount_type, p_discount_value
  )
  RETURNING id INTO v_campaign_id;

  RETURN v_campaign_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_campaign TO authenticated;
GRANT EXECUTE ON FUNCTION create_campaign TO service_role;

-- ============================================================================
-- 4. RPC: Calculate campaign performance
-- Calculates orders/revenue during campaign period
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_campaign_performance(
  p_store_id UUID,
  p_campaign_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign RECORD;
  v_orders_count INT;
  v_revenue DECIMAL;
  v_aov DECIMAL;
  v_baseline_aov DECIMAL;
  v_conversion_lift DECIMAL;
  v_updated_count INT := 0;
BEGIN
  FOR v_campaign IN
    SELECT * FROM campaigns
    WHERE store_id = p_store_id
      AND (p_campaign_id IS NULL OR id = p_campaign_id)
  LOOP
    -- Calculate orders and revenue during campaign period
    SELECT
      COUNT(DISTINCT o.id),
      COALESCE(SUM(li.total_price), 0)
    INTO v_orders_count, v_revenue
    FROM orders o
    JOIN order_line_items li ON li.order_id = o.id
    WHERE o.store_id = p_store_id
      AND o.creation_date::DATE >= v_campaign.start_date
      AND o.creation_date::DATE <= v_campaign.end_date;

    -- Calculate AOV
    IF v_orders_count > 0 THEN
      v_aov := v_revenue / v_orders_count;
    ELSE
      v_aov := 0;
    END IF;

    -- Calculate baseline AOV (30 days before campaign)
    SELECT COALESCE(AVG(order_total), 0) INTO v_baseline_aov
    FROM (
      SELECT o.id, SUM(li.total_price) AS order_total
      FROM orders o
      JOIN order_line_items li ON li.order_id = o.id
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= (v_campaign.start_date - INTERVAL '30 days')::DATE
        AND o.creation_date::DATE < v_campaign.start_date
      GROUP BY o.id
    ) AS baseline_orders;

    -- Calculate conversion lift (AOV lift)
    IF v_baseline_aov > 0 THEN
      v_conversion_lift := ((v_aov - v_baseline_aov) / v_baseline_aov) * 100;
    ELSE
      v_conversion_lift := NULL;
    END IF;

    -- Update campaign
    UPDATE campaigns
    SET
      orders_count = v_orders_count,
      revenue = ROUND(v_revenue, 2),
      avg_order_value = ROUND(v_aov, 2),
      conversion_lift = ROUND(v_conversion_lift, 1),
      last_calculated_at = NOW(),
      updated_at = NOW()
    WHERE id = v_campaign.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_campaign_performance TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_campaign_performance TO service_role;

-- ============================================================================
-- 5. RPC: Get campaign summary stats
-- ============================================================================

CREATE OR REPLACE FUNCTION get_campaign_summary(
  p_store_id UUID,
  p_year INT DEFAULT NULL
)
RETURNS TABLE (
  total_campaigns BIGINT,
  active_campaigns BIGINT,
  total_campaign_revenue DECIMAL,
  avg_campaign_aov DECIMAL,
  best_performing_campaign TEXT,
  best_campaign_revenue DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_year IS NULL THEN
    p_year := EXTRACT(YEAR FROM CURRENT_DATE)::INT;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_campaigns,
    COUNT(*) FILTER (WHERE c.is_active = TRUE)::BIGINT AS active_campaigns,
    COALESCE(SUM(c.revenue), 0)::DECIMAL AS total_campaign_revenue,
    COALESCE(AVG(c.avg_order_value), 0)::DECIMAL AS avg_campaign_aov,
    (SELECT name FROM campaigns WHERE store_id = p_store_id AND EXTRACT(YEAR FROM start_date) = p_year ORDER BY revenue DESC NULLS LAST LIMIT 1) AS best_performing_campaign,
    (SELECT revenue FROM campaigns WHERE store_id = p_store_id AND EXTRACT(YEAR FROM start_date) = p_year ORDER BY revenue DESC NULLS LAST LIMIT 1) AS best_campaign_revenue
  FROM campaigns c
  WHERE c.store_id = p_store_id
    AND EXTRACT(YEAR FROM c.start_date) = p_year;
END;
$$;

GRANT EXECUTE ON FUNCTION get_campaign_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaign_summary TO service_role;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO authenticated;
GRANT ALL ON campaigns TO service_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
