-- =============================================================================
-- KPI: new package buyers per week
-- =============================================================================
--
-- Orders from customers new to the shop that contain a package product, per
-- shop-local Monday-Sunday week, with the same week a year earlier (364 days
-- back, so weekdays line up). Automaalit.net 13.8.-28.9.2026: 64 % of the
-- sales drop was in this group.
--
--   package  = a product in any category whose level2 is the shop's
--              shops.package_category. Line items join on product_number:
--              order_line_items.product_id is NULL.
--   new      = no non-rejected order with the same customer in the 12 months
--              before this one. Customer = lower-cased billing email, or
--              customer_id when the email is missing.
--   sales    = grand_total (gross), status <> 'cancelled'.
--
-- Real orders start on 2025-01-01 in both shops (Billackering's 443 SIM-* rows
-- for Q4 2024 carry no email, customer or line items, so they never match), so
-- the lookback of the year-earlier weeks reaches into time the table does not
-- cover. customer_order_history
-- holds that older history, imported read-only from ePages with
-- scripts/import_customer_order_history.cjs. A week whose line items or
-- lookback the data does not fully cover is returned with complete = false.

-- -----------------------------------------------------------------------------
-- Which level2 category holds the shop's packages. NULL hides the KPI.
-- -----------------------------------------------------------------------------
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS package_category text;
COMMENT ON COLUMN public.shops.package_category IS
    'categories.level2 value of the shop''s product packages; NULL = no package KPI';

UPDATE public.shops SET package_category = 'Tuotepaketit' WHERE domain = 'automaalit.net';
UPDATE public.shops SET package_category = 'Produktpaket' WHERE domain = 'billackering.eu';

-- -----------------------------------------------------------------------------
-- Customer history from before the orders table begins
-- -----------------------------------------------------------------------------
-- One row per non-rejected ePages order. No email is stored, only
-- md5(lower(btrim(email))), which the function computes the same way from
-- orders.billing_email. Orders without an email are not imported: they could
-- not be matched to anything.
CREATE TABLE IF NOT EXISTS public.customer_order_history (
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    epages_order_id text NOT NULL,
    creation_date timestamptz NOT NULL,
    customer_key text NOT NULL,
    PRIMARY KEY (store_id, epages_order_id)
);

-- Service role only: read through the definer function below
ALTER TABLE public.customer_order_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_order_history FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- get_new_package_buyers_weekly
-- -----------------------------------------------------------------------------
-- p_weeks weeks (1-260) ending with the current, still running one
-- (is_current). The year-earlier side stops at the same point in time as the
-- latest synced order, so the current week is compared with the same part of
-- its week. The session time zone is pinned: interval arithmetic on timestamptz
-- follows it, and a PostgREST caller could otherwise change it per request.
CREATE OR REPLACE FUNCTION public.get_new_package_buyers_weekly(p_store_id uuid, p_weeks integer DEFAULT 13)
 RETURNS TABLE(week_start date, is_current boolean, order_count bigint, sales numeric, complete boolean,
               prev_week_start date, prev_order_count bigint, prev_sales numeric, prev_complete boolean)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET timezone TO 'UTC'
AS $function$
DECLARE
    v_tz text;
    v_category text;
    v_this_week date;
    v_first_week date;
    v_last_order timestamptz;
    v_lines_from timestamptz;
    v_history_from timestamptz;
BEGIN
    -- Caller must belong to the shop (service role and direct DB sessions pass)
    PERFORM public.assert_tenant_access(p_store_id);

    SELECT s.timezone, s.package_category INTO v_tz, v_category
    FROM shops s
    WHERE s.store_id = p_store_id::text;

    -- A shops.id passes the access check too, but this takes the store id
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No shop has store_id %', p_store_id USING ERRCODE = 'P0002';
    END IF;

    IF v_category IS NULL THEN
        RETURN;
    END IF;

    v_this_week := date_trunc('week', now() AT TIME ZONE v_tz)::date;
    v_first_week := v_this_week - 7 * (LEAST(GREATEST(COALESCE(p_weeks, 13), 1), 260) - 1);

    SELECT max(o.creation_date) INTO v_last_order
    FROM orders o
    WHERE o.store_id = p_store_id;

    -- Billackering has orders without line items before 2025-07-26
    SELECT min(o.creation_date) INTO v_lines_from
    FROM orders o
    WHERE o.store_id = p_store_id
      AND EXISTS (SELECT 1 FROM order_line_items li WHERE li.order_id = o.id);

    SELECT LEAST(
        (SELECT min(h.creation_date) FROM customer_order_history h WHERE h.store_id = p_store_id),
        (SELECT min(o.creation_date) FROM orders o
         WHERE o.store_id = p_store_id AND o.status <> 'cancelled'
           AND (btrim(COALESCE(o.billing_email, '')) <> '' OR o.customer_id IS NOT NULL))
    ) INTO v_history_from;

    RETURN QUERY
    WITH package_products AS (
        SELECT DISTINCT p.product_number
        FROM products p
        JOIN product_categories pc ON pc.product_id = p.id
        JOIN categories c ON c.id = pc.category_id
        WHERE p.store_id = p_store_id
          AND c.store_id = p_store_id
          AND c.level2 = v_category
          AND p.product_number IS NOT NULL
    ),
    customer_orders AS (
        SELECT o.id AS order_id, o.creation_date,
               CASE WHEN btrim(COALESCE(o.billing_email, '')) <> '' THEN md5(lower(btrim(o.billing_email)))
                    WHEN o.customer_id IS NOT NULL THEN 'customer:' || o.customer_id::text
               END AS customer_key
        FROM orders o
        WHERE o.store_id = p_store_id
          AND o.status <> 'cancelled'
        UNION ALL
        SELECT NULL::uuid, h.creation_date, h.customer_key
        FROM customer_order_history h
        WHERE h.store_id = p_store_id
          AND NOT EXISTS (SELECT 1 FROM orders o
                          WHERE o.store_id = p_store_id AND o.epages_order_id = h.epages_order_id)
    ),
    with_previous AS (
        SELECT co.order_id, co.creation_date,
               CASE WHEN co.customer_key IS NOT NULL THEN
                   lag(co.creation_date) OVER (PARTITION BY co.customer_key
                                               ORDER BY co.creation_date, co.order_id NULLS FIRST)
               END AS previous_order_at
        FROM customer_orders co
    ),
    new_package_orders AS (
        SELECT date_trunc('week', wp.creation_date AT TIME ZONE v_tz)::date AS week, o.grand_total,
               (wp.creation_date AT TIME ZONE v_tz) >= v_first_week
                 AND (wp.creation_date AT TIME ZONE v_tz) < v_this_week + 7 AS in_current,
               (wp.creation_date AT TIME ZONE v_tz) >= v_first_week - 364
                 AND (wp.creation_date AT TIME ZONE v_tz) < v_this_week + 7 - 364
                 AND wp.creation_date <= v_last_order - interval '364 days' AS in_previous
        FROM with_previous wp
        JOIN orders o ON o.id = wp.order_id
        WHERE (wp.previous_order_at IS NULL
               OR wp.previous_order_at < wp.creation_date - interval '12 months')
          AND EXISTS (SELECT 1 FROM order_line_items li
                      JOIN package_products pp ON pp.product_number = li.product_number
                      WHERE li.order_id = wp.order_id)
    ),
    -- Separate sums: with p_weeks > 52 a week is both a current row and the
    -- year-earlier side of another, and only the latter stops at the cutoff
    by_week AS (
        SELECT npo.week,
               count(*) FILTER (WHERE npo.in_current) AS n,
               sum(npo.grand_total) FILTER (WHERE npo.in_current) AS total,
               count(*) FILTER (WHERE npo.in_previous) AS prev_n,
               sum(npo.grand_total) FILTER (WHERE npo.in_previous) AS prev_total
        FROM new_package_orders npo
        WHERE npo.in_current OR npo.in_previous
        GROUP BY npo.week
    ),
    weeks AS (
        SELECT gs::date AS week
        FROM generate_series(v_first_week::timestamp, v_this_week::timestamp, interval '7 days') gs
    )
    SELECT w.week,
           w.week = v_this_week,
           COALESCE(cur.n, 0),
           round(COALESCE(cur.total, 0), 2),
           COALESCE((w.week::timestamp AT TIME ZONE v_tz) >= v_lines_from
             AND (w.week::timestamp AT TIME ZONE v_tz) - interval '12 months' >= v_history_from, false),
           w.week - 364,
           COALESCE(prev.prev_n, 0),
           round(COALESCE(prev.prev_total, 0), 2),
           COALESCE(((w.week - 364)::timestamp AT TIME ZONE v_tz) >= v_lines_from
             AND ((w.week - 364)::timestamp AT TIME ZONE v_tz) - interval '12 months' >= v_history_from, false)
    FROM weeks w
    LEFT JOIN by_week cur ON cur.week = w.week
    LEFT JOIN by_week prev ON prev.week = w.week - 364
    ORDER BY w.week;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_new_package_buyers_weekly(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_new_package_buyers_weekly(uuid, integer) TO authenticated, service_role;
