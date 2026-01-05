-- =====================================================
-- VILKAS ANALYTICS - INDICATORS SCHEMA
-- Version: 1.0 (MVP)
-- =====================================================

-- =====================================================
-- SHOPS TABLE (multi-tenant support)
-- =====================================================
CREATE TABLE IF NOT EXISTS shops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id TEXT NOT NULL UNIQUE,          -- ePages store ID
  domain TEXT NOT NULL,
  name TEXT,

  -- API connections
  gsc_property TEXT,                       -- GSC property URL (e.g., 'sc-domain:billackering.eu')
  ga4_property_id TEXT,                    -- GA4 property ID

  -- Settings
  currency TEXT DEFAULT 'SEK',
  timezone TEXT DEFAULT 'Europe/Stockholm',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_shops_store_id ON shops(store_id);

-- =====================================================
-- INDICATORS TABLE (calculated indicators)
-- =====================================================
CREATE TABLE IF NOT EXISTS indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,

  indicator_id TEXT NOT NULL,              -- 'sales_trend', 'aov', 'position_change', etc.
  indicator_category TEXT NOT NULL,        -- 'sales', 'seo', 'combined', 'customer'

  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label TEXT,                       -- '7d', '30d', '90d'

  -- Full indicator data as JSON
  value JSONB NOT NULL,

  -- Denormalized fields for quick queries
  numeric_value DECIMAL(14,4),             -- Main numeric value
  direction TEXT,                          -- 'up', 'down', 'stable'
  change_percent DECIMAL(8,2),             -- % change from comparison period
  priority TEXT,                           -- 'critical', 'high', 'medium', 'low'
  confidence TEXT,                         -- 'high', 'medium', 'low'
  alert_triggered BOOLEAN DEFAULT false,

  calculated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(shop_id, indicator_id, period_label, period_end)
);

CREATE INDEX idx_indicators_shop_date ON indicators(shop_id, period_end DESC);
CREATE INDEX idx_indicators_category ON indicators(shop_id, indicator_category);
CREATE INDEX idx_indicators_alerts ON indicators(shop_id, alert_triggered) WHERE alert_triggered = true;

-- =====================================================
-- INDICATOR HISTORY (for trending)
-- =====================================================
CREATE TABLE IF NOT EXISTS indicator_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,

  indicator_id TEXT NOT NULL,
  date DATE NOT NULL,

  value DECIMAL(14,4),
  direction TEXT,

  UNIQUE(shop_id, indicator_id, date)
);

CREATE INDEX idx_indicator_history ON indicator_history(shop_id, indicator_id, date DESC);

-- =====================================================
-- ALERTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID REFERENCES shops(id) ON DELETE CASCADE NOT NULL,

  indicator_id TEXT NOT NULL,
  alert_type TEXT NOT NULL,                -- 'threshold_breach', 'anomaly', 'trend_change'
  severity TEXT NOT NULL,                  -- 'critical', 'warning', 'info'

  title TEXT NOT NULL,
  message TEXT NOT NULL,

  indicator_value JSONB,
  threshold_breached DECIMAL(14,4),

  acknowledged BOOLEAN DEFAULT false,
  acknowledged_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_alerts_shop ON alerts(shop_id, created_at DESC);
CREATE INDEX idx_alerts_unack ON alerts(shop_id, acknowledged) WHERE acknowledged = false;

-- =====================================================
-- HELPER FUNCTION: Update timestamp
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER shops_updated_at
  BEFORE UPDATE ON shops
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- INSERT DEFAULT SHOP (Billackering)
-- =====================================================
INSERT INTO shops (store_id, domain, name, gsc_property, currency)
VALUES (
  'a28836f6-9487-4b67-9194-e907eaf94b69',
  'billackering.eu',
  'Billackering',
  'sc-domain:billackering.eu',
  'SEK'
)
ON CONFLICT (store_id) DO NOTHING;

-- =====================================================
-- RLS POLICIES (optional, for future multi-tenant)
-- =====================================================
-- ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE indicators ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE indicator_history ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
