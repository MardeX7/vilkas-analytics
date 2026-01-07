-- ============================================
-- KPI INDEX ENGINE - Helper Functions
-- VilkasAnalytics (tlothekaphtiwvusgwzh)
--
-- Versio: 1.0
-- Luotu: 2026-01-07
-- ============================================

-- ============================================
-- 1. CREATE_DAILY_INVENTORY_SNAPSHOT
-- Luo päivittäisen varastosnapshot-rivin
-- ============================================
CREATE OR REPLACE FUNCTION create_daily_inventory_snapshot(
    p_store_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    INSERT INTO inventory_snapshots (store_id, product_id, snapshot_date, stock_level, stock_value)
    SELECT
        p.store_id,
        p.id,
        CURRENT_DATE,
        COALESCE(p.stock_level, 0),
        COALESCE(p.stock_level, 0) * COALESCE(p.cost_price, 0)
    FROM products p
    WHERE p.for_sale = true
      AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ON CONFLICT (store_id, product_id, snapshot_date)
    DO UPDATE SET
        stock_level = EXCLUDED.stock_level,
        stock_value = EXCLUDED.stock_value;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Logita
    INSERT INTO kpi_calculation_log (store_id, calculation_type, status, metrics, completed_at)
    VALUES (
        COALESCE(p_store_id, '00000000-0000-0000-0000-000000000000'::UUID),
        'inventory_snapshot',
        'completed',
        jsonb_build_object('rows_affected', v_count, 'snapshot_date', CURRENT_DATE),
        NOW()
    );

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION create_daily_inventory_snapshot IS
'Luo päivittäisen varastosnapshot-rivin kaikille tuotteille (tai yhdelle kaupalle)';

-- ============================================
-- 2. GET_PERIOD_DATES
-- Laskee jakson alku- ja loppupäivät
-- ============================================
CREATE OR REPLACE FUNCTION get_period_dates(
    p_period_end DATE,
    p_granularity TEXT
)
RETURNS TABLE (period_start DATE, period_end DATE)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_granularity = 'week' THEN
        RETURN QUERY SELECT
            (p_period_end - INTERVAL '6 days')::DATE,
            p_period_end;
    ELSIF p_granularity = 'month' THEN
        RETURN QUERY SELECT
            DATE_TRUNC('month', p_period_end)::DATE,
            p_period_end;
    ELSE
        RAISE EXCEPTION 'Invalid granularity: %', p_granularity;
    END IF;
END;
$$;

-- ============================================
-- 3. GET_COMPARISON_PERIOD_DATES
-- Laskee vertailujakson päivät
-- ============================================
CREATE OR REPLACE FUNCTION get_comparison_period_dates(
    p_period_end DATE,
    p_granularity TEXT
)
RETURNS TABLE (period_start DATE, period_end DATE)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF p_granularity = 'week' THEN
        -- Edellinen viikko
        RETURN QUERY SELECT
            (p_period_end - INTERVAL '13 days')::DATE,
            (p_period_end - INTERVAL '7 days')::DATE;
    ELSIF p_granularity = 'month' THEN
        -- Edellinen kuukausi
        RETURN QUERY SELECT
            (DATE_TRUNC('month', p_period_end) - INTERVAL '1 month')::DATE,
            (DATE_TRUNC('month', p_period_end) - INTERVAL '1 day')::DATE;
    ELSE
        RAISE EXCEPTION 'Invalid granularity: %', p_granularity;
    END IF;
END;
$$;

-- ============================================
-- 4. CALCULATE_CORE_METRICS
-- Laskee Core Index -raakametriikat
-- ============================================
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
    SELECT COALESCE(SUM(
        oli.quantity * COALESCE(p.cost_price, oli.unit_price * 0.6)
    ), 0)
    INTO v_cost
    FROM orders o
    JOIN order_line_items oli ON oli.order_id = o.id
    LEFT JOIN products p ON p.id = oli.product_id
    WHERE o.store_id = p_store_id
      AND o.creation_date >= p_period_start
      AND o.creation_date <= p_period_end
      AND o.status NOT IN ('cancelled');

    v_gross_profit := v_revenue - v_cost;

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
    SELECT
        COUNT(*) FILTER (WHERE stock_level = 0),
        COUNT(*)
    INTO v_out_of_stock_count, v_total_products
    FROM products
    WHERE store_id = p_store_id
      AND for_sale = true;

    v_out_of_stock_percent := CASE WHEN v_total_products > 0
        THEN (v_out_of_stock_count::DECIMAL / v_total_products) * 100
        ELSE 0 END;

    -- Rakenna tulos
    v_result := jsonb_build_object(
        'revenue', ROUND(v_revenue::NUMERIC, 2),
        'cost', ROUND(v_cost::NUMERIC, 2),
        'gross_profit', ROUND(v_gross_profit::NUMERIC, 2),
        'margin_percent', CASE WHEN v_revenue > 0
            THEN ROUND(((v_gross_profit / v_revenue) * 100)::NUMERIC, 2)
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

COMMENT ON FUNCTION calculate_core_metrics IS
'Laskee Core Index -raakametriikat: revenue, kate, AOV, repeat rate, out-of-stock';

-- ============================================
-- 5. CALCULATE_SEO_METRICS
-- Laskee SEO-metriikat GSC-datasta
-- ============================================
CREATE OR REPLACE FUNCTION calculate_seo_metrics(
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
    v_total_clicks INTEGER;
    v_total_impressions INTEGER;
    v_avg_position DECIMAL;
    v_avg_ctr DECIMAL;
    v_brand_clicks INTEGER;
    v_nonbrand_clicks INTEGER;
    v_rising_queries JSONB;
BEGIN
    -- Perusmetriikat
    SELECT
        COALESCE(SUM(clicks), 0),
        COALESCE(SUM(impressions), 0),
        COALESCE(AVG(position), 0),
        CASE WHEN SUM(impressions) > 0
            THEN SUM(clicks)::DECIMAL / SUM(impressions)
            ELSE 0 END
    INTO v_total_clicks, v_total_impressions, v_avg_position, v_avg_ctr
    FROM gsc_search_analytics
    WHERE store_id = p_store_id
      AND date >= p_period_start
      AND date <= p_period_end;

    -- Brand vs Non-brand (oletus: brand = kaupan nimi haussa)
    -- Tässä yksinkertaistettu: kaikki jossa on "billackering" = brand
    SELECT
        COALESCE(SUM(clicks) FILTER (WHERE LOWER(query) LIKE '%billackering%'), 0),
        COALESCE(SUM(clicks) FILTER (WHERE LOWER(query) NOT LIKE '%billackering%'), 0)
    INTO v_brand_clicks, v_nonbrand_clicks
    FROM gsc_search_analytics
    WHERE store_id = p_store_id
      AND date >= p_period_start
      AND date <= p_period_end
      AND query IS NOT NULL;

    -- Nousevat haut (impressions noussut, clicks vakaa/laskenut)
    -- Yksinkertaistettu: top 10 by impressions growth
    SELECT jsonb_agg(rising)
    INTO v_rising_queries
    FROM (
        SELECT jsonb_build_object(
            'query', query,
            'impressions', impressions,
            'clicks', clicks,
            'position', position
        ) as rising
        FROM gsc_search_analytics
        WHERE store_id = p_store_id
          AND date >= p_period_start
          AND date <= p_period_end
          AND query IS NOT NULL
          AND impressions > 10
        ORDER BY impressions DESC
        LIMIT 10
    ) t;

    -- Rakenna tulos
    v_result := jsonb_build_object(
        'total_clicks', v_total_clicks,
        'total_impressions', v_total_impressions,
        'avg_position', ROUND(v_avg_position::NUMERIC, 2),
        'avg_ctr', ROUND((v_avg_ctr * 100)::NUMERIC, 2),
        'brand_clicks', v_brand_clicks,
        'nonbrand_clicks', v_nonbrand_clicks,
        'nonbrand_percent', CASE WHEN (v_brand_clicks + v_nonbrand_clicks) > 0
            THEN ROUND((v_nonbrand_clicks::DECIMAL / (v_brand_clicks + v_nonbrand_clicks) * 100)::NUMERIC, 2)
            ELSE 0 END,
        'rising_queries_count', COALESCE(jsonb_array_length(v_rising_queries), 0),
        'rising_queries', COALESCE(v_rising_queries, '[]'::JSONB)
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION calculate_seo_metrics IS
'Laskee SEO-metriikat GSC-datasta: clicks, impressions, position, brand/nonbrand';

-- ============================================
-- 6. CALCULATE_OPERATIONAL_METRICS
-- Laskee operatiiviset metriikat
-- ============================================
CREATE OR REPLACE FUNCTION calculate_operational_metrics(
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
    v_avg_fulfillment_days DECIMAL;
    v_orders_with_dispatch INTEGER;
    v_total_orders INTEGER;
BEGIN
    -- Läpimenoaika (creation_date → dispatched_on)
    SELECT
        COALESCE(AVG(
            EXTRACT(EPOCH FROM (dispatched_on - creation_date)) / 86400
        ), 0),
        COUNT(*) FILTER (WHERE dispatched_on IS NOT NULL),
        COUNT(*)
    INTO v_avg_fulfillment_days, v_orders_with_dispatch, v_total_orders
    FROM orders
    WHERE store_id = p_store_id
      AND creation_date >= p_period_start
      AND creation_date <= p_period_end
      AND status NOT IN ('cancelled');

    -- Rakenna tulos
    v_result := jsonb_build_object(
        'avg_fulfillment_days', ROUND(v_avg_fulfillment_days::NUMERIC, 2),
        'orders_with_dispatch', v_orders_with_dispatch,
        'total_orders', v_total_orders,
        'dispatch_rate', CASE WHEN v_total_orders > 0
            THEN ROUND((v_orders_with_dispatch::DECIMAL / v_total_orders * 100)::NUMERIC, 2)
            ELSE 0 END
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION calculate_operational_metrics IS
'Laskee operatiiviset metriikat: läpimenoaika, dispatch rate';

-- ============================================
-- 7. NORMALIZE_TO_INDEX
-- Normalisoi arvo 0-100 asteikolle
-- ============================================
CREATE OR REPLACE FUNCTION normalize_to_index(
    p_value DECIMAL,
    p_history DECIMAL[],
    p_higher_is_better BOOLEAN DEFAULT TRUE
)
RETURNS DECIMAL
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_median DECIMAL;
    v_mean DECIMAL;
    v_stddev DECIMAL;
    v_zscore DECIMAL;
    v_index DECIMAL;
    v_sorted DECIMAL[];
    v_len INTEGER;
BEGIN
    -- Jos ei historiaa, palauta 50
    IF p_history IS NULL OR array_length(p_history, 1) IS NULL OR array_length(p_history, 1) = 0 THEN
        RETURN 50;
    END IF;

    v_len := array_length(p_history, 1);

    -- Laske mediaani
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY val)
    INTO v_median
    FROM unnest(p_history) AS val;

    -- Laske keskiarvo ja keskihajonta
    SELECT AVG(val), STDDEV_POP(val)
    INTO v_mean, v_stddev
    FROM unnest(p_history) AS val;

    -- Z-score
    IF v_stddev > 0 THEN
        v_zscore := (p_value - v_median) / v_stddev;
    ELSE
        v_zscore := 0;
    END IF;

    -- Muunna 0-100 asteikolle
    -- mediaani = 50, +1 SD = 75, +2 SD = 100, -1 SD = 25, -2 SD = 0
    v_index := 50 + (v_zscore * 25);

    -- Käännä jos pienempi on parempi
    IF NOT p_higher_is_better THEN
        v_index := 100 - v_index + 50;
    END IF;

    -- Rajaa 0-100
    RETURN GREATEST(0, LEAST(100, ROUND(v_index::NUMERIC, 2)));
END;
$$;

COMMENT ON FUNCTION normalize_to_index IS
'Normalisoi arvo 0-100 asteikolle käyttäen historiaa (z-score normalisointi)';

-- ============================================
-- 8. GET_HISTORY_ARRAY
-- Hakee 3kk historiadata taulukolle normalisointia varten
-- ============================================
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
                SELECT
                    DATE(o.creation_date) as sale_date,
                    SUM(o.grand_total) - SUM(oli.quantity * COALESCE(p.cost_price, oli.unit_price * 0.6)) as daily_profit
                FROM orders o
                JOIN order_line_items oli ON oli.order_id = o.id
                LEFT JOIN products p ON p.id = oli.product_id
                WHERE o.store_id = p_store_id
                  AND o.creation_date >= CURRENT_DATE - p_days
                  AND o.status NOT IN ('cancelled')
                GROUP BY DATE(o.creation_date)
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

COMMENT ON FUNCTION get_history_array IS
'Hakee 3kk historiadata taulukolle normalisointia varten';

-- ============================================
-- 9. GET_KPI_DASHBOARD
-- Palauttaa dashboardin päädata
-- ============================================
CREATE OR REPLACE FUNCTION get_kpi_dashboard(
    p_store_id UUID,
    p_granularity TEXT DEFAULT 'week'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_current RECORD;
    v_previous RECORD;
    v_result JSONB;
BEGIN
    -- Hae viimeisin snapshot
    SELECT * INTO v_current
    FROM kpi_index_snapshots
    WHERE store_id = p_store_id AND granularity = p_granularity
    ORDER BY period_end DESC
    LIMIT 1;

    IF v_current IS NULL THEN
        RETURN jsonb_build_object(
            'error', 'No KPI snapshot found',
            'store_id', p_store_id,
            'granularity', p_granularity
        );
    END IF;

    -- Hae edellinen snapshot (vertailuun)
    SELECT * INTO v_previous
    FROM kpi_index_snapshots
    WHERE store_id = p_store_id
      AND granularity = p_granularity
      AND period_end < v_current.period_end
    ORDER BY period_end DESC
    LIMIT 1;

    -- Rakenna vastaus
    v_result := jsonb_build_object(
        'period', jsonb_build_object(
            'start', v_current.period_start,
            'end', v_current.period_end,
            'granularity', p_granularity
        ),
        'indexes', jsonb_build_object(
            'overall', v_current.overall_index,
            'core', v_current.core_index,
            'ppi', v_current.product_profitability_index,
            'spi', v_current.seo_performance_index,
            'oi', v_current.operational_index
        ),
        'deltas', jsonb_build_object(
            'overall', COALESCE(v_current.overall_delta, 0),
            'core', COALESCE(v_current.core_index_delta, 0),
            'ppi', COALESCE(v_current.ppi_delta, 0),
            'spi', COALESCE(v_current.spi_delta, 0),
            'oi', COALESCE(v_current.oi_delta, 0)
        ),
        'components', jsonb_build_object(
            'core', COALESCE(v_current.core_components, '{}'::JSONB),
            'ppi', COALESCE(v_current.ppi_components, '{}'::JSONB),
            'spi', COALESCE(v_current.spi_components, '{}'::JSONB),
            'oi', COALESCE(v_current.oi_components, '{}'::JSONB)
        ),
        'alerts', COALESCE(v_current.alerts, ARRAY[]::TEXT[]),
        'calculated_at', v_current.created_at
    );

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION get_kpi_dashboard IS
'Palauttaa KPI-dashboardin päädata: indeksit, deltat, komponentit, hälytykset';

-- ============================================
-- 10. GENERATE_AI_CONTEXT
-- Generoi strukturoidun kontekstin AI-agentille
-- ============================================
CREATE OR REPLACE FUNCTION generate_ai_context(
    p_store_id UUID,
    p_granularity TEXT DEFAULT 'week'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_dashboard JSONB;
    v_top_products JSONB;
    v_capital_traps JSONB;
    v_context JSONB;
    v_period_label TEXT;
BEGIN
    -- Hae dashboard-data
    v_dashboard := get_kpi_dashboard(p_store_id, p_granularity);

    IF v_dashboard ? 'error' THEN
        RETURN v_dashboard;
    END IF;

    -- Hae top tuotteet
    SELECT jsonb_agg(jsonb_build_object(
        'name', product_name,
        'sku', sku,
        'score', total_score,
        'revenue', revenue,
        'margin', margin_percent
    ))
    INTO v_top_products
    FROM v_top_profit_drivers
    WHERE store_id = p_store_id
    LIMIT 5;

    -- Hae capital traps
    SELECT jsonb_agg(jsonb_build_object(
        'name', product_name,
        'sku', sku,
        'stock_days', stock_days,
        'tied_capital', tied_capital
    ))
    INTO v_capital_traps
    FROM v_capital_traps
    WHERE store_id = p_store_id
    LIMIT 5;

    -- Muodosta period label
    IF p_granularity = 'week' THEN
        v_period_label := TO_CHAR(CURRENT_DATE, 'IYYY-"W"IW');
    ELSE
        v_period_label := TO_CHAR(CURRENT_DATE, 'YYYY-MM');
    END IF;

    -- Rakenna AI-konteksti
    v_context := jsonb_build_object(
        'period', v_period_label,
        'granularity', p_granularity,
        'indexes', v_dashboard->'indexes',
        'deltas', v_dashboard->'deltas',
        'alerts', v_dashboard->'alerts',
        'top_profit_drivers', COALESCE(v_top_products, '[]'::JSONB),
        'capital_traps', COALESCE(v_capital_traps, '[]'::JSONB),
        'generated_at', NOW()
    );

    -- Tallenna konteksti
    INSERT INTO ai_context_snapshots (store_id, period_label, granularity, context)
    VALUES (p_store_id, v_period_label, p_granularity, v_context)
    ON CONFLICT (store_id, period_label, granularity)
    DO UPDATE SET context = EXCLUDED.context, created_at = NOW();

    RETURN v_context;
END;
$$;

COMMENT ON FUNCTION generate_ai_context IS
'Generoi strukturoidun JSON-kontekstin AI-agentille (Emma/Esko)';

-- ============================================
-- VALMIS
-- ============================================
