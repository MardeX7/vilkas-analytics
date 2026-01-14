-- ============================================================================
-- KPI Intelligence Layer v1 - Phase 1: B2B/B2C, Order Buckets, Customers
-- Migration: 20260112_kpi_intelligence_layer_v1.sql
-- ============================================================================
-- This migration adds:
-- 1. B2B/B2C identification fields to orders
-- 2. Extended customer tracking with email_hash
-- 3. Store configuration for order buckets
-- 4. RPC functions for segment analysis
-- ============================================================================

-- ============================================================================
-- 1. ORDERS TABLE EXTENSIONS
-- ============================================================================

-- Add B2B identification fields
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS is_b2b BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_b2b_soft BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS billing_vat_id TEXT;

-- Add index for B2B filtering
CREATE INDEX IF NOT EXISTS idx_orders_is_b2b ON orders(is_b2b);
CREATE INDEX IF NOT EXISTS idx_orders_is_b2b_soft ON orders(is_b2b_soft);

COMMENT ON COLUMN orders.is_b2b IS 'True if customer has VAT ID (confirmed B2B)';
COMMENT ON COLUMN orders.is_b2b_soft IS 'True if customer has company name but no VAT ID (probable B2B)';
COMMENT ON COLUMN orders.billing_vat_id IS 'Customer VAT ID from billing address';

-- ============================================================================
-- 2. CUSTOMERS TABLE EXTENSIONS
-- ============================================================================

-- Add missing columns to customers table
ALTER TABLE customers
ADD COLUMN IF NOT EXISTS email_hash TEXT,
ADD COLUMN IF NOT EXISTS postal_code TEXT,
ADD COLUMN IF NOT EXISTS is_b2b_override BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS first_order_date DATE,
ADD COLUMN IF NOT EXISTS last_order_date DATE,
ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_spent DECIMAL(12,2) DEFAULT 0;

-- Add indexes for customer lookups
CREATE INDEX IF NOT EXISTS idx_customers_email_hash ON customers(email_hash);
CREATE INDEX IF NOT EXISTS idx_customers_store_id ON customers(store_id);

COMMENT ON COLUMN customers.email_hash IS 'SHA256 hash of lowercase trimmed email for privacy-safe matching';
COMMENT ON COLUMN customers.is_b2b_override IS 'Manual B2B override: NULL=auto, TRUE=force B2B, FALSE=force B2C';
COMMENT ON COLUMN customers.first_order_date IS 'Date of first order';
COMMENT ON COLUMN customers.last_order_date IS 'Date of most recent order';
COMMENT ON COLUMN customers.total_orders IS 'Total number of orders';
COMMENT ON COLUMN customers.total_spent IS 'Total amount spent (gross)';

-- ============================================================================
-- 3. STORES TABLE EXTENSION
-- ============================================================================

-- Add config JSONB for store-level settings
ALTER TABLE stores
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}';

COMMENT ON COLUMN stores.config IS 'Store configuration: order_buckets, b2b_override_enabled, etc.';

-- Set default config for existing stores
UPDATE stores
SET config = '{
  "order_buckets": [800, 1500],
  "b2b_override_enabled": true,
  "context_notes_enabled": true
}'::jsonb
WHERE config = '{}' OR config IS NULL;

-- ============================================================================
-- 4. RPC: GET ORDER BUCKET DISTRIBUTION
-- ============================================================================

CREATE OR REPLACE FUNCTION get_order_bucket_distribution(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  bucket TEXT,
  order_count BIGINT,
  total_revenue DECIMAL,
  avg_order_value DECIMAL,
  b2b_count BIGINT,
  b2c_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_buckets INT[];
  v_bucket_low INT;
  v_bucket_high INT;
BEGIN
  -- Get bucket configuration from store
  SELECT COALESCE(
    (config->>'order_buckets')::INT[],
    ARRAY[500, 1000]
  ) INTO v_buckets
  FROM stores
  WHERE id = p_store_id;

  -- Default dates if not provided
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  -- Return bucket distribution
  RETURN QUERY
  WITH bucket_config AS (
    SELECT
      v_buckets[1] AS low_threshold,
      v_buckets[2] AS high_threshold
  ),
  order_buckets AS (
    SELECT
      o.id,
      o.grand_total,
      o.is_b2b,
      o.is_b2b_soft,
      CASE
        WHEN o.grand_total < (SELECT low_threshold FROM bucket_config) THEN
          '0-' || (SELECT low_threshold FROM bucket_config)::TEXT
        WHEN o.grand_total < (SELECT high_threshold FROM bucket_config) THEN
          (SELECT low_threshold FROM bucket_config)::TEXT || '-' || (SELECT high_threshold FROM bucket_config)::TEXT
        ELSE
          (SELECT high_threshold FROM bucket_config)::TEXT || '+'
      END AS bucket_name,
      CASE
        WHEN o.grand_total < (SELECT low_threshold FROM bucket_config) THEN 1
        WHEN o.grand_total < (SELECT high_threshold FROM bucket_config) THEN 2
        ELSE 3
      END AS bucket_order
    FROM orders o
    WHERE o.store_id = p_store_id
      AND o.creation_date::DATE >= p_start_date
      AND o.creation_date::DATE <= p_end_date
  )
  SELECT
    ob.bucket_name AS bucket,
    COUNT(*)::BIGINT AS order_count,
    ROUND(SUM(ob.grand_total)::DECIMAL, 2) AS total_revenue,
    ROUND(AVG(ob.grand_total)::DECIMAL, 2) AS avg_order_value,
    COUNT(*) FILTER (WHERE ob.is_b2b = TRUE OR ob.is_b2b_soft = TRUE)::BIGINT AS b2b_count,
    COUNT(*) FILTER (WHERE ob.is_b2b = FALSE AND ob.is_b2b_soft = FALSE)::BIGINT AS b2c_count
  FROM order_buckets ob
  GROUP BY ob.bucket_name, ob.bucket_order
  ORDER BY ob.bucket_order;
END;
$$;

COMMENT ON FUNCTION get_order_bucket_distribution IS 'Returns order distribution by value buckets with B2B/B2C breakdown';

-- ============================================================================
-- 5. RPC: GET CUSTOMER SEGMENT SUMMARY
-- ============================================================================

CREATE OR REPLACE FUNCTION get_customer_segment_summary(
  p_store_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  segment TEXT,
  order_count BIGINT,
  total_revenue DECIMAL,
  avg_order_value DECIMAL,
  unique_customers BIGINT,
  revenue_share DECIMAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_revenue DECIMAL;
BEGIN
  -- Default dates if not provided
  IF p_start_date IS NULL THEN
    p_start_date := CURRENT_DATE - INTERVAL '30 days';
  END IF;
  IF p_end_date IS NULL THEN
    p_end_date := CURRENT_DATE;
  END IF;

  -- Calculate total revenue for share calculation
  SELECT COALESCE(SUM(grand_total), 0) INTO v_total_revenue
  FROM orders
  WHERE store_id = p_store_id
    AND creation_date::DATE >= p_start_date
    AND creation_date::DATE <= p_end_date;

  -- Return segment summary
  RETURN QUERY
  SELECT
    CASE
      WHEN o.is_b2b = TRUE THEN 'B2B'
      WHEN o.is_b2b_soft = TRUE THEN 'B2B (soft)'
      ELSE 'B2C'
    END AS segment,
    COUNT(*)::BIGINT AS order_count,
    ROUND(SUM(o.grand_total)::DECIMAL, 2) AS total_revenue,
    ROUND(AVG(o.grand_total)::DECIMAL, 2) AS avg_order_value,
    COUNT(DISTINCT o.customer_id)::BIGINT AS unique_customers,
    CASE
      WHEN v_total_revenue > 0 THEN
        ROUND((SUM(o.grand_total) / v_total_revenue * 100)::DECIMAL, 1)
      ELSE 0
    END AS revenue_share
  FROM orders o
  WHERE o.store_id = p_store_id
    AND o.creation_date::DATE >= p_start_date
    AND o.creation_date::DATE <= p_end_date
  GROUP BY
    CASE
      WHEN o.is_b2b = TRUE THEN 'B2B'
      WHEN o.is_b2b_soft = TRUE THEN 'B2B (soft)'
      ELSE 'B2C'
    END
  ORDER BY total_revenue DESC;
END;
$$;

COMMENT ON FUNCTION get_customer_segment_summary IS 'Returns B2B/B2C segment summary with revenue share';

-- ============================================================================
-- 6. RPC: UPSERT CUSTOMER FROM ORDER
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_customer_from_order(
  p_store_id UUID,
  p_epages_customer_id TEXT,
  p_customer_number TEXT,
  p_email TEXT,
  p_company TEXT,
  p_city TEXT,
  p_country TEXT,
  p_postal_code TEXT,
  p_order_total DECIMAL,
  p_order_date DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id UUID;
  v_email_hash TEXT;
BEGIN
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
$$;

COMMENT ON FUNCTION upsert_customer_from_order IS 'Creates or updates customer record from order data, returns customer_id';

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permissions on new functions
GRANT EXECUTE ON FUNCTION get_order_bucket_distribution TO authenticated;
GRANT EXECUTE ON FUNCTION get_order_bucket_distribution TO service_role;
GRANT EXECUTE ON FUNCTION get_customer_segment_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_customer_segment_summary TO service_role;
GRANT EXECUTE ON FUNCTION upsert_customer_from_order TO service_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
