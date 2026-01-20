/**
 * Track Database - SQLite-based cache for composer/publisher data
 * 
 * Features:
 * - Caches track metadata for instant repeat lookups
 * - Stores patterns for prediction (same album = same composer likely)
 * - Learns from user corrections
 * - Tracks confidence levels and data sources
 */

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Use better-sqlite3 for synchronous, fast SQLite operations
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  // Fallback to JSON file storage if better-sqlite3 not available
  console.log('[TrackDB] better-sqlite3 not available, using JSON fallback');
  Database = null;
}

class TrackDatabase {
  constructor() {
    this.db = null;
    this.jsonPath = null;
    this.jsonData = null;
    this.initialized = false;
  }

  /**
   * Initialize the database
   */
  initialize() {
    if (this.initialized) return;

    const userDataPath = app.getPath('userData');
    
    if (Database) {
      // Use SQLite
      const dbPath = path.join(userDataPath, 'track-cache.db');
      this.db = new Database(dbPath);
      this.createTables();
      console.log('[TrackDB] SQLite database initialized at:', dbPath);
    } else {
      // Fallback to JSON
      this.jsonPath = path.join(userDataPath, 'track-cache.json');
      this.loadJsonData();
      console.log('[TrackDB] JSON database initialized at:', this.jsonPath);
    }
    
    this.initialized = true;
  }

  /**
   * Create SQLite tables
   */
  createTables() {
    // Main tracks table - includes ALL cue sheet fields
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        track_name TEXT NOT NULL,
        track_number TEXT,
        catalog_code TEXT,
        library TEXT,
        artist TEXT,
        source TEXT,
        composer TEXT,
        publisher TEXT,
        master_contact TEXT,
        use_type TEXT DEFAULT 'BI',
        duration TEXT,
        confidence REAL DEFAULT 1.0,
        data_source TEXT,
        verified INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(track_name, catalog_code, library)
      )
    `);

    // Patterns table for learning
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern_type TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        pattern_value TEXT NOT NULL,
        occurrences INTEGER DEFAULT 1,
        confidence REAL DEFAULT 0.5,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(pattern_type, pattern_key, pattern_value)
      )
    `);

    // Aliases table for name matching
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alias TEXT NOT NULL,
        canonical TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(alias, entity_type)
      )
    `);

    // Create indexes for fast lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tracks_name ON tracks(track_name);
      CREATE INDEX IF NOT EXISTS idx_tracks_catalog ON tracks(catalog_code);
      CREATE INDEX IF NOT EXISTS idx_tracks_library ON tracks(library);
      CREATE INDEX IF NOT EXISTS idx_patterns_key ON patterns(pattern_type, pattern_key);
    `);
    
    // Migration: Add track_number column if it doesn't exist
    try {
      this.db.exec(`ALTER TABLE tracks ADD COLUMN track_number TEXT`);
      console.log('[TrackDB] Added track_number column');
    } catch (e) {
      // Column already exists, ignore
    }
  }

  /**
   * Load JSON data (fallback mode)
   */
  loadJsonData() {
    try {
      if (fs.existsSync(this.jsonPath)) {
        const data = fs.readFileSync(this.jsonPath, 'utf-8');
        this.jsonData = JSON.parse(data);
      } else {
        this.jsonData = { tracks: [], patterns: [], aliases: [] };
      }
    } catch (e) {
      console.error('[TrackDB] Error loading JSON:', e);
      this.jsonData = { tracks: [], patterns: [], aliases: [] };
    }
  }

  /**
   * Save JSON data (fallback mode)
   */
  saveJsonData() {
    try {
      fs.writeFileSync(this.jsonPath, JSON.stringify(this.jsonData, null, 2));
    } catch (e) {
      console.error('[TrackDB] Error saving JSON:', e);
    }
  }

  /**
   * Find a track by name and optional catalog code
   */
  findTrack(trackName, catalogCode = null, library = null) {
    this.initialize();

    if (this.db) {
      let query = 'SELECT * FROM tracks WHERE track_name = ?';
      const params = [trackName];

      if (catalogCode) {
        query += ' AND catalog_code = ?';
        params.push(catalogCode);
      }
      if (library) {
        query += ' AND library = ?';
        params.push(library);
      }

      query += ' ORDER BY confidence DESC, updated_at DESC LIMIT 1';
      
      const row = this.db.prepare(query).get(...params);
      return row ? this.rowToTrack(row) : null;
    } else {
      // JSON fallback
      return this.jsonData.tracks.find(t => 
        t.trackName === trackName &&
        (!catalogCode || t.catalogCode === catalogCode) &&
        (!library || t.library === library)
      ) || null;
    }
  }

  /**
   * Find a track using multiple strategies with confidence scores
   * Returns the best match across all strategies
   */
  findTrackWithStrategies(trackName, catalogCode = null, library = null) {
    this.initialize();
    const results = [];

    // Strategy 1: Exact match (highest confidence)
    const exact = this.findTrack(trackName, catalogCode, library);
    if (exact && exact.verified) {
      results.push({ ...exact, matchType: 'exact', matchConfidence: 1.0 });
    }

    // Strategy 2: Catalog code match (same album = same composer likely)
    if (catalogCode && !exact) {
      const catalogTracks = this.findTracksByCatalog(catalogCode);
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
      const fuzzy = this.findFuzzyMatch(trackName);
      if (fuzzy && fuzzy.verified) {
        results.push({ 
          ...fuzzy, 
          matchType: 'fuzzy', 
          matchConfidence: 0.7,
          matchedBy: `Similar name: ${fuzzy.trackName}`
        });
      }
    }

    // Return best match (highest confidence)
    if (results.length === 0) return null;
    return results.sort((a, b) => b.matchConfidence - a.matchConfidence)[0];
  }

  /**
   * Find tracks with fuzzy name matching
   */
  findFuzzyMatch(trackName) {
    this.initialize();
    
    // Normalize the search term
    const normalized = trackName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')  // Remove non-alphanumeric
      .replace(/fullmix|stem|bass|drums|fx/gi, ''); // Remove common suffixes
    
    if (normalized.length < 3) return null; // Too short to match

    if (this.db) {
      // Search for similar names - SQLite LIKE with wildcards
      const rows = this.db.prepare(`
        SELECT * FROM tracks 
        WHERE verified = 1 
          AND composer IS NOT NULL 
          AND composer != ''
        ORDER BY confidence DESC, updated_at DESC
      `).all();
      
      // Find best fuzzy match
      for (const row of rows) {
        const dbNormalized = (row.track_name || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .replace(/fullmix|stem|bass|drums|fx/gi, '');
        
        // Check if one contains the other (handles variations like "Track Name (Full Mix)")
        if (dbNormalized.includes(normalized) || normalized.includes(dbNormalized)) {
          return this.rowToTrack(row);
        }
      }
      return null;
    } else {
      // JSON fallback
      return this.jsonData.tracks.find(t => {
        if (!t.verified || !t.composer) return false;
        const dbNormalized = (t.trackName || '')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .replace(/fullmix|stem|bass|drums|fx/gi, '');
        return dbNormalized.includes(normalized) || normalized.includes(dbNormalized);
      }) || null;
    }
  }

  /**
   * Find tracks by catalog code (for pattern prediction)
   */
  findTracksByCatalog(catalogCode) {
    this.initialize();

    if (this.db) {
      const rows = this.db.prepare(
        'SELECT * FROM tracks WHERE catalog_code = ? ORDER BY confidence DESC'
      ).all(catalogCode);
      return rows.map(r => this.rowToTrack(r));
    } else {
      return this.jsonData.tracks.filter(t => t.catalogCode === catalogCode);
    }
  }

  /**
   * Normalize track name for matching - handles variations
   * Rules:
   * - Case insensitive
   * - Remove common suffixes (Full Mix, Stem, etc.)
   * - Normalize whitespace and special characters
   */
  normalizeTrackName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .trim()
      // Remove common audio suffixes
      .replace(/\s*[\(\[](full\s*mix|main|stem|underscore|alt|alternate|version|edit|remix|instrumental|vocal|60s?|30s?|15s?)[\)\]]\s*/gi, '')
      // Remove trailing version indicators
      .replace(/\s*[-_]\s*(full\s*mix|main|stem|underscore|alt|v\d+)\s*$/gi, '')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      // Remove special characters for matching
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  /**
   * Check if a value has meaningful content (not empty, not just dashes/N/A)
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
   * Smart merge - only fill empty fields, don't overwrite existing data
   * Returns merged data object
   */
  smartMerge(existing, incoming) {
    const merged = { ...existing };
    const fields = [
      'track_number', 'catalog_code', 'library', 'artist', 'source',
      'composer', 'publisher', 'master_contact', 'use_type', 'duration'
    ];
    
    for (const field of fields) {
      // Only update if existing is empty AND incoming has content
      if (!this.hasContent(existing[field]) && this.hasContent(incoming[field])) {
        merged[field] = incoming[field];
      }
    }
    
    // Always update confidence if incoming is higher
    if ((incoming.confidence || 0) > (existing.confidence || 0)) {
      merged.confidence = incoming.confidence;
    }
    
    // Mark as verified if incoming is verified
    if (incoming.verified) {
      merged.verified = 1;
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
  saveTrack(track) {
    this.initialize();

    const now = new Date().toISOString();
    const normalizedName = this.normalizeTrackName(track.trackName);

    if (this.db) {
      // Find existing track by normalized name
      const findStmt = this.db.prepare(`
        SELECT * FROM tracks WHERE LOWER(track_name) = LOWER(?) LIMIT 1
      `);
      let existing = findStmt.get(track.trackName);
      
      // If no exact match, try normalized matching
      if (!existing) {
        const allTracks = this.db.prepare('SELECT * FROM tracks').all();
        existing = allTracks.find(t => 
          this.normalizeTrackName(t.track_name) === normalizedName
        );
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
        verified: track.verified ? 1 : 0
      };
      
      if (existing) {
        // Smart merge - preserve existing data, only fill empty fields
        const merged = this.smartMerge(existing, incoming);
        
        const updateStmt = this.db.prepare(`
          UPDATE tracks SET
            track_number = ?,
            catalog_code = ?,
            library = ?,
            artist = ?,
            source = ?,
            composer = ?,
            publisher = ?,
            master_contact = ?,
            use_type = ?,
            duration = ?,
            confidence = ?,
            data_source = ?,
            verified = ?,
            updated_at = ?
          WHERE id = ?
        `);
        updateStmt.run(
          merged.track_number,
          merged.catalog_code,
          merged.library,
          merged.artist,
          merged.source,
          merged.composer,
          merged.publisher,
          merged.master_contact,
          merged.use_type,
          merged.duration,
          merged.confidence,
          incoming.data_source, // Always update data source to latest
          merged.verified,
          now,
          existing.id
        );
        
        console.log(`[TrackDB] Updated existing track: ${track.trackName} (ID: ${existing.id})`);
      } else {
        // Insert new track
        const insertStmt = this.db.prepare(`
          INSERT INTO tracks (
            track_name, track_number, catalog_code, library, artist, source,
            composer, publisher, master_contact, use_type, duration,
            confidence, data_source, verified, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertStmt.run(
          incoming.track_name,
          incoming.track_number,
          incoming.catalog_code,
          incoming.library,
          incoming.artist,
          incoming.source,
          incoming.composer,
          incoming.publisher,
          incoming.master_contact,
          incoming.use_type,
          incoming.duration,
          incoming.confidence,
          incoming.data_source,
          incoming.verified,
          now
        );
        
        console.log(`[TrackDB] Inserted new track: ${track.trackName}`);
      }

      // Learn patterns from this track
      this.learnFromTrack(track);
      
      return true;
    } else {
      // JSON fallback - match by normalized name
      const existingIdx = this.jsonData.tracks.findIndex(t =>
        this.normalizeTrackName(t.trackName) === normalizedName
      );

      if (existingIdx >= 0) {
        // Smart merge for JSON
        const existing = this.jsonData.tracks[existingIdx];
        const merged = { ...existing };
        
        const fields = ['trackNumber', 'catalogCode', 'library', 'artist', 'source',
                       'composer', 'publisher', 'masterContact', 'useType', 'duration'];
        
        for (const field of fields) {
          if (!this.hasContent(existing[field]) && this.hasContent(track[field])) {
            merged[field] = track[field];
          }
        }
        
        merged.updatedAt = now;
        if (track.verified) merged.verified = true;
        
        this.jsonData.tracks[existingIdx] = merged;
      } else {
        const trackData = { ...track, createdAt: now, updatedAt: now };
        this.jsonData.tracks.push(trackData);
      }
      
      this.saveJsonData();
      this.learnFromTrack(track);
      return true;
    }
  }

  /**
   * Learn patterns from a track
   */
  learnFromTrack(track) {
    if (!track.catalogCode) return;

    // Pattern: catalog_code -> composer
    if (track.composer) {
      this.savePattern('catalog_composer', track.catalogCode, track.composer);
    }

    // Pattern: catalog_code -> publisher
    if (track.publisher) {
      this.savePattern('catalog_publisher', track.catalogCode, track.publisher);
    }

    // Pattern: library -> publisher
    if (track.library && track.publisher) {
      this.savePattern('library_publisher', track.library, track.publisher);
    }
  }

  /**
   * Save or update a pattern
   */
  savePattern(type, key, value) {
    this.initialize();

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT INTO patterns (pattern_type, pattern_key, pattern_value, occurrences, confidence, updated_at)
        VALUES (?, ?, ?, 1, 0.5, CURRENT_TIMESTAMP)
        ON CONFLICT(pattern_type, pattern_key, pattern_value) DO UPDATE SET
          occurrences = occurrences + 1,
          confidence = MIN(0.95, 0.5 + (occurrences * 0.1)),
          updated_at = CURRENT_TIMESTAMP
      `);
      stmt.run(type, key, value);
    } else {
      const existing = this.jsonData.patterns.findIndex(p =>
        p.type === type && p.key === key && p.value === value
      );

      if (existing >= 0) {
        this.jsonData.patterns[existing].occurrences++;
        this.jsonData.patterns[existing].confidence = Math.min(
          0.95,
          0.5 + (this.jsonData.patterns[existing].occurrences * 0.1)
        );
      } else {
        this.jsonData.patterns.push({
          type, key, value, occurrences: 1, confidence: 0.5
        });
      }
      this.saveJsonData();
    }
  }

  /**
   * Get patterns for prediction
   */
  getPatterns(type, key) {
    this.initialize();

    if (this.db) {
      const rows = this.db.prepare(
        'SELECT * FROM patterns WHERE pattern_type = ? AND pattern_key = ? ORDER BY confidence DESC, occurrences DESC'
      ).all(type, key);
      return rows.map(r => ({
        value: r.pattern_value,
        confidence: r.confidence,
        occurrences: r.occurrences
      }));
    } else {
      return this.jsonData.patterns
        .filter(p => p.type === type && p.key === key)
        .sort((a, b) => b.confidence - a.confidence)
        .map(p => ({ value: p.value, confidence: p.confidence, occurrences: p.occurrences }));
    }
  }

  /**
   * Predict composer/publisher based on patterns
   */
  predict(catalogCode, library = null) {
    const predictions = {
      composer: null,
      publisher: null,
      composerConfidence: 0,
      publisherConfidence: 0
    };

    // Try catalog-based prediction first
    if (catalogCode) {
      const composerPatterns = this.getPatterns('catalog_composer', catalogCode);
      if (composerPatterns.length > 0) {
        predictions.composer = composerPatterns[0].value;
        predictions.composerConfidence = composerPatterns[0].confidence;
      }

      const publisherPatterns = this.getPatterns('catalog_publisher', catalogCode);
      if (publisherPatterns.length > 0) {
        predictions.publisher = publisherPatterns[0].value;
        predictions.publisherConfidence = publisherPatterns[0].confidence;
      }
    }

    // Try library-based prediction if no catalog match
    if (!predictions.publisher && library) {
      const libraryPatterns = this.getPatterns('library_publisher', library);
      if (libraryPatterns.length > 0) {
        predictions.publisher = libraryPatterns[0].value;
        predictions.publisherConfidence = libraryPatterns[0].confidence * 0.8; // Lower confidence
      }
    }

    return predictions;
  }

  /**
   * Get autocomplete suggestions for a field
   * Returns distinct values sorted by frequency
   */
  getAutocompleteSuggestions(field, query = '', limit = 10) {
    this.initialize();

    // Map field names to database columns
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

    if (this.db) {
      let stmt;
      if (query && query.length > 0) {
        // Filter by query - search at start of string or after common separators
        stmt = this.db.prepare(`
          SELECT DISTINCT ${column} as value, COUNT(*) as frequency
          FROM tracks 
          WHERE ${column} IS NOT NULL 
            AND ${column} != ''
            AND LOWER(${column}) LIKE LOWER(?)
          GROUP BY ${column}
          ORDER BY frequency DESC, ${column} ASC
          LIMIT ?
        `);
        return stmt.all(`%${query}%`, limit).map(r => r.value);
      } else {
        // Return most frequent values
        stmt = this.db.prepare(`
          SELECT DISTINCT ${column} as value, COUNT(*) as frequency
          FROM tracks 
          WHERE ${column} IS NOT NULL AND ${column} != ''
          GROUP BY ${column}
          ORDER BY frequency DESC
          LIMIT ?
        `);
        return stmt.all(limit).map(r => r.value);
      }
    } else {
      // JSON fallback
      const values = this.jsonData.tracks
        .map(t => t[field])
        .filter(v => v && v.length > 0);
      
      // Count frequency
      const freqMap = {};
      for (const v of values) {
        freqMap[v] = (freqMap[v] || 0) + 1;
      }
      
      // Sort by frequency and filter by query
      let results = Object.entries(freqMap)
        .sort((a, b) => b[1] - a[1])
        .map(([value]) => value);
      
      if (query && query.length > 0) {
        const lowerQuery = query.toLowerCase();
        results = results.filter(v => v.toLowerCase().includes(lowerQuery));
      }
      
      return results.slice(0, limit);
    }
  }

  /**
   * Save an alias (e.g., "R. Hall" = "Robin Hall")
   */
  saveAlias(alias, canonical, entityType) {
    this.initialize();

    if (this.db) {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO aliases (alias, canonical, entity_type)
        VALUES (?, ?, ?)
      `);
      stmt.run(alias.toLowerCase(), canonical, entityType);
    } else {
      const existing = this.jsonData.aliases.findIndex(a =>
        a.alias.toLowerCase() === alias.toLowerCase() && a.entityType === entityType
      );
      const aliasData = { alias: alias.toLowerCase(), canonical, entityType };
      if (existing >= 0) {
        this.jsonData.aliases[existing] = aliasData;
      } else {
        this.jsonData.aliases.push(aliasData);
      }
      this.saveJsonData();
    }
  }

  /**
   * Resolve an alias to canonical name
   */
  resolveAlias(name, entityType) {
    this.initialize();

    if (this.db) {
      const row = this.db.prepare(
        'SELECT canonical FROM aliases WHERE alias = ? AND entity_type = ?'
      ).get(name.toLowerCase(), entityType);
      return row ? row.canonical : name;
    } else {
      const alias = this.jsonData.aliases.find(a =>
        a.alias === name.toLowerCase() && a.entityType === entityType
      );
      return alias ? alias.canonical : name;
    }
  }

  /**
   * Get database statistics
   */
  getStats() {
    this.initialize();

    if (this.db) {
      const trackCount = this.db.prepare('SELECT COUNT(*) as count FROM tracks').get().count;
      const verifiedCount = this.db.prepare('SELECT COUNT(*) as count FROM tracks WHERE verified = 1').get().count;
      const patternCount = this.db.prepare('SELECT COUNT(*) as count FROM patterns').get().count;
      const aliasCount = this.db.prepare('SELECT COUNT(*) as count FROM aliases').get().count;

      return {
        tracks: trackCount,
        verified: verifiedCount,
        patterns: patternCount,
        aliases: aliasCount
      };
    } else {
      return {
        tracks: this.jsonData.tracks.length,
        verified: this.jsonData.tracks.filter(t => t.verified).length,
        patterns: this.jsonData.patterns.length,
        aliases: this.jsonData.aliases.length
      };
    }
  }

  /**
   * Export database to JSON
   */
  exportToJson() {
    this.initialize();

    if (this.db) {
      const tracks = this.db.prepare('SELECT * FROM tracks').all().map(r => this.rowToTrack(r));
      const patterns = this.db.prepare('SELECT * FROM patterns').all();
      const aliases = this.db.prepare('SELECT * FROM aliases').all();
      return { tracks, patterns, aliases };
    } else {
      return this.jsonData;
    }
  }

  /**
   * Import from JSON
   */
  importFromJson(data) {
    this.initialize();

    let imported = 0;

    if (data.tracks) {
      for (const track of data.tracks) {
        this.saveTrack(track);
        imported++;
      }
    }

    if (data.aliases) {
      for (const alias of data.aliases) {
        this.saveAlias(alias.alias, alias.canonical, alias.entityType || alias.entity_type);
      }
    }

    return { imported };
  }

  /**
   * Get all tracks with optional search
   */
  getAllTracks(search = '', limit = 500, offset = 0) {
    this.initialize();

    if (this.db) {
      let query;
      let params;

      if (search && search.length > 0) {
        const searchTerm = `%${search}%`;
        query = `
          SELECT * FROM tracks 
          WHERE track_name LIKE ? 
            OR artist LIKE ?
            OR source LIKE ?
            OR track_number LIKE ?
            OR composer LIKE ? 
            OR publisher LIKE ? 
            OR library LIKE ?
            OR master_contact LIKE ?
          ORDER BY updated_at DESC
          LIMIT ? OFFSET ?
        `;
        params = [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, limit, offset];
      } else {
        query = 'SELECT * FROM tracks ORDER BY updated_at DESC LIMIT ? OFFSET ?';
        params = [limit, offset];
      }

      const rows = this.db.prepare(query).all(...params);
      return rows.map(r => this.rowToTrack(r));
    } else {
      // JSON fallback
      let results = this.jsonData.tracks;
      
      if (search && search.length > 0) {
        const searchLower = search.toLowerCase();
        results = results.filter(t => 
          (t.trackName || '').toLowerCase().includes(searchLower) ||
          (t.artist || '').toLowerCase().includes(searchLower) ||
          (t.source || '').toLowerCase().includes(searchLower) ||
          (t.trackNumber || '').toLowerCase().includes(searchLower) ||
          (t.composer || '').toLowerCase().includes(searchLower) ||
          (t.publisher || '').toLowerCase().includes(searchLower) ||
          (t.library || '').toLowerCase().includes(searchLower) ||
          (t.masterContact || '').toLowerCase().includes(searchLower)
        );
      }
      
      return results.slice(offset, offset + limit);
    }
  }

  /**
   * Delete a track by ID
   */
  deleteTrack(trackId) {
    this.initialize();

    if (this.db) {
      const stmt = this.db.prepare('DELETE FROM tracks WHERE id = ?');
      const result = stmt.run(trackId);
      return { success: result.changes > 0 };
    } else {
      // JSON fallback
      const index = this.jsonData.tracks.findIndex(t => t.id === trackId);
      if (index >= 0) {
        this.jsonData.tracks.splice(index, 1);
        this.saveJsonData();
        return { success: true };
      }
      return { success: false };
    }
  }

  /**
   * Remove duplicate tracks - intelligently merges data before consolidating
   * Rules:
   * 1. Group by normalized track name
   * 2. Merge all data from duplicates (keep best data for each field)
   * 3. Keep the merged record, delete all duplicates
   */
  removeDuplicates() {
    this.initialize();

    if (this.db) {
      // Get all tracks ordered by updated_at desc
      const allTracks = this.db.prepare('SELECT * FROM tracks ORDER BY updated_at DESC').all();
      
      // Group by normalized track name
      const groups = {};
      for (const track of allTracks) {
        const key = this.normalizeTrackName(track.track_name);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(track);
      }

      let removed = 0;
      let merged = 0;

      for (const key of Object.keys(groups)) {
        if (groups[key].length > 1) {
          // Merge all duplicates into the most recent one
          let primary = groups[key][0];
          
          // Merge data from all duplicates
          for (let i = 1; i < groups[key].length; i++) {
            const dupe = groups[key][i];
            
            // Smart merge - fill empty fields from duplicates
            const fields = ['track_number', 'catalog_code', 'library', 'artist', 'source',
                           'composer', 'publisher', 'master_contact', 'use_type', 'duration'];
            
            for (const field of fields) {
              if (!this.hasContent(primary[field]) && this.hasContent(dupe[field])) {
                primary[field] = dupe[field];
              }
            }
            
            // Delete the duplicate
            this.db.prepare('DELETE FROM tracks WHERE id = ?').run(dupe.id);
            removed++;
          }
          
          // Update the primary record with merged data
          const updateStmt = this.db.prepare(`
            UPDATE tracks SET
              track_number = ?,
              catalog_code = ?,
              library = ?,
              artist = ?,
              source = ?,
              composer = ?,
              publisher = ?,
              master_contact = ?,
              use_type = ?,
              duration = ?,
              updated_at = ?
            WHERE id = ?
          `);
          updateStmt.run(
            primary.track_number,
            primary.catalog_code,
            primary.library,
            primary.artist,
            primary.source,
            primary.composer,
            primary.publisher,
            primary.master_contact,
            primary.use_type,
            primary.duration,
            new Date().toISOString(),
            primary.id
          );
          merged++;
        }
      }

      console.log(`[TrackDB] Removed ${removed} duplicates, merged ${merged} records`);
      return { removed, merged };
    } else {
      // JSON fallback
      const groups = {};
      for (const track of this.jsonData.tracks) {
        const key = this.normalizeTrackName(track.trackName);
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(track);
      }

      const newTracks = [];
      let removed = 0;

      for (const key of Object.keys(groups)) {
        if (groups[key].length > 1) {
          // Merge all duplicates
          let merged = { ...groups[key][0] };
          for (let i = 1; i < groups[key].length; i++) {
            const dupe = groups[key][i];
            const fields = ['trackNumber', 'catalogCode', 'library', 'artist', 'source',
                           'composer', 'publisher', 'masterContact', 'useType', 'duration'];
            for (const field of fields) {
              if (!this.hasContent(merged[field]) && this.hasContent(dupe[field])) {
                merged[field] = dupe[field];
              }
            }
            removed++;
          }
          newTracks.push(merged);
        } else {
          newTracks.push(groups[key][0]);
        }
      }

      this.jsonData.tracks = newTracks;
      this.saveJsonData();
      return { removed };
    }
  }

  /**
   * Clear all learned data (tracks, patterns, aliases)
   */
  clearAll() {
    this.initialize();

    if (this.db) {
      this.db.exec('DELETE FROM tracks');
      this.db.exec('DELETE FROM patterns');
      this.db.exec('DELETE FROM aliases');
      return { success: true };
    } else {
      // JSON fallback
      this.jsonData = { tracks: [], patterns: [], aliases: [] };
      this.saveJsonData();
      return { success: true };
    }
  }

  /**
   * Convert SQLite row to track object - ALL fields
   */
  rowToTrack(row) {
    return {
      id: row.id,
      trackName: row.track_name,
      trackNumber: row.track_number,
      catalogCode: row.catalog_code,
      library: row.library,
      label: row.library,  // Alias for cue sheet compatibility
      artist: row.artist,
      source: row.source,
      composer: row.composer,
      publisher: row.publisher,
      masterContact: row.master_contact,
      useType: row.use_type,
      use: row.use_type,  // Alias for cue sheet compatibility
      duration: row.duration,
      confidence: row.confidence,
      dataSource: row.data_source,
      verified: row.verified === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

// Export singleton instance
const trackDatabase = new TrackDatabase();

module.exports = {
  trackDatabase,
  TrackDatabase
};
