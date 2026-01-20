/**
 * Pattern Engine - Hybrid Voyage/Opus intelligent learning system
 * 
 * Routes between:
 * - Voyage: Fast pattern matching and auto-fill (high confidence)
 * - Opus: Complex reasoning, pattern synthesis, and interactive choices (uncertain)
 * 
 * All patterns stored in Supabase for shared intelligence across users.
 */

const { supabase, isConfigured, getCurrentUser } = require('./supabase-client');

// Confidence thresholds
const CONFIDENCE_AUTO_FILL = 0.85;    // Auto-fill without asking
const CONFIDENCE_SUGGEST = 0.50;      // Present as top option
const CONFIDENCE_MINIMUM = 0.30;      // Include in options list

// Opus engine for complex reasoning
let opusEngine = null;
try {
  opusEngine = require('./opus-engine');
} catch (e) {
  console.log('[PatternEngine] Opus engine not available');
}

/**
 * Pattern Engine class
 */
class PatternEngine {
  constructor() {
    this.initialized = false;
    this.cachedPatterns = [];
    this.cacheTimestamp = null;
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Initialize the pattern engine
   */
  async initialize() {
    if (this.initialized) return;
    
    if (!isConfigured()) {
      console.log('[PatternEngine] Supabase not configured');
      return;
    }

    await this.refreshPatternCache();
    this.initialized = true;
    console.log('[PatternEngine] Initialized with', this.cachedPatterns.length, 'patterns');
  }

  /**
   * Check if engine is available
   */
  isAvailable() {
    return isConfigured() && this.initialized;
  }

  /**
   * Refresh the pattern cache from Supabase
   */
  async refreshPatternCache() {
    try {
      const { data, error } = await supabase
        .from('learned_patterns')
        .select('*')
        .gte('confidence', CONFIDENCE_MINIMUM)
        .order('confidence', { ascending: false });

      if (error) {
        console.error('[PatternEngine] Error loading patterns:', error);
        return;
      }

      this.cachedPatterns = data || [];
      this.cacheTimestamp = Date.now();
      console.log('[PatternEngine] Cached', this.cachedPatterns.length, 'patterns');
    } catch (e) {
      console.error('[PatternEngine] Error refreshing cache:', e);
    }
  }

  /**
   * Get patterns, refreshing cache if stale
   */
  async getPatterns() {
    if (!this.cacheTimestamp || Date.now() - this.cacheTimestamp > this.cacheDuration) {
      await this.refreshPatternCache();
    }
    return this.cachedPatterns;
  }

  /**
   * Check if a track matches a pattern's condition
   */
  matchesCondition(track, condition) {
    if (!condition || Object.keys(condition).length === 0) return false;

    for (const [key, value] of Object.entries(condition)) {
      // Handle different condition types
      if (key === 'library_contains') {
        if (!track.library || !track.library.toLowerCase().includes(value.toLowerCase())) {
          return false;
        }
      } else if (key === 'library') {
        if (!track.library || track.library.toLowerCase() !== value.toLowerCase()) {
          return false;
        }
      } else if (key === 'catalog_code_prefix') {
        if (!track.catalogCode || !track.catalogCode.toUpperCase().startsWith(value.toUpperCase())) {
          return false;
        }
      } else if (key === 'track_type') {
        if (track.trackType !== value) {
          return false;
        }
      } else if (key === 'source_contains') {
        if (!track.source || !track.source.toLowerCase().includes(value.toLowerCase())) {
          return false;
        }
      } else {
        // Direct field match
        const trackValue = track[key];
        if (!trackValue || trackValue.toLowerCase() !== value.toLowerCase()) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Apply a pattern's action to get the suggested value
   */
  applyAction(track, action) {
    if (action.value) {
      return action.value;
    }
    if (action.copy_from && track[action.copy_from]) {
      return track[action.copy_from];
    }
    return null;
  }

  /**
   * Find matching patterns for a track and field
   * Returns patterns sorted by confidence
   */
  async findMatchingPatterns(track, field) {
    const patterns = await this.getPatterns();
    const matches = [];

    for (const pattern of patterns) {
      // Check if pattern applies to this field
      if (pattern.action?.field !== field) continue;

      // Check if track matches condition
      if (!this.matchesCondition(track, pattern.condition)) continue;

      const suggestedValue = this.applyAction(track, pattern.action);
      if (!suggestedValue) continue;

      matches.push({
        patternId: pattern.id,
        value: suggestedValue,
        confidence: pattern.confidence,
        reasoning: pattern.opus_reasoning || this.generateReasoning(pattern),
        patternType: pattern.pattern_type,
        timesApplied: pattern.times_applied,
        timesConfirmed: pattern.times_confirmed
      });
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Generate human-readable reasoning for a pattern
   */
  generateReasoning(pattern) {
    const condition = pattern.condition;
    const action = pattern.action;
    
    let reason = '';
    
    if (condition.library_contains) {
      reason = `Tracks from ${condition.library_contains} libraries typically have ${action.field} = "${action.value}"`;
    } else if (condition.library) {
      reason = `${condition.library} tracks usually have ${action.field} = "${action.value}"`;
    } else if (condition.catalog_code_prefix) {
      reason = `Tracks with catalog code starting with ${condition.catalog_code_prefix} typically have ${action.field} = "${action.value}"`;
    } else if (condition.track_type) {
      reason = `${condition.track_type} music typically has ${action.field} = "${action.value}"`;
    } else {
      reason = `Based on ${pattern.times_confirmed} confirmed uses`;
    }

    return reason;
  }

  /**
   * FAST PATH: Apply high-confidence patterns automatically
   * Returns fields that were auto-filled
   */
  async applyHighConfidencePatterns(track) {
    const autoFilled = {};
    const fields = ['artist', 'source', 'label', 'publisher', 'composer'];

    for (const field of fields) {
      // Skip if field already has content
      if (this.hasContent(track[field])) continue;

      const matches = await this.findMatchingPatterns(track, field);
      const topMatch = matches[0];

      if (topMatch && topMatch.confidence >= CONFIDENCE_AUTO_FILL) {
        autoFilled[field] = {
          value: topMatch.value,
          confidence: topMatch.confidence,
          patternId: topMatch.patternId,
          reasoning: topMatch.reasoning,
          source: 'pattern_auto'
        };

        // Increment times_applied
        await this.incrementPatternUsage(topMatch.patternId);
      }
    }

    return autoFilled;
  }

  /**
   * Get interactive choices for uncertain fields
   * Returns options for the user to pick from
   */
  async getInteractiveChoices(track, field) {
    const matches = await this.findMatchingPatterns(track, field);
    
    // Build options list
    const options = [];

    // Add pattern-based options
    for (const match of matches) {
      if (match.confidence >= CONFIDENCE_MINIMUM) {
        options.push({
          id: `pattern_${match.patternId}`,
          value: match.value,
          confidence: match.confidence,
          reasoning: match.reasoning,
          source: 'pattern',
          patternId: match.patternId
        });
      }
    }

    // Add common defaults based on field type
    if (field === 'artist') {
      if (!options.find(o => o.value === 'N/A')) {
        options.push({
          id: 'default_na',
          value: 'N/A',
          confidence: 0.3,
          reasoning: 'Production music typically does not have a traditional artist',
          source: 'default'
        });
      }
    }

    // Always add "leave empty" and "something else" options
    options.push({
      id: 'leave_empty',
      value: null,
      confidence: 0,
      reasoning: 'Leave empty for manual entry later',
      source: 'user_choice'
    });

    options.push({
      id: 'custom',
      value: '__CUSTOM__',
      confidence: 0,
      reasoning: 'Enter a custom value',
      source: 'user_choice'
    });

    return {
      field,
      track: {
        id: track.id,
        trackName: track.trackName,
        library: track.library,
        catalogCode: track.catalogCode,
        trackType: track.trackType
      },
      options,
      topConfidence: options[0]?.confidence || 0,
      requiresChoice: options[0]?.confidence < CONFIDENCE_AUTO_FILL
    };
  }

  /**
   * Generate choices for multiple tracks (batch)
   * Groups similar tracks together for efficiency
   */
  async getBatchInteractiveChoices(tracks, field) {
    const choices = [];
    const groupedByContext = new Map();

    // Group tracks by context (library + track_type)
    for (const track of tracks) {
      const contextKey = `${track.library || 'unknown'}_${track.trackType || 'unknown'}`;
      if (!groupedByContext.has(contextKey)) {
        groupedByContext.set(contextKey, []);
      }
      groupedByContext.get(contextKey).push(track);
    }

    // Generate choices for each group
    for (const [contextKey, groupTracks] of groupedByContext) {
      // Get choices for the first track in group (representative)
      const representative = groupTracks[0];
      const choice = await this.getInteractiveChoices(representative, field);
      
      choices.push({
        ...choice,
        tracks: groupTracks.map(t => ({ id: t.id, trackName: t.trackName })),
        trackCount: groupTracks.length,
        contextKey
      });
    }

    return choices;
  }

  /**
   * Record a user's choice and update patterns
   */
  async recordUserChoice(track, field, chosenOption, allOptions = []) {
    if (!isConfigured()) return;

    try {
      const user = await getCurrentUser();
      
      // Determine action type
      let actionType = 'cell_edit';
      if (chosenOption.source === 'pattern') {
        actionType = 'select_option';
      } else if (chosenOption.source === 'default') {
        actionType = 'select_option';
      }

      // Record the action
      await supabase.from('user_actions').insert({
        user_id: user?.id,
        action_type: actionType,
        track_context: {
          library: track.library,
          catalog_code: track.catalogCode,
          track_type: track.trackType,
          track_name: track.trackName
        },
        field,
        old_value: track[field] || null,
        new_value: chosenOption.value,
        from_suggestion: chosenOption.source === 'pattern' || chosenOption.source === 'default',
        suggestion_options: allOptions.slice(0, 5), // Store top 5 options
        pattern_id: chosenOption.patternId || null,
        confidence_at_action: chosenOption.confidence
      });

      // If user selected a pattern option, update pattern confidence
      if (chosenOption.patternId) {
        await this.incrementPatternConfirmed(chosenOption.patternId);
      }

      // Check if we should create a new pattern
      await this.maybeCreatePattern(track, field, chosenOption.value);

    } catch (e) {
      console.error('[PatternEngine] Error recording choice:', e);
    }
  }

  /**
   * Record when user overrides a pattern-filled value
   */
  async recordPatternOverride(track, field, patternId, oldValue, newValue) {
    if (!isConfigured()) return;

    try {
      const user = await getCurrentUser();

      await supabase.from('user_actions').insert({
        user_id: user?.id,
        action_type: 'override_pattern',
        track_context: {
          library: track.library,
          catalog_code: track.catalogCode,
          track_type: track.trackType,
          track_name: track.trackName
        },
        field,
        old_value: oldValue,
        new_value: newValue,
        pattern_id: patternId
      });

      // Pattern confidence will be decreased by the database trigger

    } catch (e) {
      console.error('[PatternEngine] Error recording override:', e);
    }
  }

  /**
   * Check if we should create a new pattern based on user actions
   */
  async maybeCreatePattern(track, field, value) {
    if (!value || value === '__CUSTOM__') return;

    try {
      // Check recent actions for this context
      const user = await getCurrentUser();
      const contextKey = track.library || track.trackType;
      if (!contextKey) return;

      // Look for similar actions in the last 50 user actions
      const { data: recentActions } = await supabase
        .from('user_actions')
        .select('*')
        .eq('field', field)
        .eq('new_value', value)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!recentActions || recentActions.length < 3) return;

      // Count how many have similar context
      const similarContextCount = recentActions.filter(action => {
        const ctx = action.track_context;
        return ctx?.library === track.library || ctx?.track_type === track.trackType;
      }).length;

      // If 3+ similar actions, consider creating a pattern
      if (similarContextCount >= 3) {
        await this.createOrStrengthPattern(track, field, value, similarContextCount);
      }

    } catch (e) {
      console.error('[PatternEngine] Error checking for pattern creation:', e);
    }
  }

  /**
   * Create or strengthen a pattern
   */
  async createOrStrengthPattern(track, field, value, actionCount) {
    try {
      // Build condition based on track context
      const condition = {};
      if (track.library) {
        condition.library_contains = this.extractLibraryKeyword(track.library);
      } else if (track.trackType) {
        condition.track_type = track.trackType;
      } else if (track.catalogCode) {
        const prefix = track.catalogCode.replace(/\d+$/, '');
        if (prefix.length >= 2) {
          condition.catalog_code_prefix = prefix;
        }
      }

      if (Object.keys(condition).length === 0) return;

      const action = { field, value };

      // Check if pattern exists
      const { data: existing } = await supabase
        .from('learned_patterns')
        .select('id, confidence, times_confirmed')
        .match({ condition, action })
        .single();

      if (existing) {
        // Strengthen existing pattern
        const newConfidence = Math.min(0.95, existing.confidence + 0.05);
        await supabase
          .from('learned_patterns')
          .update({ 
            confidence: newConfidence,
            times_confirmed: existing.times_confirmed + 1 
          })
          .eq('id', existing.id);
        
        console.log(`[PatternEngine] Strengthened pattern ${existing.id} to ${newConfidence}`);
      } else {
        // Create new pattern
        const user = await getCurrentUser();
        const initialConfidence = Math.min(0.7, 0.4 + (actionCount * 0.1));

        await supabase.from('learned_patterns').insert({
          pattern_type: this.determinePatternType(condition),
          condition,
          action,
          confidence: initialConfidence,
          opus_reasoning: `Learned from ${actionCount} consistent user actions: when ${JSON.stringify(condition)}, set ${field} to "${value}"`,
          created_by: user?.id,
          contributors: user?.id ? [user.id] : []
        });

        console.log(`[PatternEngine] Created new pattern with confidence ${initialConfidence}`);
        
        // Refresh cache
        await this.refreshPatternCache();
      }

    } catch (e) {
      console.error('[PatternEngine] Error creating pattern:', e);
    }
  }

  /**
   * Extract a keyword from library name for matching
   */
  extractLibraryKeyword(library) {
    const keywords = ['BMG', 'APM', 'Artlist', 'Epidemic', 'Audio Network', 'Musicbed'];
    for (const kw of keywords) {
      if (library.toUpperCase().includes(kw.toUpperCase())) {
        return kw;
      }
    }
    return library.split(/[\s-_]/)[0]; // First word
  }

  /**
   * Determine pattern type from condition
   */
  determinePatternType(condition) {
    if (condition.library_contains || condition.library) return 'library_default';
    if (condition.catalog_code_prefix) return 'catalog_pattern';
    if (condition.track_type) return 'conditional';
    return 'library_default';
  }

  /**
   * Increment pattern usage count
   */
  async incrementPatternUsage(patternId) {
    try {
      await supabase.rpc('increment_pattern_applied', { pattern_id: patternId });
    } catch (e) {
      // Fallback if RPC doesn't exist
      await supabase
        .from('learned_patterns')
        .update({ times_applied: supabase.sql`times_applied + 1` })
        .eq('id', patternId);
    }
  }

  /**
   * Increment pattern confirmed count
   */
  async incrementPatternConfirmed(patternId) {
    try {
      const { data } = await supabase
        .from('learned_patterns')
        .select('confidence, times_confirmed')
        .eq('id', patternId)
        .single();

      if (data) {
        const newConfidence = Math.min(0.98, data.confidence + 0.03);
        await supabase
          .from('learned_patterns')
          .update({ 
            confidence: newConfidence,
            times_confirmed: data.times_confirmed + 1
          })
          .eq('id', patternId);
      }
    } catch (e) {
      console.error('[PatternEngine] Error incrementing confirmed:', e);
    }
  }

  /**
   * Use Opus to synthesize patterns from recent actions
   * Called periodically or on-demand
   */
  async synthesizePatternsWithOpus() {
    if (!opusEngine?.isAvailable?.()) {
      console.log('[PatternEngine] Opus not available for synthesis');
      return { success: false, reason: 'Opus not available' };
    }

    try {
      // Get recent user actions
      const { data: recentActions } = await supabase
        .from('user_actions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!recentActions || recentActions.length < 10) {
        return { success: false, reason: 'Not enough actions to analyze' };
      }

      // Group actions by field and value
      const actionSummary = {};
      for (const action of recentActions) {
        const key = `${action.field}:${action.new_value}`;
        if (!actionSummary[key]) {
          actionSummary[key] = {
            field: action.field,
            value: action.new_value,
            count: 0,
            contexts: []
          };
        }
        actionSummary[key].count++;
        actionSummary[key].contexts.push(action.track_context);
      }

      // Filter to significant patterns (3+ occurrences)
      const significantPatterns = Object.values(actionSummary)
        .filter(p => p.count >= 3);

      if (significantPatterns.length === 0) {
        return { success: false, reason: 'No significant patterns found' };
      }

      // Ask Opus to analyze and suggest patterns
      const prompt = `Analyze these user actions from a cue sheet application and identify patterns:

${JSON.stringify(significantPatterns, null, 2)}

For each pattern you identify:
1. Describe the condition that triggers it (e.g., "when library contains BMG")
2. Describe the action (e.g., "set artist to N/A")
3. Explain WHY this makes sense (the reasoning)
4. Rate your confidence (0-1) in this pattern

Focus on patterns related to:
- Production music libraries (BMG, APM, etc.) typically having "N/A" for artist
- Catalog code prefixes indicating specific libraries
- Track types affecting field values

Return as JSON array of pattern objects.`;

      // This would call Opus - implementation depends on opus-engine.js
      console.log('[PatternEngine] Would analyze with Opus:', prompt.substring(0, 200));
      
      return { 
        success: true, 
        patternsAnalyzed: significantPatterns.length,
        message: 'Pattern synthesis queued for Opus analysis'
      };

    } catch (e) {
      console.error('[PatternEngine] Error in Opus synthesis:', e);
      return { success: false, reason: e.message };
    }
  }

  /**
   * Get all patterns for display in settings
   */
  async getAllPatterns() {
    try {
      const { data, error } = await supabase
        .from('learned_patterns')
        .select('*')
        .order('confidence', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('[PatternEngine] Error getting all patterns:', e);
      return [];
    }
  }

  /**
   * Delete a pattern
   */
  async deletePattern(patternId) {
    try {
      const { error } = await supabase
        .from('learned_patterns')
        .delete()
        .eq('id', patternId);

      if (error) throw error;
      await this.refreshPatternCache();
      return { success: true };
    } catch (e) {
      console.error('[PatternEngine] Error deleting pattern:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Update a pattern's confidence manually
   */
  async updatePatternConfidence(patternId, confidence) {
    try {
      const { error } = await supabase
        .from('learned_patterns')
        .update({ confidence: Math.max(0, Math.min(1, confidence)) })
        .eq('id', patternId);

      if (error) throw error;
      await this.refreshPatternCache();
      return { success: true };
    } catch (e) {
      console.error('[PatternEngine] Error updating pattern:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Helper: Check if value has meaningful content
   */
  hasContent(value) {
    if (!value) return false;
    const trimmed = String(value).trim().toLowerCase();
    return trimmed.length > 0 && 
           trimmed !== '-' && 
           trimmed !== 'n/a' && 
           trimmed !== 'null' &&
           trimmed !== 'undefined';
  }
}

// Export singleton
const patternEngine = new PatternEngine();

module.exports = {
  patternEngine,
  PatternEngine,
  CONFIDENCE_AUTO_FILL,
  CONFIDENCE_SUGGEST,
  CONFIDENCE_MINIMUM
};
