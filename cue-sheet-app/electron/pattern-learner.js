/**
 * Pattern Learner Module
 * 
 * Learns from user corrections during the import wizard and stores patterns
 * for future automatic application.
 * 
 * Pattern Types:
 * - exclude: Patterns for clips to exclude (non-music detection)
 * - include: Patterns for clips incorrectly excluded
 * - category: Patterns for Main/SFX/Stem classification
 * - stem_group: Patterns for stem grouping
 * - name_cleanup: Patterns for track name cleanup
 * - library: Patterns for library detection
 */

const supabaseClient = require('./supabase-client');

// Confidence thresholds
const CONFIDENCE_THRESHOLDS = {
  AUTO_APPLY: 0.95,      // Auto-apply without showing
  SUGGEST: 0.80,         // Show as suggestion
  LEARN_INITIAL: 0.60,   // Initial confidence for new patterns
};

// Minimum occurrences before auto-applying
const MIN_OCCURRENCES_FOR_AUTO = 3;

/**
 * Learn patterns from user modifications during import
 */
async function learnFromModifications(projectPath, modifications) {
  const patternsLearned = [];
  const supabase = supabaseClient.getClient();
  
  if (!supabase) {
    console.log('[PatternLearner] Supabase not configured, storing locally');
    return { patternsLearned: [], storedLocally: true };
  }
  
  try {
    // Learn from excluded clips
    for (const clip of modifications.excludedClips || []) {
      const pattern = extractPattern(clip.name, 'exclude');
      if (pattern) {
        const result = await saveOrUpdatePattern({
          pattern_type: 'exclude',
          pattern: pattern.pattern,
          pattern_source: pattern.source,
          action: 'exclude',
          example_name: clip.name,
          source_project: projectPath,
        });
        if (result) patternsLearned.push(result);
      }
    }
    
    // Learn from included clips (user overrode auto-exclude)
    for (const clip of modifications.includedClips || []) {
      const pattern = extractPattern(clip.name, 'include');
      if (pattern) {
        const result = await saveOrUpdatePattern({
          pattern_type: 'include',
          pattern: pattern.pattern,
          pattern_source: pattern.source,
          action: 'include',
          example_name: clip.name,
          source_project: projectPath,
        });
        if (result) patternsLearned.push(result);
      }
    }
    
    // Learn from category changes
    for (const change of modifications.categoryChanges || []) {
      const pattern = extractPattern(change.name, 'category');
      if (pattern) {
        const result = await saveOrUpdatePattern({
          pattern_type: 'category',
          pattern: pattern.pattern,
          pattern_source: pattern.source,
          action: change.to, // 'main', 'sfx', or 'stem'
          example_name: change.name,
          from_category: change.from,
          to_category: change.to,
          source_project: projectPath,
        });
        if (result) patternsLearned.push(result);
      }
    }
    
    // Learn from name edits
    for (const edit of modifications.nameEdits || []) {
      if (edit.originalName !== edit.newName) {
        const result = await saveOrUpdatePattern({
          pattern_type: 'name_cleanup',
          pattern: edit.originalName,
          pattern_source: 'exact',
          action: 'rename',
          example_name: edit.originalName,
          replacement: edit.newName,
          source_project: projectPath,
        });
        if (result) patternsLearned.push(result);
      }
    }
    
    console.log(`[PatternLearner] Learned ${patternsLearned.length} patterns`);
    return { patternsLearned, storedLocally: false };
    
  } catch (error) {
    console.error('[PatternLearner] Error learning patterns:', error);
    throw error;
  }
}

/**
 * Extract a pattern from a clip name
 */
function extractPattern(name, type) {
  if (!name) return null;
  
  // For exclusions, try to find meaningful patterns
  if (type === 'exclude' || type === 'include') {
    // Look for camera patterns: CAM 1, CAM A, etc.
    const camMatch = name.match(/\bCAM\s*[\dA-Z]/i);
    if (camMatch) {
      return { pattern: '\\bCAM\\s*[\\dA-Z]', source: 'regex' };
    }
    
    // Look for interview/dialogue patterns
    if (/\binterview\b/i.test(name)) {
      return { pattern: '\\binterview\\b', source: 'regex_i' };
    }
    
    // Look for VO patterns
    if (/\bVO[\s_]/i.test(name)) {
      return { pattern: '\\bVO[\\s_]', source: 'regex_i' };
    }
    
    // Look for date patterns (production audio)
    const dateMatch = name.match(/\d{2}\.\d{2}\.\d{4}/);
    if (dateMatch) {
      return { pattern: '\\d{2}\\.\\d{2}\\.\\d{4}', source: 'regex' };
    }
    
    // Look for Podcast patterns
    if (/\bpodcast\b/i.test(name)) {
      return { pattern: '\\bpodcast\\b', source: 'regex_i' };
    }
    
    // ADR patterns
    if (/\bADR\b/i.test(name)) {
      return { pattern: '\\bADR\\b', source: 'regex_i' };
    }
    
    // Temp patterns
    if (/\bTemp\b/i.test(name)) {
      return { pattern: '\\bTemp\\b', source: 'regex_i' };
    }
    
    // Default: use the exact name (or part of it)
    return { pattern: name, source: 'exact' };
  }
  
  // For category patterns
  if (type === 'category') {
    // SFX indicators
    if (/\b(sfx|fx|hit|whoosh|riser|stinger)\b/i.test(name)) {
      const match = name.match(/\b(sfx|fx|hit|whoosh|riser|stinger)\b/i);
      return { pattern: `\\b${match[1]}\\b`, source: 'regex_i' };
    }
    
    // Stem indicators
    if (/\b(stem|stems)\b/i.test(name)) {
      return { pattern: '\\bstems?\\b', source: 'regex_i' };
    }
    
    // Default to part of the name
    return { pattern: name.substring(0, 20), source: 'prefix' };
  }
  
  return { pattern: name, source: 'exact' };
}

/**
 * Save or update a pattern in the database
 */
async function saveOrUpdatePattern(patternData) {
  const supabase = supabaseClient.getClient();
  if (!supabase) return null;
  
  try {
    // Check if a similar pattern already exists
    const { data: existing } = await supabase
      .from('import_patterns')
      .select('*')
      .eq('pattern_type', patternData.pattern_type)
      .eq('pattern', patternData.pattern)
      .eq('action', patternData.action)
      .single();
    
    if (existing) {
      // Update existing pattern: increment count, boost confidence
      const newCount = (existing.times_used || 0) + 1;
      const newConfidence = Math.min(0.99, existing.confidence + 0.05);
      
      const { data, error } = await supabase
        .from('import_patterns')
        .update({
          times_used: newCount,
          confidence: newConfidence,
          last_used_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    } else {
      // Insert new pattern
      const { data, error } = await supabase
        .from('import_patterns')
        .insert({
          ...patternData,
          confidence: CONFIDENCE_THRESHOLDS.LEARN_INITIAL,
          times_used: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('[PatternLearner] Error saving pattern:', error);
    return null;
  }
}

/**
 * Get all learned patterns
 */
async function getAllPatterns() {
  const supabase = supabaseClient.getClient();
  if (!supabase) {
    return [];
  }
  
  try {
    const { data, error } = await supabase
      .from('import_patterns')
      .select('*')
      .order('confidence', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[PatternLearner] Error getting patterns:', error);
    return [];
  }
}

/**
 * Get patterns that should auto-apply (high confidence, enough uses)
 */
async function getAutoApplyPatterns() {
  const supabase = supabaseClient.getClient();
  if (!supabase) {
    return [];
  }
  
  try {
    const { data, error } = await supabase
      .from('import_patterns')
      .select('*')
      .gte('confidence', CONFIDENCE_THRESHOLDS.AUTO_APPLY)
      .gte('times_used', MIN_OCCURRENCES_FOR_AUTO)
      .order('confidence', { ascending: false });
    
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('[PatternLearner] Error getting auto-apply patterns:', error);
    return [];
  }
}

/**
 * Apply learned patterns to clips
 */
function applyPatternsToClips(clips, patterns) {
  const applied = [];
  
  for (const clip of clips) {
    const clipName = clip.originalName || clip.trackName || '';
    
    for (const pattern of patterns) {
      let matches = false;
      
      // Check if pattern matches this clip
      if (pattern.pattern_source === 'exact') {
        matches = clipName === pattern.pattern;
      } else if (pattern.pattern_source === 'prefix') {
        matches = clipName.startsWith(pattern.pattern);
      } else if (pattern.pattern_source === 'regex' || pattern.pattern_source === 'regex_i') {
        try {
          const flags = pattern.pattern_source === 'regex_i' ? 'i' : '';
          const regex = new RegExp(pattern.pattern, flags);
          matches = regex.test(clipName);
        } catch (e) {
          console.error('[PatternLearner] Invalid regex:', pattern.pattern, e);
        }
      }
      
      if (matches) {
        // Apply the pattern
        if (pattern.pattern_type === 'exclude') {
          clip.excluded = true;
          clip.autoExcluded = true;
          clip.excludeReason = `Learned pattern: ${pattern.example_name}`;
        } else if (pattern.pattern_type === 'include') {
          clip.excluded = false;
          clip.autoExcluded = false;
        } else if (pattern.pattern_type === 'category') {
          clip.cueType = pattern.action;
          clip.categorySource = 'learned';
        } else if (pattern.pattern_type === 'name_cleanup' && pattern.replacement) {
          clip.trackName = pattern.replacement;
          clip.nameSource = 'learned';
        }
        
        applied.push({
          clipId: clip.id,
          patternId: pattern.id,
          patternType: pattern.pattern_type,
          confidence: pattern.confidence,
        });
        
        // Only apply first matching pattern per type
        break;
      }
    }
  }
  
  return { clips, applied };
}

/**
 * Reduce pattern confidence (when user overrides)
 */
async function reducePatternConfidence(patternId, amount = 0.1) {
  const supabase = supabaseClient.getClient();
  if (!supabase) return null;
  
  try {
    const { data: existing } = await supabase
      .from('import_patterns')
      .select('confidence')
      .eq('id', patternId)
      .single();
    
    if (existing) {
      const newConfidence = Math.max(0, existing.confidence - amount);
      
      const { data, error } = await supabase
        .from('import_patterns')
        .update({
          confidence: newConfidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', patternId)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    }
  } catch (error) {
    console.error('[PatternLearner] Error reducing confidence:', error);
  }
  return null;
}

/**
 * Delete a pattern
 */
async function deletePattern(patternId) {
  const supabase = supabaseClient.getClient();
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('import_patterns')
      .delete()
      .eq('id', patternId);
    
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('[PatternLearner] Error deleting pattern:', error);
    return false;
  }
}

module.exports = {
  learnFromModifications,
  getAllPatterns,
  getAutoApplyPatterns,
  applyPatternsToClips,
  reducePatternConfidence,
  deletePattern,
  CONFIDENCE_THRESHOLDS,
};
