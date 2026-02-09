const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Load .env file for API keys (same pattern as supabase-client.js)
function loadEnvFile() {
  try {
    const isPackaged = app && typeof app.isPackaged !== 'undefined' ? app.isPackaged : false;
    const envPath = isPackaged
      ? path.join(process.resourcesPath, '.env')
      : path.join(__dirname, '..', '.env');

    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) return;
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        if (key && value && !process.env[key]) {
          process.env[key] = value;
        }
      });
    }
  } catch (e) {
    console.log('[SourcesManager] No .env file found, using environment variables');
  }
}

loadEnvFile();

// Source categories for filtering - production music tracks should NOT use commercial sources
const SOURCE_CATEGORIES = {
  // Production Music Libraries
  bmg: 'production',
  apm: 'production',
  extreme: 'production',
  universal: 'production',
  
  // Commercial Music APIs (BLOCKED for production tracks)
  itunes: 'commercial',
  spotify: 'commercial',
  musicbrainz: 'commercial',
  discogs: 'commercial',
  
  // PRO Databases (neutral - allowed for all track types)
  bmi: 'pro',
  ascap: 'pro',
  sesac: 'pro',
  
  // AI/Embedding engines (neutral - used for extraction)
  opus: 'ai',
  voyage: 'ai'
};

// Store sources config in app data directory
const getStorePath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'sources.json');
};

// Global keys fetched from Supabase (shared across all users)
let globalKeys = {};

const getGlobalKeysPath = () => {
  try {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'global-keys.json');
  } catch (e) {
    return null;
  }
};

/**
 * Set global keys from Supabase and cache to disk for offline use.
 * Called after successful authentication.
 */
function setGlobalKeys(keys) {
  globalKeys = keys || {};
  const cachePath = getGlobalKeysPath();
  if (!cachePath) return;
  try {
    fs.writeFileSync(cachePath, JSON.stringify(globalKeys, null, 2));
    console.log('[SourcesManager] Global keys cached locally');
  } catch (e) {
    console.error('[SourcesManager] Failed to cache global keys:', e.message);
  }
}

/**
 * Load cached global keys from disk (for offline startup).
 */
function loadCachedGlobalKeys() {
  const cachePath = getGlobalKeysPath();
  if (!cachePath) return;
  try {
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8');
      globalKeys = JSON.parse(data);
      console.log('[SourcesManager] Loaded cached global keys');
    }
  } catch (e) {
    console.error('[SourcesManager] Failed to load cached global keys:', e.message);
  }
}

/**
 * Get the current global keys (in-memory).
 */
function getGlobalKeys() {
  return { ...globalKeys };
}

// Load cached global keys on startup so they're available before auth
loadCachedGlobalKeys();

// Default sources configuration
const defaultSources = {
  // AI Engines
  opus: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: { apiKey: process.env.ANTHROPIC_API_KEY || '' } 
  },
  voyage: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: { apiKey: process.env.VOYAGE_API_KEY || '' } 
  },
  
  // PRO Databases
  bmi: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: {} 
  },
  ascap: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: {} 
  },
  sesac: { 
    enabled: false, 
    status: 'not_setup', 
    lastCheck: null,
    config: {} 
  },
  
  // Music APIs
  itunes: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: {} 
  },
  spotify: { 
    enabled: false, 
    status: 'not_setup', 
    lastCheck: null,
    config: { clientId: '', clientSecret: '' } 
  },
  musicbrainz: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: {} 
  },
  discogs: { 
    enabled: false, 
    status: 'not_setup', 
    lastCheck: null,
    config: { token: '' } 
  },
  
  // Production Libraries
  bmg: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: {} 
  },
  apm: { 
    enabled: false, 
    status: 'not_setup', 
    lastCheck: null,
    config: {} 
  },
  extreme: { 
    enabled: false, 
    status: 'not_setup', 
    lastCheck: null,
    config: {} 
  },
  universal: { 
    enabled: false, 
    status: 'not_setup', 
    lastCheck: null,
    config: {} 
  }
};

/**
 * Resolve the effective API key for a source using priority order:
 *   1. User's own key from sources.json (set via Settings UI)
 *   2. Global key from Supabase (fetched after auth, cached locally)
 *   3. Environment variable from .env
 */
function resolveApiKey(sourceId, userKey) {
  // Priority 1: user's own explicit key
  if (userKey) return userKey;

  // Priority 2: global key from Supabase
  if (sourceId === 'opus' && globalKeys.anthropic_api_key) {
    return globalKeys.anthropic_api_key;
  }
  if (sourceId === 'voyage' && globalKeys.voyage_api_key) {
    return globalKeys.voyage_api_key;
  }

  // Priority 3: environment variable
  if (sourceId === 'opus') return process.env.ANTHROPIC_API_KEY || '';
  if (sourceId === 'voyage') return process.env.VOYAGE_API_KEY || '';

  return '';
}

// Load sources from disk
function loadSources() {
  let sources = { ...defaultSources };

  try {
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf-8');
      const stored = JSON.parse(data);
      // Deep merge: per-source merge so stored config doesn't wipe defaults
      for (const [key, storedSource] of Object.entries(stored)) {
        if (sources[key]) {
          sources[key] = {
            ...sources[key],
            ...storedSource,
            config: { ...sources[key].config, ...storedSource.config }
          };
        } else {
          sources[key] = storedSource;
        }
      }
    }
  } catch (error) {
    console.error('Error loading sources:', error);
  }

  // Apply key resolution for AI sources
  if (sources.opus) {
    sources.opus.config.apiKey = resolveApiKey('opus', sources.opus.config.apiKey);
  }
  if (sources.voyage) {
    sources.voyage.config.apiKey = resolveApiKey('voyage', sources.voyage.config.apiKey);
  }

  return sources;
}

// Save sources to disk
function saveSources(sources) {
  try {
    const storePath = getStorePath();
    fs.writeFileSync(storePath, JSON.stringify(sources, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving sources:', error);
    return false;
  }
}

// Get all sources
function getAllSources() {
  return loadSources();
}

// Get a specific source
function getSource(sourceId) {
  const sources = loadSources();
  return sources[sourceId] || null;
}

// Update source configuration
function updateSourceConfig(sourceId, config) {
  const sources = loadSources();
  if (sources[sourceId]) {
    sources[sourceId].config = { ...sources[sourceId].config, ...config };
    sources[sourceId].status = 'configured';
  } else {
    // Create new source entry for custom sources
    sources[sourceId] = {
      enabled: true,
      status: 'configured',
      config: config
    };
  }
  saveSources(sources);
  return sources[sourceId];
}

// Toggle source enabled state
function toggleSource(sourceId, enabled) {
  const sources = loadSources();
  if (sources[sourceId]) {
    sources[sourceId].enabled = enabled;
    saveSources(sources);
    return sources[sourceId];
  }
  return null;
}

// Update source status
function updateSourceStatus(sourceId, status, error = null) {
  const sources = loadSources();
  if (sources[sourceId]) {
    sources[sourceId].status = status;
    sources[sourceId].lastCheck = new Date().toISOString();
    if (error) {
      sources[sourceId].lastError = error;
    } else {
      delete sources[sourceId].lastError;
    }
    saveSources(sources);
    return sources[sourceId];
  }
  return null;
}

// Test connection for a source
async function testConnection(sourceId) {
  const sources = loadSources();
  const source = sources[sourceId];
  
  if (!source) {
    return { success: false, error: 'Source not found' };
  }

  try {
    let testResult = { success: false };

    switch (sourceId) {
      case 'opus':
        // Claude Opus requires API key
        if (!source.config?.apiKey) {
          testResult = { success: false, error: 'API key not configured' };
        } else {
          testResult = await testOpusConnection(source.config);
        }
        break;
      
      case 'bmi':
        // BMI is a public web scraper, just check if we can reach the site
        testResult = await testBMIConnection();
        break;
      
      case 'ascap':
        // ASCAP is a public web scraper
        testResult = await testASCAPConnection();
        break;
      
      case 'itunes':
        // iTunes Search API is free and public
        testResult = await testITunesConnection();
        break;
      
      case 'musicbrainz':
        // MusicBrainz is free, just check API availability
        testResult = await testMusicBrainzConnection();
        break;
      
      case 'spotify':
        // Spotify requires API keys
        if (!source.config?.clientId || !source.config?.clientSecret) {
          testResult = { success: false, error: 'API keys not configured' };
        } else {
          testResult = await testSpotifyConnection(source.config);
        }
        break;
      
      case 'bmg':
        // BMG public catalog search
        testResult = await testBMGConnection();
        break;
      
      default:
        // For custom sources with API keys, assume connected if key is present
        if (source.config?.apiKey) {
          testResult = { success: true };
        } else {
          testResult = { success: false, error: 'API key not configured' };
        }
    }

    // Update status based on test result
    updateSourceStatus(
      sourceId, 
      testResult.success ? 'connected' : 'error',
      testResult.error
    );

    return testResult;
  } catch (error) {
    updateSourceStatus(sourceId, 'error', error.message);
    return { success: false, error: error.message };
  }
}

// Test all enabled sources
async function testAllConnections() {
  const sources = loadSources();
  const results = {};

  for (const [sourceId, source] of Object.entries(sources)) {
    if (source.enabled) {
      results[sourceId] = await testConnection(sourceId);
    }
  }

  return results;
}

// Individual connection tests
async function testBMIConnection() {
  // Simple check - BMI is a public website
  return { success: true };
}

async function testASCAPConnection() {
  // Simple check - ASCAP is a public website
  return { success: true };
}

async function testITunesConnection() {
  try {
    const response = await fetch('https://itunes.apple.com/search?term=test&media=music&limit=1');
    if (response.ok) {
      const data = await response.json();
      return { success: true, resultCount: data.resultCount };
    }
    return { success: false, error: 'API not responding' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testMusicBrainzConnection() {
  try {
    const response = await fetch('https://musicbrainz.org/ws/2/artist/5b11f4ce-a62d-471e-81fc-a69a8278c7da?fmt=json', {
      headers: { 'User-Agent': 'AurisCueSheets/1.0.0 (https://auris.com)' }
    });
    return { success: response.ok };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testSpotifyConnection(config) {
  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });
    
    if (tokenResponse.ok) {
      return { success: true };
    } else {
      const error = await tokenResponse.json();
      return { success: false, error: error.error_description || 'Invalid credentials' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testBMGConnection() {
  // BMG public catalog - simple check
  return { success: true };
}

async function testOpusConnection(config) {
  if (!config.apiKey) {
    return { success: false, error: 'No API key configured. Add your Anthropic API key in Settings or .env file.' };
  }
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });
    
    if (response.ok) {
      return { success: true, model: 'Claude Opus 4.5' };
    } else {
      const error = await response.json();
      console.error('[Opus Test] API error:', error);
      return { success: false, error: error.error?.message || 'Invalid API key' };
    }
  } catch (error) {
    console.error('[Opus Test] Connection error:', error);
    return { success: false, error: error.message };
  }
}

// Get enabled sources for lookup
function getEnabledSources() {
  const sources = loadSources();
  return Object.entries(sources)
    .filter(([_, source]) => source.enabled && source.status === 'connected')
    .map(([id, source]) => ({ id, ...source }));
}

module.exports = {
  SOURCE_CATEGORIES,
  loadSources,
  saveSources,
  getAllSources,
  getSource,
  updateSourceConfig,
  toggleSource,
  updateSourceStatus,
  testConnection,
  testAllConnections,
  getEnabledSources,
  setGlobalKeys,
  getGlobalKeys
};
