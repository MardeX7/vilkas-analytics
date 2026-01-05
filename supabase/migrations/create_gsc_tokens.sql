-- GSC Tokens table for storing Google Search Console OAuth tokens
CREATE TABLE IF NOT EXISTS gsc_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL UNIQUE,
  site_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_gsc_tokens_store_id ON gsc_tokens(store_id);

-- RLS
ALTER TABLE gsc_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access" ON gsc_tokens
  FOR ALL USING (true) WITH CHECK (true);
