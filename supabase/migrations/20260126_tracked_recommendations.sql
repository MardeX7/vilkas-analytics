-- Tracked recommendations - user's saved/tracked action items
-- Allows users to "take on" a recommendation and track progress

CREATE TABLE IF NOT EXISTS tracked_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Original recommendation data (copied for history)
  recommendation_id TEXT NOT NULL, -- e.g. "rec_1" from JSONB
  title TEXT NOT NULL,
  why TEXT,
  metric TEXT,
  timeframe TEXT,
  effort TEXT,
  impact TEXT,
  expected_result TEXT,

  -- Tracking status
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  user_notes TEXT, -- User's own notes
  progress_percent INTEGER DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),

  -- Timestamps
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_tracked_recommendations_store_status
ON tracked_recommendations(store_id, status);

-- RLS policies
ALTER TABLE tracked_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for now" ON tracked_recommendations
  FOR ALL USING (true);

-- Function to track a recommendation
CREATE OR REPLACE FUNCTION track_recommendation(
  p_store_id UUID,
  p_recommendation_id TEXT,
  p_title TEXT,
  p_why TEXT DEFAULT NULL,
  p_metric TEXT DEFAULT NULL,
  p_timeframe TEXT DEFAULT NULL,
  p_effort TEXT DEFAULT NULL,
  p_impact TEXT DEFAULT NULL,
  p_expected_result TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Check if already tracked (and not completed/cancelled)
  SELECT id INTO v_id
  FROM tracked_recommendations
  WHERE store_id = p_store_id
    AND recommendation_id = p_recommendation_id
    AND status = 'in_progress';

  IF v_id IS NOT NULL THEN
    -- Already tracking, return existing
    RETURN v_id;
  END IF;

  -- Insert new tracked recommendation
  INSERT INTO tracked_recommendations (
    store_id,
    recommendation_id,
    title,
    why,
    metric,
    timeframe,
    effort,
    impact,
    expected_result
  ) VALUES (
    p_store_id,
    p_recommendation_id,
    p_title,
    p_why,
    p_metric,
    p_timeframe,
    p_effort,
    p_impact,
    p_expected_result
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Function to update tracked recommendation status
CREATE OR REPLACE FUNCTION update_tracked_recommendation(
  p_id UUID,
  p_status TEXT DEFAULT NULL,
  p_progress_percent INTEGER DEFAULT NULL,
  p_user_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tracked_recommendations
  SET
    status = COALESCE(p_status, status),
    progress_percent = COALESCE(p_progress_percent, progress_percent),
    user_notes = COALESCE(p_user_notes, user_notes),
    completed_at = CASE WHEN p_status = 'completed' THEN NOW() ELSE completed_at END,
    updated_at = NOW()
  WHERE id = p_id;

  RETURN FOUND;
END;
$$;

-- Function to get tracked recommendations
CREATE OR REPLACE FUNCTION get_tracked_recommendations(
  p_store_id UUID,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  recommendation_id TEXT,
  title TEXT,
  why TEXT,
  metric TEXT,
  timeframe TEXT,
  effort TEXT,
  impact TEXT,
  expected_result TEXT,
  status TEXT,
  user_notes TEXT,
  progress_percent INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tr.id,
    tr.recommendation_id,
    tr.title,
    tr.why,
    tr.metric,
    tr.timeframe,
    tr.effort,
    tr.impact,
    tr.expected_result,
    tr.status,
    tr.user_notes,
    tr.progress_percent,
    tr.started_at,
    tr.completed_at
  FROM tracked_recommendations tr
  WHERE tr.store_id = p_store_id
    AND (p_status IS NULL OR tr.status = p_status)
  ORDER BY
    CASE tr.status
      WHEN 'in_progress' THEN 0
      WHEN 'completed' THEN 1
      ELSE 2
    END,
    tr.started_at DESC;
END;
$$;

COMMENT ON TABLE tracked_recommendations IS 'User-tracked action recommendations with progress tracking';
COMMENT ON FUNCTION track_recommendation IS 'Start tracking a recommendation';
COMMENT ON FUNCTION update_tracked_recommendation IS 'Update tracking status/progress';
COMMENT ON FUNCTION get_tracked_recommendations IS 'Get all tracked recommendations for a store';
