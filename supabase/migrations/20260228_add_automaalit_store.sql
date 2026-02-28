-- Add Automaalit.net as second store/shop
-- Run in Supabase SQL Editor

-- 1. Insert into stores (ePages API connection)
INSERT INTO stores (epages_shop_id, name, domain, currency, locale, access_token)
VALUES (
  'automaalit',
  'Automaalit.net',
  'automaalit.net',
  'EUR',
  'fi_FI',
  'Jo9kUIM9NRvBcuNg5RktwCieeB2eK8fj'
)
ON CONFLICT (epages_shop_id) DO NOTHING;

-- 2. Insert into shops (multi-tenant hub)
-- store_id must match stores.id (UUID), so we look it up
INSERT INTO shops (store_id, domain, name, currency, timezone)
SELECT
  id::TEXT,
  'automaalit.net',
  'Automaalit.net',
  'EUR',
  'Europe/Helsinki'
FROM stores
WHERE epages_shop_id = 'automaalit'
ON CONFLICT (store_id) DO NOTHING;

-- 3. Add current admin user(s) as members of the new shop
-- This copies all admins from Billackering to Automaalit.net
INSERT INTO shop_members (shop_id, user_id, role, joined_at)
SELECT
  new_shop.id,
  sm.user_id,
  sm.role,
  NOW()
FROM shop_members sm
JOIN shops old_shop ON old_shop.id = sm.shop_id
JOIN shops new_shop ON new_shop.name = 'Automaalit.net'
WHERE old_shop.name = 'Billackering'
  AND sm.role = 'admin'
ON CONFLICT (shop_id, user_id) DO NOTHING;

-- Verify results
SELECT 'stores' AS table_name, id, epages_shop_id, name, domain, currency FROM stores;
SELECT 'shops' AS table_name, id, store_id, name, domain, currency, timezone FROM shops;
SELECT 'shop_members' AS table_name, sm.id, sm.shop_id, s.name AS shop_name, sm.user_id, sm.role
FROM shop_members sm JOIN shops s ON s.id = sm.shop_id;
