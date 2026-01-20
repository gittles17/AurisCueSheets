/**
 * Opus Matcher - Intelligent matching of search results to tracks
 * 
 * When searching BMG/PRO databases returns multiple results,
 * Opus analyzes which result best matches the original track.
 * 
 * Matching criteria:
 * - Catalog code match (highest weight)
 * - Duration match (within tolerance)
 * - Track name similarity
 * - Album/source match
 */

const sourcesManager = require('./sources-manager');

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
 * Calculate Levenshtein distance for string similarity
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1].toLowerCase() === str2[j - 1].toLowerCase()) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Calculate string similarity (0-1)
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  if (s1 === s2) return 1;
  
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;
  
  const distance = levenshteinDistance(s1, s2);
  return 1 - (distance / maxLen);
}

/**
 * Parse duration to seconds
 */
function parseDuration(duration) {
  if (!duration) return 0;
  if (typeof duration === 'number') return duration;
  
  const str = String(duration).trim();
  const parts = str.split(':');
  
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  
  return parseFloat(str) || 0;
}

/**
 * Check duration match (within tolerance)
 */
function durationMatch(dur1, dur2, tolerance = 5) {
  const s1 = parseDuration(dur1);
  const s2 = parseDuration(dur2);
  if (s1 === 0 || s2 === 0) return 0.5; // Unknown
  return Math.abs(s1 - s2) <= tolerance ? 1 : Math.max(0, 1 - Math.abs(s1 - s2) / 60);
}

/**
 * Quick score a search result against original track (no API)
 */
function quickScore(originalTrack, searchResult) {
  let score = 0;
  const weights = {
    catalogCode: 40,
    trackName: 30,
    duration: 20,
    album: 10
  };
  
  // Catalog code match (highest priority)
  if (originalTrack.catalogCode && searchResult.catalog) {
    const catSim = stringSimilarity(originalTrack.catalogCode, searchResult.catalog);
    score += weights.catalogCode * catSim;
  }
  
  // Track name similarity
  const nameSim = stringSimilarity(
    originalTrack.trackName || originalTrack.originalName,
    searchResult.trackName || searchResult.title
  );
  score += weights.trackName * nameSim;
  
  // Duration match
  const durMatch = durationMatch(originalTrack.duration, searchResult.duration);
  score += weights.duration * durMatch;
  
  // Album/source match
  if (originalTrack.source && searchResult.album) {
    const albumSim = stringSimilarity(originalTrack.source, searchResult.album);
    score += weights.album * albumSim;
  }
  
  return {
    score: score / 100,
    breakdown: {
      catalogMatch: originalTrack.catalogCode && searchResult.catalog ? 
        stringSimilarity(originalTrack.catalogCode, searchResult.catalog) : null,
      nameMatch: nameSim,
      durationMatch: durMatch,
      albumMatch: originalTrack.source && searchResult.album ?
        stringSimilarity(originalTrack.source, searchResult.album) : null
    }
  };
}

/**
 * Find best match from search results (quick, no API)
 */
function findBestMatchQuick(originalTrack, searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return { match: null, confidence: 0, reason: 'No search results' };
  }
  
  let bestMatch = null;
  let bestScore = 0;
  let bestBreakdown = null;
  
  for (const result of searchResults) {
    const { score, breakdown } = quickScore(originalTrack, result);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = result;
      bestBreakdown = breakdown;
    }
  }
  
  // Determine confidence level
  let confidence;
  let reason;
  
  if (bestScore >= 0.9) {
    confidence = 1.0;
    reason = 'Exact or near-exact match';
  } else if (bestScore >= 0.7) {
    confidence = 0.9;
    reason = 'Strong match';
  } else if (bestScore >= 0.5) {
    confidence = 0.7;
    reason = 'Partial match';
  } else if (bestScore >= 0.3) {
    confidence = 0.5;
    reason = 'Weak match - manual verification recommended';
  } else {
    confidence = 0.3;
    reason = 'Poor match - likely incorrect';
  }
  
  return {
    match: bestMatch,
    score: bestScore,
    confidence,
    reason,
    breakdown: bestBreakdown
  };
}

/**
 * Use Opus to find the best match (for complex cases)
 */
async function findBestMatchWithOpus(originalTrack, searchResults) {
  const apiKey = getApiKey();
  
  if (!apiKey || !isOpusEnabled()) {
    return findBestMatchQuick(originalTrack, searchResults);
  }
  
  if (!searchResults || searchResults.length === 0) {
    return { match: null, confidence: 0, reason: 'No search results' };
  }
  
  // If only one result, just score it
  if (searchResults.length === 1) {
    const { score, breakdown } = quickScore(originalTrack, searchResults[0]);
    return {
      match: searchResults[0],
      score,
      confidence: score >= 0.5 ? 0.8 : 0.4,
      reason: 'Single result',
      breakdown
    };
  }
  
  const systemPrompt = `You match audio tracks from search results to an original track.
Compare each search result to the original and pick the BEST match.
Consider: catalog codes, track names, durations, album names.

IMPORTANT:
- Catalog code matches are highest priority
- Duration should be within a few seconds
- Track names may have slight variations
- Return 0 (zero-indexed) if first result is best, 1 for second, etc.
- If NO result is a good match, return -1

Return ONLY valid JSON, no other text.`;

  const resultsDescription = searchResults.slice(0, 5).map((r, i) => 
    `${i}. Track: "${r.trackName || r.title}", Album: "${r.album || 'N/A'}", Catalog: "${r.catalog || 'N/A'}", Duration: ${r.duration || 'N/A'}`
  ).join('\n');

  const userPrompt = `ORIGINAL TRACK:
- Name: "${originalTrack.trackName || originalTrack.originalName}"
- Catalog: "${originalTrack.catalogCode || 'Unknown'}"
- Duration: ${originalTrack.duration || 'Unknown'}
- Album: "${originalTrack.source || 'Unknown'}"

SEARCH RESULTS:
${resultsDescription}

Which result (0-${Math.min(searchResults.length, 5) - 1}) best matches the original? Return -1 if none match well.

Return JSON:
{
  "bestIndex": number (-1 to ${Math.min(searchResults.length, 5) - 1}),
  "confidence": 0.0 to 1.0,
  "reason": "brief explanation"
}`;

  try {
    console.log('[OpusMatcher] Analyzing search results...');
    
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 150,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      console.error('[OpusMatcher] API error, falling back to quick match');
      return findBestMatchQuick(originalTrack, searchResults);
    }

    const data = await response.json();
    let responseText = data.content[0].text.trim();
    
    // Parse JSON
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/```json?\n?/g, '').replace(/```/g, '');
    }
    
    const result = JSON.parse(responseText);
    
    if (result.bestIndex === -1) {
      return {
        match: null,
        score: 0,
        confidence: result.confidence || 0.5,
        reason: result.reason || 'No good match found'
      };
    }
    
    const matchIndex = Math.min(Math.max(0, result.bestIndex), searchResults.length - 1);
    const match = searchResults[matchIndex];
    const { breakdown } = quickScore(originalTrack, match);
    
    return {
      match,
      matchIndex,
      score: result.confidence || 0.8,
      confidence: result.confidence || 0.8,
      reason: result.reason || 'Opus analysis',
      breakdown
    };
    
  } catch (error) {
    console.error('[OpusMatcher] Error:', error.message);
    return findBestMatchQuick(originalTrack, searchResults);
  }
}

/**
 * Main matching function - tries quick match first, uses Opus for low confidence
 */
async function findBestMatch(originalTrack, searchResults) {
  // First try quick matching
  const quickResult = findBestMatchQuick(originalTrack, searchResults);
  
  // If high confidence, return immediately
  if (quickResult.confidence >= 0.85) {
    console.log(`[OpusMatcher] Quick match: ${quickResult.reason} (${quickResult.confidence})`);
    return quickResult;
  }
  
  // For lower confidence, try Opus
  if (isOpusEnabled()) {
    console.log('[OpusMatcher] Low confidence, using Opus...');
    return findBestMatchWithOpus(originalTrack, searchResults);
  }
  
  return quickResult;
}

/**
 * Match multiple tracks to search results in batch
 */
async function matchBatch(tracks, searchResultsMap) {
  const results = [];
  
  for (const track of tracks) {
    const trackId = track.id || track.trackName;
    const searchResults = searchResultsMap[trackId] || [];
    
    const matchResult = await findBestMatch(track, searchResults);
    results.push({
      track,
      ...matchResult
    });
    
    // Small delay for API rate limiting
    if (isOpusEnabled()) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

module.exports = {
  findBestMatch,
  findBestMatchQuick,
  findBestMatchWithOpus,
  matchBatch,
  quickScore,
  stringSimilarity,
  durationMatch,
  parseDuration,
  isOpusEnabled
};
