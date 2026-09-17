-- Fix cost joins: order_line_items.product_id is NULL on every row
--
-- order_line_items.product_id is NULL for all 44 888 rows in both stores, so
-- every `JOIN products p ON p.id = oli.product_id` misses and
-- COALESCE(p.cost_price, ...) always fell through to the 40 % fallback. The
-- reported margin was a constant, not a measurement.
--
-- Join on (store_id, product_number) instead. store_id is required: 238
-- product numbers exist in both stores. Exact-match coverage is 93,8 % of line
-- revenue in FI and 95,2 % in SE; the remainder are products no longer in the
-- catalogue and keep the 40 % fallback.
--
-- Margin is now taken from orders.total_before_tax. cost_price excludes VAT, so
-- subtracting it from the VAT-inclusive grand_total overstated the margin by
-- roughly 8 points. The `revenue` and `aov` fields stay VAT-inclusive; a new
-- `revenue_net` field names the base the margin uses.
--
-- Two further defects fixed in the same statements:
--   * calculate_core_metrics counted out-of-stock products through the same
--     dead join, so out_of_stock_count was always 0.
--   * get_history_array summed grand_total across the line-item join, counting
--     each order once per line (~2,4x too high).
--
-- Margin and net sales are both taken from the line items, so freight and anything
-- else that has no line stays out of both sides instead of booking at 100 % margin.
-- This is the same basis api/cron/calculate-kpi.js uses.
--
-- A total_revenue alias for revenue_net is added to the result so that the shape
-- matches what api/cron/calculate-kpi.js writes and what useKPIDashboard.js reads.
--
-- Lines with no cost price keep an assumption, and that assumption is the store's
-- own measured margin (cost = 0.4 x net), not the legacy 40 % margin (cost = 0.6):
-- over 12 months, lines that DO carry a cost price return 58,7 % in FI and 60,7 % in
-- SE, so assuming 40 % for the 5-6 % of revenue without one pulled the whole figure
-- down by ~1,2 points. 0.4 is also what api/cron/calculate-kpi.js:223,229 uses, so
-- the two writers now agree; with 0.6 they did not, despite the comment below.
--
-- Verified 16.9.2026 against ePages data, FI 1.7.-13.9.2026:
--   margin_percent 43,67 % -> 60,31 %   (SE 42,84 % -> 62,32 %)
-- Re-measured 17.9.2026 over the same window: 60,29 % FI / 62,38 % SE with 0.4, and
-- 59,05 % / 61,29 % with 0.6 - i.e. the figures verified yesterday were the 0.4 ones.

-- Multiplier that turns a VAT-inclusive amount on an order into a net one, read from
-- the order itself rather than a hardcoded rate. Mirrors netFactor() in
-- api/cron/calculate-kpi.js so the two paths report the same margin.
-- A total_tax that is absent is NOT treated as zero: that would read as "no VAT on
-- this order" and inflate the margin by the whole VAT rate. 12 orders have a null
-- total_before_tax, 11 of them zero-value, so the 0.8 fallback is a rounding detail.
CREATE OR REPLACE FUNCTION net_factor(
    p_grand_total NUMERIC,
    p_total_before_tax NUMERIC,
    p_total_tax NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $fn$
DECLARE
    v_net NUMERIC;
BEGIN
    v_net := COALESCE(
        p_total_before_tax,
        CASE WHEN p_total_tax > 0 THEN p_grand_total - p_total_tax END
    );
    IF p_grand_total > 0 AND v_net > 0 AND v_net <= p_grand_total THEN
        RETURN v_net / p_grand_total;
    END IF;
    RETURN 0.8;
END;
$fn$;

-- The cost join and the out-of-stock EXISTS below both match on product_number, which
-- has no index on either table. Without these the EXISTS scans all 44 888 line items
-- once per product in the store.
CREATE INDEX IF NOT EXISTS idx_products_store_product_number
    ON products(store_id, product_number);
CREATE INDEX IF NOT EXISTS idx_order_line_items_product_number
    ON order_line_items(product_number);

CREATE OR REPLACE FUNCTION calculate_core_metrics(
    p_store_id UUID,
    p_period_start DATE,
    p_period_end DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
    v_revenue DECIMAL;
    v_revenue_net DECIMAL;
    v_cost DECIMAL;
    v_gross_profit DECIMAL;
    v_order_count INTEGER;
    v_aov DECIMAL;
    v_total_customers INTEGER;
    v_repeat_customers INTEGER;
    v_repeat_rate DECIMAL;
    v_out_of_stock_count INTEGER;
    v_total_products INTEGER;
    v_out_of_stock_percent DECIMAL;
BEGIN
    -- Myynti ja kate
    SELECT
        COALESCE(SUM(o.grand_total), 0),
        COUNT(*)
    INTO v_revenue, v_order_count
    FROM orders o
    WHERE o.store_id = p_store_id
      AND o.creation_date >= p_period_start
      AND o.creation_date <= p_period_end
      AND o.status NOT IN ('cancelled');

    -- Kate (order_line_items + products.cost_price)
    -- order_line_items.product_id on NULL joka rivilla, joten liitos tehdaan
    -- product_numberilla ja rajataan kauppaan: 238 tuotenumeroa esiintyy
    -- molemmissa kaupoissa, joten ilman store_id-ehtoa FI lainaisi SE:n hintoja.
    -- LATERAL + LIMIT 1 estaa rivien kahdentumisen niilla harvoilla
    -- tuotenumeroilla jotka esiintyvat kaupan sisalla kahdesti.
    -- Alviton myynti JA kustannus samasta kyselysta, molemmat rivipohjalta.
    -- Sama peruste kuin api/cron/calculate-kpi.js:ssa, jotta sovelluksen ja taman
    -- funktion kate ovat sama luku. Rahti ja muu rivitonta vastaava osuus jaa
    -- ulos molemmilta puolilta sen sijaan etta se kirjautuisi 100 %:n katteella.
    SELECT
        COALESCE(SUM(oli.total_price * net_factor(o.grand_total, o.total_before_tax, o.total_tax)), 0),
        COALESCE(SUM(
            CASE
                WHEN pc.cost_price IS NOT NULL AND pc.cost_price > 0
                -- quantity on pyoristetty kokonaisluvuksi; todellinen maara on
                -- total_price / unit_price (litroittain myytavat maalit)
                THEN COALESCE(oli.total_price / NULLIF(oli.unit_price, 0), oli.quantity) * pc.cost_price
                -- Ei ostohintaa (FI 6,4 %, SE 5,1 % alvittomasta rivimyynnista 12 kk:lta;
                -- poistuneet tuotteet): oletetaan naille kaupan MITATTU kate, joka on
                -- ostohinnallisilla riveilla FI 58,7 % ja SE 60,7 %. Aiempi 40 %:n oletus
                -- painoi koko luvun systemaattisesti 1,2 pistetta alas. Sama vakio kuin
                -- api/cron/calculate-kpi.js:223.
                ELSE oli.total_price * net_factor(o.grand_total, o.total_before_tax, o.total_tax) * 0.4
            END
        ), 0)
    INTO v_revenue_net, v_cost
    FROM orders o
    JOIN order_line_items oli ON oli.order_id = o.id
    LEFT JOIN LATERAL (
        SELECT p.cost_price
        FROM products p
        WHERE p.store_id = o.store_id
          AND p.product_number = oli.product_number
        ORDER BY p.cost_price DESC NULLS LAST, p.id
        LIMIT 1
    ) pc ON TRUE
    WHERE o.store_id = p_store_id
      AND o.creation_date >= p_period_start
      AND o.creation_date <= p_period_end
      AND o.status NOT IN ('cancelled');

    -- Tilaukset joilla ei ole yhtaan riviä (Billackeringilla 1 953 kpl ennen
    -- 26.7.2025) jaisivat muuten kokonaan pois, jolloin kate nayttaisi noilta
    -- jaksoilta lahes 100 %. Sama oletus kuin rivitasolla.
    SELECT
        v_revenue_net + COALESCE(SUM(o.grand_total * net_factor(o.grand_total, o.total_before_tax, o.total_tax)), 0),
        v_cost + COALESCE(SUM(o.grand_total * net_factor(o.grand_total, o.total_before_tax, o.total_tax) * 0.4), 0)
    INTO v_revenue_net, v_cost
    FROM orders o
    WHERE o.store_id = p_store_id
      AND o.creation_date >= p_period_start
      AND o.creation_date <= p_period_end
      AND o.status NOT IN ('cancelled')
      AND NOT EXISTS (SELECT 1 FROM order_line_items oli WHERE oli.order_id = o.id);

    v_gross_profit := v_revenue_net - v_cost;

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
          AND creation_date >= p_period_start
          AND creation_date <= p_period_end
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
        -- Alias for revenue_net. supabase/functions/daily-kpi-snapshot/index.ts:423
        -- writes this object straight into kpi_index_snapshots.raw_metrics.core, and
        -- src/hooks/useKPIDashboard.js:193 reads total_revenue from there - a key that
        -- did not exist, so a snapshot written that way WOULD show 0 revenue and a
        -- cost equal to minus the gross profit. No row in kpi_index_snapshots has
        -- that shape today: all 165 come from api/cron/calculate-kpi.js, and nothing
        -- invokes the Edge Function. This is a latent defect, not an observed one.
        -- The alias points at the NET figure, not the VAT-inclusive
        -- 'revenue': the hook computes cost = total_revenue - gross_profit, and
        -- gross_profit is net. That is also what api/cron/calculate-kpi.js:324 writes
        -- into the same key, so the two writers stay comparable.
        'total_revenue', ROUND(v_revenue_net::NUMERIC, 2),
        'margin_percent', CASE WHEN v_revenue_net > 0
            THEN ROUND(((v_gross_profit / v_revenue_net) * 100)::NUMERIC, 2)
            ELSE 0 END,
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
$$;

CREATE OR REPLACE FUNCTION get_history_array(
    p_store_id UUID,
    p_metric TEXT,
    p_days INTEGER DEFAULT 90
)
RETURNS DECIMAL[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
                -- Liikevaihto ja kustannus lasketaan ERIKSEEN. Aiempi versio
                -- summasi grand_totalin rivitason JOINin yli, jolloin jokainen
                -- tilaus laskettiin kertaalleen per tuoterivi (n. 2,4x liikaa).
                SELECT
                    r.sale_date,
                    r.revenue_net - COALESCE(c.cost, 0) as daily_profit
                FROM (
                    SELECT DATE(o.creation_date) as sale_date,
                           SUM(o.grand_total * net_factor(o.grand_total, o.total_before_tax, o.total_tax)) as revenue_net
                    FROM orders o
                    WHERE o.store_id = p_store_id
                      AND o.creation_date >= CURRENT_DATE - p_days
                      AND o.status NOT IN ('cancelled')
                    GROUP BY DATE(o.creation_date)
                ) r
                LEFT JOIN (
                    SELECT DATE(o.creation_date) as sale_date,
                           SUM(CASE
                               WHEN pc.cost_price IS NOT NULL AND pc.cost_price > 0
                               THEN COALESCE(oli.total_price / NULLIF(oli.unit_price, 0), oli.quantity) * pc.cost_price
                               -- sama oletus kuin calculate_core_metrics:issa
                               ELSE oli.total_price * net_factor(o.grand_total, o.total_before_tax, o.total_tax) * 0.4
                           END) as cost
                    FROM orders o
                    JOIN order_line_items oli ON oli.order_id = o.id
                    LEFT JOIN LATERAL (
                        SELECT p.cost_price
                        FROM products p
                        WHERE p.store_id = o.store_id
                          AND p.product_number = oli.product_number
                        ORDER BY p.cost_price DESC NULLS LAST, p.id
                        LIMIT 1
                    ) pc ON TRUE
                    WHERE o.store_id = p_store_id
                      AND o.creation_date >= CURRENT_DATE - p_days
                      AND o.status NOT IN ('cancelled')
                    GROUP BY DATE(o.creation_date)
                ) c ON c.sale_date = r.sale_date
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
$$;
