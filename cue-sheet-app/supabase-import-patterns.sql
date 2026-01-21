-- Import Patterns Table
-- Stores learned patterns from user corrections during the import wizard
-- Used to automatically apply corrections to future imports

CREATE TABLE IF NOT EXISTS import_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Pattern identification
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'exclude',      -- Patterns for clips to exclude (non-music)
    'include',      -- Patterns for clips incorrectly auto-excluded
    'category',     -- Patterns for Main/SFX/Stem classification
    'stem_group',   -- Patterns for stem grouping
    'name_cleanup', -- Patterns for track name cleanup
    'library'       -- Patterns for library detection
  )),
  
  -- The pattern itself
  pattern TEXT NOT NULL,                    -- The pattern string (regex or exact match)
  pattern_source TEXT NOT NULL DEFAULT 'exact' CHECK (pattern_source IN (
    'exact',    -- Exact string match
    'prefix',   -- Prefix match
    'regex',    -- Case-sensitive regex
    'regex_i'   -- Case-insensitive regex
  )),
  
  -- What to do when pattern matches
  action TEXT NOT NULL,                     -- 'exclude', 'include', 'main', 'sfx', 'stem', 'rename'
  replacement TEXT,                         -- For name_cleanup: the new name
  
  -- Learning metadata
  example_name TEXT,                        -- Original example that created this pattern
  from_category TEXT,                       -- For category changes: original category
  to_category TEXT,                         -- For category changes: new category
  source_project TEXT,                      -- Project path where pattern was learned
  
  -- Confidence and usage tracking
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.60,  -- 0.00 to 1.00
  times_used INTEGER NOT NULL DEFAULT 1,
  times_overridden INTEGER NOT NULL DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  
  -- User who created (optional, for multi-user)
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_import_patterns_type ON import_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_import_patterns_confidence ON import_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_import_patterns_type_action ON import_patterns(pattern_type, action);

-- Enable RLS
ALTER TABLE import_patterns ENABLE ROW LEVEL SECURITY;

-- Policies: All authenticated users can read patterns
CREATE POLICY "Anyone can read import patterns"
  ON import_patterns FOR SELECT
  TO authenticated
  USING (true);

-- Policies: Any authenticated user can insert patterns
CREATE POLICY "Authenticated users can create patterns"
  ON import_patterns FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policies: Any authenticated user can update patterns
CREATE POLICY "Authenticated users can update patterns"
  ON import_patterns FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies: Only admins can delete patterns
CREATE POLICY "Only admins can delete patterns"
  ON import_patterns FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.is_admin = true
    )
  );

-- Function to update timestamp on update
CREATE OR REPLACE FUNCTION update_import_patterns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic timestamp update
DROP TRIGGER IF EXISTS import_patterns_updated_at ON import_patterns;
CREATE TRIGGER import_patterns_updated_at
  BEFORE UPDATE ON import_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_import_patterns_updated_at();

-- Comments for documentation
COMMENT ON TABLE import_patterns IS 'Stores learned patterns from user corrections during import wizard';
COMMENT ON COLUMN import_patterns.pattern_type IS 'Type of pattern: exclude, include, category, stem_group, name_cleanup, library';
COMMENT ON COLUMN import_patterns.confidence IS 'Confidence score 0-1. Higher = more likely to auto-apply';
COMMENT ON COLUMN import_patterns.times_used IS 'Number of times this pattern has been used successfully';
COMMENT ON COLUMN import_patterns.times_overridden IS 'Number of times user overrode this pattern';
