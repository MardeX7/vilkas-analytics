-- ============================================================
-- RLS Security Fix - Enable RLS on all unprotected tables
-- Date: 2026-03-25
-- Reason: Supabase Security Advisor flagged these tables
-- ============================================================

-- ============================================================
-- 1. Core tables (stores, categories)
-- ============================================================

-- stores: shop members should be able to read
ALTER TABLE IF EXISTS public.stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Shop members can view stores"
  ON public.stores FOR SELECT
  USING (
    auth.uid() IN (
      SELECT user_id FROM public.shop_members
      WHERE shop_id = stores.id
    )
  );

-- categories: read-only reference data, authenticated users can view
ALTER TABLE IF EXISTS public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view categories"
  ON public.categories FOR SELECT
  USING (auth.role() = 'authenticated');

-- product_categories: read-only reference data
ALTER TABLE IF EXISTS public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view product_categories"
  ON public.product_categories FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================================
-- 2. GSC data
-- ============================================================

ALTER TABLE IF EXISTS public.gsc_search_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for gsc_search_analytics"
  ON public.gsc_search_analytics FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- 3. KPI / Analytics tables (service_role only)
--    These are populated by backend functions, not browser
-- ============================================================

ALTER TABLE IF EXISTS public.kpi_index_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for kpi_index_snapshots"
  ON public.kpi_index_snapshots FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE IF EXISTS public.inventory_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for inventory_snapshots"
  ON public.inventory_snapshots FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE IF EXISTS public.product_profitability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for product_profitability"
  ON public.product_profitability FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE IF EXISTS public.seo_performance_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for seo_performance_metrics"
  ON public.seo_performance_metrics FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE IF EXISTS public.ai_context_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for ai_context_snapshots"
  ON public.ai_context_snapshots FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE IF EXISTS public.marketing_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for marketing_costs"
  ON public.marketing_costs FOR ALL
  USING (auth.role() = 'service_role');

ALTER TABLE IF EXISTS public.kpi_calculation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only for kpi_calculation_log"
  ON public.kpi_calculation_log FOR ALL
  USING (auth.role() = 'service_role');
