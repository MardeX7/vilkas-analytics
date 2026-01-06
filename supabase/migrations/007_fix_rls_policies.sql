-- =====================================================
-- VILKAS ANALYTICS - FIX RLS POLICIES
-- Migration 007: Fix type mismatches in RLS policies
-- Date: 2026-01-06
--
-- Problem: Mixed UUID/TEXT types across tables
-- Solution: Cast everything to TEXT for comparison
-- =====================================================

-- =====================================================
-- 1. DROP OLD POLICIES WITH WRONG TYPES
-- =====================================================

DROP POLICY IF EXISTS "orders_select_policy" ON orders;
DROP POLICY IF EXISTS "products_select_policy" ON products;
DROP POLICY IF EXISTS "products_admin_modify_policy" ON products;
DROP POLICY IF EXISTS "customers_select_policy" ON customers;
DROP POLICY IF EXISTS "order_line_items_select_policy" ON order_line_items;

-- =====================================================
-- 2. CREATE CORRECTED POLICIES
-- All comparisons use TEXT to avoid type mismatches
-- =====================================================

-- Orders: store_id is TEXT - compare TEXT = TEXT
CREATE POLICY "orders_select_policy" ON orders
FOR SELECT
USING (
  store_id::text IN (
    SELECT s.store_id::text
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- Products: Cast both sides to TEXT
CREATE POLICY "products_select_policy" ON products
FOR SELECT
USING (
  store_id::text IN (
    SELECT s.store_id::text
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- Products admin modify policy
CREATE POLICY "products_admin_modify_policy" ON products
FOR ALL
USING (
  store_id::text IN (
    SELECT s.store_id::text
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
    AND sm.role = 'admin'
  )
);

-- Customers: Cast both sides to TEXT
CREATE POLICY "customers_select_policy" ON customers
FOR SELECT
USING (
  store_id::text IN (
    SELECT s.store_id::text
    FROM shops s
    INNER JOIN shop_members sm ON sm.shop_id = s.id
    WHERE sm.user_id = auth.uid()
  )
);

-- Order line items: join through orders (orders.id is UUID)
CREATE POLICY "order_line_items_select_policy" ON order_line_items
FOR SELECT
USING (
  order_id IN (
    SELECT o.id FROM orders o
    WHERE o.store_id::text IN (
      SELECT s.store_id::text
      FROM shops s
      INNER JOIN shop_members sm ON sm.shop_id = s.id
      WHERE sm.user_id = auth.uid()
    )
  )
);

-- =====================================================
-- 3. RE-ENABLE RLS ON TABLES
-- =====================================================

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- DONE
-- =====================================================
