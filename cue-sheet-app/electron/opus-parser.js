/**
 * Opus Parser - Intelligent filename parsing using Claude Opus
 * 
 * Extracts structured data from messy filenames:
 * - Track name
 * - Catalog code
 * - Library name
 * - Stem type
 * - Use type hints
 */

const sourcesManager = require('./sources-manager');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-20250514';

/**
 * Get the API key from sources config
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
 * Call Claude Opus API
 */
async function callOpus(systemPrompt, userPrompt, maxTokens = 512) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('Claude Opus API key not configured');
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Opus API request failed');
  }

  const data = await response.json();
  return data.content[0].text;
}

/**
 * Parse JSON from Opus response
 */
function parseOpusJson(response) {
  let cleaned = response.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

/**
 * Parse a filename to extract track metadata using Opus
 */
async function parseFilename(filename) {
  const systemPrompt = `You are a filename parser for production music libraries. Extract structured data from messy audio filenames.

COMMON PATTERNS TO RECOGNIZE:
- Catalog codes: IATS021, BYND001, APM1234, EXT5678
- Libraries: BMG, BMGPM, APM, Extreme, Universal, Artlist, Epidemic
- Prefixes: mx, mxBeyond-, BMGPM_
- Stem indicators: STEM, _BASS, _DRUMS, _FULL, _MIX
- FX indicators: FX, RISERS, DROPS, WHOOSH, HIT, STINGER

EXTRACT THESE FIELDS:
- trackName: The clean track name without prefixes, catalog codes, or stem indicators
- catalogCode: The catalog/album code (e.g., IATS021, BYND001)
- library: The music library name
- stemType: If this is a stem, what type (bass, drums, full, etc.)
- isStem: Boolean - is this a stem file?
- isFX: Boolean - is this a sound effect/FX track?

Return ONLY valid JSON. Do not invent data - if you can't extract something, use null.`;

  const userPrompt = `Parse this filename:
"${filename}"

Return JSON:
{
  "trackName": "clean track name",
  "catalogCode": "code or null",
  "library": "library name or null",
  "stemType": "stem type or null",
  "isStem": true/false,
  "isFX": true/false,
  "confidence": 0.0 to 1.0
}`;

  try {
    if (!isOpusEnabled()) {
      // Fallback to regex parsing if Opus not available
      return parseFilenameWithRegex(filename);
    }

    console.log('[OpusParser] Parsing filename:', filename);
    const response = await callOpus(systemPrompt, userPrompt, 256);
    const parsed = parseOpusJson(response);
    console.log('[OpusParser] Result:', parsed);
    return parsed;
  } catch (error) {
    console.error('[OpusParser] Error:', error.message);
    // Fallback to regex
    return parseFilenameWithRegex(filename);
  }
}

/**
 * Regex-based fallback parser
 */
function parseFilenameWithRegex(filename) {
  const result = {
    trackName: filename,
    catalogCode: null,
    library: null,
    stemType: null,
    isStem: false,
    isFX: false,
    confidence: 0.6
  };

  // Remove file extension
  let cleaned = filename.replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, '');

  // Extract catalog code
  const catalogMatch = cleaned.match(/\b([A-Z]{2,}[0-9]{2,})\b/i);
  if (catalogMatch) {
    result.catalogCode = catalogMatch[1].toUpperCase();
  }

  // Detect library
  const libraryPatterns = {
    'BMG Production Music': /\b(bmg|bmgpm)\b/i,
    'APM Music': /\b(apm)\b/i,
    'Extreme Music': /\b(extreme|ext)\b/i,
    'Universal Production Music': /\b(universal|upm)\b/i,
    'Artlist': /\b(artlist)\b/i,
    'Epidemic Sound': /\b(epidemic)\b/i
  };

  for (const [library, pattern] of Object.entries(libraryPatterns)) {
    if (pattern.test(cleaned)) {
      result.library = library;
      break;
    }
  }

  // Detect stem
  const stemMatch = cleaned.match(/STEM[_\s]*(BASS|DRUMS|FULL|MIX|PERC|STRINGS|VOCALS?|NO\s*VOX)/i);
  if (stemMatch) {
    result.isStem = true;
    result.stemType = stemMatch[1].toUpperCase();
  }

  // Detect FX
  const fxPatterns = /\b(FX|RISERS?|DROPS?|WHOOSH|HIT|STINGER|IMPACT|TRANSITION)\b/i;
  if (fxPatterns.test(cleaned)) {
    result.isFX = true;
  }

  // Clean track name
  result.trackName = cleaned
    .replace(/^(mx|mxBeyond-|BMGPM_\w+_)/i, '')
    .replace(/\b[A-Z]{2,}[0-9]{2,}\b/gi, '')
    .replace(/STEM[_\s]*(BASS|DRUMS|FULL|MIX|PERC|STRINGS|VOCALS?|NO\s*VOX)/gi, '')
    .replace(/\b(RISERS?|DROPS?|REVS?|FX)\b/gi, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If track name is too short, use original
  if (result.trackName.length < 3) {
    result.trackName = filename.replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, '');
  }

  return result;
}

/**
 * Parse multiple filenames in batch
 */
async function parseFilenames(filenames) {
  const results = [];
  
  for (const filename of filenames) {
    try {
      const parsed = await parseFilename(filename);
      results.push({ filename, ...parsed });
    } catch (error) {
      results.push({
        filename,
        trackName: filename,
        catalogCode: null,
        library: null,
        stemType: null,
        isStem: false,
        isFX: false,
        confidence: 0.3,
        error: error.message
      });
    }
    
    // Small delay to avoid rate limiting
    if (isOpusEnabled()) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

/**
 * Extract catalog code from filename (quick, no API)
 */
function extractCatalogCode(filename) {
  const match = filename.match(/\b([A-Z]{2,}[0-9]{2,})\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Detect library from filename (quick, no API)
 */
function detectLibrary(filename) {
  const patterns = [
    { pattern: /\b(bmg|bmgpm)\b/i, library: 'BMG Production Music' },
    { pattern: /\b(apm)\b/i, library: 'APM Music' },
    { pattern: /\b(extreme|ext)\b/i, library: 'Extreme Music' },
    { pattern: /\b(universal|upm)\b/i, library: 'Universal Production Music' },
    { pattern: /\b(artlist)\b/i, library: 'Artlist' },
    { pattern: /\b(epidemic)\b/i, library: 'Epidemic Sound' },
    { pattern: /\bBYND/i, library: 'BMG Production Music' },
    { pattern: /\bIATS/i, library: 'BMG Production Music' }
  ];

  for (const { pattern, library } of patterns) {
    if (pattern.test(filename)) {
      return library;
    }
  }
  return null;
}

/**
 * Clean track name (quick, no API)
 */
function cleanTrackName(filename) {
  return filename
    .replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, '')
    .replace(/^(mx|mxBeyond-|BMGPM_\w+_|BYND-)/i, '')
    .replace(/\b[A-Z]{2,}[0-9]{2,}\b/gi, '')
    .replace(/STEM[_\s]*(BASS|DRUMS|FULL|MIX|PERC|STRINGS|VOCALS?|NO\s*VOX)/gi, '')
    .replace(/\s*[\(\[][^\)\]]*[\)\]]\s*/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || filename;
}

module.exports = {
  parseFilename,
  parseFilenames,
  parseFilenameWithRegex,
  extractCatalogCode,
  detectLibrary,
  cleanTrackName,
  isOpusEnabled
};
