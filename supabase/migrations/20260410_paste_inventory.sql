-- Paste Inventory (Sävytysvarasto)
-- Separate inventory tracking for color mixing pastes from external ePages system
-- Uses shop_id (not store_id) since this is a separate system from main ePages store

-- 1. paste_products - current state from CSV export
CREATE TABLE IF NOT EXISTS paste_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  stock_level INTEGER DEFAULT 0,
  cost_price NUMERIC(10,2),
  list_price NUMERIC(10,2),
  manufacturer TEXT,
  category_prefix TEXT,
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_paste_products_shop ON paste_products(shop_id);
CREATE INDEX IF NOT EXISTS idx_paste_products_category ON paste_products(shop_id, category_prefix);

-- 2. paste_snapshots - daily aggregated snapshots for value trend tracking
CREATE TABLE IF NOT EXISTS paste_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_value NUMERIC(12,2) DEFAULT 0,
  product_count INTEGER DEFAULT 0,
  total_stock INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_paste_snapshots_shop_date ON paste_snapshots(shop_id, snapshot_date DESC);

-- 3. paste_orders - order data = consumption (from XML export)
CREATE TABLE IF NOT EXISTS paste_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  order_date TIMESTAMPTZ NOT NULL,
  external_id TEXT NOT NULL,
  product_name TEXT,
  quantity INTEGER DEFAULT 1,
  unit_price NUMERIC(10,2),
  total_price NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(shop_id, order_number, external_id)
);

CREATE INDEX IF NOT EXISTS idx_paste_orders_shop_date ON paste_orders(shop_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_paste_orders_product ON paste_orders(shop_id, external_id);

-- 4. RLS policies
ALTER TABLE paste_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE paste_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE paste_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view paste_products" ON paste_products FOR SELECT
USING (EXISTS (
  SELECT 1 FROM shop_members sm
  WHERE sm.shop_id = paste_products.shop_id AND sm.user_id = auth.uid()
));

CREATE POLICY "Members can view paste_snapshots" ON paste_snapshots FOR SELECT
USING (EXISTS (
  SELECT 1 FROM shop_members sm
  WHERE sm.shop_id = paste_snapshots.shop_id AND sm.user_id = auth.uid()
));

CREATE POLICY "Members can view paste_orders" ON paste_orders FOR SELECT
USING (EXISTS (
  SELECT 1 FROM shop_members sm
  WHERE sm.shop_id = paste_orders.shop_id AND sm.user_id = auth.uid()
));

-- 5. RPC: get_paste_consumption - calculates consumption per product from order data
CREATE OR REPLACE FUNCTION get_paste_consumption(
  p_shop_id UUID,
  p_days_back INT DEFAULT 90
)
RETURNS TABLE (
  external_id TEXT,
  product_name TEXT,
  category_prefix TEXT,
  consumed_qty BIGINT,
  order_count BIGINT,
  total_spent NUMERIC,
  avg_daily_consumption NUMERIC,
  current_stock INTEGER,
  current_list_price NUMERIC,
  days_until_stockout NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
BEGIN
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
$$;

COMMENT ON FUNCTION get_paste_consumption IS 'Calculates paste consumption from order data over given period';

-- 6. RPC: get_paste_history - aggregated snapshots for value trend chart
CREATE OR REPLACE FUNCTION get_paste_history(
  p_shop_id UUID,
  p_days_back INT DEFAULT 180
)
RETURNS TABLE (
  snapshot_date DATE,
  total_value NUMERIC,
  product_count INTEGER,
  total_stock INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
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
$$;

COMMENT ON FUNCTION get_paste_history IS 'Returns daily paste inventory value snapshots for trend charts';
