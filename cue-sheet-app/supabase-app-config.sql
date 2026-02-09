-- Auris Cue Sheets - App Config Table
-- Stores global configuration (API keys, feature flags) shared across all users.
-- Run this in the Supabase SQL Editor.

-- ============================================
-- App Config Table (key-value store)
-- ============================================
CREATE TABLE app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row Level Security
-- Authenticated users can read. Writes allowed for authenticated
-- users (admin checks are enforced at the app level).
-- ============================================
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read config"
  ON app_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert config"
  ON app_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update config"
  ON app_config FOR UPDATE
  TO authenticated
  USING (true);

-- ============================================
-- Seed rows for API keys (set values in Supabase dashboard)
-- ============================================
INSERT INTO app_config (key, value) VALUES
  ('anthropic_api_key', ''),
  ('voyage_api_key', '');
