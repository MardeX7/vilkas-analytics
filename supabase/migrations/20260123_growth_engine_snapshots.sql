-- Growth Engine Snapshots table
-- Stores real historical data for Growth Engine Index
-- Created: 2026-01-23

-- Create table for Growth Engine snapshots
CREATE TABLE IF NOT EXISTS growth_engine_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL,

  -- Period info
  period_type TEXT NOT NULL CHECK (period_type IN ('week', 'month')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label TEXT, -- e.g. 'Viikko 3/2026'

  -- Overall Growth Engine Index
  overall_index INTEGER NOT NULL CHECK (overall_index >= 0 AND overall_index <= 100),
  index_level TEXT NOT NULL CHECK (index_level IN ('poor', 'needs_work', 'good', 'excellent')),

  -- 4 KPI area scores
  demand_growth_score INTEGER CHECK (demand_growth_score >= 0 AND demand_growth_score <= 100),
  traffic_quality_score INTEGER CHECK (traffic_quality_score >= 0 AND traffic_quality_score <= 100),
  sales_efficiency_score INTEGER CHECK (sales_efficiency_score >= 0 AND sales_efficiency_score <= 100),
  product_leverage_score INTEGER CHECK (product_leverage_score >= 0 AND product_leverage_score <= 100),

  -- Raw metrics (stored as JSONB for flexibility)
  demand_growth_metrics JSONB,
  traffic_quality_metrics JSONB,
  sales_efficiency_metrics JSONB,
  product_leverage_metrics JSONB,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one snapshot per store/period
  UNIQUE (store_id, period_type, period_end)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_growth_engine_snapshots_store_period
ON growth_engine_snapshots(store_id, period_type, period_end DESC);

-- Enable RLS
ALTER TABLE growth_engine_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS policy (allow all for service role)
DROP POLICY IF EXISTS growth_engine_snapshots_all ON growth_engine_snapshots;
CREATE POLICY growth_engine_snapshots_all ON growth_engine_snapshots FOR ALL USING (true);

-- Comment on table
COMMENT ON TABLE growth_engine_snapshots IS 'Real historical snapshots of Growth Engine Index - collected weekly/monthly from 2026-01 onwards';
