/**
 * Music Library Site Definitions
 * 
 * Defines all supported music library sites with:
 * - Search URL patterns
 * - Aliases for site detection (from artist/library fields)
 * - Catalog code prefixes
 * - Master contact info
 */

const LOOKUP_SITES = {
  bmg: {
    id: 'bmg',
    name: 'BMG Production Music',
    searchUrl: 'https://bmgproductionmusic.com/en-us/search?q=',
    trackUrlPattern: 'https://bmgproductionmusic.com/en-us/track/',
    // Keywords in artist/library field that indicate this site
    aliases: [
      'bmg', 
      'bmg production', 
      'bmg production music',
      'bmgpm',
      'music beyond',
      'beyond music'
    ],
    // Catalog code prefixes that indicate this site
    catalogPrefixes: [
      'IATS',   // Impact & Tension Series
      'ANW',    // ANW Music
      'BED',    // Beds & Beats
      'KOS',    // Kosinus
      'BYND',   // Beyond
      'BMGPM',  // BMG Production Music
      'DIG',    // Digital
      'EMO',    // Emotional
      'GYM',    // Gymnastic
      'RTV',    // Reality TV
      'SON',    // Sonoton
      'UBM'     // UBM
    ],
    masterContact: 'BMG Production Music\njourdan.stracuzzi-house@bmg.com',
    enabled: true
  },
  
  apm: {
    id: 'apm',
    name: 'APM Music',
    searchUrl: 'https://www.apmmusic.com/search?q=',
    trackUrlPattern: 'https://www.apmmusic.com/albums/',
    aliases: [
      'apm',
      'apm music',
      'killer tracks',
      'killer track',
      'firstcom',
      'first com'
    ],
    catalogPrefixes: [
      'APM',
      'KT',     // Killer Tracks
      'FC',     // FirstCom
      'SON',    // Sonoton (shared with BMG)
      'DEN',    // Dennis Music
      'TWO',    // Two Steps From Hell
      'EVO'     // Evolution
    ],
    masterContact: 'APM Music\nlicensing@apmmusic.com',
    enabled: true
  },
  
  extreme: {
    id: 'extreme',
    name: 'Extreme Music',
    searchUrl: 'https://www.extrememusic.com/search?term=',
    trackUrlPattern: 'https://www.extrememusic.com/albums/',
    aliases: [
      'extreme',
      'extreme music',
      'x series',
      'xseries'
    ],
    catalogPrefixes: [
      'EXT',    // Extreme
      'XTM',    // Extreme Music
      'XCD',    // X Series CD
      'SOA',    // Score One Audio
      'EAX',    // Extreme Axe
      'XSE'     // X Series
    ],
    masterContact: 'Extreme Music\nlicensing@extrememusic.com',
    enabled: true
  },
  
  musicbed: {
    id: 'musicbed',
    name: 'Musicbed',
    searchUrl: 'https://www.musicbed.com/search?query=',
    trackUrlPattern: 'https://www.musicbed.com/songs/',
    aliases: [
      'musicbed',
      'music bed'
    ],
    catalogPrefixes: [
      'MB',     // Musicbed
      'MBD'     // Musicbed
    ],
    masterContact: 'Musicbed\nlicensing@musicbed.com',
    enabled: true
  },
  
  artlist: {
    id: 'artlist',
    name: 'Artlist',
    searchUrl: 'https://artlist.io/search?term=',
    trackUrlPattern: 'https://artlist.io/song/',
    aliases: [
      'artlist',
      'art list'
    ],
    catalogPrefixes: [
      'ART',    // Artlist
      'AL'      // Artlist
    ],
    masterContact: 'Artlist\nsupport@artlist.io',
    enabled: true
  },
  
  epidemic: {
    id: 'epidemic',
    name: 'Epidemic Sound',
    searchUrl: 'https://www.epidemicsound.com/search/?term=',
    trackUrlPattern: 'https://www.epidemicsound.com/track/',
    aliases: [
      'epidemic',
      'epidemic sound'
    ],
    catalogPrefixes: [
      'ES',     // Epidemic Sound
      'EPS'     // Epidemic Sound
    ],
    masterContact: 'Epidemic Sound\nlicensing@epidemicsound.com',
    enabled: true
  },
  
  soundstripe: {
    id: 'soundstripe',
    name: 'Soundstripe',
    searchUrl: 'https://www.soundstripe.com/search?q=',
    trackUrlPattern: 'https://www.soundstripe.com/songs/',
    aliases: [
      'soundstripe',
      'sound stripe'
    ],
    catalogPrefixes: [
      'SS',     // Soundstripe
      'SST'     // Soundstripe
    ],
    masterContact: 'Soundstripe\nsupport@soundstripe.com',
    enabled: true
  },
  
  universal: {
    id: 'universal',
    name: 'Universal Production Music',
    searchUrl: 'https://www.universalproductionmusic.com/en-us/search?q=',
    trackUrlPattern: 'https://www.universalproductionmusic.com/en-us/track/',
    aliases: [
      'universal',
      'universal production',
      'universal production music',
      'upm',
      'uppm'
    ],
    catalogPrefixes: [
      'UPM',    // Universal Production Music
      'UPPM',   // Universal Publishing Production Music
      'USM'     // Universal Special Markets
    ],
    masterContact: 'Universal Production Music\nlicensing@umusic.com',
    enabled: true
  },
  
  // PRO Databases (for composer/publisher lookup)
  bmi: {
    id: 'bmi',
    name: 'BMI Repertoire',
    searchUrl: 'https://repertoire.bmi.com/Search/Search?searchType=Title&searchTerm=',
    trackUrlPattern: 'https://repertoire.bmi.com/DetailView/',
    aliases: ['bmi'],
    catalogPrefixes: [],
    masterContact: null,
    enabled: true,
    isPRO: true
  },
  
  ascap: {
    id: 'ascap',
    name: 'ASCAP ACE',
    searchUrl: 'https://www.ascap.com/repertory#/ace/search/title/',
    trackUrlPattern: 'https://www.ascap.com/repertory#/ace/work/',
    aliases: ['ascap'],
    catalogPrefixes: [],
    masterContact: null,
    enabled: true,
    isPRO: true
  },
  
  sesac: {
    id: 'sesac',
    name: 'SESAC',
    searchUrl: 'https://www.sesac.com/repertory/search?query=',
    trackUrlPattern: 'https://www.sesac.com/repertory/',
    aliases: ['sesac'],
    catalogPrefixes: [],
    masterContact: null,
    enabled: true,
    isPRO: true
  }
};

/**
 * Confidence levels for lookup results
 */
const CONFIDENCE_LEVELS = {
  HIGH: {
    id: 'high',
    label: 'High',
    minScore: 0.85,
    icon: 'checkCircle',   // Green checkmark circle
    color: '#22c55e',      // green-500
    autoCheck: true,
    description: 'Catalog code match + duration verified'
  },
  MEDIUM: {
    id: 'medium', 
    label: 'Medium',
    minScore: 0.6,
    icon: 'circle',        // Yellow filled circle
    color: '#eab308',      // yellow-500
    autoCheck: true,
    description: 'Name match + duration verified'
  },
  LOW: {
    id: 'low',
    label: 'Low',
    minScore: 0.3,
    icon: 'warning',       // Orange warning triangle
    color: '#f97316',      // orange-500
    autoCheck: false,
    description: 'Name match only, needs review'
  },
  MANUAL: {
    id: 'manual',
    label: 'Manual',
    minScore: 0,
    icon: 'question',      // Gray question mark
    color: '#6b7280',      // gray-500
    autoCheck: false,
    description: 'Could not determine site, manual lookup required'
  }
};

/**
 * Detect which site a track belongs to based on existing metadata
 * @param {Object} trackData - Track data with artist, library, catalogCode fields
 * @returns {Object} - { site: siteConfig | null, confidence: number, reason: string }
 */
function detectSiteFromMetadata(trackData) {
  const { artist = '', library = '', catalogCode = '', source = '' } = trackData;
  
  // Combine all searchable text
  const searchText = `${artist || ''} ${library || ''} ${source || ''}`.toLowerCase();
  const code = (catalogCode || '').toUpperCase();
  
  // First, try to match by catalog code prefix (most reliable)
  if (code && code.length >= 2) {
    for (const [siteId, site] of Object.entries(LOOKUP_SITES)) {
      if (!site.enabled) continue;
      
      for (const prefix of site.catalogPrefixes) {
        if (code.startsWith(prefix)) {
          return {
            site,
            confidence: 0.95,
            reason: `Catalog code "${code}" matches ${site.name} prefix "${prefix}"`
          };
        }
      }
    }
  }
  
  // Second, try to match by artist/library aliases
  for (const [siteId, site] of Object.entries(LOOKUP_SITES)) {
    if (!site.enabled) continue;
    
    for (const alias of site.aliases) {
      if (searchText.includes(alias.toLowerCase())) {
        return {
          site,
          confidence: 0.85,
          reason: `Artist/library field contains "${alias}" indicating ${site.name}`
        };
      }
    }
  }
  
  // No match found
  return {
    site: null,
    confidence: 0,
    reason: 'Could not determine music library from available metadata'
  };
}

/**
 * Calculate confidence score for a lookup result
 * @param {Object} params - { catalogMatch: boolean, durationMatch: boolean, nameMatch: boolean }
 * @returns {Object} - { score: number, level: CONFIDENCE_LEVEL, factors: string[] }
 */
function calculateConfidence({ catalogMatch = false, durationMatch = false, nameMatch = false, durationDiff = null }) {
  let score = 0;
  const factors = [];
  
  // Catalog code match is strongest indicator
  if (catalogMatch) {
    score += 0.5;
    factors.push('Catalog code matches');
  }
  
  // Duration match within 2 seconds adds confidence
  if (durationMatch) {
    score += 0.35;
    factors.push('Duration matches');
  } else if (durationDiff !== null) {
    // Duration was checked but doesn't match
    score -= 0.2;
    factors.push(`Duration mismatch (${durationDiff}s difference)`);
  }
  
  // Name match adds some confidence
  if (nameMatch) {
    score += 0.25;
    factors.push('Track name matches');
  }
  
  // Clamp score between 0 and 1
  score = Math.max(0, Math.min(1, score));
  
  // Determine confidence level
  let level;
  if (score >= CONFIDENCE_LEVELS.HIGH.minScore) {
    level = CONFIDENCE_LEVELS.HIGH;
  } else if (score >= CONFIDENCE_LEVELS.MEDIUM.minScore) {
    level = CONFIDENCE_LEVELS.MEDIUM;
  } else if (score >= CONFIDENCE_LEVELS.LOW.minScore) {
    level = CONFIDENCE_LEVELS.LOW;
  } else {
    level = CONFIDENCE_LEVELS.MANUAL;
  }
  
  return { score, level, factors };
}

/**
 * Parse duration string to seconds
 * @param {string} duration - Duration in format "M:SS" or "MM:SS" or seconds
 * @returns {number} - Duration in seconds
 */
function parseDuration(duration) {
  if (!duration) return 0;
  
  // Already a number
  if (typeof duration === 'number') return duration;
  
  // Parse M:SS or MM:SS format
  const parts = duration.toString().split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    return mins * 60 + secs;
  }
  
  // Try parsing as seconds
  return parseFloat(duration) || 0;
}

/**
 * Check if two durations match within tolerance
 * @param {string|number} duration1 
 * @param {string|number} duration2 
 * @param {number} toleranceSeconds - Default 2 seconds
 * @returns {Object} - { matches: boolean, diff: number }
 */
function compareDurations(duration1, duration2, toleranceSeconds = 2) {
  const sec1 = parseDuration(duration1);
  const sec2 = parseDuration(duration2);
  
  if (sec1 === 0 || sec2 === 0) {
    return { matches: false, diff: null };
  }
  
  const diff = Math.abs(sec1 - sec2);
  return {
    matches: diff <= toleranceSeconds,
    diff: Math.round(diff)
  };
}

/**
 * Get all enabled sites
 * @returns {Object[]} - Array of enabled site configurations
 */
function getEnabledSites() {
  return Object.values(LOOKUP_SITES).filter(site => site.enabled);
}

/**
 * Get site by ID
 * @param {string} siteId 
 * @returns {Object|null}
 */
function getSiteById(siteId) {
  return LOOKUP_SITES[siteId] || null;
}

/**
 * Build search URL for a site
 * @param {string} siteId 
 * @param {string} query - Search query (track name or catalog code)
 * @returns {string|null}
 */
function buildSearchUrl(siteId, query) {
  const site = LOOKUP_SITES[siteId];
  if (!site) return null;
  return site.searchUrl + encodeURIComponent(query);
}

module.exports = {
  LOOKUP_SITES,
  CONFIDENCE_LEVELS,
  detectSiteFromMetadata,
  calculateConfidence,
  parseDuration,
  compareDurations,
  getEnabledSites,
  getSiteById,
  buildSearchUrl
};
