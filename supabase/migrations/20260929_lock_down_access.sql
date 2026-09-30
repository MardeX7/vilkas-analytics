-- =============================================================================
-- Lock data access down to the shop's own members
-- =============================================================================
--
-- Found 29.9.2026: the public anon key (it ships in the frontend bundle) could read
-- the Google OAuth tokens in gsc_tokens and ga4_tokens, the Emma chat history, AI
-- analyses and recommendations, every sales view (v_daily_sales, v_top_products,
-- v_customer_geography, ...) and every SECURITY DEFINER RPC for any store. Any
-- signed-in user could also insert themselves into shop_members, and nine tables
-- let any signed-in user read (some also write) every shop's rows.
--
-- After this migration:
--   * anon has no privilege on anything in the public schema (the app signs in
--     before it reads data; the server uses the service role)
--   * a signed-in user reaches only shops they are a member of: RLS on every table,
--     views run with the caller's rights (security_invoker), and every SECURITY
--     DEFINER function that takes a shop/store id checks membership first
--   * OAuth token columns are not readable by signed-in users at all
--   * server-only functions are callable by the service role only
-- The service role (crons, API routes, edge functions) bypasses RLS as before.
-- =============================================================================

-- Shop ids AND store ids (the app has both, see CLAUDE.md) the caller may reach.
-- Used as `col IN (SELECT public.accessible_tenant_ids())`, which Postgres runs once
-- per statement instead of once per row.
CREATE OR REPLACE FUNCTION public.accessible_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
    SELECT s.id
    FROM shops s JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
    UNION
    SELECT s.store_id::uuid
    FROM shops s JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
      AND s.store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Raises unless the caller may reach p_id (a shop id or a store id). The service role
-- and direct database sessions (no JWT: SQL editor, CLI) pass.
CREATE OR REPLACE FUNCTION public.assert_tenant_access(p_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF COALESCE(auth.role(), '') IN ('service_role', '') THEN
        RETURN;
    END IF;
    IF p_id IS NOT NULL AND p_id IN (SELECT public.accessible_tenant_ids()) THEN
        RETURN;
    END IF;
    RAISE EXCEPTION 'Access denied' USING ERRCODE = '42501';
END;
$$;

-- -----------------------------------------------------------------------------
-- Tables that had no RLS at all (their member policies already existed)
-- -----------------------------------------------------------------------------
ALTER TABLE public.action_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emma_documents ENABLE ROW LEVEL SECURITY;  -- service role only
ALTER TABLE public.gsc_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_analyses ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- OAuth tokens: members may see which property is connected and disconnect GA4;
-- the token columns are for the service role only.
-- -----------------------------------------------------------------------------
DROP POLICY "Service role has full access to ga4_tokens" ON public.ga4_tokens;
CREATE POLICY ga4_tokens_member_select ON public.ga4_tokens FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));
CREATE POLICY ga4_tokens_member_delete ON public.ga4_tokens FOR DELETE TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));
REVOKE ALL ON public.ga4_tokens FROM authenticated;
GRANT SELECT (id, store_id, property_id, account_id, property_name, expires_at, created_at, updated_at)
    ON public.ga4_tokens TO authenticated;
GRANT DELETE ON public.ga4_tokens TO authenticated;

CREATE POLICY gsc_tokens_member_select ON public.gsc_tokens FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));
REVOKE ALL ON public.gsc_tokens FROM authenticated;
GRANT SELECT (id, store_id, site_url, expires_at, created_at, updated_at)
    ON public.gsc_tokens TO authenticated;

-- -----------------------------------------------------------------------------
-- Policies that let everyone in ("true"), or every signed-in user into every shop
-- -----------------------------------------------------------------------------
-- Memberships are created by invite_user/accept_invitation (SECURITY DEFINER), never
-- by a direct insert; "WITH CHECK (true)" let anyone join any shop.
DROP POLICY "shop_members_insert_by_admin" ON public.shop_members;

DROP POLICY "Service role has full access to ga4_analytics" ON public.ga4_analytics;
CREATE POLICY ga4_analytics_member_select ON public.ga4_analytics FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "growth_engine_snapshots_all" ON public.growth_engine_snapshots;
CREATE POLICY growth_engine_snapshots_member_select ON public.growth_engine_snapshots FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Service role full access" ON public.order_items;
CREATE POLICY order_items_member_select ON public.order_items FOR SELECT TO authenticated
    USING (shop_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Allow all for now" ON public.tracked_recommendations;
CREATE POLICY tracked_recommendations_member_all ON public.tracked_recommendations FOR ALL TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()))
    WITH CHECK (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can delete campaigns" ON public.campaigns;
DROP POLICY "Authenticated users can insert campaigns" ON public.campaigns;
DROP POLICY "Authenticated users can update campaigns" ON public.campaigns;
DROP POLICY "Authenticated users can view campaigns" ON public.campaigns;
CREATE POLICY campaigns_member_all ON public.campaigns FOR ALL TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()))
    WITH CHECK (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can delete notes" ON public.context_notes;
DROP POLICY "Authenticated users can insert notes" ON public.context_notes;
DROP POLICY "Authenticated users can update notes" ON public.context_notes;
DROP POLICY "Authenticated users can view notes" ON public.context_notes;
CREATE POLICY context_notes_member_all ON public.context_notes FOR ALL TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()))
    WITH CHECK (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can delete goals" ON public.merchant_goals;
DROP POLICY "Authenticated users can insert goals" ON public.merchant_goals;
DROP POLICY "Authenticated users can update goals" ON public.merchant_goals;
DROP POLICY "Authenticated users can view goals" ON public.merchant_goals;
CREATE POLICY merchant_goals_member_all ON public.merchant_goals FOR ALL TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()))
    WITH CHECK (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can view categories" ON public.categories;
CREATE POLICY categories_member_select ON public.categories FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can view inventory_snapshots" ON public.inventory_snapshots;
CREATE POLICY inventory_snapshots_member_select ON public.inventory_snapshots FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can view kpi_index_snapshots" ON public.kpi_index_snapshots;
CREATE POLICY kpi_index_snapshots_member_select ON public.kpi_index_snapshots FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can view product_profitability" ON public.product_profitability;
CREATE POLICY product_profitability_member_select ON public.product_profitability FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can view product_roles" ON public.product_roles;
CREATE POLICY product_roles_member_select ON public.product_roles FOR SELECT TO authenticated
    USING (store_id IN (SELECT public.accessible_tenant_ids()));

DROP POLICY "Authenticated users can view product_categories" ON public.product_categories;
CREATE POLICY product_categories_member_select ON public.product_categories FOR SELECT TO authenticated
    USING (product_id IN (SELECT p.id FROM public.products p WHERE p.store_id IN (SELECT public.accessible_tenant_ids())));

-- -----------------------------------------------------------------------------
-- Views: run with the caller's rights, so the tables' RLS applies to them. They ran
-- as the owner and returned every shop's rows to anyone who could select them.
-- -----------------------------------------------------------------------------
ALTER VIEW public.v_avg_basket SET (security_invoker = true);
ALTER VIEW public.v_basket_analysis SET (security_invoker = true);
ALTER VIEW public.v_capital_traps SET (security_invoker = true);
ALTER VIEW public.v_category_daily_sales SET (security_invoker = true);
ALTER VIEW public.v_category_monthly_sales SET (security_invoker = true);
ALTER VIEW public.v_category_performance SET (security_invoker = true);
ALTER VIEW public.v_category_sales SET (security_invoker = true);
ALTER VIEW public.v_customer_geography SET (security_invoker = true);
ALTER VIEW public.v_daily_sales SET (security_invoker = true);
ALTER VIEW public.v_dashboard_summary SET (security_invoker = true);
ALTER VIEW public.v_ga4_daily_summary SET (security_invoker = true);
ALTER VIEW public.v_ga4_ecommerce_summary SET (security_invoker = true);
ALTER VIEW public.v_ga4_landing_pages SET (security_invoker = true);
ALTER VIEW public.v_ga4_top_products SET (security_invoker = true);
ALTER VIEW public.v_ga4_traffic_sources SET (security_invoker = true);
ALTER VIEW public.v_gsc_daily_summary SET (security_invoker = true);
ALTER VIEW public.v_hourly_analysis SET (security_invoker = true);
ALTER VIEW public.v_latest_kpi_snapshot SET (security_invoker = true);
ALTER VIEW public.v_monthly_sales SET (security_invoker = true);
ALTER VIEW public.v_order_status SET (security_invoker = true);
ALTER VIEW public.v_payment_methods SET (security_invoker = true);
ALTER VIEW public.v_product_sales SET (security_invoker = true);
ALTER VIEW public.v_shipping_methods SET (security_invoker = true);
ALTER VIEW public.v_slow_moving_products SET (security_invoker = true);
ALTER VIEW public.v_top_categories SET (security_invoker = true);
ALTER VIEW public.v_top_products SET (security_invoker = true);
ALTER VIEW public.v_top_profit_drivers SET (security_invoker = true);
ALTER VIEW public.v_weekday_analysis SET (security_invoker = true);
ALTER VIEW public.v_weekly_sales SET (security_invoker = true);

-- -----------------------------------------------------------------------------
-- SECURITY DEFINER functions that took a shop/store id without checking the caller:
-- the same bodies with public.assert_tenant_access() as the first statement.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_chat_message(p_session_id uuid, p_role text, p_content text, p_tokens_used integer DEFAULT NULL::integer, p_model_used text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_message_id UUID;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access((SELECT cs.store_id FROM public.chat_sessions cs WHERE cs.id = p_session_id));
  INSERT INTO chat_messages (session_id, role, content, tokens_used, model_used)
  VALUES (p_session_id, p_role, p_content, p_tokens_used, p_model_used)
  RETURNING id INTO new_message_id;

  UPDATE chat_sessions
  SET last_message_at = now(),
      title = COALESCE(title, LEFT(p_content, 50))
  WHERE id = p_session_id;

  RETURN new_message_id;
END;
$function$;

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
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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

CREATE OR REPLACE FUNCTION public.calculate_operational_metrics(p_store_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result JSONB;
    v_avg_fulfillment_days DECIMAL;
    v_orders_with_dispatch INTEGER;
    v_total_orders INTEGER;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.calculate_seo_metrics(p_store_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.create_chat_session(p_store_id uuid, p_language text DEFAULT 'sv'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_session_id UUID;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  INSERT INTO chat_sessions (store_id, language)
  VALUES (p_store_id, p_language)
  RETURNING id INTO new_session_id;
  RETURN new_session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_context_note(p_store_id uuid, p_note_type text, p_start_date date, p_end_date date, p_title text, p_description text DEFAULT NULL::text, p_related_metric text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_note_id UUID;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  INSERT INTO context_notes (
    store_id, note_type, start_date, end_date, title, description, related_metric, created_by
  ) VALUES (
    p_store_id, p_note_type, p_start_date, p_end_date, p_title, p_description, p_related_metric, auth.uid()
  )
  RETURNING id INTO v_note_id;

  RETURN v_note_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_daily_inventory_snapshot(p_store_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_count INTEGER := 0;
    v_snapshot_date DATE;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
    v_snapshot_date := (CURRENT_DATE - INTERVAL '1 day')::DATE;
    INSERT INTO inventory_snapshots (store_id, product_id, snapshot_date, stock_level, stock_value)
    SELECT
        p.store_id, p.id, v_snapshot_date,
        GREATEST(COALESCE(p.stock_level, 0), 0),
        GREATEST(COALESCE(p.stock_level, 0), 0) * COALESCE(p.cost_price, p.price_amount * 0.6, 0)
    FROM products p
    WHERE p.for_sale = true
      AND COALESCE(p.stock_tracked, true) = true
      AND (p_store_id IS NULL OR p.store_id = p_store_id)
    ON CONFLICT (store_id, product_id, snapshot_date)
    DO UPDATE SET stock_level = EXCLUDED.stock_level, stock_value = EXCLUDED.stock_value;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_ai_context(p_store_id uuid, p_granularity text DEFAULT 'week'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_dashboard JSONB;
    v_top_products JSONB;
    v_capital_traps JSONB;
    v_context JSONB;
    v_period_label TEXT;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.get_active_alerts_public(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_shop_id UUID;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  SELECT id INTO v_shop_id
  FROM shops
  WHERE store_id = p_store_id::text;

  IF v_shop_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'indicator_id', indicator_id,
          'alert_type', alert_type,
          'severity', severity,
          'title', title,
          'message', message,
          'indicator_value', indicator_value,
          'created_at', created_at
        )
        ORDER BY
          CASE severity
            WHEN 'critical' THEN 1
            WHEN 'warning' THEN 2
            ELSE 3
          END,
          created_at DESC
      )
      FROM alerts
      WHERE shop_id = v_shop_id
      AND acknowledged = false
    ),
    '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_goals(p_store_id uuid)
 RETURNS TABLE(id uuid, goal_type text, target_value numeric, period_type text, period_label text, current_value numeric, progress_percent numeric, is_active boolean, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  RETURN QUERY
  SELECT
    mg.id,
    mg.goal_type,
    mg.target_value,
    mg.period_type,
    mg.period_label,
    mg.current_value,
    mg.progress_percent,
    mg.is_active,
    mg.created_at
  FROM merchant_goals mg
  WHERE mg.store_id = p_store_id
    AND mg.is_active = TRUE
  ORDER BY mg.created_at DESC
  LIMIT 3;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_campaigns(p_store_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_active_only boolean DEFAULT false)
 RETURNS TABLE(id uuid, name text, campaign_type text, description text, coupon_code text, epages_campaign_id text, start_date date, end_date date, discount_type text, discount_value numeric, discount_given numeric, minimum_order numeric, is_active boolean, orders_count integer, revenue numeric, avg_order_value numeric, conversion_lift numeric, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  IF p_start_date IS NULL THEN p_start_date := '1900-01-01'::DATE; END IF;
  IF p_end_date IS NULL THEN p_end_date := '2100-12-31'::DATE; END IF;

  RETURN QUERY
  SELECT c.id, c.name, c.campaign_type, c.description, c.coupon_code,
    c.epages_campaign_id, c.start_date, c.end_date, c.discount_type,
    c.discount_value, c.discount_given, c.minimum_order, c.is_active,
    c.orders_count, c.revenue, c.avg_order_value, c.conversion_lift, c.created_at
  FROM campaigns c
  WHERE c.store_id = p_store_id
    AND c.start_date <= p_end_date AND c.end_date >= p_start_date
    AND (NOT p_active_only OR c.is_active = TRUE)
  ORDER BY c.start_date DESC;
END;
$function$;

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
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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

CREATE OR REPLACE FUNCTION public.get_chat_history(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access((SELECT cs.store_id FROM public.chat_sessions cs WHERE cs.id = p_session_id));
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'role', role,
        'content', content,
        'created_at', created_at
      )
      ORDER BY created_at ASC
    )
    FROM chat_messages
    WHERE session_id = p_session_id
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_context_notes(p_store_id uuid, p_start_date date, p_end_date date)
 RETURNS TABLE(id uuid, note_type text, start_date date, end_date date, title text, description text, related_metric text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  RETURN QUERY
  SELECT
    cn.id,
    cn.note_type,
    cn.start_date,
    cn.end_date,
    cn.title,
    cn.description,
    cn.related_metric,
    cn.created_at
  FROM context_notes cn
  WHERE cn.store_id = p_store_id
    AND cn.start_date <= p_end_date
    AND cn.end_date >= p_start_date
  ORDER BY cn.start_date DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_customer_segment_summary(p_store_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(segment text, order_count bigint, total_revenue numeric, total_cost numeric, gross_margin numeric, margin_percent numeric, avg_order_value numeric, unique_customers bigint, revenue_share numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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

CREATE OR REPLACE FUNCTION public.get_history_array(p_store_id uuid, p_metric text, p_days integer DEFAULT 90)
 RETURNS numeric[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_result DECIMAL[];
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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

CREATE OR REPLACE FUNCTION public.get_indicator_history_public(p_store_id uuid, p_indicator_id text, p_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_shop_id UUID;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  SELECT id INTO v_shop_id
  FROM shops
  WHERE store_id = p_store_id::text;

  IF v_shop_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', date,
          'value', value,
          'direction', direction
        )
        ORDER BY date ASC
      )
      FROM indicator_history
      WHERE shop_id = v_shop_id
      AND indicator_id = p_indicator_id
      AND date >= CURRENT_DATE - p_days
    ),
    '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_indicators_public(p_store_id uuid, p_period_label text DEFAULT '30d'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_shop_id UUID;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  -- Find shop by store_id
  SELECT id INTO v_shop_id
  FROM shops
  WHERE store_id = p_store_id::text;

  IF v_shop_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Return latest indicators for this shop and period (NO AUTH CHECK)
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'indicator_id', indicator_id,
          'category', indicator_category,
          'period_label', period_label,
          'period_start', period_start,
          'period_end', period_end,
          'value', value,
          'numeric_value', numeric_value,
          'direction', direction,
          'change_percent', change_percent,
          'priority', priority,
          'confidence', confidence,
          'alert_triggered', alert_triggered,
          'calculated_at', calculated_at
        )
        ORDER BY
          CASE priority
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END,
          indicator_id
      )
      FROM indicators
      WHERE shop_id = v_shop_id
      AND period_label = p_period_label
      AND period_end = (
        SELECT MAX(period_end)
        FROM indicators
        WHERE shop_id = v_shop_id
        AND period_label = p_period_label
      )
    ),
    '[]'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_inventory_history_aggregated(p_store_id uuid, p_days_back integer DEFAULT 365)
 RETURNS TABLE(snapshot_date date, total_value numeric, product_count bigint, bundle_value numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  RETURN QUERY
  SELECT
    s.snapshot_date,
    -- Stock held as components only. GREATEST guards the 745 legacy rows written
    -- before the snapshot function started clamping negative levels.
    -- COALESCE: a FILTER that matches nothing yields NULL, and the frontend drops
    -- NULL days out of the chart entirely.
    COALESCE(SUM(GREATEST(s.stock_value, 0)) FILTER (WHERE p.name !~* '(paket|bundle)'), 0)::NUMERIC AS total_value,
    COUNT(*) FILTER (WHERE p.name !~* '(paket|bundle)' AND s.stock_level > 0)::BIGINT AS product_count,
    -- Reported separately so the UI can show what was excluded rather than
    -- silently dropping half the number.
    COALESCE(SUM(GREATEST(s.stock_value, 0)) FILTER (WHERE p.name ~* '(paket|bundle)'), 0)::NUMERIC AS bundle_value
  FROM inventory_snapshots s
  JOIN products p ON p.id = s.product_id
  WHERE s.store_id = p_store_id
    AND s.snapshot_date >= CURRENT_DATE - p_days_back
  GROUP BY s.snapshot_date
  ORDER BY s.snapshot_date ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_kpi_dashboard(p_store_id uuid, p_granularity text DEFAULT 'week'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_current RECORD;
    v_previous RECORD;
    v_result JSONB;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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
$function$;

CREATE OR REPLACE FUNCTION public.get_latest_recommendations(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result JSONB;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  SELECT jsonb_build_object(
    'id', id,
    'week_number', week_number,
    'year', year,
    'recommendations', recommendations,
    'generated_at', generated_at
  )
  INTO result
  FROM action_recommendations
  WHERE store_id = p_store_id
  ORDER BY year DESC, week_number DESC
  LIMIT 1;
  RETURN COALESCE(result, '{"recommendations": []}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_latest_weekly_analysis(p_store_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result JSONB;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  SELECT jsonb_build_object(
    'id', id,
    'week_number', week_number,
    'year', year,
    'analysis_content', analysis_content,
    'generated_at', generated_at
  )
  INTO result
  FROM weekly_analyses
  WHERE store_id = p_store_id
  ORDER BY year DESC, week_number DESC
  LIMIT 1;
  RETURN COALESCE(result, '{}'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_order_bucket_distribution(p_store_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(bucket text, order_count bigint, total_revenue numeric, avg_order_value numeric, b2b_count bigint, b2c_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_config JSONB;
  v_low_threshold INT;
  v_high_threshold INT;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  -- Default dates if not provided
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  -- Get store config for bucket thresholds
  SELECT COALESCE(config, '{}'::JSONB) INTO v_config
  FROM stores
  WHERE id = p_store_id;

  -- Parse thresholds from JSON array: [low, high] e.g. [800, 1500]
  v_low_threshold := COALESCE((v_config->'order_buckets'->>0)::INT, 800);
  v_high_threshold := COALESCE((v_config->'order_buckets'->>1)::INT, 1500);

  -- Return bucket distribution using line items
  RETURN QUERY
  WITH order_totals AS (
    SELECT
      o.id,
      o.is_b2b,
      o.is_b2b_soft,
      COALESCE(SUM(li.total_price), 0) AS order_total
    FROM orders o
    LEFT JOIN order_line_items li ON li.order_id = o.id
    WHERE o.store_id = p_store_id
      AND o.creation_date::DATE >= p_start_date
      AND o.creation_date::DATE <= p_end_date
    GROUP BY o.id, o.is_b2b, o.is_b2b_soft
  )
  SELECT
    CASE
      WHEN ot.order_total < v_low_threshold THEN '0-' || v_low_threshold::TEXT
      WHEN ot.order_total < v_high_threshold THEN v_low_threshold::TEXT || '-' || v_high_threshold::TEXT
      ELSE v_high_threshold::TEXT || '+'
    END AS bucket,
    COUNT(*)::BIGINT AS order_count,
    ROUND(SUM(ot.order_total)::DECIMAL, 2) AS total_revenue,
    ROUND(AVG(ot.order_total)::DECIMAL, 2) AS avg_order_value,
    COUNT(*) FILTER (WHERE ot.is_b2b = TRUE OR ot.is_b2b_soft = TRUE)::BIGINT AS b2b_count,
    COUNT(*) FILTER (WHERE ot.is_b2b = FALSE AND (ot.is_b2b_soft = FALSE OR ot.is_b2b_soft IS NULL))::BIGINT AS b2c_count
  FROM order_totals ot
  GROUP BY
    CASE
      WHEN ot.order_total < v_low_threshold THEN '0-' || v_low_threshold::TEXT
      WHEN ot.order_total < v_high_threshold THEN v_low_threshold::TEXT || '-' || v_high_threshold::TEXT
      ELSE v_high_threshold::TEXT || '+'
    END
  ORDER BY
    MIN(CASE
      WHEN ot.order_total < v_low_threshold THEN 1
      WHEN ot.order_total < v_high_threshold THEN 2
      ELSE 3
    END);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_paste_consumption(p_shop_id uuid, p_days_back integer DEFAULT 90)
 RETURNS TABLE(external_id text, product_name text, category_prefix text, consumed_qty bigint, order_count bigint, total_spent numeric, avg_daily_consumption numeric, current_stock integer, current_list_price numeric, days_until_stockout numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_shop_id);
  v_cutoff_date := NOW() - (p_days_back || ' days')::INTERVAL;

  RETURN QUERY
  SELECT
    po.external_id,
    COALESCE(pp.name, po.product_name) AS product_name,
    pp.category_prefix,
    COALESCE(SUM(po.quantity), 0)::BIGINT AS consumed_qty,
    COUNT(DISTINCT po.order_number)::BIGINT AS order_count,
    COALESCE(SUM(po.total_price), 0)::NUMERIC AS total_spent,
    ROUND(COALESCE(SUM(po.quantity), 0)::NUMERIC / p_days_back, 3) AS avg_daily_consumption,
    COALESCE(pp.stock_level, 0) AS current_stock,
    pp.list_price AS current_list_price,
    CASE
      WHEN COALESCE(SUM(po.quantity), 0) > 0
        THEN ROUND(COALESCE(pp.stock_level, 0)::NUMERIC / (COALESCE(SUM(po.quantity), 0)::NUMERIC / p_days_back), 1)
      ELSE NULL
    END AS days_until_stockout
  FROM paste_orders po
  LEFT JOIN paste_products pp ON pp.shop_id = po.shop_id AND pp.external_id = po.external_id
  WHERE po.shop_id = p_shop_id
    AND po.order_date >= v_cutoff_date
  GROUP BY po.external_id, pp.name, po.product_name, pp.category_prefix, pp.stock_level, pp.list_price
  ORDER BY consumed_qty DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_paste_history(p_shop_id uuid, p_days_back integer DEFAULT 180)
 RETURNS TABLE(snapshot_date date, total_value numeric, product_count integer, total_stock integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_shop_id);
  RETURN QUERY
  SELECT
    s.snapshot_date,
    s.total_value,
    s.product_count,
    s.total_stock
  FROM paste_snapshots s
  WHERE s.shop_id = p_shop_id
    AND s.snapshot_date >= CURRENT_DATE - p_days_back
  ORDER BY s.snapshot_date ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_product_roles_summary(p_store_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date)
 RETURNS TABLE(role text, product_count bigint, total_units bigint, total_revenue numeric, avg_margin numeric, top_products jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_start_date DATE;
  v_end_date DATE;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  v_start_date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '90 days');
  v_end_date := COALESCE(p_end_date, CURRENT_DATE);

  RETURN QUERY
  SELECT
    pr.role::TEXT,
    COUNT(DISTINCT pr.product_id)::BIGINT AS product_count,
    SUM(pr.units_sold)::BIGINT AS total_units,
    ROUND(SUM(pr.revenue), 2) AS total_revenue,
    ROUND(AVG(pr.margin_percent), 1) AS avg_margin,
    (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'product_id', sub.product_id,
          'name', p.name,
          'units_sold', sub.units_sold,
          'revenue', sub.revenue
        ) ORDER BY sub.revenue DESC
      ), '[]'::jsonb)
      FROM (
        SELECT pr2.product_id, pr2.units_sold, pr2.revenue
        FROM product_roles pr2
        WHERE pr2.store_id = p_store_id
          AND pr2.role = pr.role
          AND pr2.period_start <= v_end_date
          AND pr2.period_end >= v_start_date
        ORDER BY pr2.revenue DESC
        LIMIT 5
      ) sub
      JOIN products p ON p.id = sub.product_id
    ) AS top_products
  FROM product_roles pr
  WHERE pr.store_id = p_store_id
    AND pr.period_start <= v_end_date
    AND pr.period_end >= v_start_date
  GROUP BY pr.role
  ORDER BY
    CASE pr.role
      WHEN 'hero' THEN 1
      WHEN 'anchor' THEN 2
      WHEN 'filler' THEN 3
      WHEN 'longtail' THEN 4
    END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_products_by_role(p_store_id uuid, p_role text, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_limit integer DEFAULT 20)
 RETURNS TABLE(product_id uuid, name text, sku text, units_sold integer, revenue numeric, orders_count integer, margin_percent numeric, avg_basket_size numeric, solo_purchase_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
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
    p.product_number AS sku,
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
$function$;

CREATE OR REPLACE FUNCTION public.get_saved_conversations(p_store_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, title text, user_note text, saved_at timestamp with time zone, created_at timestamp with time zone, message_count bigint, last_message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    -- Caller must belong to the shop (service role and direct DB sessions pass)
    PERFORM public.assert_tenant_access(p_store_id);
    RETURN QUERY
    SELECT
      cs.id,
      cs.title,
      cs.user_note,
      cs.saved_at,
      cs.created_at,
      (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id) as message_count,
      (SELECT cm.content FROM chat_messages cm
       WHERE cm.session_id = cs.id AND cm.role = 'user'
       ORDER BY cm.created_at ASC LIMIT 1) as last_message
    FROM chat_sessions cs
    WHERE cs.store_id = p_store_id
      AND cs.is_saved = TRUE
    ORDER BY cs.saved_at DESC
    LIMIT p_limit;
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.get_tracked_recommendations(p_store_id uuid, p_status text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, recommendation_id text, title text, why text, metric text, timeframe text, effort text, impact text, expected_result text, status text, user_notes text, progress_percent integer, started_at timestamp with time zone, completed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
     BEGIN
       -- Caller must belong to the shop (service role and direct DB sessions pass)
       PERFORM public.assert_tenant_access(p_store_id);
       RETURN QUERY
       SELECT
         tr.id,
         tr.recommendation_id,
         tr.title,
         tr.why,
         tr.metric,
         tr.timeframe,
         tr.effort,
         tr.impact,
         tr.expected_result,
         tr.status,
         tr.user_notes,
         tr.progress_percent,
         tr.started_at,
         tr.completed_at
       FROM tracked_recommendations tr
       WHERE tr.store_id = p_store_id
         AND (p_status IS NULL OR tr.status = p_status)
       ORDER BY
         CASE tr.status
           WHEN 'in_progress' THEN 0
           WHEN 'completed' THEN 1
           ELSE 2
         END,
         tr.started_at DESC;
     END;
     $function$;

CREATE OR REPLACE FUNCTION public.mark_recommendation_completed(p_store_id uuid, p_recommendation_id text, p_completed boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  rec_row action_recommendations%ROWTYPE;
  updated_recs JSONB;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  -- Hae viimeisin suosituslista
  SELECT * INTO rec_row
  FROM action_recommendations
  WHERE store_id = p_store_id
  ORDER BY year DESC, week_number DESC
  LIMIT 1;

  IF rec_row.id IS NULL THEN
    RETURN false;
  END IF;

  -- Päivitä suositus
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = p_recommendation_id THEN
        elem || jsonb_build_object(
          'completed_at', CASE WHEN p_completed THEN now() ELSE null END,
          'completed_by', auth.uid()
        )
      ELSE elem
    END
  )
  INTO updated_recs
  FROM jsonb_array_elements(rec_row.recommendations) elem;

  -- Tallenna päivitys
  UPDATE action_recommendations
  SET
    recommendations = updated_recs,
    updated_at = now()
  WHERE id = rec_row.id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_chat_session(p_session_id uuid, p_title text, p_user_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  DECLARE
    v_result JSONB;
  BEGIN
    -- Caller must belong to the shop (service role and direct DB sessions pass)
    PERFORM public.assert_tenant_access((SELECT cs.store_id FROM public.chat_sessions cs WHERE cs.id = p_session_id));
    UPDATE chat_sessions
    SET
      is_saved = TRUE,
      title = p_title,
      user_note = p_user_note,
      saved_at = NOW()
    WHERE id = p_session_id
    RETURNING jsonb_build_object(
      'id', id,
      'title', title,
      'user_note', user_note,
      'saved_at', saved_at
    ) INTO v_result;

    IF v_result IS NULL THEN
      RETURN jsonb_build_object('error', 'Session not found');
    END IF;

    RETURN v_result;
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.track_recommendation(p_store_id uuid, p_recommendation_id text, p_title text, p_why text DEFAULT NULL::text, p_metric text DEFAULT NULL::text, p_timeframe text DEFAULT NULL::text, p_effort text DEFAULT NULL::text, p_impact text DEFAULT NULL::text, p_expected_result text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
     DECLARE
       v_id UUID;
     BEGIN
       -- Caller must belong to the shop (service role and direct DB sessions pass)
       PERFORM public.assert_tenant_access(p_store_id);
       -- Check if already tracked (and not completed/cancelled)
       SELECT id INTO v_id
       FROM tracked_recommendations
       WHERE store_id = p_store_id
         AND recommendation_id = p_recommendation_id
         AND status = 'in_progress';

       IF v_id IS NOT NULL THEN
         -- Already tracking, return existing
         RETURN v_id;
       END IF;

       -- Insert new tracked recommendation
       INSERT INTO tracked_recommendations (
         store_id,
         recommendation_id,
         title,
         why,
         metric,
         timeframe,
         effort,
         impact,
         expected_result
       ) VALUES (
         p_store_id,
         p_recommendation_id,
         p_title,
         p_why,
         p_metric,
         p_timeframe,
         p_effort,
         p_impact,
         p_expected_result
       )
       RETURNING id INTO v_id;

       RETURN v_id;
     END;
     $function$;

CREATE OR REPLACE FUNCTION public.unsave_chat_session(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    -- Caller must belong to the shop (service role and direct DB sessions pass)
    PERFORM public.assert_tenant_access((SELECT cs.store_id FROM public.chat_sessions cs WHERE cs.id = p_session_id));
    UPDATE chat_sessions
    SET is_saved = FALSE, saved_at = NULL
    WHERE id = p_session_id;

    RETURN FOUND;
  END;
  $function$;

CREATE OR REPLACE FUNCTION public.update_tracked_recommendation(p_id uuid, p_status text DEFAULT NULL::text, p_progress_percent integer DEFAULT NULL::integer, p_user_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
     BEGIN
       -- Caller must belong to the shop (service role and direct DB sessions pass)
       PERFORM public.assert_tenant_access((SELECT tr.store_id FROM public.tracked_recommendations tr WHERE tr.id = p_id));
       UPDATE tracked_recommendations
       SET
         status = COALESCE(p_status, status),
         progress_percent = COALESCE(p_progress_percent, progress_percent),
         user_notes = COALESCE(p_user_notes, user_notes),
         completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
       WHERE id = p_id;

       RETURN FOUND;
     END;
     $function$;

CREATE OR REPLACE FUNCTION public.upsert_customer_from_order(p_store_id uuid, p_epages_customer_id text, p_customer_number text, p_email text, p_company text, p_city text, p_country text, p_postal_code text, p_order_total numeric, p_order_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_customer_id UUID;
  v_email_hash TEXT;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  -- Calculate email hash if email provided
  IF p_email IS NOT NULL AND p_email != '' THEN
    v_email_hash := encode(sha256(lower(trim(p_email))::bytea), 'hex');
  END IF;

  -- Try to find existing customer by epages_customer_id or email_hash
  SELECT id INTO v_customer_id
  FROM customers
  WHERE store_id = p_store_id
    AND (
      epages_customer_id = p_epages_customer_id
      OR (v_email_hash IS NOT NULL AND email_hash = v_email_hash)
    )
  LIMIT 1;

  IF v_customer_id IS NOT NULL THEN
    -- Update existing customer
    UPDATE customers
    SET
      customer_number = COALESCE(p_customer_number, customer_number),
      email_hash = COALESCE(v_email_hash, email_hash),
      company = COALESCE(p_company, company),
      city = COALESCE(p_city, city),
      country = COALESCE(p_country, country),
      postal_code = COALESCE(p_postal_code, postal_code),
      last_order_date = GREATEST(last_order_date, p_order_date),
      first_order_date = LEAST(first_order_date, p_order_date),
      total_orders = total_orders + 1,
      total_spent = total_spent + COALESCE(p_order_total, 0),
      updated_at = NOW()
    WHERE id = v_customer_id;
  ELSE
    -- Insert new customer
    INSERT INTO customers (
      store_id,
      epages_customer_id,
      customer_number,
      email_hash,
      company,
      city,
      country,
      postal_code,
      first_order_date,
      last_order_date,
      total_orders,
      total_spent
    ) VALUES (
      p_store_id,
      p_epages_customer_id,
      p_customer_number,
      v_email_hash,
      p_company,
      p_city,
      p_country,
      p_postal_code,
      p_order_date,
      p_order_date,
      1,
      COALESCE(p_order_total, 0)
    )
    RETURNING id INTO v_customer_id;
  END IF;

  RETURN v_customer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.upsert_goal(p_store_id uuid, p_goal_type text, p_target_value numeric, p_period_type text, p_period_label text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_goal_id UUID;
BEGIN
  -- Caller must belong to the shop (service role and direct DB sessions pass)
  PERFORM public.assert_tenant_access(p_store_id);
  -- Try to find existing goal
  SELECT id INTO v_goal_id
  FROM merchant_goals
  WHERE store_id = p_store_id
    AND goal_type = p_goal_type
    AND period_label = p_period_label;

  IF v_goal_id IS NOT NULL THEN
    -- Update existing
    UPDATE merchant_goals
    SET target_value = p_target_value,
        period_type = p_period_type,
        is_active = TRUE,
        updated_at = NOW()
    WHERE id = v_goal_id;
  ELSE
    -- Insert new
    INSERT INTO merchant_goals (store_id, goal_type, target_value, period_type, period_label, is_active)
    VALUES (p_store_id, p_goal_type, p_target_value, p_period_type, p_period_label, TRUE)
    RETURNING id INTO v_goal_id;
  END IF;

  RETURN v_goal_id;
END;
$function$;

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- anon: nothing in public. The app reads data only after sign-in.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, PUBLIC;

-- Explicit grants, so nothing depended on the PUBLIC grant revoked above
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Server-only (crons, API routes, edge functions with the service role key)
REVOKE EXECUTE ON FUNCTION public.calculate_core_metrics(uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_operational_metrics(uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_seo_metrics(uuid, date, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_daily_inventory_snapshot(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_ai_context(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_history_array(uuid, text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_customer_from_order(uuid, text, text, text, text, text, text, text, numeric, date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_emma_documents(uuid, interval) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.search_emma_documents(uuid, vector, integer, text[], text[], double precision) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_emma_document(uuid, text, text, text, jsonb, text, vector, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.margin_pricing(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.priced_margin_rows(uuid, timestamp with time zone, timestamp with time zone) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.margin_totals(uuid, timestamp with time zone, timestamp with time zone) FROM authenticated;
