-- Update get_user_shops() to return currency and domain for multi-tenant frontend
-- Must drop first because return type changes (adding currency, domain columns)
DROP FUNCTION IF EXISTS get_user_shops();

CREATE OR REPLACE FUNCTION get_user_shops()
RETURNS TABLE (
  shop_id UUID,
  shop_name TEXT,
  store_id TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ,
  currency TEXT,
  domain TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS shop_id,
    s.name AS shop_name,
    s.store_id,
    sm.role,
    sm.joined_at,
    s.currency,
    s.domain
  FROM shop_members sm
  JOIN shops s ON s.id = sm.shop_id
  WHERE sm.user_id = auth.uid();
END;
$$;
