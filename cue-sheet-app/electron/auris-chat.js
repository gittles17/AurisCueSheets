/**
 * Auris Chat - Claude Opus powered AI assistant for cue sheet editing
 * Handles natural language requests and executes tool-based actions
 * 
 * Routes between:
 * - Voyage AI: Fast vector-based track lookups
 * - Claude Opus: Complex reasoning and analysis
 */

const Anthropic = require('@anthropic-ai/sdk');
const sourcesManager = require('./sources-manager');

// Voyage engine for fast lookups
let voyageEngine = null;
try {
  voyageEngine = require('./voyage-engine');
} catch (e) {
  console.log('[AurisChat] Voyage engine not available');
}

// Will be initialized with API key
let anthropic = null;
let lastApiKey = null;

/**
 * Classify request type to determine routing
 * Returns 'voyage' for fast lookup tasks, 'opus' for complex reasoning
 */
function classifyRequest(message) {
  const lowerMessage = message.toLowerCase();
  
  // Fast lookup patterns - use Voyage
  const voyagePatterns = [
    /fill in.*missing/i,
    /fill in.*data/i,
    /auto.?fill/i,
    /look ?up.*track/i,
    /find.*composer/i,
    /find.*publisher/i,
    /search.*database/i,
    /match.*tracks?/i,
    /^fill\b/i,
    /complete.*cue ?sheet/i
  ];
  
  for (const pattern of voyagePatterns) {
    if (pattern.test(message)) {
      return 'voyage';
    }
  }
  
  // Default to Opus for complex tasks
  return 'opus';
}

/**
 * Helper to check if a field has content
 */
function hasContent(value) {
  return value && value.trim() !== '' && value.trim() !== '-';
}

/**
 * Find sibling tracks in the cue sheet that could provide values
 * Looks for tracks with similar characteristics (same source/library) that have the field filled
 */
function findSiblingPatterns(incompleteCues, allCues, fieldsToCheck) {
  const suggestions = [];
  
  for (const field of fieldsToCheck) {
    // Find tracks missing this field
    const tracksMissing = incompleteCues.filter(c => !hasContent(c[field]));
    if (tracksMissing.length === 0) continue;
    
    // Group by source/library to find patterns
    const patternGroups = new Map();
    
    for (const track of tracksMissing) {
      // Find sibling tracks with same source OR same library that HAVE this field
      const siblingKey = track.source || track.label || track.library || 'unknown';
      
      const siblingsWithValue = allCues.filter(c => {
        // Must have the field filled
        if (!hasContent(c[field])) return false;
        // Must not be one of the incomplete tracks
        if (incompleteCues.some(ic => ic.id === c.id)) return false;
        // Must share source or library
        const sameSource = track.source && c.source && track.source === c.source;
        const sameLibrary = (track.label || track.library) && 
                           (c.label || c.library) && 
                           ((track.label || track.library) === (c.label || c.library));
        return sameSource || sameLibrary;
      });
      
      if (siblingsWithValue.length > 0) {
        // Count the values to find the most common one
        const valueCounts = {};
        for (const sibling of siblingsWithValue) {
          const val = sibling[field];
          valueCounts[val] = (valueCounts[val] || 0) + 1;
        }
        
        // Sort by frequency
        const sortedValues = Object.entries(valueCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3); // Top 3 values
        
        if (!patternGroups.has(siblingKey)) {
          patternGroups.set(siblingKey, {
            key: siblingKey,
            tracks: [],
            values: sortedValues,
            exampleTrack: siblingsWithValue[0]
          });
        }
        patternGroups.get(siblingKey).tracks.push(track);
      }
    }
    
    // Build suggestions from pattern groups
    for (const [key, group] of patternGroups) {
      if (group.values.length > 0) {
        const topValue = group.values[0][0];
        const count = group.values[0][1];
        suggestions.push({
          field,
          suggestedValue: topValue,
          tracksMissing: group.tracks,
          sourceKey: key,
          exampleTrack: group.exampleTrack,
          confidence: count > 1 ? 'high' : 'medium',
          reasoning: `${count} other track${count > 1 ? 's' : ''} with the same source/library ha${count > 1 ? 've' : 's'} ${field} = "${topValue}"`
        });
      }
    }
  }
  
  return suggestions;
}

/**
 * Build a smart prompt asking the user about sibling patterns
 */
function buildSiblingPrompt(suggestions, incompleteCues) {
  if (suggestions.length === 0) return null;
  
  const lines = [];
  lines.push(`I couldn't find these tracks in the learned database, but I noticed some patterns in your current cue sheet:\n`);
  
  // Group suggestions by field
  const byField = {};
  for (const s of suggestions) {
    if (!byField[s.field]) byField[s.field] = [];
    byField[s.field].push(s);
  }
  
  for (const [field, fieldSuggestions] of Object.entries(byField)) {
    for (const s of fieldSuggestions) {
      const trackNames = s.tracksMissing.slice(0, 3).map(t => t.trackName).join(', ');
      const moreCount = s.tracksMissing.length > 3 ? ` (+${s.tracksMissing.length - 3} more)` : '';
      
      lines.push(`**${field.charAt(0).toUpperCase() + field.slice(1)}**: Track "${s.exampleTrack.trackName}" has ${field} = "${s.suggestedValue}"`);
      lines.push(`  - Would you like me to apply this to: ${trackNames}${moreCount}?`);
      lines.push(`  - Reason: ${s.reasoning}\n`);
    }
  }
  
  lines.push(`Reply with "yes" to apply these suggestions, or tell me which specific changes you'd like to make.`);
  
  return {
    message: lines.join('\n'),
    suggestions,
    requiresConfirmation: true
  };
}

/**
 * Process request using Voyage AI for fast track matching
 * Now handles all fields: composer, publisher, source, label, artist
 */
async function processWithVoyage(message, context = {}) {
  const { cues = [] } = context;
  
  if (!voyageEngine?.isAvailable()) {
    console.log('[AurisChat] Voyage not available, falling back to Opus');
    return null; // Fall back to Opus
  }
  
  console.log('[AurisChat] Using Voyage for fast lookup');
  
  try {
    // Detect which fields we're being asked to fill
    const lowerMessage = message.toLowerCase();
    const fieldsToCheck = [];
    
    if (lowerMessage.includes('source')) fieldsToCheck.push('source');
    if (lowerMessage.includes('label') || lowerMessage.includes('library')) fieldsToCheck.push('label');
    if (lowerMessage.includes('artist')) fieldsToCheck.push('artist');
    if (lowerMessage.includes('composer')) fieldsToCheck.push('composer');
    if (lowerMessage.includes('publisher')) fieldsToCheck.push('publisher');
    
    // Default to composer/publisher if no specific fields mentioned
    if (fieldsToCheck.length === 0) {
      fieldsToCheck.push('composer', 'publisher');
    }
    
    // Find tracks that need any of the requested fields
    const incompleteCues = cues.filter(c => 
      fieldsToCheck.some(field => !hasContent(c[field]))
    );
    
    if (incompleteCues.length === 0) {
      const fieldList = fieldsToCheck.join(', ');
      return {
        success: true,
        message: `All tracks already have ${fieldList} data.`,
        actions: [],
        engine: 'voyage'
      };
    }
    
    // Search for matches using vector similarity
    const matches = await voyageEngine.searchAndMatch(incompleteCues, 0.65);
    
    if (matches.length === 0) {
      // No database matches - look for patterns in sibling tracks within this cue sheet
      console.log('[AurisChat] No database matches, checking sibling patterns...');
      const siblingPatterns = findSiblingPatterns(incompleteCues, cues, fieldsToCheck);
      
      if (siblingPatterns.length > 0) {
        const prompt = buildSiblingPrompt(siblingPatterns, incompleteCues);
        return {
          success: true,
          message: prompt.message,
          suggestions: prompt.suggestions,
          requiresConfirmation: true,
          actions: [],
          engine: 'voyage_sibling'
        };
      }
      
      // No sibling patterns either
      return {
        success: true,
        message: `Searched ${incompleteCues.length} tracks but found no matches in the database, and no similar tracks in the current cue sheet have this data filled in. Try:\n\n- Using Smart Lookup for individual tracks\n- Filling in one track manually, then I can apply it to similar tracks\n- Adding more tracks to your learned database`,
        actions: [],
        engine: 'voyage'
      };
    }
    
    // Build update actions - only fill fields that are empty AND exist in match
    const actions = [];
    const updateSummary = [];
    
    for (const m of matches) {
      const cue = cues.find(c => c.id === m.cueId);
      if (!cue) continue;
      
      const updates = {};
      const filledFields = [];
      
      // Only fill empty fields from matched data
      if (!hasContent(cue.composer) && hasContent(m.match.composer)) {
        updates.composer = m.match.composer;
        updates.composerConfidence = m.match.similarity;
        updates.composerSource = 'voyage_vector';
        filledFields.push('composer');
      }
      if (!hasContent(cue.publisher) && hasContent(m.match.publisher)) {
        updates.publisher = m.match.publisher;
        updates.publisherConfidence = m.match.similarity;
        updates.publisherSource = 'voyage_vector';
        filledFields.push('publisher');
      }
      if (!hasContent(cue.source) && hasContent(m.match.source)) {
        updates.source = m.match.source;
        filledFields.push('source');
      }
      if (!hasContent(cue.label) && hasContent(m.match.label || m.match.library)) {
        updates.label = m.match.label || m.match.library;
        filledFields.push('label');
      }
      if (!hasContent(cue.artist) && hasContent(m.match.artist)) {
        updates.artist = m.match.artist;
        filledFields.push('artist');
      }
      
      if (Object.keys(updates).length > 0) {
        actions.push({
          type: 'update_track',
          data: { trackId: m.cueId, updates }
        });
        updateSummary.push(`- **${m.trackName}**: filled ${filledFields.join(', ')} (${Math.round(m.match.similarity * 100)}% match)`);
      }
    }
    
    if (actions.length === 0) {
      return {
        success: true,
        message: `Found ${matches.length} matches but no empty fields to fill. The matched data was the same as existing data.`,
        actions: [],
        engine: 'voyage'
      };
    }
    
    return {
      success: true,
      message: `Updated ${actions.length} tracks:\n\n${updateSummary.join('\n')}`,
      actions,
      engine: 'voyage'
    };
  } catch (err) {
    console.error('[AurisChat] Voyage error:', err);
    return null; // Fall back to Opus
  }
}

/**
 * Get API key from sources config (same as opus-engine)
 */
function getApiKey() {
  const sources = sourcesManager.getAllSources();
  return sources.opus?.config?.apiKey || null;
}

/**
 * Initialize or reinitialize the Anthropic client
 */
function initializeClient() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[AurisChat] No API key found in sources config');
    return false;
  }
  
  // Only reinitialize if key changed
  if (apiKey === lastApiKey && anthropic) {
    return true;
  }
  
  try {
    anthropic = new Anthropic({ apiKey });
    lastApiKey = apiKey;
    console.log('[AurisChat] Client initialized');
    return true;
  } catch (err) {
    console.error('[AurisChat] Failed to initialize:', err.message);
    return false;
  }
}

/**
 * Check if Auris Chat is available
 */
function isAvailable() {
  return initializeClient();
}

/**
 * Tool definitions for Claude Opus
 */
const TOOLS = [
  {
    name: 'list_learned_tracks',
    description: 'List all tracks stored in the learned database. Use this to see what track data is available. Returns tracks with composer/publisher info.',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Optional search term to filter tracks by name, composer, publisher, or library'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tracks to return (default 50)'
        }
      }
    }
  },
  {
    name: 'get_database_stats',
    description: 'Get statistics about the learned track database - total tracks, verified tracks, patterns learned.',
    input_schema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'lookup_track',
    description: 'Search the learned track database for composer and publisher information for a specific track. Returns matching data if found.',
    input_schema: {
      type: 'object',
      properties: {
        track_name: {
          type: 'string',
          description: 'The name of the track to look up'
        },
        catalog_code: {
          type: 'string',
          description: 'Optional catalog code to help narrow down the search'
        },
        artist: {
          type: 'string',
          description: 'Optional artist name to help identify the track'
        }
      },
      required: ['track_name']
    }
  },
  {
    name: 'update_track',
    description: 'Update a specific track in the cue sheet with new data. Use this to fill in composer, publisher, or other metadata.',
    input_schema: {
      type: 'object',
      properties: {
        track_id: {
          type: 'string',
          description: 'The ID of the track to update'
        },
        updates: {
          type: 'object',
          description: 'Object containing fields to update',
          properties: {
            composer: { type: 'string' },
            publisher: { type: 'string' },
            artist: { type: 'string' },
            source: { type: 'string' },
            label: { type: 'string' },
            masterContact: { type: 'string' },
            use: { type: 'string' }
          }
        }
      },
      required: ['track_id', 'updates']
    }
  },
  {
    name: 'bulk_update_tracks',
    description: 'Update multiple tracks at once. Use this for batch operations like filling in data for several tracks.',
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          description: 'Array of track updates',
          items: {
            type: 'object',
            properties: {
              track_id: { type: 'string' },
              updates: {
                type: 'object',
                properties: {
                  composer: { type: 'string' },
                  publisher: { type: 'string' },
                  artist: { type: 'string' },
                  source: { type: 'string' }
                }
              }
            },
            required: ['track_id', 'updates']
          }
        }
      },
      required: ['updates']
    }
  },
  {
    name: 'save_to_database',
    description: 'Save track information to the learned database for future lookups. Use this after successfully looking up or verifying track data.',
    input_schema: {
      type: 'object',
      properties: {
        track_name: { type: 'string' },
        catalog_code: { type: 'string' },
        composer: { type: 'string' },
        publisher: { type: 'string' },
        artist: { type: 'string' },
        source: { type: 'string' },
        library: { type: 'string' }
      },
      required: ['track_name']
    }
  },
  {
    name: 'analyze_cue_sheet',
    description: 'Analyze the current cue sheet and return statistics about completeness, patterns, and suggestions.',
    input_schema: {
      type: 'object',
      properties: {
        include_patterns: {
          type: 'boolean',
          description: 'Whether to analyze and report patterns in the data'
        }
      }
    }
  },
  {
    name: 'get_highlighted_tracks',
    description: 'Get information about tracks that are currently highlighted by the user, including any annotations.',
    input_schema: {
      type: 'object',
      properties: {
        highlight_id: {
          type: 'string',
          description: 'Optional specific highlight ID to get. If not provided, returns all highlights.'
        }
      }
    }
  }
];

/**
 * Build the system prompt with context
 */
function buildSystemPrompt(context = {}) {
  const { projectName, cueCount, completedCount, highlightCount, cues } = context;
  
  // Build a comprehensive summary of ALL tracks with their IDs
  let trackSummary = '';
  if (cues && cues.length > 0) {
    trackSummary = '\n\nALL TRACKS IN CUE SHEET (use these exact IDs for updates):\n';
    trackSummary += cues.map((c, index) => {
      const fields = [];
      fields.push(`Row ${index + 1}`);
      fields.push(`ID: "${c.id}"`); // CRITICAL: This is the UUID to use for updates
      fields.push(`Name: "${c.trackName}"`);
      fields.push(`Artist: ${c.artist || 'EMPTY'}`);
      fields.push(`Composer: ${c.composer || 'EMPTY'}`);
      fields.push(`Publisher: ${c.publisher || 'EMPTY'}`);
      fields.push(`Source: ${c.source || 'EMPTY'}`);
      fields.push(`Library: ${c.label || c.library || 'EMPTY'}`);
      return `- ${fields.join(' | ')}`;
    }).join('\n');
  }
  
  return `You are Auris Chat, an AI assistant specialized in helping users complete music cue sheets. You help look up track metadata (composers, publishers, labels) and fill in missing information.

CURRENT PROJECT CONTEXT:
- Project: ${projectName || 'Untitled'}
- Total tracks: ${cueCount || 0}
- Completed: ${completedCount || 0}
- Needs data: ${(cueCount || 0) - (completedCount || 0)}
${trackSummary}

YOUR CAPABILITIES:
1. List and search the learned track database (list_learned_tracks, get_database_stats)
2. Look up specific track information (lookup_track)
3. Update individual or multiple tracks with new data (update_track, bulk_update_tracks)
4. Save verified track data to the database for future use (save_to_database)
5. Analyze cue sheet completeness and patterns (analyze_cue_sheet)

CRITICAL: BE PROACTIVE AND TAKE ACTION
- When the user asks to "fill in" or "set" data, DO IT IMMEDIATELY using update_track or bulk_update_tracks
- ALWAYS use the UUID from "ID: xxx" shown above - NEVER use row numbers
- DO NOT ask for confirmation when you have high-confidence matches from the database
- When you find a match in the learned database, IMMEDIATELY call update_track with the track ID
- Use bulk_update_tracks when updating multiple tracks at once for efficiency

WORKFLOW FOR UPDATES:
1. Find the tracks that need updating from the list above
2. Get the EXACT ID (UUID format like "abc-123-def") from the "ID:" field - NOT the row number
3. Call update_track or bulk_update_tracks with these exact IDs
4. Report what you updated

IMPORTANT - TRACK IDs:
- The track ID is a UUID like "abc123-def456-..." shown as "ID: xxx" above
- NEVER use row numbers (1, 2, 3) as track IDs - they won't work
- Copy the exact ID string from the track listing above
- Example: If listing shows 'ID: "cue-abc123"' use track_id: "cue-abc123"

Always be action-oriented. Fill in data when you can. Be concise.`;
}

/**
 * Execute a tool call and return the result
 */
async function executeTool(toolName, toolInput, context = {}) {
  const { trackDatabase, cloudTrackDatabase, cues, highlights } = context;
  
  console.log(`[AurisChat] Executing tool: ${toolName}`, toolInput);
  
  switch (toolName) {
    case 'list_learned_tracks': {
      const { search, limit = 50 } = toolInput;
      let tracks = [];
      
      // Get from local database first
      if (trackDatabase) {
        try {
          tracks = trackDatabase.getAllTracks(search || '', limit, 0);
          console.log(`[AurisChat] Found ${tracks.length} tracks in local database`);
        } catch (e) {
          console.error('[AurisChat] Error getting local tracks:', e);
        }
      }
      
      // Try cloud database
      if (cloudTrackDatabase?.isAvailable?.()) {
        try {
          const cloudTracks = await cloudTrackDatabase.getAllTracks({ search, limit });
          // Merge, preferring cloud data
          const trackMap = new Map();
          tracks.forEach(t => trackMap.set(`${t.trackName}-${t.catalogCode}`, t));
          cloudTracks.forEach(t => trackMap.set(`${t.trackName}-${t.catalogCode}`, { ...t, source: 'cloud' }));
          tracks = Array.from(trackMap.values());
          console.log(`[AurisChat] Total tracks after cloud merge: ${tracks.length}`);
        } catch (e) {
          console.error('[AurisChat] Error getting cloud tracks:', e);
        }
      }
      
      return {
        success: true,
        count: tracks.length,
        tracks: tracks.slice(0, limit).map(t => ({
          trackName: t.trackName,
          composer: t.composer || null,
          publisher: t.publisher || null,
          artist: t.artist || null,
          library: t.library || t.catalogCode || null,
          verified: t.verified || false
        }))
      };
    }
    
    case 'get_database_stats': {
      let localStats = { tracks: 0, verified: 0, patterns: 0, aliases: 0 };
      let cloudStats = { tracks: 0, verified: 0, patterns: 0, aliases: 0 };
      
      if (trackDatabase) {
        try {
          localStats = trackDatabase.getStats();
        } catch (e) {
          console.error('[AurisChat] Error getting local stats:', e);
        }
      }
      
      if (cloudTrackDatabase?.isAvailable?.()) {
        try {
          cloudStats = await cloudTrackDatabase.getStats();
        } catch (e) {
          console.error('[AurisChat] Error getting cloud stats:', e);
        }
      }
      
      return {
        success: true,
        local: localStats,
        cloud: cloudStats,
        total: {
          tracks: localStats.tracks + cloudStats.tracks,
          verified: localStats.verified + cloudStats.verified,
          patterns: localStats.patterns + cloudStats.patterns
        }
      };
    }
    
    case 'lookup_track': {
      const { track_name, catalog_code, artist } = toolInput;
      let result = null;
      
      // Try local database first (faster)
      if (trackDatabase) {
        try {
          result = trackDatabase.findTrackWithStrategies(track_name, catalog_code, artist);
          if (result) {
            console.log(`[AurisChat] Found match in local DB: ${result.trackName}`);
          }
        } catch (e) {
          console.error('[AurisChat] Error searching local DB:', e);
        }
      }
      
      // Try cloud database if no local result
      if (!result && cloudTrackDatabase?.isAvailable?.()) {
        try {
          result = await cloudTrackDatabase.findTrackWithStrategies(track_name, catalog_code, artist);
          if (result) {
            console.log(`[AurisChat] Found match in cloud DB: ${result.trackName}`);
          }
        } catch (e) {
          console.error('[AurisChat] Error searching cloud DB:', e);
        }
      }
      
      if (result) {
        return {
          success: true,
          found: true,
          track: {
            trackName: result.trackName,
            composer: result.composer,
            publisher: result.publisher,
            artist: result.artist,
            source: result.source,
            library: result.library,
            matchType: result.matchType,
            confidence: result.matchConfidence
          }
        };
      }
      
      return {
        success: true,
        found: false,
        message: `No match found for "${track_name}" in the learned database`
      };
    }
    
    case 'update_track': {
      const { track_id, updates } = toolInput;
      // Return the update for the frontend to apply
      return {
        success: true,
        trackId: track_id,
        updates,
        action: 'update_track'
      };
    }
    
    case 'bulk_update_tracks': {
      const { updates } = toolInput;
      return {
        success: true,
        updates,
        action: 'bulk_update_tracks',
        count: updates.length
      };
    }
    
    case 'save_to_database': {
      // Return for frontend to save
      return {
        success: true,
        track: toolInput,
        action: 'save_to_database'
      };
    }
    
    case 'analyze_cue_sheet': {
      if (!cues || cues.length === 0) {
        return { success: true, message: 'No cue sheet loaded' };
      }
      
      const hasComposer = cues.filter(c => c.composer && c.composer.trim()).length;
      const hasPublisher = cues.filter(c => c.publisher && c.publisher.trim()).length;
      const complete = cues.filter(c => 
        c.composer && c.composer.trim() && 
        c.publisher && c.publisher.trim()
      ).length;
      
      // Find patterns
      const patterns = {};
      if (toolInput.include_patterns) {
        cues.forEach(c => {
          if (c.catalogCode) {
            const prefix = c.catalogCode.replace(/\d+$/, '');
            patterns[prefix] = (patterns[prefix] || 0) + 1;
          }
        });
      }
      
      return {
        success: true,
        analysis: {
          totalTracks: cues.length,
          withComposer: hasComposer,
          withPublisher: hasPublisher,
          complete,
          incomplete: cues.length - complete,
          completionRate: Math.round((complete / cues.length) * 100),
          patterns: Object.entries(patterns)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([prefix, count]) => ({ prefix, count }))
        }
      };
    }
    
    case 'get_highlighted_tracks': {
      const { highlight_id } = toolInput;
      
      if (!highlights || highlights.length === 0) {
        return { success: true, highlights: [], message: 'No highlights found' };
      }
      
      let targetHighlights = highlights;
      if (highlight_id) {
        targetHighlights = highlights.filter(h => h.id === highlight_id);
      }
      
      // Enrich highlights with track data
      const enriched = targetHighlights.map(h => {
        const tracks = h.rowIds
          .map(id => cues?.find(c => c.id === id))
          .filter(Boolean);
        
        return {
          id: h.id,
          color: h.color,
          annotation: h.annotation,
          resolved: h.resolved,
          tracks: tracks.map(t => ({
            id: t.id,
            trackName: t.trackName,
            composer: t.composer || null,
            publisher: t.publisher || null,
            artist: t.artist || null,
            catalogCode: t.catalogCode || null
          }))
        };
      });
      
      return {
        success: true,
        highlights: enriched
      };
    }
    
    default:
      return {
        success: false,
        error: `Unknown tool: ${toolName}`
      };
  }
}

/**
 * Check if message is a confirmation (yes/apply/do it)
 * Also checks if message references the pending suggestions (implicit confirmation)
 */
function isConfirmation(message, pendingSuggestions = []) {
  const lowerMsg = message.toLowerCase().trim();
  
  // Direct confirmation patterns
  const confirmPatterns = [
    /^yes$/i, /^yes[,.\s]/i, /^y$/i, /^yep/i, /^yeah/i,
    /^apply/i, /^do it/i, /^go ahead/i, /^sounds good/i,
    /^ok$/i, /^okay/i, /^sure/i, /^please/i, /^confirm/i,
    /^that'?s? (right|correct|good)/i, /^perfect/i, /^great/i
  ];
  
  if (confirmPatterns.some(p => p.test(lowerMsg))) {
    return true;
  }
  
  // Check if the message references the suggested action (implicit confirmation)
  // e.g., "Set artist to BMG Production Music for 2 tracks"
  if (pendingSuggestions && pendingSuggestions.length > 0) {
    for (const suggestion of pendingSuggestions) {
      const field = suggestion.field?.toLowerCase();
      const value = suggestion.suggestedValue?.toLowerCase();
      
      // If message mentions both the field and the value, it's likely a confirmation
      if (field && value && lowerMsg.includes(field) && lowerMsg.includes(value.substring(0, 10))) {
        return true;
      }
      
      // If message says "set [field]" or "apply [field]" or "fill [field]"
      if (field && /\b(set|apply|fill|use|update)\b/.test(lowerMsg) && lowerMsg.includes(field)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Process a chat message and generate a response
 * Routes between Voyage (fast lookups) and Opus (complex reasoning)
 */
async function processMessage(userMessage, conversationHistory = [], context = {}) {
  const { pendingSuggestions, cues = [] } = context;
  
  console.log('[AurisChat] Processing message:', userMessage.substring(0, 50));
  console.log('[AurisChat] Pending suggestions:', pendingSuggestions ? pendingSuggestions.length : 0);
  
  // Check if user is confirming previous suggestions
  if (pendingSuggestions && pendingSuggestions.length > 0) {
    console.log('[AurisChat] Has pending suggestions, checking for confirmation...');
    console.log('[AurisChat] Suggestions:', JSON.stringify(pendingSuggestions, null, 2).substring(0, 500));
  }
  
  if (isConfirmation(userMessage, pendingSuggestions) && pendingSuggestions && pendingSuggestions.length > 0) {
    console.log('[AurisChat] User confirmed suggestions, applying...');
    
    const actions = [];
    const updateSummary = [];
    
    for (const suggestion of pendingSuggestions) {
      for (const track of suggestion.tracksMissing) {
        actions.push({
          type: 'update_track',
          data: {
            trackId: track.id,
            updates: { [suggestion.field]: suggestion.suggestedValue }
          }
        });
      }
      updateSummary.push(`- Set **${suggestion.field}** to "${suggestion.suggestedValue}" for ${suggestion.tracksMissing.length} track${suggestion.tracksMissing.length > 1 ? 's' : ''}`);
    }
    
    return {
      success: true,
      message: `Done! Applied the following changes:\n\n${updateSummary.join('\n')}`,
      actions,
      engine: 'voyage_sibling_confirmed'
    };
  }
  
  // Classify request and try Voyage for fast lookups
  const requestType = classifyRequest(userMessage);
  console.log(`[AurisChat] Request classified as: ${requestType}`);
  
  if (requestType === 'voyage' && voyageEngine?.isAvailable()) {
    const voyageResult = await processWithVoyage(userMessage, context);
    if (voyageResult) {
      return voyageResult;
    }
    // Fall through to Opus if Voyage returns null
    console.log('[AurisChat] Voyage returned no result, falling back to Opus');
  }
  
  // Use Opus for complex reasoning
  if (!isAvailable()) {
    return {
      success: false,
      error: 'Auris Chat is not available. Please add your Claude API key in Settings > General.'
    };
  }
  
  try {
    // Build messages array
    const messages = [
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];
    
    // Make initial API call
    let response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', // Using Sonnet for speed, can switch to Opus
      max_tokens: 4096,
      system: buildSystemPrompt(context),
      tools: TOOLS,
      messages
    });
    
    const toolResults = [];
    const assistantMessages = [];
    
    // Process tool use loop
    while (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
      
      // Execute all tool calls
      const results = await Promise.all(
        toolUseBlocks.map(async (toolUse) => {
          const result = await executeTool(toolUse.name, toolUse.input, context);
          toolResults.push({
            name: toolUse.name,
            input: toolUse.input,
            result
          });
          return {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          };
        })
      );
      
      // Continue conversation with tool results
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: results });
      
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: buildSystemPrompt(context),
        tools: TOOLS,
        messages
      });
    }
    
    // Extract final text response
    const textBlocks = response.content.filter(block => block.type === 'text');
    const finalMessage = textBlocks.map(b => b.text).join('\n');
    
    // Collect all actions that need to be executed by the frontend
    const actions = toolResults
      .filter(r => r.result.action)
      .map(r => ({
        type: r.result.action,
        data: r.result
      }));
    
    return {
      success: true,
      message: finalMessage,
      toolCalls: toolResults,
      actions,
      usage: response.usage
    };
    
  } catch (err) {
    console.error('[AurisChat] Error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Process a highlight annotation
 * This is called when a user adds an annotation to a highlight
 */
async function processHighlightAnnotation(highlight, cues, context = {}) {
  if (!highlight.annotation) {
    return { success: false, error: 'No annotation provided' };
  }
  
  // Build a message that includes the highlight context
  const trackList = highlight.rowIds
    .map(id => cues.find(c => c.id === id))
    .filter(Boolean)
    .map(t => `- ${t.trackName}${t.composer ? ` (Composer: ${t.composer})` : ''}${t.catalogCode ? ` [${t.catalogCode}]` : ''}`)
    .join('\n');
  
  const message = `The user has highlighted the following tracks and added this instruction: "${highlight.annotation}"

Highlighted tracks:
${trackList}

Please process this request and update the tracks accordingly.`;
  
  return processMessage(message, [], {
    ...context,
    cues,
    highlights: [highlight]
  });
}

module.exports = {
  isAvailable,
  processMessage,
  processHighlightAnnotation,
  initializeClient
};
