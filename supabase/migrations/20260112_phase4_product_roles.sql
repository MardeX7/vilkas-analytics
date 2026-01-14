-- ============================================================================
-- PHASE 4: Product Role Model
-- KPI Intelligence Layer v1
--
-- Classifies products into roles based on sales performance:
-- - hero: High volume, traffic drivers (top 20% by units sold)
-- - anchor: Consistent sellers, good margin (middle 40%, good margin)
-- - filler: Add-on products, basket boosters (often bought with others)
-- - longtail: Rarely sold, potential dead stock (bottom 20%)
-- ============================================================================

-- ============================================================================
-- 1. PRODUCT ROLES TABLE
-- Stores calculated product roles with metrics
-- ============================================================================

CREATE TABLE IF NOT EXISTS product_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Role classification
  role TEXT NOT NULL CHECK (role IN ('hero', 'anchor', 'filler', 'longtail')),

  -- Metrics used for classification
  units_sold INT DEFAULT 0,
  revenue DECIMAL DEFAULT 0,
  orders_count INT DEFAULT 0,
  margin_percent DECIMAL,
  avg_basket_size DECIMAL,  -- Avg items in orders containing this product
  solo_purchase_rate DECIMAL,  -- % of times bought alone (not with others)

  -- Time period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Metadata
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_product_role_period UNIQUE (store_id, product_id, period_start, period_end)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_product_roles_store_role
ON product_roles(store_id, role);

CREATE INDEX IF NOT EXISTS idx_product_roles_store_period
ON product_roles(store_id, period_start, period_end);

-- RLS
ALTER TABLE product_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view product_roles" ON product_roles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role full access to product_roles" ON product_roles
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

GRANT SELECT ON product_roles TO authenticated;
GRANT ALL ON product_roles TO service_role;

COMMENT ON TABLE product_roles IS 'Product role classifications (hero/anchor/filler/longtail)';

-- ============================================================================
-- 2. RPC: Get product roles summary
-- Returns aggregated stats by role
-- ============================================================================

CREATE OR REPLACE FUNCTION get_product_roles_summary(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  role TEXT,
  product_count BIGINT,
  total_units BIGINT,
  total_revenue DECIMAL,
  avg_margin DECIMAL,
  top_products JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Default to last 90 days
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '90 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  RETURN QUERY
  WITH role_stats AS (
    SELECT
      pr.role,
      COUNT(DISTINCT pr.product_id) AS product_count,
      SUM(pr.units_sold) AS total_units,
      SUM(pr.revenue) AS total_revenue,
      AVG(pr.margin_percent) AS avg_margin
    FROM product_roles pr
    WHERE pr.store_id = p_store_id
      AND pr.period_start >= p_start_date
      AND pr.period_end <= p_end_date
    GROUP BY pr.role
  ),
  top_by_role AS (
    SELECT
      pr.role,
      jsonb_agg(
        jsonb_build_object(
          'product_id', pr.product_id,
          'name', p.name,
          'sku', p.sku,
          'units_sold', pr.units_sold,
          'revenue', pr.revenue,
          'margin_percent', pr.margin_percent
        ) ORDER BY pr.revenue DESC
      ) FILTER (WHERE rn <= 5) AS top_products
    FROM (
      SELECT *,
        ROW_NUMBER() OVER (PARTITION BY role ORDER BY revenue DESC) AS rn
      FROM product_roles
      WHERE store_id = p_store_id
        AND period_start >= p_start_date
        AND period_end <= p_end_date
    ) pr
    JOIN products p ON p.id = pr.product_id
    GROUP BY pr.role
  )
  SELECT
    rs.role,
    rs.product_count,
    rs.total_units,
    ROUND(rs.total_revenue, 2) AS total_revenue,
    ROUND(rs.avg_margin, 1) AS avg_margin,
    COALESCE(tr.top_products, '[]'::jsonb) AS top_products
  FROM role_stats rs
  LEFT JOIN top_by_role tr ON tr.role = rs.role
  ORDER BY
    CASE rs.role
      WHEN 'hero' THEN 1
      WHEN 'anchor' THEN 2
      WHEN 'filler' THEN 3
      WHEN 'longtail' THEN 4
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION get_product_roles_summary TO authenticated, service_role;

-- ============================================================================
-- 3. RPC: Get products by role
-- Returns detailed product list for a specific role
-- ============================================================================

CREATE OR REPLACE FUNCTION get_products_by_role(
  p_store_id UUID,
  p_role TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  product_id UUID,
  name TEXT,
  sku TEXT,
  units_sold INT,
  revenue DECIMAL,
  orders_count INT,
  margin_percent DECIMAL,
  avg_basket_size DECIMAL,
  solo_purchase_rate DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '90 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  RETURN QUERY
  SELECT
    pr.product_id,
    p.name,
    p.sku,
    pr.units_sold,
    ROUND(pr.revenue, 2) AS revenue,
    pr.orders_count,
    ROUND(pr.margin_percent, 1) AS margin_percent,
    ROUND(pr.avg_basket_size, 1) AS avg_basket_size,
    ROUND(pr.solo_purchase_rate, 1) AS solo_purchase_rate
  FROM product_roles pr
  JOIN products p ON p.id = pr.product_id
  WHERE pr.store_id = p_store_id
    AND pr.role = p_role
    AND pr.period_start >= p_start_date
    AND pr.period_end <= p_end_date
  ORDER BY pr.revenue DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_products_by_role TO authenticated, service_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
