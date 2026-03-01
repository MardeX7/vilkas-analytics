-- Jira Support Integration
-- Adds Jira configuration to shops table and creates support ticket tables

-- 1. shops-taulun laajennus Jira-asetuksilla
ALTER TABLE shops ADD COLUMN IF NOT EXISTS jira_host TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS jira_email TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS jira_api_token TEXT;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS jira_project_key TEXT;

-- 2. support_tickets - synkatut Jira-tiketit (shop_id-järjestelmä)
CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,

  -- Jira-identifiointi
  jira_issue_id TEXT NOT NULL,
  jira_issue_key TEXT NOT NULL,

  -- Sisältö
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  status_category TEXT,
  priority TEXT,
  issue_type TEXT,
  labels TEXT[],

  -- Ajat
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- SLA
  first_response_ms BIGINT,
  resolution_ms BIGINT,
  sla_first_response_breached BOOLEAN DEFAULT false,
  sla_resolution_breached BOOLEAN DEFAULT false,

  -- Meta
  reporter_name TEXT,
  assignee_name TEXT,

  synced_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(shop_id, jira_issue_id)
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_shop_id ON support_tickets(shop_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON support_tickets(created_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(shop_id, status_category);

-- 3. support_daily_stats - päivittäiset aggregaatit trendejä varten
CREATE TABLE IF NOT EXISTS support_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  tickets_created INTEGER DEFAULT 0,
  tickets_resolved INTEGER DEFAULT 0,
  tickets_open INTEGER DEFAULT 0,

  avg_first_response_ms BIGINT,
  avg_resolution_ms BIGINT,

  sla_breaches INTEGER DEFAULT 0,

  UNIQUE(shop_id, date)
);

CREATE INDEX IF NOT EXISTS idx_support_daily_stats_shop ON support_daily_stats(shop_id, date);

-- 4. RLS-politiikat
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view support_tickets" ON support_tickets FOR SELECT
USING (EXISTS (
  SELECT 1 FROM shop_members sm
  WHERE sm.shop_id = support_tickets.shop_id AND sm.user_id = auth.uid()
));

CREATE POLICY "Members can view support_daily_stats" ON support_daily_stats FOR SELECT
USING (EXISTS (
  SELECT 1 FROM shop_members sm
  WHERE sm.shop_id = support_daily_stats.shop_id AND sm.user_id = auth.uid()
));
