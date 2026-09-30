-- =============================================================================
-- Follow-ups to 20260929_lock_down_access.sql, found in its review
-- =============================================================================

-- -----------------------------------------------------------------------------
-- stores: members read their own store row, never its ePages API token
-- -----------------------------------------------------------------------------
--
-- The only SELECT policy on stores compared shop_members.shop_id to stores.id.
-- Those are different ids (shops.id vs the ePages store id), so it never matched
-- and members read 0 rows. That failure happened to protect stores.access_token,
-- the ePages API token, which authenticated could otherwise select: the table
-- had full privileges and no column restriction.
--
-- 20260929_lock_down_access.sql made v_dashboard_summary security_invoker, and
-- the view starts FROM stores, so it has returned 0 rows to members since.
-- Nothing in the app reads it today; it works again after this.
--
-- The token is read only by crons and edge functions on the service role, and
-- the frontend never reads stores.

REVOKE ALL ON public.stores FROM authenticated;
GRANT SELECT (id, epages_shop_id, name, domain, currency, locale, created_at, updated_at, config)
    ON public.stores TO authenticated;

DROP POLICY IF EXISTS "Shop members can view stores" ON public.stores;
DROP POLICY IF EXISTS stores_member_select ON public.stores;
CREATE POLICY stores_member_select ON public.stores FOR SELECT TO authenticated
    USING (id IN (SELECT public.accessible_tenant_ids()));

-- -----------------------------------------------------------------------------
-- SECURITY DEFINER functions without a fixed search_path. Not exploitable today
-- (authenticated cannot create objects in public), but every other definer
-- function pins it, and a future grant should not turn these into a hole.
-- -----------------------------------------------------------------------------
ALTER FUNCTION public.add_chat_message(uuid, text, text, integer, text) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.create_chat_session(uuid, text) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_chat_history(uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_latest_recommendations(uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_latest_weekly_analysis(uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_paste_consumption(uuid, integer) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_paste_history(uuid, integer) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_saved_conversations(uuid, integer) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_tracked_recommendations(uuid, text) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.mark_recommendation_completed(uuid, text, boolean) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.save_chat_session(uuid, text, text) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.track_recommendation(uuid, text, text, text, text, text, text, text, text) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.unsave_chat_session(uuid) SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.update_tracked_recommendation(uuid, text, integer, text) SET search_path TO 'public', 'pg_temp';

-- -----------------------------------------------------------------------------
-- New functions were still executable by anon
-- -----------------------------------------------------------------------------
-- 20260929 revoked FUNCTIONS FROM anon, PUBLIC in the per-schema default
-- privileges. For PUBLIC that does nothing. The Postgres docs, ALTER DEFAULT
-- PRIVILEGES, use this very statement as the example:
--   "This command has no effect, unless it is undoing a matching GRANT:
--    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
--    That's because per-schema default privileges can only add privileges to the
--    global setting, not remove privileges granted by it."
-- postgres has no global entry, so every new function would again be callable
-- by anon through PUBLIC. Revoked globally, the per-schema entry still grants
-- authenticated and service_role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
