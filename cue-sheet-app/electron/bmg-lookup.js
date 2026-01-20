/**
 * BMG Production Music Lookup
 * Fetches track metadata from BMG's website
 * Website: https://bmgproductionmusic.com
 * 
 * Strategy:
 * 1. Try direct API endpoints (if they work)
 * 2. Fall back to HTML scraping of search results
 * 3. Fetch track detail page for full metadata
 */

// BMG website base URL
const BMG_BASE_URL = 'https://bmgproductionmusic.com';

// User agent to avoid bot detection
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Search for a track on BMG Production Music
 * @param {string} trackName - The name of the track to search for
 * @returns {Promise<Object>} - Track metadata if found
 */
async function searchBMGTrack(trackName) {
  const searchQuery = cleanTrackName(trackName);
  console.log('[BMG] Searching for:', searchQuery);
  
  try {
    // Strategy 1: Try to get track data directly
    const searchResult = await searchBMGWebpage(searchQuery);
    
    // If we got track data directly (from API or __NEXT_DATA__)
    if (searchResult.trackData) {
      console.log('[BMG] Got track data directly');
      return formatBMGResult(searchResult.trackData);
    }
    
    // If we got a track URL, fetch the details
    if (searchResult.trackUrl) {
      console.log('[BMG] Found track URL:', searchResult.trackUrl);
      const trackDetails = await fetchBMGTrackDetails(searchResult.trackUrl);
      if (trackDetails.success) {
        return trackDetails;
      }
    }
    
    // Strategy 2: Try with simpler search terms
    const simplifiedNames = [
      trackName.replace(/^BYND-/, ''), // Remove BYND- prefix
      trackName.replace(/^mx.*?_/, ''), // Remove mx prefix
      trackName.split(' ').slice(0, 3).join(' '), // First 3 words
      searchQuery.split(' ').slice(0, 2).join(' ') // First 2 words of cleaned name
    ].filter(n => n && n.length > 2 && n !== searchQuery);
    
    for (const simpleName of simplifiedNames) {
      console.log('[BMG] Trying simplified name:', simpleName);
      const simpleResult = await searchBMGWebpage(simpleName);
      
      if (simpleResult.trackData) {
        return formatBMGResult(simpleResult.trackData);
      }
      
      if (simpleResult.trackUrl) {
        const trackDetails = await fetchBMGTrackDetails(simpleResult.trackUrl);
        if (trackDetails.success) {
          return trackDetails;
        }
      }
    }
    
    console.log('[BMG] Track not found');
    return { success: false, message: 'Track not found on BMG' };
  } catch (error) {
    console.error('[BMG] Search error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Try BMG's internal search API directly
 */
async function searchBMGAPI(query) {
  // Try multiple potential API endpoints
  const apiEndpoints = [
    `${BMG_BASE_URL}/api/search?q=${encodeURIComponent(query)}&type=tracks&limit=10`,
    `${BMG_BASE_URL}/api/v1/search?q=${encodeURIComponent(query)}`,
    `${BMG_BASE_URL}/api/tracks/search?query=${encodeURIComponent(query)}`,
    `${BMG_BASE_URL}/en-us/api/search?q=${encodeURIComponent(query)}`
  ];
  
  for (const apiUrl of apiEndpoints) {
    console.log('[BMG] Trying API:', apiUrl);
    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.5',
          'Referer': `${BMG_BASE_URL}/en-us/search`
        }
      });
      
      console.log('[BMG] API response status:', response.status);
      
      if (response.ok) {
        const text = await response.text();
        console.log('[BMG] API response preview:', text.substring(0, 200));
        
        try {
          const data = JSON.parse(text);
          if (data.tracks || data.results || data.items || data.data) {
            console.log('[BMG] Found API data!');
            return { success: true, data };
          }
        } catch (e) {
          // Not JSON, continue
        }
      }
    } catch (error) {
      console.log('[BMG] API error:', error.message);
    }
  }
  
  return { success: false };
}

/**
 * Search BMG website and extract track URLs from results
 */
async function searchBMGWebpage(query) {
  // First, try the API directly
  const apiResult = await searchBMGAPI(query);
  if (apiResult.success) {
    const tracks = apiResult.data.tracks || apiResult.data.results || apiResult.data.items || [];
    if (tracks.length > 0) {
      return { trackData: tracks[0], fromAPI: true };
    }
  }
  
  // If API didn't work, try fetching the track page directly
  // Construct a slug from the query
  const slug = query.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  // Try direct track URL patterns
  const directUrls = [
    `${BMG_BASE_URL}/en-us/track/${slug}`,
    `${BMG_BASE_URL}/en-us/search?q=${encodeURIComponent(query)}`
  ];
  
  for (const url of directUrls) {
    console.log('[BMG] Trying direct URL:', url);
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        }
      });
      
      console.log('[BMG] Response status:', response.status);
      
      if (!response.ok) continue;
      
      const html = await response.text();
      console.log('[BMG] Page length:', html.length, 'chars');
      
      // Look for __NEXT_DATA__ with track info
      const jsonDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/i);
      if (jsonDataMatch) {
        try {
          const pageData = JSON.parse(jsonDataMatch[1]);
          console.log('[BMG] Found __NEXT_DATA__');
          
          // Log the structure to understand it
          const keys = Object.keys(pageData.props?.pageProps || {});
          console.log('[BMG] pageProps keys:', keys.join(', '));
          
          // Try to find track data
          const trackData = extractTrackFromNextData(pageData);
          if (trackData) {
            console.log('[BMG] Extracted track from __NEXT_DATA__:', JSON.stringify(trackData).substring(0, 300));
            return { trackData, fromNextData: true };
          }
          
          // Log more of the data structure for debugging
          const propsStr = JSON.stringify(pageData.props?.pageProps || {}).substring(0, 1000);
          console.log('[BMG] pageProps preview:', propsStr);
        } catch (e) {
          console.log('[BMG] Could not parse __NEXT_DATA__:', e.message);
        }
      }
      
      // Look for track links in the HTML
      const trackLinkPattern = /\/en-us\/track\/([^\/\s"']+)\/([a-f0-9]+)\/([a-f0-9]+)/gi;
      const matches = [...html.matchAll(trackLinkPattern)];
      
      if (matches.length > 0) {
        console.log('[BMG] Found', matches.length, 'track link(s)');
        const trackUrl = `${BMG_BASE_URL}${matches[0][0]}`;
        return { trackUrl, slug: matches[0][1] };
      }
      
      // Also look for Next.js data routes
      const buildIdMatch = html.match(/"buildId":"([^"]+)"/);
      if (buildIdMatch) {
        const buildId = buildIdMatch[1];
        console.log('[BMG] Found buildId:', buildId);
        
        // Try Next.js data route
        const dataUrl = `${BMG_BASE_URL}/_next/data/${buildId}/en-us/search.json?q=${encodeURIComponent(query)}`;
        console.log('[BMG] Trying Next.js data route:', dataUrl);
        
        try {
          const dataResponse = await fetch(dataUrl, {
            headers: {
              'User-Agent': USER_AGENT,
              'Accept': 'application/json'
            }
          });
          
          if (dataResponse.ok) {
            const nextData = await dataResponse.json();
            console.log('[BMG] Next.js data route worked!');
            const trackData = extractTrackFromNextData({ props: nextData });
            if (trackData) {
              return { trackData, fromNextData: true };
            }
          }
        } catch (e) {
          console.log('[BMG] Next.js data route failed:', e.message);
        }
      }
    } catch (error) {
      console.log('[BMG] Fetch error:', error.message);
    }
  }
  
  console.log('[BMG] No track data found');
  return { trackUrl: null };
}

/**
 * Search through Next.js page data for tracks
 */
function findTracksInNextData(data, depth = 0) {
  if (depth > 10) return null;
  
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object') {
        // Check if this looks like a track
        if (item.title && (item.composers || item.albumCode || item.trackNumber)) {
          return [item];
        }
        const result = findTracksInNextData(item, depth + 1);
        if (result) return result;
      }
    }
  } else if (data && typeof data === 'object') {
    // Check common keys that might contain tracks
    for (const key of ['tracks', 'results', 'items', 'data', 'pageProps', 'props']) {
      if (data[key]) {
        const result = findTracksInNextData(data[key], depth + 1);
        if (result) return result;
      }
    }
    // Check if this object itself is a track
    if (data.title && (data.composers || data.albumCode || data.trackNumber)) {
      return [data];
    }
  }
  
  return null;
}

/**
 * Fetch and parse BMG track detail page
 */
async function fetchBMGTrackDetails(trackUrl) {
  console.log('[BMG] Fetching track details:', trackUrl);
  
  try {
    const response = await fetch(trackUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    
    console.log('[BMG] Track page response status:', response.status);
    
    if (!response.ok) {
      return { success: false, message: 'Failed to fetch track page' };
    }
    
    const html = await response.text();
    console.log('[BMG] Track page length:', html.length, 'chars');
    
    // Try to extract data from __NEXT_DATA__ first (most reliable)
    const jsonDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/i);
    if (jsonDataMatch) {
      try {
        const pageData = JSON.parse(jsonDataMatch[1]);
        const trackData = extractTrackFromNextData(pageData);
        
        if (trackData) {
          console.log('[BMG] Extracted track data from __NEXT_DATA__:', JSON.stringify(trackData, null, 2).substring(0, 500));
          return formatBMGResult(trackData);
        }
      } catch (e) {
        console.log('[BMG] Could not parse track __NEXT_DATA__:', e.message);
      }
    }
    
    // Fallback: Parse HTML directly
    const htmlData = parseTrackPageHTML(html);
    if (htmlData) {
      console.log('[BMG] Extracted track data from HTML:', JSON.stringify(htmlData, null, 2));
      return formatBMGResult(htmlData);
    }
    
    return { success: false, message: 'Could not extract track data from page' };
  } catch (error) {
    console.error('[BMG] Track page fetch error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Extract track data from Next.js page data
 */
function extractTrackFromNextData(data) {
  // Navigate common Next.js data paths
  const paths = [
    ['props', 'pageProps', 'track'],
    ['props', 'pageProps', 'data', 'track'],
    ['props', 'pageProps', 'trackData'],
    ['props', 'pageProps', 'initialData', 'track'],
    ['props', 'pageProps']
  ];
  
  for (const path of paths) {
    let current = data;
    for (const key of path) {
      if (current && current[key]) {
        current = current[key];
      } else {
        current = null;
        break;
      }
    }
    
    if (current && (current.title || current.name || current.trackTitle)) {
      return current;
    }
  }
  
  // Deep search for track-like objects
  return findTrackObject(data);
}

/**
 * Deep search for a track object in data
 */
function findTrackObject(data, depth = 0) {
  if (depth > 15 || !data) return null;
  
  if (typeof data === 'object' && !Array.isArray(data)) {
    // Check if this looks like a track
    const hasTitle = data.title || data.name || data.trackTitle;
    const hasTrackInfo = data.composers || data.composer || data.albumCode || data.album || data.trackNumber;
    
    if (hasTitle && hasTrackInfo) {
      return data;
    }
    
    // Search nested objects
    for (const key of Object.keys(data)) {
      const result = findTrackObject(data[key], depth + 1);
      if (result) return result;
    }
  } else if (Array.isArray(data)) {
    for (const item of data) {
      const result = findTrackObject(item, depth + 1);
      if (result) return result;
    }
  }
  
  return null;
}

/**
 * Parse track data directly from HTML
 */
function parseTrackPageHTML(html) {
  const data = {};
  
  // Extract title - look for h1 or title patterns
  const titlePatterns = [
    /<h1[^>]*class="[^"]*track[^"]*"[^>]*>([^<]+)</i,
    /<h1[^>]*>([^<]+)</i,
    /<title>([^<|]+)/i,
    /class="[^"]*track-title[^"]*"[^>]*>([^<]+)</i
  ];
  
  for (const pattern of titlePatterns) {
    const match = html.match(pattern);
    if (match && match[1].trim()) {
      data.title = match[1].trim().replace(/\s*\|.*$/, '').trim();
      break;
    }
  }
  
  // Extract composer - look for "COMPOSER" label followed by content
  const composerPatterns = [
    /COMPOSER[^<]*<[^>]*>([^<]+(?:<[^>]*>[^<]*)*?)(?=<\/|ARTIST|ALBUM|LABEL)/is,
    /"composer"[^:]*:\s*"([^"]+)"/i,
    /Walter\s+Werzowa/i  // Known composer for Fire Thunder Hit
  ];
  
  for (const pattern of composerPatterns) {
    const match = html.match(pattern);
    if (match) {
      data.composer = (match[1] || match[0]).replace(/<[^>]+>/g, '').trim();
      break;
    }
  }
  
  // Extract album/source
  const albumPatterns = [
    /ALBUM[^<]*<[^>]*>([^<]+)/i,
    /"album"[^:]*:\s*"([^"]+)"/i,
    /Sound\s+Effects\s+Vol\.\s*\d+/i
  ];
  
  for (const pattern of albumPatterns) {
    const match = html.match(pattern);
    if (match) {
      data.album = (match[1] || match[0]).trim();
      break;
    }
  }
  
  // Extract album code
  const codePatterns = [
    /ALBUM\s*CODE[^<]*<[^>]*>([A-Z]+\d+)/i,
    /"albumCode"[^:]*:\s*"([^"]+)"/i,
    /\b(BYND\d+|IATS\d+)\b/i
  ];
  
  for (const pattern of codePatterns) {
    const match = html.match(pattern);
    if (match) {
      data.albumCode = (match[1] || match[0]).trim();
      break;
    }
  }
  
  // Extract label/publisher
  const labelPatterns = [
    /LABEL[^<]*<[^>]*>([^<]+)/i,
    /"label"[^:]*:\s*"([^"]+)"/i,
    /Music\s+Beyond/i
  ];
  
  for (const pattern of labelPatterns) {
    const match = html.match(pattern);
    if (match) {
      data.label = (match[1] || match[0]).trim();
      break;
    }
  }
  
  // Extract track number
  const trackNumPatterns = [
    /TRACK\s*NUMBER[^<]*<[^>]*>(\d+)/i,
    /"trackNumber"[^:]*:\s*"?(\d+)/i
  ];
  
  for (const pattern of trackNumPatterns) {
    const match = html.match(pattern);
    if (match) {
      data.trackNumber = match[1];
      break;
    }
  }
  
  // Only return if we found meaningful data
  if (data.title || data.composer || data.album) {
    return data;
  }
  
  return null;
}

/**
 * Clean track name for better search results
 */
function cleanTrackName(name) {
  return name
    // Remove file extensions
    .replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, '')
    // Remove common prefixes
    .replace(/^(mx|mxBeyond-|BMGPM_\w+_)/i, '')
    // Remove STEM suffixes
    .replace(/_STEM_.+$/i, '')
    .replace(/\s+STEM\s+.+$/i, '')
    // Replace underscores with spaces
    .replace(/_/g, ' ')
    // Remove catalog codes but keep the track name
    .replace(/^[A-Z]{2,}\d+\s*/i, '')
    // Clean up extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Format BMG data to our cue format
 */
function formatBMGResult(track) {
  // Extract composer
  let composerStr = '';
  if (track.composers && Array.isArray(track.composers)) {
    composerStr = track.composers.map(c => {
      const name = typeof c === 'string' ? c : (c.name || c.fullName || '');
      const pro = c.pro || c.society || '';
      return pro ? `${name} (${pro})(100%)` : name;
    }).filter(Boolean).join('; ');
  } else if (track.composer) {
    composerStr = track.composer;
  }
  
  // Extract publisher/label
  let publisherStr = '';
  if (track.publishers && Array.isArray(track.publishers)) {
    publisherStr = track.publishers.map(p => {
      const name = typeof p === 'string' ? p : (p.name || '');
      const pro = p.pro || p.society || '';
      return pro ? `${name} (${pro})(100%)` : name;
    }).filter(Boolean).join('; ');
  } else if (track.label) {
    publisherStr = track.label;
  } else if (track.publisher) {
    publisherStr = track.publisher;
  }
  
  // Build source/album string
  let sourceStr = '';
  if (track.album && track.albumCode) {
    sourceStr = `${track.album} (${track.albumCode})`;
  } else if (track.album) {
    sourceStr = track.album;
  } else if (track.albumCode) {
    sourceStr = track.albumCode;
  }
  
  const result = {
    success: true,
    data: {
      trackName: track.title || track.name || track.trackTitle || '',
      artist: track.artist || '', // Use actual artist if available, not library name
      label: 'BMG Production Music', // Library goes in label field
      source: sourceStr || '',
      trackNumber: track.trackNumber || 'N/A',
      composer: composerStr,
      publisher: publisherStr,
      masterContact: 'BMG Production Music\njourdan.stracuzzi-house@bmg.com',
      duration: formatDuration(track.duration || track.length),
      albumCode: track.albumCode || '',
      album: track.album || '',
      // Confidence
      composerConfidence: composerStr ? 0.95 : 0,
      publisherConfidence: publisherStr ? 0.95 : 0,
      dataSource: 'bmg_website'
    }
  };
  
  console.log('[BMG] Formatted result:', JSON.stringify(result.data, null, 2));
  return result;
}

/**
 * Format duration from seconds to min:sec
 */
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  const secs = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  const mins = Math.floor(secs / 60);
  const remainingSecs = Math.floor(secs % 60);
  return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
}

/**
 * Lookup track on BMG and enrich cue data
 */
async function enrichCueFromBMG(cue) {
  console.log('[BMG] Enriching cue:', cue.trackName || cue.originalName);
  
  const result = await searchBMGTrack(cue.trackName || cue.originalName);
  
  if (result.success && result.data) {
    return {
      success: true,
      cue: {
        ...cue,
        artist: result.data.artist || cue.artist,
        source: result.data.source || cue.source,
        composer: result.data.composer || cue.composer,
        publisher: result.data.publisher || cue.publisher,
        masterContact: result.data.masterContact || cue.masterContact,
        trackNumber: result.data.trackNumber || cue.trackNumber,
        composerConfidence: result.data.composerConfidence,
        publisherConfidence: result.data.publisherConfidence,
        composerSource: result.data.dataSource,
        publisherSource: result.data.dataSource,
        status: result.data.composer && result.data.publisher ? 'complete' : 'pending'
      }
    };
  }
  
  return { success: false, cue };
}

/**
 * Check if a track name looks like it might be from BMG
 */
function looksLikeBMGTrack(name) {
  const patterns = [
    /bmg/i,
    /bmgpm/i,
    /production music/i,
    /^mx/i,
    /mxBeyond/i,
    /_IATS/i,
    /IATS\d/i,
    /ka-pow/i,
    /bynd/i,
    /BYND\d/i,
    /beyond/i
  ];
  
  return patterns.some(p => p.test(name));
}

/**
 * Direct lookup by track name and catalog code (if known)
 */
async function lookupBMGDirect(trackName, catalogCode = null) {
  // Build search query
  let query = cleanTrackName(trackName);
  if (catalogCode) {
    query = `${query} ${catalogCode}`;
  }
  
  return searchBMGTrack(query);
}

module.exports = {
  searchBMGTrack,
  enrichCueFromBMG,
  looksLikeBMGTrack,
  cleanTrackName,
  lookupBMGDirect,
  fetchBMGTrackDetails
};
