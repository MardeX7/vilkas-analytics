-- Add save feature to chat_sessions
-- Allows users to save conversations with custom title and notes

-- Add is_saved flag (default false - conversations start unsaved)
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS is_saved BOOLEAN DEFAULT FALSE;

-- Add user_note for personal notes about the conversation
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS user_note TEXT;

-- Add saved_at timestamp
ALTER TABLE chat_sessions
ADD COLUMN IF NOT EXISTS saved_at TIMESTAMPTZ;

-- Index for finding saved conversations quickly
CREATE INDEX IF NOT EXISTS idx_chat_sessions_saved
ON chat_sessions (store_id, is_saved, saved_at DESC)
WHERE is_saved = TRUE;

-- RPC function to save a conversation
CREATE OR REPLACE FUNCTION save_chat_session(
  p_session_id UUID,
  p_title TEXT,
  p_user_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
BEGIN
  UPDATE chat_sessions
  SET
    is_saved = TRUE,
    title = p_title,
    user_note = p_user_note,
    saved_at = NOW()
  WHERE id = p_session_id
  RETURNING jsonb_build_object(
    'id', id,
    'title', title,
    'user_note', user_note,
    'saved_at', saved_at
  ) INTO v_result;

  IF v_result IS NULL THEN
    RETURN jsonb_build_object('error', 'Session not found');
  END IF;

  RETURN v_result;
END;
$$;

-- RPC function to get saved conversations
CREATE OR REPLACE FUNCTION get_saved_conversations(
  p_store_id UUID,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  user_note TEXT,
  saved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  message_count BIGINT,
  last_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cs.id,
    cs.title,
    cs.user_note,
    cs.saved_at,
    cs.created_at,
    (SELECT COUNT(*) FROM chat_messages cm WHERE cm.session_id = cs.id) as message_count,
    (SELECT cm.content FROM chat_messages cm
     WHERE cm.session_id = cs.id AND cm.role = 'user'
     ORDER BY cm.created_at ASC LIMIT 1) as last_message
  FROM chat_sessions cs
  WHERE cs.store_id = p_store_id
    AND cs.is_saved = TRUE
  ORDER BY cs.saved_at DESC
  LIMIT p_limit;
END;
$$;

-- RPC function to unsave (delete saved status, not the conversation)
CREATE OR REPLACE FUNCTION unsave_chat_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE chat_sessions
  SET is_saved = FALSE, saved_at = NULL
  WHERE id = p_session_id;

  RETURN FOUND;
END;
$$;

COMMENT ON COLUMN chat_sessions.is_saved IS 'Whether user has explicitly saved this conversation';
COMMENT ON COLUMN chat_sessions.user_note IS 'User personal note about this conversation';
COMMENT ON COLUMN chat_sessions.saved_at IS 'When the conversation was saved';
