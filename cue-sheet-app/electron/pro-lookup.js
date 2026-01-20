/**
 * PRO (Performing Rights Organization) Lookup Module
 * 
 * Searches BMI Repertoire and ASCAP ACE for composer/publisher data.
 * Uses web scraping since these don't have public APIs.
 */

const BMI_SEARCH_URL = 'https://repertoire.bmi.com/Search/Search';
const ASCAP_SEARCH_URL = 'https://www.ascap.com/repertory';

/**
 * Search BMI Repertoire for a track
 * @param {string} trackName - Track title to search
 * @param {string} writerName - Optional writer/composer name
 * @returns {Promise<Object|null>} BMI data or null
 */
async function searchBMI(trackName, writerName = '') {
  try {
    console.log(`[BMI] Searching for "${trackName}"...`);
    
    // BMI uses a POST request with form data
    const searchParams = new URLSearchParams();
    searchParams.append('Main_Search_Text', trackName);
    searchParams.append('Search_Type', 'all');
    searchParams.append('View_Type', 'all');
    searchParams.append('Page_Num', '1');
    searchParams.append('Page_Size', '10');
    
    const response = await fetch(BMI_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      body: searchParams.toString()
    });

    console.log(`[BMI] Response status: ${response.status}`);
    
    if (!response.ok) {
      console.error('[BMI] Search failed:', response.status);
      return null;
    }

    const html = await response.text();
    console.log(`[BMI] Response length: ${html.length} chars`);
    
    const result = parseBMIResults(html, trackName);
    console.log(`[BMI] Parse result:`, result ? `${result.writers?.length || 0} writers found` : 'no match');
    return result;
  } catch (error) {
    console.error('[BMI] Search error:', error.message);
    return null;
  }
}

/**
 * Parse BMI search results HTML
 */
function parseBMIResults(html, trackName) {
  // BMI returns JSON data in their new API format
  // Try to find JSON data in the response
  
  // Look for various patterns BMI might use
  const writers = [];
  const publishers = [];
  
  // Pattern 1: Look for writer names in table cells
  const writerPatterns = [
    /<td[^>]*class="[^"]*writer[^"]*"[^>]*>([^<]+)<\/td>/gi,
    /<span[^>]*class="[^"]*writer[^"]*"[^>]*>([^<]+)<\/span>/gi,
    /class="writer-name"[^>]*>([^<]+)</gi,
    /"writerName"\s*:\s*"([^"]+)"/gi,
    /Writer:\s*<[^>]+>([^<]+)</gi
  ];
  
  for (const pattern of writerPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const name = match[1].trim();
      if (name && name.length > 2 && !writers.includes(name)) {
        writers.push(name);
      }
    }
  }
  
  // Pattern 2: Look for publisher names
  const publisherPatterns = [
    /<td[^>]*class="[^"]*publisher[^"]*"[^>]*>([^<]+)<\/td>/gi,
    /<span[^>]*class="[^"]*publisher[^"]*"[^>]*>([^<]+)<\/span>/gi,
    /class="publisher-name"[^>]*>([^<]+)</gi,
    /"publisherName"\s*:\s*"([^"]+)"/gi,
    /Publisher:\s*<[^>]+>([^<]+)</gi
  ];
  
  for (const pattern of publisherPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const name = match[1].trim();
      if (name && name.length > 2 && !publishers.includes(name)) {
        publishers.push(name);
      }
    }
  }
  
  // Log what we found for debugging
  if (writers.length > 0 || publishers.length > 0) {
    console.log(`[BMI Parse] Found ${writers.length} writers, ${publishers.length} publishers`);
    return {
      source: 'BMI',
      writers: writers,
      publishers: publishers,
      raw: { writerCount: writers.length, publisherCount: publishers.length }
    };
  }
  
  // If no matches, log a sample of the HTML for debugging
  console.log(`[BMI Parse] No matches found. HTML sample:`, html.substring(0, 500));
  
  return null;
}

/**
 * Search ASCAP ACE for a track
 * @param {string} trackName - Track title to search
 * @param {string} writerName - Optional writer/composer name
 * @returns {Promise<Object|null>} ASCAP data or null
 */
async function searchASCAP(trackName, writerName = '') {
  try {
    console.log(`[ASCAP] Searching for "${trackName}"...`);
    
    const response = await fetch(`https://www.ascap.com/api/wservice/MobileWeb/service/ace/api/v2.0/search/title?searchText=${encodeURIComponent(trackName)}&page=0&pageSize=10`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    console.log(`[ASCAP] Response status: ${response.status}`);
    
    if (!response.ok) {
      console.log('[ASCAP] API returned non-OK status');
      return null;
    }

    const data = await response.json();
    console.log(`[ASCAP] Got ${data?.result?.length || 0} results`);
    
    const result = parseASCAPResults(data, trackName);
    console.log(`[ASCAP] Parse result:`, result ? `${result.writers?.length || 0} writers found` : 'no match');
    return result;
  } catch (error) {
    console.error('[ASCAP] Search error:', error.message);
    return null;
  }
}

/**
 * Parse ASCAP search results
 */
function parseASCAPResults(data, trackName) {
  if (!data || !data.result || !data.result.length) {
    return null;
  }
  
  // Find best match
  const match = data.result.find(r => 
    r.title?.toLowerCase() === trackName.toLowerCase()
  ) || data.result[0];
  
  if (!match) return null;
  
  return {
    source: 'ASCAP',
    title: match.title,
    writers: match.writers || [],
    publishers: match.publishers || [],
    workId: match.workId
  };
}

/**
 * Format composer/publisher for cue sheet
 * @param {string} name - Person/company name
 * @param {string} pro - PRO affiliation (ASCAP, BMI, etc.)
 * @param {number} share - Ownership percentage
 * @returns {string} Formatted string
 */
function formatPROEntry(name, pro = '', share = 100) {
  if (!name) return '';
  
  let formatted = name;
  if (pro) {
    formatted += ` (${pro})`;
  }
  if (share && share !== 100) {
    formatted += `(${share}%)`;
  } else if (share === 100) {
    formatted += '(100%)';
  }
  
  return formatted;
}

/**
 * Search both BMI and ASCAP for a track
 * @param {string} trackName - Track title
 * @param {string} artistName - Artist/writer name
 * @returns {Promise<Object>} Combined PRO data
 */
async function searchAllPROs(trackName, artistName = '') {
  const [bmiResult, ascapResult] = await Promise.all([
    searchBMI(trackName, artistName),
    searchASCAP(trackName, artistName)
  ]);
  
  return {
    bmi: bmiResult,
    ascap: ascapResult,
    hasData: !!(bmiResult || ascapResult)
  };
}

/**
 * Format PRO data for cue sheet fields
 */
function formatPRODataForCue(proData) {
  if (!proData || !proData.hasData) {
    return { composer: '', publisher: '' };
  }
  
  let composers = [];
  let publishers = [];
  
  // Prefer ASCAP data as it's usually more structured
  if (proData.ascap) {
    if (proData.ascap.writers) {
      composers = proData.ascap.writers.map(w => 
        formatPROEntry(w.name || w, 'ASCAP', w.share)
      );
    }
    if (proData.ascap.publishers) {
      publishers = proData.ascap.publishers.map(p => 
        formatPROEntry(p.name || p, 'ASCAP', p.share)
      );
    }
  }
  
  // Add BMI data if available
  if (proData.bmi) {
    if (proData.bmi.writers) {
      const bmiComposers = proData.bmi.writers.map(w => 
        formatPROEntry(w, 'BMI')
      );
      composers = [...composers, ...bmiComposers];
    }
    if (proData.bmi.publishers) {
      const bmiPublishers = proData.bmi.publishers.map(p => 
        formatPROEntry(p, 'BMI')
      );
      publishers = [...publishers, ...bmiPublishers];
    }
  }
  
  return {
    composer: composers.join('; '),
    publisher: publishers.join('; ')
  };
}

module.exports = {
  searchBMI,
  searchASCAP,
  searchAllPROs,
  formatPROEntry,
  formatPRODataForCue
};
