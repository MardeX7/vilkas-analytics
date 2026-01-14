-- Fix gsc_daily_totals foreign key
-- store_id viittaa ePages kaupan ID:hen, ei shops.id:hen
-- Sama logiikka kuin gsc_search_analytics ja gsc_tokens

-- Drop the incorrect foreign key constraint
ALTER TABLE gsc_daily_totals
DROP CONSTRAINT IF EXISTS gsc_daily_totals_store_id_fkey;

-- No new FK needed - store_id is ePages shop ID, not shops.id
