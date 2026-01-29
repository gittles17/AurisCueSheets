import { useState, useEffect } from 'react';
import { CaretRight, CheckCircle, Brain, CloudArrowDown, Globe, Pencil, Trash, Plus, Crown } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLORS = {
  connected: 'bg-auris-green',
  configured: 'bg-auris-orange',
  not_setup: 'bg-auris-text-muted',
  error: 'bg-auris-red'
};

const STATUS_LABELS = {
  connected: 'Connected',
  configured: 'Needs Verification',
  not_setup: 'Not Setup',
  error: 'Error'
};

// Default source definitions (hardcoded for instant display)
const DEFAULT_SOURCE_GROUPS = {
  ai: {
    label: 'AI Models',
    icon: <Brain size={16} weight="duotone" className="text-purple-400" />,
    description: 'AI-powered metadata extraction and enrichment',
    sources: [
      { id: 'opus', name: 'Claude Opus', requiresKey: true, keyFields: ['apiKey'], description: 'Powers AI extraction from web pages' }
    ]
  },
  apis: {
    label: 'APIs',
    icon: <CloudArrowDown size={16} weight="duotone" className="text-blue-400" />,
    description: 'Direct API connections for automatic lookup',
    sources: [
      { id: 'itunes', name: 'iTunes / Apple Music', requiresKey: false, description: 'Artist, album, and track info' },
      { id: 'musicbrainz', name: 'MusicBrainz', requiresKey: false, description: 'Open music database' }
    ]
  },
  smartlookup: {
    label: 'Smart Look-up',
    icon: <Globe size={16} weight="duotone" className="text-green-400" />,
    description: 'Browser-based lookup for sources without APIs',
    sources: [
      { id: 'bmg', name: 'BMG Production Music', requiresKey: false, description: 'Production music library' },
      { id: 'bmi', name: 'BMI Repertoire', requiresKey: false, description: 'PRO database' },
      { id: 'ascap', name: 'ASCAP ACE', requiresKey: false, description: 'PRO database' }
    ]
  }
};

function SourcesPanel({ sources, onConfigureSource, onToggleSource, onTestConnection, onAddSource, onEditSource, onDeleteSource }) {
  const { isAdmin } = useAuth();
  const [expandedSections, setExpandedSections] = useState(new Set(['ai', 'apis', 'smartlookup']));
  const [cloudSources, setCloudSources] = useState({});
  const [sourceGroups, setSourceGroups] = useState(DEFAULT_SOURCE_GROUPS);

  // Fetch cloud sources on mount and subscribe to changes
  useEffect(() => {
    const fetchCloudSources = async () => {
      try {
        const cloudData = await window.electronAPI.cloudSourcesGet();
        if (cloudData) {
          setCloudSources(cloudData);
          // Update source groups with cloud data
          updateSourceGroups(cloudData);
        }
      } catch (err) {
        console.log('[SourcesPanel] Using default sources');
      }
    };

    fetchCloudSources();

    // Subscribe to cloud source changes
    window.electronAPI.onSourcesChange((change) => {
      console.log('[SourcesPanel] Source change:', change.type);
      if (change.allSources) {
        setCloudSources(change.allSources);
        updateSourceGroups(change.allSources);
      }
    });

    return () => {
      window.electronAPI.removeSourcesChangeListener();
    };
  }, []);

  // Update source groups with cloud data
  const updateSourceGroups = (cloudData) => {
    const updatedGroups = { ...DEFAULT_SOURCE_GROUPS };
    
    // Add any new cloud sources that aren't in defaults
    Object.entries(cloudData).forEach(([id, source]) => {
      const category = source.category || 'smartlookup';
      const existingSource = updatedGroups[category]?.sources.find(s => s.id === id);
      
      if (!existingSource && category in updatedGroups) {
        // New cloud source, add it
        updatedGroups[category].sources.push({
          id,
          name: source.name,
          requiresKey: source.requiresKey || source.requires_key,
          keyFields: source.keyFields || source.key_fields || [],
          description: source.description,
          searchUrl: source.searchUrl || source.search_url,
          isCloud: true
        });
      }
    });
    
    setSourceGroups(updatedGroups);
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const getSourceData = (sourceId) => {
    // Merge cloud sources with local sources - local takes precedence for enabled state
    const cloudSource = cloudSources[sourceId];
    const localSource = sources?.[sourceId];
    
    return {
      ...cloudSource,
      ...localSource,
      // Local enabled state takes precedence (updated via toggle)
      enabled: localSource?.enabled ?? cloudSource?.enabled ?? false,
      status: localSource?.status || cloudSource?.status || 'not_setup',
      config: localSource?.config || cloudSource?.config || {}
    };
  };

  const handleToggle = async (sourceId, enabled) => {
    // Optimistic update - update UI immediately
    setCloudSources(prev => ({
      ...prev,
      [sourceId]: { ...prev[sourceId], enabled }
    }));
    
    // Call local toggle
    onToggleSource?.(sourceId, enabled);
    
    // Then sync to cloud (fire and forget)
    if (isAdmin && window.electronAPI?.cloudSourcesToggle) {
      try {
        await window.electronAPI.cloudSourcesToggle(sourceId, enabled);
      } catch (err) {
        console.error('[SourcesPanel] Cloud toggle error:', err);
      }
    }
  };

  const handleDelete = async (sourceId, sourceName) => {
    if (!confirm(`Are you sure you want to delete "${sourceName}"?`)) {
      return;
    }
    
    // Optimistic update - remove from UI immediately
    setSourceGroups(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        updated[key] = {
          ...updated[key],
          sources: updated[key].sources.filter(s => s.id !== sourceId)
        };
      }
      return updated;
    });
    setCloudSources(prev => {
      const updated = { ...prev };
      delete updated[sourceId];
      return updated;
    });
    
    // Then sync to cloud (fire and forget)
    try {
      await window.electronAPI.cloudSourcesDelete(sourceId);
    } catch (err) {
      console.error('[SourcesPanel] Delete error:', err);
      // Could restore here if needed, but for now just log
    }
  };

  const renderSource = (sourceDef, groupKey) => {
    const sourceData = getSourceData(sourceDef.id);
    const statusColor = STATUS_COLORS[sourceData.status] || STATUS_COLORS.not_setup;
    const statusLabel = STATUS_LABELS[sourceData.status] || 'Unknown';
    const isCloudSource = sourceDef.isCloud || !DEFAULT_SOURCE_GROUPS[groupKey]?.sources.find(s => s.id === sourceDef.id);

    return (
      <div 
        key={sourceDef.id}
        className="flex items-center justify-between py-2 px-2 hover:bg-auris-bg/50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Status Dot */}
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor}`} />
          
          {/* Name and Description */}
          <div className="min-w-0">
            <span className="text-sm block">
              {sourceDef.name}
              {isCloudSource && (
                <span className="ml-1.5 text-[9px] text-auris-blue px-1 py-0.5 bg-auris-blue/10 rounded">
                  Custom
                </span>
              )}
            </span>
            {sourceDef.description && (
              <span className="text-[10px] text-auris-text-muted block truncate">
                {sourceDef.description}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {/* Status Label */}
          <span className={`text-[10px] ${
            sourceData.status === 'connected' ? 'text-auris-green' :
            sourceData.status === 'error' ? 'text-auris-red' :
            'text-auris-text-muted'
          }`}>
            {statusLabel}
          </span>

          {/* Configure Button (for sources that need API keys) */}
          {sourceDef.requiresKey && (
            <button
              onClick={() => onConfigureSource?.(sourceDef.id)}
              className="text-[10px] text-auris-blue hover:text-auris-blue-light transition-colors px-1.5 py-0.5 rounded bg-auris-blue/10"
            >
              {sourceData.config?.apiKey || sourceData.config?.clientId ? 'Edit' : 'Setup'}
            </button>
          )}

          {/* Admin Controls */}
          {isAdmin && (
            <>
              <button
                onClick={() => onEditSource?.(sourceDef.id)}
                className="p-1 text-auris-text-muted hover:text-auris-text rounded transition-colors"
                title="Edit source"
              >
                <Pencil size={12} />
              </button>
              {isCloudSource && (
                <button
                  onClick={() => handleDelete(sourceDef.id, sourceDef.name)}
                  className="p-1 text-auris-text-muted hover:text-red-400 rounded transition-colors"
                  title="Delete source"
                >
                  <Trash size={12} />
                </button>
              )}
            </>
          )}

          {/* Toggle Switch */}
          <button
            onClick={() => handleToggle(sourceDef.id, !sourceData.enabled)}
            className={`
              relative w-8 h-4 rounded-full transition-colors flex-shrink-0
              ${sourceData.enabled ? 'bg-auris-blue' : 'bg-auris-card'}
            `}
          >
            <span 
              className={`
                absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform
                ${sourceData.enabled ? 'left-[18px]' : 'left-0.5'}
              `}
            />
          </button>
        </div>
      </div>
    );
  };

  const renderGroup = (groupKey, group) => {
    const isExpanded = expandedSections.has(groupKey);
    const allGroupSources = group.sources.map(s => getSourceData(s.id));
    const enabledCount = allGroupSources.filter(s => s.enabled).length;
    const connectedCount = allGroupSources.filter(s => s.status === 'connected').length;

    return (
      <div key={groupKey} className="mb-4">
        {/* Group Header */}
        <button
          onClick={() => toggleSection(groupKey)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-auris-card rounded-lg transition-colors"
        >
          <div className="flex items-center gap-2">
            <CaretRight 
              size={14} 
              weight="bold" 
              className={`text-auris-text-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            />
            {group.icon}
            <div className="text-left">
              <span className="text-sm font-medium">{group.label}</span>
              <p className="text-[10px] text-auris-text-muted">{group.description}</p>
            </div>
          </div>
          <span className="text-xs text-auris-text-muted">
            {connectedCount}/{group.sources.length}
          </span>
        </button>

        {/* Group Sources */}
        {isExpanded && (
          <div className="mt-1 ml-6 border-l border-auris-border/50 pl-3">
            {group.sources.map(s => renderSource(s, groupKey))}
            
            {/* Admin: Add Source Button */}
            {isAdmin && (
              <button
                onClick={() => onAddSource?.(groupKey)}
                className="w-full flex items-center gap-2 py-2 px-2 text-sm text-auris-text-muted hover:text-auris-text hover:bg-auris-bg/50 rounded-lg transition-colors"
              >
                <Plus size={14} />
                <span>Add {groupKey === 'ai' ? 'AI Model' : groupKey === 'apis' ? 'API' : 'Smart Look-up'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Calculate overall stats
  const allSources = Object.values(sourceGroups).flatMap(g => g.sources);
  const totalConnected = allSources.filter(s => getSourceData(s.id)?.status === 'connected').length;
  const totalEnabled = allSources.filter(s => getSourceData(s.id)?.enabled).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-auris-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold mb-0.5">Data Sources</h2>
              {isAdmin && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 px-1.5 py-0.5 bg-amber-400/10 rounded">
                  <Crown size={10} weight="fill" />
                  Admin
                </span>
              )}
            </div>
            <p className="text-xs text-auris-text-muted">
              {isAdmin 
                ? 'Manage sources for all users' 
                : 'Configure AI, APIs, and browser-based lookups'}
            </p>
          </div>
          
          {/* Stats */}
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-auris-green" />
              <span className="text-xs text-auris-text-secondary">
                {totalConnected}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-auris-blue" />
              <span className="text-xs text-auris-text-secondary">
                {totalEnabled}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto p-3">
        {Object.entries(sourceGroups).map(([key, group]) => renderGroup(key, group))}
      </div>

      {/* Test All Button */}
      <div className="p-3 border-t border-auris-border">
        <button
          onClick={() => onTestConnection?.('all')}
          className="w-full btn btn-secondary text-sm"
        >
          <CheckCircle size={18} weight="thin" className="mr-2" />
          Test All Connections
        </button>
      </div>
    </div>
  );
}

export default SourcesPanel;
