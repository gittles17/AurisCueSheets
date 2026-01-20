-- Auris Cue Sheets - Supabase Database Schema
-- Run this in Supabase SQL Editor after creating your project

-- ============================================
-- User Roles Table (Admin Management)
-- ============================================
CREATE TABLE user_roles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  role TEXT NOT NULL DEFAULT 'user', -- 'admin' or 'user'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Data Sources Table (Admin-controlled, synced to all users)
-- ============================================
CREATE TABLE data_sources (
  id TEXT PRIMARY KEY, -- 'bmg', 'apm', 'opus', etc.
  category TEXT NOT NULL, -- 'ai', 'apis', 'smartlookup'
  name TEXT NOT NULL,
  description TEXT,
  search_url TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  requires_key BOOLEAN DEFAULT FALSE,
  key_fields JSONB DEFAULT '[]', -- Array of key field names
  config JSONB DEFAULT '{}', -- API keys stored here
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Tracks Table (Shared learned track metadata)
-- ============================================
CREATE TABLE tracks (
  id BIGSERIAL PRIMARY KEY,
  track_name TEXT NOT NULL,
  catalog_code TEXT,
  library TEXT,
  artist TEXT,
  source TEXT,
  composer TEXT,
  publisher TEXT,
  master_contact TEXT,
  use_type TEXT DEFAULT 'BI',
  duration TEXT,
  confidence REAL DEFAULT 1.0,
  data_source TEXT,
  verified BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(track_name, catalog_code, library)
);

-- ============================================
-- Patterns Table (For learning/prediction)
-- ============================================
CREATE TABLE patterns (
  id BIGSERIAL PRIMARY KEY,
  pattern_type TEXT NOT NULL,
  pattern_key TEXT NOT NULL,
  pattern_value TEXT NOT NULL,
  occurrences INTEGER DEFAULT 1,
  confidence REAL DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pattern_type, pattern_key, pattern_value)
);

-- ============================================
-- Aliases Table (Name matching)
-- ============================================
CREATE TABLE aliases (
  id BIGSERIAL PRIMARY KEY,
  alias TEXT NOT NULL UNIQUE,
  canonical TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Enable Real-time for key tables
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE tracks;
ALTER PUBLICATION supabase_realtime ADD TABLE data_sources;

-- ============================================
-- Row Level Security: Tracks
-- All authenticated users can read/write
-- ============================================
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read tracks" 
  ON tracks FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can insert tracks" 
  ON tracks FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update tracks" 
  ON tracks FOR UPDATE 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can delete tracks" 
  ON tracks FOR DELETE 
  TO authenticated 
  USING (true);

-- ============================================
-- Row Level Security: Data Sources
-- All can read, only admins can write
-- ============================================
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read data sources" 
  ON data_sources FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Only admins can insert data sources" 
  ON data_sources FOR INSERT 
  TO authenticated 
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Only admins can update data sources" 
  ON data_sources FOR UPDATE 
  TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Only admins can delete data sources" 
  ON data_sources FOR DELETE 
  TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- ============================================
-- Row Level Security: Patterns
-- All authenticated users can read/write
-- ============================================
ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read patterns" 
  ON patterns FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can insert patterns" 
  ON patterns FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update patterns" 
  ON patterns FOR UPDATE 
  TO authenticated 
  USING (true);

-- ============================================
-- Row Level Security: Aliases
-- All authenticated users can read/write
-- ============================================
ALTER TABLE aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read aliases" 
  ON aliases FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Authenticated users can insert aliases" 
  ON aliases FOR INSERT 
  TO authenticated 
  WITH CHECK (true);

-- ============================================
-- Row Level Security: User Roles
-- Users can read own role, admins can manage all
-- ============================================
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own role" 
  ON user_roles FOR SELECT 
  TO authenticated 
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all roles" 
  ON user_roles FOR SELECT 
  TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Only admins can insert roles" 
  ON user_roles FOR INSERT 
  TO authenticated 
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Only admins can update roles" 
  ON user_roles FOR UPDATE 
  TO authenticated 
  USING (EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

-- ============================================
-- User Profiles Table
-- ============================================
CREATE TABLE user_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL, -- Local device ID or Supabase user ID
  name TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Feedback Table
-- ============================================
CREATE TABLE feedback (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  category TEXT NOT NULL DEFAULT 'general', -- 'bug', 'feature', 'general'
  message TEXT NOT NULL,
  app_version TEXT,
  status TEXT DEFAULT 'new', -- 'new', 'read', 'resolved'
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable real-time for feedback
ALTER PUBLICATION supabase_realtime ADD TABLE feedback;

-- RLS for feedback
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can submit feedback" ON feedback FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can read all feedback" ON feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can update feedback" ON feedback FOR UPDATE TO authenticated USING (true);

-- RLS for user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own profile" ON user_profiles FOR ALL TO authenticated USING (true);

-- ============================================
-- Indexes for better query performance
-- ============================================
CREATE INDEX idx_tracks_track_name ON tracks(track_name);
CREATE INDEX idx_tracks_catalog_code ON tracks(catalog_code);
CREATE INDEX idx_tracks_library ON tracks(library);
CREATE INDEX idx_patterns_type_key ON patterns(pattern_type, pattern_key);
CREATE INDEX idx_aliases_alias ON aliases(alias);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);

-- ============================================
-- Highlights Table (for Auris Chat annotations)
-- ============================================
CREATE TABLE highlights (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL, -- Links to the ACS project
  row_ids JSONB NOT NULL DEFAULT '[]', -- Array of cue row IDs that are highlighted
  color TEXT NOT NULL DEFAULT 'yellow', -- Highlight color: yellow, blue, green, orange, purple
  annotation TEXT, -- User's note/instruction for this highlight
  created_by TEXT, -- User ID or device ID
  resolved BOOLEAN DEFAULT FALSE, -- Whether the AI has processed this
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable real-time for highlights
ALTER PUBLICATION supabase_realtime ADD TABLE highlights;

-- RLS for highlights
ALTER TABLE highlights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage highlights" ON highlights FOR ALL TO authenticated USING (true);

-- Index for faster project-based queries
CREATE INDEX idx_highlights_project ON highlights(project_id);
CREATE INDEX idx_highlights_resolved ON highlights(resolved);

-- ============================================
-- Chat History Table (for Auris Chat conversations)
-- ============================================
CREATE TABLE chat_history (
  id BIGSERIAL PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' or 'assistant'
  content TEXT NOT NULL,
  tool_calls JSONB, -- Any tool calls made by the assistant
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable real-time for chat
ALTER PUBLICATION supabase_realtime ADD TABLE chat_history;

-- RLS for chat history
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage chat history" ON chat_history FOR ALL TO authenticated USING (true);

-- Index for chat queries
CREATE INDEX idx_chat_project ON chat_history(project_id);
CREATE INDEX idx_chat_created ON chat_history(created_at);

-- ============================================
-- IMPORTANT: After creating your account, run this to make yourself admin
-- Replace 'YOUR_USER_ID' with your actual user ID from auth.users
-- ============================================
-- INSERT INTO user_roles (user_id, role) VALUES ('YOUR_USER_ID', 'admin');
