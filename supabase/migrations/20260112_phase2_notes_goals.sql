-- ============================================================================
-- PHASE 2: Context Notes + Merchant Goals
-- KPI Intelligence Layer v1
-- ============================================================================

-- ============================================================================
-- 1. CONTEXT NOTES TABLE
-- Structured notes that explain data spikes/dips
-- ============================================================================

CREATE TABLE IF NOT EXISTS context_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Note type (structured)
  note_type TEXT NOT NULL CHECK (note_type IN ('campaign', 'holiday', 'stockout', 'pricing', 'other')),

  -- Date range the note applies to
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Note content
  title TEXT NOT NULL,
  description TEXT,

  -- Optional: link to specific metric
  related_metric TEXT, -- e.g., 'revenue', 'orders', 'aov'

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),

  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);

-- Index for date range queries
CREATE INDEX IF NOT EXISTS idx_context_notes_store_dates
ON context_notes(store_id, start_date, end_date);

-- RLS (simplified for single-tenant app)
ALTER TABLE context_notes ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to access all notes (single-tenant app)
CREATE POLICY "Authenticated users can view notes" ON context_notes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert notes" ON context_notes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update notes" ON context_notes
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete notes" ON context_notes
  FOR DELETE USING (auth.role() = 'authenticated');

-- Service role bypass
CREATE POLICY "Service role full access to context_notes" ON context_notes
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

COMMENT ON TABLE context_notes IS 'Structured notes explaining data anomalies (campaigns, holidays, stockouts, etc.)';

-- ============================================================================
-- 2. MERCHANT GOALS TABLE
-- Trackable business goals (max 3 active)
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,

  -- Goal type
  goal_type TEXT NOT NULL CHECK (goal_type IN ('revenue', 'orders', 'aov', 'margin', 'conversion')),

  -- Target and period
  target_value DECIMAL NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),

  -- Period specification (e.g., '2026-01' for monthly, '2026-Q1' for quarterly, '2026' for yearly)
  period_label TEXT NOT NULL,

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Progress (calculated)
  current_value DECIMAL DEFAULT 0,
  progress_percent DECIMAL DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure max 3 active goals per store (enforced by trigger)
  CONSTRAINT unique_active_goal UNIQUE (store_id, goal_type, period_label)
);

-- Index for active goals lookup
CREATE INDEX IF NOT EXISTS idx_merchant_goals_active
ON merchant_goals(store_id, is_active) WHERE is_active = TRUE;

-- RLS (simplified for single-tenant app)
ALTER TABLE merchant_goals ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to access all goals (single-tenant app)
CREATE POLICY "Authenticated users can view goals" ON merchant_goals
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert goals" ON merchant_goals
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update goals" ON merchant_goals
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete goals" ON merchant_goals
  FOR DELETE USING (auth.role() = 'authenticated');

-- Service role bypass
CREATE POLICY "Service role full access to merchant_goals" ON merchant_goals
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

COMMENT ON TABLE merchant_goals IS 'Merchant business goals with progress tracking (max 3 active per store)';

-- ============================================================================
-- 3. TRIGGER: Enforce max 3 active goals per store
-- ============================================================================

CREATE OR REPLACE FUNCTION check_max_active_goals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_active_count INT;
BEGIN
  -- Only check on INSERT or when setting is_active = TRUE
  IF NEW.is_active = TRUE THEN
    SELECT COUNT(*) INTO v_active_count
    FROM merchant_goals
    WHERE store_id = NEW.store_id
      AND is_active = TRUE
      AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

    IF v_active_count >= 3 THEN
      RAISE EXCEPTION 'Maximum 3 active goals allowed per store. Deactivate an existing goal first.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_max_active_goals ON merchant_goals;
CREATE TRIGGER enforce_max_active_goals
  BEFORE INSERT OR UPDATE ON merchant_goals
  FOR EACH ROW
  EXECUTE FUNCTION check_max_active_goals();

-- ============================================================================
-- 4. RPC: Get context notes for date range
-- ============================================================================

CREATE OR REPLACE FUNCTION get_context_notes(
  p_store_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  id UUID,
  note_type TEXT,
  start_date DATE,
  end_date DATE,
  title TEXT,
  description TEXT,
  related_metric TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cn.id,
    cn.note_type,
    cn.start_date,
    cn.end_date,
    cn.title,
    cn.description,
    cn.related_metric,
    cn.created_at
  FROM context_notes cn
  WHERE cn.store_id = p_store_id
    AND cn.start_date <= p_end_date
    AND cn.end_date >= p_start_date
  ORDER BY cn.start_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_context_notes TO authenticated;
GRANT EXECUTE ON FUNCTION get_context_notes TO service_role;

-- ============================================================================
-- 5. RPC: Get active goals with progress
-- ============================================================================

CREATE OR REPLACE FUNCTION get_active_goals(
  p_store_id UUID
)
RETURNS TABLE (
  id UUID,
  goal_type TEXT,
  target_value DECIMAL,
  period_type TEXT,
  period_label TEXT,
  current_value DECIMAL,
  progress_percent DECIMAL,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mg.id,
    mg.goal_type,
    mg.target_value,
    mg.period_type,
    mg.period_label,
    mg.current_value,
    mg.progress_percent,
    mg.is_active,
    mg.created_at
  FROM merchant_goals mg
  WHERE mg.store_id = p_store_id
    AND mg.is_active = TRUE
  ORDER BY mg.created_at DESC
  LIMIT 3;
END;
$$;

GRANT EXECUTE ON FUNCTION get_active_goals TO authenticated;
GRANT EXECUTE ON FUNCTION get_active_goals TO service_role;

-- ============================================================================
-- 6. RPC: Create or update goal
-- ============================================================================

CREATE OR REPLACE FUNCTION upsert_goal(
  p_store_id UUID,
  p_goal_type TEXT,
  p_target_value DECIMAL,
  p_period_type TEXT,
  p_period_label TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_goal_id UUID;
BEGIN
  -- Try to find existing goal
  SELECT id INTO v_goal_id
  FROM merchant_goals
  WHERE store_id = p_store_id
    AND goal_type = p_goal_type
    AND period_label = p_period_label;

  IF v_goal_id IS NOT NULL THEN
    -- Update existing
    UPDATE merchant_goals
    SET target_value = p_target_value,
        period_type = p_period_type,
        is_active = TRUE,
        updated_at = NOW()
    WHERE id = v_goal_id;
  ELSE
    -- Insert new
    INSERT INTO merchant_goals (store_id, goal_type, target_value, period_type, period_label, is_active)
    VALUES (p_store_id, p_goal_type, p_target_value, p_period_type, p_period_label, TRUE)
    RETURNING id INTO v_goal_id;
  END IF;

  RETURN v_goal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_goal TO authenticated;
GRANT EXECUTE ON FUNCTION upsert_goal TO service_role;

-- ============================================================================
-- 7. RPC: Calculate goal progress
-- Called by cron or on-demand
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_goal_progress(
  p_store_id UUID,
  p_goal_id UUID DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_goal RECORD;
  v_current DECIMAL;
  v_progress DECIMAL;
  v_start_date DATE;
  v_end_date DATE;
  v_updated_count INT := 0;
BEGIN
  FOR v_goal IN
    SELECT * FROM merchant_goals
    WHERE store_id = p_store_id
      AND is_active = TRUE
      AND (p_goal_id IS NULL OR id = p_goal_id)
  LOOP
    -- Calculate date range from period_label
    IF v_goal.period_type = 'monthly' THEN
      -- period_label format: '2026-01'
      v_start_date := (v_goal.period_label || '-01')::DATE;
      v_end_date := (v_start_date + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    ELSIF v_goal.period_type = 'quarterly' THEN
      -- period_label format: '2026-Q1'
      v_start_date := CASE
        WHEN v_goal.period_label LIKE '%-Q1' THEN (LEFT(v_goal.period_label, 4) || '-01-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q2' THEN (LEFT(v_goal.period_label, 4) || '-04-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q3' THEN (LEFT(v_goal.period_label, 4) || '-07-01')::DATE
        WHEN v_goal.period_label LIKE '%-Q4' THEN (LEFT(v_goal.period_label, 4) || '-10-01')::DATE
      END;
      v_end_date := (v_start_date + INTERVAL '3 months' - INTERVAL '1 day')::DATE;
    ELSIF v_goal.period_type = 'yearly' THEN
      -- period_label format: '2026'
      v_start_date := (v_goal.period_label || '-01-01')::DATE;
      v_end_date := (v_goal.period_label || '-12-31')::DATE;
    END IF;

    -- Calculate current value based on goal_type
    IF v_goal.goal_type = 'revenue' THEN
      SELECT COALESCE(SUM(li.total_price), 0) INTO v_current
      FROM orders o
      JOIN order_line_items li ON li.order_id = o.id
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date;

    ELSIF v_goal.goal_type = 'orders' THEN
      SELECT COUNT(*)::DECIMAL INTO v_current
      FROM orders o
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date;

    ELSIF v_goal.goal_type = 'aov' THEN
      SELECT COALESCE(AVG(order_total), 0) INTO v_current
      FROM (
        SELECT o.id, SUM(li.total_price) AS order_total
        FROM orders o
        JOIN order_line_items li ON li.order_id = o.id
        WHERE o.store_id = p_store_id
          AND o.creation_date::DATE >= v_start_date
          AND o.creation_date::DATE <= v_end_date
        GROUP BY o.id
      ) AS order_totals;

    ELSIF v_goal.goal_type = 'margin' THEN
      SELECT COALESCE(
        (SUM(li.total_price) - SUM(COALESCE(p.cost_price, 0) * li.quantity)) / NULLIF(SUM(li.total_price), 0) * 100,
        0
      ) INTO v_current
      FROM orders o
      JOIN order_line_items li ON li.order_id = o.id
      LEFT JOIN products p ON p.store_id = o.store_id AND p.sku = li.product_sku
      WHERE o.store_id = p_store_id
        AND o.creation_date::DATE >= v_start_date
        AND o.creation_date::DATE <= v_end_date;

    -- conversion would need GA4 data, skip for now
    ELSE
      v_current := 0;
    END IF;

    -- Calculate progress percent
    IF v_goal.target_value > 0 THEN
      v_progress := LEAST((v_current / v_goal.target_value) * 100, 999); -- Cap at 999%
    ELSE
      v_progress := 0;
    END IF;

    -- Update goal
    UPDATE merchant_goals
    SET current_value = ROUND(v_current, 2),
        progress_percent = ROUND(v_progress, 1),
        last_calculated_at = NOW(),
        updated_at = NOW()
    WHERE id = v_goal.id;

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN v_updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION calculate_goal_progress TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_goal_progress TO service_role;

-- ============================================================================
-- 8. RPC: Create context note
-- ============================================================================

CREATE OR REPLACE FUNCTION create_context_note(
  p_store_id UUID,
  p_note_type TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_related_metric TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_note_id UUID;
BEGIN
  INSERT INTO context_notes (
    store_id, note_type, start_date, end_date, title, description, related_metric, created_by
  ) VALUES (
    p_store_id, p_note_type, p_start_date, p_end_date, p_title, p_description, p_related_metric, auth.uid()
  )
  RETURNING id INTO v_note_id;

  RETURN v_note_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_context_note TO authenticated;
GRANT EXECUTE ON FUNCTION create_context_note TO service_role;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON context_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON merchant_goals TO authenticated;
GRANT ALL ON context_notes TO service_role;
GRANT ALL ON merchant_goals TO service_role;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
