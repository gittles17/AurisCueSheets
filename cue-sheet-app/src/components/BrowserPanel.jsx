import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Globe, 
  X, 
  ArrowLeft, 
  ArrowRight, 
  ArrowClockwise, 
  Copy,
  Check,
  CircleNotch,
  DownloadSimple,
  CheckCircle,
  Warning,
  CaretLeft,
  CaretRight,
  MusicNote
} from '@phosphor-icons/react';

/**
 * Quick lookup sites for manual research
 * These appear as buttons in the browser toolbar
 */
const LOOKUP_SITES = [
  // Production Music Libraries
  { 
    id: 'bmg', 
    name: 'BMG', 
    url: 'https://bmgproductionmusic.com/en-us/search?q=',
    color: 'text-blue-400'
  },
  { 
    id: 'apm', 
    name: 'APM', 
    url: 'https://www.apmmusic.com/search?q=',
    color: 'text-orange-400'
  },
  { 
    id: 'extreme', 
    name: 'Extreme', 
    url: 'https://www.extrememusic.com/search?term=',
    color: 'text-red-400'
  },
  { 
    id: 'universal', 
    name: 'UPM', 
    url: 'https://www.universalproductionmusic.com/en-us/search?q=',
    color: 'text-yellow-400'
  },
  // PRO Databases
  { 
    id: 'bmi', 
    name: 'BMI', 
    url: 'https://repertoire.bmi.com/Search/Search?searchType=Title&searchTerm=',
    color: 'text-green-400'
  },
  { 
    id: 'ascap', 
    name: 'ASCAP', 
    url: 'https://www.ascap.com/repertory#/ace/search/title/',
    color: 'text-purple-400'
  }
];

/**
 * Browser Panel - Embedded browser for manual lookup with AI extraction
 * Supports single track lookup and batch lookup with track queue sidebar
 */
function BrowserPanel({ 
  isOpen, 
  onClose, 
  trackInfo, 
  onDataExtracted,
  // Batch props
  pendingTracks = [],
  currentTrackIndex = 0,
  onSelectTrack,
  onBatchComplete,
  libraryFilter = null
}) {
  const [url, setUrl] = useState('https://bmgproductionmusic.com/en-us/search');
  const [displayUrl, setDisplayUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [extractStatus, setExtractStatus] = useState(null);
  const [bmgData, setBmgData] = useState(null);
  const webviewRef = useRef(null);
  
  // Current site detection
  const [currentSiteId, setCurrentSiteId] = useState(null);
  const [currentSiteName, setCurrentSiteName] = useState(null);
  
  // Track queue sidebar state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [completedTracks, setCompletedTracks] = useState(new Set());
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const [copiedTrackId, setCopiedTrackId] = useState(null);
  
  // Ref to store pending auto-advance data - processed when navigation completes
  const pendingAutoAdvanceRef = useRef(null);

  // Check if we're in batch mode
  const isBatchMode = pendingTracks.length > 0;
  const totalTracks = pendingTracks.length;
  const completedCount = completedTracks.size;
  const allComplete = completedCount === totalTracks && totalTracks > 0;

  // Initialize with track search URL when panel FIRST opens (not on subsequent trackInfo changes)
  const initializedRef = useRef(false);
  useEffect(() => {
    if (isOpen && trackInfo && !initializedRef.current) {
      initializedRef.current = true;
      const searchName = trackInfo.cleanName || trackInfo.trackName || '';
      const targetUrl = trackInfo.searchUrl || `https://bmgproductionmusic.com/en-us/search?q=${encodeURIComponent(searchName)}`;
      console.log('[BrowserPanel] Initial URL set:', targetUrl);
      setUrl(targetUrl);
      setDisplayUrl(targetUrl);
      setBmgData(null);
      setExtractStatus(null);
      setError(null);
      if (trackInfo.id) {
        setSelectedTrackId(trackInfo.id);
        // Auto-copy first track name to clipboard in batch mode
        setCopiedTrackId(trackInfo.id);
        setTimeout(() => setCopiedTrackId(null), 2000);
      }
      
      // Auto-copy track name to clipboard for easy pasting
      if (searchName) {
        navigator.clipboard.writeText(searchName).catch(() => {
          console.log('[BrowserPanel] Initial clipboard write failed');
        });
        console.log('[BrowserPanel] Auto-copied first track:', searchName);
      }
    }
    // Reset state when panel closes
    if (!isOpen) {
      initializedRef.current = false;
      pendingAutoAdvanceRef.current = null; // Clear any pending auto-advance
    }
  }, [isOpen, trackInfo]);
  
  // Reset completed tracks when panel opens fresh
  useEffect(() => {
    if (isOpen && pendingTracks.length > 0) {
      setCompletedTracks(new Set());
    }
  }, [isOpen, pendingTracks.length]);
  

  // Detect which site we're on
  useEffect(() => {
    if (!displayUrl) return;
    
    let detectedSite = null;
    let detectedName = null;
    
    // Production Music Libraries
    if (displayUrl.includes('bmgproductionmusic.com')) {
      detectedSite = 'bmg';
      detectedName = 'BMG Production Music';
    } else if (displayUrl.includes('apmmusic.com')) {
      detectedSite = 'apm';
      detectedName = 'APM Music';
    } else if (displayUrl.includes('extrememusic.com')) {
      detectedSite = 'extreme';
      detectedName = 'Extreme Music';
    } else if (displayUrl.includes('universalproductionmusic.com')) {
      detectedSite = 'universal';
      detectedName = 'Universal Production Music';
    } else if (displayUrl.includes('musicbed.com')) {
      detectedSite = 'musicbed';
      detectedName = 'Musicbed';
    } else if (displayUrl.includes('artlist.io')) {
      detectedSite = 'artlist';
      detectedName = 'Artlist';
    } else if (displayUrl.includes('epidemicsound.com')) {
      detectedSite = 'epidemic';
      detectedName = 'Epidemic Sound';
    } else if (displayUrl.includes('soundstripe.com')) {
      detectedSite = 'soundstripe';
      detectedName = 'Soundstripe';
    }
    // PRO Databases
    else if (displayUrl.includes('repertoire.bmi.com')) {
      detectedSite = 'bmi';
      detectedName = 'BMI Repertoire';
    } else if (displayUrl.includes('ascap.com')) {
      detectedSite = 'ascap';
      detectedName = 'ASCAP ACE';
    } else if (displayUrl.includes('sesac.com')) {
      detectedSite = 'sesac';
      detectedName = 'SESAC';
    }
    
    setCurrentSiteId(detectedSite);
    setCurrentSiteName(detectedName);
  }, [displayUrl]);

  // Set up webview event listeners
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStartLoading = () => setIsLoading(true);
    
    const handleStopLoading = () => {
      setIsLoading(false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      
      // Check if there's a pending auto-advance to complete
      // This fires AFTER navigation completes, so it's safe to update state now
      if (pendingAutoAdvanceRef.current) {
        const pending = pendingAutoAdvanceRef.current;
        pendingAutoAdvanceRef.current = null; // Clear immediately to prevent double-processing
        
        console.log('[BrowserPanel] Navigation complete, processing auto-advance for:', pending.nextTrack.cleanName || pending.nextTrack.trackName);
        
        // NOW safe to update all state - navigation is complete
        // Reset extraction state for the NEW track (it hasn't been extracted yet)
        setBmgData(null);
        setExtractStatus(null);
        setError(null);
        setCompletedTracks(pending.newCompleted);
        setSelectedTrackId(pending.nextTrack.id);
        setCopiedTrackId(pending.nextTrack.id);
        setTimeout(() => setCopiedTrackId(null), 1500);
        
        // Call parent callbacks - safe now that navigation is done
        if (pending.onDataExtracted) {
          pending.onDataExtracted(pending.extractedData, false);
        }
        if (pending.onSelectTrack) {
          pending.onSelectTrack(pending.nextTrack);
        }
        
        console.log('[BrowserPanel] Auto-advance complete, ready for next extraction');
      }
    };
    
    const handleNavigate = (e) => {
      setDisplayUrl(e.url);
    };
    const handleError = (e) => {
      console.error('[Webview] Error:', e.errorDescription);
      // Don't set error for auto-advance navigation failures - they're expected during transition
      if (!pendingAutoAdvanceRef.current) {
        setError(e.errorDescription);
      }
    };
    const handleDomReady = () => {
      console.log('[Webview] DOM ready');
    };

    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('did-navigate', handleNavigate);
    webview.addEventListener('did-navigate-in-page', handleNavigate);
    webview.addEventListener('did-fail-load', handleError);
    webview.addEventListener('dom-ready', handleDomReady);

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading);
      webview.removeEventListener('did-stop-loading', handleStopLoading);
      webview.removeEventListener('did-navigate', handleNavigate);
      webview.removeEventListener('did-navigate-in-page', handleNavigate);
      webview.removeEventListener('did-fail-load', handleError);
      webview.removeEventListener('dom-ready', handleDomReady);
    };
  }, [isOpen]);

  // Navigation handlers
  const handleGoBack = useCallback(() => {
    webviewRef.current?.goBack();
  }, []);

  const handleGoForward = useCallback(() => {
    webviewRef.current?.goForward();
  }, []);

  const handleReload = useCallback(() => {
    webviewRef.current?.reload();
  }, []);

  const handleNavigate = useCallback(() => {
    if (displayUrl) {
      let targetUrl = displayUrl;
      if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
        targetUrl = 'https://' + targetUrl;
      }
      setUrl(targetUrl);
    }
  }, [displayUrl]);

  const handleQuickSearch = useCallback((site) => {
    const searchName = trackInfo?.cleanName || trackInfo?.trackName || '';
    const targetUrl = `${site.url}${encodeURIComponent(searchName)}`;
    setUrl(targetUrl);
    setDisplayUrl(targetUrl);
  }, [trackInfo]);

  // Search for a track on the current site (used by sidebar)
  const searchOnCurrentSite = useCallback((trackName) => {
    // Find which site we're currently on based on URL
    let searchUrl = null;
    
    // Production Music Libraries
    if (displayUrl.includes('bmgproductionmusic.com')) {
      searchUrl = `https://bmgproductionmusic.com/en-us/search?q=${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('apmmusic.com')) {
      searchUrl = `https://www.apmmusic.com/search?q=${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('extrememusic.com')) {
      searchUrl = `https://www.extrememusic.com/search?term=${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('universalproductionmusic.com')) {
      searchUrl = `https://www.universalproductionmusic.com/en-us/search?q=${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('musicbed.com')) {
      searchUrl = `https://www.musicbed.com/search?query=${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('artlist.io')) {
      searchUrl = `https://artlist.io/search?term=${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('epidemicsound.com')) {
      searchUrl = `https://www.epidemicsound.com/music/search/?term=${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('soundstripe.com')) {
      searchUrl = `https://www.soundstripe.com/search?q=${encodeURIComponent(trackName)}`;
    }
    // PRO Databases
    else if (displayUrl.includes('repertoire.bmi.com')) {
      searchUrl = `https://repertoire.bmi.com/Search/Search?searchType=Title&searchTerm=${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('ascap.com')) {
      searchUrl = `https://www.ascap.com/repertory#/ace/search/title/${encodeURIComponent(trackName)}`;
    } else if (displayUrl.includes('sesac.com')) {
      searchUrl = `https://www.sesac.com/repertory/search?query=${encodeURIComponent(trackName)}`;
    }
    
    // Fallback to BMG if on unknown site
    if (!searchUrl) {
      searchUrl = `https://bmgproductionmusic.com/en-us/search?q=${encodeURIComponent(trackName)}`;
    }
    
    setUrl(searchUrl);
    setDisplayUrl(searchUrl);
  }, [displayUrl]);

  // Handle selecting a track from the sidebar
  const handleSelectTrackFromSidebar = useCallback((track) => {
    setSelectedTrackId(track.id);
    setBmgData(null);
    setExtractStatus(null);
    setError(null);
    
    // Notify parent of selection
    if (onSelectTrack) {
      onSelectTrack(track);
    }
    
    // Copy track name to clipboard for easy pasting
    const searchName = track.cleanName || track.trackName || '';
    navigator.clipboard.writeText(searchName).catch(() => {
      console.log('[BrowserPanel] Clipboard write failed - document not focused');
    });
    setCopiedTrackId(track.id);
    setTimeout(() => setCopiedTrackId(null), 1500);
    
    // Search for the track on current site
    searchOnCurrentSite(searchName);
  }, [onSelectTrack, searchOnCurrentSite]);

  // Extract track data from current page using Opus AI
  const handleExtractData = useCallback(async () => {
    const webview = webviewRef.current;
    if (!webview) return;

    setIsLoading(true);
    setError(null);
    setExtractStatus(null);
    setBmgData(null);

    try {
      // Get the page's visible text content and URL
      const pageData = await webview.executeJavaScript(`
        (function() {
          return {
            text: document.body.innerText,
            url: window.location.href,
            title: document.title
          };
        })()
      `);

      console.log('[BrowserPanel] Got page text, length:', pageData.text?.length);
      console.log('[BrowserPanel] Page URL:', pageData.url);

      // Check if Opus is available
      if (!window.electronAPI?.extractWithOpus) {
        setError('Opus extraction not available. Make sure you are running in Electron.');
        setExtractStatus('error');
        return;
      }

      // Send to Opus for intelligent extraction
      const result = await window.electronAPI.extractWithOpus(pageData.text, pageData.url);
      
      console.log('[BrowserPanel] Opus result:', result);

      if (result.success && result.data) {
        // Prepare extracted data
        const extractedData = {
          composer: result.data.composer || '',
          publisher: result.data.publisher || '',
          label: result.data.label || '',
          masterContact: result.data.masterContact || '',
          source: result.data.album ? `${result.data.album}${result.data.albumCode ? ' (' + result.data.albumCode + ')' : ''}` : '',
          trackNumber: result.data.trackNumber || '',
          confidence: 1.0,
          dataSource: 'ai_extract'
        };
        
        // In batch mode: store data in ref and trigger navigation
        // State updates happen in handleStopLoading AFTER navigation completes
        if (isBatchMode && selectedTrackId) {
          const newCompleted = new Set([...completedTracks, selectedTrackId]);
          const nextTrack = pendingTracks.find(t => !newCompleted.has(t.id));
          
          console.log('[BrowserPanel] Track completed:', selectedTrackId);
          console.log('[BrowserPanel] Completed tracks:', newCompleted.size, '/', pendingTracks.length);
          console.log('[BrowserPanel] Next track:', nextTrack?.cleanName || nextTrack?.trackName || 'none');
          
          if (nextTrack) {
            const searchName = nextTrack.cleanName || nextTrack.trackName || '';
            const searchUrl = nextTrack.searchUrl || `https://bmgproductionmusic.com/en-us/search?q=${encodeURIComponent(searchName)}`;
            
            console.log('[BrowserPanel] Auto-advancing to:', searchName);
            console.log('[BrowserPanel] Storing pending data and triggering navigation...');
            
            // Store ALL data needed for completion - will be processed when navigation finishes
            pendingAutoAdvanceRef.current = {
              nextTrack,
              extractedData,
              newCompleted,
              resultData: result.data,
              onDataExtracted,
              onSelectTrack
            };
            
            // Copy track name to clipboard (wrapped in try-catch for focus issues)
            try {
              navigator.clipboard.writeText(searchName);
            } catch (e) {
              console.log('[BrowserPanel] Clipboard write skipped - document not focused');
            }
            
            // ONLY update URL - this triggers navigation
            // NO other state updates here - they happen in handleStopLoading
            setUrl(searchUrl);
            setDisplayUrl(searchUrl);
            // Keep isLoading true - will be set false in handleStopLoading
            
            console.log('[BrowserPanel] Navigation triggered, waiting for completion...');
          } else {
            // All tracks complete - no navigation needed, update state immediately
            setIsLoading(false);
            setBmgData(result.data);
            setExtractStatus('success');
            setCompletedTracks(newCompleted);
            if (onDataExtracted) {
              onDataExtracted(extractedData, false);
            }
            console.log('[BrowserPanel] All tracks complete!');
          }
        } else if (!isBatchMode) {
          // Single track mode
          setIsLoading(false);
          setBmgData(result.data);
          setExtractStatus('success');
          if (onDataExtracted) {
            onDataExtracted(extractedData, false);
          }
          setTimeout(() => {
            onClose();
          }, 500);
        } else {
          // Fallback
          setIsLoading(false);
        }
      } else {
        setError(result.error || 'Could not extract data. Make sure you are on a track detail page.');
        setExtractStatus('error');
      }
    } catch (err) {
      console.error('[BrowserPanel] Extract error:', err);
      setError(err.message || 'Failed to extract data');
      setExtractStatus('error');
      setIsLoading(false);
    }
    // Note: setIsLoading(false) is handled in the success paths, not in finally,
    // because in batch mode we need to delay it to let navigation complete
  }, [onDataExtracted, isBatchMode, selectedTrackId, onClose, completedTracks, pendingTracks, onSelectTrack]);

  // Copy track name
  const handleCopyTrackName = useCallback(() => {
    const name = trackInfo?.cleanName || trackInfo?.trackName;
    if (name) {
      navigator.clipboard.writeText(name).catch(() => {
        console.log('[BrowserPanel] Clipboard write failed - document not focused');
      });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [trackInfo]);

  // Handle finishing the batch
  const handleFinishBatch = useCallback(() => {
    if (onBatchComplete) {
      onBatchComplete();
    }
    onClose();
  }, [onBatchComplete, onClose]);

  if (!isOpen) return null;

  // Get the currently selected track for display
  const currentTrack = isBatchMode 
    ? pendingTracks.find(t => t.id === selectedTrackId) || pendingTracks[0]
    : trackInfo;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div 
        className="bg-auris-bg border border-auris-border rounded-xl w-[95vw] h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with track info */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-auris-border bg-auris-bg-secondary">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Globe size={18} weight="fill" className="text-auris-blue" />
              <span className="text-sm font-medium">Browser</span>
            </div>
            
            {/* Batch mode progress indicator */}
            {isBatchMode && (
              <div className="flex items-center gap-2 px-3 py-1 bg-purple-500/20 rounded-full border border-purple-500/30">
                <span className="text-xs font-medium text-purple-300">
                  {completedCount} of {totalTracks} complete
                </span>
              </div>
            )}
            
            {currentTrack && (
              <div className="flex items-center gap-2 px-3 py-1 bg-auris-card rounded-full">
                <span className="text-xs text-auris-text-muted">Looking up:</span>
                <span className="text-xs font-medium">{currentTrack.cleanName || currentTrack.trackName}</span>
                <button
                  onClick={handleCopyTrackName}
                  className="p-0.5 hover:bg-white/10 rounded transition-colors"
                  title="Copy track name"
                >
                  {copied ? (
                    <Check size={12} weight="bold" className="text-green-400" />
                  ) : (
                    <Copy size={12} className="text-auris-text-muted" />
                  )}
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Done button in batch mode */}
            {isBatchMode && (
              <button
                onClick={handleFinishBatch}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                  allComplete 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-auris-card hover:bg-auris-border text-auris-text-muted'
                }`}
              >
                {allComplete ? (
                  <>
                    <CheckCircle size={14} weight="fill" />
                    Done
                  </>
                ) : (
                  'Finish'
                )}
              </button>
            )}
            
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-auris-card transition-colors text-auris-text-muted hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main content area with sidebar */}
        <div className="flex-1 flex overflow-hidden">
          {/* Track Queue Sidebar - only in batch mode */}
          {isBatchMode && (
            <div 
              className={`bg-auris-bg-secondary border-r border-auris-border flex flex-col transition-all duration-200 ${
                sidebarCollapsed ? 'w-10' : 'w-52'
              }`}
            >
              {/* Sidebar header */}
              <div className="flex items-center justify-between px-3 py-2 border-b border-auris-border/50">
                {!sidebarCollapsed && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-auris-text-muted">
                      {libraryFilter?.name || 'Tracks'} ({totalTracks})
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                  className="p-1 rounded hover:bg-auris-card transition-colors text-auris-text-muted hover:text-white"
                  title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {sidebarCollapsed ? <CaretRight size={14} /> : <CaretLeft size={14} />}
                </button>
              </div>
              
              {/* Track list */}
              {!sidebarCollapsed && (
                <div className="flex-1 overflow-y-auto py-1">
                  {pendingTracks.map((track, index) => {
                    const isSelected = track.id === selectedTrackId;
                    const isCompleted = completedTracks.has(track.id);
                    const isCopied = copiedTrackId === track.id;
                    const trackName = track.cleanName || track.trackName || `Track ${index + 1}`;
                    
                    return (
                      <button
                        key={track.id}
                        onClick={() => handleSelectTrackFromSidebar(track)}
                        className={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
                          isSelected 
                            ? 'bg-auris-blue/20 border-l-2 border-auris-blue' 
                            : 'hover:bg-auris-card border-l-2 border-transparent'
                        }`}
                        title="Click to search and copy track name"
                      >
                        {/* Status indicator */}
                        <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          isCompleted 
                            ? 'bg-green-500/20' 
                            : isSelected 
                              ? 'bg-auris-blue/20' 
                              : 'bg-auris-card'
                        }`}>
                          {isCompleted ? (
                            <Check size={12} weight="bold" className="text-green-400" />
                          ) : isSelected ? (
                            <CaretRight size={12} className="text-auris-blue" />
                          ) : (
                            <MusicNote size={10} className="text-auris-text-muted" />
                          )}
                        </div>
                        
                        {/* Track name or Copied indicator */}
                        <span className={`text-xs truncate flex-1 ${
                          isCopied
                            ? 'text-green-400 font-medium'
                            : isCompleted 
                              ? 'text-green-400' 
                              : isSelected 
                                ? 'text-white font-medium' 
                                : 'text-auris-text-secondary'
                        }`}>
                          {isCopied ? 'Copied!' : trackName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              
              {/* Sidebar footer with progress */}
              {!sidebarCollapsed && (
                <div className="px-3 py-2 border-t border-auris-border/50">
                  <div className="flex items-center justify-between text-xs text-auris-text-muted mb-1">
                    <span>Progress</span>
                    <span>{completedCount}/{totalTracks}</span>
                  </div>
                  <div className="h-1.5 bg-auris-card rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500 transition-all duration-300"
                      style={{ width: `${(completedCount / totalTracks) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Browser content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Navigation Bar */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-auris-border/50 bg-auris-card/30">
              {/* Nav buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={handleGoBack}
                  disabled={!canGoBack}
                  className="p-1.5 rounded hover:bg-auris-card disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Go back"
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  onClick={handleGoForward}
                  disabled={!canGoForward}
                  className="p-1.5 rounded hover:bg-auris-card disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Go forward"
                >
                  <ArrowRight size={16} />
                </button>
                <button
                  onClick={handleReload}
                  className="p-1.5 rounded hover:bg-auris-card transition-colors"
                  title="Reload"
                >
                  <ArrowClockwise size={16} className={isLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* URL bar */}
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text"
                  value={displayUrl}
                  onChange={e => setDisplayUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNavigate()}
                  placeholder="Enter URL..."
                  className="flex-1 bg-auris-bg border border-auris-border rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-auris-blue"
                />
              </div>

              {/* Quick site buttons */}
              <div className="flex items-center gap-1">
                {LOOKUP_SITES.map(site => (
                  <button
                    key={site.id}
                    onClick={() => handleQuickSearch(site)}
                    className={`px-2 py-1 rounded text-xs font-medium hover:bg-auris-card transition-colors ${site.color}`}
                    title={`Search ${site.name}`}
                  >
                    {site.name}
                  </button>
                ))}
              </div>

              {/* Extract button */}
              <button
                onClick={handleExtractData}
                disabled={isLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  extractStatus === 'success' 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gradient-to-r from-auris-blue to-blue-600 text-white hover:shadow-lg hover:shadow-auris-blue/20'
                }`}
              >
                {isLoading ? (
                  <CircleNotch size={14} className="animate-spin" />
                ) : extractStatus === 'success' ? (
                  <CheckCircle size={14} weight="fill" />
                ) : (
                  <DownloadSimple size={14} weight="bold" />
                )}
                {extractStatus === 'success' ? 'Extracted!' : 'AI Extract'}
              </button>
            </div>

            {/* Extracted data banner - shows what was auto-applied */}
            {bmgData && (
              <div className="px-4 py-2 bg-green-900/30 border-b border-green-700/50">
                <div className="flex items-center gap-3">
                  <CheckCircle size={18} weight="fill" className="text-green-400" />
                  <div className="text-xs">
                    <span className="text-green-400 font-medium">Applied: </span>
                    {bmgData.composer && <span className="text-white mr-3">Composer: {bmgData.composer}</span>}
                    {bmgData.publisher && <span className="text-white mr-3">Publisher: {bmgData.publisher}</span>}
                    {bmgData.label && <span className="text-white">Label: {bmgData.label}</span>}
                  </div>
                  {isBatchMode && (
                    <span className="text-green-400/70 text-xs ml-auto">
                      {completedTracks.size < pendingTracks.length - 1 ? 'Moving to next track...' : 'All tracks complete!'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="px-4 py-2 bg-red-900/30 border-b border-red-700/50 flex items-center gap-2">
                <Warning size={16} className="text-red-400" />
                <span className="text-xs text-red-300">{error}</span>
              </div>
            )}

            {/* Embedded Browser */}
            <div className="flex-1 bg-white">
              <webview
                ref={webviewRef}
                src={url}
                className="w-full h-full"
                allowpopups="true"
              />
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-auris-border/50 bg-auris-bg-secondary">
              <p className="text-[10px] text-auris-text-muted">
                {isBatchMode 
                  ? 'Click a track in the sidebar to search, then AI Extract. Repeat for all tracks.'
                  : 'Navigate to track detail page, then click "AI Extract"'
                }
              </p>
              {currentSiteName && (
                <span className="text-[10px] text-auris-text-muted">
                  {currentSiteName}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default BrowserPanel;
