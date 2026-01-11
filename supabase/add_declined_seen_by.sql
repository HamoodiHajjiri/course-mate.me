-- Add declined_seen_by column to matches table
-- This stores an array of user IDs who have seen the decline notification

ALTER TABLE matches ADD COLUMN IF NOT EXISTS declined_seen_by UUID[] DEFAULT '{}';

-- Create an index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_matches_declined_seen_by ON matches USING GIN(declined_seen_by);
