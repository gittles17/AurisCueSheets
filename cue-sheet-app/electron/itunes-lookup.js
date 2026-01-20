/**
 * iTunes Search API Integration
 * 
 * Free API - No authentication required
 * Rate limit: ~20 requests/minute
 * 
 * Useful for: Artist name, Album name, Track number, Genre
 * NOT useful for: Composer, Publisher (use BMI/ASCAP for PRO data)
 */

const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';

/**
 * Search iTunes for a track
 * @param {string} trackName - Name of the track to search
 * @param {string} artistName - Optional artist name to narrow search
 * @returns {Promise<Object>} Search results
 */
async function searchTrack(trackName, artistName = '') {
  try {
    // Build search term
    let searchTerm = trackName;
    if (artistName && !artistName.includes('Production Music')) {
      searchTerm = `${trackName} ${artistName}`;
    }
    
    // Clean search term (remove common suffixes that won't match)
    searchTerm = searchTerm
      .replace(/\s*\(.*?\)\s*/g, '') // Remove parenthetical content
      .replace(/\s*-\s*.*$/g, '')    // Remove dash suffixes
      .trim();
    
    const params = new URLSearchParams({
      term: searchTerm,
      media: 'music',
      entity: 'song',
      limit: '10',
      country: 'us'
    });
    
    const response = await fetch(`${ITUNES_SEARCH_URL}?${params}`);
    
    if (!response.ok) {
      throw new Error(`iTunes API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      success: true,
      resultCount: data.resultCount,
      results: data.results.map(normalizeResult)
    };
  } catch (error) {
    console.error('iTunes search error:', error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
}

/**
 * Normalize iTunes result to our cue format
 */
function normalizeResult(result) {
  return {
    trackName: result.trackName,
    artistName: result.artistName,
    albumName: result.collectionName,
    trackNumber: result.trackNumber,
    trackCount: result.trackCount,
    genre: result.primaryGenreName,
    releaseDate: result.releaseDate,
    previewUrl: result.previewUrl,
    artworkUrl: result.artworkUrl100,
    trackId: result.trackId,
    artistId: result.artistId,
    collectionId: result.collectionId
  };
}

/**
 * Find best match for a track name
 * @param {string} trackName - Track name to match
 * @param {string} artistName - Optional artist hint
 * @returns {Promise<Object|null>} Best matching result or null
 */
async function findBestMatch(trackName, artistName = '') {
  const searchResult = await searchTrack(trackName, artistName);
  
  if (!searchResult.success || searchResult.results.length === 0) {
    return null;
  }
  
  // Score each result based on similarity
  const scoredResults = searchResult.results.map(result => {
    let score = 0;
    
    // Track name similarity (highest weight)
    const trackSimilarity = stringSimilarity(
      trackName.toLowerCase(), 
      result.trackName.toLowerCase()
    );
    score += trackSimilarity * 50;
    
    // Artist name match (if provided and not production music)
    if (artistName && !artistName.includes('Production Music')) {
      const artistSimilarity = stringSimilarity(
        artistName.toLowerCase(),
        result.artistName.toLowerCase()
      );
      score += artistSimilarity * 30;
    }
    
    // Prefer shorter track names (less likely to be remixes/versions)
    if (result.trackName.length <= trackName.length + 10) {
      score += 10;
    }
    
    // Prefer non-explicit versions for trailer work
    if (!result.trackExplicitness || result.trackExplicitness === 'notExplicit') {
      score += 5;
    }
    
    return { ...result, score };
  });
  
  // Sort by score and return best match
  scoredResults.sort((a, b) => b.score - a.score);
  
  // Only return if score is reasonable (> 30)
  if (scoredResults[0].score > 30) {
    return scoredResults[0];
  }
  
  return null;
}

/**
 * Simple string similarity (Dice coefficient)
 */
function stringSimilarity(s1, s2) {
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;
  
  const bigrams1 = new Set();
  for (let i = 0; i < s1.length - 1; i++) {
    bigrams1.add(s1.substring(i, i + 2));
  }
  
  let matches = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    if (bigrams1.has(s2.substring(i, i + 2))) {
      matches++;
    }
  }
  
  return (2 * matches) / (s1.length - 1 + s2.length - 1);
}

/**
 * Enrich a cue with iTunes data
 * @param {Object} cue - Cue object to enrich
 * @returns {Promise<Object>} Enriched cue
 */
async function enrichCueFromiTunes(cue) {
  // Skip if already has artist info from production library
  if (cue.artist && cue.artist.includes('Production Music')) {
    return { success: false, reason: 'Production music - skipping iTunes', cue };
  }
  
  const match = await findBestMatch(cue.trackName, cue.artist);
  
  if (!match) {
    return { success: false, reason: 'No iTunes match found', cue };
  }
  
  // Create enriched cue
  const enrichedCue = { ...cue };
  
  // Only update fields that are empty or generic
  if (!enrichedCue.artist || enrichedCue.artist === 'Unknown') {
    enrichedCue.artist = match.artistName;
  }
  
  if (!enrichedCue.source || enrichedCue.source === 'Unknown') {
    enrichedCue.source = match.albumName;
  }
  
  if (!enrichedCue.trackNumber || enrichedCue.trackNumber === 'N/A') {
    enrichedCue.trackNumber = match.trackNumber ? String(match.trackNumber) : 'N/A';
  }
  
  // Store iTunes metadata for reference
  enrichedCue.itunesData = {
    trackId: match.trackId,
    artistId: match.artistId,
    genre: match.genre,
    artworkUrl: match.artworkUrl,
    matchScore: match.score
  };
  
  return { 
    success: true, 
    cue: enrichedCue,
    match: {
      trackName: match.trackName,
      artistName: match.artistName,
      albumName: match.albumName,
      score: match.score
    }
  };
}

/**
 * Check if a track might be found on iTunes
 * Production music libraries typically aren't on iTunes
 */
function isLikelyOniTunes(trackName, artistName = '') {
  // Production music libraries are NOT on iTunes
  const productionLibraries = [
    'BMG Production',
    'APM Music',
    'Extreme Music',
    'Universal Production',
    'AudioJungle',
    'Epidemic Sound',
    'Artlist',
    'BYND',
    'Beyond'
  ];
  
  for (const lib of productionLibraries) {
    if (artistName?.includes(lib) || trackName?.includes(lib)) {
      return false;
    }
  }
  
  // SFX/Sound effects typically aren't on iTunes
  if (trackName?.match(/\b(SFX|FX|Whoosh|Impact|Riser|Hit|Boom|Stinger)\b/i)) {
    return false;
  }
  
  return true;
}

module.exports = {
  searchTrack,
  findBestMatch,
  enrichCueFromiTunes,
  isLikelyOniTunes
};
