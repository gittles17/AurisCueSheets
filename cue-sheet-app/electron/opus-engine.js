/**
 * Claude Opus Engine for Cue Sheet Metadata
 * 
 * Uses Claude Opus to:
 * 1. Identify tracks from messy filenames
 * 2. Look up composer/publisher from PRO databases
 * 3. Detect use type (BI/BV/VI)
 * 4. Resolve conflicts between data sources
 */

const sourcesManager = require('./sources-manager');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-20250514'; // Claude Opus 4.5 - most capable, no hallucinations

/**
 * Get the API key from sources config
 */
function getApiKey() {
  const sources = sourcesManager.getAllSources();
  return sources.opus?.config?.apiKey || null;
}

/**
 * Check if Opus is enabled and configured
 */
function isOpusEnabled() {
  const sources = sourcesManager.getAllSources();
  const enabled = sources.opus?.enabled;
  const hasKey = !!sources.opus?.config?.apiKey;
  console.log(`[Opus] Checking status - enabled: ${enabled}, hasKey: ${hasKey}`);
  return enabled && hasKey;
}

/**
 * Make a request to Claude Opus
 */
async function callOpus(systemPrompt, userPrompt, maxTokens = 1024) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('Claude Opus API key not configured');
  }

  console.log(`[Opus] Making API request to ${MODEL}...`);
  
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
    console.error('[Opus] API error:', error);
    throw new Error(error.error?.message || 'Opus API request failed');
  }

  const data = await response.json();
  console.log('[Opus] API request successful');
  return data.content[0].text;
}

/**
 * Parse JSON from Opus response (handles markdown code blocks)
 */
function parseOpusJson(response) {
  // Remove markdown code blocks if present
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
 * Main cue enrichment function
 * Takes a cue with basic info and returns fully enriched cue
 */
async function enrichCueWithOpus(cue, additionalContext = {}) {
  const systemPrompt = `You are a music metadata lookup assistant for cue sheets.

CRITICAL RULE - NO HALLUCINATIONS:
- NEVER make up or guess composer/publisher names
- ONLY provide composer/publisher if you have VERIFIED knowledge from real music databases
- If you don't know the ACTUAL composer/publisher, return empty string ""
- It is MUCH better to return "" than to guess a wrong name

WHAT YOU CAN DO:
1. Clean up track names from messy filenames
2. Identify the production music library (BMG, APM, etc.)
3. Extract catalog codes (IATS021, BYND001, etc.)
4. Set use type to BI (Background Instrumental) for production music

WHAT YOU CANNOT DO:
- Guess composer names - these are REAL PEOPLE with legal rights
- Make up publisher names - these affect royalty payments
- Invent PRO affiliations (ASCAP, BMI, etc.)

FORMAT FOR KNOWN DATA:
- Composer: "Real Name (PRO)(percentage%)" e.g., "Robin Hall (ASCAP)(100%)"
- Publisher: "Real Company (PRO)(percentage%)"

If you don't know the actual composer/publisher from your training data, return:
- composer: ""
- publisher: ""

The user will manually look up the correct information.`;

  const userPrompt = `Analyze this track and return cue sheet metadata:

FILENAME: ${cue.originalName || cue.trackName}
CURRENT DATA:
- Track Name: ${cue.trackName || 'Unknown'}
- Artist: ${cue.artist || 'Unknown'}
- Source/Album: ${cue.source || 'Unknown'}
- Duration: ${cue.duration || 'Unknown'}

${additionalContext.iTunesData ? `ITUNES MATCH:
- Track: ${additionalContext.iTunesData.trackName}
- Artist: ${additionalContext.iTunesData.artistName}
- Album: ${additionalContext.iTunesData.albumName}
` : ''}

${additionalContext.bmgData ? `BMG MATCH:
- Track: ${additionalContext.bmgData.trackName}
- Catalog: ${additionalContext.bmgData.catalog}
` : ''}

Return JSON with these fields:
{
  "trackName": "cleaned track name",
  "artist": "BMG Production Music or other library name",
  "source": "album/catalog name with code",
  "trackNumber": "",
  "composer": "ONLY if you know the REAL composer from verified sources, otherwise empty string",
  "publisher": "ONLY if you know the REAL publisher from verified sources, otherwise empty string",
  "use": "BI",
  "confidence": 0.0 to 1.0,
  "reasoning": "explain what you know vs what you don't know"
}

IMPORTANT: For composer and publisher, return "" if you are not 100% certain of the actual person/company.
DO NOT GUESS NAMES. Wrong names cause legal and payment issues.

Return ONLY the JSON object.`;

  try {
    console.log('[Opus] Calling Claude API for enrichment...');
    const response = await callOpus(systemPrompt, userPrompt);
    console.log('[Opus] Raw response:', response.substring(0, 500));
    const enrichedData = parseOpusJson(response);
    console.log('[Opus] Parsed data:', JSON.stringify(enrichedData, null, 2));
    
    // Merge with existing cue data
    return {
      ...cue,
      trackName: enrichedData.trackName || cue.trackName,
      artist: enrichedData.artist || cue.artist,
      source: enrichedData.source || cue.source,
      trackNumber: enrichedData.trackNumber || cue.trackNumber,
      composer: enrichedData.composer || cue.composer,
      publisher: enrichedData.publisher || cue.publisher,
      use: enrichedData.use || cue.use || 'BI',
      opusData: {
        confidence: enrichedData.confidence,
        reasoning: enrichedData.reasoning
      },
      status: enrichedData.composer && enrichedData.publisher ? 'complete' : 'pending'
    };
  } catch (error) {
    console.error('[Opus] Enrichment error:', error.message);
    return {
      ...cue,
      opusError: error.message
    };
  }
}

/**
 * Look up PRO data (BMI/ASCAP) for a track
 */
async function lookupPROData(trackName, artistName) {
  const systemPrompt = `You are a music rights database expert. Given a track name and artist, provide the likely composer and publisher information formatted for cue sheets.

Format rules:
- Composers: "Name (PRO)(percentage%)" where PRO is ASCAP, BMI, SESAC, or PRS
- Publishers: "Company Name (PRO)(percentage%)"
- If multiple parties, list each on separate lines or with semicolons
- If you're not confident, say so`;

  const userPrompt = `Find composer and publisher for:
Track: "${trackName}"
Artist: "${artistName}"

Return JSON:
{
  "composer": "formatted composer string",
  "publisher": "formatted publisher string",
  "confidence": 0.0 to 1.0,
  "source": "where this info likely comes from"
}`;

  try {
    const response = await callOpus(systemPrompt, userPrompt, 512);
    return parseOpusJson(response);
  } catch (error) {
    console.error('PRO lookup error:', error);
    return null;
  }
}

/**
 * Detect use type for a track
 */
async function detectUseType(trackName, context = {}) {
  const systemPrompt = `You determine the "Use" type for music cue sheets:
- BI = Background Instrumental (instrumental, not featured)
- BV = Background Vocal (has singing/vocals)
- VI = Visual Instrumental (featured on screen, like a band playing)

Production library music is almost always BI.
Sound effects are BI.
Songs with lyrics are BV.`;

  const userPrompt = `What is the Use type for: "${trackName}"
${context.hasVocals !== undefined ? `Has vocals: ${context.hasVocals}` : ''}
${context.isProductionMusic !== undefined ? `Is production music: ${context.isProductionMusic}` : ''}

Return ONLY: BI, BV, or VI`;

  try {
    const response = await callOpus(systemPrompt, userPrompt, 10);
    const useType = response.trim().toUpperCase();
    if (['BI', 'BV', 'VI'].includes(useType)) {
      return useType;
    }
    return 'BI'; // Default
  } catch (error) {
    return 'BI'; // Default on error
  }
}

/**
 * Batch process multiple cues
 */
async function enrichMultipleCues(cues, onProgress) {
  const results = [];
  
  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    
    if (onProgress) {
      onProgress(i + 1, cues.length, cue.trackName);
    }
    
    try {
      const enriched = await enrichCueWithOpus(cue);
      results.push(enriched);
    } catch (error) {
      results.push({ ...cue, opusError: error.message });
    }
    
    // Small delay to avoid rate limiting
    if (i < cues.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
}

/**
 * Detect which music library site a track belongs to
 * Uses Opus to analyze track metadata and determine the best site to search
 * 
 * @param {Object} trackData - Track data with available fields
 * @returns {Object} - { siteId: string, confidence: number, reason: string }
 */
async function detectTargetSite(trackData) {
  const { LOOKUP_SITES, detectSiteFromMetadata } = require('./lookup-sites');
  
  // First, try rule-based detection (catalog codes and aliases)
  const ruleBasedResult = detectSiteFromMetadata(trackData);
  if (ruleBasedResult.site) {
    console.log(`[Opus] Rule-based site detection: ${ruleBasedResult.site.name} (${ruleBasedResult.confidence})`);
    return {
      siteId: ruleBasedResult.site.id,
      siteName: ruleBasedResult.site.name,
      confidence: ruleBasedResult.confidence,
      reason: ruleBasedResult.reason,
      method: 'rule-based'
    };
  }
  
  // If rule-based detection fails and Opus is enabled, use AI
  if (!isOpusEnabled()) {
    return {
      siteId: null,
      siteName: null,
      confidence: 0,
      reason: 'Could not determine site from metadata and Opus is not enabled',
      method: 'none'
    };
  }
  
  const siteList = Object.values(LOOKUP_SITES)
    .filter(s => s.enabled)
    .map(s => `- ${s.id}: ${s.name} (aliases: ${s.aliases.slice(0, 3).join(', ')})`);
  
  const systemPrompt = `You are a music library identification assistant.

Given track metadata, determine which production music library the track is from.

Available libraries:
${siteList.join('\n')}

RULES:
- Only identify a library if you have strong evidence
- Look for library names, catalog codes, or distinctive patterns
- If uncertain, return "unknown"
- Do NOT guess - it's better to return "unknown" than be wrong`;

  const userPrompt = `Identify which music library this track is from:

Track Name: ${trackData.trackName || trackData.originalName || 'Unknown'}
Artist: ${trackData.artist || 'Unknown'}
Source/Album: ${trackData.source || 'Unknown'}
Library: ${trackData.library || 'Unknown'}
Catalog Code: ${trackData.catalogCode || 'Unknown'}

Return JSON:
{
  "siteId": "bmg" or "apm" or "extreme" or "musicbed" or "artlist" or "epidemic" or "soundstripe" or "unknown",
  "confidence": 0.0 to 1.0,
  "reason": "explanation of why you chose this library"
}

Return ONLY the JSON object.`;

  try {
    console.log('[Opus] Calling Claude API for site detection...');
    const response = await callOpus(systemPrompt, userPrompt, 256);
    const result = parseOpusJson(response);
    
    if (result.siteId && result.siteId !== 'unknown') {
      const site = LOOKUP_SITES[result.siteId];
      if (site) {
        return {
          siteId: result.siteId,
          siteName: site.name,
          confidence: result.confidence || 0.7,
          reason: result.reason,
          method: 'opus-ai'
        };
      }
    }
    
    return {
      siteId: null,
      siteName: null,
      confidence: 0,
      reason: result.reason || 'Opus could not determine the music library',
      method: 'opus-ai'
    };
  } catch (error) {
    console.error('[Opus] Site detection error:', error.message);
    return {
      siteId: null,
      siteName: null,
      confidence: 0,
      reason: `Site detection failed: ${error.message}`,
      method: 'error'
    };
  }
}

/**
 * Extract metadata from webpage content using Opus
 * 
 * @param {string} pageContent - Raw text content from the webpage
 * @param {string} siteName - Name of the site for context
 * @param {Object} trackHints - Known track info for matching
 * @returns {Object} - Extracted metadata
 */
async function extractMetadataFromPage(pageContent, siteName, trackHints = {}, sampleData = null) {
  if (!isOpusEnabled()) {
    return { success: false, error: 'Opus is not enabled' };
  }
  
  // Build sample data guidance if we have learned examples
  let sampleGuidance = '';
  if (sampleData && (sampleData.composer || sampleData.publisher)) {
    sampleGuidance = `
REFERENCE - Previous successful extraction from this site:
${sampleData.trackName ? `- Track: "${sampleData.trackName}"` : ''}
${sampleData.composer ? `- Composer format: "${sampleData.composer}"` : ''}
${sampleData.publisher ? `- Publisher format: "${sampleData.publisher}"` : ''}
${sampleData.album ? `- Album format: "${sampleData.album}"` : ''}
${sampleData.label ? `- Label format: "${sampleData.label}"` : ''}

Use the SAME formatting style for this extraction. Look for similar patterns in the page content.`;
  }
  
  const systemPrompt = `You are a music metadata extraction assistant.

Extract cue sheet metadata from this ${siteName} webpage content.

FORMAT RULES:
- Composer: "Name (PRO)(percentage%)" e.g., "John Smith (ASCAP)(100%)"
- Publisher: "Company Name (PRO)(percentage%)"
- PRO = ASCAP, BMI, SESAC, PRS, GEMA, etc.
- If multiple parties, separate with semicolons
${sampleGuidance}

CRITICAL:
- Only extract data that is CLEARLY stated on the page
- Do NOT make up or guess any names
- If a field is not found, return empty string ""`;

  const userPrompt = `Extract metadata from this ${siteName} page:

---PAGE CONTENT START---
${pageContent.substring(0, 8000)}
---PAGE CONTENT END---

${trackHints.trackName ? `Looking for track: "${trackHints.trackName}"` : ''}
${trackHints.duration ? `Expected duration: ${trackHints.duration}` : ''}

Return JSON:
{
  "trackName": "exact track name found on page",
  "composer": "formatted composer with PRO and percentage, or empty string",
  "publisher": "formatted publisher with PRO and percentage, or empty string",
  "album": "album name",
  "catalogCode": "catalog code if found",
  "duration": "duration in M:SS format",
  "label": "record label or master contact",
  "confidence": 0.0 to 1.0,
  "extractionNotes": "any issues or uncertainties"
}

Return ONLY the JSON object.`;

  try {
    console.log('[Opus] Extracting metadata from page...');
    const response = await callOpus(systemPrompt, userPrompt, 1024);
    const result = parseOpusJson(response);
    
    return {
      success: true,
      data: {
        trackName: result.trackName || '',
        composer: result.composer || '',
        publisher: result.publisher || '',
        album: result.album || '',
        catalogCode: result.catalogCode || '',
        duration: result.duration || '',
        label: result.label || '',
        masterContact: result.label || ''
      },
      confidence: result.confidence || 0.5,
      notes: result.extractionNotes || ''
    };
  } catch (error) {
    console.error('[Opus] Metadata extraction error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  isOpusEnabled,
  callOpus,
  parseOpusJson,
  enrichCueWithOpus,
  lookupPROData,
  detectUseType,
  enrichMultipleCues,
  detectTargetSite,
  extractMetadataFromPage
};
