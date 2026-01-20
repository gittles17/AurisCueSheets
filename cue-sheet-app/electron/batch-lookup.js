/**
 * Smart Lookup Service - Minimal Implementation
 * 
 * The automated batch lookup has been disabled in favor of manual lookup.
 * This module provides stubs to prevent errors from existing IPC calls.
 */

const { LOOKUP_SITES, detectSiteFromMetadata } = require('./lookup-sites');

// State management
let isRunning = false;
let results = [];

/**
 * Start batch lookup - disabled, returns immediately
 */
async function startBatchLookup(tracks, onProgress) {
  console.log('[BatchLookup] Automated batch lookup is disabled. Use manual Smart Lookup instead.');
  return {
    success: false,
    error: 'Automated batch lookup is disabled. Use the manual Smart Lookup feature in the browser panel.',
    results: []
  };
}

/**
 * Cancel batch lookup
 */
function cancelBatchLookup() {
  isRunning = false;
}

/**
 * Get progress
 */
function getProgress() {
  return { isRunning: false, current: 0, total: 0 };
}

/**
 * Get results
 */
function getResults() {
  return results;
}

/**
 * Apply results to cues
 */
function applyResults(selectedResultIds, cues) {
  return cues;
}

/**
 * Get tracks with missing data
 */
function getTracksWithMissingData(cues) {
  if (!cues || !Array.isArray(cues)) return [];
  
  return cues.filter(cue => {
    const hasComposer = cue.composer && cue.composer.trim().length > 0;
    const hasPublisher = cue.publisher && cue.publisher.trim().length > 0;
    return !hasComposer || !hasPublisher;
  }).map(cue => ({
    id: cue.id,
    trackName: cue.trackName,
    cleanName: cue.trackName?.replace(/^(BYND-|mx\s*)/i, '').trim(),
    catalogCode: cue.catalogCode,
    source: cue.source,
    label: cue.label,
    hasComposer: !!(cue.composer && cue.composer.trim()),
    hasPublisher: !!(cue.publisher && cue.publisher.trim()),
    site: detectSiteFromMetadata(cue)?.site?.id || null
  }));
}

module.exports = {
  startBatchLookup,
  cancelBatchLookup,
  getProgress,
  getResults,
  applyResults,
  getTracksWithMissingData
};
