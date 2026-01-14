-- GSC Daily Totals table
-- Tallentaa päivittäiset kokonaisarvot suoraan GSC API:sta (ilman dimension-rajoituksia)
-- Tämä ratkaisee ongelman jossa 5-dimension query palauttaa vain osan datasta

-- Drop existing view if it exists
DROP VIEW IF EXISTS v_gsc_daily_summary CASCADE;

-- Create table for daily totals
CREATE TABLE IF NOT EXISTS gsc_daily_totals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(5,4) DEFAULT 0,
  position NUMERIC(6,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(store_id, date)
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_gsc_daily_totals_store_date
ON gsc_daily_totals(store_id, date DESC);

-- Enable RLS
ALTER TABLE gsc_daily_totals ENABLE ROW LEVEL SECURITY;

-- RLS Policies (same pattern as other tables)
CREATE POLICY "Shop members can view GSC daily totals"
  ON gsc_daily_totals FOR SELECT
  USING (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Shop members can insert GSC daily totals"
  ON gsc_daily_totals FOR INSERT
  WITH CHECK (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Shop members can update GSC daily totals"
  ON gsc_daily_totals FOR UPDATE
  USING (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Shop members can delete GSC daily totals"
  ON gsc_daily_totals FOR DELETE
  USING (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

-- Service role policy
CREATE POLICY "Service role full access to GSC daily totals"
  ON gsc_daily_totals FOR ALL
  USING (auth.role() = 'service_role');

-- Recreate view for backward compatibility (uses daily_totals as primary source)
CREATE VIEW v_gsc_daily_summary AS
SELECT
  store_id,
  date,
  clicks as total_clicks,
  impressions as total_impressions,
  ctr as avg_ctr,
  position as avg_position
FROM gsc_daily_totals
ORDER BY date DESC;

-- Grant permissions
GRANT SELECT ON v_gsc_daily_summary TO authenticated;
GRANT ALL ON gsc_daily_totals TO authenticated;
