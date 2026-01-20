/**
 * Smart Use Type Detector
 * 
 * Determines BI/BV/VI use type based on track context:
 * - BI = Background Instrumental (instrumental, not featured)
 * - BV = Background Vocal (has singing/vocals)
 * - VI = Visual Instrumental (featured on screen)
 * 
 * Uses pattern matching first, falls back to Opus for complex cases.
 */

const sourcesManager = require('./sources-manager');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-20250514';

/**
 * Patterns that strongly indicate BI (Background Instrumental)
 */
const BI_PATTERNS = [
  // Production music / library music
  /\b(production music|library music|stock music)\b/i,
  // Sound effects
  /\b(fx|sfx|sound effect|whoosh|hit|impact|stinger|riser|drop|transition|swell)\b/i,
  // Instrumental indicators
  /\b(instrumental|inst\.|no vo[cx]|no vocal|without vocal)\b/i,
  // Stems (always instrumental by nature)
  /\bstem\b/i,
  // Underscore / score
  /\b(underscore|score|bed|background)\b/i,
  // Trailer music
  /\b(trailer|epic|cinematic|dramatic)\b/i,
  // Short duration indicators (sound effects)
  /\b(sting|bumper|logo|tag)\b/i
];

/**
 * Patterns that strongly indicate BV (Background Vocal)
 */
const BV_PATTERNS = [
  // Vocal indicators
  /\b(vocal|vocals|singing|singer|lyrics|lyric)\b/i,
  // Song indicators
  /\b(song|single|feat\.|featuring|ft\.)\b/i,
  // Full mix with vocals
  /\b(full mix|radio edit|album version)\b/i,
  // Popular music genres that typically have vocals
  /\b(pop|rock|hip hop|rap|r&b|soul|country|folk)\b/i
];

/**
 * Patterns that indicate VI (Visual Instrumental)
 */
const VI_PATTERNS = [
  // On-screen performance
  /\b(visual|on[-\s]?screen|performance|live|concert|band)\b/i,
  // Source music (playing from a device in scene)
  /\b(source music|diegetic)\b/i
];

/**
 * Libraries that are almost always BI
 */
const BI_LIBRARIES = [
  'BMG Production Music',
  'APM Music',
  'Extreme Music',
  'Universal Production Music',
  'Artlist',
  'Epidemic Sound',
  'AudioJungle',
  'PremiumBeat'
];

/**
 * Detect use type without API call (fast, pattern-based)
 */
function detectUseTypeFast(trackName, context = {}) {
  const name = (trackName || '').toLowerCase();
  const library = context.library || '';
  const duration = context.duration || 0;
  
  // Check if it's from a production music library (almost always BI)
  if (BI_LIBRARIES.some(lib => library.toLowerCase().includes(lib.toLowerCase()))) {
    // Even library music can have vocals - check for BV indicators
    for (const pattern of BV_PATTERNS) {
      if (pattern.test(name)) {
        return { useType: 'BV', confidence: 0.7, reason: 'Library track with vocal indicators' };
      }
    }
    return { useType: 'BI', confidence: 0.9, reason: 'Production music library' };
  }
  
  // Check duration - very short tracks are almost always BI (sound effects)
  if (duration && parseDuration(duration) < 15) {
    return { useType: 'BI', confidence: 0.9, reason: 'Short duration (likely SFX)' };
  }
  
  // Check for VI patterns first (least common)
  for (const pattern of VI_PATTERNS) {
    if (pattern.test(name)) {
      return { useType: 'VI', confidence: 0.7, reason: 'Visual/on-screen indicators' };
    }
  }
  
  // Check for BI patterns
  for (const pattern of BI_PATTERNS) {
    if (pattern.test(name)) {
      return { useType: 'BI', confidence: 0.85, reason: 'Instrumental indicators' };
    }
  }
  
  // Check for BV patterns
  for (const pattern of BV_PATTERNS) {
    if (pattern.test(name)) {
      return { useType: 'BV', confidence: 0.8, reason: 'Vocal indicators' };
    }
  }
  
  // Default to BI for unknown production music
  if (context.isProductionMusic) {
    return { useType: 'BI', confidence: 0.7, reason: 'Default for production music' };
  }
  
  // Default to BI with lower confidence
  return { useType: 'BI', confidence: 0.5, reason: 'Default (uncertain)' };
}

/**
 * Parse duration string to seconds
 */
function parseDuration(duration) {
  if (typeof duration === 'number') return duration;
  if (!duration) return 0;
  
  const parts = String(duration).split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
  }
  return parseFloat(duration) || 0;
}

/**
 * Detect use type with Opus (for complex cases)
 */
async function detectUseTypeWithOpus(trackName, context = {}) {
  const sources = sourcesManager.getAllSources();
  const apiKey = sources.opus?.config?.apiKey;
  
  if (!apiKey || !sources.opus?.enabled) {
    return detectUseTypeFast(trackName, context);
  }
  
  const systemPrompt = `You determine the "Use" type for music cue sheets. ONLY return one of: BI, BV, or VI.

DEFINITIONS:
- BI = Background Instrumental: Instrumental music not featured on screen. This includes production library music, sound effects, underscore, trailer music. DEFAULT for most production music.
- BV = Background Vocal: Music with singing/vocals. Songs with lyrics, vocal performances.
- VI = Visual Instrumental: Music that is visually featured on screen, like a band playing in scene, a character playing piano, source music from a radio shown in scene.

RULES:
1. Production music libraries (BMG, APM, Extreme, etc.) are almost always BI unless they explicitly have vocals
2. Sound effects (FX, hits, risers, stingers) are always BI
3. Short tracks (<15 sec) are usually BI (sound effects)
4. If unsure, default to BI

Return ONLY the use type code: BI, BV, or VI`;

  const userPrompt = `Track: "${trackName}"
${context.library ? `Library: ${context.library}` : ''}
${context.duration ? `Duration: ${context.duration}` : ''}
${context.isStem ? 'This is a STEM file (always BI)' : ''}
${context.isFX ? 'This is a sound effect (always BI)' : ''}

What is the Use type? Return ONLY: BI, BV, or VI`;

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
        max_tokens: 10,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      return detectUseTypeFast(trackName, context);
    }

    const data = await response.json();
    const useType = data.content[0].text.trim().toUpperCase();
    
    if (['BI', 'BV', 'VI'].includes(useType)) {
      return { useType, confidence: 0.9, reason: 'Opus analysis' };
    }
    
    return detectUseTypeFast(trackName, context);
  } catch (error) {
    console.error('[UseTypeDetector] Opus error:', error.message);
    return detectUseTypeFast(trackName, context);
  }
}

/**
 * Main detection function - uses fast detection, falls back to Opus for low confidence
 */
async function detectUseType(trackName, context = {}) {
  // First try fast pattern-based detection
  const fastResult = detectUseTypeFast(trackName, context);
  
  // If high confidence, return immediately
  if (fastResult.confidence >= 0.8) {
    return fastResult;
  }
  
  // For low confidence, try Opus if available
  const sources = sourcesManager.getAllSources();
  if (sources.opus?.enabled && sources.opus?.config?.apiKey) {
    return detectUseTypeWithOpus(trackName, context);
  }
  
  return fastResult;
}

/**
 * Batch detect use types for multiple tracks
 */
async function detectUseTypesBatch(tracks) {
  const results = [];
  
  for (const track of tracks) {
    const result = await detectUseType(track.trackName || track.name, {
      library: track.library || track.artist,
      duration: track.duration,
      isStem: track.isStem,
      isFX: track.isFX,
      isProductionMusic: track.isProductionMusic
    });
    results.push({
      ...track,
      useType: result.useType,
      useTypeConfidence: result.confidence,
      useTypeReason: result.reason
    });
  }
  
  return results;
}

module.exports = {
  detectUseType,
  detectUseTypeFast,
  detectUseTypeWithOpus,
  detectUseTypesBatch,
  BI_LIBRARIES
};
