-- =====================================================
-- VILKAS ANALYTICS - ORDER ITEMS
-- Migration: Create order_items table for line item data
-- Date: 2026-01-06
-- =====================================================

-- Create order_items table
CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  epages_product_id TEXT,
  product_id UUID REFERENCES products(id),
  sku TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL,
  line_total DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'SEK',
  tax_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_items_shop_id ON order_items(shop_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_sku ON order_items(sku);

-- Enable RLS
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy - allow service role full access
CREATE POLICY "Service role full access"
ON order_items FOR ALL
USING (true)
WITH CHECK (true);

-- Add stock_level to products if not exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_level INTEGER;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock_level INTEGER DEFAULT 0;

-- =====================================================
-- DONE
-- =====================================================
