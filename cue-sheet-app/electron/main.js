const { app, BrowserWindow, ipcMain, dialog } = require('electron');
// Only load autoUpdater when packaged (not in dev mode)
// Check if running in dev by looking at the executable path
const isDevMode = !app || process.execPath.includes('electron') || process.env.ELECTRON_IS_DEV;
let autoUpdater = null;
if (!isDevMode && app) {
  try {
    autoUpdater = require('electron-updater').autoUpdater;
  } catch (e) {
    console.log('[AutoUpdater] Not available:', e.message);
  }
}
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');
const ExcelJS = require('exceljs');
const { findContact, importContactsFromFile, getAllContacts, getContactNames } = require('./contacts');
const { readAudioMetadata, enrichCueWithMetadata, parseTrackName } = require('./metadata');
const { searchBMGTrack, enrichCueFromBMG, looksLikeBMGTrack } = require('./bmg-lookup');
const { searchTrack: searchiTunes, enrichCueFromiTunes, isLikelyOniTunes } = require('./itunes-lookup');
const { isOpusEnabled, enrichCueWithOpus, lookupPROData, detectUseType, enrichMultipleCues } = require('./opus-engine');
const { searchAllPROs, formatPRODataForCue } = require('./pro-lookup');
const projectStore = require('./project-store');
const sourcesManager = require('./sources-manager');
const { SOURCE_CATEGORIES } = require('./sources-manager');
const acsProject = require('./acs-project');
const { LOOKUP_SITES } = require('./lookup-sites');

// Cloud/Supabase imports
const supabaseClient = require('./supabase-client');
const { cloudTrackDatabase } = require('./track-database-cloud');
const { cloudSourcesManager } = require('./sources-manager-cloud');
const feedbackManager = require('./feedback-manager');
const aurisChat = require('./auris-chat');
const { patternEngine } = require('./pattern-engine');

// Keep a global reference of the window object
let mainWindow;

// Use the same dev check we defined at the top
const isDev = isDevMode;

// Register custom protocol for bookmarklet data
const PROTOCOL = 'auris';
if (app && app.whenReady) {
  app.whenReady().then(() => {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL);
    }
  });
}

// Store pending BMG data if app isn't ready yet
let pendingBmgData = null;

/**
 * Parse auris:// protocol URL and extract BMG data
 */
function parseAurisUrl(url) {
  try {
    console.log('[Protocol] Received URL:', url);
    
    // URL format: auris://bmg?trackName=...&composer=...
    const urlObj = new URL(url);
    const params = urlObj.searchParams;
    
    const data = {
      trackName: params.get('trackName') || '',
      composer: params.get('composer') || '',
      album: params.get('album') || '',
      albumCode: params.get('albumCode') || '',
      label: params.get('label') || '',
      trackNumber: params.get('trackNumber') || '',
      sourceUrl: params.get('url') || ''
    };
    
    console.log('[Protocol] Parsed data:', data);
    return data;
  } catch (error) {
    console.error('[Protocol] Error parsing URL:', error);
    return null;
  }
}

/**
 * Handle incoming protocol URL
 */
function handleProtocolUrl(url) {
  const data = parseAurisUrl(url);
  if (!data) return;
  
  if (mainWindow) {
    // Send to renderer
    mainWindow.webContents.send('bmg-data-received', data);
    // Focus the window
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    // Store for when window is ready
    pendingBmgData = data;
  }
}

// Handle protocol on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleProtocolUrl(url);
});

// Handle protocol on Windows (single instance)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    // Find the protocol URL in command line args
    const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL}://`));
    if (url) {
      handleProtocolUrl(url);
    }
    // Focus window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#0a0d12',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5200');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Send pending BMG data once window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingBmgData) {
      mainWindow.webContents.send('bmg-data-received', pendingBmgData);
      pendingBmgData = null;
    }
  });
}

app.whenReady().then(createWindow);

// =============================================
// Auto-Updater Configuration (only in production)
// =============================================
if (autoUpdater) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Auto-updater event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] No update available, current version is latest');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`[AutoUpdater] Download progress: ${Math.round(progress.percent)}%`);
    if (mainWindow) {
      mainWindow.webContents.send('update-download-progress', progress);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err.message);
  });
}

// Check for updates after app launches (only in production)
app.whenReady().then(() => {
  if (autoUpdater && !isDev) {
    // Check for updates after a short delay to let the app fully load
    setTimeout(() => {
      console.log('[AutoUpdater] Checking for updates...');
      autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.log('[AutoUpdater] Update check failed:', err.message);
      });
    }, 3000);
  }
});

// IPC handlers for update actions
ipcMain.handle('updater:check', async () => {
  if (!autoUpdater) {
    return { success: false, error: 'Auto-updater not available in dev mode' };
  }
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:install', () => {
  if (autoUpdater) {
    autoUpdater.quitAndInstall(false, true);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// IPC Handlers

// Open file dialog for .prproj files
ipcMain.handle('dialog:openPrproj', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Premiere Pro Project',
    filters: [
      { name: 'Premiere Pro Projects', extensions: ['prproj'] }
    ],
    properties: ['openFile']
  });
  
  if (result.canceled) {
    return null;
  }
  
  return result.filePaths[0];
});

// Parse .prproj file
ipcMain.handle('prproj:parse', async (event, filePath) => {
  try {
    const result = await parsePrprojFile(filePath);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Import Wizard - Parse project with full pipeline (all 8 steps)
// Includes: XML parsing, categorization, durations, stem grouping,
// file metadata extraction, learned DB matching, pattern fills, use type detection
ipcMain.handle('wizard:parseProject', async (event, filePath) => {
  try {
    const importPipeline = require('./import-pipeline');
    
    console.log('[Wizard] Running full pipeline for:', filePath);
    
    // Progress callback to send updates to renderer
    const onProgress = (progressData) => {
      // Send progress to the renderer process
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('wizard:progress', progressData);
      }
    };
    
    // Run the complete 8-step pipeline with progress reporting
    const pipelineResult = await importPipeline.runFullPipeline(filePath, { 
      fps: 23.976,
      onProgress 
    });
    
    console.log(`[Wizard] Pipeline completed in ${pipelineResult.totalElapsedMs}ms`);
    console.log(`[Wizard] Final: ${pipelineResult.result.length} cues`);
    console.log(`[Wizard] With composer: ${pipelineResult.finalSummary.withComposer}, With publisher: ${pipelineResult.finalSummary.withPublisher}`);
    
    return {
      success: true,
      projectName: pipelineResult.projectName,
      spotTitle: pipelineResult.spotTitle,
      rawClips: pipelineResult.result, // Use final result for all steps (has all data)
      categorizedClips: pipelineResult.result,
      groupedClips: pipelineResult.result,
      summary: {
        rawCount: pipelineResult.summaries[0]?.outputCount || pipelineResult.result.length,
        categorizedCount: pipelineResult.summaries[1]?.outputCount || pipelineResult.result.length,
        groupedCount: pipelineResult.result.length,
        mainCount: pipelineResult.finalSummary.mainCues,
        sfxCount: pipelineResult.finalSummary.sfxCues,
        withComposer: pipelineResult.finalSummary.withComposer,
        withPublisher: pipelineResult.finalSummary.withPublisher,
        complete: pipelineResult.finalSummary.complete,
        processingTimeMs: pipelineResult.totalElapsedMs,
        opusEnabled: false,
        opusUsed: false,
      }
    };
  } catch (error) {
    console.error('[Wizard] Parse error:', error);
    return { success: false, error: error.message };
  }
});

// Export to Excel
ipcMain.handle('excel:export', async (event, { cues, projectInfo, format = 'xlsx', projectFolder = null }) => {
  try {
    // Build filename: Project_SpotName_Type.filetype
    const project = (projectInfo.project || '').replace(/[^a-zA-Z0-9]/g, '');
    const spotTitle = (projectInfo.spotTitle || 'CueSheet').replace(/[^a-zA-Z0-9]/g, '');
    const type = (projectInfo.type || '').replace(/[^a-zA-Z0-9]/g, '');
    
    // Construct filename with underscores, filtering out empty parts
    const filenameParts = [project, spotTitle, type].filter(part => part.length > 0);
    const filename = filenameParts.join('_') || 'CueSheet';
    
    let filePath;
    
    // If projectFolder is provided, save to Exports/date/ folder automatically
    if (projectFolder && fs.existsSync(projectFolder)) {
      const exportFolder = acsProject.getExportPath(projectFolder, format);
      filePath = path.join(exportFolder, `${filename}.${format}`);
    } else {
      // Otherwise show save dialog
      const filters = format === 'pdf' 
        ? [{ name: 'PDF Files', extensions: ['pdf'] }]
        : [{ name: 'Excel Files', extensions: ['xlsx'] }];
      
      const result = await dialog.showSaveDialog(mainWindow, {
        title: `Save Cue Sheet as ${format.toUpperCase()}`,
        defaultPath: `${filename}.${format}`,
        filters
      });
      
      if (result.canceled) {
        return { success: false, canceled: true };
      }
      
      filePath = result.filePath;
    }
    
    if (format === 'pdf') {
      await exportToPDF(filePath, cues, projectInfo);
    } else {
      await exportToExcel(filePath, cues, projectInfo);
    }
    
    return { success: true, filePath, format };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Share via email - export and open mail app
ipcMain.handle('share:exportAndMail', async (event, { cues, projectInfo, format = 'xlsx', projectFolder = null }) => {
  try {
    const { shell } = require('electron');
    
    // Build filename
    const project = (projectInfo.project || '').replace(/[^a-zA-Z0-9]/g, '');
    const spotTitle = (projectInfo.spotTitle || 'CueSheet').replace(/[^a-zA-Z0-9]/g, '');
    const type = (projectInfo.type || '').replace(/[^a-zA-Z0-9]/g, '');
    const filenameParts = [project, spotTitle, type].filter(part => part.length > 0);
    const filename = filenameParts.join('_') || 'CueSheet';
    
    // Determine export path
    let filePath;
    if (projectFolder && fs.existsSync(projectFolder)) {
      const exportFolder = acsProject.getExportPath(projectFolder, format);
      filePath = path.join(exportFolder, `${filename}.${format}`);
    } else {
      // Use temp folder if no project folder
      const tempDir = app.getPath('temp');
      filePath = path.join(tempDir, `${filename}.${format}`);
    }
    
    // Export the file
    if (format === 'pdf') {
      await exportToPDF(filePath, cues, projectInfo);
    } else {
      await exportToExcel(filePath, cues, projectInfo);
    }
    
    // Build subject line
    const projectName = projectInfo.project || projectInfo.projectName || 'Project';
    const spotName = projectInfo.spotTitle || '';
    const subject = spotName 
      ? `Cue Sheet: ${projectName} - ${spotName}`
      : `Cue Sheet: ${projectName}`;
    
    // Open default mail client with attachment (macOS)
    // Using open command with mailto and attachment
    const { exec } = require('child_process');
    const encodedSubject = encodeURIComponent(subject);
    
    // On macOS, use open command with Mail app
    if (process.platform === 'darwin') {
      // First reveal the file, then user can drag to email
      // Or try to open Mail with the file
      exec(`open -a Mail "${filePath}"`, (err) => {
        if (err) {
          // Fallback: just reveal in Finder
          shell.showItemInFolder(filePath);
        }
      });
    } else {
      // On other platforms, just reveal the file
      shell.showItemInFolder(filePath);
    }
    
    return { 
      success: true, 
      filePath, 
      format,
      subject,
      message: 'File exported. Please attach to your email.'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Read audio file metadata
ipcMain.handle('audio:metadata', async (event, filePath) => {
  return await readAudioMetadata(filePath);
});

// Get contact for a library
ipcMain.handle('contacts:find', async (event, libraryName) => {
  const contact = findContact(libraryName);
  return contact ? { success: true, contact } : { success: false };
});

// Get all contacts
ipcMain.handle('contacts:getAll', async () => {
  return { success: true, contacts: getAllContacts() };
});

// Get contact names list
ipcMain.handle('contacts:getNames', async () => {
  return { success: true, names: getContactNames() };
});

// Import contacts from file
ipcMain.handle('contacts:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Contacts Spreadsheet',
    filters: [
      { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] }
    ],
    properties: ['openFile']
  });
  
  if (result.canceled) {
    return { success: false, canceled: true };
  }
  
  return await importContactsFromFile(result.filePaths[0]);
});

// Auto-enrich cue with contact info
ipcMain.handle('cue:enrichWithContact', async (event, cue) => {
  // Try to find contact from source/publisher/artist
  const searchTerms = [cue.source, cue.publisher, cue.artist].filter(Boolean);
  
  for (const term of searchTerms) {
    const contact = findContact(term);
    if (contact) {
      return {
        success: true,
        cue: {
          ...cue,
          masterContact: contact.formatted,
          status: 'complete'
        }
      };
    }
  }
  
  return { success: false, cue };
});

// BMG Lookup
ipcMain.handle('bmg:search', async (event, trackName) => {
  return await searchBMGTrack(trackName);
});

ipcMain.handle('bmg:enrichCue', async (event, cue) => {
  return await enrichCueFromBMG(cue);
});

ipcMain.handle('bmg:checkIfBMG', async (event, trackName) => {
  return { isBMG: looksLikeBMGTrack(trackName) };
});

// Auto-lookup: Try to find metadata from all sources
ipcMain.handle('cue:autoLookup', async (event, cue) => {
  let enrichedCue = { ...cue };
  
  // Get enabled sources
  const sources = sourcesManager.getAllSources();

  // Step 0: Check cloud track database FIRST if available (shared learned tracks)
  if (cloudTrackDatabase.isAvailable()) {
    try {
      const cloudMatch = await cloudTrackDatabase.findTrackWithStrategies(
        cue.trackName,
        cue.catalogCode,
        cue.artist
      );
      
      if (cloudMatch && cloudMatch.composer) {
        console.log(`[CloudTrackDB] Found match for "${cue.trackName}" via ${cloudMatch.matchType} (${Math.round(cloudMatch.matchConfidence * 100)}%)`);
        
        return {
          success: true,
          cue: {
            ...cue,
            composer: cloudMatch.composer,
            publisher: cloudMatch.publisher || cue.publisher,
            masterContact: cloudMatch.masterContact || cue.masterContact,
            source: cloudMatch.source || cue.source,
            composerConfidence: cloudMatch.matchConfidence,
            publisherConfidence: cloudMatch.publisher ? cloudMatch.matchConfidence : undefined,
            composerSource: 'cloud_db',
            publisherSource: cloudMatch.publisher ? 'cloud_db' : undefined,
            _fromDatabase: true,
            _fromCloud: true,
            _matchType: cloudMatch.matchType,
            _matchedBy: cloudMatch.matchedBy,
            status: (cloudMatch.composer && cloudMatch.publisher && cloudMatch.masterContact) ? 'complete' : 'pending'
          }
        };
      }
      
      // Try cloud prediction
      if (cue.catalogCode) {
        const cloudPrediction = await cloudTrackDatabase.predict(cue.catalogCode, cue.artist);
        if (cloudPrediction?.composer && cloudPrediction.composerConfidence >= 0.7) {
          console.log(`[CloudTrackDB] Pattern prediction for "${cue.trackName}": composer=${cloudPrediction.composer}`);
          enrichedCue.composer = cloudPrediction.composer;
          enrichedCue.composerConfidence = cloudPrediction.composerConfidence;
          enrichedCue.composerSource = 'cloud_pattern';
          if (cloudPrediction.publisher) {
            enrichedCue.publisher = cloudPrediction.publisher;
            enrichedCue.publisherConfidence = cloudPrediction.publisherConfidence;
            enrichedCue.publisherSource = 'cloud_pattern';
          }
        }
      }
    } catch (err) {
      console.error('[CloudTrackDB] Lookup error:', err.message);
    }
  }

  // Step 0b: Fall back to local track database (learned tracks)
  if (!enrichedCue.composer && trackDatabase) {
    try {
      const dbMatch = trackDatabase.findTrackWithStrategies(
        cue.trackName, 
        cue.catalogCode, 
        cue.artist
      );
      
      if (dbMatch && dbMatch.composer) {
        console.log(`[TrackDB] Found match for "${cue.trackName}" via ${dbMatch.matchType} (${Math.round(dbMatch.matchConfidence * 100)}%)`);
        
        return {
          success: true,
          cue: {
            ...cue,
            composer: dbMatch.composer,
            publisher: dbMatch.publisher || cue.publisher,
            masterContact: dbMatch.masterContact || cue.masterContact,
            source: dbMatch.source || cue.source,
            composerConfidence: dbMatch.matchConfidence,
            publisherConfidence: dbMatch.publisher ? dbMatch.matchConfidence : undefined,
            composerSource: 'learned_db',
            publisherSource: dbMatch.publisher ? 'learned_db' : undefined,
            _fromDatabase: true,
            _matchType: dbMatch.matchType,
            _matchedBy: dbMatch.matchedBy,
            status: (dbMatch.composer && dbMatch.publisher && dbMatch.masterContact) ? 'complete' : 'pending'
          }
        };
      }
      
      // Step 0.5: Try prediction from catalog patterns (even if no exact match)
      if (cue.catalogCode && !enrichedCue.composer) {
        const prediction = trackDatabase.predict(cue.catalogCode, cue.artist);
        if (prediction?.composer && prediction.composerConfidence >= 0.7) {
          console.log(`[TrackDB] Pattern prediction for "${cue.trackName}": composer=${prediction.composer} (${Math.round(prediction.composerConfidence * 100)}%)`);
          enrichedCue.composer = prediction.composer;
          enrichedCue.composerConfidence = prediction.composerConfidence;
          enrichedCue.composerSource = 'pattern_prediction';
          if (prediction.publisher) {
            enrichedCue.publisher = prediction.publisher;
            enrichedCue.publisherConfidence = prediction.publisherConfidence;
            enrichedCue.publisherSource = 'pattern_prediction';
          }
        }
      }
    } catch (err) {
      console.error('[TrackDB] Lookup error:', err.message);
    }
  }
  
  // Gather additional context from other sources first
  let additionalContext = {};
  
  // Step 1: Check if it looks like a BMG track (quick pattern match)
  if (sources.bmg?.enabled && looksLikeBMGTrack(cue.originalName || cue.trackName)) {
    const bmgResult = await enrichCueFromBMG(cue);
    enrichedCue._debug = enrichedCue._debug || {};
    enrichedCue._debug.bmgLookup = {
      success: bmgResult.success,
      composer: bmgResult.cue?.composer || '(not found)',
      publisher: bmgResult.cue?.publisher || '(not found)'
    };
    
    if (bmgResult.success) {
      // Only apply BMG fields if they have actual values
      enrichedCue = {
        ...enrichedCue,
        artist: bmgResult.cue.artist || enrichedCue.artist,
        source: bmgResult.cue.source || enrichedCue.source,
        trackNumber: bmgResult.cue.trackNumber || enrichedCue.trackNumber,
        masterContact: bmgResult.cue.masterContact || enrichedCue.masterContact,
        // Only set composer/publisher if BMG actually found them
        ...(bmgResult.cue.composer ? { composer: bmgResult.cue.composer } : {}),
        ...(bmgResult.cue.publisher ? { publisher: bmgResult.cue.publisher } : {})
      };
      additionalContext.bmgData = {
        trackName: bmgResult.cue.trackName,
        catalog: bmgResult.cue.source
      };
    }
  }
  
  // Detect track type BEFORE trying commercial sources
  const trackType = detectTrackType(enrichedCue);
  enrichedCue._debug = enrichedCue._debug || {};
  enrichedCue._debug.trackType = trackType;
  
  // Step 2: Try iTunes for additional context - ONLY for non-production tracks
  if (sources.itunes?.enabled && isSourceAllowedForTrack('itunes', trackType)) {
    if (isLikelyOniTunes(enrichedCue.trackName, enrichedCue.artist)) {
      try {
        const itunesResult = await enrichCueFromiTunes(enrichedCue);
        if (itunesResult.success && itunesResult.match) {
          additionalContext.iTunesData = {
            trackName: itunesResult.match.trackName,
            artistName: itunesResult.match.artistName,
            albumName: itunesResult.match.albumName
          };
          // Only use iTunes data if we don't have better data
          if (!enrichedCue.artist || enrichedCue.artist === 'Unknown') {
            enrichedCue = itunesResult.cue;
          }
        }
      } catch (err) {
        console.error('iTunes lookup error:', err);
      }
    }
  } else if (trackType === 'production' && sources.itunes?.enabled) {
    console.log('[AutoLookup] Skipping iTunes - track identified as production music');
    enrichedCue._debug.iTunesSkipped = 'production_music_track';
  }
  
  // Step 3: Search PRO databases (BMI/ASCAP) for REAL composer/publisher data
  if ((sources.bmi?.enabled || sources.ascap?.enabled) && !enrichedCue.composer) {
    try {
      // Clean the track name for better search results
      let cleanTrackName = (enrichedCue.trackName || cue.trackName || '')
        .replace(/^(BYND-|mx\s*)/i, '')  // Remove prefixes
        .replace(/\s*\(.*\)\s*$/i, '')   // Remove parenthetical suffixes
        .replace(/\s*-\s*(Stem|FX|Mix|Bass|Drums|Full).*$/i, '')  // Remove stem indicators
        .replace(/RISERS.*DROPS.*FX/i, '')  // Remove FX descriptions
        .replace(/STEM.*$/i, '')         // Remove STEM suffix
        .trim();
      
      // If we have a cleaner source name like "Ka-Pow", extract the main track name
      if (!cleanTrackName || cleanTrackName.length < 3) {
        cleanTrackName = enrichedCue.trackName || cue.trackName;
      }
      
      console.log(`[PRO Lookup] Searching for "${cleanTrackName}"...`);
      const proResult = await searchAllPROs(cleanTrackName, '');
      enrichedCue._debug = enrichedCue._debug || {};
      enrichedCue._debug.proLookup = {
        searched: true,
        searchTerm: cleanTrackName,
        hasData: proResult.hasData,
        bmi: proResult.bmi ? 'found' : 'not found',
        ascap: proResult.ascap ? 'found' : 'not found'
      };
      
      if (proResult.hasData) {
        const formattedPRO = formatPRODataForCue(proResult);
        console.log(`[PRO Lookup] Found data:`, formattedPRO);
        if (formattedPRO.composer) {
          enrichedCue.composer = formattedPRO.composer;
        }
        if (formattedPRO.publisher) {
          enrichedCue.publisher = formattedPRO.publisher;
        }
      } else {
        console.log(`[PRO Lookup] No data found for "${cleanTrackName}"`);
      }
    } catch (err) {
      console.error('[PRO Lookup] Error:', err.message);
      enrichedCue._debug = enrichedCue._debug || {};
      enrichedCue._debug.proLookup = { error: err.message };
    }
  }
  
  // Step 4: Use Claude Opus for track name cleanup and use type (NOT for composer/publisher)
  const opusStatus = isOpusEnabled();
  enrichedCue._debug = enrichedCue._debug || {};
  enrichedCue._debug.opusEnabled = opusStatus;
  
  // Only use Opus if we still need data and PRO lookup didn't find composer
  if (opusStatus && !enrichedCue.composer) {
    try {
      const opusResult = await enrichCueWithOpus(enrichedCue, additionalContext);
      // Only take non-composer/publisher fields from Opus to avoid hallucinations
      enrichedCue.trackName = opusResult.trackName || enrichedCue.trackName;
      enrichedCue.use = opusResult.use || enrichedCue.use || 'BI';
      enrichedCue._debug = {
        ...enrichedCue._debug,
        opusCalled: true,
        opusSuccess: true,
        opusData: opusResult.opusData
      };
    } catch (err) {
      enrichedCue.opusError = err.message;
      enrichedCue._debug = {
        ...enrichedCue._debug,
        opusCalled: true,
        opusSuccess: false,
        opusError: err.message
      };
    }
  } else if (!opusStatus) {
    enrichedCue._debug.opusCalled = false;
    enrichedCue._debug.reason = 'Opus not enabled or no API key';
  }
  
  // Step 5: If we have source/artist, try to find contact
  if (!enrichedCue.masterContact) {
    const searchTerms = [enrichedCue.source, enrichedCue.publisher, enrichedCue.artist].filter(Boolean);
    for (const term of searchTerms) {
      const contact = findContact(term);
      if (contact) {
        enrichedCue.masterContact = contact.formatted;
        break;
      }
    }
  }
  
  // Update status based on completeness
  const requiredFields = ['composer', 'publisher', 'masterContact'];
  const hasAllRequired = requiredFields.every(f => enrichedCue[f]);
  enrichedCue.status = hasAllRequired ? 'complete' : 'pending';
  
  return { success: true, cue: enrichedCue };
});

// Premiere Pro ticks conversion
// Premiere uses 254016000000 ticks per second
const TICKS_PER_SECOND = 254016000000;

// Parse Premiere Pro project file
async function parsePrprojFile(filePath) {
  return new Promise((resolve, reject) => {
    // Read the gzip-compressed file
    const fileBuffer = fs.readFileSync(filePath);
    
    zlib.gunzip(fileBuffer, async (err, decompressed) => {
      if (err) {
        reject(new Error('Failed to decompress project file: ' + err.message));
        return;
      }
      
      const xmlContent = decompressed.toString('utf-8');
      
      // Parse XML
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_'
      });
      
      try {
        const parsed = parser.parse(xmlContent);
        
        // Extract file paths from the XML
        const filePathsMap = extractMediaFilePaths(xmlContent);
        
        // Extract audio clips
        const audioClips = extractAudioClips(parsed, xmlContent);
        const projectName = path.basename(filePath, '.prproj');
        
        // Parse spot title from filename
        // Pattern: bea_edt_tv10_OfficialPodcastPromo_v05alt_ace_wm
        const spotTitle = parseSpotTitleFromFilename(projectName);
        
        // Step 1: Enrich clips with metadata from actual audio files (lowest priority)
        const metadataEnrichedClips = await enrichClipsWithFileMetadata(audioClips, filePathsMap);
        
        // Step 2: Enrich with learned database data (highest priority - overrides metadata)
        const fullyEnrichedClips = await enrichClipsWithLearnedData(metadataEnrichedClips);
        
        resolve({
          projectName,
          spotTitle,
          filePath,
          audioClips: fullyEnrichedClips
        });
      } catch (parseError) {
        reject(new Error('Failed to parse project XML: ' + parseError.message));
      }
    });
  });
}

// Extract media file paths from prproj XML
function extractMediaFilePaths(xmlContent) {
  const pathsMap = new Map(); // filename -> full path
  
  // Find all ActualMediaFilePath entries
  const pathPattern = /<ActualMediaFilePath>([^<]+)<\/ActualMediaFilePath>/g;
  let match;
  
  while ((match = pathPattern.exec(xmlContent)) !== null) {
    const fullPath = match[1];
    const filename = path.basename(fullPath);
    pathsMap.set(filename, fullPath);
    
    // Also store without extension for fuzzy matching
    const nameWithoutExt = filename.replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, '');
    pathsMap.set(nameWithoutExt, fullPath);
  }
  
  console.log(`[Prproj] Found ${pathsMap.size / 2} media file paths`);
  return pathsMap;
}

// Enrich clips with metadata read from actual audio files
async function enrichClipsWithFileMetadata(clips, filePathsMap) {
  console.log(`[Metadata] Enriching ${clips.length} clips with audio file metadata...`);
  
  const enrichedClips = [];
  
  // Known library names that shouldn't be treated as artist names
  const libraryNames = [
    'bmg production music', 'bmg', 'bmgpm', 'apm music', 'apm', 
    'extreme music', 'universal production music', 'musicbed', 
    'artlist', 'epidemic sound', 'audiojungle', 'killer tracks',
    'firstcom', 'music beyond', 'beyond music'
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
      if (filePathsMap.has(key)) {
        audioFilePath = filePathsMap.get(key);
        break;
      }
    }
    
    // Try to read metadata from the file if it exists
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try {
        const metadataResult = await readAudioMetadata(audioFilePath);
        
        if (metadataResult.success && metadataResult.data) {
          const md = metadataResult.data;
          console.log(`[Metadata] Found metadata for "${clip.trackName}":`, {
            title: md.title || '(none)',
            composer: md.composer || '(none)',
            artist: md.artist || '(none)',
            album: md.album || '(none)',
            publisher: md.publisher || '(none)',
            copyright: md.copyright || '(none)'
          });
          
          // Apply metadata - only if we got actual values
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
          
          // Intelligently handle artist field
          // If metadata artist is a library name, put it in label instead
          if (md.artist) {
            if (isLibraryName(md.artist)) {
              // It's a library name - use as label if we don't have one
              if (!enrichedClip.label) {
                enrichedClip.label = md.artist;
                enrichedClip.labelSource = 'file_metadata';
              }
            } else {
              // It's an actual artist name
              enrichedClip.artist = md.artist;
              enrichedClip.artistSource = 'file_metadata';
            }
          }
          
          // Use album for source if we don't have one
          if (md.album && !enrichedClip.source) {
            enrichedClip.source = md.album;
            enrichedClip.sourceSource = 'file_metadata';
          }
          
          // Track number from metadata
          if (md.trackNumber && (!enrichedClip.trackNumber || enrichedClip.trackNumber === 'N/A')) {
            enrichedClip.trackNumber = md.trackNumber;
            enrichedClip.trackNumberSource = 'file_metadata';
          }
          
          // Copyright often contains publisher info
          if (md.copyright) {
            if (!enrichedClip.publisher && md.copyright.length < 100) {
              enrichedClip.publisher = md.copyright;
              enrichedClip.publisherSource = 'file_metadata';
            }
          }
          
          // Update status if we got composer
          if (enrichedClip.composer) {
            enrichedClip.status = enrichedClip.publisher ? 'complete' : 'pending';
          }
        }
      } catch (err) {
        console.log(`[Metadata] Could not read metadata from ${audioFilePath}: ${err.message}`);
      }
    } else if (audioFilePath) {
      console.log(`[Metadata] File not found: ${audioFilePath}`);
    }
    
    enrichedClips.push(enrichedClip);
  }
  
  const enrichedCount = enrichedClips.filter(c => c.composerSource === 'file_metadata').length;
  console.log(`[Metadata] Enriched ${enrichedCount}/${clips.length} clips with file metadata`);
  
  return enrichedClips;
}

// Calculate text similarity (0-1) using trigram comparison
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (s1.length < 2 || s2.length < 2) return 0;
  
  // Generate trigrams
  const getTrigrams = (s) => {
    const trigrams = new Set();
    for (let i = 0; i <= s.length - 3; i++) {
      trigrams.add(s.substring(i, i + 3));
    }
    return trigrams;
  };
  
  const t1 = getTrigrams(s1);
  const t2 = getTrigrams(s2);
  
  // Calculate Jaccard similarity
  let intersection = 0;
  for (const t of t1) {
    if (t2.has(t)) intersection++;
  }
  
  const union = t1.size + t2.size - intersection;
  return union > 0 ? intersection / union : 0;
}

// Extract catalog code from track name (e.g., IATS021, BYND001)
function extractCatalogCode(name) {
  if (!name) return null;
  const match = name.match(/\b([A-Z]{2,}[\d]{2,})\b/i);
  return match ? match[1].toUpperCase() : null;
}

// Clean track name for comparison (remove prefixes, suffixes, catalog codes)
function cleanTrackName(name) {
  if (!name) return '';
  return name
    .replace(/^(BYND-|mx.*?_|mx_?BMGPM_)/i, '')
    .replace(/\b[A-Z]{2,}\d{2,}\b/gi, '') // Remove catalog codes
    .replace(/_/g, ' ')
    .replace(/\s*(STEM|MIX|FULL|ALT).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Detect if a track is production music or commercial music
// Production music should NOT use commercial sources (iTunes, Spotify, etc.)
function detectTrackType(clip) {
  const name = (clip.trackName || '').toLowerCase();
  const library = (clip.label || clip.library || '').toLowerCase();
  const source = (clip.source || '').toLowerCase();
  const artist = (clip.artist || '').toLowerCase();
  const filename = (clip.fileName || clip.filePath || '').toLowerCase();
  
  // Production music indicators - patterns in filenames/names
  const productionPatterns = [
    /bmgpm|bmg\s*production/i,
    /\bapm\b|apm\s*music/i,
    /extreme\s*music/i,
    /universal\s*production/i,
    /killer\s*tracks/i,
    /^mx[_\s]/i,           // mx_ prefix common in production music
    /\bmx_?bmgpm\b/i,      // mx BMGPM pattern
    /\b[A-Z]{2,4}\d{3,}\b/, // Catalog codes like IATS021, BYND001
  ];
  
  // Known production music libraries
  const productionLibraries = [
    'bmg', 'bmg production', 'bmgpm',
    'apm', 'apm music',
    'extreme', 'extreme music',
    'universal production',
    'killer tracks',
    'firstcom',
    'warner chappell production',
    'sony atv production'
  ];
  
  // Check all fields for production indicators
  const allText = `${name} ${library} ${source} ${artist} ${filename}`;
  
  // Check patterns
  for (const pattern of productionPatterns) {
    if (pattern.test(allText)) {
      return 'production';
    }
  }
  
  // Check library names
  for (const lib of productionLibraries) {
    if (allText.includes(lib)) {
      return 'production';
    }
  }
  
  // If library field is filled and contains typical production terms
  if (library && (library.includes('production') || library.includes('library'))) {
    return 'production';
  }
  
  return 'unknown'; // Could be commercial or production - allow all sources
}

// Check if a source is allowed for a given track type
function isSourceAllowedForTrack(sourceId, trackType) {
  if (trackType !== 'production') {
    return true; // All sources allowed for commercial/unknown tracks
  }
  
  // For production music, only allow production libraries, PRO databases, and AI
  const category = SOURCE_CATEGORIES[sourceId] || 'unknown';
  const allowedCategories = ['production', 'pro', 'ai'];
  
  return allowedCategories.includes(category);
}

// Get filtered sources based on track type
function getFilteredSources(allSources, trackType) {
  if (trackType !== 'production') {
    return allSources; // All sources allowed for commercial/unknown
  }
  
  // For production music, filter out commercial sources
  const filtered = {};
  for (const [id, source] of Object.entries(allSources)) {
    if (isSourceAllowedForTrack(id, trackType)) {
      filtered[id] = source;
    }
  }
  return filtered;
}

// Find best match with reasoning
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
    
    // Strategy 1: Exact name match (100%)
    if (cleanedInput === cleanedCand) {
      score = 1.0;
      reason = 'Exact track name match';
    }
    // Strategy 2: Catalog code match (95%)
    else if (inputCatalog && candCatalog && inputCatalog === candCatalog) {
      score = 0.95;
      reason = `Same catalog code (${inputCatalog}) - may be same track`;
    }
    // Strategy 3: High name similarity
    else {
      const similarity = calculateSimilarity(cleanedInput, cleanedCand);
      if (similarity >= 0.6) {
        score = 0.5 + (similarity * 0.45); // Maps 0.6-1.0 similarity to 0.77-0.95 confidence
        reason = `${Math.round(similarity * 100)}% similar name - verify this is correct`;
      }
    }
    
    // Boost if same library (but note it in reason)
    if (score > 0 && score < 1) {
      const inputLib = (trackName || '').toLowerCase();
      const candLib = (candidate.library || '').toLowerCase();
      if (candLib && (inputLib.includes('bmg') && candLib.includes('bmg') ||
                      inputLib.includes('apm') && candLib.includes('apm'))) {
        score = Math.min(score + 0.05, 0.99);
        if (!reason.includes('catalog')) {
          reason += ', same library';
        }
      }
    }
    
    // If low similarity match, make reason clearer
    if (score > 0 && score < 0.8 && !reason.includes('catalog')) {
      reason = `Partial match only - ${reason}`;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
      bestReason = reason;
    }
  }
  
  // Only return if confidence is above threshold
  if (bestScore >= 0.7) {
    return { match: bestMatch, confidence: bestScore, reason: bestReason };
  }
  
  return null;
}

// Enrich clips with learned database data (highest priority - overrides metadata/filename parsing)
// Uses CLOUD as single source of truth
async function enrichClipsWithLearnedData(clips) {
  console.log(`[LearnedDB] Checking ${clips.length} clips against cloud database...`);
  
  const enrichedClips = [];
  let matchCount = 0;
  
  // Check if cloud database is available
  if (!cloudTrackDatabase) {
    console.log('[LearnedDB] Cloud database not available, skipping learned data enrichment');
    return clips;
  }
  
  for (const clip of clips) {
    let enrichedClip = { ...clip };
    
    // Try to find this track in the database
    const trackName = clip.trackName || '';
    if (!trackName) {
      enrichedClips.push(enrichedClip);
      continue;
    }
    
    try {
      // Search cloud database with multiple strategies for better matching
      const cleanedName = cleanTrackName(trackName);
      const catalogCode = extractCatalogCode(trackName);
      
      // Get significant words for search (skip common prefixes like mx, BMGPM)
      const significantWords = cleanedName
        .split(' ')
        .filter(t => t.length > 2 && !['bmgpm', 'bmg', 'apm', 'production', 'music'].includes(t))
        .slice(0, 2);
      
      // Try multiple search strategies
      let cloudResults = [];
      
      // Strategy 1: Search by first significant word (most likely to get results)
      if (significantWords.length > 0) {
        cloudResults = await cloudTrackDatabase.getAllTracks({ 
          search: significantWords[0], 
          limit: 50 
        });
      }
      
      // Strategy 2: If no results and we have a catalog code, search by that
      if (cloudResults.length === 0 && catalogCode) {
        cloudResults = await cloudTrackDatabase.getAllTracks({ 
          search: catalogCode, 
          limit: 20 
        });
      }
      
      // Strategy 3: If still no results, try the raw track name
      if (cloudResults.length === 0) {
        const rawSearch = trackName.replace(/[^a-zA-Z0-9\s]/g, ' ').split(' ').filter(t => t.length > 3)[0];
        if (rawSearch) {
          cloudResults = await cloudTrackDatabase.getAllTracks({ 
            search: rawSearch, 
            limit: 30 
          });
        }
      }
      
      console.log(`[LearnedDB] Searching for "${trackName}" - found ${cloudResults.length} candidates`);
      
      // Find best match with smart scoring
      const result = findBestMatch(trackName, catalogCode || clip.catalogCode, cloudResults);
      
      if (result) {
        matchCount++;
        const { match: dbMatch, confidence: matchConfidence, reason: matchReason } = result;
        const matchedTrackName = dbMatch.track_name || dbMatch.trackName || 'Unknown';
        
        console.log(`[LearnedDB] ${Math.round(matchConfidence * 100)}% match: "${trackName}" → "${matchedTrackName}" (${matchReason})`);
        
        // Store match info for transparency
        enrichedClip.matchedTrack = matchedTrackName;
        enrichedClip.matchConfidence = matchConfidence;
        enrichedClip.matchReason = matchReason;
        
        // Normalize field names (cloud uses snake_case)
        const learned = {
          composer: dbMatch.composer,
          publisher: dbMatch.publisher,
          artist: dbMatch.artist,
          source: dbMatch.source,
          label: dbMatch.library,
          trackNumber: dbMatch.track_number || dbMatch.trackNumber,
          masterContact: dbMatch.master_contact || dbMatch.masterContact,
          catalogCode: dbMatch.catalog_code || dbMatch.catalogCode,
        };
        
        // Apply learned data - these OVERRIDE metadata/filename values
        // Confidence determines if user needs to approve
        if (learned.composer) {
          enrichedClip.composer = learned.composer;
          enrichedClip.composerSource = 'learned_db';
          enrichedClip.composerConfidence = matchConfidence;
          enrichedClip.composerMatchedTrack = matchedTrackName;
          enrichedClip.composerMatchReason = matchReason;
        }
        if (learned.publisher) {
          enrichedClip.publisher = learned.publisher;
          enrichedClip.publisherSource = 'learned_db';
          enrichedClip.publisherConfidence = matchConfidence;
          enrichedClip.publisherMatchedTrack = matchedTrackName;
          enrichedClip.publisherMatchReason = matchReason;
        }
        if (learned.artist) {
          enrichedClip.artist = learned.artist;
          enrichedClip.artistSource = 'learned_db';
          enrichedClip.artistConfidence = matchConfidence;
          enrichedClip.artistMatchedTrack = matchedTrackName;
          enrichedClip.artistMatchReason = matchReason;
        }
        if (learned.source) {
          enrichedClip.source = learned.source;
          enrichedClip.sourceSource = 'learned_db';
          enrichedClip.sourceConfidence = matchConfidence;
          enrichedClip.sourceMatchedTrack = matchedTrackName;
          enrichedClip.sourceMatchReason = matchReason;
        }
        if (learned.label) {
          enrichedClip.label = learned.label;
          enrichedClip.labelSource = 'learned_db';
          enrichedClip.labelConfidence = matchConfidence;
          enrichedClip.labelMatchedTrack = matchedTrackName;
          enrichedClip.labelMatchReason = matchReason;
        }
        if (learned.trackNumber && learned.trackNumber !== 'N/A') {
          enrichedClip.trackNumber = learned.trackNumber;
          enrichedClip.trackNumberSource = 'learned_db';
        }
        if (learned.masterContact) {
          enrichedClip.masterContact = learned.masterContact;
        }
        if (learned.catalogCode) {
          enrichedClip.catalogCode = learned.catalogCode;
        }
        
        // Only mark complete if exact match (100% confidence)
        // Fuzzy matches require user approval
        const isExactMatch = matchConfidence >= 1.0;
        if (enrichedClip.composer && enrichedClip.publisher && isExactMatch) {
          enrichedClip.status = 'complete';
        } else if (enrichedClip.composer && enrichedClip.publisher) {
          enrichedClip.status = 'needs_approval';
        }
      }
    } catch (err) {
      console.log(`[LearnedDB] Error looking up "${trackName}": ${err.message}`);
    }
    
    // Detect and store track type for source filtering
    enrichedClip.trackType = detectTrackType(enrichedClip);
    enrichedClip.trackTypeSource = 'auto_detect';
    
    // Apply high-confidence patterns for any remaining empty fields
    try {
      if (patternEngine.isAvailable()) {
        const patternFills = await patternEngine.applyHighConfidencePatterns(enrichedClip);
        
        for (const [field, fillData] of Object.entries(patternFills)) {
          // Only apply if field is still empty
          const currentValue = enrichedClip[field];
          if (!currentValue || currentValue.trim() === '' || currentValue === '-') {
            enrichedClip[field] = fillData.value;
            enrichedClip[`${field}Source`] = fillData.source;
            enrichedClip[`${field}Confidence`] = fillData.confidence;
            enrichedClip[`${field}PatternId`] = fillData.patternId;
            enrichedClip[`${field}PatternReason`] = fillData.reasoning;
            console.log(`[Pattern] Auto-filled ${field} = "${fillData.value}" (${Math.round(fillData.confidence * 100)}% confidence)`);
          }
        }
      }
    } catch (err) {
      console.log(`[Pattern] Error applying patterns: ${err.message}`);
    }
    
    enrichedClips.push(enrichedClip);
  }
  
  console.log(`[LearnedDB] Matched ${matchCount}/${clips.length} clips from cloud database`);
  return enrichedClips;
}

// Convert Premiere ticks to duration string (min:sec:frames)
function ticksToDuration(ticks, fps = 23.976) {
  const seconds = ticks / TICKS_PER_SECOND;
  const totalFrames = Math.round(seconds * fps);
  
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.round((seconds % 1) * fps);
  
  return {
    formatted: `${minutes}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`,
    seconds: seconds,
    frames: totalFrames
  };
}

// Parse spot title from Premiere project filename
// Examples:
// "bea_edt_tv10_OfficialPodcastPromo_v05alt_ace_wm" -> "OfficialPodcastPromo_v05alt"
// "ProjectName_SpotTitle_v01" -> "SpotTitle_v01"
function parseSpotTitleFromFilename(filename) {
  console.log('[SpotTitle] Parsing:', filename);
  
  // Remove any suffix after " - " (like " - Cue sheet testing 2")
  let name = filename.split(' - ')[0].trim();
  
  // Remove known suffixes first
  const suffixesToRemove = ['_ace_wm', '_ace', '_wm', '_final', '_mix'];
  for (const suffix of suffixesToRemove) {
    if (name.toLowerCase().endsWith(suffix)) {
      name = name.slice(0, -suffix.length);
    }
  }
  
  // Pattern: bea_edt_tv10_OfficialPodcastPromo_v05alt
  // We want: OfficialPodcastPromo_v05alt
  
  // Look for pattern: prefix_edt_tv##_SPOTTITLE (capture everything after tv##_)
  const tvMatch = name.match(/_tv\d+_(.+)$/i);
  if (tvMatch) {
    console.log('[SpotTitle] Found via tv## pattern:', tvMatch[1]);
    return tvMatch[1];
  }
  
  // Look for pattern: prefix_edt_SPOTTITLE
  const edtMatch = name.match(/_edt_(.+)$/i);
  if (edtMatch) {
    console.log('[SpotTitle] Found via edt pattern:', edtMatch[1]);
    return edtMatch[1];
  }
  
  // If there are underscores, take everything after first 2-3 parts (project code, dept, type)
  const parts = name.split('_');
  if (parts.length >= 4) {
    // Skip prefix parts (bea, edt, tv10) - find where the "content" starts
    // Usually after tv## or after 3 short parts
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
      const result = parts.slice(startIdx).join('_');
      console.log('[SpotTitle] Found via parts analysis:', result);
      return result;
    }
  }
  
  console.log('[SpotTitle] Fallback to full name:', name);
  return name;
}

// BMG Catalog code to album name mapping
const BMG_CATALOG_MAP = {
  'IATS021': 'Ka-Pow',
  'IATS': 'Ka-Pow',
  'BYND': 'FX _ Trailer FX I (BYND001)',
  'BYND001': 'FX _ Trailer FX I (BYND001)',
  // Add more catalog codes as needed
};

// Extract audio clips from parsed XML
function extractAudioClips(parsed, xmlContent) {
  const consolidatedTracks = new Map(); // baseTrackName -> track info
  
  // Audio file extensions to look for
  const audioExtensions = ['.wav', '.aif', '.aiff', '.mp3', '.m4a', '.flac'];
  
  // Extract all AudioClipTrackItem timings with their clip names
  const clipTimingsMap = new Map(); // clipName -> timing info
  
  // Find clip timings - look for AudioClipTrackItem blocks
  const audioClipPattern = /<AudioClipTrackItem[^>]*ObjectID="(\d+)"[^>]*>[\s\S]*?<Start>(\d+)<\/Start>[\s\S]*?<End>(\d+)<\/End>[\s\S]*?<\/AudioClipTrackItem>/g;
  let clipMatch;
  while ((clipMatch = audioClipPattern.exec(xmlContent)) !== null) {
    const objectId = clipMatch[1];
    const start = parseInt(clipMatch[2]);
    const end = parseInt(clipMatch[3]);
    clipTimingsMap.set(objectId, { start, end, duration: end - start });
  }
  
  // Get all unique timing durations and sort by duration (longest first for main tracks)
  const allTimings = Array.from(clipTimingsMap.values()).sort((a, b) => b.duration - a.duration);
  
  // Extract all audio file names
  const nameMatches = xmlContent.match(/<Name>([^<]+)<\/Name>/g) || [];
  
  for (const match of nameMatches) {
    const originalName = match.replace(/<\/?Name>/g, '');
    
    // Check if it's an audio file
    const isAudioFile = audioExtensions.some(ext => 
      originalName.toLowerCase().endsWith(ext)
    );
    
    // Skip non-audio files
    if (!isAudioFile) continue;
    
    // Skip free SFX (CPSFX pattern)
    if (originalName.includes('_CPSFX') || originalName.includes('CPSFX')) continue;
    
    // Skip obvious non-track names
    if (originalName === 'Root Bin' || originalName === 'Audio' || originalName === 'Balance' || 
        originalName.startsWith('z') || originalName.includes('JUNK') || originalName.includes('OLD') ||
        originalName.startsWith('*')) continue;
    
    // Parse the filename to extract track info
    const trackInfo = parseAudioFileName(originalName);
    
    if (!trackInfo) continue;
    
    // Use base track name as the key for consolidation
    const key = trackInfo.baseTrackName;
    
    // Skip if we've already seen this track
    if (consolidatedTracks.has(key)) continue;
    
    // Store the track info
    consolidatedTracks.set(key, {
      originalName,
      ...trackInfo
    });
  }
  
  // Convert to array and assign durations
  const clips = [];
  let timingIndex = 0;
  
  for (const [key, trackInfo] of consolidatedTracks) {
    // Get a timing (cycle through available timings)
    const timing = allTimings[timingIndex % allTimings.length] || { duration: 0 };
    const durationInfo = ticksToDuration(timing.duration);
    timingIndex++;
    
    clips.push({
      id: `clip-${clips.length + 1}`,
      originalName: trackInfo.originalName,
      trackName: trackInfo.displayName,
      trackNameSource: 'filename_parse',
      duration: durationInfo.formatted || '0:00:00',
      durationSource: 'premiere_import',
      durationSeconds: durationInfo.seconds || 0,
      durationFrames: durationInfo.frames || 0,
      artist: trackInfo.artist || '', // Don't default - fill from metadata or database
      artistSource: trackInfo.artist ? 'filename_parse' : null,
      label: trackInfo.library || '', // Library detected from filename pattern
      labelSource: trackInfo.library ? 'filename_parse' : null,
      source: trackInfo.source || '',
      sourceSource: trackInfo.source ? 'filename_parse' : null,
      trackNumber: 'N/A',
      composer: '',
      publisher: '',
      masterContact: '',
      use: 'BI',
      isStem: trackInfo.isStem,
      catalogCode: trackInfo.catalogCode || '',
      status: 'pending'
    });
  }
  
  return clips;
}

// Parse audio filename to extract track info, catalog codes, etc.
function parseAudioFileName(filename) {
  // Remove file extension
  const nameWithoutExt = filename.replace(/\.(wav|aif|aiff|mp3|m4a|flac)$/i, '');
  
  // Check if it's a BMG stem file
  // Pattern: BASS_mx_BMGPM_IATS021_Punch_Drunk_STEM_BASS
  const bmgStemMatch = nameWithoutExt.match(/^([A-Z]+)_mx_BMGPM_([A-Z]+\d*)_(.+?)_STEM_/i);
  if (bmgStemMatch) {
    const catalogCode = bmgStemMatch[2];
    const trackNameRaw = bmgStemMatch[3];
    const trackName = trackNameRaw.replace(/_/g, ' ').trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '', // Leave empty - will be filled from metadata or database
      library: 'BMG Production Music',
      source: BMG_CATALOG_MAP[catalogCode] || catalogCode,
      catalogCode: catalogCode,
      isStem: true
    };
  }
  
  // Check if it's a Beyond/BYND file
  // Pattern: mxBeyond-Fire Thunder Hit.aif
  const beyondMatch = nameWithoutExt.match(/^mxBeyond-(.+)$/i);
  if (beyondMatch) {
    const trackName = beyondMatch[1].trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: 'BYND-' + trackName,
      artist: '', // Leave empty - will be filled from metadata or database
      library: 'BMG Production Music',
      source: BMG_CATALOG_MAP['BYND'] || 'Beyond',
      catalogCode: 'BYND',
      isStem: false
    };
  }
  
  // Check if it's a standard BMG file (non-stem)
  // Pattern: mx_BMGPM_IATS021_Track_Name
  const bmgMatch = nameWithoutExt.match(/^mx_?BMGPM_([A-Z]+\d*)_(.+)$/i);
  if (bmgMatch) {
    const catalogCode = bmgMatch[1];
    const trackNameRaw = bmgMatch[2];
    const trackName = trackNameRaw.replace(/_/g, ' ').trim();
    
    return {
      baseTrackName: trackName.toLowerCase(),
      displayName: trackName,
      artist: '', // Leave empty - will be filled from metadata or database
      library: 'BMG Production Music',
      source: BMG_CATALOG_MAP[catalogCode] || catalogCode,
      catalogCode: catalogCode,
      isStem: false
    };
  }
  
  // Generic audio file - just clean up the name
  const cleanName = nameWithoutExt
    .replace(/^mx_?/i, '')
    .replace(/_/g, ' ')
    .trim();
  
  if (cleanName.length > 0) {
    return {
      baseTrackName: cleanName.toLowerCase(),
      displayName: cleanName,
      artist: '',
      source: '',
      catalogCode: '',
      isStem: false
    };
  }
  
  return null;
}

// Export cues to Excel file (matching the exact template format from CSV)
async function exportToExcel(filePath, cues, projectInfo) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Cue Sheet');
  
  // Set column widths to match template
  sheet.columns = [
    { width: 5 },   // A - Index
    { width: 25 },  // B - Track Name
    { width: 20 },  // C - Cue Length
    { width: 20 },  // D - Artist
    { width: 25 },  // E - Source
    { width: 10 },  // F - Track #
    { width: 30 },  // G - Composer
    { width: 35 },  // H - Publisher
    { width: 35 },  // I - Master/Contact
    { width: 8 },   // J - Use
  ];
  
  // Project info header (matching CSV format)
  sheet.getCell('A3').value = 'Project:';
  sheet.getCell('B3').value = projectInfo.project || '';
  sheet.getCell('A3').font = { bold: true };
  
  sheet.getCell('A4').value = 'Spot Title:';
  sheet.getCell('B4').value = projectInfo.spotTitle || '';
  sheet.getCell('A4').font = { bold: true };
  
  sheet.getCell('A5').value = 'Type:';
  sheet.getCell('B5').value = projectInfo.type || '';
  sheet.getCell('A5').font = { bold: true };
  
  sheet.getCell('D5').value = 'DATE PREPARED:';
  sheet.getCell('E5').value = projectInfo.datePrepared || new Date().toLocaleDateString('en-US', { 
    month: 'numeric', 
    day: 'numeric', 
    year: '2-digit' 
  }).replace(/\//g, '.');
  sheet.getCell('D5').font = { bold: true };
  
  // Column headers (Row 7)
  const headerRow = 7;
  const headers = [
    '', 
    'Track Name', 
    'Cue Length (min:sec;frames)', 
    'Artist', 
    'Source',
    'Track #', 
    'Composer', 
    'Publisher', 
    'Master/ Record Label/ Music Library', 
    'Use'
  ];
  
  headers.forEach((header, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.border = {
      bottom: { style: 'thin' }
    };
  });
  
  // Add cue data (starting at row 9, with blank row 8)
  cues.forEach((cue, index) => {
    const row = headerRow + 2 + index;
    
    // Index
    sheet.getCell(row, 1).value = index + 1;
    
    // Track Name
    sheet.getCell(row, 2).value = cue.trackName;
    
    // Cue Length - format as min:sec (without leading zero on minutes)
    let durationStr = cue.duration || '0:00';
    // Convert from min:sec:frames to min:sec format if needed
    if (durationStr.split(':').length === 3) {
      const parts = durationStr.split(':');
      const mins = parseInt(parts[0]);
      const secs = parseInt(parts[1]);
      durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    sheet.getCell(row, 3).value = durationStr;
    
    // Artist
    sheet.getCell(row, 4).value = cue.artist || '';
    
    // Source
    sheet.getCell(row, 5).value = cue.source || '';
    
    // Track #
    sheet.getCell(row, 6).value = cue.trackNumber || 'N/A';
    
    // Composer
    sheet.getCell(row, 7).value = cue.composer || '';
    
    // Publisher
    sheet.getCell(row, 8).value = cue.publisher || '';
    
    // Master/Contact - format with line breaks like in the CSV
    let masterContact = cue.masterContact || '';
    if (masterContact) {
      sheet.getCell(row, 9).value = masterContact;
      sheet.getCell(row, 9).alignment = { wrapText: true };
    }
    
    // Use
    sheet.getCell(row, 10).value = cue.use || 'BI';
  });
  
  // Apply styling to data rows
  for (let i = 0; i < cues.length; i++) {
    const row = headerRow + 2 + i;
    for (let col = 1; col <= 10; col++) {
      const cell = sheet.getCell(row, col);
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFE0E0E0' } }
      };
    }
  }
  
  await workbook.xlsx.writeFile(filePath);
}

// Export cue sheet to PDF
async function exportToPDF(filePath, cues, projectInfo) {
  // Create a hidden window to render the PDF
  const pdfWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  
  // Generate HTML content for the cue sheet
  const htmlContent = generateCueSheetHTML(cues, projectInfo);
  
  // Load the HTML content
  await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
  
  // Wait for content to render
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Generate PDF
  const pdfData = await pdfWindow.webContents.printToPDF({
    pageSize: 'Letter',
    landscape: true,
    printBackground: true,
    margins: {
      top: 0.4,
      bottom: 0.4,
      left: 0.4,
      right: 0.4
    }
  });
  
  // Write to file
  fs.writeFileSync(filePath, pdfData);
  
  // Close the window
  pdfWindow.close();
}

// Generate HTML for PDF export
function generateCueSheetHTML(cues, projectInfo) {
  const dateStr = projectInfo.datePrepared || new Date().toLocaleDateString('en-US', { 
    month: 'numeric', 
    day: 'numeric', 
    year: '2-digit' 
  }).replace(/\//g, '.');
  
  const rows = cues.map((cue, index) => {
    let durationStr = cue.duration || '0:00';
    if (durationStr.split(':').length === 3) {
      const parts = durationStr.split(':');
      const mins = parseInt(parts[0]);
      const secs = parseInt(parts[1]);
      durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    return `
      <tr>
        <td class="idx">${index + 1}</td>
        <td class="track">${escapeHtml(cue.trackName || '')}</td>
        <td class="duration">${durationStr}</td>
        <td>${escapeHtml(cue.artist || '')}</td>
        <td>${escapeHtml(cue.source || '')}</td>
        <td class="tracknum">${escapeHtml(cue.trackNumber || 'N/A')}</td>
        <td>${escapeHtml(cue.composer || '')}</td>
        <td>${escapeHtml(cue.publisher || '')}</td>
        <td>${escapeHtml(cue.label || '')}</td>
        <td>${escapeHtml(cue.masterContact || '')}</td>
        <td class="use">${escapeHtml(cue.use || 'BI')}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 9px;
          padding: 20px;
          color: #333;
        }
        .header { margin-bottom: 15px; }
        .header h1 { font-size: 16px; margin-bottom: 8px; color: #1a1a1a; }
        .meta { display: flex; gap: 30px; margin-bottom: 10px; }
        .meta-item { }
        .meta-item label { font-weight: bold; margin-right: 5px; }
        table { width: 100%; border-collapse: collapse; font-size: 8px; }
        th { 
          background: #f0f0f0; 
          padding: 6px 4px; 
          text-align: left; 
          font-weight: bold;
          border-bottom: 2px solid #333;
          white-space: nowrap;
        }
        td { 
          padding: 5px 4px; 
          border-bottom: 1px solid #e0e0e0;
          vertical-align: top;
        }
        tr:nth-child(even) { background: #fafafa; }
        .idx { width: 25px; text-align: center; }
        .track { min-width: 100px; }
        .duration { width: 50px; text-align: center; }
        .tracknum { width: 45px; text-align: center; }
        .use { width: 30px; text-align: center; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>CUE SHEET</h1>
        <div class="meta">
          <div class="meta-item"><label>Project:</label>${escapeHtml(projectInfo.project || '')}</div>
          <div class="meta-item"><label>Spot Title:</label>${escapeHtml(projectInfo.spotTitle || '')}</div>
          <div class="meta-item"><label>Type:</label>${escapeHtml(projectInfo.type || '')}</div>
          <div class="meta-item"><label>Date:</label>${dateStr}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th class="idx">#</th>
            <th>Track Name</th>
            <th class="duration">Length</th>
            <th>Artist</th>
            <th>Source</th>
            <th class="tracknum">Track #</th>
            <th>Composer</th>
            <th>Publisher</th>
            <th>Label</th>
            <th>Master/Contact</th>
            <th class="use">Use</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </body>
    </html>
  `;
}

// Escape HTML entities
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ==========================================
// Project Management IPC Handlers
// ==========================================

ipcMain.handle('projects:getAll', async () => {
  return projectStore.getAllProjects();
});

ipcMain.handle('projects:createFolder', async (event, parentId, name) => {
  return projectStore.createFolder(parentId, name || 'New Folder');
});

// Legacy compatibility
ipcMain.handle('projects:create', async (event, name) => {
  return projectStore.createFolder(null, name);
});

ipcMain.handle('projects:createSpot', async (event, parentId, name) => {
  return projectStore.createFolder(parentId, name);
});

ipcMain.handle('projects:createCueSheet', async (event, parentId, name) => {
  return projectStore.createCueSheet(parentId, name);
});

ipcMain.handle('projects:rename', async (event, id, newName) => {
  return projectStore.renameItem(id, newName);
});

ipcMain.handle('projects:delete', async (event, id) => {
  return projectStore.deleteItem(id);
});

ipcMain.handle('projects:duplicate', async (event, id) => {
  return projectStore.duplicateItem(id);
});

ipcMain.handle('projects:move', async (event, itemId, newParentId) => {
  return projectStore.moveItem(itemId, newParentId);
});

ipcMain.handle('shell:revealInFinder', async (event, filePath) => {
  const { shell } = require('electron');
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('projects:getCueSheet', async (event, id) => {
  return projectStore.getCueSheet(id);
});

ipcMain.handle('projects:getParentFolderName', async (event, id) => {
  return projectStore.getParentFolderName(id);
});

ipcMain.handle('projects:updateCueSheet', async (event, id, data) => {
  return projectStore.updateCueSheet(id, data);
});

ipcMain.handle('projects:importPrproj', async (event, filePath, prprojData, projectFolder = null) => {
  // If projectFolder is provided, copy the file to Imports folder
  let importedFilePath = filePath;
  if (projectFolder) {
    const copyResult = acsProject.copyToImports(projectFolder, filePath);
    if (copyResult.success) {
      importedFilePath = copyResult.path;
    }
  }
  
  // Import at root level (parentId = null)
  return projectStore.importPrprojAsCueSheet(null, {
    filePath: importedFilePath,
    projectName: prprojData.projectName || path.basename(filePath, '.prproj'),
    spotTitle: prprojData.spotTitle,
    audioClips: prprojData.audioClips || []
  });
});

// Get the demo project file path for guided tour
ipcMain.handle('tour:getDemoProjectPath', async () => {
  const demoPath = path.join(__dirname, 'resources', 'demo-project.prproj');
  const fs = require('fs');
  if (fs.existsSync(demoPath)) {
    return demoPath;
  }
  return null;
});

// ==========================================
// ACS Project File IPC Handlers (.acs files)
// ==========================================

ipcMain.handle('acs:new', async () => {
  // Show folder picker for project location
  const folderResult = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Project Location',
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (folderResult.canceled || !folderResult.filePaths.length) {
    return { success: false, canceled: true };
  }
  
  const basePath = folderResult.filePaths[0];
  
  // Prompt for project name
  // For now, use a simple approach - generate name from timestamp or use default
  // In production, you might want to show a dialog for the name
  const projectName = `Project_${new Date().toISOString().split('T')[0]}`;
  
  // Create folder structure
  const result = acsProject.createProjectFolder(basePath, projectName);
  
  if (result.success) {
    // Load the project data into the project store
    projectStore.loadFromACS(result.data);
  }
  
  return result;
});

ipcMain.handle('acs:newWithName', async (event, projectName) => {
  // Show folder picker for project location
  const folderResult = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose Project Location',
    properties: ['openDirectory', 'createDirectory']
  });
  
  if (folderResult.canceled || !folderResult.filePaths.length) {
    return { success: false, canceled: true };
  }
  
  const basePath = folderResult.filePaths[0];
  
  // Create folder structure with provided name
  const result = acsProject.createProjectFolder(basePath, projectName || 'Untitled Project');
  
  if (result.success) {
    // Load the project data into the project store
    projectStore.loadFromACS(result.data);
  }
  
  return result;
});

ipcMain.handle('acs:open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Auris Project',
    filters: [
      { name: 'Auris Cue Sheet', extensions: ['acs'] }
    ],
    properties: ['openFile']
  });
  
  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true };
  }
  
  const filePath = result.filePaths[0];
  const loadResult = acsProject.loadProject(filePath);
  
  if (loadResult.success) {
    // Load the project data into the project store
    projectStore.loadFromACS(loadResult.data);
  }
  
  return loadResult;
});

ipcMain.handle('acs:openPath', async (event, filePath) => {
  const loadResult = acsProject.loadProject(filePath);
  
  if (loadResult.success) {
    // Load the project data into the project store
    projectStore.loadFromACS(loadResult.data);
  }
  
  return loadResult;
});

ipcMain.handle('acs:save', async (event, filePath) => {
  // Get current state from project store
  const state = projectStore.getState();
  
  if (!filePath) {
    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Auris Project',
      defaultPath: state.name ? `${state.name}.acs` : 'Untitled.acs',
      filters: [
        { name: 'Auris Cue Sheet', extensions: ['acs'] }
      ]
    });
    
    if (result.canceled) {
      return { success: false, canceled: true };
    }
    
    filePath = result.filePath;
  }
  
  return acsProject.saveProject(filePath, {
    name: state.name || path.basename(filePath, '.acs'),
    items: state.items,
    activeItemId: state.activeItemId,
    createdAt: state.createdAt
  });
});

ipcMain.handle('acs:saveAs', async () => {
  const state = projectStore.getState();
  
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Auris Project As',
    defaultPath: state.name ? `${state.name}.acs` : 'Untitled.acs',
    filters: [
      { name: 'Auris Cue Sheet', extensions: ['acs'] }
    ]
  });
  
  if (result.canceled) {
    return { success: false, canceled: true };
  }
  
  return acsProject.saveProject(result.filePath, {
    name: path.basename(result.filePath, '.acs'),
    items: state.items,
    activeItemId: state.activeItemId,
    createdAt: state.createdAt
  });
});

ipcMain.handle('acs:getRecent', async () => {
  return acsProject.validateRecentProjects();
});

ipcMain.handle('acs:removeFromRecent', async (event, filePath) => {
  return acsProject.removeFromRecent(filePath);
});

ipcMain.handle('acs:clearAllRecent', async () => {
  return acsProject.clearAllRecent();
});

// ==========================================
// Sources Management IPC Handlers
// ==========================================

ipcMain.handle('sources:getAll', async () => {
  return sourcesManager.getAllSources();
});

ipcMain.handle('sources:updateConfig', async (event, sourceId, config) => {
  return sourcesManager.updateSourceConfig(sourceId, config);
});

ipcMain.handle('sources:toggle', async (event, sourceId, enabled) => {
  return sourcesManager.toggleSource(sourceId, enabled);
});

ipcMain.handle('sources:testConnection', async (event, sourceId) => {
  return sourcesManager.testConnection(sourceId);
});

ipcMain.handle('sources:testAll', async () => {
  return sourcesManager.testAllConnections();
});

// ==========================================
// iTunes Lookup IPC Handlers
// ==========================================

ipcMain.handle('itunes:search', async (event, trackName, artistName) => {
  return searchiTunes(trackName, artistName);
});

ipcMain.handle('itunes:enrich', async (event, cue) => {
  return enrichCueFromiTunes(cue);
});

// ==========================================
// Claude Opus IPC Handlers
// ==========================================

ipcMain.handle('opus:isEnabled', async () => {
  return isOpusEnabled();
});

ipcMain.handle('opus:enrich', async (event, cue, context) => {
  if (!isOpusEnabled()) {
    return { success: false, error: 'Claude Opus not enabled or configured' };
  }
  try {
    const enriched = await enrichCueWithOpus(cue, context || {});
    return { success: true, cue: enriched };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('opus:lookupPRO', async (event, trackName, artistName) => {
  if (!isOpusEnabled()) {
    return { success: false, error: 'Claude Opus not enabled or configured' };
  }
  try {
    const result = await lookupPROData(trackName, artistName);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('opus:detectUse', async (event, trackName, context) => {
  if (!isOpusEnabled()) {
    return 'BI'; // Default
  }
  try {
    return await detectUseType(trackName, context || {});
  } catch (error) {
    return 'BI'; // Default on error
  }
});

ipcMain.handle('opus:enrichBatch', async (event, cues) => {
  if (!isOpusEnabled()) {
    return { success: false, error: 'Claude Opus not enabled or configured' };
  }
  try {
    const enriched = await enrichMultipleCues(cues);
    return { success: true, cues: enriched };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Extract track data from any webpage using Opus AI
ipcMain.handle('extract:withOpus', async (event, pageText, pageUrl) => {
  if (!isOpusEnabled()) {
    return { success: false, error: 'Claude Opus not enabled. Add your API key in Settings.' };
  }
  
  console.log('[Opus Extract] Extracting from page:', pageUrl);
  console.log('[Opus Extract] Page text length:', pageText?.length || 0);
  
  try {
    const { callOpus, parseOpusJson } = require('./opus-engine');
    
    const systemPrompt = `You are a music metadata extraction specialist. Extract track information from webpage text.
    
CRITICAL RULES:
- Only extract information that is EXPLICITLY stated on the page
- NEVER guess or hallucinate data - if not found, return empty string
- Format composer/publisher with PRO and share percentage when available: "Name (PRO)(Share%)"
- PROs include: ASCAP, BMI, SESAC, PRS, GEMA, SACEM, SOCAN, APRA
- If multiple composers/publishers, separate with commas
- LABEL is the record label (e.g., "Music Beyond", "BMG Production Music")
- MASTER CONTACT is who to contact for master rights (often different from label)

Return ONLY valid JSON, no explanation.`;

    const userPrompt = `Extract music track metadata from this webpage.

Return JSON with these exact fields (use empty string "" if not found):
{
  "trackName": "song/track title",
  "composer": "writer/composer name(s) with PRO and share, e.g. Robin Hall (ASCAP)(100%)",
  "publisher": "publisher name(s) with PRO and share",
  "label": "record label (the LABEL field on the page, e.g. Music Beyond)",
  "masterContact": "master rights contact if different from label",
  "album": "album/collection name",
  "albumCode": "catalog number if present"
}

Page URL: ${pageUrl || 'unknown'}

Page content:
${pageText?.substring(0, 8000) || 'No content provided'}`;

    const response = await callOpus(systemPrompt, userPrompt, 1024);
    console.log('[Opus Extract] Raw response:', response);
    
    const data = parseOpusJson(response);
    console.log('[Opus Extract] Parsed data:', data);
    
    // Validate we got something useful
    if (!data.trackName && !data.composer && !data.publisher) {
      return {
        success: false,
        error: 'Could not find track metadata on this page. Make sure you are on a track detail page.',
        data
      };
    }
    
    return { success: true, data };
    
  } catch (error) {
    console.error('[Opus Extract] Error:', error);
    return { success: false, error: error.message };
  }
});

// ==========================================
// PRO Lookup IPC Handlers
// ==========================================

ipcMain.handle('pro:search', async (event, trackName, artistName) => {
  try {
    const result = await searchAllPROs(trackName, artistName);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pro:format', async (event, proData) => {
  return formatPRODataForCue(proData);
});

// ==========================================
// Browser Control IPC Handlers (Puppeteer)
// ==========================================

let puppeteerScraper;
try {
  puppeteerScraper = require('./puppeteer-scraper');
} catch (e) {
  console.log('[Main] Puppeteer scraper not available:', e.message);
  puppeteerScraper = null;
}

ipcMain.handle('browser:openForManual', async (event, url, trackInfo) => {
  if (!puppeteerScraper) {
    return { success: false, error: 'Browser automation not available' };
  }
  try {
    return await puppeteerScraper.showBrowserForManual(url, trackInfo);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser:close', async () => {
  if (!puppeteerScraper) return { success: true };
  try {
    await puppeteerScraper.closeBrowser();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser:navigate', async (event, url) => {
  if (!puppeteerScraper) {
    return { success: false, error: 'Browser automation not available' };
  }
  try {
    return await puppeteerScraper.navigateTo(url);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser:getContent', async () => {
  if (!puppeteerScraper) {
    return null;
  }
  try {
    return await puppeteerScraper.getPageContent();
  } catch (error) {
    console.error('[Browser] Get content error:', error.message);
    return null;
  }
});

ipcMain.handle('browser:extractBMG', async () => {
  if (!puppeteerScraper) {
    return { success: false, error: 'Browser automation not available' };
  }
  try {
    return await puppeteerScraper.extractBMGTrackData();
  } catch (error) {
    console.error('[Browser] Extract BMG error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser:searchBMG', async (event, trackName) => {
  if (!puppeteerScraper) {
    return { success: false, error: 'Browser automation not available' };
  }
  try {
    return await puppeteerScraper.searchBMG(trackName);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser:isActive', async () => {
  if (!puppeteerScraper) return false;
  return puppeteerScraper.isBrowserActive();
});

// ==========================================
// Track Database IPC Handlers
// ==========================================

let trackDatabase;
try {
  trackDatabase = require('./track-database').trackDatabase;
} catch (e) {
  console.log('[Main] Track database not available:', e.message);
  trackDatabase = null;
}

ipcMain.handle('trackdb:find', async (event, trackName, catalogCode, library) => {
  if (!trackDatabase) return null;
  try {
    return trackDatabase.findTrack(trackName, catalogCode, library);
  } catch (error) {
    console.error('[TrackDB] Find error:', error.message);
    return null;
  }
});

ipcMain.handle('trackdb:save', async (event, track) => {
  let localSuccess = false;
  let cloudSuccess = false;
  let embeddingGenerated = false;
  
  // Save to local database
  if (trackDatabase) {
    try {
      trackDatabase.saveTrack(track);
      localSuccess = true;
    } catch (error) {
      console.error('[TrackDB] Local save error:', error.message);
    }
  }
  
  // Also save to cloud database if available
  if (cloudTrackDatabase.isAvailable()) {
    try {
      cloudSuccess = await cloudTrackDatabase.saveTrack(track);
      
      // Auto-generate vector embedding for fast lookups
      if (cloudSuccess && voyageEngine?.isAvailable()) {
        try {
          // Get the saved track's ID from Supabase to update with embedding
          const { supabase } = supabaseClient;
          const { data: savedTrack } = await supabase
            .from('tracks')
            .select('id, track_name')
            .eq('track_name', track.trackName)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();
          
          if (savedTrack) {
            embeddingGenerated = await voyageEngine.embedAndStoreTrack(savedTrack);
            if (embeddingGenerated) {
              console.log(`[TrackDB] Auto-embedded: ${track.trackName}`);
            }
          }
        } catch (embedError) {
          console.error('[TrackDB] Auto-embed error:', embedError.message);
        }
      }
    } catch (error) {
      console.error('[CloudTrackDB] Cloud save error:', error.message);
    }
  }
  
  return { success: localSuccess || cloudSuccess, local: localSuccess, cloud: cloudSuccess, embedded: embeddingGenerated };
});

ipcMain.handle('trackdb:predict', async (event, catalogCode, library) => {
  if (!trackDatabase) return null;
  try {
    return trackDatabase.predict(catalogCode, library);
  } catch (error) {
    console.error('[TrackDB] Predict error:', error.message);
    return null;
  }
});

ipcMain.handle('trackdb:autocomplete', async (event, field, query) => {
  if (!trackDatabase) return [];
  try {
    return trackDatabase.getAutocompleteSuggestions(field, query, 10);
  } catch (error) {
    console.error('[TrackDB] Autocomplete error:', error.message);
    return [];
  }
});

ipcMain.handle('trackdb:stats', async () => {
  if (!trackDatabase) return { tracks: 0, verified: 0, patterns: 0, aliases: 0 };
  try {
    return trackDatabase.getStats();
  } catch (error) {
    return { tracks: 0, verified: 0, patterns: 0, aliases: 0 };
  }
});

ipcMain.handle('trackdb:export', async () => {
  if (!trackDatabase) return null;
  try {
    return trackDatabase.exportToJson();
  } catch (error) {
    return null;
  }
});

// Sync all local tracks to cloud (Supabase)
ipcMain.handle('trackdb:syncToCloud', async (event) => {
  if (!trackDatabase) {
    return { success: false, error: 'Local database not available' };
  }
  if (!cloudTrackDatabase.isAvailable()) {
    return { success: false, error: 'Cloud database not available' };
  }
  
  try {
    // Get all local tracks
    const localTracks = trackDatabase.getAllTracks('', 10000, 0);
    console.log(`[TrackDB] Syncing ${localTracks.length} local tracks to cloud...`);
    
    let synced = 0;
    let embedded = 0;
    const total = localTracks.length;
    
    for (const track of localTracks) {
      try {
        // Save to cloud
        const cloudSuccess = await cloudTrackDatabase.saveTrack({
          trackName: track.trackName,
          catalogCode: track.catalogCode,
          library: track.library,
          artist: track.artist,
          source: track.source,
          composer: track.composer,
          publisher: track.publisher,
          masterContact: track.masterContact,
          useType: track.useType,
          duration: track.duration,
          confidence: track.confidence || 1.0,
          dataSource: track.dataSource || 'synced',
          verified: true
        });
        
        if (cloudSuccess) {
          synced++;
          
          // Auto-embed if Voyage is available
          if (voyageEngine?.isAvailable()) {
            try {
              const { supabase } = supabaseClient;
              const { data: savedTrack } = await supabase
                .from('tracks')
                .select('id, track_name')
                .eq('track_name', track.trackName)
                .order('updated_at', { ascending: false })
                .limit(1)
                .single();
              
              if (savedTrack) {
                const embedSuccess = await voyageEngine.embedAndStoreTrack(savedTrack);
                if (embedSuccess) embedded++;
              }
            } catch (e) {
              // Continue even if embedding fails
            }
          }
        }
        
        // Send progress
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('trackdb:syncProgress', { synced, embedded, total });
        }
      } catch (e) {
        console.error(`[TrackDB] Error syncing track ${track.trackName}:`, e.message);
      }
    }
    
    console.log(`[TrackDB] Sync complete: ${synced}/${total} synced, ${embedded} embedded`);
    return { success: true, synced, embedded, total };
  } catch (error) {
    console.error('[TrackDB] Sync error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('trackdb:import', async (event, data) => {
  if (!trackDatabase) return { success: false };
  try {
    const result = trackDatabase.importFromJson(data);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('trackdb:getAll', async (event, { search = '', limit = 500, offset = 0 } = {}) => {
  if (!trackDatabase) return [];
  try {
    return trackDatabase.getAllTracks(search, limit, offset);
  } catch (error) {
    console.error('[TrackDB] GetAll error:', error.message);
    return [];
  }
});

ipcMain.handle('trackdb:delete', async (event, trackId) => {
  if (!trackDatabase) return { success: false };
  try {
    return trackDatabase.deleteTrack(trackId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('trackdb:clearAll', async () => {
  if (!trackDatabase) return { success: false };
  try {
    return trackDatabase.clearAll();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==========================================
// Natural Language IPC Handlers
// ==========================================

let naturalLanguage;
try {
  naturalLanguage = require('./natural-language');
} catch (e) {
  console.log('[Main] Natural language not available:', e.message);
  naturalLanguage = null;
}

ipcMain.handle('nl:parse', async (event, input, context) => {
  if (!naturalLanguage) {
    return { action: 'unknown', confidence: 0 };
  }
  try {
    return await naturalLanguage.parseCorrection(input, context);
  } catch (error) {
    return { action: 'unknown', confidence: 0, error: error.message };
  }
});

ipcMain.handle('nl:apply', async (event, tracks, correction) => {
  if (!naturalLanguage) {
    return { updates: [], error: 'Natural language not available' };
  }
  try {
    return naturalLanguage.applyCorrection(tracks, correction);
  } catch (error) {
    return { updates: [], error: error.message };
  }
});

ipcMain.handle('nl:suggest', async (event, tracks) => {
  if (!naturalLanguage) return [];
  try {
    return naturalLanguage.suggestCorrections(tracks);
  } catch (error) {
    return [];
  }
});

// ==========================================
// Batch Analysis IPC Handlers
// ==========================================

let batchAnalysis;
try {
  batchAnalysis = require('./batch-analysis');
} catch (e) {
  console.log('[Main] Batch analysis not available:', e.message);
  batchAnalysis = null;
}

ipcMain.handle('batch:analyze', async (event, cues) => {
  if (!batchAnalysis) {
    return { patterns: [], suggestions: [] };
  }
  try {
    return await batchAnalysis.analyzeBatch(cues);
  } catch (error) {
    return { patterns: [], suggestions: [], error: error.message };
  }
});

ipcMain.handle('batch:applyPattern', async (event, cues, pattern) => {
  if (!batchAnalysis) {
    return { success: false, error: 'Batch analysis not available' };
  }
  try {
    return batchAnalysis.applyPattern(cues, pattern);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==========================================
// Smart Batch Lookup IPC Handlers
// ==========================================

let batchLookup;
try {
  batchLookup = require('./batch-lookup');
} catch (e) {
  console.log('[Main] Batch lookup not available:', e.message);
  batchLookup = null;
}

ipcMain.handle('batchLookup:start', async (event, tracks) => {
  if (!batchLookup) {
    return { success: false, error: 'Batch lookup not available' };
  }
  try {
    // Send progress updates to renderer
    const onProgress = (current, total, trackName, result) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('batchLookup:progress', { current, total, trackName, result });
      }
    };
    
    return await batchLookup.startBatchLookup(tracks, onProgress);
  } catch (error) {
    console.error('[BatchLookup] Start error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batchLookup:cancel', async () => {
  if (!batchLookup) return { success: false };
  try {
    batchLookup.cancelBatchLookup();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batchLookup:getProgress', async () => {
  if (!batchLookup) return { isRunning: false, current: 0, total: 0 };
  try {
    return batchLookup.getProgress();
  } catch (error) {
    return { isRunning: false, current: 0, total: 0 };
  }
});

ipcMain.handle('batchLookup:getResults', async () => {
  if (!batchLookup) return [];
  try {
    return batchLookup.getResults();
  } catch (error) {
    return [];
  }
});

ipcMain.handle('batchLookup:apply', async (event, selectedResultIds, cues) => {
  if (!batchLookup) {
    return { success: false, error: 'Batch lookup not available' };
  }
  try {
    const updatedCues = batchLookup.applyResults(selectedResultIds, cues);
    return { success: true, cues: updatedCues };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('batchLookup:getTracksWithMissingData', async (event, cues) => {
  if (!batchLookup) return [];
  try {
    return batchLookup.getTracksWithMissingData(cues);
  } catch (error) {
    return [];
  }
});

// ==========================================
// Authentication IPC Handlers (Supabase)
// ==========================================

ipcMain.handle('auth:isConfigured', async () => {
  return supabaseClient.isConfigured();
});

ipcMain.handle('auth:getSession', async () => {
  try {
    return await supabaseClient.getSession();
  } catch (error) {
    console.error('[Auth] Get session error:', error.message);
    return null;
  }
});

ipcMain.handle('auth:getUser', async () => {
  try {
    return await supabaseClient.getCurrentUser();
  } catch (error) {
    console.error('[Auth] Get user error:', error.message);
    return null;
  }
});

ipcMain.handle('auth:signIn', async (event, email, password) => {
  try {
    const result = await supabaseClient.signIn(email, password);
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, user: result.data?.user, session: result.data?.session };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:signUp', async (event, email, password) => {
  try {
    const result = await supabaseClient.signUp(email, password);
    if (result.error) {
      return { success: false, error: result.error.message };
    }
    return { success: true, user: result.data?.user, session: result.data?.session };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:signOut', async () => {
  try {
    await supabaseClient.signOut();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:isAdmin', async () => {
  try {
    return await supabaseClient.isAdmin();
  } catch (error) {
    console.error('[Auth] Is admin error:', error.message);
    return false;
  }
});

ipcMain.handle('auth:verifyAdminPassword', async (event, password) => {
  try {
    const success = supabaseClient.verifyAdminPassword(password);
    return { success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('auth:exitAdminMode', async () => {
  try {
    supabaseClient.exitAdminMode();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Set up auth state change listener
if (supabaseClient.isConfigured()) {
  supabaseClient.onAuthStateChange((event, session) => {
    console.log('[Auth] State change:', event);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auth:stateChange', { event, session });
    }
  });
}

// ==========================================
// Cloud Data Sources IPC Handlers
// ==========================================

ipcMain.handle('cloudSources:getAll', async () => {
  try {
    return await cloudSourcesManager.getSources();
  } catch (error) {
    console.error('[CloudSources] GetAll error:', error.message);
    return cloudSourcesManager.getDefaultSources();
  }
});

ipcMain.handle('cloudSources:update', async (event, sourceId, updates) => {
  try {
    return await cloudSourcesManager.updateSource(sourceId, updates);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloudSources:add', async (event, source) => {
  try {
    return await cloudSourcesManager.addSource(source);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloudSources:delete', async (event, sourceId) => {
  try {
    return await cloudSourcesManager.deleteSource(sourceId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloudSources:toggle', async (event, sourceId, enabled) => {
  try {
    return await cloudSourcesManager.toggleSource(sourceId, enabled);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloudSources:setLocalConfig', async (event, sourceId, config) => {
  try {
    cloudSourcesManager.setLocalConfig(sourceId, config);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Subscribe to sources changes and forward to renderer
if (supabaseClient.isConfigured()) {
  cloudSourcesManager.subscribeToSources((change) => {
    console.log('[CloudSources] Change:', change.type);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cloudSources:change', change);
    }
  });
}

// ==========================================
// Cloud Track Database IPC Handlers
// ==========================================

ipcMain.handle('cloudTrack:find', async (event, trackName, catalogCode, library) => {
  try {
    return await cloudTrackDatabase.findTrack(trackName, catalogCode, library);
  } catch (error) {
    console.error('[CloudTrack] Find error:', error.message);
    return null;
  }
});

ipcMain.handle('cloudTrack:save', async (event, track) => {
  try {
    const result = await cloudTrackDatabase.saveTrack(track);
    let embedded = false;
    
    // Auto-generate vector embedding
    if (result && voyageEngine?.isAvailable()) {
      try {
        const { supabase } = supabaseClient;
        const { data: savedTrack } = await supabase
          .from('tracks')
          .select('id, track_name')
          .eq('track_name', track.trackName || track.track_name)
          .order('updated_at', { ascending: false })
          .limit(1)
          .single();
        
        if (savedTrack) {
          embedded = await voyageEngine.embedAndStoreTrack(savedTrack);
          if (embedded) {
            console.log(`[CloudTrack] Auto-embedded: ${savedTrack.track_name}`);
          }
        }
      } catch (embedError) {
        console.error('[CloudTrack] Auto-embed error:', embedError.message);
      }
    }
    
    return { success: result, embedded };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloudTrack:getAll', async (event, options = {}) => {
  try {
    return await cloudTrackDatabase.getAllTracks(options);
  } catch (error) {
    console.error('[CloudTrack] GetAll error:', error.message);
    return [];
  }
});

ipcMain.handle('cloudTrack:stats', async () => {
  try {
    return await cloudTrackDatabase.getStats();
  } catch (error) {
    return { tracks: 0, verified: 0, patterns: 0, aliases: 0 };
  }
});

ipcMain.handle('cloudTrack:subscribe', async () => {
  try {
    // Subscribe to track changes and forward to renderer
    cloudTrackDatabase.subscribeToChanges((change) => {
      console.log('[CloudTrack] Change:', change.type);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('cloudTrack:change', change);
      }
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloudTrack:removeDuplicates', async () => {
  try {
    return await cloudTrackDatabase.removeDuplicates();
  } catch (error) {
    console.error('[CloudTrack] RemoveDuplicates error:', error.message);
    return { removed: 0, error: error.message };
  }
});

ipcMain.handle('cloudTrack:delete', async (event, trackId) => {
  try {
    return await cloudTrackDatabase.deleteTrack(trackId);
  } catch (error) {
    console.error('[CloudTrack] Delete error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloudTrack:deleteByName', async (event, trackName) => {
  try {
    return await cloudTrackDatabase.deleteTrackByName(trackName);
  } catch (error) {
    console.error('[CloudTrack] Delete by name error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('cloudTrack:clearAll', async () => {
  try {
    return await cloudTrackDatabase.clearAll();
  } catch (error) {
    console.error('[CloudTrack] ClearAll error:', error.message);
    return { success: false, error: error.message };
  }
});

// Local database deduplication
ipcMain.handle('track:removeDuplicates', async () => {
  try {
    return trackDatabase.removeDuplicates();
  } catch (error) {
    console.error('[TrackDB] RemoveDuplicates error:', error.message);
    return { removed: 0, error: error.message };
  }
});

// Initialize cloud database and pattern engine on app ready
app.whenReady().then(async () => {
  if (supabaseClient.isConfigured()) {
    await cloudTrackDatabase.initialize();
    console.log('[Main] Cloud database initialized');
    
    await patternEngine.initialize();
    console.log('[Main] Pattern engine initialized');
  }
});

// ==========================================
// Pattern Engine IPC Handlers
// ==========================================

ipcMain.handle('pattern:applyHighConfidence', async (event, track) => {
  try {
    return await patternEngine.applyHighConfidencePatterns(track);
  } catch (error) {
    console.error('[Pattern] Apply error:', error.message);
    return {};
  }
});

ipcMain.handle('pattern:getChoices', async (event, track, field) => {
  try {
    return await patternEngine.getInteractiveChoices(track, field);
  } catch (error) {
    console.error('[Pattern] Get choices error:', error.message);
    return { options: [], requiresChoice: true };
  }
});

ipcMain.handle('pattern:getBatchChoices', async (event, tracks, field) => {
  try {
    return await patternEngine.getBatchInteractiveChoices(tracks, field);
  } catch (error) {
    console.error('[Pattern] Batch choices error:', error.message);
    return [];
  }
});

ipcMain.handle('pattern:recordChoice', async (event, track, field, chosenOption, allOptions) => {
  try {
    await patternEngine.recordUserChoice(track, field, chosenOption, allOptions);
    return { success: true };
  } catch (error) {
    console.error('[Pattern] Record choice error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pattern:recordOverride', async (event, track, field, patternId, oldValue, newValue) => {
  try {
    await patternEngine.recordPatternOverride(track, field, patternId, oldValue, newValue);
    return { success: true };
  } catch (error) {
    console.error('[Pattern] Record override error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pattern:getAll', async () => {
  try {
    return await patternEngine.getAllPatterns();
  } catch (error) {
    console.error('[Pattern] Get all error:', error.message);
    return [];
  }
});

ipcMain.handle('pattern:delete', async (event, patternId) => {
  try {
    return await patternEngine.deletePattern(patternId);
  } catch (error) {
    console.error('[Pattern] Delete error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pattern:updateConfidence', async (event, patternId, confidence) => {
  try {
    return await patternEngine.updatePatternConfidence(patternId, confidence);
  } catch (error) {
    console.error('[Pattern] Update confidence error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pattern:synthesize', async () => {
  try {
    return await patternEngine.synthesizePatternsWithOpus();
  } catch (error) {
    console.error('[Pattern] Synthesize error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('pattern:findMatching', async (event, track, field) => {
  try {
    return await patternEngine.findMatchingPatterns(track, field);
  } catch (error) {
    console.error('[Pattern] Find matching error:', error.message);
    return [];
  }
});

// ==========================================
// User Profile & Feedback IPC Handlers
// ==========================================

ipcMain.handle('profile:get', async () => {
  try {
    return feedbackManager.getUserProfile();
  } catch (error) {
    console.error('[Profile] Get error:', error.message);
    return null;
  }
});

ipcMain.handle('profile:save', async (event, profile) => {
  try {
    return feedbackManager.saveUserProfile(profile);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('feedback:submit', async (event, feedback) => {
  try {
    return await feedbackManager.submitFeedback(feedback);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('feedback:getAll', async () => {
  try {
    return await feedbackManager.getAllFeedback();
  } catch (error) {
    console.error('[Feedback] GetAll error:', error.message);
    return [];
  }
});

ipcMain.handle('feedback:updateStatus', async (event, feedbackId, status, adminNotes) => {
  try {
    return await feedbackManager.updateFeedbackStatus(feedbackId, status, adminNotes);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('feedback:sync', async () => {
  try {
    return await feedbackManager.syncLocalFeedback();
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==========================================
// Auris Chat IPC Handlers
// ==========================================

ipcMain.handle('aurisChat:isAvailable', async () => {
  return aurisChat.isAvailable();
});

ipcMain.handle('aurisChat:sendMessage', async (event, { message, conversationHistory, context }) => {
  try {
    const result = await aurisChat.processMessage(message, conversationHistory || [], {
      ...context,
      trackDatabase,
      cloudTrackDatabase
    });
    return result;
  } catch (error) {
    console.error('[AurisChat] Send message error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('aurisChat:processHighlight', async (event, { highlight, cues, context }) => {
  try {
    return await aurisChat.processHighlightAnnotation(highlight, cues, {
      ...context,
      trackDatabase,
      cloudTrackDatabase
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ==========================================
// Voyage AI Vector Search IPC Handlers
// ==========================================

let voyageEngine;
try {
  voyageEngine = require('./voyage-engine');
} catch (e) {
  console.log('[Main] Voyage engine not available:', e.message);
  voyageEngine = null;
}

ipcMain.handle('voyage:isAvailable', async () => {
  return voyageEngine?.isAvailable() || false;
});

ipcMain.handle('voyage:searchTracks', async (event, { query, limit, threshold }) => {
  try {
    if (!voyageEngine?.isAvailable()) {
      return { success: false, error: 'Voyage not configured' };
    }
    const results = await voyageEngine.searchSimilarTracks(query, limit || 10, threshold || 0.6);
    return { success: true, results };
  } catch (error) {
    console.error('[Voyage] Search error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('voyage:searchAndMatch', async (event, { cues, threshold }) => {
  try {
    if (!voyageEngine?.isAvailable()) {
      return { success: false, error: 'Voyage not configured' };
    }
    const matches = await voyageEngine.searchAndMatch(cues, threshold || 0.7);
    return { success: true, matches };
  } catch (error) {
    console.error('[Voyage] Search and match error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('voyage:embedMissing', async (event, forceAll = false) => {
  try {
    if (!voyageEngine?.isAvailable()) {
      return { success: false, error: 'Voyage not configured' };
    }
    
    // Send progress updates to renderer
    const onProgress = (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('voyage:embedProgress', progress);
      }
    };
    
    const result = await voyageEngine.embedMissingTracks(onProgress, forceAll);
    return result;
  } catch (error) {
    console.error('[Voyage] Embed missing error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('voyage:getTrackCount', async () => {
  try {
    const { supabase } = supabaseClient;
    const { count: total } = await supabase
      .from('tracks')
      .select('id', { count: 'exact', head: true });
    
    const { count: withEmbedding } = await supabase
      .from('tracks')
      .select('id', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    return { total: total || 0, withEmbedding: withEmbedding || 0 };
  } catch (error) {
    return { total: 0, withEmbedding: 0, error: error.message };
  }
});

ipcMain.handle('voyage:embedTrack', async (event, track) => {
  try {
    if (!voyageEngine?.isAvailable()) {
      return { success: false, error: 'Voyage not configured' };
    }
    const success = await voyageEngine.embedAndStoreTrack(track);
    return { success };
  } catch (error) {
    console.error('[Voyage] Embed track error:', error);
    return { success: false, error: error.message };
  }
});

// ==========================================
// Highlights IPC Handlers
// ==========================================

// In-memory highlights store (will be replaced with Supabase for cloud sync)
const highlightsStore = new Map(); // projectId -> highlights[]

ipcMain.handle('highlights:get', async (event, projectId) => {
  try {
    // Try cloud first
    if (supabaseClient.isConfigured()) {
      const { supabase } = supabaseClient;
      const { data, error } = await supabase
        .from('highlights')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      
      if (!error && data) {
        return data.map(h => ({
          id: h.id.toString(),
          projectId: h.project_id,
          rowIds: h.row_ids || [],
          color: h.color,
          annotation: h.annotation,
          resolved: h.resolved,
          resolvedAt: h.resolved_at,
          createdAt: h.created_at
        }));
      }
    }
    
    // Fall back to memory store
    return highlightsStore.get(projectId) || [];
  } catch (error) {
    console.error('[Highlights] Get error:', error);
    return highlightsStore.get(projectId) || [];
  }
});

ipcMain.handle('highlights:create', async (event, highlight) => {
  try {
    // Try cloud first
    if (supabaseClient.isConfigured()) {
      const { supabase } = supabaseClient;
      const { data, error } = await supabase
        .from('highlights')
        .insert({
          project_id: highlight.projectId,
          row_ids: highlight.rowIds,
          color: highlight.color,
          annotation: highlight.annotation || null,
          created_by: highlight.createdBy || null,
          resolved: false
        })
        .select()
        .single();
      
      if (!error && data) {
        return { 
          success: true, 
          id: data.id.toString(),
          highlight: {
            id: data.id.toString(),
            projectId: data.project_id,
            rowIds: data.row_ids,
            color: data.color,
            annotation: data.annotation,
            resolved: data.resolved,
            createdAt: data.created_at
          }
        };
      }
    }
    
    // Fall back to memory store
    const existing = highlightsStore.get(highlight.projectId) || [];
    const newHighlight = {
      ...highlight,
      id: highlight.id || `highlight-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    highlightsStore.set(highlight.projectId, [...existing, newHighlight]);
    
    return { success: true, id: newHighlight.id, highlight: newHighlight };
  } catch (error) {
    console.error('[Highlights] Create error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('highlights:update', async (event, highlightId, updates) => {
  try {
    // Try cloud first
    if (supabaseClient.isConfigured()) {
      const { supabase } = supabaseClient;
      const updateData = {};
      if (updates.annotation !== undefined) updateData.annotation = updates.annotation;
      if (updates.color !== undefined) updateData.color = updates.color;
      if (updates.resolved !== undefined) {
        updateData.resolved = updates.resolved;
        if (updates.resolved) updateData.resolved_at = new Date().toISOString();
      }
      updateData.updated_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('highlights')
        .update(updateData)
        .eq('id', parseInt(highlightId));
      
      if (!error) {
        return { success: true };
      }
    }
    
    // Fall back to memory store
    for (const [projectId, highlights] of highlightsStore.entries()) {
      const idx = highlights.findIndex(h => h.id === highlightId);
      if (idx !== -1) {
        highlights[idx] = { ...highlights[idx], ...updates, updatedAt: new Date().toISOString() };
        highlightsStore.set(projectId, highlights);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Highlight not found' };
  } catch (error) {
    console.error('[Highlights] Update error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('highlights:delete', async (event, highlightId) => {
  try {
    // Try cloud first
    if (supabaseClient.isConfigured()) {
      const { supabase } = supabaseClient;
      const { error } = await supabase
        .from('highlights')
        .delete()
        .eq('id', parseInt(highlightId));
      
      if (!error) {
        return { success: true };
      }
    }
    
    // Fall back to memory store
    for (const [projectId, highlights] of highlightsStore.entries()) {
      const filtered = highlights.filter(h => h.id !== highlightId);
      if (filtered.length !== highlights.length) {
        highlightsStore.set(projectId, filtered);
        return { success: true };
      }
    }
    
    return { success: false, error: 'Highlight not found' };
  } catch (error) {
    console.error('[Highlights] Delete error:', error);
    return { success: false, error: error.message };
  }
});

// Subscribe to highlight changes for real-time sync
ipcMain.handle('highlights:subscribe', async (event, projectId) => {
  try {
    if (!supabaseClient.isConfigured()) {
      return { success: false, error: 'Supabase not configured' };
    }
    
    const { supabase } = supabaseClient;
    
    // Subscribe to changes on the highlights table for this project
    const channel = supabase
      .channel(`highlights:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'highlights',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          console.log('[Highlights] Real-time change:', payload.eventType);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('highlights:change', {
              type: payload.eventType,
              projectId,
              highlight: payload.new || payload.old
            });
          }
        }
      )
      .subscribe();
    
    return { success: true };
  } catch (error) {
    console.error('[Highlights] Subscribe error:', error);
    return { success: false, error: error.message };
  }
});
