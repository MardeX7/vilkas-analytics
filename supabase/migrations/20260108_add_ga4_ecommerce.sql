-- GA4 E-commerce data table
-- Stores product performance data from Google Analytics 4

CREATE TABLE IF NOT EXISTS ga4_ecommerce (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  property_id text NOT NULL,
  date date NOT NULL,

  -- Product identification
  item_id text,
  item_name text NOT NULL,
  item_category text,
  item_brand text,

  -- E-commerce metrics
  items_viewed integer DEFAULT 0,
  items_added_to_cart integer DEFAULT 0,
  items_purchased integer DEFAULT 0,
  item_revenue numeric(12,2) DEFAULT 0,

  -- Calculated metrics (for convenience)
  view_to_cart_rate numeric(5,4),  -- items_added_to_cart / items_viewed
  cart_to_purchase_rate numeric(5,4),  -- items_purchased / items_added_to_cart

  created_at timestamptz DEFAULT now(),

  -- Prevent duplicates
  UNIQUE(store_id, date, item_name)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_ga4_ecommerce_store_date ON ga4_ecommerce(store_id, date);
CREATE INDEX IF NOT EXISTS idx_ga4_ecommerce_item_name ON ga4_ecommerce(store_id, item_name);

-- Daily summary view for E-commerce
CREATE OR REPLACE VIEW v_ga4_ecommerce_summary AS
SELECT
  store_id,
  date,
  COUNT(DISTINCT item_name) as unique_products,
  SUM(items_viewed) as total_views,
  SUM(items_added_to_cart) as total_add_to_cart,
  SUM(items_purchased) as total_purchased,
  SUM(item_revenue) as total_revenue,
  CASE WHEN SUM(items_viewed) > 0
    THEN SUM(items_added_to_cart)::numeric / SUM(items_viewed)
    ELSE 0
  END as avg_view_to_cart_rate,
  CASE WHEN SUM(items_added_to_cart) > 0
    THEN SUM(items_purchased)::numeric / SUM(items_added_to_cart)
    ELSE 0
  END as avg_cart_to_purchase_rate
FROM ga4_ecommerce
GROUP BY store_id, date
ORDER BY date DESC;

-- Top products view (aggregated)
CREATE OR REPLACE VIEW v_ga4_top_products AS
SELECT
  store_id,
  item_name,
  item_category,
  SUM(items_viewed) as total_views,
  SUM(items_added_to_cart) as total_add_to_cart,
  SUM(items_purchased) as total_purchased,
  SUM(item_revenue) as total_revenue,
  CASE WHEN SUM(items_viewed) > 0
    THEN SUM(items_added_to_cart)::numeric / SUM(items_viewed)
    ELSE 0
  END as view_to_cart_rate,
  CASE WHEN SUM(items_added_to_cart) > 0
    THEN SUM(items_purchased)::numeric / SUM(items_added_to_cart)
    ELSE 0
  END as cart_to_purchase_rate
FROM ga4_ecommerce
GROUP BY store_id, item_name, item_category;

-- Enable RLS
ALTER TABLE ga4_ecommerce ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own shop's data
-- Uses existing user_has_shop_access function from 008_fix_shop_members_rls.sql
CREATE POLICY "Users can view own shop ga4_ecommerce"
  ON ga4_ecommerce FOR SELECT
  USING (user_has_shop_access(store_id));

-- Service role can do everything
CREATE POLICY "Service role full access ga4_ecommerce"
  ON ga4_ecommerce FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE ga4_ecommerce IS 'GA4 E-commerce product performance data';
