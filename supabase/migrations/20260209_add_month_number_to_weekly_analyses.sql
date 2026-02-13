-- Add month_number column to weekly_analyses table for monthly analyses
-- Weekly analyses use week_number, monthly analyses use month_number

ALTER TABLE weekly_analyses
ADD COLUMN IF NOT EXISTS month_number INTEGER;

-- Add comment
COMMENT ON COLUMN weekly_analyses.month_number IS 'Month number (1-12) for monthly analyses. NULL for weekly analyses.';

-- Create unique index for monthly analyses (store_id + month_number + year)
-- This allows upsert to work correctly for monthly analyses
CREATE UNIQUE INDEX IF NOT EXISTS weekly_analyses_monthly_unique
ON weekly_analyses (store_id, month_number, year)
WHERE month_number IS NOT NULL;

-- Also add month_number to action_recommendations if it doesn't exist
ALTER TABLE action_recommendations
ADD COLUMN IF NOT EXISTS month_number INTEGER;

COMMENT ON COLUMN action_recommendations.month_number IS 'Month number (1-12) for monthly recommendations. NULL for weekly.';

CREATE UNIQUE INDEX IF NOT EXISTS action_recommendations_monthly_unique
ON action_recommendations (store_id, month_number, year)
WHERE month_number IS NOT NULL;
