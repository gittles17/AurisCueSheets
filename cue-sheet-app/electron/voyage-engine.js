/**
 * Voyage AI Engine - Vector embeddings for fast track similarity search
 * 
 * Uses Voyage AI's embedding models to:
 * - Generate embeddings for track names
 * - Batch embed multiple tracks efficiently
 * - Search for similar tracks using vector similarity
 */

const { supabase, isConfigured } = require('./supabase-client');
const sourcesManager = require('./sources-manager');

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const VOYAGE_MODEL = 'voyage-3'; // 1024 dimensions, best quality
const BATCH_SIZE = 128; // Voyage API limit

/**
 * Get Voyage API key from sources config
 */
function getApiKey() {
  const sources = sourcesManager.getAllSources();
  return sources.voyage?.config?.apiKey || null;
}

/**
 * Check if Voyage is available
 */
function isAvailable() {
  return !!getApiKey();
}

/**
 * Generate embedding for a single text
 */
async function generateEmbedding(text) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Voyage API key not configured');
  }

  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: text,
        input_type: 'document'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Voyage API error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (err) {
    console.error('[Voyage] Error generating embedding:', err);
    throw err;
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 */
async function generateBatchEmbeddings(texts) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Voyage API key not configured');
  }

  if (texts.length === 0) return [];
  if (texts.length > BATCH_SIZE) {
    throw new Error(`Batch size exceeds limit of ${BATCH_SIZE}`);
  }

  try {
    const response = await fetch(VOYAGE_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: texts,
        input_type: 'document'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Voyage API error: ${error.message || response.statusText}`);
    }

    const data = await response.json();
    // Return embeddings in same order as input
    return data.data.map(d => d.embedding);
  } catch (err) {
    console.error('[Voyage] Error generating batch embeddings:', err);
    throw err;
  }
}

/**
 * Search for similar tracks using vector similarity
 */
async function searchSimilarTracks(query, limit = 10, threshold = 0.6) {
  if (!isConfigured()) {
    console.log('[Voyage] Supabase not configured');
    return [];
  }

  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    
    // Search using Supabase RPC function
    const { data, error } = await supabase.rpc('match_tracks', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit
    });

    if (error) {
      console.error('[Voyage] Search error:', error);
      return [];
    }

    console.log(`[Voyage] Found ${data?.length || 0} similar tracks for "${query}"`);
    return data || [];
  } catch (err) {
    console.error('[Voyage] Error searching similar tracks:', err);
    return [];
  }
}

/**
 * Embed and store a single track
 */
async function embedAndStoreTrack(track) {
  if (!isConfigured()) {
    console.log('[Voyage] Supabase not configured');
    return false;
  }

  try {
    const embedding = await generateEmbedding(track.trackName || track.track_name);
    
    const { error } = await supabase
      .from('tracks')
      .update({ embedding })
      .eq('id', track.id);

    if (error) {
      console.error('[Voyage] Error storing embedding:', error);
      return false;
    }

    console.log(`[Voyage] Embedded track: ${track.trackName || track.track_name}`);
    return true;
  } catch (err) {
    console.error('[Voyage] Error embedding track:', err);
    return false;
  }
}

/**
 * Batch embed and store multiple tracks
 * Processes in chunks of BATCH_SIZE
 */
async function batchEmbedTracks(tracks, onProgress = null) {
  if (!isConfigured()) {
    console.log('[Voyage] Supabase not configured');
    return { success: false, embedded: 0 };
  }

  let embedded = 0;
  const total = tracks.length;

  for (let i = 0; i < tracks.length; i += BATCH_SIZE) {
    const batch = tracks.slice(i, i + BATCH_SIZE);
    const trackNames = batch.map(t => t.trackName || t.track_name);

    try {
      const embeddings = await generateBatchEmbeddings(trackNames);

      // Update each track with its embedding
      await Promise.all(batch.map((track, idx) =>
        supabase
          .from('tracks')
          .update({ embedding: embeddings[idx] })
          .eq('id', track.id)
      ));

      embedded += batch.length;
      
      if (onProgress) {
        onProgress({ embedded, total, percent: Math.round((embedded / total) * 100) });
      }

      console.log(`[Voyage] Embedded batch ${Math.floor(i / BATCH_SIZE) + 1}: ${embedded}/${total}`);
    } catch (err) {
      console.error(`[Voyage] Error embedding batch:`, err);
      // Continue with next batch
    }
  }

  return { success: true, embedded, total };
}

/**
 * Embed all tracks that don't have embeddings yet
 * If forceAll is true, re-embeds ALL tracks regardless of existing embeddings
 */
async function embedMissingTracks(onProgress = null, forceAll = false) {
  if (!isConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  try {
    // Get tracks - either without embeddings or all tracks
    let query = supabase.from('tracks').select('id, track_name');
    
    if (!forceAll) {
      query = query.is('embedding', null);
    }
    
    const { data: tracks, error } = await query;

    if (error) {
      console.error('[Voyage] Error fetching tracks:', error);
      return { success: false, error: error.message };
    }

    if (!tracks || tracks.length === 0) {
      console.log('[Voyage] All tracks already have embeddings');
      return { success: true, embedded: 0, total: 0 };
    }

    console.log(`[Voyage] Found ${tracks.length} tracks without embeddings`);
    return await batchEmbedTracks(tracks, onProgress);
  } catch (err) {
    console.error('[Voyage] Error embedding missing tracks:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Search and fill - find similar tracks and return matches for cue sheet tracks
 */
async function searchAndMatch(cues, threshold = 0.7) {
  const results = [];

  for (const cue of cues) {
    // Skip if already has composer and publisher
    if (cue.composer && cue.publisher) {
      continue;
    }

    const trackName = cue.trackName || cue.track_name;
    if (!trackName) continue;

    const matches = await searchSimilarTracks(trackName, 1, threshold);
    
    if (matches.length > 0) {
      const match = matches[0];
      results.push({
        cueId: cue.id,
        trackName,
        match: {
          trackName: match.track_name,
          composer: match.composer,
          publisher: match.publisher,
          artist: match.artist,
          library: match.library,
          similarity: match.similarity
        }
      });
    }
  }

  return results;
}

module.exports = {
  isAvailable,
  generateEmbedding,
  generateBatchEmbeddings,
  searchSimilarTracks,
  embedAndStoreTrack,
  batchEmbedTracks,
  embedMissingTracks,
  searchAndMatch,
  BATCH_SIZE
};
