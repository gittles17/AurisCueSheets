import { useState, useCallback, useMemo } from 'react';
import { CircleNotch, CheckCircle, Sparkle, CaretDown, Funnel } from '@phosphor-icons/react';

/**
 * Library definitions for filtering tracks
 * Matches the LOOKUP_SITES in electron/lookup-sites.js
 */
const LIBRARIES = {
  bmg: {
    id: 'bmg',
    name: 'BMG',
    fullName: 'BMG Production Music',
    searchUrl: 'https://bmgproductionmusic.com/en-us/search?q=',
    aliases: ['bmg', 'bmg production', 'bmg production music', 'bmgpm', 'music beyond', 'beyond music'],
    catalogPrefixes: ['IATS', 'ANW', 'BED', 'KOS', 'BYND', 'BMGPM', 'DIG', 'EMO', 'GYM', 'RTV', 'SON', 'UBM']
  },
  apm: {
    id: 'apm',
    name: 'APM',
    fullName: 'APM Music',
    searchUrl: 'https://www.apmmusic.com/search?q=',
    aliases: ['apm', 'apm music', 'killer tracks', 'killer track', 'firstcom', 'first com'],
    catalogPrefixes: ['APM', 'KT', 'FC', 'DEN', 'TWO', 'EVO']
  },
  extreme: {
    id: 'extreme',
    name: 'Extreme',
    fullName: 'Extreme Music',
    searchUrl: 'https://www.extrememusic.com/search?term=',
    aliases: ['extreme', 'extreme music', 'x series', 'xseries'],
    catalogPrefixes: ['EXT', 'XTM', 'XCD', 'SOA', 'EAX', 'XSE']
  },
  musicbed: {
    id: 'musicbed',
    name: 'Musicbed',
    fullName: 'Musicbed',
    searchUrl: 'https://www.musicbed.com/search?query=',
    aliases: ['musicbed', 'music bed'],
    catalogPrefixes: ['MB', 'MBD']
  },
  artlist: {
    id: 'artlist',
    name: 'Artlist',
    fullName: 'Artlist',
    searchUrl: 'https://artlist.io/search?term=',
    aliases: ['artlist', 'art list'],
    catalogPrefixes: ['ART', 'AL']
  },
  epidemic: {
    id: 'epidemic',
    name: 'Epidemic',
    fullName: 'Epidemic Sound',
    searchUrl: 'https://www.epidemicsound.com/search/?term=',
    aliases: ['epidemic', 'epidemic sound'],
    catalogPrefixes: ['ES', 'EPS']
  },
  soundstripe: {
    id: 'soundstripe',
    name: 'Soundstripe',
    fullName: 'Soundstripe',
    searchUrl: 'https://www.soundstripe.com/search?q=',
    aliases: ['soundstripe', 'sound stripe'],
    catalogPrefixes: ['SS', 'SST']
  }
};

/**
 * Detect which library a track belongs to based on metadata
 */
function detectLibrary(track) {
  const { artist = '', library = '', catalogCode = '', source = '', trackName = '' } = track;
  
  // Combine searchable text from various fields
  const searchText = `${artist} ${library} ${source}`.toLowerCase();
  const code = (catalogCode || trackName || '').toUpperCase();
  
  // First check catalog code prefixes (most reliable)
  if (code && code.length >= 2) {
    for (const lib of Object.values(LIBRARIES)) {
      for (const prefix of lib.catalogPrefixes) {
        if (code.startsWith(prefix)) {
          return lib;
        }
      }
    }
  }
  
  // Check aliases in text fields
  for (const lib of Object.values(LIBRARIES)) {
    for (const alias of lib.aliases) {
      if (searchText.includes(alias.toLowerCase())) {
        return lib;
      }
    }
  }
  
  return null;
}

function Sidebar({ projectInfo, setProjectInfo, cueCount, completedCount, isLookingUp, pendingTracks = [], onOpenBrowser, onOpenBrowserBatch }) {
  const [copiedTrack, setCopiedTrack] = useState(null);
  const [selectedLibrary, setSelectedLibrary] = useState('all');
  const [showLibraryDropdown, setShowLibraryDropdown] = useState(false);
  
  // Detect library for each pending track and organize them
  const { tracksWithLibrary, availableLibraries, filteredTracks } = useMemo(() => {
    const tracksWithLib = pendingTracks.map(track => ({
      ...track,
      detectedLibrary: detectLibrary(track)
    }));
    
    // Find which libraries are present in the tracks
    const librarySet = new Set();
    tracksWithLib.forEach(t => {
      if (t.detectedLibrary) {
        librarySet.add(t.detectedLibrary.id);
      } else {
        librarySet.add('unknown');
      }
    });
    
    // Build available libraries list (only ones that have tracks)
    const available = [
      { id: 'all', name: 'All Libraries', count: tracksWithLib.length }
    ];
    
    for (const lib of Object.values(LIBRARIES)) {
      const count = tracksWithLib.filter(t => t.detectedLibrary?.id === lib.id).length;
      if (count > 0) {
        available.push({ ...lib, count });
      }
    }
    
    // Add unknown category if there are tracks without detected library
    const unknownCount = tracksWithLib.filter(t => !t.detectedLibrary).length;
    if (unknownCount > 0) {
      available.push({ id: 'unknown', name: 'Unknown', count: unknownCount });
    }
    
    // Filter tracks by selected library
    let filtered = tracksWithLib;
    if (selectedLibrary !== 'all') {
      if (selectedLibrary === 'unknown') {
        filtered = tracksWithLib.filter(t => !t.detectedLibrary);
      } else {
        filtered = tracksWithLib.filter(t => t.detectedLibrary?.id === selectedLibrary);
      }
    }
    
    return {
      tracksWithLibrary: tracksWithLib,
      availableLibraries: available,
      filteredTracks: filtered
    };
  }, [pendingTracks, selectedLibrary]);
  
  // Get selected library details
  const selectedLibraryData = useMemo(() => {
    if (selectedLibrary === 'all') return { id: 'all', name: 'All Libraries' };
    if (selectedLibrary === 'unknown') return { id: 'unknown', name: 'Unknown' };
    return LIBRARIES[selectedLibrary] || { id: 'all', name: 'All Libraries' };
  }, [selectedLibrary]);
  
  const handleInfoChange = (field, value) => {
    setProjectInfo(prev => ({ ...prev, [field]: value }));
  };

  const progress = cueCount > 0 ? Math.round((completedCount / cueCount) * 100) : 0;
  const pendingCount = cueCount - completedCount;

  return (
    <aside className="w-80 bg-auris-bg-secondary border-l border-auris-border overflow-y-auto flex flex-col">
      {/* Project Info Section */}
      <div className="p-4 border-b border-auris-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-auris-text-muted mb-3">
          Project
        </h2>
        
        <div className="space-y-2.5">
          <input
            type="text"
            value={projectInfo.project}
            onChange={(e) => handleInfoChange('project', e.target.value)}
            className="input"
            placeholder="Project name"
          />
          
          <input
            type="text"
            value={projectInfo.spotTitle}
            onChange={(e) => handleInfoChange('spotTitle', e.target.value)}
            className="input"
            placeholder="Spot title"
          />
          
          <div className="flex gap-2">
            <input
              type="text"
              value={projectInfo.type}
              onChange={(e) => handleInfoChange('type', e.target.value)}
              className="input flex-1"
              placeholder="Type"
            />
            <input
              type="text"
              value={projectInfo.datePrepared}
              onChange={(e) => handleInfoChange('datePrepared', e.target.value)}
              className="input flex-1 font-mono"
              placeholder="Date"
            />
          </div>
        </div>
      </div>

      {/* Actions Section */}
      <div className="p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-auris-text-muted mb-3">
          Actions
        </h2>
        
        {/* Smart Lookup Section with Library Filter */}
        {pendingTracks.length > 0 && (
          <div className="mt-4 pt-4 border-t border-auris-border/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-auris-text-muted flex items-center gap-1.5">
                <Sparkle size={12} weight="fill" className="text-purple-400" />
                Smart Lookup:
              </p>
              
              {/* Library Filter Dropdown */}
              {availableLibraries.length > 2 && (
                <div className="relative">
                  <button
                    onClick={() => setShowLibraryDropdown(!showLibraryDropdown)}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs rounded bg-auris-card border border-auris-border hover:border-auris-text-muted/50 transition-colors"
                  >
                    <Funnel size={12} className="text-auris-text-muted" />
                    <span className="text-auris-text-secondary">{selectedLibraryData.name}</span>
                    <CaretDown size={10} className="text-auris-text-muted" />
                  </button>
                  
                  {showLibraryDropdown && (
                    <>
                      {/* Backdrop to close dropdown */}
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowLibraryDropdown(false)}
                      />
                      
                      {/* Dropdown menu */}
                      <div className="absolute right-0 top-full mt-1 w-40 bg-auris-bg-secondary border border-auris-border rounded-lg shadow-xl z-20 py-1 overflow-hidden">
                        {availableLibraries.map(lib => (
                          <button
                            key={lib.id}
                            onClick={() => {
                              setSelectedLibrary(lib.id);
                              setShowLibraryDropdown(false);
                            }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors ${
                              selectedLibrary === lib.id
                                ? 'bg-auris-card text-white'
                                : 'text-auris-text-secondary hover:bg-auris-card/50 hover:text-white'
                            }`}
                          >
                            <span>{lib.name}</span>
                            <span className="text-auris-text-muted">{lib.count}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            
            {/* Filtered count indicator */}
            {selectedLibrary !== 'all' && (
              <p className="text-xs text-auris-blue mb-2">
                Showing {filteredTracks.length} of {pendingTracks.length} tracks
              </p>
            )}
            
            {/* Batch Smart Lookup Button - sequential browser lookup for filtered tracks */}
            {filteredTracks.length > 0 && onOpenBrowserBatch && (
              <button
                onClick={() => {
                  // Prepare tracks with search URLs for batch lookup
                  const tracksWithUrls = filteredTracks.map(track => {
                    const cleanName = (track.trackName || '')
                      .replace(/^(BYND-|mx.*?_)/i, '')
                      .replace(/_/g, ' ')
                      .replace(/STEM.*/i, '')
                      .trim();
                    const searchUrl = track.detectedLibrary?.searchUrl 
                      ? `${track.detectedLibrary.searchUrl}${encodeURIComponent(cleanName)}`
                      : `https://bmgproductionmusic.com/en-us/search?q=${encodeURIComponent(cleanName)}`;
                    return {
                      ...track,
                      searchUrl,
                      cleanName,
                      detectedLibraryName: track.detectedLibrary?.fullName
                    };
                  });
                  // Pass tracks and the current library filter
                  onOpenBrowserBatch(tracksWithUrls, selectedLibraryData);
                }}
                disabled={isLookingUp}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 mb-3 rounded-lg text-xs font-medium bg-gradient-to-r from-purple-500/20 to-purple-500/10 border border-purple-500/40 text-purple-300 hover:from-purple-500/30 hover:to-purple-500/20 hover:border-purple-500/60 transition-all"
              >
                <Sparkle size={14} weight="fill" />
                <span>
                  Batch Smart Lookup{selectedLibrary !== 'all' ? ` (${filteredTracks.length})` : ` All (${filteredTracks.length})`}
                </span>
              </button>
            )}
            
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {filteredTracks.slice(0, 8).map((track, i) => {
                const cleanName = (track.trackName || '')
                  .replace(/^(BYND-|mx.*?_)/i, '')
                  .replace(/_/g, ' ')
                  .replace(/STEM.*/i, '')
                  .trim();
                const isCopied = copiedTrack === cleanName;
                
                // Use detected library's search URL or fall back to BMG
                const searchUrl = track.detectedLibrary?.searchUrl 
                  ? `${track.detectedLibrary.searchUrl}${encodeURIComponent(cleanName)}`
                  : `https://bmgproductionmusic.com/en-us/search?q=${encodeURIComponent(cleanName)}`;
                
                return (
                  <button
                    key={track.id || i}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(cleanName);
                        setCopiedTrack(cleanName);
                        setTimeout(() => setCopiedTrack(null), 2000);
                      } catch (e) {
                        console.error('Failed to copy:', e);
                      }
                      if (onOpenBrowser) {
                        onOpenBrowser({
                          ...track,
                          searchUrl,
                          cleanName,
                          detectedLibraryName: track.detectedLibrary?.fullName
                        });
                      }
                    }}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm transition-colors text-left ${
                      isCopied 
                        ? 'bg-green-900/30 text-green-400' 
                        : 'hover:bg-auris-card text-auris-text-secondary hover:text-white'
                    }`}
                  >
                    {isCopied ? (
                      <CheckCircle size={14} weight="fill" className="text-green-400 flex-shrink-0" />
                    ) : (
                      <Sparkle size={14} weight="fill" className="text-purple-400 flex-shrink-0" />
                    )}
                    <span className="truncate flex-1">{isCopied ? 'Copied!' : (cleanName || track.trackName)}</span>
                    {/* Show library badge if not filtering by a specific library */}
                    {selectedLibrary === 'all' && track.detectedLibrary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-auris-card text-auris-text-muted flex-shrink-0">
                        {track.detectedLibrary.name}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {filteredTracks.length > 8 && (
              <p className="text-xs text-auris-text-muted mt-2">
                +{filteredTracks.length - 8} more
              </p>
            )}
          </div>
        )}
      </div>

      {/* Progress Bar - Fixed at Bottom */}
      <div className="mt-auto p-4 border-t border-auris-border bg-auris-bg-secondary">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-auris-text-muted">Progress</span>
          <span className="font-mono text-sm">
            <span className="text-auris-green font-semibold">{completedCount}</span>
            <span className="text-auris-text-muted">/{cueCount}</span>
          </span>
        </div>
        <div className="h-2 bg-auris-card rounded-full overflow-hidden">
          <div 
            className="h-full bg-auris-green transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
