-- AI Analytics Migration
-- Taulut viikkoanalyyseille, toimenpidesuosituksille ja Emma-chatille

-- ============================================
-- 1. WEEKLY ANALYSES - Viikkoanalyysit
-- ============================================

CREATE TABLE IF NOT EXISTS weekly_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  week_number INT NOT NULL CHECK (week_number >= 1 AND week_number <= 53),
  year INT NOT NULL CHECK (year >= 2020 AND year <= 2100),

  -- Analyysin sisältö
  analysis_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Esimerkki rakenne:
  -- {
  --   "summary": "Kokonaisindeksi nousi 58 → 64...",
  --   "bullets": ["Suurin vaikuttaja: Myynnin tehokkuus", "Varastoriski: 3 A-tuotetta"],
  --   "full_analysis": "Pidempi analyysiteksti...",
  --   "key_metrics": {
  --     "overall_index": { "current": 64, "previous": 58, "change": 10 },
  --     "biggest_impact": "sales_efficiency"
  --   },
  --   "language": "sv"
  -- }

  -- Generointi-info
  generated_at TIMESTAMPTZ DEFAULT now(),
  model_used TEXT DEFAULT 'claude-sonnet-4-20250514',
  tokens_used INT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Uniikki viikko per kauppa
  CONSTRAINT unique_weekly_analysis UNIQUE (store_id, week_number, year)
);

-- Indeksi nopeaan hakuun
CREATE INDEX IF NOT EXISTS idx_weekly_analyses_store_date
  ON weekly_analyses(store_id, year DESC, week_number DESC);

-- ============================================
-- 2. ACTION RECOMMENDATIONS - Toimenpidesuositukset
-- ============================================

CREATE TABLE IF NOT EXISTS action_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  week_number INT NOT NULL,
  year INT NOT NULL,

  -- Suositukset JSON-taulukkona
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Esimerkki rakenne:
  -- [
  --   {
  --     "id": "rec_1",
  --     "title": "Täydennä varasto",
  --     "why": "3 A-tuotetta lähellä loppumista",
  --     "timeframe": "immediate",  -- immediate, short (1-2vk), long (kvartaali)
  --     "effort": "small",         -- small, medium, large
  --     "impact": "high",          -- low, medium, high
  --     "metric": "sales",         -- sales, margin, conversion, inventory, seo
  --     "expected_result": "Myynti +8-12%",
  --     "completed_at": null,
  --     "completed_by": null
  --   }
  -- ]

  -- Generointi-info
  generated_at TIMESTAMPTZ DEFAULT now(),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_weekly_recommendations UNIQUE (store_id, week_number, year)
);

-- Indeksi
CREATE INDEX IF NOT EXISTS idx_action_recommendations_store_date
  ON action_recommendations(store_id, year DESC, week_number DESC);

-- ============================================
-- 3. CHAT SESSIONS - Emma-keskustelut
-- ============================================

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Session metadata
  title TEXT,  -- Auto-generated from first message
  language TEXT DEFAULT 'sv' CHECK (language IN ('fi', 'sv', 'en')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),

  -- Status
  is_active BOOLEAN DEFAULT true
);

-- Indeksit
CREATE INDEX IF NOT EXISTS idx_chat_sessions_store ON chat_sessions(store_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_active ON chat_sessions(store_id, is_active, last_message_at DESC);

-- ============================================
-- 4. CHAT MESSAGES - Viestit
-- ============================================

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,

  -- Viestin sisältö
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,

  -- Metadata
  tokens_used INT,  -- Vain assistant-viestit
  model_used TEXT,  -- Vain assistant-viestit

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indeksit
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);

-- ============================================
-- 5. RLS POLICIES
-- ============================================

-- Enable RLS
ALTER TABLE weekly_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Weekly analyses: Lue ja kirjoita oman kaupan data
CREATE POLICY "weekly_analyses_select" ON weekly_analyses
  FOR SELECT USING (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "weekly_analyses_insert" ON weekly_analyses
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

-- Action recommendations: Sama logiikka
CREATE POLICY "action_recommendations_select" ON action_recommendations
  FOR SELECT USING (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "action_recommendations_update" ON action_recommendations
  FOR UPDATE USING (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

-- Chat sessions: Käyttäjä näkee vain omat sessiot
CREATE POLICY "chat_sessions_select" ON chat_sessions
  FOR SELECT USING (
    user_id = auth.uid() OR
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_sessions_insert" ON chat_sessions
  FOR INSERT WITH CHECK (
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "chat_sessions_update" ON chat_sessions
  FOR UPDATE USING (
    user_id = auth.uid() OR
    store_id IN (
      SELECT shop_id FROM shop_members WHERE user_id = auth.uid()
    )
  );

-- Chat messages: Pääsy session kautta
CREATE POLICY "chat_messages_select" ON chat_messages
  FOR SELECT USING (
    session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    ) OR
    session_id IN (
      SELECT cs.id FROM chat_sessions cs
      JOIN shop_members sm ON cs.store_id = sm.shop_id
      WHERE sm.user_id = auth.uid()
    )
  );

CREATE POLICY "chat_messages_insert" ON chat_messages
  FOR INSERT WITH CHECK (
    session_id IN (
      SELECT id FROM chat_sessions WHERE user_id = auth.uid()
    ) OR
    session_id IN (
      SELECT cs.id FROM chat_sessions cs
      JOIN shop_members sm ON cs.store_id = sm.shop_id
      WHERE sm.user_id = auth.uid()
    )
  );

-- ============================================
-- 6. RPC FUNCTIONS
-- ============================================

-- Hae viimeisin viikkoanalyysi
CREATE OR REPLACE FUNCTION get_latest_weekly_analysis(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'week_number', week_number,
    'year', year,
    'analysis_content', analysis_content,
    'generated_at', generated_at
  )
  INTO result
  FROM weekly_analyses
  WHERE store_id = p_store_id
  ORDER BY year DESC, week_number DESC
  LIMIT 1;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- Hae viimeisimmät toimenpidesuositukset
CREATE OR REPLACE FUNCTION get_latest_recommendations(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'id', id,
    'week_number', week_number,
    'year', year,
    'recommendations', recommendations,
    'generated_at', generated_at
  )
  INTO result
  FROM action_recommendations
  WHERE store_id = p_store_id
  ORDER BY year DESC, week_number DESC
  LIMIT 1;

  RETURN COALESCE(result, '{"recommendations": []}'::jsonb);
END;
$$;

-- Merkitse suositus tehdyksi
CREATE OR REPLACE FUNCTION mark_recommendation_completed(
  p_store_id UUID,
  p_recommendation_id TEXT,
  p_completed BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec_row action_recommendations%ROWTYPE;
  updated_recs JSONB;
BEGIN
  -- Hae viimeisin suosituslista
  SELECT * INTO rec_row
  FROM action_recommendations
  WHERE store_id = p_store_id
  ORDER BY year DESC, week_number DESC
  LIMIT 1;

  IF rec_row.id IS NULL THEN
    RETURN false;
  END IF;

  -- Päivitä suositus
  SELECT jsonb_agg(
    CASE
      WHEN elem->>'id' = p_recommendation_id THEN
        elem || jsonb_build_object(
          'completed_at', CASE WHEN p_completed THEN now() ELSE null END,
          'completed_by', auth.uid()
        )
      ELSE elem
    END
  )
  INTO updated_recs
  FROM jsonb_array_elements(rec_row.recommendations) elem;

  -- Tallenna päivitys
  UPDATE action_recommendations
  SET
    recommendations = updated_recs,
    updated_at = now()
  WHERE id = rec_row.id;

  RETURN true;
END;
$$;

-- Hae chat-historia
CREATE OR REPLACE FUNCTION get_chat_history(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'role', role,
        'content', content,
        'created_at', created_at
      )
      ORDER BY created_at ASC
    )
    FROM chat_messages
    WHERE session_id = p_session_id
  );
END;
$$;

-- Luo uusi chat-sessio
CREATE OR REPLACE FUNCTION create_chat_session(p_store_id UUID, p_language TEXT DEFAULT 'sv')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_session_id UUID;
BEGIN
  INSERT INTO chat_sessions (store_id, user_id, language)
  VALUES (p_store_id, auth.uid(), p_language)
  RETURNING id INTO new_session_id;

  RETURN new_session_id;
END;
$$;

-- Lisää viesti chat-sessioon
CREATE OR REPLACE FUNCTION add_chat_message(
  p_session_id UUID,
  p_role TEXT,
  p_content TEXT,
  p_tokens_used INT DEFAULT NULL,
  p_model_used TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_message_id UUID;
BEGIN
  -- Lisää viesti
  INSERT INTO chat_messages (session_id, role, content, tokens_used, model_used)
  VALUES (p_session_id, p_role, p_content, p_tokens_used, p_model_used)
  RETURNING id INTO new_message_id;

  -- Päivitä session timestamp
  UPDATE chat_sessions
  SET
    last_message_at = now(),
    title = COALESCE(title, LEFT(p_content, 50))
  WHERE id = p_session_id;

  RETURN new_message_id;
END;
$$;

-- ============================================
-- 7. TRIGGERS
-- ============================================

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_weekly_analyses_updated_at
  BEFORE UPDATE ON weekly_analyses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_action_recommendations_updated_at
  BEFORE UPDATE ON action_recommendations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DONE
-- ============================================
