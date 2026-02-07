import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Database, Gear, Info, X, CircleNotch, Eye, EyeSlash, Check, Table, Trash, MagnifyingGlass, Warning, ChatCircle, Pencil, Lightning, Brain } from '@phosphor-icons/react';
import SourcesPanel from './SourcesPanel';
import AddSourceModal from './AddSourceModal';
import AdminFeedbackPanel from './AdminFeedbackPanel';
import EditTrackModal from './EditTrackModal';
import { useAuth } from '../contexts/AuthContext';

function SettingsModal({ isOpen, onClose, sources, onUpdateSources }) {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('general');
  const [configModal, setConfigModal] = useState(null);
  const [configValues, setConfigValues] = useState({});
  const [isTesting, setIsTesting] = useState(false);
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  // Voyage AI state
  const [voyageApiKey, setVoyageApiKey] = useState('');
  const [showVoyageApiKey, setShowVoyageApiKey] = useState(false);
  const [voyageApiKeySaved, setVoyageApiKeySaved] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedProgress, setEmbedProgress] = useState(null);
  const [trackCounts, setTrackCounts] = useState({ total: 0, withEmbedding: 0 });
  
  // Learned data tab state
  const [learnedTracks, setLearnedTracks] = useState([]);
  const [trackSearch, setTrackSearch] = useState('');
  const [isLoadingTracks, setIsLoadingTracks] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');
  
  // Add/Edit source modal state
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [editSourceId, setEditSourceId] = useState(null);
  const [addSourceCategory, setAddSourceCategory] = useState('smartlookup');
  
  // Edit track modal state
  const [showEditTrackModal, setShowEditTrackModal] = useState(false);
  const [editingTrack, setEditingTrack] = useState(null);
  
  // Patterns tab state
  const [patterns, setPatterns] = useState([]);
  const [isLoadingPatterns, setIsLoadingPatterns] = useState(false);

  // Track mounting for safe portal usage
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setConfigModal(null);
      setConfigValues({});
    }
  }, [isOpen]);

  // Load Claude API key from sources when modal opens
  useEffect(() => {
    if (isOpen && sources?.opus?.config?.apiKey) {
      setClaudeApiKey(sources.opus.config.apiKey);
    }
    if (isOpen && sources?.voyage?.config?.apiKey) {
      setVoyageApiKey(sources.voyage.config.apiKey);
    }
  }, [isOpen, sources]);
  
  // Listen for embedding progress
  useEffect(() => {
    if (!window.electronAPI?.onVoyageEmbedProgress) return;
    window.electronAPI.onVoyageEmbedProgress(setEmbedProgress);
    return () => window.electronAPI.removeVoyageEmbedProgressListener?.();
  }, []);
  
  // Load track counts when settings opens
  useEffect(() => {
    if (isOpen && activeTab === 'general' && window.electronAPI?.voyageGetTrackCount) {
      window.electronAPI.voyageGetTrackCount().then(setTrackCounts);
    }
  }, [isOpen, activeTab]);

  // Load learned tracks from cloud (single source of truth)
  const loadLearnedTracks = useCallback(async (search = '') => {
    setIsLoadingTracks(true);
    try {
      // Cloud is the single source of truth
      const cloudTracks = await window.electronAPI?.cloudTrackGetAll?.({ search, limit: 500 }) || [];
      
      // Normalize cloud track fields to match expected format
      const normalizedTracks = cloudTracks.map(track => ({
        id: track.id,
        trackName: track.track_name || track.trackName,
        trackNumber: track.track_number || track.trackNumber,
        catalogCode: track.catalog_code || track.catalogCode,
        library: track.library,
        artist: track.artist,
        source: track.source,
        composer: track.composer,
        publisher: track.publisher,
        masterContact: track.master_contact || track.masterContact,
        useType: track.use_type || track.useType,
        dataSource: track.data_source || 'cloud',
        updatedAt: track.updated_at
      }));
      
      setLearnedTracks(normalizedTracks);
    } catch (error) {
      console.error('Failed to load tracks:', error);
      setLearnedTracks([]);
    } finally {
      setIsLoadingTracks(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'learned') {
      loadLearnedTracks(trackSearch);
    }
  }, [isOpen, activeTab, loadLearnedTracks]);

  // Load patterns
  const loadPatterns = useCallback(async () => {
    setIsLoadingPatterns(true);
    try {
      const patternsData = await window.electronAPI?.patternGetAll?.() || [];
      setPatterns(patternsData);
    } catch (error) {
      console.error('Failed to load patterns:', error);
      setPatterns([]);
    } finally {
      setIsLoadingPatterns(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'patterns') {
      loadPatterns();
    }
  }, [isOpen, activeTab, loadPatterns]);

  const handleDeletePattern = async (patternId) => {
    // Optimistic update
    setPatterns(prev => prev.filter(p => p.id !== patternId));
    
    // Delete from backend
    window.electronAPI?.patternDelete?.(patternId).catch(err => {
      console.error('Failed to delete pattern:', err);
    });
  };

  const formatCondition = (condition) => {
    if (!condition) return '-';
    const parts = [];
    if (condition.library_contains) parts.push(`Library contains "${condition.library_contains}"`);
    if (condition.library) parts.push(`Library = "${condition.library}"`);
    if (condition.catalog_code_prefix) parts.push(`Catalog starts with "${condition.catalog_code_prefix}"`);
    if (condition.track_type) parts.push(`Track type = "${condition.track_type}"`);
    return parts.join(', ') || JSON.stringify(condition);
  };

  const formatAction = (action) => {
    if (!action) return '-';
    if (action.value) return `Set ${action.field} to "${action.value}"`;
    if (action.copy_from) return `Copy ${action.copy_from} to ${action.field}`;
    return JSON.stringify(action);
  };

  // Debounced search for learned tracks
  useEffect(() => {
    if (activeTab !== 'learned') return;
    const timeout = setTimeout(() => {
      loadLearnedTracks(trackSearch);
    }, 300);
    return () => clearTimeout(timeout);
  }, [trackSearch, activeTab, loadLearnedTracks]);

  const handleDeleteTrack = async (trackId) => {
    // Optimistic update - remove from UI immediately
    setLearnedTracks(prev => prev.filter(t => t.id !== trackId));
    
    // Then delete from cloud in background
    if (window.electronAPI?.cloudTrackDelete) {
      window.electronAPI.cloudTrackDelete(trackId).catch(err => {
        console.error('Failed to delete track:', err);
        // Could restore the track here if needed
      });
    }
  };

  const handleEditTrack = (track) => {
    setEditingTrack(track);
    setShowEditTrackModal(true);
  };

  const handleTrackSaved = (updatedTrack) => {
    // Update the track in the local list
    setLearnedTracks(prev => prev.map(t => 
      t.id === updatedTrack.id ? { ...t, ...updatedTrack } : t
    ));
  };

  const handleEditTrackClose = (saved) => {
    setShowEditTrackModal(false);
    setEditingTrack(null);
    // Reload tracks if saved to get fresh data
    if (saved) {
      loadLearnedTracks();
    }
  };

  const handleClearAllTracks = async () => {
    // Optimistic update - clear UI immediately
    setLearnedTracks([]);
    setShowClearConfirm(false);
    setClearConfirmText('');
    
    // Then clear from cloud in background
    if (window.electronAPI?.cloudTrackClearAll) {
      window.electronAPI.cloudTrackClearAll().catch(err => {
        console.error('Failed to clear tracks:', err);
      });
    }
  };

  if (!isOpen || !mounted) return null;

  const handleConfigureSource = (sourceId) => {
    const sourceConfig = sources[sourceId]?.config || {};
    setConfigValues(sourceConfig);
    setConfigModal(sourceId);
  };

  const handleSaveConfig = async () => {
    if (configModal && window.electronAPI) {
      try {
        await window.electronAPI.updateSourceConfig(configModal, configValues);
        await window.electronAPI.testConnection(configModal);
        const updatedSources = await window.electronAPI.getSources();
        onUpdateSources?.(updatedSources);
        setConfigModal(null);
        setConfigValues({});
      } catch (error) {
        console.error('Failed to save config:', error);
      }
    }
  };

  const handleToggleSource = async (sourceId, enabled) => {
    if (window.electronAPI) {
      await window.electronAPI.toggleSource(sourceId, enabled);
      const updatedSources = await window.electronAPI.getSources();
      onUpdateSources?.(updatedSources);
    }
  };

  const handleTestConnection = async (sourceId) => {
    setIsTesting(true);
    try {
      if (window.electronAPI) {
        if (sourceId === 'all') {
          await window.electronAPI.testAllConnections();
        } else {
          await window.electronAPI.testConnection(sourceId);
        }
        const updatedSources = await window.electronAPI.getSources();
        onUpdateSources?.(updatedSources);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddSource = (category) => {
    setAddSourceCategory(category);
    setEditSourceId(null);
    setShowAddSourceModal(true);
  };

  const handleEditSource = async (sourceId) => {
    // Fetch source data for editing
    try {
      const cloudSources = await window.electronAPI.cloudSourcesGet();
      const sourceData = cloudSources?.[sourceId];
      setEditSourceId(sourceData || { id: sourceId });
      setShowAddSourceModal(true);
    } catch (err) {
      console.error('Failed to load source for editing:', err);
    }
  };

  const handleAddSourceClose = (success) => {
    setShowAddSourceModal(false);
    setEditSourceId(null);
    // Refresh sources if save was successful
    if (success && window.electronAPI) {
      window.electronAPI.getSources().then(updatedSources => {
        onUpdateSources?.(updatedSources);
      });
    }
  };

  const handleSaveClaudeApiKey = async () => {
    if (window.electronAPI) {
      await window.electronAPI.updateSourceConfig('opus', { apiKey: claudeApiKey });
      await window.electronAPI.testConnection('opus');
      const updatedSources = await window.electronAPI.getSources();
      onUpdateSources?.(updatedSources);
      setApiKeySaved(true);
      setTimeout(() => setApiKeySaved(false), 2000);
    }
  };
  
  const handleSaveVoyageApiKey = async () => {
    if (window.electronAPI) {
      await window.electronAPI.updateSourceConfig('voyage', { apiKey: voyageApiKey });
      const updatedSources = await window.electronAPI.getSources();
      onUpdateSources?.(updatedSources);
      setVoyageApiKeySaved(true);
      setTimeout(() => setVoyageApiKeySaved(false), 2000);
    }
  };
  
  const handleEmbedMissing = async (forceAll = false) => {
    if (!window.electronAPI?.voyageEmbedMissing) return;
    setIsEmbedding(true);
    setEmbedProgress(null);
    try {
      const result = await window.electronAPI.voyageEmbedMissing(forceAll);
      if (result.success) {
        setEmbedProgress({ ...result, done: true });
        // Refresh track counts
        if (window.electronAPI?.voyageGetTrackCount) {
          const counts = await window.electronAPI.voyageGetTrackCount();
          setTrackCounts(counts);
        }
      }
    } catch (err) {
      console.error('[Voyage] Embed error:', err);
    }
    setIsEmbedding(false);
  };

  const getConfigFields = (sourceId) => {
    switch (sourceId) {
      case 'opus':
        return [
          { key: 'apiKey', label: 'Anthropic API Key', type: 'password', placeholder: 'sk-ant-api03-...' }
        ];
      case 'spotify':
        return [
          { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Enter Spotify Client ID' },
          { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Enter Spotify Client Secret' }
        ];
      case 'discogs':
        return [
          { key: 'token', label: 'Personal Access Token', type: 'password', placeholder: 'Enter Discogs Token' }
        ];
      default:
        // For custom sources, provide a generic API key field
        return [
          { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Enter API key' }
        ];
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: <Gear size={18} weight="thin" /> },
    { id: 'learned', label: 'Learned Data', icon: <Table size={18} weight="thin" /> },
    { id: 'patterns', label: 'Patterns', icon: <Brain size={18} weight="thin" /> },
    { id: 'sources', label: 'Sources', icon: <Database size={18} weight="thin" /> },
    ...(isAdmin ? [{ id: 'feedback', label: 'Feedback', icon: <ChatCircle size={18} weight="thin" /> }] : []),
    { id: 'about', label: 'About', icon: <Info size={18} weight="thin" /> }
  ];

  // Get Opus connection status
  const opusStatus = sources?.opus?.status;
  const isOpusConnected = opusStatus === 'connected';
  
  return createPortal(
    <>
      <div 
        className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center"
        style={{ zIndex: 99999 }}
        onClick={onClose}
      >
        <div 
          onClick={(e) => e.stopPropagation()}
          className={`bg-auris-bg-secondary border border-auris-border rounded-xl shadow-2xl max-h-[80vh] flex overflow-hidden transition-all ${
            activeTab === 'learned' ? 'w-[95vw] max-w-[1400px]' : activeTab === 'patterns' ? 'w-[900px]' : 'w-[700px]'
          }`}
        >
          {/* Sidebar */}
          <div className="w-40 bg-auris-bg border-r border-auris-border p-2">
            <h2 className="text-xs font-semibold text-auris-text-muted px-3 py-2 uppercase tracking-wider">
              Settings
            </h2>
            <nav className="mt-1 space-y-0.5">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors
                    ${activeTab === tab.id 
                      ? 'bg-auris-blue/20 text-auris-blue' 
                      : 'text-auris-text-secondary hover:bg-auris-card hover:text-auris-text'
                    }
                  `}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-auris-border">
              <h1 className="text-base font-semibold">
                {tabs.find(t => t.id === activeTab)?.label}
              </h1>
              <button
                onClick={onClose}
                className="p-1 hover:bg-auris-card rounded transition-colors text-auris-text-secondary hover:text-white"
              >
                <X size={18} weight="thin" />
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'general' && (
                <div className="p-4">
                  {/* Claude API Key - Primary setting */}
                  <div className="bg-auris-card/50 rounded-lg p-4 border border-auris-border">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium">Claude API Key</h3>
                      {isOpusConnected ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-auris-green-dim text-auris-green">
                          Connected
                        </span>
                      ) : claudeApiKey ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-auris-orange-dim text-auris-orange">
                          Not verified
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-auris-text-muted mb-3">
                      Powers AI-assisted metadata extraction
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showApiKey ? 'text' : 'password'}
                          value={claudeApiKey}
                          onChange={(e) => setClaudeApiKey(e.target.value)}
                          placeholder="sk-ant-api03-..."
                          className="input w-full pr-8 font-mono text-xs py-2"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(!showApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-auris-text-muted hover:text-auris-text transition-colors"
                        >
                          {showApiKey ? <EyeSlash size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={handleSaveClaudeApiKey}
                        className="btn btn-primary px-3 py-2 text-xs"
                        disabled={!claudeApiKey}
                      >
                        {apiKeySaved ? (
                          <span className="flex items-center gap-1">
                            <Check size={14} weight="bold" />
                            Saved
                          </span>
                        ) : (
                          'Save'
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-auris-text-muted mt-2">
                      Get your key at{' '}
                      <a 
                        href="https://console.anthropic.com/settings/keys" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-auris-blue hover:underline"
                      >
                        console.anthropic.com
                      </a>
                    </p>
                  </div>
                  
                  {/* Voyage AI API Key */}
                  <div className="bg-auris-card/50 rounded-lg p-4 border border-auris-border mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-medium">Voyage AI API Key</h3>
                      {voyageApiKey ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-auris-green-dim text-auris-green">
                          Configured
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-auris-text-muted mb-3">
                      Fast vector search for track lookups (optional)
                    </p>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type={showVoyageApiKey ? 'text' : 'password'}
                          value={voyageApiKey}
                          onChange={(e) => setVoyageApiKey(e.target.value)}
                          placeholder="pa-..."
                          className="input w-full pr-8 font-mono text-xs py-2"
                        />
                        <button
                          type="button"
                          onClick={() => setShowVoyageApiKey(!showVoyageApiKey)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-auris-text-muted hover:text-auris-text transition-colors"
                        >
                          {showVoyageApiKey ? <EyeSlash size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                      <button
                        onClick={handleSaveVoyageApiKey}
                        className="btn btn-primary px-3 py-2 text-xs"
                        disabled={!voyageApiKey}
                      >
                        {voyageApiKeySaved ? (
                          <span className="flex items-center gap-1">
                            <Check size={14} weight="bold" />
                            Saved
                          </span>
                        ) : (
                          'Save'
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-auris-text-muted mt-2">
                      Get your key at{' '}
                      <a 
                        href="https://dash.voyageai.com/api-keys" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-auris-blue hover:underline"
                      >
                        dash.voyageai.com
                      </a>
                    </p>
                    
                    {/* Embed existing tracks button */}
                    {voyageApiKey && (
                      <div className="mt-3 pt-3 border-t border-auris-border/50">
                        <div className="mb-2">
                          <p className="text-xs text-auris-text">Vector Embeddings</p>
                          <p className="text-[10px] text-auris-text-muted">
                            {trackCounts.total > 0 
                              ? `${trackCounts.withEmbedding} of ${trackCounts.total} tracks have embeddings`
                              : 'No tracks in Supabase database yet'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEmbedMissing(false)}
                            disabled={isEmbedding || trackCounts.total === 0}
                            className="btn btn-secondary px-3 py-1.5 text-xs flex-1"
                          >
                            {isEmbedding ? (
                              <span className="flex items-center justify-center gap-1.5">
                                <CircleNotch size={12} className="animate-spin" />
                                {embedProgress ? `${embedProgress.percent}%` : 'Starting...'}
                              </span>
                            ) : embedProgress?.done ? (
                              <span className="flex items-center justify-center gap-1">
                                <Check size={12} weight="bold" />
                                Done ({embedProgress.embedded})
                              </span>
                            ) : (
                              `Embed Missing (${trackCounts.total - trackCounts.withEmbedding})`
                            )}
                          </button>
                          <button
                            onClick={() => handleEmbedMissing(true)}
                            disabled={isEmbedding || trackCounts.total === 0}
                            className="btn btn-secondary px-3 py-1.5 text-xs"
                            title="Re-generate embeddings for all tracks"
                          >
                            Re-embed All
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'learned' && (
                <div className="flex flex-col h-full">
                  {/* Search Bar */}
                  <div className="p-3 border-b border-auris-border">
                    <div className="relative">
                      <MagnifyingGlass 
                        size={14} 
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-auris-text-muted" 
                      />
                      <input
                        type="text"
                        value={trackSearch}
                        onChange={(e) => setTrackSearch(e.target.value)}
                        placeholder="Search tracks, composers, publishers..."
                        className="w-full bg-auris-bg border border-auris-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-auris-text placeholder:text-auris-text-muted/50 focus:outline-none focus:border-auris-text-muted/50"
                      />
                    </div>
                  </div>

                  {/* Table */}
                  <div className="flex-1 overflow-auto">
                    {isLoadingTracks ? (
                      <div className="flex items-center justify-center py-8">
                        <CircleNotch size={20} className="text-auris-blue animate-spin" />
                      </div>
                    ) : learnedTracks.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-auris-text-muted">
                        <Database size={32} weight="thin" className="mb-2 opacity-50" />
                        <p className="text-sm">No learned data yet</p>
                        <p className="text-xs mt-1">Track info will appear here as you approve cue sheets</p>
                      </div>
                    ) : (
                      <table className="w-full text-xs table-fixed">
                        <thead className="bg-auris-bg sticky top-0">
                          <tr className="text-left text-auris-text-muted">
                            <th className="px-3 py-2 font-medium w-[20%]">Track Name</th>
                            <th className="px-3 py-2 font-medium w-[12%]">Artist</th>
                            <th className="px-3 py-2 font-medium w-[14%]">Source</th>
                            <th className="px-3 py-2 font-medium w-[6%]">Track #</th>
                            <th className="px-3 py-2 font-medium w-[16%]">Composer</th>
                            <th className="px-3 py-2 font-medium w-[16%]">Publisher</th>
                            <th className="px-3 py-2 font-medium w-[12%]">Master/Label/Library</th>
                            <th className="px-2 py-2 font-medium w-[4%]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-auris-border/50">
                          {learnedTracks.map(track => (
                            <tr 
                              key={track.id} 
                              className="hover:bg-auris-card/50 transition-colors cursor-pointer group"
                              onClick={() => handleEditTrack(track)}
                            >
                              <td className="px-3 py-2 text-auris-text truncate" title={track.trackName}>
                                {track.trackName}
                              </td>
                              <td className="px-3 py-2 text-auris-text-secondary truncate" title={track.artist}>
                                {track.artist || '-'}
                              </td>
                              <td className="px-3 py-2 text-auris-text-secondary truncate" title={track.source}>
                                {track.source || '-'}
                              </td>
                              <td className="px-3 py-2 text-auris-text-secondary truncate" title={track.trackNumber}>
                                {track.trackNumber || '-'}
                              </td>
                              <td className="px-3 py-2 text-auris-text-secondary truncate" title={track.composer}>
                                {track.composer || '-'}
                              </td>
                              <td className="px-3 py-2 text-auris-text-secondary truncate" title={track.publisher}>
                                {track.publisher || '-'}
                              </td>
                              <td className="px-3 py-2 text-auris-text-secondary truncate" title={track.library || track.label}>
                                {track.library || track.label || '-'}
                              </td>
                              <td className="px-1 py-2">
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditTrack(track);
                                    }}
                                    className="p-1 rounded hover:bg-auris-blue/20 text-auris-text-muted hover:text-auris-blue transition-colors opacity-0 group-hover:opacity-100"
                                    title="Edit"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteTrack(track.id);
                                    }}
                                    className="p-1 rounded hover:bg-auris-red/20 text-auris-text-muted hover:text-auris-red transition-colors opacity-0 group-hover:opacity-100"
                                    title="Delete"
                                  >
                                    <Trash size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-3 py-2 border-t border-auris-border flex items-center justify-between">
                    <span className="text-xs text-auris-text-muted">
                      {learnedTracks.length} track{learnedTracks.length !== 1 ? 's' : ''} (auto-synced)
                    </span>
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      disabled={learnedTracks.length === 0}
                      className="text-xs text-auris-red/60 hover:text-auris-red disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      Clear All Data
                    </button>
                  </div>
                </div>
              )}

              {activeTab === 'patterns' && (
                <div className="flex flex-col h-full">
                  {/* Header info */}
                  <div className="p-4 border-b border-auris-border bg-auris-card/30">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightning size={16} className="text-auris-blue" weight="fill" />
                      <h3 className="text-sm font-medium">Learned Patterns</h3>
                    </div>
                    <p className="text-xs text-auris-text-muted">
                      Auris learns from your cue sheet work and auto-fills fields based on these patterns.
                      High-confidence patterns (85%+) are applied automatically.
                    </p>
                  </div>

                  {/* Patterns table */}
                  <div className="flex-1 overflow-auto">
                    {isLoadingPatterns ? (
                      <div className="flex items-center justify-center py-8">
                        <CircleNotch size={20} className="text-auris-blue animate-spin" />
                      </div>
                    ) : patterns.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-auris-text-muted">
                        <Brain size={40} weight="thin" className="mb-3 opacity-40" />
                        <p className="text-sm font-medium">No patterns learned yet</p>
                        <p className="text-xs mt-1 text-center max-w-xs">
                          As you fill in cue sheets and approve tracks, Auris will learn patterns
                          like "BMG tracks usually have artist = N/A"
                        </p>
                      </div>
                    ) : (
                      <table className="w-full text-xs">
                        <thead className="bg-auris-bg sticky top-0">
                          <tr className="text-left text-auris-text-muted border-b border-auris-border">
                            <th className="px-4 py-2.5 font-medium">Condition</th>
                            <th className="px-4 py-2.5 font-medium">Action</th>
                            <th className="px-4 py-2.5 font-medium w-20 text-center">Confidence</th>
                            <th className="px-4 py-2.5 font-medium w-16 text-center">Used</th>
                            <th className="px-4 py-2.5 font-medium w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-auris-border/30">
                          {patterns.map(pattern => (
                            <tr key={pattern.id} className="hover:bg-auris-card/30 transition-colors group">
                              <td className="px-4 py-3">
                                <span className="text-auris-text">{formatCondition(pattern.condition)}</span>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-auris-text-secondary">{formatAction(pattern.action)}</span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`
                                  inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-medium
                                  ${pattern.confidence >= 0.85 
                                    ? 'bg-auris-green/10 text-auris-green' 
                                    : pattern.confidence >= 0.5 
                                      ? 'bg-auris-orange/10 text-auris-orange'
                                      : 'bg-auris-text-muted/10 text-auris-text-muted'
                                  }
                                `}>
                                  {Math.round(pattern.confidence * 100)}%
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center text-auris-text-muted">
                                {pattern.times_applied || 0}
                              </td>
                              <td className="px-2 py-3">
                                <button
                                  onClick={() => handleDeletePattern(pattern.id)}
                                  className="p-1.5 rounded hover:bg-auris-red/10 text-auris-text-muted hover:text-auris-red transition-colors opacity-0 group-hover:opacity-100"
                                  title="Delete pattern"
                                >
                                  <Trash size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Footer with explanation */}
                  {patterns.length > 0 && (
                    <div className="px-4 py-3 border-t border-auris-border bg-auris-bg/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-auris-text-muted">
                          {patterns.length} pattern{patterns.length !== 1 ? 's' : ''} learned
                        </span>
                        <div className="flex items-center gap-4 text-[10px] text-auris-text-muted">
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-auris-green"></span>
                            85%+ = Auto-fill
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-auris-orange"></span>
                            50-84% = Suggest
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-auris-text-muted/50"></span>
                            &lt;50% = Low
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'sources' && (
                <SourcesPanel 
                  sources={sources}
                  onConfigureSource={handleConfigureSource}
                  onToggleSource={handleToggleSource}
                  onTestConnection={handleTestConnection}
                  onAddSource={handleAddSource}
                  onEditSource={handleEditSource}
                />
              )}

              {activeTab === 'feedback' && isAdmin && (
                <AdminFeedbackPanel />
              )}

              {activeTab === 'about' && (
                <div className="p-6 text-center">
                  <img 
                    src="./auris-wordmark.svg" 
                    alt="Auris" 
                    className="h-8 mx-auto mb-3 opacity-80"
                  />
                  <h3 className="text-base font-semibold mb-1">Auris Cue Sheets</h3>
                  <p className="text-xs text-auris-text-muted mb-3">Version 0.12.0</p>
                  <p className="text-xs text-auris-text-muted">
                    Automated cue sheet generator for Premiere Pro
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Config Modal */}
      {configModal && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          onClick={() => setConfigModal(null)}
        >
          <div 
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-auris-bg-secondary border border-auris-border rounded-xl shadow-2xl w-[360px] p-5 z-[101]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-3">
              Configure {configModal.charAt(0).toUpperCase() + configModal.slice(1)}
            </h3>
            
            <div className="space-y-3">
              {getConfigFields(configModal).map(field => (
                <div key={field.key}>
                  <label className="block text-xs text-auris-text-secondary mb-1">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={configValues[field.key] || ''}
                    onChange={(e) => setConfigValues(prev => ({
                      ...prev,
                      [field.key]: e.target.value
                    }))}
                    placeholder={field.placeholder}
                    className="input w-full text-sm py-2"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setConfigModal(null)}
                className="btn btn-ghost text-sm py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveConfig}
                className="btn btn-primary text-sm py-1.5"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Testing Overlay */}
      {isTesting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]">
          <div className="bg-auris-card rounded-xl p-4 flex items-center gap-3">
            <CircleNotch size={20} weight="thin" className="text-auris-blue animate-spin" />
            <span className="text-sm">Testing...</span>
          </div>
        </div>
      )}

      {/* Clear All Confirmation - Requires typing DELETE */}
      {showClearConfirm && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center"
          style={{ zIndex: 999999 }}
          onClick={() => { setShowClearConfirm(false); setClearConfirmText(''); }}
        >
          <div 
            className="bg-auris-bg-secondary border border-auris-border rounded-xl shadow-2xl w-[400px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-auris-red/20 flex items-center justify-center">
                <Warning size={24} className="text-auris-red" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-auris-red">Danger Zone</h3>
                <p className="text-xs text-auris-text-muted">This action is irreversible</p>
              </div>
            </div>
            <p className="text-sm text-auris-text-muted mb-4">
              This will permanently delete <span className="text-auris-text font-semibold">{learnedTracks.length} tracks</span>, all learned patterns, and aliases from both local and cloud databases.
            </p>
            <div className="bg-auris-bg rounded-lg p-3 mb-4 border border-auris-border">
              <p className="text-xs text-auris-text-muted mb-2">
                Type <span className="font-mono font-bold text-auris-red">DELETE</span> to confirm:
              </p>
              <input
                type="text"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="Type DELETE here"
                className="w-full bg-auris-bg-secondary border border-auris-border rounded px-3 py-2 text-sm text-auris-text placeholder:text-auris-text-muted/50 focus:outline-none focus:border-auris-red/50"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => { setShowClearConfirm(false); setClearConfirmText(''); }}
                className="px-4 py-2 text-sm text-auris-text-muted hover:text-auris-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleClearAllTracks();
                  setClearConfirmText('');
                }}
                disabled={clearConfirmText !== 'DELETE'}
                className="px-4 py-2 text-sm bg-auris-red text-white rounded-lg hover:bg-auris-red/80 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Permanently Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Source Modal */}
      <AddSourceModal
        isOpen={showAddSourceModal}
        onClose={handleAddSourceClose}
        editSource={editSourceId}
        defaultCategory={addSourceCategory}
      />

      {/* Edit Track Modal */}
      <EditTrackModal
        isOpen={showEditTrackModal}
        onClose={handleEditTrackClose}
        track={editingTrack}
        onSave={handleTrackSaved}
      />
    </>,
    document.body
  );
}

export default SettingsModal;
