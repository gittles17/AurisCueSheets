const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  openPrprojDialog: () => ipcRenderer.invoke('dialog:openPrproj'),
  
  // Project parsing
  parsePrproj: (filePath) => ipcRenderer.invoke('prproj:parse', filePath),
  parseProjectForWizard: (filePath) => ipcRenderer.invoke('wizard:parseProject', filePath),
  
  // Wizard progress events
  onWizardProgress: (callback) => {
    ipcRenderer.on('wizard:progress', (event, data) => callback(data));
  },
  removeWizardProgressListener: () => {
    ipcRenderer.removeAllListeners('wizard:progress');
  },
  
  // Excel export
  exportExcel: (data) => ipcRenderer.invoke('excel:export', data),
  shareExport: (data) => ipcRenderer.invoke('share:exportAndMail', data),
  
  // Audio metadata
  getAudioMetadata: (filePath) => ipcRenderer.invoke('audio:metadata', filePath),
  
  // Contacts
  findContact: (libraryName) => ipcRenderer.invoke('contacts:find', libraryName),
  getAllContacts: () => ipcRenderer.invoke('contacts:getAll'),
  getContactNames: () => ipcRenderer.invoke('contacts:getNames'),
  importContacts: () => ipcRenderer.invoke('contacts:import'),
  enrichCueWithContact: (cue) => ipcRenderer.invoke('cue:enrichWithContact', cue),
  
  // BMG Lookup
  searchBMG: (trackName) => ipcRenderer.invoke('bmg:search', trackName),
  enrichCueFromBMG: (cue) => ipcRenderer.invoke('bmg:enrichCue', cue),
  checkIfBMG: (trackName) => ipcRenderer.invoke('bmg:checkIfBMG', trackName),
  
  // iTunes Lookup
  searchiTunes: (trackName, artistName) => ipcRenderer.invoke('itunes:search', trackName, artistName),
  enrichCueFromiTunes: (cue) => ipcRenderer.invoke('itunes:enrich', cue),
  
  // Claude Opus
  isOpusEnabled: () => ipcRenderer.invoke('opus:isEnabled'),
  enrichCueWithOpus: (cue, context) => ipcRenderer.invoke('opus:enrich', cue, context),
  lookupPROWithOpus: (trackName, artistName) => ipcRenderer.invoke('opus:lookupPRO', trackName, artistName),
  detectUseType: (trackName, context) => ipcRenderer.invoke('opus:detectUse', trackName, context),
  enrichBatchWithOpus: (cues) => ipcRenderer.invoke('opus:enrichBatch', cues),
  extractWithOpus: (pageText, pageUrl) => ipcRenderer.invoke('extract:withOpus', pageText, pageUrl),
  
  // PRO Lookup (BMI/ASCAP)
  searchPRO: (trackName, artistName) => ipcRenderer.invoke('pro:search', trackName, artistName),
  formatPROData: (proData) => ipcRenderer.invoke('pro:format', proData),
  
  // Auto-lookup (combines all sources)
  autoLookupCue: (cue) => ipcRenderer.invoke('cue:autoLookup', cue),
  
  // Project Management
  getProjects: () => ipcRenderer.invoke('projects:getAll'),
  createFolder: (parentId, name) => ipcRenderer.invoke('projects:createFolder', parentId, name),
  createProject: (name) => ipcRenderer.invoke('projects:create', name), // Legacy
  createSpot: (parentId, name) => ipcRenderer.invoke('projects:createSpot', parentId, name), // Legacy
  createCueSheet: (parentId, name) => ipcRenderer.invoke('projects:createCueSheet', parentId, name),
  renameItem: (id, newName) => ipcRenderer.invoke('projects:rename', id, newName),
  deleteItem: (id) => ipcRenderer.invoke('projects:delete', id),
  duplicateItem: (id) => ipcRenderer.invoke('projects:duplicate', id),
  moveItem: (itemId, newParentId) => ipcRenderer.invoke('projects:move', itemId, newParentId),
  revealInFinder: (filePath) => ipcRenderer.invoke('shell:revealInFinder', filePath),
  getCueSheet: (id) => ipcRenderer.invoke('projects:getCueSheet', id),
  getParentFolderName: (id) => ipcRenderer.invoke('projects:getParentFolderName', id),
  updateCueSheet: (id, data) => ipcRenderer.invoke('projects:updateCueSheet', id, data),
  importPrproj: (filePath, prprojData, projectFolder) => ipcRenderer.invoke('projects:importPrproj', filePath, prprojData, projectFolder),
  
  // ACS Project Files (.acs)
  acsNew: () => ipcRenderer.invoke('acs:new'),
  acsNewWithName: (name) => ipcRenderer.invoke('acs:newWithName', name),
  acsOpen: () => ipcRenderer.invoke('acs:open'),
  acsOpenPath: (filePath) => ipcRenderer.invoke('acs:openPath', filePath),
  acsSave: (filePath) => ipcRenderer.invoke('acs:save', filePath),
  acsSaveAs: () => ipcRenderer.invoke('acs:saveAs'),
  acsGetRecent: () => ipcRenderer.invoke('acs:getRecent'),
  acsRemoveFromRecent: (filePath) => ipcRenderer.invoke('acs:removeFromRecent', filePath),
  acsClearAllRecent: () => ipcRenderer.invoke('acs:clearAllRecent'),
  
  // Sources Management
  getSources: () => ipcRenderer.invoke('sources:getAll'),
  updateSourceConfig: (sourceId, config) => ipcRenderer.invoke('sources:updateConfig', sourceId, config),
  toggleSource: (sourceId, enabled) => ipcRenderer.invoke('sources:toggle', sourceId, enabled),
  testConnection: (sourceId) => ipcRenderer.invoke('sources:testConnection', sourceId),
  testAllConnections: () => ipcRenderer.invoke('sources:testAll'),
  
  // Browser Control (Puppeteer)
  openBrowserForManual: (url, trackInfo) => ipcRenderer.invoke('browser:openForManual', url, trackInfo),
  closeBrowser: () => ipcRenderer.invoke('browser:close'),
  navigateBrowser: (url) => ipcRenderer.invoke('browser:navigate', url),
  getBrowserContent: () => ipcRenderer.invoke('browser:getContent'),
  extractBMGData: () => ipcRenderer.invoke('browser:extractBMG'),
  searchBMGBrowser: (trackName) => ipcRenderer.invoke('browser:searchBMG', trackName),
  isBrowserActive: () => ipcRenderer.invoke('browser:isActive'),
  
  // Track Database
  findTrack: (trackName, catalogCode, library) => ipcRenderer.invoke('trackdb:find', trackName, catalogCode, library),
  saveTrack: (track) => ipcRenderer.invoke('trackdb:save', track),
  syncToCloud: () => ipcRenderer.invoke('trackdb:syncToCloud'),
  onSyncProgress: (callback) => {
    ipcRenderer.on('trackdb:syncProgress', (event, data) => callback(data));
  },
  removeSyncProgressListener: () => {
    ipcRenderer.removeAllListeners('trackdb:syncProgress');
  },
  predictTrack: (catalogCode, library) => ipcRenderer.invoke('trackdb:predict', catalogCode, library),
  getAutocompleteSuggestions: (field, query) => ipcRenderer.invoke('trackdb:autocomplete', field, query),
  getTrackDbStats: () => ipcRenderer.invoke('trackdb:stats'),
  exportTrackDb: () => ipcRenderer.invoke('trackdb:export'),
  importTrackDb: (data) => ipcRenderer.invoke('trackdb:import', data),
  getAllTracks: (options) => ipcRenderer.invoke('trackdb:getAll', options),
  deleteTrack: (trackId) => ipcRenderer.invoke('trackdb:delete', trackId),
  clearAllTracks: () => ipcRenderer.invoke('trackdb:clearAll'),
  
  // Natural Language
  parseNaturalLanguage: (input, context) => ipcRenderer.invoke('nl:parse', input, context),
  applyCorrection: (tracks, correction) => ipcRenderer.invoke('nl:apply', tracks, correction),
  suggestCorrections: (tracks) => ipcRenderer.invoke('nl:suggest', tracks),
  
  // Batch Analysis
  analyzeBatch: (cues) => ipcRenderer.invoke('batch:analyze', cues),
  applyBatchPattern: (cues, pattern) => ipcRenderer.invoke('batch:applyPattern', cues, pattern),
  
  // Smart Batch Lookup
  startBatchLookup: (tracks) => ipcRenderer.invoke('batchLookup:start', tracks),
  cancelBatchLookup: () => ipcRenderer.invoke('batchLookup:cancel'),
  getBatchLookupProgress: () => ipcRenderer.invoke('batchLookup:getProgress'),
  getBatchLookupResults: () => ipcRenderer.invoke('batchLookup:getResults'),
  applyBatchLookupResults: (selectedIds, cues) => ipcRenderer.invoke('batchLookup:apply', selectedIds, cues),
  getTracksWithMissingData: (cues) => ipcRenderer.invoke('batchLookup:getTracksWithMissingData', cues),
  onBatchLookupProgress: (callback) => {
    ipcRenderer.on('batchLookup:progress', (event, data) => callback(data));
  },
  removeBatchLookupProgressListener: () => {
    ipcRenderer.removeAllListeners('batchLookup:progress');
  },
  
  // BMG Bookmarklet Data Receiver
  onBmgDataReceived: (callback) => {
    ipcRenderer.on('bmg-data-received', (event, data) => callback(data));
  },
  removeBmgDataListener: () => {
    ipcRenderer.removeAllListeners('bmg-data-received');
  },
  
  // Platform info
  platform: process.platform,
  
  // ==========================================
  // Authentication (Supabase)
  // ==========================================
  authGetSession: () => ipcRenderer.invoke('auth:getSession'),
  authGetUser: () => ipcRenderer.invoke('auth:getUser'),
  authSignIn: (email, password) => ipcRenderer.invoke('auth:signIn', email, password),
  authSignUp: (email, password) => ipcRenderer.invoke('auth:signUp', email, password),
  authSignOut: () => ipcRenderer.invoke('auth:signOut'),
  authIsAdmin: () => ipcRenderer.invoke('auth:isAdmin'),
  authVerifyAdminPassword: (password) => ipcRenderer.invoke('auth:verifyAdminPassword', password),
  authExitAdminMode: () => ipcRenderer.invoke('auth:exitAdminMode'),
  authIsConfigured: () => ipcRenderer.invoke('auth:isConfigured'),
  onAuthStateChange: (callback) => {
    ipcRenderer.on('auth:stateChange', (event, data) => callback(data));
  },
  removeAuthStateListener: () => {
    ipcRenderer.removeAllListeners('auth:stateChange');
  },
  
  // ==========================================
  // Cloud Data Sources (Admin-managed)
  // ==========================================
  cloudSourcesGet: () => ipcRenderer.invoke('cloudSources:getAll'),
  cloudSourcesUpdate: (sourceId, updates) => ipcRenderer.invoke('cloudSources:update', sourceId, updates),
  cloudSourcesAdd: (source) => ipcRenderer.invoke('cloudSources:add', source),
  cloudSourcesDelete: (sourceId) => ipcRenderer.invoke('cloudSources:delete', sourceId),
  cloudSourcesToggle: (sourceId, enabled) => ipcRenderer.invoke('cloudSources:toggle', sourceId, enabled),
  cloudSourcesSetLocalConfig: (sourceId, config) => ipcRenderer.invoke('cloudSources:setLocalConfig', sourceId, config),
  onSourcesChange: (callback) => {
    ipcRenderer.on('cloudSources:change', (event, data) => callback(data));
  },
  removeSourcesChangeListener: () => {
    ipcRenderer.removeAllListeners('cloudSources:change');
  },
  
  // ==========================================
  // Cloud Track Database
  // ==========================================
  cloudTrackFind: (trackName, catalogCode, library) => ipcRenderer.invoke('cloudTrack:find', trackName, catalogCode, library),
  cloudTrackSave: (track) => ipcRenderer.invoke('cloudTrack:save', track),
  cloudTrackGetAll: (options) => ipcRenderer.invoke('cloudTrack:getAll', options),
  cloudTrackStats: () => ipcRenderer.invoke('cloudTrack:stats'),
  cloudTrackSubscribe: () => ipcRenderer.invoke('cloudTrack:subscribe'),
  cloudTrackRemoveDuplicates: () => ipcRenderer.invoke('cloudTrack:removeDuplicates'),
  cloudTrackDelete: (trackId) => ipcRenderer.invoke('cloudTrack:delete', trackId),
  cloudTrackDeleteByName: (trackName) => ipcRenderer.invoke('cloudTrack:deleteByName', trackName),
  cloudTrackClearAll: () => ipcRenderer.invoke('cloudTrack:clearAll'),
  trackRemoveDuplicates: () => ipcRenderer.invoke('track:removeDuplicates'),
  onCloudTrackChange: (callback) => {
    ipcRenderer.on('cloudTrack:change', (event, data) => callback(data));
  },
  removeCloudTrackChangeListener: () => {
    ipcRenderer.removeAllListeners('cloudTrack:change');
  },
  
  // ==========================================
  // User Profile & Feedback
  // ==========================================
  getProfile: () => ipcRenderer.invoke('profile:get'),
  saveProfile: (profile) => ipcRenderer.invoke('profile:save', profile),
  submitFeedback: (feedback) => ipcRenderer.invoke('feedback:submit', feedback),
  getAllFeedback: () => ipcRenderer.invoke('feedback:getAll'),
  updateFeedbackStatus: (feedbackId, status, adminNotes) => ipcRenderer.invoke('feedback:updateStatus', feedbackId, status, adminNotes),
  syncFeedback: () => ipcRenderer.invoke('feedback:sync'),
  
  // ==========================================
  // Auris Chat
  // ==========================================
  aurisChatIsAvailable: () => ipcRenderer.invoke('aurisChat:isAvailable'),
  aurisChatSendMessage: (data) => ipcRenderer.invoke('aurisChat:sendMessage', data),
  aurisChatProcessHighlight: (data) => ipcRenderer.invoke('aurisChat:processHighlight', data),
  
  // ==========================================
  // Voyage AI Vector Search
  // ==========================================
  voyageIsAvailable: () => ipcRenderer.invoke('voyage:isAvailable'),
  voyageSearchTracks: (query, limit, threshold) => ipcRenderer.invoke('voyage:searchTracks', { query, limit, threshold }),
  voyageSearchAndMatch: (cues, threshold) => ipcRenderer.invoke('voyage:searchAndMatch', { cues, threshold }),
  voyageEmbedMissing: (forceAll) => ipcRenderer.invoke('voyage:embedMissing', forceAll),
  voyageEmbedTrack: (track) => ipcRenderer.invoke('voyage:embedTrack', track),
  voyageGetTrackCount: () => ipcRenderer.invoke('voyage:getTrackCount'),
  onVoyageEmbedProgress: (callback) => {
    ipcRenderer.on('voyage:embedProgress', (event, data) => callback(data));
  },
  removeVoyageEmbedProgressListener: () => {
    ipcRenderer.removeAllListeners('voyage:embedProgress');
  },
  
  // ==========================================
  // Highlights
  // ==========================================
  highlightsGet: (projectId) => ipcRenderer.invoke('highlights:get', projectId),
  highlightsCreate: (highlight) => ipcRenderer.invoke('highlights:create', highlight),
  highlightsUpdate: (highlightId, updates) => ipcRenderer.invoke('highlights:update', highlightId, updates),
  highlightsDelete: (highlightId) => ipcRenderer.invoke('highlights:delete', highlightId),
  highlightsSubscribe: (projectId) => ipcRenderer.invoke('highlights:subscribe', projectId),
  onHighlightsChange: (callback) => {
    ipcRenderer.on('highlights:change', (event, data) => callback(data));
  },
  removeHighlightsChangeListener: () => {
    ipcRenderer.removeAllListeners('highlights:change');
  },
  
  // ==========================================
  // Pattern Learning Engine
  // ==========================================
  patternApplyHighConfidence: (track) => ipcRenderer.invoke('pattern:applyHighConfidence', track),
  patternGetChoices: (track, field) => ipcRenderer.invoke('pattern:getChoices', track, field),
  patternGetBatchChoices: (tracks, field) => ipcRenderer.invoke('pattern:getBatchChoices', tracks, field),
  patternRecordChoice: (track, field, chosenOption, allOptions) => ipcRenderer.invoke('pattern:recordChoice', track, field, chosenOption, allOptions),
  patternRecordOverride: (track, field, patternId, oldValue, newValue) => ipcRenderer.invoke('pattern:recordOverride', track, field, patternId, oldValue, newValue),
  patternGetAll: () => ipcRenderer.invoke('pattern:getAll'),
  patternDelete: (patternId) => ipcRenderer.invoke('pattern:delete', patternId),
  patternUpdateConfidence: (patternId, confidence) => ipcRenderer.invoke('pattern:updateConfidence', patternId, confidence),
  patternSynthesize: () => ipcRenderer.invoke('pattern:synthesize'),
  patternFindMatching: (track, field) => ipcRenderer.invoke('pattern:findMatching', track, field),
  
  // Tour
  tourGetDemoProjectPath: () => ipcRenderer.invoke('tour:getDemoProjectPath'),
  
  // ==========================================
  // Auto-Updater
  // ==========================================
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateDownloadProgress: (callback) => {
    ipcRenderer.on('update-download-progress', (event, progress) => callback(progress));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
  }
});
