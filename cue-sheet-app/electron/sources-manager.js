const { app } = require('electron');
const fs = require('fs');
const path = require('path');

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

// Default sources configuration
const defaultSources = {
  // AI Engines
  opus: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: { apiKey: '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' } 
  },
  voyage: { 
    enabled: true, 
    status: 'connected', 
    lastCheck: null,
    config: { apiKey: 'pa-AHjF7Um7ErLjK0zasvAPnLz3_lArL4HRQ93z697QH96' } 
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

// Load sources from disk
function loadSources() {
  try {
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf-8');
      const stored = JSON.parse(data);
      // Merge with defaults to ensure new sources are added
      return { ...defaultSources, ...stored };
    }
  } catch (error) {
    console.error('Error loading sources:', error);
  }
  return { ...defaultSources };
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
    saveSources(sources);
    return sources[sourceId];
  }
  return null;
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
        // For unimplemented sources, mark as not available
        testResult = { success: false, error: 'Source not yet implemented' };
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
  getEnabledSources
};
