-- =============================================================================
-- Settings page: member and invitation lists always failed
-- =============================================================================
--
-- Both functions have raised since 005_auth_system.sql. RETURNS TABLE declares its
-- columns as PL/pgSQL variables, so the unqualified user_id and role in the admin
-- check are ambiguous (42702: "column reference ... is ambiguous"). The settings
-- page therefore showed no members and no pending invitations.
--
-- Same bodies; only the membership check now qualifies its columns.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_shop_members(p_shop_id uuid)
 RETURNS TABLE(id uuid, user_id uuid, email text, full_name text, role text, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Check if caller is member of this shop
  IF NOT EXISTS (
    SELECT 1 FROM shop_members sm
    WHERE sm.shop_id = p_shop_id
    AND sm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not a member of this shop';
  END IF;

  RETURN QUERY
  SELECT
    sm.id,
    sm.user_id,
    p.email,
    p.full_name,
    sm.role,
    sm.joined_at
  FROM shop_members sm
  JOIN profiles p ON p.id = sm.user_id
  WHERE sm.shop_id = p_shop_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_shop_invitations(p_shop_id uuid)
 RETURNS TABLE(id uuid, email text, role text, invited_at timestamp with time zone, expires_at timestamp with time zone, invited_by_email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM shop_members sm
    WHERE sm.shop_id = p_shop_id
    AND sm.user_id = auth.uid()
    AND sm.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can view invitations';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.email,
    i.role,
    i.created_at AS invited_at,
    i.expires_at,
    p.email AS invited_by_email
  FROM invitations i
  LEFT JOIN profiles p ON p.id = i.invited_by
  WHERE i.shop_id = p_shop_id
  AND i.accepted_at IS NULL
  AND i.expires_at > NOW();
END;
$function$;
