-- Add Slack webhook URL per shop for multi-tenant notifications
-- Each shop can have its own Slack channel webhook
ALTER TABLE shops ADD COLUMN IF NOT EXISTS slack_webhook_url TEXT;

-- Set Automaalit.net webhook (automaalit-net channel)
-- Webhook URL set directly in Supabase dashboard (not committed to repo for security)
-- UPDATE shops SET slack_webhook_url = '<webhook-url>' WHERE name = 'Automaalit.net';

-- Billackering.eu uses fallback env var SLACK_WEBHOOK_URL (no per-shop URL needed)

COMMENT ON COLUMN shops.slack_webhook_url IS 'Slack Incoming Webhook URL for this shop channel';
