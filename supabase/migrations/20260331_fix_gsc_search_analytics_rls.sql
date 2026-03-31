-- Fix gsc_search_analytics RLS policy
-- Problem: The 20260325 security fix set "service_role only" on gsc_search_analytics,
-- which blocks all browser queries. This causes the Search Console page to show
-- 0 keywords, empty tables (top queries, top pages, devices, countries).
--
-- Solution: Allow shop members to SELECT (same pattern as gsc_daily_totals),
-- keep service_role for INSERT/UPDATE/DELETE (sync writes from server).
-- Link: shop_members.shop_id -> shops.id -> shops.store_id (TEXT) -> gsc_search_analytics.store_id (UUID)

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Service role only for gsc_search_analytics" ON public.gsc_search_analytics;

-- Allow shop members to read their own store's GSC search analytics
CREATE POLICY "Shop members can view gsc_search_analytics"
  ON public.gsc_search_analytics FOR SELECT
  USING (
    store_id::text IN (
      SELECT s.store_id FROM shops s
      INNER JOIN shop_members sm ON sm.shop_id = s.id
      WHERE sm.user_id = auth.uid()
    )
  );

-- Allow service_role full access for sync operations (INSERT/UPDATE/DELETE)
CREATE POLICY "Service role full access for gsc_search_analytics"
  ON public.gsc_search_analytics FOR ALL
  USING (auth.role() = 'service_role');
