-- ============================================
-- Auris Pattern Learning System - Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================

-- Drop existing patterns table if it exists (we're enhancing it)
-- CAUTION: This will delete existing patterns. Skip if you want to preserve them.
-- DROP TABLE IF EXISTS patterns;

-- Enhanced patterns table for intelligent rule learning
CREATE TABLE IF NOT EXISTS learned_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Pattern identification
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'library_default',    -- e.g., BMG tracks -> artist = N/A
    'field_copy',         -- e.g., copy library to source
    'format_rule',        -- e.g., publisher naming convention
    'catalog_pattern',    -- e.g., IATS* -> library = BMG
    'conditional'         -- e.g., if track_type = production AND library = BMG -> artist = N/A
  )),
  
  -- Conditions that trigger this pattern (JSONB for flexibility)
  -- Examples:
  -- {"library": "BMG"} 
  -- {"library": "BMG", "track_type": "production"}
  -- {"catalog_code_prefix": "IATS"}
  condition JSONB NOT NULL DEFAULT '{}',
  
  -- Action to take when pattern matches (JSONB)
  -- Examples:
  -- {"field": "artist", "value": "N/A"}
  -- {"field": "source", "copy_from": "library"}
  -- {"field": "publisher", "value": "BMG Rights Management"}
  action JSONB NOT NULL,
  
  -- Confidence and usage tracking
  confidence FLOAT NOT NULL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  times_applied INT NOT NULL DEFAULT 0,
  times_overridden INT NOT NULL DEFAULT 0,  -- When user changes the auto-filled value
  times_confirmed INT NOT NULL DEFAULT 0,   -- When user accepts the suggestion
  
  -- AI reasoning (why this pattern was created/updated)
  opus_reasoning TEXT,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  contributors UUID[] DEFAULT '{}',  -- All users who have reinforced this pattern
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure unique patterns
  UNIQUE(pattern_type, condition, action)
);

-- User actions table for learning from behavior
CREATE TABLE IF NOT EXISTS user_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  
  -- Action type
  action_type TEXT NOT NULL CHECK (action_type IN (
    'cell_edit',          -- User edited a cell directly
    'approve_track',      -- User approved a track (committed to learned DB)
    'reject_suggestion',  -- User rejected an AI suggestion
    'select_option',      -- User selected from Opus-presented options
    'override_pattern',   -- User changed a pattern-filled value
    'confirm_pattern'     -- User accepted a pattern-filled value (didn't change it)
  )),
  
  -- Context of the action
  track_context JSONB NOT NULL DEFAULT '{}',  -- library, catalog, track_type, track_name, etc.
  
  -- The specific change
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  
  -- Metadata about the action
  from_suggestion BOOLEAN DEFAULT FALSE,  -- Did user pick from options?
  suggestion_options JSONB,               -- What options were presented?
  pattern_id UUID REFERENCES learned_patterns(id),  -- If this reinforced a pattern
  confidence_at_action FLOAT,             -- Pattern confidence when action occurred
  
  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_learned_patterns_type ON learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_confidence ON learned_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_condition ON learned_patterns USING GIN(condition);
CREATE INDEX IF NOT EXISTS idx_user_actions_user ON user_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_actions_type ON user_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_user_actions_field ON user_actions(field);
CREATE INDEX IF NOT EXISTS idx_user_actions_created ON user_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_actions_context ON user_actions USING GIN(track_context);

-- Enable RLS
ALTER TABLE learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - All authenticated users can read and write patterns (shared intelligence)
CREATE POLICY "Anyone can read patterns" ON learned_patterns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can insert patterns" ON learned_patterns
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Anyone can update patterns" ON learned_patterns
  FOR UPDATE TO authenticated USING (true);

-- Users can only see their own actions (privacy) but patterns are shared
CREATE POLICY "Users can read own actions" ON user_actions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own actions" ON user_actions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Function to update pattern confidence based on user actions
CREATE OR REPLACE FUNCTION update_pattern_confidence()
RETURNS TRIGGER AS $$
BEGIN
  -- When a user action confirms or overrides a pattern, update confidence
  IF NEW.pattern_id IS NOT NULL THEN
    IF NEW.action_type = 'confirm_pattern' OR NEW.action_type = 'select_option' THEN
      UPDATE learned_patterns 
      SET 
        times_confirmed = times_confirmed + 1,
        confidence = LEAST(0.98, confidence + 0.05),
        contributors = array_append(
          array_remove(contributors, NEW.user_id), 
          NEW.user_id
        ),
        updated_at = NOW()
      WHERE id = NEW.pattern_id;
    ELSIF NEW.action_type = 'override_pattern' THEN
      UPDATE learned_patterns 
      SET 
        times_overridden = times_overridden + 1,
        confidence = GREATEST(0.1, confidence - 0.1),
        updated_at = NOW()
      WHERE id = NEW.pattern_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update pattern confidence
DROP TRIGGER IF EXISTS trigger_update_pattern_confidence ON user_actions;
CREATE TRIGGER trigger_update_pattern_confidence
  AFTER INSERT ON user_actions
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_confidence();

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for learned_patterns updated_at
DROP TRIGGER IF EXISTS trigger_learned_patterns_updated ON learned_patterns;
CREATE TRIGGER trigger_learned_patterns_updated
  BEFORE UPDATE ON learned_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Seed some initial patterns (optional)
-- These are common patterns for production music
-- ============================================

-- BMG Production Music - artist is usually N/A
INSERT INTO learned_patterns (pattern_type, condition, action, confidence, opus_reasoning)
VALUES (
  'library_default',
  '{"library_contains": "BMG"}',
  '{"field": "artist", "value": "N/A"}',
  0.7,
  'Production music from BMG typically does not have a traditional artist. The composer is credited instead.'
) ON CONFLICT DO NOTHING;

-- APM Music - artist is usually N/A
INSERT INTO learned_patterns (pattern_type, condition, action, confidence, opus_reasoning)
VALUES (
  'library_default',
  '{"library_contains": "APM"}',
  '{"field": "artist", "value": "N/A"}',
  0.7,
  'APM is a production music library where tracks are composed for licensing, not by traditional recording artists.'
) ON CONFLICT DO NOTHING;

-- Catalog code prefix IATS -> BMG
INSERT INTO learned_patterns (pattern_type, condition, action, confidence, opus_reasoning)
VALUES (
  'catalog_pattern',
  '{"catalog_code_prefix": "IATS"}',
  '{"field": "library", "value": "BMG Production Music"}',
  0.85,
  'IATS catalog codes are associated with BMG Production Music library.'
) ON CONFLICT DO NOTHING;

-- ============================================
-- View for pattern analytics
-- ============================================

CREATE OR REPLACE VIEW pattern_analytics AS
SELECT 
  lp.id,
  lp.pattern_type,
  lp.condition,
  lp.action,
  lp.confidence,
  lp.times_applied,
  lp.times_confirmed,
  lp.times_overridden,
  lp.opus_reasoning,
  ARRAY_LENGTH(lp.contributors, 1) as contributor_count,
  lp.created_at,
  lp.updated_at,
  -- Effectiveness score
  CASE 
    WHEN (lp.times_confirmed + lp.times_overridden) > 0 
    THEN ROUND((lp.times_confirmed::NUMERIC / (lp.times_confirmed + lp.times_overridden)) * 100, 1)
    ELSE NULL 
  END as effectiveness_percent
FROM learned_patterns lp
ORDER BY lp.confidence DESC, lp.times_applied DESC;

-- Grant access to the view
GRANT SELECT ON pattern_analytics TO authenticated;

-- ============================================
-- Success message
-- ============================================
SELECT 'Pattern Learning System schema created successfully!' as status;
