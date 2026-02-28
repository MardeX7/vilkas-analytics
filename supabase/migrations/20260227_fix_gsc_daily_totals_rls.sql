-- Fix gsc_daily_totals RLS policies
-- Problem: store_id in this table is stores.id (ePages ID), not shops.id
-- Old policies checked shop_members.shop_id which doesn't match stores.id
-- Solution: Allow access via shops.store_id linkage

-- Drop old incorrect policies
DROP POLICY IF EXISTS "Shop members can view GSC daily totals" ON gsc_daily_totals;
DROP POLICY IF EXISTS "Shop members can insert GSC daily totals" ON gsc_daily_totals;
DROP POLICY IF EXISTS "Shop members can update GSC daily totals" ON gsc_daily_totals;
DROP POLICY IF EXISTS "Shop members can delete GSC daily totals" ON gsc_daily_totals;

-- Recreate policies that work with store_id (stores.id)
-- Link: shop_members.shop_id -> shops.id -> shops.store_id (TEXT) -> gsc_daily_totals.store_id (UUID)
-- shops.store_id is TEXT, gsc_daily_totals.store_id is UUID, so we need explicit cast
CREATE POLICY "Shop members can view GSC daily totals"
  ON gsc_daily_totals FOR SELECT
  USING (
    store_id::text IN (
      SELECT s.store_id FROM shops s
      INNER JOIN shop_members sm ON sm.shop_id = s.id
      WHERE sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Shop members can insert GSC daily totals"
  ON gsc_daily_totals FOR INSERT
  WITH CHECK (
    store_id::text IN (
      SELECT s.store_id FROM shops s
      INNER JOIN shop_members sm ON sm.shop_id = s.id
      WHERE sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Shop members can update GSC daily totals"
  ON gsc_daily_totals FOR UPDATE
  USING (
    store_id::text IN (
      SELECT s.store_id FROM shops s
      INNER JOIN shop_members sm ON sm.shop_id = s.id
      WHERE sm.user_id = auth.uid()
    )
  );

CREATE POLICY "Shop members can delete GSC daily totals"
  ON gsc_daily_totals FOR DELETE
  USING (
    store_id::text IN (
      SELECT s.store_id FROM shops s
      INNER JOIN shop_members sm ON sm.shop_id = s.id
      WHERE sm.user_id = auth.uid()
    )
  );
