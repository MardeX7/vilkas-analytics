-- Add stock_tracked column to products table
-- Distinguishes products with stock tracking enabled in ePages
-- from products where stocklevel is null (e.g. made-to-order items)
ALTER TABLE products ADD COLUMN IF NOT EXISTS stock_tracked BOOLEAN DEFAULT true;

-- Set existing products with stock_level = 0 as potentially untracked
-- (will be corrected on next sync based on actual ePages API data)
COMMENT ON COLUMN products.stock_tracked IS 'Whether ePages tracks stock for this product. False = stocklevel is null in ePages (made-to-order items).';
