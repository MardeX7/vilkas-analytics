-- ============================================================================
-- PHASE 3b: Campaign Intelligence - Add ePages integration
-- ============================================================================

-- Add epages_campaign_id column for syncing with ePages API
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS epages_campaign_id TEXT;

-- Add discount_given column to track actual discount amounts
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS discount_given DECIMAL DEFAULT 0;

-- Add minimum_order column
ALTER TABLE campaigns
ADD COLUMN IF NOT EXISTS minimum_order DECIMAL DEFAULT 0;

-- Fix discount_type to include more options
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_discount_type_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_discount_type_check
  CHECK (discount_type IN ('percentage', 'fixed', 'fixed_amount', 'none', 'unknown'));

-- Create unique index for ePages campaign deduplication
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_epages_id
ON campaigns(store_id, epages_campaign_id) WHERE epages_campaign_id IS NOT NULL;

-- Update RPC to include new columns
CREATE OR REPLACE FUNCTION get_campaigns(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_active_only BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  campaign_type TEXT,
  description TEXT,
  coupon_code TEXT,
  epages_campaign_id TEXT,
  start_date DATE,
  end_date DATE,
  discount_type TEXT,
  discount_value DECIMAL,
  discount_given DECIMAL,
  minimum_order DECIMAL,
  is_active BOOLEAN,
  orders_count INT,
  revenue DECIMAL,
  avg_order_value DECIMAL,
  conversion_lift DECIMAL,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Default to all time if no dates provided
  IF p_start_date IS NULL THEN
    p_start_date := '1900-01-01'::DATE;
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := '2100-12-31'::DATE;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.campaign_type,
    c.description,
    c.coupon_code,
    c.epages_campaign_id,
    c.start_date,
    c.end_date,
    c.discount_type,
    c.discount_value,
    c.discount_given,
    c.minimum_order,
    c.is_active,
    c.orders_count,
    c.revenue,
    c.avg_order_value,
    c.conversion_lift,
    c.created_at
  FROM campaigns c
  WHERE c.store_id = p_store_id
    AND c.start_date <= p_end_date
    AND c.end_date >= p_start_date
    AND (NOT p_active_only OR c.is_active = TRUE)
  ORDER BY c.start_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_campaigns TO authenticated;
GRANT EXECUTE ON FUNCTION get_campaigns TO service_role;

COMMENT ON COLUMN campaigns.epages_campaign_id IS 'ePages coupon campaign ID for syncing';
COMMENT ON COLUMN campaigns.discount_given IS 'Total discount amount given during campaign';
