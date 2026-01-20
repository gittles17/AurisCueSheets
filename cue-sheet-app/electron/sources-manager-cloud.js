/**
 * Cloud Sources Manager - Hybrid approach for data sources
 * 
 * Features:
 * - Hardcoded defaults for offline/instant startup
 * - Cloud overrides fetched from Supabase
 * - Admin-only management (add, edit, delete)
 * - Real-time sync when sources change
 */

const { supabase, isConfigured, isAdmin } = require('./supabase-client');

// Hardcoded default sources (always available, works offline)
const DEFAULT_SOURCES = {
  // AI Models
  opus: {
    id: 'opus',
    name: 'Claude Opus',
    category: 'ai',
    description: 'AI-powered metadata extraction',
    enabled: true,
    requiresKey: true,
    keyFields: ['apiKey'],
    config: {},
    isDefault: true
  },

  // APIs
  itunes: {
    id: 'itunes',
    name: 'iTunes / Apple Music',
    category: 'apis',
    description: 'Artist, album, and track info',
    enabled: true,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  },
  spotify: {
    id: 'spotify',
    name: 'Spotify',
    category: 'apis',
    description: 'Track and artist metadata',
    enabled: false,
    requiresKey: true,
    keyFields: ['clientId', 'clientSecret'],
    config: {},
    isDefault: true
  },
  musicbrainz: {
    id: 'musicbrainz',
    name: 'MusicBrainz',
    category: 'apis',
    description: 'Open music database',
    enabled: true,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  },
  discogs: {
    id: 'discogs',
    name: 'Discogs',
    category: 'apis',
    description: 'Music catalog database',
    enabled: false,
    requiresKey: true,
    keyFields: ['token'],
    config: {},
    isDefault: true
  },

  // Smart Look-up (browser-based)
  bmg: {
    id: 'bmg',
    name: 'BMG Production Music',
    category: 'smartlookup',
    description: 'Production music library',
    searchUrl: 'https://bmgproductionmusic.com/en-us/search?q=',
    enabled: true,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  },
  apm: {
    id: 'apm',
    name: 'APM Music',
    category: 'smartlookup',
    description: 'Production music library',
    searchUrl: 'https://www.apmmusic.com/search?q=',
    enabled: true,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  },
  extreme: {
    id: 'extreme',
    name: 'Extreme Music',
    category: 'smartlookup',
    description: 'Production music library',
    searchUrl: 'https://www.extrememusic.com/search?term=',
    enabled: false,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  },
  universal: {
    id: 'universal',
    name: 'Universal Production Music',
    category: 'smartlookup',
    description: 'Production music library',
    searchUrl: 'https://www.universalproductionmusic.com/en-us/search?q=',
    enabled: false,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  },
  bmi: {
    id: 'bmi',
    name: 'BMI Repertoire',
    category: 'smartlookup',
    description: 'PRO database',
    searchUrl: 'https://repertoire.bmi.com/Search/Search?searchType=Title&searchTerm=',
    enabled: true,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  },
  ascap: {
    id: 'ascap',
    name: 'ASCAP ACE',
    category: 'smartlookup',
    description: 'PRO database',
    searchUrl: 'https://www.ascap.com/repertory#/ace/search/title/',
    enabled: true,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  },
  sesac: {
    id: 'sesac',
    name: 'SESAC',
    category: 'smartlookup',
    description: 'PRO database',
    searchUrl: 'https://www.sesac.com/repertory/search?query=',
    enabled: false,
    requiresKey: false,
    keyFields: [],
    config: {},
    isDefault: true
  }
};

class CloudSourcesManager {
  constructor() {
    this.cachedSources = null;
    this.realtimeSubscription = null;
    this.changeCallbacks = [];
    this.localConfig = {}; // For storing API keys locally (not in cloud)
  }

  /**
   * Get default sources (always available offline)
   */
  getDefaultSources() {
    return { ...DEFAULT_SOURCES };
  }

  /**
   * Get all sources (merged defaults + cloud overrides)
   */
  async getSources() {
    // Start with defaults
    const merged = this.getDefaultSources();

    // Merge local config (API keys)
    for (const [id, config] of Object.entries(this.localConfig)) {
      if (merged[id]) {
        merged[id].config = { ...merged[id].config, ...config };
      }
    }

    // If Supabase not configured, return defaults + local config
    if (!isConfigured()) {
      return merged;
    }

    try {
      // Fetch cloud overrides
      const { data: cloudSources, error } = await supabase
        .from('data_sources')
        .select('*');

      if (error) {
        console.error('[CloudSources] Error fetching sources:', error);
        return merged;
      }

      // Merge cloud sources with defaults
      for (const cloudSource of cloudSources || []) {
        const existing = merged[cloudSource.id];
        if (existing) {
          // Override default with cloud data (but keep local config like API keys)
          merged[cloudSource.id] = {
            ...existing,
            ...cloudSource,
            config: { ...existing.config, ...cloudSource.config },
            isDefault: true // Still a default, just overridden
          };
        } else {
          // New source from cloud (not a default)
          merged[cloudSource.id] = {
            ...cloudSource,
            isDefault: false
          };
        }
      }

      this.cachedSources = merged;
      return merged;
    } catch (e) {
      console.error('[CloudSources] Error getting sources:', e);
      return merged;
    }
  }

  /**
   * Get a specific source
   */
  async getSource(sourceId) {
    const sources = await this.getSources();
    return sources[sourceId] || null;
  }

  /**
   * Update source configuration (admin only for cloud, anyone for local API keys)
   */
  async updateSource(sourceId, updates) {
    // API keys are always stored locally for security
    if (updates.config) {
      this.localConfig[sourceId] = {
        ...this.localConfig[sourceId],
        ...updates.config
      };
    }

    // If not admin or Supabase not configured, just update local cache
    if (!isConfigured()) {
      if (this.cachedSources && this.cachedSources[sourceId]) {
        this.cachedSources[sourceId] = {
          ...this.cachedSources[sourceId],
          ...updates,
          config: { ...this.cachedSources[sourceId].config, ...updates.config }
        };
      }
      return { success: true, local: true };
    }

    const admin = await isAdmin();
    if (!admin) {
      // Non-admin can only update local config (API keys)
      return { success: true, local: true };
    }

    try {
      // Admin: save to cloud (without sensitive config like API keys)
      const cloudData = {
        id: sourceId,
        name: updates.name,
        category: updates.category,
        description: updates.description,
        search_url: updates.searchUrl,
        enabled: updates.enabled,
        requires_key: updates.requiresKey,
        key_fields: updates.keyFields,
        // Don't store API keys in cloud - only non-sensitive config
        config: {},
        updated_at: new Date().toISOString()
      };

      // Remove undefined values
      Object.keys(cloudData).forEach(key => 
        cloudData[key] === undefined && delete cloudData[key]
      );

      const { error } = await supabase
        .from('data_sources')
        .upsert(cloudData, { onConflict: 'id' });

      if (error) {
        console.error('[CloudSources] Error updating source:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (e) {
      console.error('[CloudSources] Error updating source:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Add a new source (admin only)
   */
  async addSource(source) {
    if (!isConfigured()) {
      return { success: false, error: 'Cloud not configured' };
    }

    const admin = await isAdmin();
    if (!admin) {
      return { success: false, error: 'Admin access required' };
    }

    try {
      const cloudData = {
        id: source.id,
        name: source.name,
        category: source.category,
        description: source.description || '',
        search_url: source.searchUrl || null,
        enabled: source.enabled !== false,
        requires_key: source.requiresKey || false,
        key_fields: source.keyFields || [],
        config: {}
      };

      const { error } = await supabase
        .from('data_sources')
        .insert(cloudData);

      if (error) {
        console.error('[CloudSources] Error adding source:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (e) {
      console.error('[CloudSources] Error adding source:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Delete a source (admin only, can't delete defaults)
   */
  async deleteSource(sourceId) {
    // Can't delete default sources
    if (DEFAULT_SOURCES[sourceId]) {
      return { success: false, error: 'Cannot delete default sources' };
    }

    if (!isConfigured()) {
      return { success: false, error: 'Cloud not configured' };
    }

    const admin = await isAdmin();
    if (!admin) {
      return { success: false, error: 'Admin access required' };
    }

    try {
      const { error } = await supabase
        .from('data_sources')
        .delete()
        .eq('id', sourceId);

      if (error) {
        console.error('[CloudSources] Error deleting source:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (e) {
      console.error('[CloudSources] Error deleting source:', e);
      return { success: false, error: e.message };
    }
  }

  /**
   * Toggle source enabled state
   */
  async toggleSource(sourceId, enabled) {
    return await this.updateSource(sourceId, { enabled });
  }

  /**
   * Subscribe to real-time source changes
   */
  subscribeToSources(callback) {
    this.changeCallbacks.push(callback);

    if (!isConfigured()) return;

    // Only create subscription once
    if (!this.realtimeSubscription) {
      this.realtimeSubscription = supabase
        .channel('sources-changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'data_sources' },
          async (payload) => {
            console.log('[CloudSources] Real-time change:', payload.eventType);
            
            // Refresh cached sources
            const sources = await this.getSources();
            
            // Notify all callbacks
            this.changeCallbacks.forEach(cb => cb({
              type: payload.eventType,
              source: payload.new || payload.old,
              allSources: sources
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
   * Check if current user is admin
   */
  async checkIsAdmin() {
    return await isAdmin();
  }

  /**
   * Get enabled sources
   */
  async getEnabledSources() {
    const sources = await this.getSources();
    return Object.values(sources).filter(s => s.enabled);
  }

  /**
   * Get sources by category
   */
  async getSourcesByCategory(category) {
    const sources = await this.getSources();
    return Object.values(sources).filter(s => s.category === category);
  }

  /**
   * Store API key locally (not in cloud for security)
   */
  setLocalConfig(sourceId, config) {
    this.localConfig[sourceId] = {
      ...this.localConfig[sourceId],
      ...config
    };
  }

  /**
   * Get local config for a source
   */
  getLocalConfig(sourceId) {
    return this.localConfig[sourceId] || {};
  }
}

// Export singleton instance
const cloudSourcesManager = new CloudSourcesManager();

module.exports = {
  cloudSourcesManager,
  CloudSourcesManager,
  DEFAULT_SOURCES
};
