-- =============================================================================
-- KPI: free delivery limit
-- =============================================================================
--
-- On 2026-10-13 the free delivery limit was lowered in both shops; the fees were not
-- touched that day (Billackering had raised its fee 95 -> 99 SEK on 2026-09-23):
-- Automaalit.net pickup point 170 -> 100 EUR, Billackering.eu service point
-- 1 500 -> 1 000 SEK. The same orders bring about 6 200 EUR and 14 000 SEK less in
-- delivery fees a year. This follows what the change does, per shop-local
-- Monday-Sunday week, with the same week a year earlier (364 days back):
--
--   contribution  = gross margin (priced_margin_rows, as everywhere in the app)
--                   + delivery fee net of VAT, over all orders. Divided by the
--                   order count it is the money an order leaves.
--   near the limit = pickup orders with a basket in [near_from, near_to); the share
--                   at or over the new limit shows whether customers top up.
--   fee given up  = pickup orders that shipped free with a basket in
--                   [new_limit, old_limit) since the change, times the pickup fee
--                   (the fee of the latest paid pickup orders, net of VAT).
--   basket        = products incl. VAT before the coupon: grand_total less the
--                   delivery fee, or the line sum when that is larger. ePages
--                   compares the basket before the coupon with the limit.
--
-- Days of a free delivery campaign (limit temporarily lower: 60 EUR / 600 SEK on
-- 62 and 80 days in 10/2025-9/2026) are left out of every figure on both sides.
-- A campaign day is a day with two or more pickup orders that shipped free with a
-- basket under the limit in force. The day between two such days counts too, and so
-- does a quiet day with one such order when campaign days lie within three days on
-- both sides (Billackering has days with a single order).
-- In the week of the change only the days from the change on are counted, and the
-- same weekdays a year earlier.
--
-- Known gap: Automaalit compares the net basket with the limit on orders shown net
-- of VAT (B2B); here every basket is VAT-inclusive, which moves the share near the
-- limit by about one point and leaves about 3 % of the fee given up uncounted.
--
-- Needs orders.shipping_price, which the syncs wrote as 0 until this change
-- (api/lib/epagesShipping.js). scripts/backfill_shipping_price.js fills the history.

-- -----------------------------------------------------------------------------
-- Delivery fee for orders that are already stored. Rows not in the table are
-- ignored: this never creates an order.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_order_shipping_prices(p_store_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(p_rows) AS r(epages_order_id text, shipping_price numeric)
  ),
  changed AS (
    UPDATE orders o
       SET shipping_price = i.shipping_price
      FROM incoming i
     WHERE o.store_id = p_store_id
       AND o.epages_order_id = i.epages_order_id
       AND o.shipping_price IS DISTINCT FROM i.shipping_price
    RETURNING 1
  )
  SELECT jsonb_build_object(
    'matched', (SELECT count(*) FROM orders o JOIN incoming i
                  ON o.store_id = p_store_id AND o.epages_order_id = i.epages_order_id),
    'changed', (SELECT count(*) FROM changed)
  );
$function$;

-- Sync only: no member of a shop writes delivery fees.
REVOKE EXECUTE ON FUNCTION public.sync_order_shipping_prices(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_shipping_prices(uuid, jsonb) TO service_role;

-- -----------------------------------------------------------------------------
-- The change being followed. NULL hides the KPI.
-- -----------------------------------------------------------------------------
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS free_shipping_change jsonb;
COMMENT ON COLUMN public.shops.free_shipping_change IS
    'Free delivery limit change the KPI follows: changed_on, method (orders.shipping_method of the pickup delivery), old_limit, new_limit, near_from, near_to (basket band around the new limit). NULL = no KPI';

UPDATE public.shops
   SET free_shipping_change = '{"changed_on": "2026-10-13", "method": "Matkahuolto -lähellä paketti", "old_limit": 170, "new_limit": 100, "near_from": 80, "near_to": 120}'
 WHERE domain = 'automaalit.net';
UPDATE public.shops
   SET free_shipping_change = '{"changed_on": "2026-10-13", "method": "DHL -service point", "old_limit": 1500, "new_limit": 1000, "near_from": 800, "near_to": 1200}'
 WHERE domain = 'billackering.eu';

-- -----------------------------------------------------------------------------
-- get_free_shipping_limit_weekly
-- -----------------------------------------------------------------------------
-- p_weeks weeks (1-104) ending with the current, still running one. The
-- year-earlier side stops at the same point in time as the latest synced order.
-- free_orders_total and fee_given_up_total run from the change to now, whatever
-- p_weeks is, and are the same on every row.
-- The session time zone is pinned, as in get_new_package_buyers_weekly.
DROP FUNCTION IF EXISTS public.get_free_shipping_limit_weekly(uuid, integer);

CREATE FUNCTION public.get_free_shipping_limit_weekly(p_store_id uuid, p_weeks integer DEFAULT 13)
 RETURNS TABLE(week_start date, is_current boolean, phase text,
               order_count bigint, contribution numeric, near_below bigint, near_above bigint,
               free_orders bigint, fee_given_up numeric, campaign_days bigint, complete boolean,
               prev_week_start date, prev_order_count bigint, prev_contribution numeric,
               prev_near_below bigint, prev_near_above bigint, prev_campaign_days bigint, prev_complete boolean,
               changed_on date, old_limit numeric, new_limit numeric, near_from numeric, near_to numeric,
               free_orders_total bigint, fee_given_up_total numeric)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET timezone TO 'UTC'
AS $function$
DECLARE
    v_tz text;
    v_cfg jsonb;
    v_changed_on date;
    v_method text;
    v_old numeric;
    v_new numeric;
    v_near_from numeric;
    v_near_to numeric;
    v_vat numeric;
    v_fee_net numeric;
    v_this_week date;
    v_first_week date;
    v_change_week date;
    v_last_order timestamptz;
    v_fee_from date;
    v_lines_from date;
    v_from timestamptz;
    v_to timestamptz;
BEGIN
    -- Caller must belong to the shop (service role and direct DB sessions pass)
    PERFORM public.assert_tenant_access(p_store_id);

    SELECT s.timezone, s.free_shipping_change INTO v_tz, v_cfg
    FROM shops s
    WHERE s.store_id = p_store_id::text;

    -- A shops.id passes the access check too, but this takes the store id
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No shop has store_id %', p_store_id USING ERRCODE = 'P0002';
    END IF;

    IF v_cfg IS NULL THEN
        RETURN;
    END IF;

    v_changed_on := (v_cfg->>'changed_on')::date;
    v_method := v_cfg->>'method';
    v_old := (v_cfg->>'old_limit')::numeric;
    v_new := (v_cfg->>'new_limit')::numeric;
    v_near_from := (v_cfg->>'near_from')::numeric;
    v_near_to := (v_cfg->>'near_to')::numeric;

    IF v_changed_on IS NULL OR v_method IS NULL OR v_old IS NULL OR v_new IS NULL
       OR v_near_from IS NULL OR v_near_to IS NULL THEN
        RAISE EXCEPTION 'shops.free_shipping_change of store % lacks a key', p_store_id USING ERRCODE = '22023';
    END IF;

    SELECT mp.vat_rate INTO v_vat FROM margin_pricing(p_store_id) mp;

    v_this_week := date_trunc('week', now() AT TIME ZONE v_tz)::date;
    v_first_week := v_this_week - 7 * (LEAST(GREATEST(COALESCE(p_weeks, 13), 1), 104) - 1);
    v_change_week := date_trunc('week', v_changed_on::timestamp)::date;

    -- A few days more at both ends: a campaign day is judged by the days around it.
    -- The span also reaches back to the change, for the totals since then.
    v_from := ((LEAST(v_first_week - 364, v_changed_on) - 4)::timestamp AT TIME ZONE v_tz);
    v_to := ((v_this_week + 11)::timestamp AT TIME ZONE v_tz);

    SELECT max(o.creation_date) INTO v_last_order
    FROM orders o
    WHERE o.store_id = p_store_id;

    -- First day with a delivery fee, and with line items (Billackering has orders
    -- without line items before 2025-07-26). No fee anywhere = backfill not run.
    SELECT (min(o.creation_date) AT TIME ZONE v_tz)::date INTO v_fee_from
    FROM orders o
    WHERE o.store_id = p_store_id AND o.shipping_price > 0;

    SELECT (min(o.creation_date) AT TIME ZONE v_tz)::date INTO v_lines_from
    FROM orders o
    WHERE o.store_id = p_store_id
      AND EXISTS (SELECT 1 FROM order_line_items li WHERE li.order_id = o.id);

    -- The pickup fee customers pay now, net of VAT: the most common fee of the
    -- latest paid pickup orders (VAT-exempt orders carry the net amount, skip them)
    SELECT mode() WITHIN GROUP (ORDER BY x.shipping_price) / v_vat INTO v_fee_net
    FROM (SELECT o.shipping_price
          FROM orders o
          WHERE o.store_id = p_store_id
            AND o.status <> 'cancelled'
            AND o.shipping_method = v_method
            AND o.shipping_price > 0
            AND o.total_before_tax < o.grand_total
          ORDER BY o.creation_date DESC
          LIMIT 30) x;

    RETURN QUERY
    WITH margin AS (
        SELECT r.order_id, sum(r.sales - r.cost) AS margin
        FROM priced_margin_rows(p_store_id, v_from, v_to) r
        GROUP BY r.order_id
    ),
    line_sum AS (
        SELECT li.order_id, sum(li.total_price) AS s
        FROM order_line_items li
        JOIN orders o ON o.id = li.order_id
        WHERE o.store_id = p_store_id
          AND o.creation_date >= v_from AND o.creation_date < v_to
        GROUP BY li.order_id
    ),
    ord AS (
        SELECT o.creation_date,
               (o.creation_date AT TIME ZONE v_tz)::date AS day,
               COALESCE(o.shipping_method = v_method, false) AS pickup,
               COALESCE(o.shipping_price, 0) AS fee,
               GREATEST(COALESCE(o.grand_total, 0) - COALESCE(o.shipping_price, 0), COALESCE(ls.s, 0)) AS basket,
               COALESCE(m.margin, 0)
                 + COALESCE(o.shipping_price, 0)
                   * CASE WHEN o.grand_total > 0 AND o.total_before_tax > 0 AND o.total_before_tax <= o.grand_total
                          THEN o.total_before_tax / o.grand_total ELSE 1 / v_vat END AS contribution
        FROM orders o
        LEFT JOIN margin m ON m.order_id = o.id
        LEFT JOIN line_sum ls ON ls.order_id = o.id
        WHERE o.store_id = p_store_id
          AND o.status <> 'cancelled'
          AND o.creation_date >= v_from AND o.creation_date < v_to
    ),
    free_low AS (
        SELECT ord.day, count(*) AS n
        FROM ord
        WHERE ord.pickup AND ord.fee = 0 AND ord.basket > 0
          AND ord.basket < 0.97 * CASE WHEN ord.day >= v_changed_on THEN v_new ELSE v_old END
        GROUP BY ord.day
    ),
    flagged AS (
        SELECT fl.day FROM free_low fl WHERE fl.n >= 2
    ),
    campaign AS (
        SELECT f.day FROM flagged f
        UNION
        SELECT f.day + 1 FROM flagged f
        WHERE EXISTS (SELECT 1 FROM flagged g WHERE g.day = f.day + 2)
        UNION
        SELECT fl.day FROM free_low fl
        WHERE EXISTS (SELECT 1 FROM flagged g WHERE g.day BETWEEN fl.day - 3 AND fl.day - 1)
          AND EXISTS (SELECT 1 FROM flagged g WHERE g.day BETWEEN fl.day + 1 AND fl.day + 3)
    ),
    d AS (
        SELECT ord.*, date_trunc('week', ord.day::timestamp)::date AS week,
               EXISTS (SELECT 1 FROM campaign c WHERE c.day = ord.day) AS on_campaign
        FROM ord
    ),
    cur AS (
        SELECT d.week,
               count(*) FILTER (WHERE NOT d.on_campaign) AS n,
               sum(d.contribution) FILTER (WHERE NOT d.on_campaign) AS contribution,
               count(*) FILTER (WHERE NOT d.on_campaign AND d.pickup
                                AND d.basket >= v_near_from AND d.basket < v_new) AS near_below,
               count(*) FILTER (WHERE NOT d.on_campaign AND d.pickup
                                AND d.basket >= v_new AND d.basket < v_near_to) AS near_above,
               count(*) FILTER (WHERE NOT d.on_campaign AND d.pickup AND d.day >= v_changed_on
                                AND d.fee = 0 AND d.basket >= v_new AND d.basket < v_old) AS free_orders,
               count(DISTINCT d.day) FILTER (WHERE d.on_campaign) AS campaign_days
        FROM d
        WHERE d.day >= v_first_week AND d.day < v_this_week + 7
          AND NOT (d.day >= v_change_week AND d.day < v_changed_on)
        GROUP BY d.week
    ),
    prev AS (
        SELECT d.week + 364 AS week,
               count(*) FILTER (WHERE NOT d.on_campaign) AS n,
               sum(d.contribution) FILTER (WHERE NOT d.on_campaign) AS contribution,
               count(*) FILTER (WHERE NOT d.on_campaign AND d.pickup
                                AND d.basket >= v_near_from AND d.basket < v_new) AS near_below,
               count(*) FILTER (WHERE NOT d.on_campaign AND d.pickup
                                AND d.basket >= v_new AND d.basket < v_near_to) AS near_above,
               count(DISTINCT d.day) FILTER (WHERE d.on_campaign) AS campaign_days
        FROM d
        WHERE d.day >= v_first_week - 364 AND d.day < v_this_week + 7 - 364
          AND d.creation_date <= v_last_order - interval '364 days'
          AND NOT (d.day + 364 >= v_change_week AND d.day + 364 < v_changed_on)
        GROUP BY d.week
    ),
    since_change AS (
        SELECT count(*) AS free_orders
        FROM d
        WHERE NOT d.on_campaign AND d.pickup AND d.day >= v_changed_on
          AND d.fee = 0 AND d.basket >= v_new AND d.basket < v_old
    ),
    weeks AS (
        SELECT gs::date AS week
        FROM generate_series(v_first_week::timestamp, v_this_week::timestamp, interval '7 days') gs
    )
    SELECT w.week,
           w.week = v_this_week,
           CASE WHEN w.week + 6 < v_changed_on THEN 'before'
                WHEN w.week <= v_changed_on THEN 'change'
                ELSE 'after' END,
           COALESCE(cur.n, 0),
           round(COALESCE(cur.contribution, 0), 2),
           COALESCE(cur.near_below, 0),
           COALESCE(cur.near_above, 0),
           COALESCE(cur.free_orders, 0),
           round(COALESCE(cur.free_orders, 0) * COALESCE(v_fee_net, 0), 2),
           COALESCE(cur.campaign_days, 0),
           COALESCE(w.week >= v_fee_from AND w.week >= v_lines_from, false),
           w.week - 364,
           COALESCE(prev.n, 0),
           round(COALESCE(prev.contribution, 0), 2),
           COALESCE(prev.near_below, 0),
           COALESCE(prev.near_above, 0),
           COALESCE(prev.campaign_days, 0),
           COALESCE(w.week - 364 >= v_fee_from AND w.week - 364 >= v_lines_from, false),
           v_changed_on, v_old, v_new, v_near_from, v_near_to,
           sc.free_orders,
           round(sc.free_orders * COALESCE(v_fee_net, 0), 2)
    FROM weeks w
    CROSS JOIN since_change sc
    LEFT JOIN cur ON cur.week = w.week
    LEFT JOIN prev ON prev.week = w.week
    ORDER BY w.week;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_free_shipping_limit_weekly(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_free_shipping_limit_weekly(uuid, integer) TO authenticated, service_role;
