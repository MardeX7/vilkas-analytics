-- =============================================================================
-- One gross margin definition in SQL, the same as src/lib/margin.js
-- =============================================================================
--
-- The sales page and the KPI snapshots price order lines through
-- src/lib/margin.js since dedad8e. The database functions behind the customers
-- page (segment margin), goal progress, the category chart and the core-metrics
-- helpers still had their own rules: VAT-inclusive line totals, the rounded
-- quantity, a 0.6 cost fallback, and no handling of orders stored net. The
-- customers page showed Automaalit's August 2026 B2C margin as 68 % where the
-- sales page and the Indicators page show 61 %.
--
-- priced_margin_rows() is the SQL twin of priceOrderLines()/marginTotals():
--   * sales net of VAT from the order's own split; lines stored net (B2B net price
--     display) are recognised when they add up to total_before_tax, or to it minus
--     a store shipping price net of VAT, unless they also add up to grand_total or
--     grand_total minus a shipping price (then the VAT-inclusive reading wins)
--   * cost = cost_price * ordered amount (total_price / unit_price; quantity is
--     rounded), the higher cost_price when a product_number occurs twice
--   * 40 % assumed cost without a cost price, or on a charged line whose cost is
--     over 10x its sales (early-2025 lines store ml/m as the quantity); free
--     BONUS lines keep their real cost
--   * an order without line items counts at its net value with the assumed cost
-- Keep margin_pricing() in step with PRICING in src/lib/margin.js.
--
-- Verified before applying: margin_totals() equals the sales-page card for
-- Automaalit and Billackering in 2026-07, 2026-08 and week 2026-09-21..27.
-- =============================================================================

-- VAT divisor for orders with no net/tax split, and the shop's VAT-inclusive
-- shipping prices. By currency, from shops (shops.store_id is text).
CREATE OR REPLACE FUNCTION public.margin_pricing(p_store_id uuid)
RETURNS TABLE(vat_rate numeric, shipping_prices numeric[])
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT
        CASE WHEN s.currency = 'SEK' THEN 1.25 ELSE 1.255 END,
        CASE WHEN s.currency = 'SEK'
             THEN ARRAY[95, 99, 190, 199]::numeric[]
             ELSE ARRAY[9.90, 17.90, 39.90]::numeric[] END
    FROM (SELECT (SELECT currency FROM shops WHERE store_id = p_store_id::text LIMIT 1) AS currency) s
$$;

-- Every priced line of the store's non-cancelled orders in [p_from, p_to), plus one
-- row per order that has no line items (has_lines = false, product_number NULL).
CREATE OR REPLACE FUNCTION public.priced_margin_rows(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(
    order_id uuid,
    creation_date timestamptz,
    is_b2b boolean,
    is_b2b_soft boolean,
    customer_id uuid,
    product_number text,
    quantity numeric,
    sales numeric,
    cost numeric,
    measured boolean,
    has_lines boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
    WITH pr AS (
        SELECT * FROM margin_pricing(p_store_id)
    ),
    o AS (
        SELECT
            o.id, o.creation_date, o.is_b2b, o.is_b2b_soft, o.customer_id,
            COALESCE(o.grand_total, 0) AS gross,
            o.total_before_tax AS net_raw,
            COALESCE(o.total_before_tax,
                     CASE WHEN o.total_tax > 0 THEN o.grand_total - o.total_tax END) AS net_split
        FROM orders o
        WHERE o.store_id = p_store_id
          AND o.creation_date >= p_from
          AND o.creation_date < p_to
          AND o.status <> 'cancelled'
    ),
    lines AS (
        SELECT
            oli.order_id,
            oli.product_number,
            COALESCE(oli.quantity, 0)::numeric AS quantity,
            COALESCE(oli.total_price, 0) AS total_price,
            COALESCE(oli.unit_price, 0) AS unit_price
        FROM order_line_items oli
        JOIN o ON o.id = oli.order_id
    ),
    line_sum AS (
        SELECT l.order_id, SUM(l.total_price) AS s FROM lines l GROUP BY l.order_id
    ),
    costs AS (
        SELECT p.product_number, MAX(COALESCE(p.cost_price, 0)) AS cost_price
        FROM products p
        WHERE p.store_id = p_store_id AND p.product_number IS NOT NULL
        GROUP BY p.product_number
    ),
    f AS (
        SELECT
            o.*,
            ls.s AS line_sum,
            CASE WHEN o.gross > 0 AND o.net_split > 0 AND o.net_split <= o.gross
                 THEN o.net_split / o.gross
                 ELSE 1 / pr.vat_rate END AS net_factor,
            COALESCE(
                ls.s IS NOT NULL
                AND o.net_raw > 0 AND o.net_raw < o.gross
                AND NOT (abs(o.gross - ls.s) < 0.02
                         OR EXISTS (SELECT 1 FROM unnest(pr.shipping_prices) sp
                                    WHERE abs(o.gross - ls.s - sp) < 0.02))
                AND (abs(o.net_raw - ls.s) < 0.02
                     OR EXISTS (SELECT 1 FROM unnest(pr.shipping_prices) sp
                                WHERE abs((o.net_raw - ls.s) * o.gross / o.net_raw - sp) < 0.02)),
                FALSE) AS stored_net
        FROM o
        CROSS JOIN pr
        LEFT JOIN line_sum ls ON ls.order_id = o.id
    ),
    priced AS (
        SELECT
            f.id AS order_id, f.creation_date, f.is_b2b, f.is_b2b_soft, f.customer_id,
            l.product_number, l.quantity,
            l.total_price * CASE WHEN f.stored_net THEN 1 ELSE f.net_factor END AS sales,
            COALESCE(c.cost_price, 0) AS cost_price,
            COALESCE(c.cost_price, 0)
              * CASE WHEN l.unit_price > 0 THEN l.total_price / l.unit_price ELSE l.quantity END AS line_cost
        FROM f
        JOIN lines l ON l.order_id = f.id
        LEFT JOIN costs c ON c.product_number = l.product_number
    )
    SELECT
        p.order_id, p.creation_date, p.is_b2b, p.is_b2b_soft, p.customer_id,
        p.product_number, p.quantity, p.sales,
        CASE WHEN p.cost_price > 0 AND NOT (p.sales > 0 AND p.line_cost > p.sales * 10)
             THEN p.line_cost ELSE p.sales * 0.4 END,
        p.cost_price > 0 AND NOT (p.sales > 0 AND p.line_cost > p.sales * 10),
        TRUE
    FROM priced p
    UNION ALL
    SELECT
        f.id, f.creation_date, f.is_b2b, f.is_b2b_soft, f.customer_id,
        NULL, 0, f.gross * f.net_factor, f.gross * f.net_factor * 0.4, FALSE, FALSE
    FROM f
    WHERE f.line_sum IS NULL
$$;

-- Margin over [p_from, p_to). measured_share: share of sales priced with a real
-- cost_price (under 0.5 = mostly the assumption; the app calls that estimated).
CREATE OR REPLACE FUNCTION public.margin_totals(p_store_id uuid, p_from timestamptz, p_to timestamptz)
RETURNS TABLE(sales numeric, cost numeric, gross_profit numeric, margin_percent numeric, measured_share numeric)
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT
        COALESCE(SUM(r.sales), 0),
        COALESCE(SUM(r.cost), 0),
        COALESCE(SUM(r.sales - r.cost), 0),
        CASE WHEN SUM(r.sales) > 0 THEN SUM(r.sales - r.cost) / SUM(r.sales) * 100 ELSE 0 END,
        CASE WHEN SUM(r.sales) > 0
             THEN COALESCE(SUM(r.sales) FILTER (WHERE r.measured), 0) / SUM(r.sales)
             ELSE 0 END
    FROM priced_margin_rows(p_store_id, p_from, p_to) r
$$;

-- The helpers are called only from the SECURITY DEFINER functions below, which run
-- as the owner. Called directly they are SECURITY INVOKER and RLS-filtered anyway;
-- there is no reason to expose them as RPC endpoints to the public roles.
REVOKE ALL ON FUNCTION public.margin_pricing(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.priced_margin_rows(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.margin_totals(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Customers page: segment summary. Revenue is now net sales (like the rest of the
-- app) and orders without line items count at their net value, so the segments add
-- up to the sales page's margin card for the same dates.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_segment_summary(p_store_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(segment text, order_count bigint, total_revenue numeric, total_cost numeric, gross_margin numeric, margin_percent numeric, avg_order_value numeric, unique_customers bigint, revenue_share numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM priced_margin_rows(
      p_store_id,
      p_start_date::timestamp AT TIME ZONE 'UTC',
      (p_end_date + 1)::timestamp AT TIME ZONE 'UTC')
  ),
  seg AS (
    SELECT
      CASE
        WHEN r.is_b2b = TRUE THEN 'B2B'
        WHEN r.is_b2b_soft = TRUE THEN 'B2B (soft)'
        ELSE 'B2C'
      END AS seg_name,
      r.*
    FROM r
  ),
  tot AS (
    SELECT COALESCE(SUM(r.sales), 0) AS s FROM r
  )
  SELECT
    seg.seg_name,
    COUNT(DISTINCT seg.order_id)::BIGINT,
    ROUND(COALESCE(SUM(seg.sales), 0), 2),
    ROUND(COALESCE(SUM(seg.cost), 0), 2),
    ROUND(COALESCE(SUM(seg.sales - seg.cost), 0), 2),
    CASE WHEN COALESCE(SUM(seg.sales), 0) > 0
         THEN ROUND(SUM(seg.sales - seg.cost) / SUM(seg.sales) * 100, 1)
         ELSE 0 END,
    ROUND(COALESCE(SUM(seg.sales) / NULLIF(COUNT(DISTINCT seg.order_id), 0), 0), 2),
    COUNT(DISTINCT seg.customer_id)::BIGINT,
    CASE WHEN (SELECT tot.s FROM tot) > 0
         THEN ROUND(COALESCE(SUM(seg.sales), 0) / (SELECT tot.s FROM tot) * 100, 1)
         ELSE 0 END
  FROM seg
  GROUP BY seg.seg_name
  ORDER BY seg.seg_name;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Sales page category chart. Net sales (the page is VAT 0 %), and both windows are
-- whole synced days: orders arrive with the 06:00 UTC sync, so a window ending "now"
-- set part of a day against a full previous window and read as a drop.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_category_summary(p_store_id uuid, p_days integer DEFAULT 30)
 RETURNS TABLE(category text, parent_category text, display_name text, revenue numeric, units_sold bigint, order_count bigint, revenue_share numeric, trend_vs_previous numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_total_revenue DECIMAL;
    v_last DATE;
    v_cur_from TIMESTAMPTZ;
    v_cur_to TIMESTAMPTZ;
    v_prev_from TIMESTAMPTZ;
BEGIN
    -- Last day whose orders are all in (same rule as the date picker)
    v_last := (now() AT TIME ZONE 'UTC')::date
              - CASE WHEN extract(hour FROM now() AT TIME ZONE 'UTC') < 7 THEN 2 ELSE 1 END;
    v_cur_to := (v_last + 1)::timestamp AT TIME ZONE 'UTC';
    v_cur_from := (v_last + 1 - p_days)::timestamp AT TIME ZONE 'UTC';
    v_prev_from := (v_last + 1 - 2 * p_days)::timestamp AT TIME ZONE 'UTC';

    -- Share is measured against ALL line revenue in the store, not against the
    -- sum of the category rows: the category rows overlap, the store total does
    -- not. Uncategorised sales therefore lower every category's share, and the
    -- shares add up to more than 100 % where products sit in several categories.
    SELECT COALESCE(SUM(r.sales), 0)
    INTO v_total_revenue
    FROM priced_margin_rows(p_store_id, v_cur_from, v_cur_to) r
    WHERE r.has_lines;

    RETURN QUERY
    WITH current_period AS (
        SELECT
            c.level3 as cat,
            c.level2 as parent_cat,
            c.display_name as disp_name,
            SUM(r.sales) as rev,
            SUM(r.quantity)::BIGINT as units,
            COUNT(DISTINCT r.order_id) as orders
        FROM priced_margin_rows(p_store_id, v_cur_from, v_cur_to) r
        JOIN LATERAL (
            SELECT DISTINCT cat.level2, cat.level3, cat.display_name
            FROM products p
            JOIN product_categories pc ON pc.product_id = p.id
            JOIN categories cat ON cat.id = pc.category_id AND cat.store_id = p.store_id
            WHERE p.store_id = p_store_id
              AND p.product_number = r.product_number
              AND cat.level3 IS NOT NULL
        ) c ON TRUE
        WHERE r.has_lines
        GROUP BY c.level3, c.level2, c.display_name
    ),
    previous_period AS (
        -- Grouped by level3 alone, so the lateral deduplicates on level3 alone:
        -- otherwise a product sitting in both a parent and its fourth-level
        -- child would count its previous-period revenue twice and halve the
        -- trend.
        SELECT
            c.level3 as cat,
            SUM(r.sales) as rev
        FROM priced_margin_rows(p_store_id, v_prev_from, v_cur_from) r
        JOIN LATERAL (
            SELECT DISTINCT cat.level3
            FROM products p
            JOIN product_categories pc ON pc.product_id = p.id
            JOIN categories cat ON cat.id = pc.category_id AND cat.store_id = p.store_id
            WHERE p.store_id = p_store_id
              AND p.product_number = r.product_number
              AND cat.level3 IS NOT NULL
        ) c ON TRUE
        WHERE r.has_lines
        GROUP BY c.level3
    )
    SELECT
        cp.cat,
        cp.parent_cat,
        cp.disp_name,
        ROUND(cp.rev, 2),
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
$function$;

-- -----------------------------------------------------------------------------
-- Goal progress: only the margin branch changes, to margin_totals(). Revenue and
-- AOV goals stay on grand_total: their targets were set against that figure.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_goal_progress(p_store_id uuid, p_goal_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      -- The app's margin definition (src/lib/margin.js), via priced_margin_rows()
      SELECT COALESCE(m.margin_percent, 0) INTO v_current
      FROM margin_totals(
        p_store_id,
        v_start_date::timestamp AT TIME ZONE 'UTC',
        (v_end_date + 1)::timestamp AT TIME ZONE 'UTC') m;

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
$function$;

-- -----------------------------------------------------------------------------
-- Core metrics (supabase/functions/daily-kpi-snapshot): margin via margin_totals().
-- The period now includes p_period_end: DATE bounds compared to a timestamptz with
-- <= stopped at midnight, so the last day was left out of every figure here.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_core_metrics(p_store_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result JSONB;
    v_from TIMESTAMPTZ := p_period_start::timestamp AT TIME ZONE 'UTC';
    v_to TIMESTAMPTZ := (p_period_end + 1)::timestamp AT TIME ZONE 'UTC';
    v_revenue DECIMAL;
    v_revenue_net DECIMAL;
    v_cost DECIMAL;
    v_gross_profit DECIMAL;
    v_margin_percent DECIMAL;
    v_order_count INTEGER;
    v_aov DECIMAL;
    v_total_customers INTEGER;
    v_repeat_customers INTEGER;
    v_repeat_rate DECIMAL;
    v_out_of_stock_count INTEGER;
    v_total_products INTEGER;
    v_out_of_stock_percent DECIMAL;
BEGIN
    -- Myynti (ALV:llinen) ja tilausmaara
    SELECT
        COALESCE(SUM(o.grand_total), 0),
        COUNT(*)
    INTO v_revenue, v_order_count
    FROM orders o
    WHERE o.store_id = p_store_id
      AND o.creation_date >= v_from
      AND o.creation_date < v_to
      AND o.status NOT IN ('cancelled');

    -- Kate: sovelluksen maaritelma (src/lib/margin.js) priced_margin_rows():n kautta
    SELECT m.sales, m.cost, m.gross_profit, m.margin_percent
    INTO v_revenue_net, v_cost, v_gross_profit, v_margin_percent
    FROM margin_totals(p_store_id, v_from, v_to) m;

    -- AOV
    v_aov := CASE WHEN v_order_count > 0 THEN v_revenue / v_order_count ELSE 0 END;

    -- Repeat Purchase Rate
    SELECT
        COUNT(DISTINCT customer_id),
        COUNT(DISTINCT CASE WHEN order_count > 1 THEN customer_id END)
    INTO v_total_customers, v_repeat_customers
    FROM (
        SELECT customer_id, COUNT(*) as order_count
        FROM orders
        WHERE store_id = p_store_id
          AND creation_date >= v_from
          AND creation_date < v_to
          AND status NOT IN ('cancelled')
          AND customer_id IS NOT NULL
        GROUP BY customer_id
    ) customer_orders;

    v_repeat_rate := CASE WHEN v_total_customers > 0
        THEN (v_repeat_customers::DECIMAL / v_total_customers) * 100
        ELSE 0 END;

    -- Out of Stock
    -- HUOM: Lasketaan vain tuotteet joilla on oikeasti varastoseuranta:
    -- 1. Tuotteet joilla stock_level > 0 (ei variaatioiden päätuotteet tai paketit)
    -- 2. TAI tuotteet jotka on myyty erikseen (order_line_items)
    -- Päätuotteet variaatioilla ja paketit eivät seuraa omaa saldoa
    WITH tracked_products AS (
        SELECT DISTINCT p.id, p.stock_level
        FROM products p
        WHERE p.store_id = p_store_id
          AND p.for_sale = true
          AND (
              -- Tuotteella on saldo = seuraa varastoa
              p.stock_level > 0
              OR
              -- TAI tuote on myyty erikseen (ei ole vain paketin osa)
              EXISTS (
                  SELECT 1 FROM order_line_items oli
                  JOIN orders o ON o.id = oli.order_id
                  WHERE oli.product_number = p.product_number
                    AND o.store_id = p_store_id
                    AND o.status NOT IN ('cancelled')
              )
          )
    )
    SELECT
        COUNT(*) FILTER (WHERE stock_level = 0),
        COUNT(*)
    INTO v_out_of_stock_count, v_total_products
    FROM tracked_products;

    v_out_of_stock_percent := CASE WHEN v_total_products > 0
        THEN (v_out_of_stock_count::DECIMAL / v_total_products) * 100
        ELSE 0 END;

    -- Rakenna tulos
    v_result := jsonb_build_object(
        'revenue', ROUND(v_revenue::NUMERIC, 2),
        'cost', ROUND(v_cost::NUMERIC, 2),
        'gross_profit', ROUND(v_gross_profit::NUMERIC, 2),
        'revenue_net', ROUND(v_revenue_net::NUMERIC, 2),
        -- Alias for revenue_net: supabase/functions/daily-kpi-snapshot writes this
        -- object into kpi_index_snapshots.raw_metrics.core, where
        -- src/hooks/useKPIDashboard.js reads total_revenue (net, like gross_profit).
        'total_revenue', ROUND(v_revenue_net::NUMERIC, 2),
        'margin_percent', ROUND(v_margin_percent::NUMERIC, 2),
        'order_count', v_order_count,
        'aov', ROUND(v_aov::NUMERIC, 2),
        'total_customers', v_total_customers,
        'repeat_customers', v_repeat_customers,
        'repeat_rate', ROUND(v_repeat_rate::NUMERIC, 2),
        'out_of_stock_count', v_out_of_stock_count,
        'total_products', v_total_products,
        'out_of_stock_percent', ROUND(v_out_of_stock_percent::NUMERIC, 2)
    );

    RETURN v_result;
END;
$function$;

-- -----------------------------------------------------------------------------
-- History arrays: only 'gross_profit' changes. Daily net sales minus cost from
-- priced_margin_rows(), the same figure the sales page's daily margin chart shows.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_history_array(p_store_id uuid, p_metric text, p_days integer DEFAULT 90)
 RETURNS numeric[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result DECIMAL[];
BEGIN
    CASE p_metric
        WHEN 'revenue' THEN
            SELECT array_agg(daily_revenue ORDER BY sale_date)
            INTO v_result
            FROM (
                SELECT DATE(creation_date) as sale_date, SUM(grand_total) as daily_revenue
                FROM orders
                WHERE store_id = p_store_id
                  AND creation_date >= CURRENT_DATE - p_days
                  AND status NOT IN ('cancelled')
                GROUP BY DATE(creation_date)
            ) t;

        WHEN 'aov' THEN
            SELECT array_agg(daily_aov ORDER BY sale_date)
            INTO v_result
            FROM (
                SELECT DATE(creation_date) as sale_date, AVG(grand_total) as daily_aov
                FROM orders
                WHERE store_id = p_store_id
                  AND creation_date >= CURRENT_DATE - p_days
                  AND status NOT IN ('cancelled')
                GROUP BY DATE(creation_date)
            ) t;

        WHEN 'gross_profit' THEN
            SELECT array_agg(daily_profit ORDER BY sale_date)
            INTO v_result
            FROM (
                SELECT DATE(r.creation_date) as sale_date, SUM(r.sales - r.cost) as daily_profit
                FROM priced_margin_rows(
                    p_store_id,
                    (CURRENT_DATE - p_days)::timestamp AT TIME ZONE 'UTC',
                    'infinity'::timestamptz) r
                GROUP BY DATE(r.creation_date)
            ) t;

        WHEN 'clicks' THEN
            SELECT array_agg(daily_clicks ORDER BY date)
            INTO v_result
            FROM (
                SELECT date, SUM(clicks) as daily_clicks
                FROM gsc_search_analytics
                WHERE store_id = p_store_id
                  AND date >= CURRENT_DATE - p_days
                GROUP BY date
            ) t;

        ELSE
            v_result := ARRAY[]::DECIMAL[];
    END CASE;

    RETURN COALESCE(v_result, ARRAY[]::DECIMAL[]);
END;
$function$;
