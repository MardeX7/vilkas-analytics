-- Fix the remaining joins that go through order_line_items.product_id
--
-- order_line_items.product_id is NULL on all 44 888 rows, so every
-- `... ON p.id = oli.product_id` matches nothing. 20260916_fix_cost_join_and_
-- margin_basis.sql fixed the KPI path; this migration fixes the two places that
-- were left: the margin branch of calculate_goal_progress and the category
-- views. Both join on (store_id, product_number) instead. store_id is required:
-- 238 product numbers exist in both stores, so without it Automaalit would read
-- Billackering's cost prices and revenue.
--
-- Measured before this migration (17.9.2026, production):
--   calculate_goal_progress(margin)  ERROR: column p.sku does not exist
--   get_category_summary             0 rows
--   v_category_daily_sales           0 rows
--   v_top_categories                 0 rows
--   v_category_performance          55 rows, total_revenue = 0 on every one

-- net_factor() comes from 20260916_fix_cost_join_and_margin_basis.sql. A missing
-- function is not detected when the body below is created, only when a margin
-- goal is first calculated, so fail here instead.
DO $$
BEGIN
  IF to_regprocedure('net_factor(numeric,numeric,numeric)') IS NULL THEN
    RAISE EXCEPTION 'Run 20260916_fix_cost_join_and_margin_basis.sql first: net_factor() is missing';
  END IF;
END $$;

-- ============================================================================
-- 1. calculate_goal_progress: margin branch
--
-- The branch joined `p.sku = li.product_sku`. Neither column exists: products
-- has product_number and order_line_items has product_number. The statement
-- therefore raised "column p.sku does not exist", which aborts the whole
-- function - including the revenue, orders and aov goals it had already
-- calculated in the same loop. src/hooks/useMerchantGoals.js:16 calls this
-- before loading the goals, so the first margin goal a merchant creates would
-- have emptied the whole goal card. No margin goal existed yet, which is the
-- only reason this never fired.
--
-- The margin basis is the same as calculate_core_metrics and
-- api/cron/calculate-kpi.js: line-level sales net of VAT, cost from
-- products.cost_price (which excludes VAT), true quantity from
-- total_price / unit_price because quantity is rounded to whole units, and the
-- store's measured margin as the assumption for lines whose product is no longer
-- in the catalogue and for orders that have no lines at all.
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_goal_progress(
  p_store_id UUID,
  p_goal_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_goal RECORD;
  v_current DECIMAL;
  v_progress DECIMAL;
  v_start_date DATE;
  v_end_date DATE;
  v_updated_count INT := 0;
BEGIN
  FOR v_goal IN
    SELECT * FROM merchant_goals
    WHERE store_id = p_store_id
      AND is_active = TRUE
      AND (p_goal_id IS NULL OR id = p_goal_id)
  LOOP
    -- Calculate date range from period_label
    IF v_goal.period_type = 'monthly' THEN
      -- period_label format: '2026-01'
      v_start_date := (v_goal.period_label || '-01')::DATE;
      v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSIF v_goal.period_type = 'quarterly' THEN
      -- period_label format: '2026-Q1'
      v_start_date := CASE
        WHEN v_goal.period_label LIKE '%-Q1' THEN (LEFT(v_goal.period_label, 4) || '-01-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q2' THEN (LEFT(v_goal.period_label, 4) || '-04-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q3' THEN (LEFT(v_goal.period_label, 4) || '-07-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q4' THEN (LEFT(v_goal.period_label, 4) || '-10-01')::DATE
      END;
      v_end_date := (v_start_date + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
    ELSIF v_goal.period_type = 'yearly' THEN
      -- period_label format: '2026'
      v_start_date := (v_goal.period_label || '-01-01')::DATE;
      v_end_date := (v_goal.period_label || '-12-31')::DATE;
    END IF;

    -- Calculate current value based on goal_type
    IF v_goal.goal_type = 'revenue' THEN
      -- Use grand_total (includes shipping, taxes, discounts) instead of line_items
      SELECT COALESCE(SUM(o.grand_total), 0) INTO v_current
      FROM orders o
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date
        AND o.status NOT IN ('cancelled');

    ELSIF v_goal.goal_type = 'orders' THEN
      SELECT COUNT(*)::DECIMAL INTO v_current
      FROM orders o
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date
        AND o.status NOT IN ('cancelled');

    ELSIF v_goal.goal_type = 'aov' THEN
      SELECT COALESCE(AVG(o.grand_total), 0) INTO v_current
      FROM orders o
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date
        AND o.status NOT IN ('cancelled');

    ELSIF v_goal.goal_type = 'margin' THEN
      SELECT COALESCE(
               (SUM(m.net_sales) - SUM(m.cost)) / NULLIF(SUM(m.net_sales), 0) * 100,
               0)
      INTO v_current
      FROM (
        -- Orders that have line items: margin per line.
        SELECT
          oli.total_price * net_factor(o.grand_total, o.total_before_tax, o.total_tax) AS net_sales,
          CASE
            WHEN pc.cost_price IS NOT NULL AND pc.cost_price > 0
            -- quantity is rounded to whole units; the real amount is
            -- total_price / unit_price (paints sold by the litre)
            THEN COALESCE(oli.total_price / NULLIF(oli.unit_price, 0), oli.quantity) * pc.cost_price
            -- No cost price (products no longer in the catalogue, 5-6 % of net line
            -- revenue): assume the store's own measured margin on the line's net
            -- value. Same constant as calculate_core_metrics and
            -- api/cron/calculate-kpi.js:223.
            ELSE oli.total_price * net_factor(o.grand_total, o.total_before_tax, o.total_tax) * 0.4
          END AS cost
        FROM orders o
        JOIN order_line_items oli ON oli.order_id = o.id
        -- LATERAL + LIMIT 1: product_number is not unique within a store
        -- (FI 464 rows / 463 numbers, SE 478 / 476), so a plain join would
        -- duplicate those lines. Keep the higher cost price so a stale row
        -- cannot flatter the margin.
        LEFT JOIN LATERAL (
          SELECT p.cost_price
          FROM products p
          WHERE p.store_id = o.store_id
            AND p.product_number = oli.product_number
          ORDER BY p.cost_price DESC NULLS LAST, p.id
          LIMIT 1
        ) pc ON TRUE
        WHERE o.store_id = p_store_id
          AND o.creation_date::DATE >= v_start_date
          AND o.creation_date::DATE <= v_end_date
          AND o.status NOT IN ('cancelled')

        UNION ALL

        -- Orders with no line items at all (1 953 in Billackering before
        -- 26.7.2025) would otherwise drop out and show the period at almost
        -- 100 % margin. Same assumption as above.
        SELECT
          o.grand_total * net_factor(o.grand_total, o.total_before_tax, o.total_tax),
          o.grand_total * net_factor(o.grand_total, o.total_before_tax, o.total_tax) * 0.4
        FROM orders o
        WHERE o.store_id = p_store_id
          AND o.creation_date::DATE >= v_start_date
          AND o.creation_date::DATE <= v_end_date
          AND o.status NOT IN ('cancelled')
          AND NOT EXISTS (SELECT 1 FROM order_line_items oli WHERE oli.order_id = o.id)
      ) m;

    -- conversion would need GA4 data, skip for now
    ELSE
      v_current := 0;
    END IF;

    -- Calculate progress percent
    IF v_goal.target_value > 0 THEN
      v_progress := LEAST((v_current / v_goal.target_value) * 100, 999); -- Cap at 999%
    ELSE
      v_progress := 0;
    END IF;

    -- Update goal
    UPDATE merchant_goals
    SET current_value = ROUND(v_current, 2),
        progress_percent = ROUND(v_progress, 1),
        last_calculated_at = NOW(),
        updated_at = NOW()
    WHERE id = v_goal.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_goal_progress TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_goal_progress TO service_role;

-- ============================================================================
-- 2. Category views
--
-- All of them reached the category tree through
-- `JOIN product_categories pc ON pc.product_id = oli.product_id`, which is dead.
-- The route is now line item -> (store_id, product_number) -> products ->
-- product_categories -> categories.
--
-- SEMANTICS, unchanged and now written down: a product that belongs to several
-- categories books its full revenue in each of them. 331 products are in more
-- than one category, so the category rows add up to more than the store's line
-- revenue - measured at 1,7x in both stores on 30 days. That is deliberate: a
-- row answers "how much did this category sell", not "how does revenue split
-- across categories". It also means the rows must never be summed into a store
-- total.
--
-- What is NOT deliberate, and is what the DISTINCT in each lateral prevents, is
-- the same revenue landing twice inside ONE output row. Two ways that happens
-- here:
--   * a product_number that appears on two products rows (FI 464 rows / 463
--     numbers, SE 478 / 476) carrying the same category;
--   * two different categories rows that fall into the same output group.
--     categories.level3 holds only the third path segment, so every fourth-level
--     child collapses onto its parent's (level2, level3). Production has 13 such
--     groups, 10 FI products sit in both a parent and one of its children, and
--     Billackering has two rows that agree on display_name as well
--     (Categories/Billack/Akrylfärg and .../Akrylfärg/Akrylfaerg).
-- So each lateral selects DISTINCT exactly the columns its view groups by: a
-- line item contributes at most once per output row, whatever shape the
-- taxonomy has.
--
-- One consequence, inherited from 010_product_categories.sql and left as it is:
-- the five objects do not group at the same granularity. The daily, monthly and
-- performance views group by (level2, level3), so a parent and its fourth-level
-- child are ONE row there. v_top_categories and get_category_summary carry
-- display_name in the GROUP BY, so the same pair is TWO rows and the product's
-- revenue books in both. Reading the daily view and the summary RPC for the same
-- day therefore gives two different answers for a product that sits in both, and
-- the coarser views are the ones that count it once. This was decided when those
-- GROUP BY lists were written; the dead join just meant nobody could see it.
-- ============================================================================

-- Daily sales by Level 3 category (e.g., Akrylfärg, Klarlack)
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
JOIN LATERAL (
    SELECT DISTINCT cat.store_id, cat.level2, cat.level3
    FROM products p
    JOIN product_categories pc ON pc.product_id = p.id
    JOIN categories cat ON cat.id = pc.category_id AND cat.store_id = p.store_id
    WHERE p.store_id = o.store_id
      AND p.product_number = oli.product_number
      AND cat.level3 IS NOT NULL
) c ON TRUE
WHERE o.status NOT IN ('cancelled')
GROUP BY c.store_id, DATE(o.creation_date), c.level2, c.level3;

COMMENT ON VIEW v_category_daily_sales IS
  'Daily revenue per level3 category. A product in several categories books its full revenue in each, so these rows do not sum to a store total.';

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
    -- was COUNT(DISTINCT oli.product_id), which counted NULLs and was always 0
    COUNT(DISTINCT oli.product_number) as unique_products_sold
FROM order_line_items oli
JOIN orders o ON oli.order_id = o.id
JOIN LATERAL (
    SELECT DISTINCT cat.store_id, cat.level2, cat.level3
    FROM products p
    JOIN product_categories pc ON pc.product_id = p.id
    JOIN categories cat ON cat.id = pc.category_id AND cat.store_id = p.store_id
    WHERE p.store_id = o.store_id
      AND p.product_number = oli.product_number
      AND cat.level3 IS NOT NULL
) c ON TRUE
WHERE o.status NOT IN ('cancelled')
GROUP BY c.store_id, DATE_TRUNC('month', o.creation_date), c.level2, c.level3;

COMMENT ON VIEW v_category_monthly_sales IS
  'Monthly revenue per level3 category. A product in several categories books its full revenue in each, so these rows do not sum to a store total.';

-- Category performance summary (for dashboard)
-- Starts from the distinct (store, level2, level3) groups rather than from
-- categories rows, so the fourth-level children that share a group contribute
-- their products once, not once per row.
CREATE OR REPLACE VIEW v_category_performance AS
SELECT
    c.store_id,
    c.level2 as main_category,
    c.level3 as sub_category,
    -- counted per product_number, not per products.id: a product number that
    -- appears twice in the catalogue is one product, not two
    COUNT(DISTINCT pn.product_number) as product_count,
    COALESCE(SUM(sales.total_quantity), 0) as total_quantity_sold,
    COALESCE(SUM(sales.total_revenue), 0) as total_revenue,
    COALESCE(AVG(sales.avg_order_value), 0) as avg_order_value
FROM (
    SELECT DISTINCT store_id, level2, level3
    FROM categories
    WHERE level3 IS NOT NULL
) c
LEFT JOIN LATERAL (
    SELECT DISTINCT p.product_number
    FROM categories cat
    JOIN product_categories pc ON pc.category_id = cat.id
    JOIN products p ON p.id = pc.product_id AND p.store_id = cat.store_id
    WHERE cat.store_id = c.store_id
      AND cat.level2 IS NOT DISTINCT FROM c.level2
      AND cat.level3 = c.level3
      AND p.product_number IS NOT NULL
) pn ON TRUE
LEFT JOIN (
    SELECT
        o.store_id,
        oli.product_number,
        SUM(oli.quantity) as total_quantity,
        SUM(oli.total_price) as total_revenue,
        AVG(o.grand_total) as avg_order_value
    FROM order_line_items oli
    JOIN orders o ON oli.order_id = o.id
    WHERE o.status NOT IN ('cancelled')
      AND o.creation_date >= NOW() - INTERVAL '30 days'
    GROUP BY o.store_id, oli.product_number
) sales ON sales.store_id = c.store_id AND sales.product_number = pn.product_number
GROUP BY c.store_id, c.level2, c.level3;

COMMENT ON VIEW v_category_performance IS
  'Per-category product count and last 30 days of sales. A product in several categories books its full revenue in each, so these rows do not sum to a store total.';

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
JOIN LATERAL (
    -- display_name is in the DISTINCT list because it is in the GROUP BY below
    SELECT DISTINCT cat.store_id, cat.level2, cat.level3, cat.display_name
    FROM products p
    JOIN product_categories pc ON pc.product_id = p.id
    JOIN categories cat ON cat.id = pc.category_id AND cat.store_id = p.store_id
    WHERE p.store_id = o.store_id
      AND p.product_number = oli.product_number
      AND cat.level3 IS NOT NULL
) c ON TRUE
WHERE o.status NOT IN ('cancelled')
  AND o.creation_date >= NOW() - INTERVAL '30 days'
GROUP BY c.store_id, c.level3, c.level2, c.display_name
ORDER BY revenue DESC;

COMMENT ON VIEW v_top_categories IS
  'Last 30 days of revenue per category row. A product in several categories books its full revenue in each, so these rows do not sum to a store total.';

-- ============================================
-- RPC: GET CATEGORY SUMMARY (many-to-many)
-- This is the one the app actually calls (src/hooks/useCategories.js:25 ->
-- src/pages/Dashboard.jsx:473, which hides the section when it returns nothing).
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
    -- Share is measured against ALL line revenue in the store, not against the
    -- sum of the category rows: the category rows overlap, the store total does
    -- not. Uncategorised sales therefore lower every category's share, and the
    -- shares add up to more than 100 % where products sit in several categories.
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
        JOIN LATERAL (
            SELECT DISTINCT cat.level2, cat.level3, cat.display_name
            FROM products p
            JOIN product_categories pc ON pc.product_id = p.id
            JOIN categories cat ON cat.id = pc.category_id AND cat.store_id = p.store_id
            WHERE p.store_id = o.store_id
              AND p.product_number = oli.product_number
              AND cat.level3 IS NOT NULL
        ) c ON TRUE
        WHERE o.store_id = p_store_id
          AND o.status NOT IN ('cancelled')
          AND o.creation_date >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY c.level3, c.level2, c.display_name
    ),
    previous_period AS (
        -- Grouped by level3 alone, so the lateral deduplicates on level3 alone:
        -- otherwise a product sitting in both a parent and its fourth-level
        -- child would count its previous-period revenue twice and halve the
        -- trend.
        SELECT
            c.level3 as cat,
            SUM(oli.total_price) as rev
        FROM order_line_items oli
        JOIN orders o ON oli.order_id = o.id
        JOIN LATERAL (
            SELECT DISTINCT cat.level3
            FROM products p
            JOIN product_categories pc ON pc.product_id = p.id
            JOIN categories cat ON cat.id = pc.category_id AND cat.store_id = p.store_id
            WHERE p.store_id = o.store_id
              AND p.product_number = oli.product_number
              AND cat.level3 IS NOT NULL
        ) c ON TRUE
        WHERE o.store_id = p_store_id
          AND o.status NOT IN ('cancelled')
          AND o.creation_date >= NOW() - (p_days * 2 || ' days')::INTERVAL
          AND o.creation_date < NOW() - (p_days || ' days')::INTERVAL
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

COMMENT ON FUNCTION get_category_summary IS 'Get category sales summary with trend vs previous period (many-to-many). A product in several categories books its full revenue in each, so the rows do not sum to a store total and revenue_share can exceed 100 %.';
-- ============================================================================
-- 3. v_product_sales (001_initial_schema.sql:239)
--
-- Same dead join. Two further fixes while the definition is being rewritten:
--   * sales attach to one canonical products row per (store_id, product_number),
--     so a duplicated catalogue row does not book the same line items twice;
--   * cancelled orders are now excluded. The status test used to sit in the
--     LEFT JOIN condition, where it only nulled the order and left the line item
--     in the sum, so cancelled orders counted in full.
-- No caller in the app reads this view today; it is fixed because a wrong view
-- is worse than a missing one.
-- ============================================================================
CREATE OR REPLACE VIEW v_product_sales AS
SELECT
    p.store_id,
    p.id as product_id,
    p.name as product_name,
    p.category_name,
    COALESCE(s.order_count, 0) as order_count,
    COALESCE(s.total_quantity_sold, 0) as total_quantity_sold,
    COALESCE(s.total_revenue, 0) as total_revenue
FROM products p
LEFT JOIN LATERAL (
    SELECT
        COUNT(DISTINCT oli.order_id) as order_count,
        SUM(oli.quantity) as total_quantity_sold,
        SUM(oli.total_price) as total_revenue
    FROM order_line_items oli
    JOIN orders o ON o.id = oli.order_id
    WHERE o.store_id = p.store_id
      AND oli.product_number = p.product_number
      AND o.status NOT IN ('cancelled')
      -- Canonical row = lowest id, deliberately NOT the same rule as the cost
      -- join above (highest cost_price). This one only decides which row a
      -- number's sales are shown on, and an id does not move when a cost price
      -- is edited; the cost join needs the price itself.
      AND p.id = (
          SELECT p2.id FROM products p2
          WHERE p2.store_id = p.store_id
            AND p2.product_number = p.product_number
          ORDER BY p2.id
          LIMIT 1
      )
) s ON TRUE;

COMMENT ON VIEW v_product_sales IS
  'Sales per product, joined on (store_id, product_number) because order_line_items.product_id is NULL. Where a product number appears twice in a store, the sales land on the lower id and the other row shows zero.';
