import { useState, useEffect } from 'react';
import { CheckCircle, CircleNotch, Eye, EyeSlash, Check, Plus, Trash, ArrowClockwise, Warning, Crown } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';

const CATEGORY_LABELS = {
  ai: 'AI Models',
  apis: 'APIs',
  smartlookup: 'Smart Look-up'
};

const CATEGORY_ORDER = ['ai', 'apis', 'smartlookup'];

function SourcesPanel({
  sources,
  onToggleSource,
  onTestConnection,
  onUpdateSources,
  globalKeyValues,
  globalKeyVisibility,
  globalKeySaving,
  globalKeySaved,
  globalKeyError,
  globalKeyTesting,
  globalKeyTestResult,
  isLoadingGlobalKeys,
  keySources,
  setGlobalKeyValues,
  setGlobalKeyVisibility,
  onSaveGlobalKey,
  onTestGlobalKey,
  setGlobalKeyError,
  setGlobalKeyTestResult,
  setKeySources,
  trackCounts,
  isEmbedding,
  embedProgress,
  onEmbedMissing
}) {
  const { isAdmin } = useAuth();
  const [cloudSources, setCloudSources] = useState({});
  const [allSourceDefs, setAllSourceDefs] = useState([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addType, setAddType] = useState('apis');
  const [addName, setAddName] = useState('');
  const [addApiKey, setAddApiKey] = useState('');
  const [addUrl, setAddUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const LEGACY_KEY_NAMES = { opus: 'anthropic_api_key', voyage: 'voyage_api_key' };
  const getGlobalKeyName = (sourceId) => LEGACY_KEY_NAMES[sourceId] || `${sourceId}_api_key`;

  useEffect(() => {
    const fetchCloudSources = async () => {
      try {
        const cloudData = await window.electronAPI.cloudSourcesGet();
        if (cloudData) {
          setCloudSources(cloudData);
          buildSourceList(cloudData);
        }
      } catch {
        buildSourceList({});
      }
    };

    fetchCloudSources();

    window.electronAPI.onSourcesChange((change) => {
      if (change.allSources) {
        setCloudSources(change.allSources);
        buildSourceList(change.allSources);
      }
    });

    return () => {
      window.electronAPI.removeSourcesChangeListener();
    };
  }, []);

  const buildSourceList = (cloudData) => {
    const seen = new Set();
    const list = [];

    Object.entries(cloudData).forEach(([id, source]) => {
      seen.add(id);
      list.push({
        id,
        name: source.name,
        description: source.description || '',
        category: source.category || 'smartlookup',
        requiresKey: source.requiresKey || source.requires_key || false,
        searchUrl: source.searchUrl || source.search_url || '',
        isCloud: !source.isDefault
      });
    });

    setAllSourceDefs(list);
  };

  const getSourceData = (sourceId) => {
    const cloudSource = cloudSources[sourceId];
    const localSource = sources?.[sourceId];
    return {
      ...cloudSource,
      ...localSource,
      enabled: localSource?.enabled ?? cloudSource?.enabled ?? false,
      status: localSource?.status || cloudSource?.status || 'not_setup',
      config: { ...cloudSource?.config, ...localSource?.config }
    };
  };

  const handleToggle = async (sourceId, enabled) => {
    setCloudSources(prev => ({
      ...prev,
      [sourceId]: { ...prev[sourceId], enabled }
    }));
    onToggleSource?.(sourceId, enabled);
    if (isAdmin && window.electronAPI?.cloudSourcesToggle) {
      try {
        await window.electronAPI.cloudSourcesToggle(sourceId, enabled);
      } catch {}
    }
  };

  const handleDelete = async (sourceId, sourceName) => {
    if (!confirm(`Delete "${sourceName}"?`)) return;
    setAllSourceDefs(prev => prev.filter(s => s.id !== sourceId));
    setCloudSources(prev => {
      const updated = { ...prev };
      delete updated[sourceId];
      return updated;
    });
    try {
      await window.electronAPI.cloudSourcesDelete(sourceId);
    } catch {}
  };

  const handleAddSource = async () => {
    if (!addName.trim()) return;
    setIsAdding(true);
    setGlobalKeyError(null);
    try {
      const sourceId = addName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const isApi = addType === 'apis';
      const addResult = await window.electronAPI.cloudSourcesAdd({
        id: sourceId,
        name: addName.trim(),
        category: addType,
        requiresKey: isApi && !!addApiKey.trim(),
        keyFields: isApi && addApiKey.trim() ? ['apiKey'] : [],
        searchUrl: addUrl.trim() || null,
        enabled: true
      });
      if (!addResult?.success && addResult?.error) {
        setGlobalKeyError(addResult.error);
        setTimeout(() => setGlobalKeyError(null), 4000);
        setIsAdding(false);
        return;
      }

      if (isApi && addApiKey.trim()) {
        const keyName = `${sourceId}_api_key`;
        await window.electronAPI.globalKeysSet(keyName, addApiKey.trim());
        await window.electronAPI.globalKeysFetch();
        setGlobalKeyValues(prev => ({ ...prev, [keyName]: addApiKey.trim() }));
        setKeySources(prev => [...prev, { id: sourceId, name: addName.trim(), keyName }]);

        const testResult = await window.electronAPI.testConnection(sourceId);
        setGlobalKeyTestResult(prev => ({
          ...prev,
          [sourceId]: testResult.success ? 'connected' : 'error'
        }));
      }

      const updatedSources = await window.electronAPI.getSources();
      onUpdateSources?.(updatedSources);

      const cloudData = await window.electronAPI.cloudSourcesGet();
      if (cloudData) {
        setCloudSources(cloudData);
        buildSourceList(cloudData);
      }

      setAddName('');
      setAddApiKey('');
      setAddUrl('');
      setShowAddForm(false);
    } catch (e) {
      setGlobalKeyError(e.message || 'Failed to add source');
      setTimeout(() => setGlobalKeyError(null), 4000);
    } finally {
      setIsAdding(false);
    }
  };

  const grouped = {};
  for (const cat of CATEGORY_ORDER) grouped[cat] = [];
  for (const src of allSourceDefs) {
    const cat = CATEGORY_ORDER.includes(src.category) ? src.category : 'smartlookup';
    grouped[cat].push(src);
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-auris-border">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Data Sources</h2>
              {isAdmin && (
                <span className="flex items-center gap-1 text-[10px] text-amber-400 px-1.5 py-0.5 bg-amber-400/10 rounded">
                  <Crown size={10} weight="fill" />
                  Admin
                </span>
              )}
            </div>
            <p className="text-[10px] text-auris-text-muted mt-0.5">
              API keys are shared across all users via Supabase
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1 text-[10px] text-auris-blue hover:text-auris-blue-light transition-colors px-2 py-1 rounded bg-auris-blue/10"
            >
              <Plus size={12} weight="bold" />
              Add Source
            </button>
          )}
        </div>
      </div>

      {globalKeyError && (
        <div className="mx-4 mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 flex items-center gap-2">
          <Warning size={14} />
          {globalKeyError}
        </div>
      )}

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto">
        {CATEGORY_ORDER.map(cat => {
          const catSources = grouped[cat];
          if (catSources.length === 0) return null;
          return (
            <div key={cat}>
              <div className="px-4 pt-4 pb-1">
                <span className="text-[10px] font-semibold text-auris-text-muted uppercase tracking-wider">
                  {CATEGORY_LABELS[cat]}
                </span>
              </div>
              <div className="divide-y divide-auris-border/20">
                {catSources.map(sourceDef => {
                  const sourceData = getSourceData(sourceDef.id);
                  const keySrc = keySources.find(k => k.id === sourceDef.id);
                  const keyName = keySrc?.keyName || getGlobalKeyName(sourceDef.id);
                  const hasKey = !!(globalKeyValues[keyName]);
                  const testStatus = globalKeyTestResult[sourceDef.id];
                  const status = testStatus || (sourceData.status !== 'not_setup' ? sourceData.status : (hasKey ? 'configured' : 'not_setup'));

                  return (
                    <div key={sourceDef.id} className="px-4 py-2.5">
                      {/* Row 1: name, description, status, toggle */}
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                          status === 'connected' ? 'bg-auris-green' :
                          status === 'error' ? 'bg-red-400' :
                          status === 'configured' ? 'bg-auris-orange' :
                          'bg-auris-text-muted/40'
                        }`} />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-medium">
                            {sourceDef.name}
                            {sourceDef.isCloud && (
                              <span className="ml-1.5 text-[9px] text-auris-blue px-1 py-0.5 bg-auris-blue/10 rounded">
                                Custom
                              </span>
                            )}
                          </span>
                          {sourceDef.description && (
                            <span className="text-[10px] text-auris-text-muted block truncate">{sourceDef.description}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-[10px] ${
                            status === 'connected' ? 'text-auris-green' :
                            status === 'error' ? 'text-red-400' :
                            status === 'configured' ? 'text-auris-orange' :
                            'text-auris-text-muted'
                          }`}>
                            {status === 'connected' ? 'Connected' :
                             status === 'error' ? 'Error' :
                             status === 'configured' ? 'Not verified' :
                             sourceDef.requiresKey ? 'No key' : ''}
                          </span>
                          {isAdmin && sourceDef.isCloud && (
                            <button
                              onClick={() => handleDelete(sourceDef.id, sourceDef.name)}
                              className="p-0.5 text-auris-text-muted hover:text-red-400 rounded transition-colors"
                              title="Delete source"
                            >
                              <Trash size={11} />
                            </button>
                          )}
                          <button
                            onClick={() => handleToggle(sourceDef.id, !sourceData.enabled)}
                            className={`relative w-7 h-3.5 rounded-full transition-colors flex-shrink-0 ${
                              sourceData.enabled ? 'bg-auris-blue' : 'bg-auris-card'
                            }`}
                          >
                            <span className={`absolute top-[2px] w-2.5 h-2.5 rounded-full bg-white transition-transform ${
                              sourceData.enabled ? 'left-[14px]' : 'left-[2px]'
                            }`} />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: key input (only for sources that require keys) */}
                      {sourceDef.requiresKey && isAdmin && (
                        <div className="flex gap-1.5 mt-1.5 ml-4">
                          <div className="relative flex-1">
                            <input
                              type={globalKeyVisibility[keyName] ? 'text' : 'password'}
                              value={globalKeyValues[keyName] || ''}
                              onChange={(e) => setGlobalKeyValues(prev => ({ ...prev, [keyName]: e.target.value }))}
                              placeholder="Enter API key..."
                              className="input w-full pr-7 font-mono text-[10px] py-1"
                            />
                            <button
                              type="button"
                              onClick={() => setGlobalKeyVisibility(prev => ({ ...prev, [keyName]: !prev[keyName] }))}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-auris-text-muted hover:text-auris-text transition-colors"
                            >
                              {globalKeyVisibility[keyName] ? <EyeSlash size={11} /> : <Eye size={11} />}
                            </button>
                          </div>
                          <button
                            onClick={() => onSaveGlobalKey(sourceDef.id, keyName, globalKeyValues[keyName] || '')}
                            className="btn btn-primary px-2 py-1 text-[10px]"
                            disabled={!globalKeyValues[keyName] || globalKeySaving === keyName}
                          >
                            {globalKeySaving === keyName ? (
                              <CircleNotch size={11} className="animate-spin" />
                            ) : globalKeySaved === keyName ? (
                              <Check size={11} weight="bold" />
                            ) : (
                              'Save'
                            )}
                          </button>
                          <button
                            onClick={() => onTestGlobalKey(sourceDef.id)}
                            className="btn btn-secondary px-2 py-1 text-[10px]"
                            disabled={!hasKey || globalKeyTesting === sourceDef.id}
                            title="Test connection"
                          >
                            {globalKeyTesting === sourceDef.id ? (
                              <CircleNotch size={11} className="animate-spin" />
                            ) : (
                              <ArrowClockwise size={11} />
                            )}
                          </button>
                        </div>
                      )}

                      {sourceDef.requiresKey && !isAdmin && hasKey && (
                        <div className="ml-4 mt-1 text-[10px] text-auris-text-muted font-mono">
                          ••••••••••••••••
                        </div>
                      )}

                      {/* Voyage embedding controls */}
                      {sourceDef.id === 'voyage' && hasKey && (
                        <div className="ml-4 mt-2 pt-2 border-t border-auris-border/20">
                          <div className="flex items-center justify-between mb-1">
                            <div>
                              <p className="text-[10px] text-auris-text-secondary">Vector Embeddings</p>
                              <p className="text-[10px] text-auris-text-muted">
                                {trackCounts.total > 0 
                                  ? `${trackCounts.withEmbedding} of ${trackCounts.total} tracks`
                                  : 'No tracks yet'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => onEmbedMissing(false)}
                              disabled={isEmbedding || trackCounts.total === 0}
                              className="btn btn-secondary px-2 py-1 text-[10px] flex-1"
                            >
                              {isEmbedding ? (
                                <span className="flex items-center justify-center gap-1">
                                  <CircleNotch size={10} className="animate-spin" />
                                  {embedProgress ? `${embedProgress.percent}%` : 'Starting...'}
                                </span>
                              ) : embedProgress?.done ? (
                                <span className="flex items-center justify-center gap-1">
                                  <Check size={10} weight="bold" /> Done ({embedProgress.embedded})
                                </span>
                              ) : (
                                `Embed Missing (${trackCounts.total - trackCounts.withEmbedding})`
                              )}
                            </button>
                            <button
                              onClick={() => onEmbedMissing(true)}
                              disabled={isEmbedding || trackCounts.total === 0}
                              className="btn btn-secondary px-2 py-1 text-[10px]"
                              title="Re-generate all embeddings"
                            >
                              Re-embed All
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Source Form */}
      {showAddForm && isAdmin && (
        <div className="border-t border-auris-border px-4 py-3">
          <h4 className="text-xs font-medium mb-2">Add New Source</h4>
          <div className="space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setAddType('apis')}
                className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-colors ${
                  addType === 'apis' 
                    ? 'border-auris-blue bg-auris-blue/10 text-auris-blue' 
                    : 'border-auris-border text-auris-text-muted hover:text-auris-text'
                }`}
              >
                API Source
              </button>
              <button
                onClick={() => setAddType('smartlookup')}
                className={`flex-1 text-[10px] py-1.5 rounded-lg border transition-colors ${
                  addType === 'smartlookup' 
                    ? 'border-auris-blue bg-auris-blue/10 text-auris-blue' 
                    : 'border-auris-border text-auris-text-muted hover:text-auris-text'
                }`}
              >
                Smart Look-up
              </button>
            </div>
            <input
              type="text"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Source name"
              className="input w-full text-xs py-1.5"
            />
            {addType === 'apis' && (
              <input
                type="password"
                value={addApiKey}
                onChange={(e) => setAddApiKey(e.target.value)}
                placeholder="API key"
                className="input w-full font-mono text-xs py-1.5"
              />
            )}
            <input
              type="text"
              value={addUrl}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder={addType === 'apis' ? 'Test URL (optional)' : 'Search URL (e.g. https://example.com/search?q=)'}
              className="input w-full text-xs py-1.5"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setShowAddForm(false); setAddName(''); setAddApiKey(''); setAddUrl(''); }}
                className="btn btn-ghost text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSource}
                className="btn btn-primary text-xs py-1.5 px-3"
                disabled={!addName.trim() || (addType === 'apis' && !addApiKey.trim()) || isAdding}
              >
                {isAdding ? <CircleNotch size={12} className="animate-spin" /> : 'Add & Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="p-3 border-t border-auris-border">
        <button
          onClick={() => onTestConnection?.('all')}
          className="w-full btn btn-secondary text-xs py-2"
        >
          <CheckCircle size={14} weight="thin" className="mr-1.5" />
          Test All Connections
        </button>
      </div>
    </div>
  );
}

export default SourcesPanel;
