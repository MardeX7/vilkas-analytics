-- Vilkas Analytics - Product Categories Enhancement
-- Many-to-many category relationships (product can belong to multiple categories)

-- ============================================
-- CATEGORIES TABLE (hierarchical)
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,

    -- Full path as unique identifier
    category_path TEXT NOT NULL,           -- e.g., "Categories/Billack/Akrylfärg"

    -- Hierarchy levels
    level1 TEXT,                           -- e.g., "Categories"
    level2 TEXT,                           -- e.g., "Billack", "Tillbehoer"
    level3 TEXT,                           -- e.g., "Akrylfärg", "Klarlack"

    -- Display name (level3 or last part)
    display_name TEXT NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(store_id, category_path)
);

-- ============================================
-- PRODUCT-CATEGORY JUNCTION TABLE (many-to-many)
-- ============================================
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,

    -- Position from CSV (sorting)
    position INTEGER DEFAULT 0,
    position_category INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(product_id, category_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id);
CREATE INDEX IF NOT EXISTS idx_categories_level2 ON categories(level2);
CREATE INDEX IF NOT EXISTS idx_categories_level3 ON categories(level3);
CREATE INDEX IF NOT EXISTS idx_product_categories_product_id ON product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_product_categories_category_id ON product_categories(category_id);

-- ============================================
-- CATEGORY SALES VIEWS (using many-to-many)
-- ============================================

-- Daily sales by Level 3 category (e.g., Akrylfärg, Klarlack)
-- Note: Products in multiple categories will be counted in each
CREATE OR REPLACE VIEW v_category_daily_sales AS
SELECT
    c.store_id,
    DATE(o.creation_date) as sale_date,
    c.level2 as category_level2,
    c.level3 as category_level3,
    COUNT(DISTINCT o.id) as order_count,
    SUM(oli.quantity) as total_quantity,
    SUM(oli.total_price) as total_revenue,
    AVG(oli.unit_price) as avg_unit_price
FROM order_line_items oli
JOIN orders o ON oli.order_id = o.id
JOIN product_categories pc ON pc.product_id = oli.product_id
JOIN categories c ON pc.category_id = c.id
WHERE o.status NOT IN ('cancelled')
  AND c.level3 IS NOT NULL
GROUP BY c.store_id, DATE(o.creation_date), c.level2, c.level3;

-- Monthly sales by Level 3 category
CREATE OR REPLACE VIEW v_category_monthly_sales AS
SELECT
    c.store_id,
    DATE_TRUNC('month', o.creation_date) as sale_month,
    c.level2 as category_level2,
    c.level3 as category_level3,
    COUNT(DISTINCT o.id) as order_count,
    SUM(oli.quantity) as total_quantity,
    SUM(oli.total_price) as total_revenue,
    AVG(oli.unit_price) as avg_unit_price,
    COUNT(DISTINCT oli.product_id) as unique_products_sold
FROM order_line_items oli
JOIN orders o ON oli.order_id = o.id
JOIN product_categories pc ON pc.product_id = oli.product_id
JOIN categories c ON pc.category_id = c.id
WHERE o.status NOT IN ('cancelled')
  AND c.level3 IS NOT NULL
GROUP BY c.store_id, DATE_TRUNC('month', o.creation_date), c.level2, c.level3;

-- Category performance summary (for dashboard)
CREATE OR REPLACE VIEW v_category_performance AS
SELECT
    c.store_id,
    c.level2 as main_category,
    c.level3 as sub_category,
    COUNT(DISTINCT pc.product_id) as product_count,
    COALESCE(SUM(sales.total_quantity), 0) as total_quantity_sold,
    COALESCE(SUM(sales.total_revenue), 0) as total_revenue,
    COALESCE(AVG(sales.avg_order_value), 0) as avg_order_value
FROM categories c
LEFT JOIN product_categories pc ON pc.category_id = c.id
LEFT JOIN (
    SELECT
        oli.product_id,
        SUM(oli.quantity) as total_quantity,
        SUM(oli.total_price) as total_revenue,
        AVG(o.grand_total) as avg_order_value
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.id
    WHERE o.status NOT IN ('cancelled')
      AND o.creation_date >= NOW() - INTERVAL '30 days'
    GROUP BY oli.product_id
) sales ON sales.product_id = pc.product_id
WHERE c.level3 IS NOT NULL
GROUP BY c.store_id, c.level2, c.level3;

-- Top categories by revenue (last 30 days)
CREATE OR REPLACE VIEW v_top_categories AS
SELECT
    c.store_id,
    c.level3 as category,
    c.level2 as parent_category,
    c.display_name,
    SUM(oli.total_price) as revenue,
    SUM(oli.quantity) as units_sold,
    COUNT(DISTINCT o.id) as order_count,
    ROUND(AVG(oli.unit_price)::numeric, 2) as avg_price
FROM order_line_items oli
JOIN orders o ON oli.order_id = o.id
JOIN product_categories pc ON pc.product_id = oli.product_id
JOIN categories c ON pc.category_id = c.id
WHERE o.status NOT IN ('cancelled')
  AND o.creation_date >= NOW() - INTERVAL '30 days'
  AND c.level3 IS NOT NULL
GROUP BY c.store_id, c.level3, c.level2, c.display_name
ORDER BY revenue DESC;

-- ============================================
-- RPC: GET CATEGORY SUMMARY (many-to-many)
-- ============================================
CREATE OR REPLACE FUNCTION get_category_summary(
    p_store_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    category TEXT,
    parent_category TEXT,
    display_name TEXT,
    revenue DECIMAL,
    units_sold BIGINT,
    order_count BIGINT,
    revenue_share DECIMAL,
    trend_vs_previous DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_revenue DECIMAL;
BEGIN
    -- Calculate total revenue for share calculation
    SELECT COALESCE(SUM(oli.total_price), 0)
    INTO v_total_revenue
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.id
    WHERE o.store_id = p_store_id
      AND o.status NOT IN ('cancelled')
      AND o.creation_date >= NOW() - (p_days || ' days')::INTERVAL;

    RETURN QUERY
    WITH current_period AS (
        SELECT
            c.level3 as cat,
            c.level2 as parent_cat,
            c.display_name as disp_name,
            SUM(oli.total_price) as rev,
            SUM(oli.quantity) as units,
            COUNT(DISTINCT o.id) as orders
        FROM order_line_items oli
        JOIN orders o ON oli.order_id = o.id
        JOIN product_categories pc ON pc.product_id = oli.product_id
        JOIN categories c ON pc.category_id = c.id
        WHERE o.store_id = p_store_id
          AND o.status NOT IN ('cancelled')
          AND o.creation_date >= NOW() - (p_days || ' days')::INTERVAL
          AND c.level3 IS NOT NULL
        GROUP BY c.level3, c.level2, c.display_name
    ),
    previous_period AS (
        SELECT
            c.level3 as cat,
            SUM(oli.total_price) as rev
        FROM order_line_items oli
        JOIN orders o ON oli.order_id = o.id
        JOIN product_categories pc ON pc.product_id = oli.product_id
        JOIN categories c ON pc.category_id = c.id
        WHERE o.store_id = p_store_id
          AND o.status NOT IN ('cancelled')
          AND o.creation_date >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND o.creation_date < NOW() - (p_days || ' days')::INTERVAL
          AND c.level3 IS NOT NULL
        GROUP BY c.level3
    )
    SELECT
        cp.cat,
        cp.parent_cat,
        cp.disp_name,
        cp.rev,
        cp.units,
        cp.orders,
        CASE WHEN v_total_revenue > 0
             THEN ROUND((cp.rev / v_total_revenue * 100)::numeric, 1)
             ELSE 0
        END as rev_share,
        CASE WHEN pp.rev > 0
             THEN ROUND(((cp.rev - pp.rev) / pp.rev * 100)::numeric, 1)
             ELSE NULL
        END as trend
    FROM current_period cp
    LEFT JOIN previous_period pp ON pp.cat = cp.cat
    ORDER BY cp.rev DESC;
END;
$$;

COMMENT ON FUNCTION get_category_summary IS 'Get category sales summary with trend vs previous period (many-to-many)';
