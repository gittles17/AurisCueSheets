/**
 * Batch Analysis - Pattern detection across multiple tracks
 * 
 * Analyzes all cues to find:
 * - Tracks from the same album/catalog that likely share composer/publisher
 * - Inconsistent data that needs review
 * - Suggestions for bulk updates
 */

const sourcesManager = require('./sources-manager');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-opus-4-20250514';

/**
 * Get API key
 */
function getApiKey() {
  const sources = sourcesManager.getAllSources();
  return sources.opus?.config?.apiKey || null;
}

/**
 * Check if Opus is enabled
 */
function isOpusEnabled() {
  const sources = sourcesManager.getAllSources();
  return sources.opus?.enabled && sources.opus?.config?.apiKey;
}

/**
 * Group tracks by catalog code
 */
function groupByCatalog(cues) {
  const groups = {};
  
  for (const cue of cues) {
    const catalog = cue.catalogCode || extractCatalogCode(cue.originalName || cue.trackName);
    if (catalog) {
      if (!groups[catalog]) {
        groups[catalog] = [];
      }
      groups[catalog].push(cue);
    }
  }
  
  return groups;
}

/**
 * Extract catalog code from filename
 */
function extractCatalogCode(filename) {
  if (!filename) return null;
  const match = filename.match(/\b([A-Z]{2,}[0-9]{2,})\b/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Group tracks by source/album
 */
function groupBySource(cues) {
  const groups = {};
  
  for (const cue of cues) {
    const source = cue.source || 'Unknown';
    if (!groups[source]) {
      groups[source] = [];
    }
    groups[source].push(cue);
  }
  
  return groups;
}

/**
 * Find patterns in grouped tracks (no API)
 */
function findPatternsQuick(cues) {
  const patterns = [];
  
  // Group by catalog
  const catalogGroups = groupByCatalog(cues);
  
  for (const [catalog, tracks] of Object.entries(catalogGroups)) {
    if (tracks.length < 2) continue;
    
    // Check if any tracks in group have composer
    const tracksWithComposer = tracks.filter(t => t.composer);
    const tracksWithoutComposer = tracks.filter(t => !t.composer);
    
    if (tracksWithComposer.length > 0 && tracksWithoutComposer.length > 0) {
      // Find most common composer in group
      const composerCounts = {};
      for (const t of tracksWithComposer) {
        composerCounts[t.composer] = (composerCounts[t.composer] || 0) + 1;
      }
      
      const [topComposer, count] = Object.entries(composerCounts)
        .sort((a, b) => b[1] - a[1])[0] || [null, 0];
      
      if (topComposer && count >= Math.ceil(tracksWithComposer.length * 0.5)) {
        patterns.push({
          type: 'same_composer',
          catalog,
          composer: topComposer,
          confidence: count / tracksWithComposer.length,
          affectedTracks: tracksWithoutComposer.map(t => t.id),
          description: `${tracksWithoutComposer.length} tracks from ${catalog} may have composer: ${topComposer}`
        });
      }
    }
    
    // Same for publisher
    const tracksWithPublisher = tracks.filter(t => t.publisher);
    const tracksWithoutPublisher = tracks.filter(t => !t.publisher);
    
    if (tracksWithPublisher.length > 0 && tracksWithoutPublisher.length > 0) {
      const publisherCounts = {};
      for (const t of tracksWithPublisher) {
        publisherCounts[t.publisher] = (publisherCounts[t.publisher] || 0) + 1;
      }
      
      const [topPublisher, count] = Object.entries(publisherCounts)
        .sort((a, b) => b[1] - a[1])[0] || [null, 0];
      
      if (topPublisher && count >= Math.ceil(tracksWithPublisher.length * 0.5)) {
        patterns.push({
          type: 'same_publisher',
          catalog,
          publisher: topPublisher,
          confidence: count / tracksWithPublisher.length,
          affectedTracks: tracksWithoutPublisher.map(t => t.id),
          description: `${tracksWithoutPublisher.length} tracks from ${catalog} may have publisher: ${topPublisher}`
        });
      }
    }
  }
  
  // Group by source/album
  const sourceGroups = groupBySource(cues);
  
  for (const [source, tracks] of Object.entries(sourceGroups)) {
    if (source === 'Unknown' || tracks.length < 2) continue;
    
    // Check for master contact pattern
    const tracksWithContact = tracks.filter(t => t.masterContact);
    const tracksWithoutContact = tracks.filter(t => !t.masterContact);
    
    if (tracksWithContact.length > 0 && tracksWithoutContact.length > 0) {
      const contactCounts = {};
      for (const t of tracksWithContact) {
        contactCounts[t.masterContact] = (contactCounts[t.masterContact] || 0) + 1;
      }
      
      const [topContact, count] = Object.entries(contactCounts)
        .sort((a, b) => b[1] - a[1])[0] || [null, 0];
      
      if (topContact) {
        patterns.push({
          type: 'same_contact',
          source,
          masterContact: topContact,
          confidence: count / tracksWithContact.length,
          affectedTracks: tracksWithoutContact.map(t => t.id),
          description: `${tracksWithoutContact.length} tracks from "${source}" may have contact: ${topContact.split('\n')[0]}`
        });
      }
    }
  }
  
  return patterns;
}

/**
 * Find inconsistencies in data
 */
function findInconsistencies(cues) {
  const issues = [];
  
  const catalogGroups = groupByCatalog(cues);
  
  for (const [catalog, tracks] of Object.entries(catalogGroups)) {
    if (tracks.length < 2) continue;
    
    // Check for different composers in same catalog
    const composers = [...new Set(tracks.filter(t => t.composer).map(t => t.composer))];
    if (composers.length > 1) {
      issues.push({
        type: 'inconsistent_composer',
        catalog,
        values: composers,
        trackIds: tracks.map(t => t.id),
        description: `Tracks in ${catalog} have different composers: ${composers.join(' vs ')}`
      });
    }
    
    // Check for different publishers in same catalog
    const publishers = [...new Set(tracks.filter(t => t.publisher).map(t => t.publisher))];
    if (publishers.length > 1) {
      issues.push({
        type: 'inconsistent_publisher',
        catalog,
        values: publishers,
        trackIds: tracks.map(t => t.id),
        description: `Tracks in ${catalog} have different publishers: ${publishers.join(' vs ')}`
      });
    }
  }
  
  return issues;
}

/**
 * Generate suggestions based on patterns
 */
function generateSuggestions(patterns, inconsistencies) {
  const suggestions = [];
  
  for (const pattern of patterns) {
    if (pattern.confidence >= 0.7 && pattern.affectedTracks.length > 0) {
      if (pattern.type === 'same_composer') {
        suggestions.push({
          action: 'bulk_update',
          field: 'composer',
          value: pattern.composer,
          trackIds: pattern.affectedTracks,
          description: `Set composer to "${pattern.composer}" for ${pattern.affectedTracks.length} tracks`,
          confidence: pattern.confidence
        });
      } else if (pattern.type === 'same_publisher') {
        suggestions.push({
          action: 'bulk_update',
          field: 'publisher',
          value: pattern.publisher,
          trackIds: pattern.affectedTracks,
          description: `Set publisher to "${pattern.publisher}" for ${pattern.affectedTracks.length} tracks`,
          confidence: pattern.confidence
        });
      } else if (pattern.type === 'same_contact') {
        suggestions.push({
          action: 'bulk_update',
          field: 'masterContact',
          value: pattern.masterContact,
          trackIds: pattern.affectedTracks,
          description: `Set master contact for ${pattern.affectedTracks.length} tracks from "${pattern.source}"`,
          confidence: pattern.confidence
        });
      }
    }
  }
  
  for (const issue of inconsistencies) {
    suggestions.push({
      action: 'review',
      type: issue.type,
      trackIds: issue.trackIds,
      description: issue.description,
      values: issue.values
    });
  }
  
  return suggestions;
}

/**
 * Analyze with Opus for deeper insights
 */
async function analyzeWithOpus(cues, patterns) {
  const apiKey = getApiKey();
  
  if (!apiKey || !isOpusEnabled()) {
    return { patterns, suggestions: generateSuggestions(patterns, []) };
  }
  
  // Only use Opus if we have significant patterns to analyze
  if (patterns.length === 0) {
    return { patterns, suggestions: [] };
  }
  
  const systemPrompt = `You analyze music cue sheet data to find patterns and suggest improvements.
You are looking at tracks that may share composers/publishers based on being from the same album/catalog.

IMPORTANT:
- Only suggest patterns you are confident about
- If tracks are from the same catalog/album, they often (but not always) share composer/publisher
- Production music catalogs typically have consistent composer/publisher within an album
- Do not invent data - only work with what's provided

Return JSON with analysis.`;

  const tracksSummary = cues.slice(0, 20).map(c => ({
    name: c.trackName,
    catalog: c.catalogCode || extractCatalogCode(c.originalName || c.trackName),
    source: c.source,
    composer: c.composer || '(missing)',
    publisher: c.publisher || '(missing)'
  }));

  const patternsSummary = patterns.slice(0, 5).map(p => ({
    type: p.type,
    description: p.description,
    confidence: p.confidence
  }));

  const userPrompt = `Analyze these cue sheet tracks:

TRACKS:
${JSON.stringify(tracksSummary, null, 2)}

DETECTED PATTERNS:
${JSON.stringify(patternsSummary, null, 2)}

Return JSON:
{
  "analysis": "brief analysis of the data",
  "confirmedPatterns": ["list of pattern descriptions that seem reliable"],
  "questionablePatterns": ["list of patterns that need verification"],
  "additionalSuggestions": ["any other suggestions for improving the data"]
}`;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });

    if (!response.ok) {
      return { patterns, suggestions: generateSuggestions(patterns, []) };
    }

    const data = await response.json();
    let responseText = data.content[0].text.trim();
    
    if (responseText.startsWith('```')) {
      responseText = responseText.replace(/```json?\n?/g, '').replace(/```/g, '');
    }
    
    const analysis = JSON.parse(responseText);
    
    // Combine quick patterns with Opus insights
    const suggestions = generateSuggestions(patterns, []);
    
    // Mark patterns as confirmed or questionable based on Opus
    for (const pattern of patterns) {
      pattern.opusConfirmed = analysis.confirmedPatterns?.some(
        cp => cp.toLowerCase().includes(pattern.catalog?.toLowerCase() || '')
      );
    }
    
    return {
      patterns,
      suggestions,
      opusAnalysis: analysis
    };
    
  } catch (error) {
    console.error('[BatchAnalysis] Opus error:', error.message);
    return { patterns, suggestions: generateSuggestions(patterns, []) };
  }
}

/**
 * Main batch analysis function
 */
async function analyzeBatch(cues) {
  if (!cues || cues.length === 0) {
    return { patterns: [], suggestions: [], inconsistencies: [] };
  }
  
  // Find patterns using quick analysis
  const patterns = findPatternsQuick(cues);
  const inconsistencies = findInconsistencies(cues);
  
  // If Opus is enabled, get deeper analysis
  if (isOpusEnabled()) {
    const opusResult = await analyzeWithOpus(cues, patterns);
    return {
      ...opusResult,
      inconsistencies
    };
  }
  
  return {
    patterns,
    suggestions: generateSuggestions(patterns, inconsistencies),
    inconsistencies
  };
}

/**
 * Apply a pattern to cues
 */
function applyPattern(cues, pattern) {
  const updates = [];
  
  if (!pattern.affectedTracks || pattern.affectedTracks.length === 0) {
    return { success: false, error: 'No tracks to update' };
  }
  
  for (const trackId of pattern.affectedTracks) {
    const cue = cues.find(c => c.id === trackId);
    if (!cue) continue;
    
    const update = { id: trackId };
    
    if (pattern.type === 'same_composer' && pattern.composer) {
      update.composer = pattern.composer;
      update.composerConfidence = pattern.confidence;
      update.composerSource = 'pattern';
    } else if (pattern.type === 'same_publisher' && pattern.publisher) {
      update.publisher = pattern.publisher;
      update.publisherConfidence = pattern.confidence;
      update.publisherSource = 'pattern';
    } else if (pattern.type === 'same_contact' && pattern.masterContact) {
      update.masterContact = pattern.masterContact;
    }
    
    updates.push(update);
  }
  
  return {
    success: true,
    updates
  };
}

/**
 * Get analysis summary stats
 */
function getAnalysisSummary(cues) {
  const total = cues.length;
  const complete = cues.filter(c => c.status === 'complete').length;
  const missingComposer = cues.filter(c => !c.composer).length;
  const missingPublisher = cues.filter(c => !c.publisher).length;
  const missingContact = cues.filter(c => !c.masterContact).length;
  const lowConfidence = cues.filter(c => 
    (c.composerConfidence && c.composerConfidence < 0.7) ||
    (c.publisherConfidence && c.publisherConfidence < 0.7)
  ).length;
  
  const catalogGroups = Object.keys(groupByCatalog(cues)).length;
  const sourceGroups = Object.keys(groupBySource(cues)).length;
  
  return {
    total,
    complete,
    incomplete: total - complete,
    missingComposer,
    missingPublisher,
    missingContact,
    lowConfidence,
    catalogGroups,
    sourceGroups
  };
}

module.exports = {
  analyzeBatch,
  applyPattern,
  findPatternsQuick,
  findInconsistencies,
  generateSuggestions,
  getAnalysisSummary,
  groupByCatalog,
  groupBySource,
  extractCatalogCode,
  isOpusEnabled
};
