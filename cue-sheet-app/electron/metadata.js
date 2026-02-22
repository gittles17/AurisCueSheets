/**
 * Audio Metadata Reader
 * Extracts metadata from audio files and enriches cue information
 */

const path = require('path');

// Read metadata from an audio file
async function readAudioMetadata(filePath) {
  try {
    const mm = await import('music-metadata');
    const metadata = await mm.parseFile(filePath);
    
    const separated = separateComposerPublisher(metadata.common.composer);
    const labelPublisher = formatPublisherField(metadata.common.label);
    // Merge: publisher from label tag, plus any publishers extracted from composer tag
    const allPublishers = [labelPublisher, separated.publishers].filter(Boolean).join(', ');

    return {
      success: true,
      data: {
        title: metadata.common.title || '',
        artist: metadata.common.artist || '',
        album: metadata.common.album || '',
        composer: separated.composers,
        publisher: allPublishers,
        trackNumber: metadata.common.track?.no?.toString() || '',
        year: metadata.common.year || '',
        genre: metadata.common.genre?.join(', ') || '',
        duration: metadata.format.duration || 0,
        sampleRate: metadata.format.sampleRate || 0,
        bitrate: metadata.format.bitrate || 0,
        codec: metadata.format.codec || '',
        copyright: metadata.common.copyright || '',
        comment: metadata.common.comment?.join(' ') || '',
        raw: metadata.native
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

const PUBLISHER_KEYWORDS = ['music', 'publishing', 'entertainment', 'records', 'rights', 'management', 'editions', 'songs', 'media'];

function isPublisherName(name) {
  if (!name) return false;
  const lower = name.toLowerCase();
  return PUBLISHER_KEYWORDS.some(kw => lower.includes(kw));
}

// Separate composer entries from publisher entries within the composer tag,
// returning both so they can be routed to the correct fields.
function separateComposerPublisher(composers) {
  if (!composers || !Array.isArray(composers) || composers.length === 0) {
    return { composers: '', publishers: '' };
  }

  const composerEntries = [];
  const publisherEntries = [];

  for (const entry of composers) {
    if (!entry || !entry.trim()) continue;

    // Check if this entry looks like a publisher (contains publisher keywords)
    const baseName = entry.replace(/\s*\([^)]*\)/g, '').trim();
    if (isPublisherName(baseName)) {
      publisherEntries.push(entry);
    } else {
      composerEntries.push(entry);
    }
  }

  return {
    composers: composerEntries.join(', '),
    publishers: publisherEntries.join(', ')
  };
}

// Format composer field (backward-compatible wrapper)
function formatComposerField(composers) {
  return separateComposerPublisher(composers).composers;
}

// Format publisher field
function formatPublisherField(labels) {
  if (!labels || !Array.isArray(labels) || labels.length === 0) {
    return '';
  }
  
  return labels.join(', ');
}

// Try to identify the music library from metadata
function identifyLibrary(metadata) {
  const searchFields = [
    metadata.album,
    metadata.artist,
    metadata.publisher,
    metadata.copyright,
    metadata.comment
  ].filter(Boolean).join(' ').toLowerCase();
  
  // Known library patterns
  const libraryPatterns = [
    { pattern: /bmg|production music/i, library: 'BMG Production Music' },
    { pattern: /apm/i, library: 'APM Music' },
    { pattern: /extreme music/i, library: 'Extreme Music' },
    { pattern: /universal production/i, library: 'Universal Production Music' },
    { pattern: /musicbed/i, library: 'Musicbed' },
    { pattern: /artlist/i, library: 'Artlist' },
    { pattern: /epidemic/i, library: 'Epidemic Sound' },
    { pattern: /audiojungle/i, library: 'AudioJungle' },
  ];
  
  for (const { pattern, library } of libraryPatterns) {
    if (pattern.test(searchFields)) {
      return library;
    }
  }
  
  return null;
}

// Enrich a cue with metadata from the audio file
async function enrichCueWithMetadata(cue, audioBasePath) {
  if (!cue.originalName) return cue;
  
  // Try to find the audio file
  const possiblePaths = [
    path.join(audioBasePath, cue.originalName),
    // Add more potential paths as needed
  ];
  
  for (const filePath of possiblePaths) {
    const result = await readAudioMetadata(filePath);
    
    if (result.success && result.data) {
      const library = identifyLibrary(result.data);
      
      return {
        ...cue,
        artist: result.data.artist || cue.artist,
        source: result.data.album || cue.source,
        composer: result.data.composer || cue.composer,
        publisher: result.data.publisher || cue.publisher,
        trackNumber: result.data.trackNumber || cue.trackNumber,
        identifiedLibrary: library,
        status: result.data.composer ? 'complete' : 'pending'
      };
    }
  }
  
  return cue;
}

// Parse track name to extract potential library info
function parseTrackName(trackName) {
  // Common naming patterns in production music
  // e.g., "BMGPM_IATS021_Punch_Drunk" or "KA_POW_001_TrackName"
  
  const patterns = [
    // BMG pattern: BMGPM_CATALOG_TrackName
    { 
      regex: /^BMGPM[_-](\w+)[_-](.+)$/i,
      library: 'BMG Production Music',
      extractCatalog: (match) => match[1],
      extractTitle: (match) => match[2].replace(/_/g, ' ')
    },
    // Generic catalog pattern: CATALOG_NUMBER_TrackName
    {
      regex: /^([A-Z]+)[_-](\d+)[_-](.+)$/i,
      library: null,
      extractCatalog: (match) => `${match[1]} ${match[2]}`,
      extractTitle: (match) => match[3].replace(/_/g, ' ')
    }
  ];
  
  for (const { regex, library, extractCatalog, extractTitle } of patterns) {
    const match = trackName.match(regex);
    if (match) {
      return {
        library,
        catalog: extractCatalog(match),
        title: extractTitle(match)
      };
    }
  }
  
  return {
    library: null,
    catalog: null,
    title: trackName
  };
}

module.exports = {
  readAudioMetadata,
  enrichCueWithMetadata,
  identifyLibrary,
  parseTrackName,
  separateComposerPublisher
};
