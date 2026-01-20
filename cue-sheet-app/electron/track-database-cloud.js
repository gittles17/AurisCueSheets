/**
 * Cloud Track Database - Supabase-based shared track metadata
 * 
 * Features:
 * - Shared track metadata across all users
 * - Real-time sync when tracks are added/updated
 * - Falls back to local database when offline
 * - Mirrors the API of track-database.js for easy integration
 */

const { supabase, isConfigured, getCurrentUser } = require('./supabase-client');

class CloudTrackDatabase {
  constructor() {
    this.initialized = false;
    this.realtimeSubscription = null;
    this.changeCallbacks = [];
  }

  /**
   * Initialize the cloud database connection
   */
  async initialize() {
    if (this.initialized) return;
    
    if (!isConfigured()) {
      console.log('[CloudTrackDB] Supabase not configured, cloud features disabled');
      return;
    }

    console.log('[CloudTrackDB] Cloud database initialized');
    this.initialized = true;
  }

  /**
   * Check if cloud database is available
   */
  isAvailable() {
    return isConfigured() && this.initialized;
  }

  /**
   * Find a track by name and optional catalog code
   */
  async findTrack(trackName, catalogCode = null, library = null) {
    if (!this.isAvailable()) return null;

    try {
      let query = supabase
        .from('tracks')
        .select('*')
        .eq('track_name', trackName);

      if (catalogCode) {
        query = query.eq('catalog_code', catalogCode);
      }
      if (library) {
        query = query.eq('library', library);
      }

      const { data, error } = await query
        .order('confidence', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('[CloudTrackDB] Error finding track:', error);
        return null;
      }

      return data ? this.rowToTrack(data) : null;
    } catch (e) {
      console.error('[CloudTrackDB] Error finding track:', e);
      return null;
    }
  }

  /**
   * Find a track using multiple strategies with confidence scores
   */
  async findTrackWithStrategies(trackName, catalogCode = null, library = null) {
    if (!this.isAvailable()) return null;

    const results = [];

    // Strategy 1: Exact match
    const exact = await this.findTrack(trackName, catalogCode, library);
    if (exact && exact.verified) {
      results.push({ ...exact, matchType: 'exact', matchConfidence: 1.0 });
    }

    // Strategy 2: Catalog code match
    if (catalogCode && !exact) {
      const catalogTracks = await this.findTracksByCatalog(catalogCode);
      const verifiedCatalogTrack = catalogTracks.find(t => t.verified && t.composer);
      if (verifiedCatalogTrack) {
        results.push({
          ...verifiedCatalogTrack,
          matchType: 'catalog',
          matchConfidence: 0.9,
          matchedBy: `Same catalog: ${catalogCode}`
        });
      }
    }

    // Strategy 3: Fuzzy name match
    if (!exact) {
      const fuzzy = await this.findFuzzyMatch(trackName);
      if (fuzzy && fuzzy.verified) {
        results.push({
          ...fuzzy,
          matchType: 'fuzzy',
          matchConfidence: 0.7,
          matchedBy: `Similar name: ${fuzzy.trackName}`
        });
      }
    }

    if (results.length === 0) return null;
    return results.sort((a, b) => b.matchConfidence - a.matchConfidence)[0];
  }

  /**
   * Find tracks with fuzzy name matching
   */
  async findFuzzyMatch(trackName) {
    if (!this.isAvailable()) return null;

    const normalized = trackName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/fullmix|stem|bass|drums|fx/gi, '');

    if (normalized.length < 3) return null;

    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('verified', true)
        .not('composer', 'is', null)
        .neq('composer', '')
        .order('confidence', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[CloudTrackDB] Error in fuzzy search:', error);
        return null;
      }

      for (const row of data || []) {
        const dbNormalized = (row.track_name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .replace(/fullmix|stem|bass|drums|fx/gi, '');

        if (dbNormalized.includes(normalized) || normalized.includes(dbNormalized)) {
          return this.rowToTrack(row);
        }
      }
      return null;
    } catch (e) {
      console.error('[CloudTrackDB] Error in fuzzy search:', e);
      return null;
    }
  }

  /**
   * Find tracks by catalog code
   */
  async findTracksByCatalog(catalogCode) {
    if (!this.isAvailable()) return [];

    try {
      const { data, error } = await supabase
        .from('tracks')
        .select('*')
        .eq('catalog_code', catalogCode)
        .order('confidence', { ascending: false });

      if (error) {
        console.error('[CloudTrackDB] Error finding by catalog:', error);
        return [];
      }

      return (data || []).map(r => this.rowToTrack(r));
    } catch (e) {
      console.error('[CloudTrackDB] Error finding by catalog:', e);
      return [];
    }
  }

  /**
   * Normalize track name for matching - handles variations
   */
  normalizeTrackName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .trim()
      .replace(/\s*[\(\[](full\s*mix|main|stem|underscore|alt|alternate|version|edit|remix|instrumental|vocal|60s?|30s?|15s?)[\)\]]\s*/gi, '')
      .replace(/\s*[-_]\s*(full\s*mix|main|stem|underscore|alt|v\d+)\s*$/gi, '')
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Check if a value has meaningful content
   */
  hasContent(value) {
    if (!value) return false;
    const trimmed = String(value).trim().toLowerCase();
    return trimmed.length > 0 && 
           trimmed !== '-' && 
           trimmed !== 'n/a' && 
           trimmed !== 'null' &&
           trimmed !== 'undefined';
  }

  /**
   * Smart merge - only fill empty fields, preserve existing data
   */
  smartMerge(existing, incoming) {
    const merged = { ...existing };
    const fields = [
      'track_number', 'catalog_code', 'library', 'artist', 'source',
      'composer', 'publisher', 'master_contact', 'use_type', 'duration'
    ];
    
    for (const field of fields) {
      if (!this.hasContent(existing[field]) && this.hasContent(incoming[field])) {
        merged[field] = incoming[field];
      }
    }
    
    if ((incoming.confidence || 0) > (existing.confidence || 0)) {
      merged.confidence = incoming.confidence;
    }
    
    if (incoming.verified) {
      merged.verified = true;
    }
    
    return merged;
  }

  /**
   * Save or update a track - with intelligent deduplication
   * Rules:
   * 1. Match by normalized track name (handles variations)
   * 2. Smart merge - only fill empty fields, preserve existing data
   * 3. Keep most complete and up-to-date information
   */
  async saveTrack(track) {
    if (!this.isAvailable()) return false;

    try {
      const user = await getCurrentUser();
      const now = new Date().toISOString();
      const normalizedName = this.normalizeTrackName(track.trackName);

      // First, check for an existing track with the same name (case-insensitive)
      const { data: exactMatch } = await supabase
        .from('tracks')
        .select('*')
        .ilike('track_name', track.trackName)
        .limit(1)
        .single();

      let existing = exactMatch;
      
      // If no exact match, try normalized matching
      if (!existing) {
        const { data: allTracks } = await supabase
          .from('tracks')
          .select('*');
        
        if (allTracks) {
          existing = allTracks.find(t => 
            this.normalizeTrackName(t.track_name) === normalizedName
          );
        }
      }

      // Prepare incoming data
      const incoming = {
        track_name: track.trackName,
        track_number: track.trackNumber || null,
        catalog_code: track.catalogCode || null,
        library: track.library || track.label || null,
        artist: track.artist || null,
        source: track.source || null,
        composer: track.composer || null,
        publisher: track.publisher || null,
        master_contact: track.masterContact || null,
        use_type: track.useType || track.use || 'BI',
        duration: track.duration || null,
        confidence: track.confidence || 1.0,
        data_source: track.dataSource || 'manual',
        verified: track.verified || false,
        updated_at: now
      };

      let error;
      
      if (existing) {
        // Check if this is a user-approved save (should overwrite everything)
        const isUserApproved = incoming.data_source === 'user_approved' || 
                              incoming.data_source === 'user_edit' ||
                              incoming.data_source === 'user_complete';
        
        let dataToSave;
        if (isUserApproved) {
          // User approved - OVERWRITE all fields with user's data
          dataToSave = { ...incoming };
          dataToSave.id = existing.id; // Keep same ID
          dataToSave.created_by = existing.created_by; // Preserve creator
          console.log(`[CloudTrackDB] User approved - OVERWRITING track: ${track.trackName}`);
        } else {
          // Automatic save - smart merge (only fill empty fields)
          dataToSave = this.smartMerge(existing, incoming);
          console.log(`[CloudTrackDB] Auto-save - merging track: ${track.trackName}`);
        }
        
        dataToSave.updated_at = now;
        dataToSave.data_source = incoming.data_source;
        
        const result = await supabase
          .from('tracks')
          .update(dataToSave)
          .eq('id', existing.id);
        error = result.error;
        
        console.log(`[CloudTrackDB] Updated track: ${track.trackName} (ID: ${existing.id})`);
      } else {
        // Insert new track
        incoming.created_by = user?.id || null;
        const result = await supabase
          .from('tracks')
          .insert(incoming);
        error = result.error;
        
        console.log(`[CloudTrackDB] Inserted new track: ${track.trackName}`);
      }

      if (error) {
        console.error('[CloudTrackDB] Error saving track:', error);
        return false;
      }

      // Learn patterns from this track
      await this.learnFromTrack(track);
      
      return true;
    } catch (e) {
      console.error('[CloudTrackDB] Error saving track:', e);
      return false;
    }
  }

  /**
   * Remove duplicate tracks - intelligently merges data before consolidating
   * Rules:
   * 1. Group by normalized track name
   * 2. Merge all data from duplicates (keep best data for each field)
   * 3. Keep the merged record, delete all duplicates
   */
  async removeDuplicates() {
    if (!this.isAvailable()) return { removed: 0 };

    try {
      // Get ALL track data for merging
      const { data: allTracks, error } = await supabase
        .from('tracks')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error || !allTracks) {
        console.error('[CloudTrackDB] Error fetching tracks for dedup:', error);
        return { removed: 0, error: error?.message };
      }

      // Group by normalized track name
      const groups = {};
      for (const track of allTracks) {
        const key = this.normalizeTrackName(track.track_name);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(track);
      }

      const idsToDelete = [];
      const tracksToUpdate = [];

      for (const key of Object.keys(groups)) {
        if (groups[key].length > 1) {
          // Merge all duplicates into the most recent one
          const primary = groups[key][0]; // Most recent due to ordering
          let merged = { ...primary };
          
          // Merge data from all duplicates
          for (let i = 1; i < groups[key].length; i++) {
            const dupe = groups[key][i];
            merged = this.smartMerge(merged, dupe);
            idsToDelete.push(dupe.id);
          }
          
          // Only update if something changed
          const needsUpdate = ['track_number', 'catalog_code', 'library', 'artist', 'source',
            'composer', 'publisher', 'master_contact', 'duration'].some(f => 
              merged[f] !== primary[f]
            );
          
          if (needsUpdate) {
            tracksToUpdate.push({ id: primary.id, data: merged });
          }
        }
      }

      if (idsToDelete.length === 0) {
        return { removed: 0 };
      }

      // Update merged records
      for (const { id, data } of tracksToUpdate) {
        const { error: updateError } = await supabase
          .from('tracks')
          .update({
            track_number: data.track_number,
            catalog_code: data.catalog_code,
            library: data.library,
            artist: data.artist,
            source: data.source,
            composer: data.composer,
            publisher: data.publisher,
            master_contact: data.master_contact,
            use_type: data.use_type,
            duration: data.duration,
            confidence: data.confidence,
            verified: data.verified,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateError) {
          console.error('[CloudTrackDB] Error updating merged track:', updateError);
        }
      }

      // Delete duplicates in batches
      const batchSize = 100;
      for (let i = 0; i < idsToDelete.length; i += batchSize) {
        const batch = idsToDelete.slice(i, i + batchSize);
        const { error: deleteError } = await supabase
          .from('tracks')
          .delete()
          .in('id', batch);

        if (deleteError) {
          console.error('[CloudTrackDB] Error deleting duplicates:', deleteError);
        }
      }

      console.log(`[CloudTrackDB] Removed ${idsToDelete.length} duplicate tracks, merged ${tracksToUpdate.length} records`);
      return { removed: idsToDelete.length, merged: tracksToUpdate.length };
    } catch (e) {
      console.error('[CloudTrackDB] Error removing duplicates:', e);
      return { removed: 0, error: e.message };
    }
  }

  /**
   * Learn patterns from a track
   */
  async learnFromTrack(track) {
    if (!track.catalogCode) return;

    if (track.composer) {
      await this.savePattern('catalog_composer', track.catalogCode, track.composer);
    }
    if (track.publisher) {
      await this.savePattern('catalog_publisher', track.catalogCode, track.publisher);
    }
    if (track.library && track.publisher) {
      await this.savePattern('library_publisher', track.library, track.publisher);
    }
  }

  /**
   * Save or update a pattern
   */
  async savePattern(type, key, value) {
    if (!this.isAvailable()) return;

    try {
      // Check if pattern exists
      const { data: existing } = await supabase
        .from('patterns')
        .select('id, occurrences')
        .eq('pattern_type', type)
        .eq('pattern_key', key)
        .eq('pattern_value', value)
        .single();

      if (existing) {
        // Update existing pattern
        const newOccurrences = existing.occurrences + 1;
        const newConfidence = Math.min(0.95, 0.5 + (newOccurrences * 0.1));
        
        await supabase
          .from('patterns')
          .update({ occurrences: newOccurrences, confidence: newConfidence })
          .eq('id', existing.id);
      } else {
        // Insert new pattern
        await supabase
          .from('patterns')
          .insert({
            pattern_type: type,
            pattern_key: key,
            pattern_value: value,
            occurrences: 1,
            confidence: 0.5
          });
      }
    } catch (e) {
      console.error('[CloudTrackDB] Error saving pattern:', e);
    }
  }

  /**
   * Get patterns for prediction
   */
  async getPatterns(type, key) {
    if (!this.isAvailable()) return [];

    try {
      const { data, error } = await supabase
        .from('patterns')
        .select('pattern_value, confidence, occurrences')
        .eq('pattern_type', type)
        .eq('pattern_key', key)
        .order('confidence', { ascending: false })
        .order('occurrences', { ascending: false });

      if (error) {
        console.error('[CloudTrackDB] Error getting patterns:', error);
        return [];
      }

      return (data || []).map(r => ({
        value: r.pattern_value,
        confidence: r.confidence,
        occurrences: r.occurrences
      }));
    } catch (e) {
      console.error('[CloudTrackDB] Error getting patterns:', e);
      return [];
    }
  }

  /**
   * Predict composer/publisher based on patterns
   */
  async predict(catalogCode, library = null) {
    const predictions = {
      composer: null,
      publisher: null,
      composerConfidence: 0,
      publisherConfidence: 0
    };

    if (catalogCode) {
      const composerPatterns = await this.getPatterns('catalog_composer', catalogCode);
      if (composerPatterns.length > 0) {
        predictions.composer = composerPatterns[0].value;
        predictions.composerConfidence = composerPatterns[0].confidence;
      }

      const publisherPatterns = await this.getPatterns('catalog_publisher', catalogCode);
      if (publisherPatterns.length > 0) {
        predictions.publisher = publisherPatterns[0].value;
        predictions.publisherConfidence = publisherPatterns[0].confidence;
      }
    }

    if (!predictions.publisher && library) {
      const libraryPatterns = await this.getPatterns('library_publisher', library);
      if (libraryPatterns.length > 0) {
        predictions.publisher = libraryPatterns[0].value;
        predictions.publisherConfidence = libraryPatterns[0].confidence * 0.8;
      }
    }

    return predictions;
  }

  /**
   * Get autocomplete suggestions for a field
   */
  async getAutocompleteSuggestions(field, query = '', limit = 10) {
    if (!this.isAvailable()) return [];

    const columnMap = {
      composer: 'composer',
      publisher: 'publisher',
      masterContact: 'master_contact',
      artist: 'artist',
      source: 'source',
      label: 'library'
    };

    const column = columnMap[field];
    if (!column) return [];

    try {
      let queryBuilder = supabase
        .from('tracks')
        .select(column)
        .not(column, 'is', null)
        .neq(column, '');

      if (query && query.length > 0) {
        queryBuilder = queryBuilder.ilike(column, `%${query}%`);
      }

      const { data, error } = await queryBuilder.limit(100);

      if (error) {
        console.error('[CloudTrackDB] Error getting suggestions:', error);
        return [];
      }

      // Get unique values and count frequency
      const freqMap = {};
      for (const row of data || []) {
        const value = row[column];
        if (value) {
          freqMap[value] = (freqMap[value] || 0) + 1;
        }
      }

      return Object.entries(freqMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([value]) => value);
    } catch (e) {
      console.error('[CloudTrackDB] Error getting suggestions:', e);
      return [];
    }
  }

  /**
   * Get database statistics
   */
  async getStats() {
    if (!this.isAvailable()) {
      return { tracks: 0, verified: 0, patterns: 0, aliases: 0 };
    }

    try {
      const [tracksResult, verifiedResult, patternsResult, aliasesResult] = await Promise.all([
        supabase.from('tracks').select('id', { count: 'exact', head: true }),
        supabase.from('tracks').select('id', { count: 'exact', head: true }).eq('verified', true),
        supabase.from('patterns').select('id', { count: 'exact', head: true }),
        supabase.from('aliases').select('id', { count: 'exact', head: true })
      ]);

      return {
        tracks: tracksResult.count || 0,
        verified: verifiedResult.count || 0,
        patterns: patternsResult.count || 0,
        aliases: aliasesResult.count || 0
      };
    } catch (e) {
      console.error('[CloudTrackDB] Error getting stats:', e);
      return { tracks: 0, verified: 0, patterns: 0, aliases: 0 };
    }
  }

  /**
   * Get all tracks with optional search
   */
  async getAllTracks({ search = '', limit = 500, offset = 0 } = {}) {
    if (!this.isAvailable()) return [];

    try {
      let query = supabase
        .from('tracks')
        .select('*');

      if (search && search.length > 0) {
        query = query.or(
          `track_name.ilike.%${search}%,` +
          `composer.ilike.%${search}%,` +
          `publisher.ilike.%${search}%,` +
          `library.ilike.%${search}%,` +
          `master_contact.ilike.%${search}%`
        );
      }

      const { data, error } = await query
        .order('updated_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error('[CloudTrackDB] Error getting all tracks:', error);
        return [];
      }

      return (data || []).map(r => this.rowToTrack(r));
    } catch (e) {
      console.error('[CloudTrackDB] Error getting all tracks:', e);
      return [];
    }
  }

  /**
   * Delete a track by ID
   */
  async deleteTrack(trackId) {
    if (!this.isAvailable()) return { success: false };

    try {
      const { error } = await supabase
        .from('tracks')
        .delete()
        .eq('id', trackId);

      if (error) {
        console.error('[CloudTrackDB] Error deleting track:', error);
        return { success: false };
      }

      return { success: true };
    } catch (e) {
      console.error('[CloudTrackDB] Error deleting track:', e);
      return { success: false };
    }
  }

  /**
   * Delete a track by name (case-insensitive)
   */
  async deleteTrackByName(trackName) {
    if (!this.isAvailable()) return { success: false };

    try {
      const { error } = await supabase
        .from('tracks')
        .delete()
        .ilike('track_name', trackName);

      if (error) {
        console.error('[CloudTrackDB] Error deleting track by name:', error);
        return { success: false, error: error.message };
      }

      console.log(`[CloudTrackDB] Deleted track: ${trackName}`);
      return { success: true };
    } catch (e) {
      console.error('[CloudTrackDB] Error deleting track by name:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Clear all learned data (admin only in practice via RLS)
   */
  async clearAll() {
    if (!this.isAvailable()) return { success: false };

    try {
      await Promise.all([
        supabase.from('tracks').delete().neq('id', 0),
        supabase.from('patterns').delete().neq('id', 0),
        supabase.from('aliases').delete().neq('id', 0)
      ]);

      return { success: true };
    } catch (e) {
      console.error('[CloudTrackDB] Error clearing all:', e);
      return { success: false };
    }
  }

  /**
   * Subscribe to real-time track changes
   */
  subscribeToChanges(callback) {
    if (!isConfigured()) return;

    this.changeCallbacks.push(callback);

    // Only create subscription once
    if (!this.realtimeSubscription) {
      this.realtimeSubscription = supabase
        .channel('tracks-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'tracks' },
          (payload) => {
            console.log('[CloudTrackDB] Real-time change:', payload.eventType);
            const track = payload.new ? this.rowToTrack(payload.new) : null;
            this.changeCallbacks.forEach(cb => cb({
              type: payload.eventType,
              track,
              old: payload.old ? this.rowToTrack(payload.old) : null
            }));
          }
        )
        .subscribe();
    }
  }

  /**
   * Unsubscribe from real-time changes
   */
  unsubscribe() {
    if (this.realtimeSubscription) {
      supabase.removeChannel(this.realtimeSubscription);
      this.realtimeSubscription = null;
    }
    this.changeCallbacks = [];
  }

  /**
   * Convert database row to track object
   */
  rowToTrack(row) {
    return {
      id: row.id,
      trackName: row.track_name,
      catalogCode: row.catalog_code,
      library: row.library,
      artist: row.artist,
      source: row.source,
      composer: row.composer,
      publisher: row.publisher,
      masterContact: row.master_contact,
      useType: row.use_type,
      duration: row.duration,
      confidence: row.confidence,
      dataSource: row.data_source,
      verified: row.verified,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

// Export singleton instance
const cloudTrackDatabase = new CloudTrackDatabase();

module.exports = {
  cloudTrackDatabase,
  CloudTrackDatabase
};
