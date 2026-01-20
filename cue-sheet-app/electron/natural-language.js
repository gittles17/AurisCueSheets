/**
 * Natural Language Parser - Parse user corrections in natural language
 * 
 * Examples of inputs this handles:
 * - "Track 2 composer is Robin Hall ASCAP"
 * - "All the Ka-Pow tracks are BMG Rights Management publisher"
 * - "Fire Thunder Hit is by Walter Werzowa BMI"
 * - "Change publisher to Sony Music Publishing"
 * - "Robin Hall wrote tracks 1, 3, and 5"
 */

const sourcesManager = require('./sources-manager');
const { formatComposer, formatPublisher, VALID_PROS } = require('./opus-validator');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-20250514';

/**
 * Get API key
 */
function getApiKey() {
  const sources = sourcesManager.getAllSources();
  return sources.opus?.config?.apiKey || null;
}

/**
 * Check if Opus is enabled
 */
function isOpusEnabled() {
  const sources = sourcesManager.getAllSources();
  return sources.opus?.enabled && sources.opus?.config?.apiKey;
}

/**
 * Quick pattern matching for common corrections (no API)
 */
function parseQuick(input, context = {}) {
  const result = {
    action: null,
    field: null,
    value: null,
    targets: [],
    confidence: 0.5
  };
  
  const lower = input.toLowerCase();
  
  // Detect field being modified
  if (lower.includes('composer') || lower.includes('wrote') || lower.includes('written by')) {
    result.field = 'composer';
  } else if (lower.includes('publisher') || lower.includes('published by')) {
    result.field = 'publisher';
  } else if (lower.includes('use type') || lower.includes('use is') || /\b(bi|bv|vi)\b/i.test(lower)) {
    result.field = 'useType';
  } else if (lower.includes('track name') || lower.includes('title')) {
    result.field = 'trackName';
  }
  
  // Detect track targets
  const trackNumMatch = input.match(/track\s*(\d+)/gi);
  if (trackNumMatch) {
    result.targets = trackNumMatch.map(m => {
      const num = m.match(/\d+/)[0];
      return { type: 'index', value: parseInt(num) - 1 }; // Convert to 0-based
    });
  }
  
  // "All tracks" or "all X tracks"
  if (lower.includes('all track') || lower.includes('all the')) {
    const albumMatch = input.match(/all\s+(?:the\s+)?(\w+)\s+tracks?/i);
    if (albumMatch) {
      result.targets = [{ type: 'album', value: albumMatch[1] }];
    } else {
      result.targets = [{ type: 'all' }];
    }
  }
  
  // Track by name
  const nameMatch = input.match(/"([^"]+)"/);
  if (nameMatch) {
    result.targets.push({ type: 'name', value: nameMatch[1] });
  }
  
  // Extract PRO if mentioned
  const proMatch = input.match(new RegExp(`\\b(${VALID_PROS.join('|')})\\b`, 'i'));
  
  // Extract value for composer/publisher
  if (result.field === 'composer') {
    // Pattern: "composer is NAME PRO"
    const composerMatch = input.match(/composer\s+is\s+(.+?)(?:\s+\d+%)?$/i) ||
                          input.match(/by\s+(.+?)(?:\s+\d+%)?$/i) ||
                          input.match(/wrote\s+by\s+(.+?)(?:\s+\d+%)?$/i);
    if (composerMatch) {
      let name = composerMatch[1].trim();
      // Remove PRO from name if present
      VALID_PROS.forEach(pro => {
        name = name.replace(new RegExp(`\\b${pro}\\b`, 'i'), '').trim();
      });
      result.value = formatComposer(name, proMatch ? proMatch[1] : null);
    }
  } else if (result.field === 'publisher') {
    const publisherMatch = input.match(/publisher\s+(?:is\s+)?(.+?)$/i) ||
                           input.match(/published by\s+(.+?)$/i) ||
                           input.match(/change publisher to\s+(.+?)$/i);
    if (publisherMatch) {
      let name = publisherMatch[1].trim();
      VALID_PROS.forEach(pro => {
        name = name.replace(new RegExp(`\\b${pro}\\b`, 'i'), '').trim();
      });
      result.value = formatPublisher(name, proMatch ? proMatch[1] : null);
    }
  } else if (result.field === 'useType') {
    const useMatch = input.match(/\b(bi|bv|vi)\b/i);
    if (useMatch) {
      result.value = useMatch[1].toUpperCase();
    }
  }
  
  // Determine action
  if (result.field && result.value) {
    result.action = result.targets.length > 1 ? 'batch_update' : 'update';
    result.confidence = 0.7;
  }
  
  return result;
}

/**
 * Parse with Opus for complex corrections
 */
async function parseWithOpus(input, context = {}) {
  const apiKey = getApiKey();
  
  if (!apiKey || !isOpusEnabled()) {
    return parseQuick(input, context);
  }
  
  const systemPrompt = `You parse natural language corrections for cue sheet data.
Extract structured data from user input about music tracks.

CONTEXT:
- This is for cue sheet management (TV/film music licensing)
- Users may reference tracks by number (1-based), name, or album
- Fields: composer, publisher, trackName, useType (BI/BV/VI), source, artist
- PRO codes: ASCAP, BMI, SESAC, PRS, SOCAN, GEMA

Return ONLY valid JSON.`;

  const trackContext = context.tracks ? 
    `Available tracks:\n${context.tracks.slice(0, 10).map((t, i) => `${i + 1}. "${t.trackName}" - ${t.source || 'Unknown album'}`).join('\n')}` : '';

  const userPrompt = `Parse this user correction:
"${input}"

${trackContext}

Return JSON:
{
  "action": "update" | "batch_update" | "delete" | "unknown",
  "field": "composer" | "publisher" | "trackName" | "useType" | "source" | "artist",
  "value": "the value to set (properly formatted)",
  "targets": [
    { "type": "index" | "name" | "album" | "all", "value": "..." }
  ],
  "confidence": 0.0 to 1.0,
  "explanation": "brief explanation of what this correction does"
}`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      return parseQuick(input, context);
    }

    const data = await response.json();
    let responseText = data.content[0].text.trim();
    
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/```json?\n?/g, '').replace(/```/g, '');
    }
    
    return JSON.parse(responseText);
  } catch (error) {
    console.error('[NaturalLanguage] Error:', error.message);
    return parseQuick(input, context);
  }
}

/**
 * Main parsing function
 */
async function parseCorrection(input, context = {}) {
  // First try quick parsing
  const quickResult = parseQuick(input, context);
  
  // If high confidence, return
  if (quickResult.confidence >= 0.8 && quickResult.action) {
    return quickResult;
  }
  
  // For lower confidence or complex input, use Opus
  if (isOpusEnabled()) {
    return parseWithOpus(input, context);
  }
  
  return quickResult;
}

/**
 * Apply parsed correction to tracks
 */
function applyCorrection(tracks, correction) {
  const updates = [];
  
  if (!correction.action || correction.action === 'unknown') {
    return { updates: [], error: 'Could not understand correction' };
  }
  
  // Find target tracks
  const targetIndices = [];
  
  for (const target of correction.targets) {
    if (target.type === 'all') {
      targetIndices.push(...tracks.map((_, i) => i));
    } else if (target.type === 'index') {
      targetIndices.push(target.value);
    } else if (target.type === 'name') {
      const idx = tracks.findIndex(t => 
        t.trackName?.toLowerCase().includes(target.value.toLowerCase())
      );
      if (idx >= 0) targetIndices.push(idx);
    } else if (target.type === 'album') {
      tracks.forEach((t, i) => {
        if (t.source?.toLowerCase().includes(target.value.toLowerCase())) {
          targetIndices.push(i);
        }
      });
    }
  }
  
  // Apply updates
  const uniqueIndices = [...new Set(targetIndices)].filter(i => i >= 0 && i < tracks.length);
  
  for (const idx of uniqueIndices) {
    const track = { ...tracks[idx] };
    track[correction.field] = correction.value;
    track._correctionSource = 'natural_language';
    track._correctionConfidence = correction.confidence;
    updates.push({ index: idx, track });
  }
  
  return { updates };
}

/**
 * Suggest corrections based on context
 */
function suggestCorrections(tracks) {
  const suggestions = [];
  
  // Find tracks missing composer
  const missingComposer = tracks.filter(t => !t.composer).map(t => t.trackName);
  if (missingComposer.length > 0 && missingComposer.length <= 3) {
    suggestions.push({
      template: `Track "${missingComposer[0]}" composer is [NAME] [PRO]`,
      description: 'Add composer to missing track'
    });
  }
  
  // Find tracks from same album
  const albumCounts = {};
  tracks.forEach(t => {
    if (t.source) {
      albumCounts[t.source] = (albumCounts[t.source] || 0) + 1;
    }
  });
  
  for (const [album, count] of Object.entries(albumCounts)) {
    if (count > 2) {
      const albumTracks = tracks.filter(t => t.source === album);
      const hasComposer = albumTracks.some(t => t.composer);
      if (!hasComposer) {
        suggestions.push({
          template: `All ${album.split(' ')[0]} tracks composer is [NAME] [PRO]`,
          description: `Set composer for all ${count} tracks from ${album}`
        });
      }
    }
  }
  
  return suggestions;
}

/**
 * Parse batch corrections (multiple lines)
 */
async function parseBatchCorrections(input, context = {}) {
  const lines = input.split('\n').filter(line => line.trim());
  const results = [];
  
  for (const line of lines) {
    const parsed = await parseCorrection(line, context);
    results.push({ input: line, ...parsed });
  }
  
  return results;
}

module.exports = {
  parseCorrection,
  parseQuick,
  parseWithOpus,
  applyCorrection,
  suggestCorrections,
  parseBatchCorrections,
  isOpusEnabled
};
