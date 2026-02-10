/**
 * Import Pipeline Module
 * 
 * Modular, testable functions for the prproj import process.
 * Each step can be run independently and returns both results and summaries.
 * 
 * Usage in notebook:
 *   const pipeline = require('./import-pipeline');
 *   const step1 = await pipeline.parseProjectXML('/path/to/project.prproj');
 *   console.log(step1.summary);
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sax = require('sax');
const { XMLParser } = require('fast-xml-parser');

// Premiere Pro ticks conversion (254016000000 ticks per second)
const TICKS_PER_SECOND = 254016000000;

// Audio file extensions
const AUDIO_EXTENSIONS = ['.wav', '.aif', '.aiff', '.mp3', '.m4a', '.flac'];

// SFX detection patterns
const SFX_PATTERNS = [
  /\b(sfx|fx)\b/i,
  /\b(hit|impact|whoosh|riser|drop|swell|stinger|sting|boom|crash)\b/i,
  /\b(transition|swoosh|swipe|glitch|noise|drone)\b/i,
  /_(fx|sfx|hit|sting|whoosh|impact)$/i,
  /^(fx|sfx)_/i,
  /\b(trailer\s*fx|cinematic\s*hit)\b/i
];

// Non-music audio patterns (camera audio, interviews, production audio, ADR, temp)
const NON_MUSIC_PATTERNS = [
  /\bCAM\s*\d/i,                    // CAM 1, CAM 6, etc.
  /\bRes\.\s*\d+/i,                 // Res. 1080, etc.
  /\d{2}\.\d{2}\.\d{4}/,            // Date patterns like 01.09.2026
  /\bAWM\b/i,                       // AWM (audio work mix?)
  /\bPodcast\b/i,                   // Podcast recordings
  /\bInterview\b/i,                 // Interviews
  /\bVO\b[-_\s]/i,                  // Voiceover (but not in middle of words)
  /\bDialogue\b/i,                  // Dialogue
  /\bNarration\b/i,                 // Narration
  /\bRoom\s*Tone\b/i,               // Room tone
  /\bAmbience\b/i,                  // Ambience recordings (not music)
  /\bLocation\s*Audio\b/i,          // Location audio
  /\bProduction\s*Audio\b/i,        // Production audio
  /\bADR[\s_]/i,                    // ADR (automated dialogue replacement)
  /\bTemp[\s_]*ADR\b/i,             // Temp ADR
  /\bAI[\s_]*ADR\b/i,               // AI ADR
  /\bTALENT[\s_]*VO\b/i,            // Talent voiceover
  // Note: LVTD ClrMx is NOT filtered - it's a suffix on music library tracks
];

// BMG Catalog code to album name mapping
const BMG_CATALOG_MAP = {
  'IATS021': 'Ka-Pow',
  'IATS': 'Ka-Pow',
  'BYND': 'FX _ Trailer FX I (BYND001)',
  'BYND001': 'FX _ Trailer FX I (BYND001)',
};

// ============================================================================
// STEP 1: Parse Project XML - Extract raw clips from .prproj file
// ============================================================================
// Normalize file paths that may come from network drives or URL-encoded sources
function normalizeFilePath(inputPath) {
  let normalized = inputPath;
  
  // Convert file:// URLs to local paths
  if (normalized.startsWith('file://')) {
    try {
      normalized = new URL(normalized).pathname;
    } catch (e) {
      normalized = normalized.replace('file://', '');
    }
  }
  
  // Convert smb:// URLs to /Volumes/ paths
  // smb://server/share/path -> /Volumes/share/path
  if (normalized.startsWith('smb://')) {
    try {
      const url = new URL(normalized);
      const sharePath = url.pathname; // e.g. /share/path/to/file
      normalized = '/Volumes' + sharePath;
      console.log('[ImportPipeline] Converted SMB URL to:', normalized);
    } catch (e) {
      console.warn('[ImportPipeline] Failed to parse SMB URL:', normalized);
    }
  }
  
  // Decode URL-encoded characters (%20 -> space, etc.)
  try {
    normalized = decodeURIComponent(normalized);
  } catch (e) {
    // Already decoded or invalid encoding, leave as-is
  }
  
  return normalized;
}

// Resolve a file path: normalize, search common locations
function resolveFilePath(filePath) {
  let resolvedPath = normalizeFilePath(filePath);
  console.log('[ImportPipeline] Normalized path:', resolvedPath);
  
  if (!path.isAbsolute(resolvedPath) || !fs.existsSync(resolvedPath)) {
    const fileName = path.basename(resolvedPath);
    console.log('[ImportPipeline] File not found directly, searching common locations for:', fileName);
    const home = process.env.HOME || '/Users/' + process.env.USER;
    const possiblePaths = [
      resolvedPath,
      path.join(home, 'Desktop', fileName),
      path.join(home, 'Downloads', fileName),
      path.join(home, 'Documents', fileName),
      path.join(home, 'Desktop/AurisCueSheets', fileName),
    ];
    
    for (const tryPath of possiblePaths) {
      console.log('[ImportPipeline] Trying:', tryPath);
      if (fs.existsSync(tryPath)) {
        resolvedPath = tryPath;
        console.log('[ImportPipeline] Found file at:', resolvedPath);
        return resolvedPath;
      }
    }
    
    console.log('[ImportPipeline] File not found in common locations. Needs user to locate it.');
  }
  
  return resolvedPath;
}

// Stream-parse a .prproj file using SAX (handles files of any size)
async function parseProjectXML(filePath) {
  const startTime = Date.now();
  console.log('[ImportPipeline] parseProjectXML called with:', filePath);
  
  const resolvedPath = resolveFilePath(filePath);
  
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File not found: ${filePath} (resolved to: ${resolvedPath}). If the file is on a network drive, try using File > Open instead of drag-and-drop, or copy the file locally first.`);
  }
  
  return new Promise((resolve, reject) => {
    // Data structures built during streaming parse
    const pathsMap = new Map();
    const subClipToClip = new Map();
    const clipToName = new Map();
    const clipDurations = new Map();
    const allAudioFiles = new Set();
    
    // SAX parser state - strict mode to preserve tag name casing
    const saxParser = sax.createStream(true, { trim: true });
    const tagStack = [];
    let currentText = '';
    
    // Context trackers
    let currentSubClipId = null;
    let currentClipId = null;
    let inAudioClipTrackItem = false;
    let audioClipStart = null;
    let audioClipEnd = null;
    let audioClipSubClipRef = null;
    
    // Store raw audio clip placements for deferred resolution
    // (SubClip/Clip definitions may appear AFTER AudioClipTrackItems in the XML)
    const rawPlacements = [];
    
    // Helper to get attribute case-insensitively
    function getAttr(attrs, name) {
      return attrs[name] || attrs[name.toLowerCase()] || attrs[name.toUpperCase()] || null;
    }
    
    saxParser.on('opentag', (node) => {
      const tagName = node.name;
      tagStack.push(tagName);
      currentText = '';
      
      // Track SubClip elements
      if (tagName === 'SubClip') {
        currentSubClipId = getAttr(node.attributes, 'ObjectID');
      }
      
      // Clip inside SubClip -> build subClipToClip mapping
      if (tagName === 'Clip' && currentSubClipId) {
        const objRef = getAttr(node.attributes, 'ObjectRef');
        if (objRef) {
          subClipToClip.set(currentSubClipId, objRef);
        }
      }
      
      // Clip with ObjectID (top-level, not inside SubClip) -> track for name mapping
      if (tagName === 'Clip' && !currentSubClipId) {
        const objId = getAttr(node.attributes, 'ObjectID');
        if (objId) {
          currentClipId = objId;
        }
      }
      
      // Track AudioClipTrackItem
      if (tagName === 'AudioClipTrackItem') {
        inAudioClipTrackItem = true;
        audioClipStart = null;
        audioClipEnd = null;
        audioClipSubClipRef = null;
      }
      
      // SubClip ObjectRef inside AudioClipTrackItem
      if (tagName === 'SubClip' && inAudioClipTrackItem) {
        const objRef = getAttr(node.attributes, 'ObjectRef');
        if (objRef) {
          audioClipSubClipRef = objRef;
        }
      }
    });
    
    saxParser.on('text', (text) => {
      currentText += text;
    });
    
    saxParser.on('cdata', (text) => {
      currentText += text;
    });
    
    saxParser.on('closetag', (tagName) => {
      const text = currentText.trim();
      
      // ActualMediaFilePath -> pathsMap
      if (tagName === 'ActualMediaFilePath' && text) {
        const filename = path.basename(text);
        pathsMap.set(filename, text);
        const nameWithoutExt = filename.replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, '');
        pathsMap.set(nameWithoutExt, text);
      }
      
      // Name element -> clip name mapping and audio file collection
      if (tagName === 'Name' && text) {
        // Map Clip ObjectID -> Name
        if (currentClipId && !currentSubClipId && !inAudioClipTrackItem) {
          clipToName.set(currentClipId, text);
        }
        // Also map SubClip ObjectID -> Name (SubClips contain audio names too)
        if (currentSubClipId) {
          clipToName.set(currentSubClipId, text);
        }
        // Collect audio file names
        if (AUDIO_EXTENSIONS.some(ext => text.toLowerCase().endsWith(ext))) {
          allAudioFiles.add(text);
        }
      }
      
      // Start/End inside AudioClipTrackItem
      if (tagName === 'Start' && inAudioClipTrackItem && text) {
        // Only set if not already set (first Start is the timeline position)
        if (audioClipStart === null) {
          audioClipStart = parseInt(text);
        }
      }
      if (tagName === 'End' && inAudioClipTrackItem && text) {
        if (audioClipEnd === null) {
          audioClipEnd = parseInt(text);
        }
      }
      
      // Close SubClip
      if (tagName === 'SubClip') {
        if (!inAudioClipTrackItem) {
          currentSubClipId = null;
        }
      }
      
      // Close Clip
      if (tagName === 'Clip' && currentClipId && !currentSubClipId) {
        currentClipId = null;
      }
      
      // Close AudioClipTrackItem -> store placement for deferred resolution
      if (tagName === 'AudioClipTrackItem' && inAudioClipTrackItem) {
        if (audioClipStart !== null && audioClipEnd !== null && audioClipSubClipRef) {
          rawPlacements.push({
            start: audioClipStart,
            end: audioClipEnd,
            subClipRef: audioClipSubClipRef
          });
        }
        inAudioClipTrackItem = false;
        audioClipStart = null;
        audioClipEnd = null;
        audioClipSubClipRef = null;
      }
      
      currentText = '';
      tagStack.pop();
    });
    
    saxParser.on('error', (err) => {
      // SAX strict mode may error on malformed XML; continue parsing
      console.warn('[ImportPipeline] SAX parse warning:', err.message);
      saxParser._parser.error = null;
      saxParser._parser.resume();
    });
    
    saxParser.on('end', () => {
      // Resolve deferred placements now that all SubClip/Clip maps are built
      for (const placement of rawPlacements) {
        const durationTicks = placement.end - placement.start;
        const clipRef = subClipToClip.get(placement.subClipRef);
        let clipName = clipRef ? clipToName.get(clipRef) : null;
        if (!clipName) clipName = clipToName.get(placement.subClipRef);
        
        if (clipName) {
          const current = clipDurations.get(clipName) || { totalTicks: 0, instances: 0, maxTicks: 0 };
          current.totalTicks += durationTicks;
          current.instances++;
          current.maxTicks = Math.max(current.maxTicks, durationTicks);
          clipDurations.set(clipName, current);
        }
      }
      
      // Build final clips array
      const clips = [];
      for (const originalName of allAudioFiles) {
        if (originalName === 'Root Bin' || originalName === 'Audio' || originalName === 'Balance' || 
            originalName.startsWith('z') || originalName.includes('JUNK') || originalName.includes('OLD') ||
            originalName.startsWith('*')) continue;
        
        const durationData = clipDurations.get(originalName) || { totalTicks: 0, instances: 0, maxTicks: 0 };
        clips.push({
          id: `clip-${clips.length + 1}`,
          originalName,
          ticks: durationData.totalTicks,
          maxTicks: durationData.maxTicks,
          instances: durationData.instances
        });
      }
      
      const projectName = path.basename(filePath, '.prproj');
      const spotTitle = parseSpotTitleFromFilename(projectName);
      const elapsed = Date.now() - startTime;
      
      console.log(`[ImportPipeline] Streaming parse complete: ${clips.length} clips, ${pathsMap.size} paths in ${elapsed}ms`);
      
      resolve({
        result: clips,
        projectName,
        spotTitle,
        filePath,
        filePathsMap: pathsMap,
        xmlContent: null, // Not available in streaming mode (not needed)
        summary: {
          stepName: 'Parse Project XML (streaming)',
          inputFile: filePath,
          projectName,
          spotTitle,
          totalClipsFound: clips.length,
          mediaFilesFound: Math.floor(pathsMap.size / 2),
          elapsedMs: elapsed,
          samples: clips.slice(0, 3).map(c => c.originalName)
        }
      });
    });
    
    // Stream: file -> gunzip -> SAX parser
    const fileStream = fs.createReadStream(resolvedPath);
    const gunzip = zlib.createGunzip();
    
    fileStream.on('error', (err) => reject(new Error('Failed to read project file: ' + err.message)));
    gunzip.on('error', (err) => reject(new Error('Failed to decompress project file: ' + err.message)));
    
    fileStream.pipe(gunzip).pipe(saxParser);
  });
}

// Parse spot title from filename
function parseSpotTitleFromFilename(filename) {
  let name = filename.split(' - ')[0].trim();
  
  const suffixesToRemove = ['_ace_wm', '_ace', '_wm', '_final', '_mix'];
  for (const suffix of suffixesToRemove) {
    if (name.toLowerCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
    }
  }
  
  const tvMatch = name.match(/_tv\d+_(.+)$/i);
  if (tvMatch) return tvMatch[1];
  
  const edtMatch = name.match(/_edt_(.+)$/i);
  if (edtMatch) return edtMatch[1];
  
  const parts = name.split('_');
  if (parts.length >= 4) {
    let startIdx = 0;
    for (let i = 0; i < parts.length && i < 4; i++) {
      if (parts[i].match(/^tv\d+$/i)) {
        startIdx = i + 1;
        break;
      }
      if (parts[i].length <= 4) {
        startIdx = i + 1;
      }
    }
    if (startIdx > 0 && startIdx < parts.length) {
      return parts.slice(startIdx).join('_');
    }
  }
  
  return name;
}

// ============================================================================
// STEP 2: Categorize Cues - Classify as Main, SFX, Stem, or Free SFX
// Now includes confidence scoring for hybrid Opus integration
// ============================================================================
function categorizeCues(rawClips) {
  const startTime = Date.now();
  const categorized = [];
  
  let mainCount = 0;
  let sfxCount = 0;
  let stemCount = 0;
  let freeSfxCount = 0;
  let nonMusicCount = 0;
  let lowConfidenceCount = 0;
  
  for (const clip of rawClips) {
    const name = clip.originalName;
    
    // Check for Free SFX (CPSFX) - these get skipped entirely
    if (name.includes('_CPSFX') || name.includes('CPSFX')) {
      freeSfxCount++;
      continue; // Skip free SFX
    }
    
    // Check for non-music audio (camera, interview, production audio)
    const nonMusicCheck = isNonMusicAudio(name);
    if (nonMusicCheck.isNonMusic) {
      nonMusicCount++;
      continue; // Skip non-music
    }
    
    // Parse filename to get track info (includes confidence)
    const trackInfo = parseAudioFileName(name);
    if (!trackInfo) continue;
    
    // Determine cue type and aggregate confidence
    let cueType = 'main';
    let typeConfidence = trackInfo.confidence || 0.5;
    let classificationReason = trackInfo.matchedPattern || 'generic';
    
    // Check if it's a stem
    if (trackInfo.isStem) {
      cueType = 'stem';
      stemCount++;
      typeConfidence = Math.max(typeConfidence, 0.90); // Stems are usually well-detected
    }
    // Check if it's SFX based on patterns
    else {
      const sfxCheck = isSfx(name, trackInfo.displayName);
      if (sfxCheck.isSfx) {
        cueType = 'sfx';
        sfxCount++;
        typeConfidence = sfxCheck.confidence;
        classificationReason = 'sfx_pattern: ' + sfxCheck.matchedPattern;
      } else {
        mainCount++;
        // Main tracks: confidence depends on library detection
        typeConfidence = trackInfo.library ? 0.90 : 0.60;
      }
    }
    
    // Flag low confidence for potential Opus review
    const isLowConfidence = typeConfidence < 0.80;
    if (isLowConfidence) lowConfidenceCount++;
    
    categorized.push({
      ...clip,
      ...trackInfo,
      cueType,
      trackName: trackInfo.displayName,
      // Confidence scoring for hybrid approach
      confidence: typeConfidence,
      isLowConfidence,
      classificationReason,
      needsOpusReview: isLowConfidence
    });
  }
  
  const elapsed = Date.now() - startTime;
  
  return {
    result: categorized,
    summary: {
      stepName: 'Categorize Cues',
      inputCount: rawClips.length,
      outputCount: categorized.length,
      mainCount,
      sfxCount,
      stemCount,
      skippedFreeSfx: freeSfxCount,
      skippedNonMusic: nonMusicCount,
      lowConfidenceCount,
      averageConfidence: categorized.length > 0 
        ? (categorized.reduce((sum, c) => sum + c.confidence, 0) / categorized.length).toFixed(2)
        : 0,
      elapsedMs: elapsed,
      samples: categorized.slice(0, 3).map(c => ({
        name: c.trackName,
        type: c.cueType,
        confidence: c.confidence
      }))
    }
  };
}

// Check if audio file is non-music (camera, interview, etc.)
// Returns { isNonMusic: boolean, confidence: number, matchedPattern: string }
function isNonMusicAudio(filename) {
  for (const pattern of NON_MUSIC_PATTERNS) {
    if (pattern.test(filename)) {
      return {
        isNonMusic: true,
        confidence: 0.95,  // High confidence when pattern matches
        matchedPattern: pattern.toString()
      };
    }
  }
  return {
    isNonMusic: false,
    confidence: 0.85,  // Reasonably confident it IS music if no patterns matched
    matchedPattern: null
  };
}

// Check if a track is SFX based on patterns
// Returns { isSfx: boolean, confidence: number, matchedPattern: string }
function isSfx(originalName, displayName) {
  const nameToCheck = `${originalName} ${displayName}`.toLowerCase();
  
  for (const pattern of SFX_PATTERNS) {
    if (pattern.test(nameToCheck)) {
      return {
        isSfx: true,
        confidence: 0.90,  // High confidence when SFX pattern matches
        matchedPattern: pattern.toString()
      };
    }
  }
  
  return {
    isSfx: false,
    confidence: 0.80,  // Less confident - could be SFX without obvious keywords
    matchedPattern: null
  };
}

// Parse audio filename to extract track info
// Returns track info with confidence score based on pattern match quality
function parseAudioFileName(filename) {
  const nameWithoutExt = filename.replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, '');
  
  // Check if filename ends with _Stems or contains _STEM_ or STEM (indicates stem file)
  const isStemFile = /_Stems?$/i.test(nameWithoutExt) || /_STEM_/i.test(nameWithoutExt) || /\sSTEM\s/i.test(nameWithoutExt);
  
  // BMG stem pattern: BASS_mx_BMGPM_IATS021_Punch_Drunk_STEM_BASS
  const bmgStemMatch = nameWithoutExt.match(/^([A-Z]+)_mx_BMGPM_([A-Z]+\d*)_(.+?)_STEM_/i);
  if (bmgStemMatch) {
    const catalogCode = bmgStemMatch[2];
    const trackName = bmgStemMatch[3].replace(/_/g, ' ').trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'BMG Production Music',
      source: BMG_CATALOG_MAP[catalogCode] || catalogCode,
      catalogCode: catalogCode,
      isStem: true,
      confidence: 0.95,
      matchedPattern: 'bmg_stem'
    };
  }
  
  // BSM stem pattern: mx_BSM_Step Into A World (Trailer Remix)_STEM_Bass
  // Or with version: mx_BSM_Step Into A World (Trailer Remix) v2.2_STEM_Bass + Pulse
  const bsmStemMatch = nameWithoutExt.match(/^mx_BSM_(.+?)(?:\s+v[\d.]+)?_STEM_(.+)$/i);
  if (bsmStemMatch) {
    let songTitle = bsmStemMatch[1].trim();
    const stemPart = bsmStemMatch[2].trim();
    
    // Remove version suffix from song title if present at end
    songTitle = songTitle.replace(/\s+v[\d.]+$/i, '').trim();
    
    return {
      baseTrackName: songTitle.toLowerCase(),
      displayName: songTitle,
      artist: '',
      library: 'BSM',
      source: '',
      catalogCode: '',
      isStem: true,
      stemPart: stemPart,
      confidence: 0.95,
      matchedPattern: 'bsm_stem'
    };
  }
  
  // Alternative BSM stem pattern without mx_ prefix
  const bsmStemMatch2 = nameWithoutExt.match(/^BSM\s+(.+?)\s+(?:v[\d.]+\s+)?STEM\s+(.+)$/i);
  if (bsmStemMatch2) {
    const songTitle = bsmStemMatch2[1].trim();
    const stemPart = bsmStemMatch2[2].trim();
    
    return {
      baseTrackName: songTitle.toLowerCase(),
      displayName: songTitle,
      artist: '',
      library: 'BSM',
      source: '',
      catalogCode: '',
      isStem: true,
      stemPart: stemPart,
      confidence: 0.95,
      matchedPattern: 'bsm_stem_alt'
    };
  }
  
  // Artist stem pattern: mx_K.Flay - BloodInTheCut_BGVs4_Stems
  const artistStemMatch = nameWithoutExt.match(/^mx_([^_]+)\s*-\s*([^_]+)_(.+?)_Stems?$/i);
  if (artistStemMatch) {
    const artist = artistStemMatch[1].trim();
    const songTitle = artistStemMatch[2].trim();
    const stemPart = artistStemMatch[3].trim();
    
    return {
      baseTrackName: songTitle.toLowerCase(),
      displayName: songTitle,
      artist: artist,
      library: '',
      source: '',
      catalogCode: '',
      isStem: true,
      stemPart: stemPart,
      confidence: 0.90,
      matchedPattern: 'artist_stem'
    };
  }
  
  // Beyond/BYND pattern: mxBeyond-Fire Thunder Hit
  const beyondMatch = nameWithoutExt.match(/^mxBeyond-(.+)$/i);
  if (beyondMatch) {
    const trackName = beyondMatch[1].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: 'BYND-' + trackName,
      artist: '',
      library: 'BMG Production Music',
      source: BMG_CATALOG_MAP['BYND'] || 'Beyond',
      catalogCode: 'BYND',
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'beyond'
    };
  }
  
  // Standard BMG pattern: mx_BMGPM_IATS021_Track_Name
  const bmgMatch = nameWithoutExt.match(/^mx_?BMGPM_([A-Z]+\d*)_(.+)$/i);
  if (bmgMatch) {
    const catalogCode = bmgMatch[1];
    const trackName = bmgMatch[2].replace(/_/g, ' ').trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'BMG Production Music',
      source: BMG_CATALOG_MAP[catalogCode] || catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'bmg_standard'
    };
  }
  
  // EVS (Evolution) pattern: mx_EVS_00131_069_Darkness Calls_Signature 2
  const evsMatch = nameWithoutExt.match(/^mx_EVS_(\d+)_(\d+)_(.+)$/i);
  if (evsMatch) {
    const catalogCode = 'EVS' + evsMatch[1];
    const trackName = evsMatch[3].replace(/_/g, ' ').trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'Evolution',
      source: catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'evolution'
    };
  }
  
  // GTW (Gravity/Gothic Storm) pattern: GTW121_16 Decisive Power Smash Main
  const gtwMatch = nameWithoutExt.match(/^GTW(\d+)[_\s]+(\d+)\s+(.+?)\s*(Main)?$/i);
  if (gtwMatch) {
    const catalogCode = 'GTW' + gtwMatch[1];
    const trackName = gtwMatch[3].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'Gothic Storm',
      source: catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'gothic_storm'
    };
  }
  
  // AMT (Audiomachine) pattern: AMT05_740 Master Blaster or AMT05 740 Master Blaster
  const amtMatch = nameWithoutExt.match(/^AMT(\d+)[_\s]+(\d+)\s+(.+)$/i);
  if (amtMatch) {
    const catalogCode = 'AMT' + amtMatch[1];
    const trackName = amtMatch[3].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'Audiomachine',
      source: catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'audiomachine'
    };
  }
  
  // Sencit pattern: Sencit ATv1 40 Tres Explosivos Swish Hit
  const sencitMatch = nameWithoutExt.match(/^Sencit\s+(\w+)\s+(\d+)\s+(.+)$/i);
  if (sencitMatch) {
    const catalogCode = 'Sencit ' + sencitMatch[1];
    const trackName = sencitMatch[3].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'Tenth Dimension',
      source: catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'sencit'
    };
  }
  
  // REPEATER pattern: Repeater EAv1 334 Three Killers Multi Knife Swing
  const repeaterMatch = nameWithoutExt.match(/^Repeater\s+(\w+)\s+(\d+)\s+(.+)$/i);
  if (repeaterMatch) {
    const catalogCode = 'Repeater ' + repeaterMatch[1];
    const trackName = repeaterMatch[3].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'REPEATER',
      source: catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'repeater'
    };
  }
  
  // THH (The Hit House) pattern: THH40 HAND TO HAND COMBAT 08 Tackle
  const thhMatch = nameWithoutExt.match(/^THH(\d+)\s+(.+?)\s+(\d+)\s+(.+?)(?:\s+LVTD.*)?$/i);
  if (thhMatch) {
    const catalogCode = 'THH' + thhMatch[1];
    const trackName = thhMatch[4].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'The Hit House',
      source: catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'hit_house'
    };
  }
  
  // DAM (Dream Art Music) pattern: DAM208_054 Juicy Evil Dead Punch 1 HIT
  const damMatch = nameWithoutExt.match(/^DAM(\d+)[_\s]+(\d+)\s+(.+?)(?:\s+(?:HIT|LOW|PUNCH).*)?$/i);
  if (damMatch) {
    const catalogCode = 'DAM' + damMatch[1];
    const trackName = damMatch[3].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'Dream Art Music',
      source: catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'dream_art_music'
    };
  }
  
  // BYND (Beyond) pattern with numbers: BYND258_018 Flash Zoom Bys
  const byndNumMatch = nameWithoutExt.match(/^BYND(\d+)[_\s]+(\d+)\s+(.+)$/i);
  if (byndNumMatch) {
    const catalogCode = 'BYND' + byndNumMatch[1];
    const trackName = byndNumMatch[3].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '',
      library: 'BMG Production Music',
      source: catalogCode,
      catalogCode: catalogCode,
      isStem: false,
      confidence: 0.95,
      matchedPattern: 'bynd_numbered'
    };
  }
  
  // Generic audio file with mx_ prefix - LOW CONFIDENCE (needs Opus review)
  let cleanName = nameWithoutExt
    .replace(/^mx_?/i, '')
    .replace(/^SYNC\s+/i, '')  // Remove SYNC prefix
    .replace(/_LVTD[\s_]*ClrMx$/i, '')  // Remove LVTD ClrMx suffix (before underscore replacement)
    .replace(/_/g, ' ')
    .trim();
  
  // Remove _Stems suffix for display
  cleanName = cleanName.replace(/\s*Stems?$/i, '').trim();
  
  // Remove common suffixes
  cleanName = cleanName.replace(/\s+HiFi$/i, '').trim();
  cleanName = cleanName.replace(/\s+Main$/i, '').trim();
  cleanName = cleanName.replace(/\s+LVTD\s*ClrMx$/i, '').trim();  // Also handle after space conversion
  
  if (cleanName.length > 0) {
    // Determine confidence based on name characteristics
    let confidence = 0.50;  // Base: generic/unknown format
    let matchedPattern = 'generic';
    
    // Boost confidence if has mx_ prefix (likely music)
    if (/^mx_/i.test(nameWithoutExt)) {
      confidence = 0.70;
      matchedPattern = 'generic_mx';
    }
    
    // Boost if looks like it has a catalog code pattern
    if (/[A-Z]{2,4}\d{2,4}/i.test(nameWithoutExt)) {
      confidence = 0.75;
      matchedPattern = 'generic_catalog';
    }
    
    return {
      baseTrackName: cleanName.toLowerCase(),
      displayName: cleanName,
      artist: '',
      source: '',
      catalogCode: '',
      isStem: isStemFile,
      confidence,
      matchedPattern
    };
  }
  
  return null;
}

// ============================================================================
// STEP 3: Calculate Durations - Convert ticks to formatted duration, round at :12 frames
// ============================================================================
function calculateDurations(clips, fps = 23.976) {
  const startTime = Date.now();
  const result = [];
  let withDuration = 0;
  let roundedUp = 0;
  
  for (const clip of clips) {
    const ticks = clip.ticks || 0;
    const durationInfo = ticksToDuration(ticks, fps);
    
    // Track statistics
    if (durationInfo.seconds > 0) withDuration++;
    if (durationInfo.wasRounded) roundedUp++;
    
    result.push({
      ...clip,
      duration: durationInfo.formatted,
      durationSeconds: durationInfo.seconds,
      durationFrames: durationInfo.frames,
      durationSource: 'premiere_import'
    });
  }
  
  const elapsed = Date.now() - startTime;
  
  return {
    result,
    summary: {
      stepName: 'Calculate Durations',
      inputCount: clips.length,
      outputCount: result.length,
      withDuration,
      roundedUp,
      fps,
      elapsedMs: elapsed,
      samples: result.slice(0, 3).map(c => ({
        name: c.trackName,
        duration: c.duration,
        seconds: Math.round(c.durationSeconds * 100) / 100
      }))
    }
  };
}

// Convert Premiere ticks to duration (with rounding at :12 frames per PDF spec)
function ticksToDuration(ticks, fps = 23.976) {
  const rawSeconds = ticks / TICKS_PER_SECOND;
  let seconds = rawSeconds;
  const totalFrames = Math.round(rawSeconds * fps);
  
  const minutes = Math.floor(seconds / 60);
  let secs = Math.floor(seconds % 60);
  let frames = Math.round((seconds % 1) * fps);
  
  // Round up if frames >= 12 (per cue sheet process PDF)
  let wasRounded = false;
  if (frames >= 12) {
    secs += 1;
    frames = 0;
    seconds = Math.ceil(seconds);
    wasRounded = true;
    
    // Handle minute overflow
    if (secs >= 60) {
      secs = 0;
      // Recalculate minutes
    }
  }
  
  const finalMinutes = Math.floor(seconds / 60);
  const finalSecs = secs % 60;
  
  return {
    formatted: `${finalMinutes}:${finalSecs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`,
    seconds: seconds,
    frames: totalFrames,
    wasRounded
  };
}

// ============================================================================
// STEP 4: Group Stems - Link stems to their parent cues
// ============================================================================
function groupStems(clips) {
  const startTime = Date.now();
  
  // Separate stems from main cues
  const mainCues = clips.filter(c => c.cueType !== 'stem');
  const stems = clips.filter(c => c.cueType === 'stem');
  
  // Build a map of base track names to main cues
  const mainCueMap = new Map();
  for (const cue of mainCues) {
    mainCueMap.set(cue.baseTrackName, cue);
  }
  
  // Group stems by their base track name
  const stemGroups = new Map();
  for (const stem of stems) {
    const key = stem.baseTrackName;
    if (!stemGroups.has(key)) {
      stemGroups.set(key, []);
    }
    stemGroups.get(key).push(stem);
  }
  
  // Link stems to their parent cues OR create synthetic parent from stems
  let linkedStems = 0;
  let createdParents = 0;
  
  const result = mainCues.map(cue => ({
    ...cue,
    stems: []
  }));
  
  for (const [baseName, groupStems] of stemGroups) {
    const existingParent = result.find(r => r.baseTrackName === baseName);
    
    if (existingParent) {
      // Link stems to existing parent
      existingParent.stems = groupStems;
      // Use longest stem duration (stems play simultaneously)
      const longestStemTicks = Math.max(...groupStems.map(s => s.ticks || 0));
      if (longestStemTicks > (existingParent.ticks || 0)) {
        existingParent.ticks = longestStemTicks;
        // Recalculate formatted duration from ticks
        const totalSeconds = longestStemTicks / 254016000000;
        const mins = Math.floor(totalSeconds / 60);
        const secs = Math.floor(totalSeconds % 60);
        existingParent.duration = `${mins}:${secs.toString().padStart(2, '0')}`;
        existingParent.durationSeconds = totalSeconds;
      }
      existingParent.stemDurationAbsorbed = true;
      linkedStems += groupStems.length;
    } else {
      // No parent exists - create a synthetic main cue from the first stem
      const firstStem = groupStems[0];
      // Use longest stem duration (stems play simultaneously)
      const longestStemTicks = Math.max(...groupStems.map(s => s.ticks || 0));
      const totalSeconds = longestStemTicks / 254016000000;
      const mins = Math.floor(totalSeconds / 60);
      const secs = Math.floor(totalSeconds % 60);
      const syntheticParent = {
        ...firstStem,
        cueType: 'main',
        trackName: firstStem.displayName,
        isSynthetic: true,
        ticks: longestStemTicks,
        duration: `${mins}:${secs.toString().padStart(2, '0')}`,
        durationSeconds: totalSeconds,
        stemDurationAbsorbed: true,
        stems: groupStems
      };
      result.push(syntheticParent);
      createdParents++;
      linkedStems += groupStems.length;
    }
  }
  
  const elapsed = Date.now() - startTime;
  
  return {
    result,
    summary: {
      stepName: 'Group Stems',
      inputCount: clips.length,
      outputCount: result.length,
      mainCues: mainCues.length,
      totalStems: stems.length,
      linkedStems,
      createdParents,
      elapsedMs: elapsed,
      samples: result.filter(c => c.stems && c.stems.length > 0).slice(0, 2).map(c => ({
        name: c.trackName,
        stemCount: c.stems.length,
        stemNames: c.stems.map(s => s.displayName).slice(0, 3)
      }))
    }
  };
}

// ============================================================================
// STEP 5: Enrich with File Metadata - Read metadata from audio files
// ============================================================================
async function enrichWithMetadata(clips, filePathsMap) {
  // This requires the metadata module - optional dependency
  let readAudioMetadata;
  try {
    const metadata = require('./metadata');
    readAudioMetadata = metadata.readAudioMetadata;
  } catch (e) {
    return {
      result: clips,
      summary: {
        stepName: 'Enrich with Metadata',
        inputCount: clips.length,
        outputCount: clips.length,
        enrichedCount: 0,
        skipped: true,
        reason: 'metadata module not available',
        elapsedMs: 0
      }
    };
  }
  
  const startTime = Date.now();
  const result = [];
  let enrichedCount = 0;
  let filesNotFound = 0;
  
  // Known library names that shouldn't be treated as artist names
  const libraryNames = [
    'bmg production music', 'bmg', 'bmgpm', 'apm music', 'apm', 
    'extreme music', 'universal production music', 'musicbed', 
    'artlist', 'epidemic sound', 'audiojungle', 'killer tracks'
  ];
  
  const isLibraryName = (name) => {
    if (!name) return false;
    return libraryNames.some(lib => name.toLowerCase().includes(lib));
  };
  
  for (const clip of clips) {
    let enrichedClip = { ...clip };
    
    // Try to find the audio file path
    const possibleKeys = [
      clip.originalName,
      clip.originalName?.replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, ''),
      clip.trackName
    ].filter(Boolean);
    
    let audioFilePath = null;
    for (const key of possibleKeys) {
      if (filePathsMap && filePathsMap.has(key)) {
        audioFilePath = filePathsMap.get(key);
        break;
      }
    }
    
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try {
        const metadataResult = await readAudioMetadata(audioFilePath);
        
        if (metadataResult.success && metadataResult.data) {
          const md = metadataResult.data;
          
          if (md.composer) {
            enrichedClip.composer = md.composer;
            enrichedClip.composerSource = 'file_metadata';
            enrichedClip.composerConfidence = 1.0;
          }
          if (md.publisher) {
            enrichedClip.publisher = md.publisher;
            enrichedClip.publisherSource = 'file_metadata';
            enrichedClip.publisherConfidence = 1.0;
          }
          if (md.artist) {
            if (isLibraryName(md.artist)) {
              if (!enrichedClip.label) {
                enrichedClip.label = md.artist;
                enrichedClip.labelSource = 'file_metadata';
              }
            } else {
              enrichedClip.artist = md.artist;
              enrichedClip.artistSource = 'file_metadata';
            }
          }
          if (md.album && !enrichedClip.source) {
            enrichedClip.source = md.album;
            enrichedClip.sourceSource = 'file_metadata';
          }
          
          enrichedCount++;
        }
      } catch (err) {
        // Silently continue
      }
    } else {
      filesNotFound++;
    }
    
    result.push(enrichedClip);
  }
  
  const elapsed = Date.now() - startTime;
  
  return {
    result,
    summary: {
      stepName: 'Enrich with Metadata',
      inputCount: clips.length,
      outputCount: result.length,
      enrichedCount,
      filesNotFound,
      elapsedMs: elapsed,
      samples: result.filter(c => c.composerSource === 'file_metadata').slice(0, 3).map(c => ({
        name: c.trackName,
        composer: c.composer,
        publisher: c.publisher
      }))
    }
  };
}

// ============================================================================
// STEP 6: Match Against Learned Database - Find similar tracks in cloud DB
// ============================================================================
async function matchLearnedDB(clips) {
  // This requires the cloud database - optional dependency
  let cloudTrackDatabase;
  try {
    cloudTrackDatabase = require('./cloud-track-database');
  } catch (e) {
    return {
      result: clips,
      summary: {
        stepName: 'Match Learned Database',
        inputCount: clips.length,
        outputCount: clips.length,
        matchedCount: 0,
        skipped: true,
        reason: 'cloud-track-database module not available',
        elapsedMs: 0
      }
    };
  }
  
  const startTime = Date.now();
  const result = [];
  let matchedCount = 0;
  let exactMatches = 0;
  let fuzzyMatches = 0;
  
  for (const clip of clips) {
    let enrichedClip = { ...clip };
    const trackName = clip.trackName || '';
    
    if (!trackName) {
      result.push(enrichedClip);
      continue;
    }
    
    try {
      const cleanedName = cleanTrackName(trackName);
      const catalogCode = extractCatalogCode(trackName) || clip.catalogCode;
      
      // Get significant words for search
      const significantWords = cleanedName
        .split(' ')
        .filter(t => t.length > 2 && !['bmgpm', 'bmg', 'apm', 'production', 'music'].includes(t))
        .slice(0, 2);
      
      let cloudResults = [];
      
      if (significantWords.length > 0) {
        cloudResults = await cloudTrackDatabase.getAllTracks({ 
          search: significantWords[0], 
          limit: 50 
        });
      }
      
      if (cloudResults.length === 0 && catalogCode) {
        cloudResults = await cloudTrackDatabase.getAllTracks({ 
          search: catalogCode, 
          limit: 20 
        });
      }
      
      const matchResult = findBestMatch(trackName, catalogCode, cloudResults);
      
      if (matchResult) {
        matchedCount++;
        const { match: dbMatch, confidence, reason } = matchResult;
        
        if (confidence >= 1.0) exactMatches++;
        else fuzzyMatches++;
        
        enrichedClip.matchedTrack = dbMatch.track_name || dbMatch.trackName;
        enrichedClip.matchConfidence = confidence;
        enrichedClip.matchReason = reason;
        
        // Apply matched data
        if (dbMatch.composer) {
          enrichedClip.composer = dbMatch.composer;
          enrichedClip.composerSource = 'learned_db';
          enrichedClip.composerConfidence = confidence;
        }
        if (dbMatch.publisher) {
          enrichedClip.publisher = dbMatch.publisher;
          enrichedClip.publisherSource = 'learned_db';
          enrichedClip.publisherConfidence = confidence;
        }
      }
    } catch (err) {
      // Silently continue
    }
    
    result.push(enrichedClip);
  }
  
  const elapsed = Date.now() - startTime;
  
  return {
    result,
    summary: {
      stepName: 'Match Learned Database',
      inputCount: clips.length,
      outputCount: result.length,
      matchedCount,
      exactMatches,
      fuzzyMatches,
      elapsedMs: elapsed,
      samples: result.filter(c => c.matchedTrack).slice(0, 3).map(c => ({
        name: c.trackName,
        matchedTo: c.matchedTrack,
        confidence: Math.round((c.matchConfidence || 0) * 100) + '%'
      }))
    }
  };
}

// Helper: Clean track name for comparison
function cleanTrackName(name) {
  if (!name) return '';
  return name
    .replace(/^(BYND-|mx.*?_|mx_?BMGPM_)/i, '')
    .replace(/\b[A-Z]{2,}\d{2,}\b/gi, '')
    .replace(/_/g, ' ')
    .replace(/\s*(STEM|MIX|FULL|ALT).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Helper: Extract catalog code
function extractCatalogCode(name) {
  if (!name) return null;
  const match = name.match(/\b([A-Z]{2,}[\d]{2,})\b/i);
  return match ? match[1].toUpperCase() : null;
}

// Helper: Calculate similarity
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;
  
  const getTrigrams = (s) => {
    const trigrams = new Set();
    for (let i = 0; i <= s.length - 3; i++) {
      trigrams.add(s.substring(i, i + 3));
    }
    return trigrams;
  };
  
  const t1 = getTrigrams(s1);
  const t2 = getTrigrams(s2);
  
  let intersection = 0;
  for (const t of t1) {
    if (t2.has(t)) intersection++;
  }
  
  const union = t1.size + t2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// Helper: Find best match
function findBestMatch(trackName, catalogCode, candidates) {
  if (!candidates || candidates.length === 0) return null;
  
  const cleanedInput = cleanTrackName(trackName);
  const inputCatalog = catalogCode || extractCatalogCode(trackName);
  
  let bestMatch = null;
  let bestScore = 0;
  let bestReason = '';
  
  for (const candidate of candidates) {
    const candName = candidate.track_name || candidate.trackName || '';
    const candCatalog = candidate.catalog_code || candidate.catalogCode || extractCatalogCode(candName);
    const cleanedCand = cleanTrackName(candName);
    
    let score = 0;
    let reason = '';
    
    if (cleanedInput === cleanedCand) {
      score = 1.0;
      reason = 'Exact track name match';
    }
    else if (inputCatalog && candCatalog && inputCatalog === candCatalog) {
      score = 0.95;
      reason = `Same catalog code (${inputCatalog})`;
    }
    else {
      const similarity = calculateSimilarity(cleanedInput, cleanedCand);
      if (similarity >= 0.6) {
        score = 0.5 + (similarity * 0.45);
        reason = `${Math.round(similarity * 100)}% similar name`;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
      bestReason = reason;
    }
  }
  
  if (bestScore >= 0.7) {
    return { match: bestMatch, confidence: bestScore, reason: bestReason };
  }
  
  return null;
}

// ============================================================================
// STEP 7: Apply Pattern Predictions - Use learned patterns for empty fields
// ============================================================================
async function applyPatterns(clips) {
  // This requires the pattern engine - optional dependency
  let patternEngine;
  try {
    patternEngine = require('./pattern-engine');
  } catch (e) {
    return {
      result: clips,
      summary: {
        stepName: 'Apply Patterns',
        inputCount: clips.length,
        outputCount: clips.length,
        appliedCount: 0,
        skipped: true,
        reason: 'pattern-engine module not available',
        elapsedMs: 0
      }
    };
  }
  
  if (!patternEngine.isAvailable || !patternEngine.isAvailable()) {
    return {
      result: clips,
      summary: {
        stepName: 'Apply Patterns',
        inputCount: clips.length,
        outputCount: clips.length,
        appliedCount: 0,
        skipped: true,
        reason: 'pattern engine not initialized',
        elapsedMs: 0
      }
    };
  }
  
  const startTime = Date.now();
  const result = [];
  let appliedCount = 0;
  const fieldsFilled = { composer: 0, publisher: 0, artist: 0 };
  
  for (const clip of clips) {
    let enrichedClip = { ...clip };
    
    try {
      const patternFills = await patternEngine.applyHighConfidencePatterns(enrichedClip);
      
      for (const [field, fillData] of Object.entries(patternFills)) {
        const currentValue = enrichedClip[field];
        if (!currentValue || currentValue.trim() === '' || currentValue === '-') {
          enrichedClip[field] = fillData.value;
          enrichedClip[`${field}Source`] = fillData.source;
          enrichedClip[`${field}Confidence`] = fillData.confidence;
          fieldsFilled[field] = (fieldsFilled[field] || 0) + 1;
          appliedCount++;
        }
      }
    } catch (err) {
      // Silently continue
    }
    
    result.push(enrichedClip);
  }
  
  const elapsed = Date.now() - startTime;
  
  return {
    result,
    summary: {
      stepName: 'Apply Patterns',
      inputCount: clips.length,
      outputCount: result.length,
      appliedCount,
      fieldsFilled,
      elapsedMs: elapsed,
      samples: result.filter(c => c.composerSource === 'pattern').slice(0, 3).map(c => ({
        name: c.trackName,
        composer: c.composer,
        confidence: Math.round((c.composerConfidence || 0) * 100) + '%'
      }))
    }
  };
}

// ============================================================================
// STEP 8: Detect Use Types - Determine BI/BV/VI for each cue
// ============================================================================
async function detectUseTypes(clips) {
  // This requires the use-type-detector - optional dependency
  let useTypeDetector;
  try {
    useTypeDetector = require('./use-type-detector');
  } catch (e) {
    // Fall back to simple detection
    return {
      result: clips.map(c => ({ ...c, use: 'BI', useSource: 'default' })),
      summary: {
        stepName: 'Detect Use Types',
        inputCount: clips.length,
        outputCount: clips.length,
        detected: 0,
        skipped: true,
        reason: 'use-type-detector module not available - defaulting to BI',
        elapsedMs: 0
      }
    };
  }
  
  const startTime = Date.now();
  const result = [];
  const typeCounts = { BI: 0, BV: 0, VI: 0 };
  let highConfidence = 0;
  
  for (const clip of clips) {
    let enrichedClip = { ...clip };
    
    try {
      const detection = await useTypeDetector.detectUseType(clip.trackName, {
        library: clip.library || clip.label,
        duration: clip.durationSeconds,
        isStem: clip.isStem,
        isFX: clip.cueType === 'sfx',
        isProductionMusic: clip.library?.toLowerCase().includes('production')
      });
      
      enrichedClip.use = detection.useType;
      enrichedClip.useConfidence = detection.confidence;
      enrichedClip.useReason = detection.reason;
      
      typeCounts[detection.useType] = (typeCounts[detection.useType] || 0) + 1;
      if (detection.confidence >= 0.8) highConfidence++;
    } catch (err) {
      enrichedClip.use = 'BI';
      enrichedClip.useSource = 'default';
      typeCounts.BI++;
    }
    
    result.push(enrichedClip);
  }
  
  const elapsed = Date.now() - startTime;
  
  return {
    result,
    summary: {
      stepName: 'Detect Use Types',
      inputCount: clips.length,
      outputCount: result.length,
      typeCounts,
      highConfidence,
      elapsedMs: elapsed,
      samples: result.slice(0, 3).map(c => ({
        name: c.trackName,
        use: c.use,
        confidence: Math.round((c.useConfidence || 0) * 100) + '%'
      }))
    }
  };
}

// ============================================================================
// Pipeline step definitions for progress reporting
// ============================================================================
const PIPELINE_STEPS = [
  { id: 1, name: 'Parsing XML', description: 'Reading project file...' },
  { id: 2, name: 'Categorizing', description: 'Classifying clips as Main/SFX/Stem...' },
  { id: 3, name: 'Calculating Durations', description: 'Converting timeline to durations...' },
  { id: 4, name: 'Grouping Stems', description: 'Linking stems to parent tracks...' },
  { id: 5, name: 'Reading Metadata', description: 'Extracting file metadata...' },
  { id: 6, name: 'Matching Database', description: 'Finding matches in learned database...' },
  { id: 7, name: 'Applying Patterns', description: 'Using learned patterns...' },
  { id: 8, name: 'Detecting Use Types', description: 'Determining BI/BV/VI usage...' },
];

// ============================================================================
// FINAL: Run Full Pipeline - Execute all steps in sequence
// ============================================================================
async function runFullPipeline(filePath, options = {}) {
  const startTime = Date.now();
  const summaries = [];
  const onProgress = options.onProgress || (() => {}); // Progress callback
  const totalSteps = PIPELINE_STEPS.length;
  
  // Helper to report progress
  // When starting a step: progress = (stepNum - 1) / totalSteps (0% at start)
  // When completing a step: progress = stepNum / totalSteps (100% at end)
  const reportProgress = (stepNum, matches = 0, additional = {}) => {
    const step = PIPELINE_STEPS[stepNum - 1];
    const isComplete = additional.complete === true;
    const progressValue = isComplete 
      ? Math.round((stepNum / totalSteps) * 100)
      : Math.round(((stepNum - 1) / totalSteps) * 100);
    onProgress({
      step: stepNum,
      totalSteps,
      stepName: step.name,
      description: step.description,
      progress: progressValue,
      matches,
      ...additional
    });
  };
  
  // Step 1: Parse XML
  reportProgress(1);
  const step1 = await parseProjectXML(filePath);
  summaries.push(step1.summary);
  reportProgress(1, step1.result.length, { complete: true });
  
  // Step 2: Categorize
  reportProgress(2);
  const step2 = categorizeCues(step1.result);
  summaries.push(step2.summary);
  reportProgress(2, step2.result.length, { complete: true });
  
  // Step 3: Durations
  reportProgress(3);
  const step3 = calculateDurations(step2.result, options.fps || 23.976);
  summaries.push(step3.summary);
  reportProgress(3, step3.result.length, { complete: true });
  
  // Step 4: Group Stems
  reportProgress(4);
  const step4 = groupStems(step3.result);
  summaries.push(step4.summary);
  reportProgress(4, step4.result.length, { complete: true });
  
  // Step 5: File Metadata
  reportProgress(5);
  const step5 = await enrichWithMetadata(step4.result, step1.filePathsMap);
  summaries.push(step5.summary);
  reportProgress(5, step5.summary.enrichedCount || 0, { complete: true });
  
  // Step 6: Learned DB
  reportProgress(6);
  const step6 = await matchLearnedDB(step5.result);
  summaries.push(step6.summary);
  reportProgress(6, step6.summary.matchedCount || 0, { complete: true });
  
  // Step 7: Patterns
  reportProgress(7);
  const step7 = await applyPatterns(step6.result);
  summaries.push(step7.summary);
  reportProgress(7, step7.summary.appliedCount || 0, { complete: true });
  
  // Step 8: Use Types
  reportProgress(8);
  const step8 = await detectUseTypes(step7.result);
  summaries.push(step8.summary);
  reportProgress(8, step8.result.length, { complete: true, done: true });
  
  const totalElapsed = Date.now() - startTime;
  
  return {
    result: step8.result,
    projectName: step1.projectName,
    spotTitle: step1.spotTitle,
    summaries,
    totalElapsedMs: totalElapsed,
    finalSummary: {
      projectName: step1.projectName,
      totalCues: step8.result.length,
      mainCues: step8.result.filter(c => c.cueType === 'main').length,
      sfxCues: step8.result.filter(c => c.cueType === 'sfx').length,
      withComposer: step8.result.filter(c => c.composer).length,
      withPublisher: step8.result.filter(c => c.publisher).length,
      complete: step8.result.filter(c => c.composer && c.publisher).length,
      totalElapsedMs: totalElapsed
    }
  };
}

// ============================================================================
// HELPER: Generate Summary Report
// ============================================================================
function summarize(pipelineResult) {
  const { summaries, finalSummary } = pipelineResult;
  
  let report = `\n${'='.repeat(60)}\n`;
  report += `IMPORT PIPELINE SUMMARY: ${finalSummary.projectName}\n`;
  report += `${'='.repeat(60)}\n\n`;
  
  for (const s of summaries) {
    report += `${s.stepName}\n`;
    report += `${'-'.repeat(40)}\n`;
    
    // Show key metrics
    if (s.inputCount !== undefined) report += `  Input: ${s.inputCount} clips\n`;
    if (s.outputCount !== undefined) report += `  Output: ${s.outputCount} clips\n`;
    
    // Show step-specific metrics
    if (s.mainCount !== undefined) report += `  Main: ${s.mainCount}, SFX: ${s.sfxCount}, Stems: ${s.stemCount}\n`;
    if (s.enrichedCount !== undefined) report += `  Enriched: ${s.enrichedCount}\n`;
    if (s.matchedCount !== undefined) report += `  Matched: ${s.matchedCount} (${s.exactMatches || 0} exact, ${s.fuzzyMatches || 0} fuzzy)\n`;
    if (s.typeCounts) report += `  Types: BI=${s.typeCounts.BI || 0}, BV=${s.typeCounts.BV || 0}, VI=${s.typeCounts.VI || 0}\n`;
    if (s.skipped) report += `  ⚠️  Skipped: ${s.reason}\n`;
    
    report += `  Time: ${s.elapsedMs}ms\n\n`;
  }
  
  report += `FINAL RESULTS\n`;
  report += `${'='.repeat(40)}\n`;
  report += `  Total Cues: ${finalSummary.totalCues}\n`;
  report += `  Main Cues: ${finalSummary.mainCues}\n`;
  report += `  SFX Cues: ${finalSummary.sfxCues}\n`;
  report += `  With Composer: ${finalSummary.withComposer}\n`;
  report += `  With Publisher: ${finalSummary.withPublisher}\n`;
  report += `  Complete: ${finalSummary.complete}\n`;
  report += `  Total Time: ${finalSummary.totalElapsedMs}ms\n`;
  
  return report;
}

// ============================================================================
// OPUS: Batch Classification for Low-Confidence Clips
// Only called when clips have confidence < 0.80
// ============================================================================
async function batchClassifyWithOpus(clips, opusEnabled = false) {
  const startTime = Date.now();
  
  // Filter to only low-confidence clips
  const lowConfidenceClips = clips.filter(c => c.confidence < 0.80);
  
  if (lowConfidenceClips.length === 0 || !opusEnabled) {
    return {
      result: clips,
      opusUsed: false,
      summary: {
        stepName: 'Opus Classification',
        skipped: true,
        reason: lowConfidenceClips.length === 0 ? 'No low-confidence clips' : 'Opus not enabled',
        elapsedMs: Date.now() - startTime
      }
    };
  }
  
  console.log(`[Opus] Batch classifying ${lowConfidenceClips.length} low-confidence clips...`);
  
  try {
    // Dynamic import of opus-parser to avoid circular deps
    const opusParser = require('./opus-parser');
    
    // Build the batch prompt
    const clipList = lowConfidenceClips.map((c, i) => 
      `${i + 1}. "${c.originalName}"`
    ).join('\n');
    
    const systemPrompt = `You are an expert at classifying audio files for music cue sheets.

Given a list of audio filenames from a video editing project, classify each one:
- "music" = Production music track (for cue sheet)
- "sfx" = Sound effect (whoosh, hit, stinger, transition)
- "stem" = Part of a larger music track (drums, bass, vocals, etc.)
- "non_music" = Camera audio, interview, voiceover, dialogue, temp audio

Also provide a clean display name for music/sfx tracks.`;

    const userPrompt = `Classify these audio files:

${clipList}

Return JSON array:
[
  {
    "index": 1,
    "classification": "music" | "sfx" | "stem" | "non_music",
    "displayName": "Clean Track Name",
    "library": "Library name if detectable" or null,
    "confidence": 0.0 to 1.0,
    "reasoning": "brief explanation"
  }
]

Return ONLY the JSON array.`;

    const response = await opusParser.callOpusRaw(systemPrompt, userPrompt, 2048);
    const opusResults = parseOpusJsonResponse(response);
    
    // Merge Opus results back into clips
    const result = clips.map(clip => {
      // Find if this clip was classified by Opus
      const lowConfIdx = lowConfidenceClips.findIndex(lc => lc.id === clip.id);
      if (lowConfIdx === -1) return clip;
      
      const opusResult = opusResults.find(r => r.index === lowConfIdx + 1);
      if (!opusResult) return clip;
      
      // Map Opus classification to cueType
      let cueType = clip.cueType;
      let excluded = clip.excluded || false;
      
      if (opusResult.classification === 'non_music') {
        excluded = true;
      } else if (opusResult.classification === 'sfx') {
        cueType = 'sfx';
      } else if (opusResult.classification === 'stem') {
        cueType = 'stem';
      } else {
        cueType = 'main';
      }
      
      return {
        ...clip,
        cueType,
        excluded,
        trackName: opusResult.displayName || clip.trackName,
        library: opusResult.library || clip.library,
        confidence: opusResult.confidence || 0.85,
        opusClassified: true,
        opusReasoning: opusResult.reasoning
      };
    });
    
    const elapsed = Date.now() - startTime;
    
    return {
      result,
      opusUsed: true,
      summary: {
        stepName: 'Opus Classification',
        inputCount: lowConfidenceClips.length,
        classifiedCount: opusResults.length,
        elapsedMs: elapsed
      }
    };
    
  } catch (error) {
    console.error('[Opus] Batch classification error:', error.message);
    
    // Return original clips if Opus fails
    return {
      result: clips,
      opusUsed: false,
      opusError: error.message,
      summary: {
        stepName: 'Opus Classification',
        skipped: true,
        reason: 'Error: ' + error.message,
        elapsedMs: Date.now() - startTime
      }
    };
  }
}

// Helper to parse Opus JSON response
function parseOpusJsonResponse(response) {
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

// Export all functions
module.exports = {
  // Individual steps
  parseProjectXML,
  categorizeCues,
  calculateDurations,
  groupStems,
  enrichWithMetadata,
  matchLearnedDB,
  applyPatterns,
  detectUseTypes,
  
  // Full pipeline
  runFullPipeline,
  
  // Opus integration (hybrid approach)
  batchClassifyWithOpus,
  
  // Helpers
  summarize,
  
  // Constants (for testing)
  SFX_PATTERNS,
  AUDIO_EXTENSIONS,
  TICKS_PER_SECOND,
  PIPELINE_STEPS
};
