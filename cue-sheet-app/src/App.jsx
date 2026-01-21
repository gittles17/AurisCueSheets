import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Header from './components/Header';
import CueTable from './components/CueTable';
import Sidebar from './components/Sidebar';
import ProjectTree from './components/ProjectTree';
import SettingsModal from './components/SettingsModal';
import BrowserPanel from './components/BrowserPanel';
import LoginModal from './components/LoginModal';
import FeedbackModal from './components/FeedbackModal';
import LoginPage from './components/LoginPage';
import AurisChatPanel from './components/AurisChatPanel';
import SmartSuggestionPanel from './components/SmartSuggestionPanel';
import AnnotationPopover from './components/AnnotationPopover';
import TabBar from './components/TabBar';
import GuidedTour, { shouldShowTour, SAMPLE_CUE_DATA } from './components/GuidedTour';
import ImportWizard from './components/ImportWizard';
import { useAuth } from './contexts/AuthContext';
import { useSmartSuggestions } from './hooks/useSmartSuggestions';
import { useCueSheet } from './hooks/useCueSheet';
import { useHighlights } from './hooks/useHighlights';
import { CheckCircle, Warning, X, FolderOpen, FilePlus, FolderSimple, CircleNotch, ArrowsClockwise } from '@phosphor-icons/react';

// Generate unique tab ID
const generateTabId = () => `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

function App() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const {
    cues,
    setCues,
    projectInfo,
    setProjectInfo,
    isLoading,
    isLookingUp,
    error,
    loadProject,
    exportToExcel,
    updateCue,
    batchUpdateCues,
    autoLookupAll,
    lookupSingleCue,
    importContacts
  } = useCueSheet();

  const [showSidebar, setShowSidebar] = useState(true);
  const [showProjectTree, setShowProjectTree] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserTrack, setBrowserTrack] = useState(null);
  
  // Batch browser state
  const [batchTracks, setBatchTracks] = useState([]);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchLibraryFilter, setBatchLibraryFilter] = useState(null);
  
  // Project management state
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const hasUnsavedChanges = useRef(false);
  const saveTimeoutRef = useRef(null);
  
  // Multi-tab state
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const MAX_TABS = 10;
  
  // ACS project file state
  const [acsFilePath, setAcsFilePath] = useState(null);
  const [projectFolder, setProjectFolder] = useState(null);
  const [acsUnsavedChanges, setAcsUnsavedChanges] = useState(false);
  const [recentProjects, setRecentProjects] = useState([]);
  
  // New project modal state
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  
  // Login modal state
  const [showLoginModal, setShowLoginModal] = useState(false);
  
  // Feedback modal state
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  
  // Import wizard state
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importWizardPath, setImportWizardPath] = useState(null);
  
  // Auto-update state
  const [updateAvailable, setUpdateAvailable] = useState(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateProgress, setUpdateProgress] = useState(null);
  
  // Auris Chat state
  const [showAurisChat, setShowAurisChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatProcessing, setIsChatProcessing] = useState(false);
  const [pendingSuggestions, setPendingSuggestions] = useState(null);
  
  // Annotation popover state
  const [annotationPopover, setAnnotationPopover] = useState({
    isOpen: false,
    position: null,
    mode: 'create',
    highlightId: null,
    initialColor: 'yellow',
    initialAnnotation: ''
  });
  
  // Sources state
  const [sources, setSources] = useState({});
  
  // Cell selection state
  const [selectedCells, setSelectedCells] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  
  // Highlights hook
  const {
    selectedRowIds,
    selectedCount,
    isRowSelected,
    handleRowClick,
    clearSelection,
    highlights,
    unresolvedHighlights,
    createHighlight,
    updateHighlightAnnotation,
    updateHighlightColor,
    resolveHighlight,
    deleteHighlight,
    getRowHighlightColor,
    getRowAnnotation
  } = useHighlights(acsFilePath || activeProjectId);
  
  // Selection position for contextual panel
  const [selectionPosition, setSelectionPosition] = useState(null);
  
  // AI Assist mode toggle (off by default for normal spreadsheet behavior)
  const [aiAssistEnabled, setAiAssistEnabled] = useState(false);
  
  // Guided tour state
  const [showTour, setShowTour] = useState(false);
  const [showTourPanel, setShowTourPanel] = useState(false);
  const [tourSelection, setTourSelection] = useState(null); // { startRow, startCol, endRow, endCol }
  
  // Check if should show tour on first load
  useEffect(() => {
    if (!authLoading && isAuthenticated && shouldShowTour()) {
      // Small delay to let the app render first
      const timer = setTimeout(() => setShowTour(true), 500);
      return () => clearTimeout(timer);
    }
  }, [authLoading, isAuthenticated]);
  
  // Handle cell selection change from CueTable
  const handleSelectionChange = useCallback((cells, rows, position) => {
    setSelectedCells(cells);
    setSelectedRows(rows);
    setSelectionPosition(position);
  }, []);
  
  // Smart suggestions hook - auto-triggers on selection when AI assist is enabled
  const {
    suggestions: smartSuggestions,
    isLoading: isLoadingSuggestions,
    isRefining: isRefiningSuggestions,
    activeField: activeSuggestionField,
    getSuggestionsForField,
    refineSuggestions,
    applySuggestion,
    applyCustomValue,
    dismiss: dismissSuggestions,
    hasSelection: hasSmartSelection
  } = useSmartSuggestions({
    selectedCues: selectedRows,
    allCues: cues,
    onUpdateCue: updateCue,
    enabled: aiAssistEnabled
  });
  
  // Toast notification state
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);
  
  // Track waiting for BMG data (when user clicks quick lookup)
  const [pendingBmgTrackId, setPendingBmgTrackId] = useState(null);
  
  // Undo/Redo state
  const [cuesHistory, setCuesHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);

  // Show toast notification
  const showToast = useCallback((message, type = 'success', action = null) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setToast({ message, type, action });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Update authentication state when user or admin status changes
  useEffect(() => {
    if (user || isAdmin) {
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
  }, [user, isAdmin]);

  // Track cues changes for undo/redo (debounced)
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    if (cues.length === 0) return;
    
    // Only add to history if cues actually changed
    const currentState = JSON.stringify(cues);
    const lastState = cuesHistory[historyIndex] ? JSON.stringify(cuesHistory[historyIndex]) : null;
    
    if (currentState !== lastState) {
      // Remove any future history if we're not at the end
      const newHistory = cuesHistory.slice(0, historyIndex + 1);
      newHistory.push([...cues]);
      // Keep max 50 history states
      if (newHistory.length > 50) newHistory.shift();
      setCuesHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    }
  }, [cues]);
  
  // Undo handler - optimistic, no toast
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setCues(cuesHistory[newIndex]);
    }
  }, [historyIndex, cuesHistory, setCues]);
  
  // Redo handler - optimistic, no toast
  const handleRedo = useCallback(() => {
    if (historyIndex < cuesHistory.length - 1) {
      isUndoRedoAction.current = true;
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setCues(cuesHistory[newIndex]);
    }
  }, [historyIndex, cuesHistory, setCues]);
  
  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // Get active tab
  const activeTab = useMemo(() => {
    return openTabs.find(t => t.id === activeTabId) || null;
  }, [openTabs, activeTabId]);

  // Open a new tab for a project
  const openNewTab = useCallback(async (projectId, projectName = null) => {
    // Check if already open
    const existingTab = openTabs.find(t => t.projectId === projectId);
    if (existingTab) {
      setActiveTabId(existingTab.id);
      return existingTab.id;
    }
    
    // Check max tabs
    if (openTabs.length >= MAX_TABS) {
      showToast(`Maximum ${MAX_TABS} tabs open`, 'warning');
      return null;
    }
    
    // Load the cue sheet data
    let cueSheetData = null;
    let name = projectName;
    if (window.electronAPI) {
      cueSheetData = await window.electronAPI.getCueSheet(projectId);
      if (cueSheetData) {
        // Prefer cue sheet name, then projectInfo.projectName, then passed projectName
        name = cueSheetData.name || cueSheetData.projectInfo?.projectName || projectName || 'Untitled';
      }
    }
    
    const newTab = {
      id: generateTabId(),
      projectId,
      name: name || 'Untitled',
      cues: cueSheetData?.cues || [],
      projectInfo: {
        ...cueSheetData?.projectInfo,
        projectName: name
      },
      undoHistory: [],
      historyIndex: -1,
      selection: null,
      scrollPosition: { x: 0, y: 0 },
      isDirty: false
    };
    
    setOpenTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
    
    // Also set the active project ID and load cues into main state
    setActiveProjectId(projectId);
    setCues(newTab.cues);
    setProjectInfo(newTab.projectInfo);
    setCuesHistory([]);
    setHistoryIndex(-1);
    
    return newTab.id;
  }, [openTabs, MAX_TABS, showToast, setCues, setProjectInfo]);

  // Close a tab
  const closeTab = useCallback((tabId) => {
    const tabIndex = openTabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    const newTabs = openTabs.filter(t => t.id !== tabId);
    setOpenTabs(newTabs);
    
    // If closing active tab, switch to another
    if (tabId === activeTabId) {
      if (newTabs.length > 0) {
        // Switch to previous tab or first tab
        const newActiveIndex = Math.min(tabIndex, newTabs.length - 1);
        const newActiveTab = newTabs[newActiveIndex];
        setActiveTabId(newActiveTab.id);
        setActiveProjectId(newActiveTab.projectId);
        setCues(newActiveTab.cues);
        setProjectInfo(newActiveTab.projectInfo);
        setCuesHistory(newActiveTab.undoHistory || []);
        setHistoryIndex(newActiveTab.historyIndex || -1);
      } else {
        // No tabs left
        setActiveTabId(null);
        setActiveProjectId(null);
        setCues([]);
        setProjectInfo({});
        setCuesHistory([]);
        setHistoryIndex(-1);
      }
    }
  }, [openTabs, activeTabId, setCues, setProjectInfo]);

  // Switch to a tab
  const switchTab = useCallback((tabId) => {
    if (tabId === activeTabId) return;
    
    // Save current tab state before switching
    if (activeTabId) {
      setOpenTabs(prev => prev.map(t => 
        t.id === activeTabId 
          ? { 
              ...t, 
              cues: [...cues],
              projectInfo: { ...projectInfo },
              undoHistory: [...cuesHistory],
              historyIndex
            }
          : t
      ));
    }
    
    // Load new tab state
    const newTab = openTabs.find(t => t.id === tabId);
    if (newTab) {
      setActiveTabId(tabId);
      setActiveProjectId(newTab.projectId);
      setCues(newTab.cues);
      setProjectInfo(newTab.projectInfo);
      setCuesHistory(newTab.undoHistory || []);
      setHistoryIndex(newTab.historyIndex || -1);
    }
  }, [activeTabId, openTabs, cues, projectInfo, cuesHistory, historyIndex, setCues, setProjectInfo]);

  // Update active tab's cues (called when cues change)
  useEffect(() => {
    if (activeTabId && cues.length > 0) {
      setOpenTabs(prev => prev.map(t => 
        t.id === activeTabId 
          ? { ...t, cues: [...cues], isDirty: true }
          : t
      ));
    }
  }, [cues, activeTabId]);

  // Handle scroll position change from CueTable
  const handleScrollChange = useCallback((position) => {
    if (activeTabId) {
      setOpenTabs(prev => prev.map(t => 
        t.id === activeTabId 
          ? { ...t, scrollPosition: position }
          : t
      ));
    }
  }, [activeTabId]);

  // Auto-create a tab when there's cues loaded but no tabs (e.g., opened via ACS file)
  useEffect(() => {
    if (cues.length > 0 && openTabs.length === 0 && !activeTabId) {
      const newTab = {
        id: generateTabId(),
        projectId: activeProjectId || 'acs-file',
        name: projectInfo.projectName || acsFilePath?.split('/').pop()?.replace('.acs', '') || 'Untitled',
        cues: [...cues],
        projectInfo: { ...projectInfo },
        undoHistory: [...cuesHistory],
        historyIndex,
        selection: null,
        scrollPosition: { x: 0, y: 0 },
        isDirty: false
      };
      setOpenTabs([newTab]);
      setActiveTabId(newTab.id);
    }
  }, [cues, openTabs.length, activeTabId, activeProjectId, projectInfo, acsFilePath, cuesHistory, historyIndex]);

  // Load projects, sources, and recent projects on mount
  useEffect(() => {
    const loadInitialData = async () => {
      if (window.electronAPI) {
        try {
          const projectsData = await window.electronAPI.getProjects();
          setProjects(projectsData || []);
          
          const sourcesData = await window.electronAPI.getSources();
          setSources(sourcesData || {});
          
          // Load recent ACS projects
          if (window.electronAPI.acsGetRecent) {
            const recent = await window.electronAPI.acsGetRecent();
            setRecentProjects(recent || []);
          }
        } catch (err) {
          console.error('Error loading initial data:', err);
        }
      }
    };
    loadInitialData();
  }, []);

  // Listen for auto-update events
  useEffect(() => {
    if (!window.electronAPI?.onUpdateAvailable) return;
    
    window.electronAPI.onUpdateAvailable((info) => {
      console.log('[App] Update available:', info.version);
      setUpdateAvailable(info);
    });
    
    window.electronAPI.onUpdateDownloadProgress?.((progress) => {
      console.log('[App] Update download progress:', Math.round(progress.percent) + '%');
      setUpdateProgress(progress);
    });
    
    window.electronAPI.onUpdateDownloaded((info) => {
      console.log('[App] Update downloaded:', info.version);
      setUpdateDownloaded(true);
      setUpdateProgress(null);
    });
    
    return () => {
      window.electronAPI.removeUpdateListeners?.();
    };
  }, []);

  // Subscribe to real-time cloud track changes
  useEffect(() => {
    if (!window.electronAPI?.cloudTrackSubscribe) return;
    
    // Start subscription
    window.electronAPI.cloudTrackSubscribe();
    
    // Listen for changes
    window.electronAPI.onCloudTrackChange?.((change) => {
      console.log('[App] Cloud track change:', change.type, change.track?.trackName);
      // Track changes will be automatically reflected in lookups
      // No need to update local cues as they are project-specific
    });
    
    // Subscribe to source changes
    window.electronAPI.onSourcesChange?.((change) => {
      console.log('[App] Cloud sources change:', change.type);
      if (change.allSources) {
        setSources(change.allSources);
      }
    });
    
    return () => {
      window.electronAPI.removeCloudTrackChangeListener?.();
      window.electronAPI.removeSourcesChangeListener?.();
    };
  }, []);

  // Save current project to store
  const saveCurrentProject = useCallback(async () => {
    if (!activeProjectId || !window.electronAPI?.updateCueSheet) return false;
    if (cues.length === 0) return false;
    
    try {
      console.log('[App] Saving project:', activeProjectId, 'with', cues.length, 'cues');
      await window.electronAPI.updateCueSheet(activeProjectId, {
        cues,
        projectInfo
      });
      hasUnsavedChanges.current = false;
      return true;
    } catch (err) {
      console.error('[App] Failed to save project:', err);
      return false;
    }
  }, [activeProjectId, cues, projectInfo]);

  // Auto-save when cues or projectInfo change (debounced)
  useEffect(() => {
    if (!activeProjectId || cues.length === 0) return;
    
    hasUnsavedChanges.current = true;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounced auto-save after 2 seconds of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      saveCurrentProject();
    }, 2000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [cues, projectInfo, activeProjectId, saveCurrentProject]);

  // Listen for BMG data from bookmarklet
  useEffect(() => {
    if (!window.electronAPI?.onBmgDataReceived) return;
    
    const handleBmgData = (data) => {
      console.log('[App] Received BMG data from bookmarklet:', data);
      
      if (!data.trackName && !data.composer) {
        showToast('No track data found in the received data', 'warning');
        return;
      }
      
      // Find matching track - first try pending track, then search by name
      let matchingCue = null;
      
      if (pendingBmgTrackId) {
        matchingCue = cues.find(c => c.id === pendingBmgTrackId);
      }
      
      if (!matchingCue && data.trackName) {
        // Try to find by track name similarity
        const searchName = data.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
        matchingCue = cues.find(c => {
          const cueName = (c.trackName || c.originalName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return cueName.includes(searchName) || searchName.includes(cueName);
        });
      }
      
      if (!matchingCue && cues.length > 0) {
        // Fall back to first pending track
        matchingCue = cues.find(c => c.status !== 'complete' && !c.composer);
      }
      
      if (matchingCue) {
        // Format composer and publisher with BMG standard format
        const formatWithPro = (name, pro) => {
          if (!name) return '';
          // If already has PRO, return as is
          if (name.includes('(ASCAP)') || name.includes('(BMI)') || name.includes('(SESAC)')) {
            return name;
          }
          // Try to detect PRO from the data
          return name;
        };
        
        // Update the cue with the received data
        updateCue(matchingCue.id, {
          trackName: data.trackName || matchingCue.trackName,
          trackNameSource: data.trackName ? 'bmg_bookmarklet' : matchingCue.trackNameSource,
          composer: formatWithPro(data.composer),
          composerSource: 'bmg_bookmarklet',
          composerConfidence: 1.0,
          publisher: data.label || '',
          publisherSource: 'bmg_bookmarklet',
          publisherConfidence: 1.0,
          source: data.album ? `${data.album}${data.albumCode ? ` (${data.albumCode})` : ''}` : matchingCue.source,
          sourceSource: data.album ? 'bmg_bookmarklet' : matchingCue.sourceSource,
          trackNumber: data.trackNumber || matchingCue.trackNumber,
          trackNumberSource: data.trackNumber ? 'bmg_bookmarklet' : matchingCue.trackNumberSource,
          artist: data.artist || matchingCue.artist,
          artistSource: data.artist ? 'bmg_bookmarklet' : matchingCue.artistSource,
          label: 'BMG Production Music',
          labelSource: 'bmg_bookmarklet',
          status: data.composer ? 'complete' : matchingCue.status
        });
        
        // Save to track database for future predictions
        if (window.electronAPI?.saveTrack) {
          window.electronAPI.saveTrack({
            trackName: data.trackName,
            catalogCode: data.albumCode,
            artist: data.artist,
            source: data.album,
            composer: data.composer,
            publisher: data.label,
            library: 'BMG Production Music',
            verified: true,
            dataSource: 'bmg_bookmarklet',
            sourceUrl: data.url
          });
        }
        
        showToast(`Updated "${data.trackName || matchingCue.trackName}" with BMG data`, 'success');
        setPendingBmgTrackId(null);
      } else {
        showToast('No matching track found. Import a project first.', 'warning');
      }
    };
    
    window.electronAPI.onBmgDataReceived(handleBmgData);
    
    return () => {
      if (window.electronAPI?.removeBmgDataListener) {
        window.electronAPI.removeBmgDataListener();
      }
    };
  }, [cues, pendingBmgTrackId, updateCue, showToast]);

  // Flag to trigger auto-lookup after file load
  const shouldAutoLookupRef = useRef(false);
  
  const handleFileDrop = useCallback(async (filePath) => {
    // Open the import wizard for step-by-step review
    setImportWizardPath(filePath);
    setShowImportWizard(true);
  }, []);
  
  // Handle import wizard completion
  const handleImportWizardComplete = useCallback(async ({ cues: importedCues, projectInfo: wizardProjectInfo }) => {
    // Save the path before clearing state
    const filePath = importWizardPath;
    
    setShowImportWizard(false);
    setImportWizardPath(null);
    
    // Set cues from the wizard
    setCues(importedCues.map((cue, idx) => ({
      ...cue,
      id: cue.id || idx + 1,
      cueNumber: cue.cueNumber || idx + 1
    })));
    
    // Set project info if available
    if (wizardProjectInfo) {
      setProjectInfo(prev => ({
        ...prev,
        projectName: wizardProjectInfo.projectName || prev.projectName || '',
        spotTitle: wizardProjectInfo.spotTitle || prev.spotTitle || '',
      }));
    }
    
    // Create project entry in file tree and open as a tab
    if (window.electronAPI && filePath) {
      const importResult = await window.electronAPI.importPrproj(filePath, { cues: importedCues, projectInfo: wizardProjectInfo }, projectFolder);
      if (importResult?.cueSheetId) {
        const projectId = importResult.cueSheetId;
        const projectName = wizardProjectInfo?.projectName || filePath.split('/').pop()?.replace('.prproj', '') || 'Untitled';
        
        // Create a tab for this imported project
        const newTab = {
          id: generateTabId(),
          projectId,
          name: projectName,
          cues: importedCues.map((cue, idx) => ({
            ...cue,
            id: cue.id || idx + 1,
            cueNumber: cue.cueNumber || idx + 1
          })),
          projectInfo: {
            projectName: wizardProjectInfo?.projectName || '',
            spotTitle: wizardProjectInfo?.spotTitle || '',
          },
          undoHistory: [],
          historyIndex: -1,
          selection: null,
          scrollPosition: { x: 0, y: 0 },
          isDirty: false
        };
        
        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabId(newTab.id);
        setActiveProjectId(projectId);
        
        // Refresh projects list
        const projectsData = await window.electronAPI.getProjects();
        setProjects(projectsData || []);
      }
    }
    
    // Trigger auto-lookup
    shouldAutoLookupRef.current = true;
  }, [projectFolder, importWizardPath, setCues, setProjectInfo]);
  
  // Auto-lookup when file is loaded
  useEffect(() => {
    // Skip auto-lookup if browser panel is open (batch mode in progress)
    if (shouldAutoLookupRef.current && cues.length > 0 && !isLookingUp && !showBrowser) {
      console.log('[App] Auto-lookup triggered after file load with', cues.length, 'cues');
      shouldAutoLookupRef.current = false;
      // Small delay to let UI settle
      const timeoutId = setTimeout(() => {
        console.log('[App] Starting auto-lookup...');
        autoLookupAll();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [cues, isLookingUp, autoLookupAll, showBrowser]);

  const handleOpenFile = useCallback(async () => {
    if (window.electronAPI) {
      const filePath = await window.electronAPI.openPrprojDialog();
      if (filePath) {
        await handleFileDrop(filePath);
      }
    }
  }, [handleFileDrop]);

  const handleExport = useCallback(async (format = 'xlsx') => {
    if (!window.electronAPI?.exportExcel) return;
    
    // Filter out hidden tracks from export
    const visibleCues = cues.filter(c => !c.hidden);
    
    const result = await window.electronAPI.exportExcel({
      cues: visibleCues,
      projectInfo,
      format,
      projectFolder
    });
    
    if (result.success) {
      const fileName = result.filePath.split('/').pop();
      const hiddenCount = cues.length - visibleCues.length;
      showToast(
        `Exported ${fileName}${hiddenCount > 0 ? ` (${hiddenCount} hidden excluded)` : ''}`,
        'success',
        {
          icon: 'folder',
          label: 'Reveal',
          onClick: () => window.electronAPI?.revealInFinder?.(result.filePath)
        }
      );
    } else if (!result.canceled) {
      showToast(result.error || 'Export failed', 'warning');
    }
  }, [cues, projectInfo, projectFolder, showToast]);

  const handleShare = useCallback(async (format = 'xlsx') => {
    if (window.electronAPI?.shareExport) {
      // Filter out hidden tracks from share
      const visibleCues = cues.filter(c => !c.hidden);
      
      const result = await window.electronAPI.shareExport({
        cues: visibleCues,
        projectInfo,
        format,
        projectFolder
      });
      if (result.success) {
        showToast(`${format.toUpperCase()} ready to share`, 'success');
      }
    }
  }, [cues, projectInfo, projectFolder, showToast]);

  // Project tree handlers
  const handleCreateFolder = useCallback(async (parentId = null) => {
    if (window.electronAPI) {
      await window.electronAPI.createFolder(parentId, 'New Folder');
      const projectsData = await window.electronAPI.getProjects();
      setProjects(projectsData || []);
    }
  }, []);

  const handleRenameItem = useCallback(async (id, newName) => {
    if (window.electronAPI) {
      await window.electronAPI.renameItem(id, newName);
      const projectsData = await window.electronAPI.getProjects();
      setProjects(projectsData || []);
    }
  }, []);

  const handleDeleteItem = useCallback(async (id) => {
    if (window.electronAPI) {
      await window.electronAPI.deleteItem(id);
      const projectsData = await window.electronAPI.getProjects();
      setProjects(projectsData || []);
      
      // Close any tab associated with the deleted item
      const tabToClose = openTabs.find(t => t.projectId === id);
      if (tabToClose) {
        closeTab(tabToClose.id);
      } else if (activeProjectId === id) {
        // Fallback: if no tab but it was active, clear state
        setActiveProjectId(null);
        setCues([]);
      }
    }
  }, [activeProjectId, setCues, openTabs, closeTab]);

  const handleDuplicateItem = useCallback(async (id) => {
    if (window.electronAPI?.duplicateItem) {
      await window.electronAPI.duplicateItem(id);
      const projectsData = await window.electronAPI.getProjects();
      setProjects(projectsData || []);
    }
  }, []);

  const handleCreateCueSheet = useCallback(async (parentId = null) => {
    if (window.electronAPI?.createCueSheet) {
      const newCueSheet = await window.electronAPI.createCueSheet(parentId, 'New Cue Sheet');
      const projectsData = await window.electronAPI.getProjects();
      setProjects(projectsData || []);
      if (newCueSheet?.id) {
        setActiveProjectId(newCueSheet.id);
      }
    }
  }, []);

  const handleRevealInFinder = useCallback(async (filePath) => {
    if (window.electronAPI?.revealInFinder && filePath) {
      await window.electronAPI.revealInFinder(filePath);
    }
  }, []);

  const handleMoveItem = useCallback(async (itemId, newParentId) => {
    if (window.electronAPI) {
      await window.electronAPI.moveItem(itemId, newParentId);
      const projectsData = await window.electronAPI.getProjects();
      setProjects(projectsData || []);
    }
  }, []);

  // ACS Project Handlers
  const handleNewProject = useCallback(async () => {
    // Confirm if there are unsaved changes
    if (acsUnsavedChanges) {
      const confirmed = window.confirm('You have unsaved changes. Start a new project anyway?');
      if (!confirmed) return;
    }
    
    // Show the new project modal
    setNewProjectName('');
    setShowNewProjectModal(true);
  }, [acsUnsavedChanges]);

  const handleCreateNewProject = useCallback(async (projectName) => {
    if (!window.electronAPI?.acsNewWithName) return;
    
    const result = await window.electronAPI.acsNewWithName(projectName);
    
    if (result.success) {
      // Reload projects from the new project
      const projectsData = await window.electronAPI.getProjects();
      setProjects(projectsData || []);
      setAcsFilePath(result.acsFilePath);
      setProjectFolder(result.projectFolder);
      setAcsUnsavedChanges(false);
      setCues([]);
      setProjectInfo({});
      setActiveProjectId(null);
      
      // Update recent projects
      const recent = await window.electronAPI.acsGetRecent();
      setRecentProjects(recent || []);
      
      showToast(`Created "${result.name}"`, 'success');
    } else if (!result.canceled) {
      showToast('Failed to create project', 'warning');
    }
    
    setShowNewProjectModal(false);
  }, [setCues, setProjectInfo, showToast]);

  const handleOpenProject = useCallback(async () => {
    if (window.electronAPI?.acsOpen) {
      const result = await window.electronAPI.acsOpen();
      if (result.success) {
        // Reload projects from the loaded ACS data
        const projectsData = await window.electronAPI.getProjects();
        setProjects(projectsData || []);
        setAcsFilePath(result.path);
        setProjectFolder(result.data.projectFolder || null);
        setAcsUnsavedChanges(false);
        
        // Update recent projects
        const recent = await window.electronAPI.acsGetRecent();
        setRecentProjects(recent || []);
        
        showToast(`Opened "${result.data.name}"`, 'success');
      }
    }
  }, [showToast]);

  const handleOpenRecentProject = useCallback(async (filePath) => {
    if (window.electronAPI?.acsOpenPath) {
      const result = await window.electronAPI.acsOpenPath(filePath);
      if (result.success) {
        const projectsData = await window.electronAPI.getProjects();
        setProjects(projectsData || []);
        setAcsFilePath(result.path);
        setProjectFolder(result.data.projectFolder || null);
        setAcsUnsavedChanges(false);
        
        const recent = await window.electronAPI.acsGetRecent();
        setRecentProjects(recent || []);
        
        showToast(`Opened "${result.data.name}"`, 'success');
      } else {
        // File might not exist anymore
        showToast('Could not open project file', 'warning');
        if (window.electronAPI.acsRemoveFromRecent) {
          await window.electronAPI.acsRemoveFromRecent(filePath);
          const recent = await window.electronAPI.acsGetRecent();
          setRecentProjects(recent || []);
        }
      }
    }
  }, [showToast]);

  const handleSaveProject = useCallback(async () => {
    if (window.electronAPI?.acsSave) {
      const result = await window.electronAPI.acsSave(acsFilePath);
      if (result.success) {
        setAcsFilePath(result.path);
        setAcsUnsavedChanges(false);
        
        const recent = await window.electronAPI.acsGetRecent();
        setRecentProjects(recent || []);
        
        showToast('Project saved', 'success');
      } else if (!result.canceled) {
        showToast('Failed to save project', 'warning');
      }
    }
  }, [acsFilePath, showToast]);

  const handleSaveProjectAs = useCallback(async () => {
    if (window.electronAPI?.acsSaveAs) {
      const result = await window.electronAPI.acsSaveAs();
      if (result.success) {
        setAcsFilePath(result.path);
        setAcsUnsavedChanges(false);
        
        const recent = await window.electronAPI.acsGetRecent();
        setRecentProjects(recent || []);
        
        showToast(`Saved as "${result.name}"`, 'success');
      } else if (!result.canceled) {
        showToast('Failed to save project', 'warning');
      }
    }
  }, [showToast]);

  // Keyboard shortcuts for save/open
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Cmd+S or Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && !e.shiftKey) {
        e.preventDefault();
        handleSaveProject();
      }
      // Cmd+Shift+S or Ctrl+Shift+S to save as
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && e.shiftKey) {
        e.preventDefault();
        handleSaveProjectAs();
      }
      // Cmd+O or Ctrl+O to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        handleOpenProject();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSaveProject, handleSaveProjectAs, handleOpenProject]);

  // Track unsaved changes for ACS
  useEffect(() => {
    if (projects.length > 0 || cues.length > 0) {
      setAcsUnsavedChanges(true);
    }
  }, [projects, cues, projectInfo]);

  // Auris Chat message handler
  const handleSendChatMessage = useCallback(async (message) => {
    if (!message.trim() || isChatProcessing) return;
    
    // Add user message to chat
    const userMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message
    };
    setChatMessages(prev => [...prev, userMessage]);
    setIsChatProcessing(true);
    
    // Add thinking indicator
    const thinkingId = `thinking-${Date.now()}`;
    setChatMessages(prev => [...prev, { id: thinkingId, role: 'assistant', isThinking: true }]);
    
    try {
      console.log('[AurisChat] Sending message with pendingSuggestions:', pendingSuggestions ? pendingSuggestions.length : 0);
      const result = await window.electronAPI?.aurisChatSendMessage({
        message,
        conversationHistory: chatMessages.map(m => ({
          role: m.role,
          content: m.content
        })).filter(m => !m.isThinking),
        context: {
          projectName: projectInfo.projectName || acsFilePath?.split('/').pop()?.replace('.acs', ''),
          cueCount: cues.length,
          completedCount: cues.filter(c => c.composer && c.publisher).length,
          highlightCount: unresolvedHighlights.length,
          cues,
          highlights: unresolvedHighlights,
          pendingSuggestions // Pass pending suggestions for confirmation handling
        }
      });
      
      // Remove thinking indicator
      setChatMessages(prev => prev.filter(m => m.id !== thinkingId));
      
      if (result?.success) {
        // Add assistant response
        const assistantMessage = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: result.message,
          toolCalls: result.toolCalls?.map(tc => ({
            name: tc.name,
            status: 'complete',
            result: tc.result?.message || (tc.result?.found ? 'Found' : 'Not found')
          })),
          requiresConfirmation: result.requiresConfirmation
        };
        setChatMessages(prev => [...prev, assistantMessage]);
        
        // Store any suggestions for later confirmation
        if (result.suggestions && result.suggestions.length > 0) {
          console.log('[AurisChat] Storing suggestions:', result.suggestions);
          setPendingSuggestions(result.suggestions);
        } else if (result.actions && result.actions.length > 0) {
          // Clear pending suggestions when actions are applied
          console.log('[AurisChat] Clearing suggestions, actions applied');
          setPendingSuggestions(null);
        }
        
        // Execute any actions returned by the AI
        if (result.actions && result.actions.length > 0) {
          console.log('[AurisChat] Executing actions:', result.actions);
          let updatedCount = 0;
          for (const action of result.actions) {
            console.log('[AurisChat] Processing action:', action.type, action.data);
            if (action.type === 'update_track') {
              const { trackId, updates } = action.data;
              if (trackId && updates) {
                console.log('[AurisChat] Updating track:', trackId, updates);
                updateCue(trackId, updates);
                updatedCount++;
              } else {
                console.error('[AurisChat] Invalid update_track action:', action);
              }
            } else if (action.type === 'bulk_update_tracks') {
              const updates = action.data.updates || [];
              console.log('[AurisChat] Bulk updating', updates.length, 'tracks');
              updates.forEach(u => {
                if (u.track_id && u.updates) {
                  updateCue(u.track_id, u.updates);
                  updatedCount++;
                }
              });
              if (updates.length > 0) {
                showToast(`Updated ${updates.length} tracks`, 'success');
              }
            } else if (action.type === 'save_to_database') {
              window.electronAPI?.saveTrack(action.data.track);
            }
          }
          if (updatedCount > 0) {
            console.log('[AurisChat] Total tracks updated:', updatedCount);
          }
        } else {
          console.log('[AurisChat] No actions to execute');
        }
      } else {
        setChatMessages(prev => [...prev, {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: result?.error || 'Sorry, I encountered an error. Please try again.'
        }]);
      }
    } catch (err) {
      console.error('[AurisChat] Error:', err);
      setChatMessages(prev => prev.filter(m => m.id !== thinkingId));
      setChatMessages(prev => [...prev, {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.'
      }]);
    } finally {
      setIsChatProcessing(false);
    }
  }, [chatMessages, cues, highlights, unresolvedHighlights, projectInfo, acsFilePath, isChatProcessing, updateCue, showToast, pendingSuggestions]);

  // Handle annotation popover submit
  const handleAnnotationSubmit = useCallback(async (color, annotation) => {
    if (annotationPopover.mode === 'create' && selectedRows.length > 0) {
      // Create highlight using selected row IDs
      const rowIds = selectedRows.map(r => r.id);
      const newHighlight = {
        id: `highlight-${Date.now()}`,
        projectId: acsFilePath || activeProjectId,
        rowIds,
        color,
        annotation,
        resolved: false,
        createdAt: new Date().toISOString()
      };
      
      // Save via IPC
      if (window.electronAPI?.highlightsCreate) {
        await window.electronAPI.highlightsCreate(newHighlight);
      }
      
      showToast(`Created highlight with ${selectedRows.length} rows`, 'success');
    } else if (annotationPopover.highlightId) {
      await updateHighlightAnnotation(annotationPopover.highlightId, annotation);
      await updateHighlightColor(annotationPopover.highlightId, color);
    }
    setAnnotationPopover(prev => ({ ...prev, isOpen: false }));
  }, [annotationPopover, selectedRows, acsFilePath, activeProjectId, updateHighlightAnnotation, updateHighlightColor, showToast]);

  // Handle sending annotation to chat
  const handleSendAnnotationToChat = useCallback((annotation) => {
    setShowAurisChat(true);
    // Give time for panel to open
    setTimeout(() => {
      handleSendChatMessage(annotation);
    }, 100);
  }, [handleSendChatMessage]);

  // Handle right-click to create highlight from selection
  const handleContextMenuHighlight = useCallback((event) => {
    if (selectedRows.length > 0) {
      event.preventDefault();
      setAnnotationPopover({
        isOpen: true,
        position: { x: event.clientX, y: event.clientY },
        mode: 'create',
        highlightId: null,
        initialColor: 'yellow',
        initialAnnotation: ''
      });
    }
  }, [selectedRows]);

  // Handle clicking on annotation badge
  const handleAnnotationClick = useCallback((rowId) => {
    const highlight = highlights.find(h => h.rowIds.includes(rowId) && !h.resolved);
    if (highlight) {
      setAnnotationPopover({
        isOpen: true,
        position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
        mode: 'edit',
        highlightId: highlight.id,
        initialColor: highlight.color,
        initialAnnotation: highlight.annotation || ''
      });
    }
  }, [highlights]);

  // Jump to highlight in table
  const handleJumpToHighlight = useCallback((highlight) => {
    // Select the highlighted rows
    highlight.rowIds.forEach(id => {
      const allRowIds = cues.map(c => c.id);
      handleRowClick(id, allRowIds, { metaKey: true });
    });
  }, [cues, handleRowClick]);

  const handleSelectProject = useCallback(async (id, openInNewTab = false) => {
    // If double-click or explicit new tab request, open in new tab
    if (openInNewTab) {
      await openNewTab(id);
      return;
    }
    
    // Single click - if tab exists, switch to it; otherwise open new tab
    const existingTab = openTabs.find(t => t.projectId === id);
    if (existingTab) {
      switchTab(existingTab.id);
    } else {
      await openNewTab(id);
    }
  }, [openTabs, openNewTab, switchTab, projects]);

  // Open browser for manual lookup (single track)
  const handleOpenBrowser = useCallback((cue) => {
    setBrowserTrack(cue);
    setBatchTracks([]);
    setBatchIndex(0);
    setShowBrowser(true);
    // Set this as the pending track for BMG bookmarklet data
    setPendingBmgTrackId(cue.id);
  }, []);

  // Open browser for batch lookup (with track queue sidebar)
  const handleOpenBrowserBatch = useCallback((tracks, libraryFilter = null) => {
    if (!tracks || tracks.length === 0) return;
    setBatchTracks(tracks);
    setBatchIndex(0);
    setBrowserTrack(tracks[0]);
    setBatchLibraryFilter(libraryFilter);
    setShowBrowser(true);
    setPendingBmgTrackId(tracks[0].id);
  }, []);

  // Select a track from the batch sidebar
  const handleSelectBatchTrack = useCallback((track) => {
    const trackIndex = batchTracks.findIndex(t => t.id === track.id);
    if (trackIndex >= 0) {
      setBatchIndex(trackIndex);
      setBrowserTrack(track);
      setPendingBmgTrackId(track.id);
    }
  }, [batchTracks]);

  // Batch complete
  const handleBrowserBatchComplete = useCallback(() => {
    showToast(`Completed batch lookup for ${batchTracks.length} tracks`, 'success');
    setBatchTracks([]);
    setBatchIndex(0);
    setBrowserTrack(null);
    setShowBrowser(false);
  }, [batchTracks.length, showToast]);

  // Handle BMG data extracted from sidebar button
  const handleExtractBMG = useCallback((data) => {
    if (!data) return;
    
    // Find the first pending track to update
    let targetCue = null;
    
    // First, try the pending BMG track
    if (pendingBmgTrackId) {
      targetCue = cues.find(c => c.id === pendingBmgTrackId);
    }
    
    // If no pending track, try to match by track name
    if (!targetCue && data.trackName) {
      const searchName = data.trackName.toLowerCase().replace(/[^a-z0-9]/g, '');
      targetCue = cues.find(c => {
        const cueName = (c.trackName || c.originalName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return cueName.includes(searchName) || searchName.includes(cueName);
      });
    }
    
    // Fall back to first incomplete track
    if (!targetCue) {
      targetCue = cues.find(c => c.status !== 'complete' && !c.composer);
    }
    
    if (targetCue) {
      updateCue(targetCue.id, {
        composer: data.composer || targetCue.composer,
        composerSource: data.composer ? 'bmg_extract' : targetCue.composerSource,
        publisher: data.publisher || targetCue.publisher,
        publisherSource: data.publisher ? 'bmg_extract' : targetCue.publisherSource,
        source: data.album ? `${data.album}${data.albumCode ? ` (${data.albumCode})` : ''}` : targetCue.source,
        sourceSource: data.album ? 'bmg_extract' : targetCue.sourceSource,
        trackNumber: data.trackNumber || targetCue.trackNumber,
        trackNumberSource: data.trackNumber ? 'bmg_extract' : targetCue.trackNumberSource,
        artist: data.artist || targetCue.artist,
        artistSource: data.artist ? 'bmg_extract' : targetCue.artistSource,
        label: data.label || targetCue.label,
        labelSource: data.label ? 'bmg_extract' : targetCue.labelSource,
        masterContact: data.masterContact || targetCue.masterContact,
        status: data.composer ? 'complete' : targetCue.status
      });
      
      showToast(`Updated "${targetCue.trackName}" with BMG data`, 'success');
      
      // Save to track database
      if (window.electronAPI?.saveTrack) {
        window.electronAPI.saveTrack({
          trackName: data.trackName,
          catalogCode: data.albumCode,
          artist: data.artist,
          source: data.album,
          composer: data.composer,
          publisher: data.publisher,
          library: data.label, // Use detected library, not hardcoded
          masterContact: data.masterContact,
          verified: true,
          dataSource: 'bmg_extract'
        });
      }
    } else {
      showToast('No matching track found to update', 'warning');
    }
  }, [cues, pendingBmgTrackId, updateCue, showToast]);

  // Show all hidden tracks
  const handleShowAllTracks = useCallback(() => {
    const hiddenTracks = cues.filter(c => c.hidden);
    if (hiddenTracks.length > 0) {
      setCues(prevCues => prevCues.map(cue => ({ ...cue, hidden: false })));
      showToast(`Showing ${hiddenTracks.length} hidden track${hiddenTracks.length > 1 ? 's' : ''}`, 'info');
    }
  }, [cues, setCues, showToast]);

  // Handle data extracted from browser (AI extraction)
  // Only fills in empty fields - does NOT overwrite existing auto-lookup data
  const handleBrowserDataExtracted = useCallback((data, forceOverwrite = false) => {
    if (browserTrack && data) {
      // Build update object - only include fields that should be updated
      const updates = {};
      
      // For each field, only apply if current value is empty OR user chose to overwrite
      const fieldsToCheck = ['composer', 'publisher', 'label', 'masterContact', 'source', 'trackNumber', 'artist'];
      
      for (const field of fieldsToCheck) {
        if (data[field]) {
          const currentValue = browserTrack[field];
          // Only fill in if empty or user explicitly wants to overwrite
          if (!currentValue || forceOverwrite) {
            updates[field] = data[field];
            // Track the source of each field
            updates[`${field}Source`] = 'ai_extract';
            // Add confidence for composer/publisher
            if (field === 'composer') {
              updates.composerConfidence = 1.0;
            }
            if (field === 'publisher') {
              updates.publisherConfidence = 1.0;
            }
          }
        }
      }
      
      if (Object.keys(updates).length > 0) {
        updateCue(browserTrack.id, updates);
        showToast(`Updated ${Object.keys(updates).length} fields for "${browserTrack.trackName}"`, 'success');
      } else {
        showToast('No empty fields to fill - all fields already have data', 'warning');
      }
      
      // Save to track database for future predictions
      if (window.electronAPI && data.composer) {
        window.electronAPI.saveTrack({
          trackName: browserTrack.trackName,
          catalogCode: browserTrack.catalogCode,
          artist: browserTrack.artist,
          source: browserTrack.source,
          library: data.label,
          ...data,
          verified: true,
          dataSource: 'ai_extract'
        });
      }
    }
    // Only close browser if NOT in batch mode
    // In batch mode, the browser stays open for the next track
    if (batchTracks.length === 0) {
      setShowBrowser(false);
      setBrowserTrack(null);
    }
  }, [browserTrack, updateCue, showToast, batchTracks.length]);

  // ==========================================
  // Guided Tour Handlers
  // ==========================================
  
  const handleTourComplete = useCallback(() => {
    setShowTour(false);
  }, []);
  
  const handleLoadSampleData = useCallback(() => {
    // Load sample cue data for the tour demo
    setCues(SAMPLE_CUE_DATA);
    setProjectInfo({ projectName: 'Demo Cue Sheet' });
  }, []);
  
  const handleClearSampleData = useCallback(() => {
    // Clear sample data after tour
    setCues([]);
    setProjectInfo({});
    setAiAssistEnabled(false);
    setSelectedCells([]);
    setSelectedRows([]);
    setShowTourPanel(false);
    setTourSelection(null);
  }, []);
  
  const handleTourShowPanel = useCallback(() => {
    // Show the mock panel and fill in the cells with the suggested value
    setShowTourPanel(true);
    
    // Fill the empty source cells with the suggestion
    setCues(prev => prev.map(cue => {
      if (!cue.source) {
        return { ...cue, source: 'BMG' };
      }
      return cue;
    }));
  }, []);
  
  const handleTourHidePanel = useCallback(() => {
    // Hide the panel and clear selection when moving past step 3
    setShowTourPanel(false);
    setSelectedCells([]);
    setSelectedRows([]);
    setTourSelection(null);
  }, []);
  
  const handleTourEnableAI = useCallback(() => {
    setAiAssistEnabled(true);
  }, []);
  
  const handleTourSelectEmptyCells = useCallback(() => {
    // Find the empty source cells (rows 3 and 4 in sample data, which are indices 2 and 3)
    // Column order: 0=visibility, 1=index, 2=trackName, 3=duration, 4=artist, 5=source
    const sourceColIndex = 5;
    
    // Select rows 2 and 3 (Epic Rise Build and Tension Underscore), source column
    const newSelection = {
      startRow: 2,  // Epic Rise Build (3rd row, 0-indexed)
      startCol: sourceColIndex,
      endRow: 3,    // Tension Underscore (4th row)
      endCol: sourceColIndex
    };
    
    setTourSelection(newSelection);
    
    // Also set the selectedRows for the smart suggestions hook
    const emptyRows = cues.filter(cue => !cue.source);
    setSelectedRows(emptyRows);
  }, [cues]);

  const hasProject = cues.length > 0;

  // Show login page if not authenticated
  if (!isAuthenticated && !authLoading) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  // Show loading state while checking auth
  if (authLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-auris-bg">
        <div className="text-auris-text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-auris-bg noise-bg">
      <Header 
        projectName={activeTab?.name || projectInfo.projectName}
        acsFilePath={acsFilePath}
        hasUnsavedChanges={acsUnsavedChanges}
        onExport={handleExport}
        onShare={handleShare}
        onToggleSidebar={() => setShowSidebar(!showSidebar)}
        onOpenSettings={() => setShowSettings(true)}
        onNewProject={handleNewProject}
        onOpenProject={handleOpenProject}
        onSaveProject={handleSaveProject}
        onSaveProjectAs={handleSaveProjectAs}
        hasProject={hasProject}
        isLookingUp={isLookingUp}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < cuesHistory.length - 1}
        onOpenLogin={() => setShowLoginModal(true)}
        onOpenFeedback={() => setShowFeedbackModal(true)}
        onToggleAurisChat={() => setShowAurisChat(!showAurisChat)}
        showAurisChat={showAurisChat}
        onStartTour={() => setShowTour(true)}
      />
      
      <div className="flex-1 flex overflow-hidden" data-tour="workspace">
        {/* Project Tree (Left) */}
        {showProjectTree && (
          <div className="w-56 flex-shrink-0" data-tour="drop-zone">
            <ProjectTree
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={handleSelectProject}
              onCreateFolder={handleCreateFolder}
              onOpenFile={handleOpenFile}
              onRename={handleRenameItem}
              onDelete={handleDeleteItem}
              onDuplicate={handleDuplicateItem}
              onCreateCueSheet={handleCreateCueSheet}
              onMoveItem={handleMoveItem}
              onFileDrop={handleFileDrop}
              onRevealInFinder={handleRevealInFinder}
              openTabProjectIds={openTabs.map(t => t.projectId)}
            />
          </div>
        )}

        {/* Main Content (Center) */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {!hasProject ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-80">
                {/* Logo */}
                <div className="flex flex-col items-center mb-10">
                  <img 
                    src="./auris-wordmark.svg" 
                    alt="Auris" 
                    className="h-12"
                  />
                  <p className="text-[10px] tracking-[0.25em] text-auris-text-muted/60 mt-2 uppercase">
                    Cue Sheet Intelligence
                  </p>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-3 mb-8">
                  <button
                    onClick={handleOpenProject}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-auris-card border border-auris-border rounded-lg hover:bg-auris-card/80 hover:border-auris-text-muted/30 transition-colors group"
                  >
                    <FolderOpen size={20} className="text-auris-text-muted group-hover:text-auris-text" weight="regular" />
                    <span className="text-sm text-auris-text">Open Project</span>
                  </button>
                  <button
                    onClick={handleNewProject}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-auris-card border border-auris-border rounded-lg hover:bg-auris-card/80 hover:border-auris-text-muted/30 transition-colors group"
                  >
                    <FilePlus size={20} className="text-auris-text-muted group-hover:text-auris-text" weight="regular" />
                    <span className="text-sm text-auris-text">New Project</span>
                  </button>
                </div>
                
                {/* Recent Projects */}
                {recentProjects.length > 0 && (
                  <div>
                    <p className="text-xs text-auris-text-muted uppercase tracking-wider mb-2">Recent</p>
                    <div className="space-y-0.5">
                      {recentProjects.slice(0, 5).map((project) => (
                        <button
                          key={project.path}
                          onClick={() => handleOpenRecentProject(project.path)}
                          className="w-full py-1.5 text-left hover:bg-auris-card/30 rounded transition-colors"
                        >
                          <span className="text-sm text-auris-text-secondary hover:text-auris-text">
                            {project.name}
                            <span className="text-auris-text-muted/50 ml-2">
                              ~/{project.path.split('/').slice(-2, -1).join('/')}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div 
              className="flex-1 flex flex-col overflow-hidden"
              onContextMenu={handleContextMenuHighlight}
            >
              {/* Tab Bar - inside cue sheet column */}
              <TabBar
                tabs={openTabs}
                activeTabId={activeTabId}
                onTabSelect={switchTab}
                onTabClose={closeTab}
                aiAssistEnabled={aiAssistEnabled}
                onToggleAiAssist={() => setAiAssistEnabled(!aiAssistEnabled)}
              />
              <div data-tour="cue-table" className="flex-1 overflow-hidden flex flex-col">
                <CueTable 
                  cues={cues}
                  onUpdateCue={updateCue}
                  onBatchUpdateCues={batchUpdateCues}
                  onLookupCue={lookupSingleCue}
                  isLoading={isLoading}
                  isLookingUp={isLookingUp}
                  onOpenBrowser={handleOpenBrowser}
                  onShowAllTracks={handleShowAllTracks}
                  onSelectionChange={handleSelectionChange}
                  getRowHighlightColor={getRowHighlightColor}
                  getRowAnnotation={getRowAnnotation}
                  onAnnotationClick={handleAnnotationClick}
                  scrollPosition={activeTab?.scrollPosition}
                  onScrollChange={handleScrollChange}
                  externalSelection={tourSelection}
                />
              </div>
            </div>
          )}
        </main>
        
        {/* Info Sidebar (Right) */}
        {showSidebar && hasProject && !showAurisChat && (
          <Sidebar 
            projectInfo={projectInfo}
            setProjectInfo={setProjectInfo}
            cueCount={cues.length}
            completedCount={cues.filter(c => {
              const hasContent = (v) => v && v.trim() !== '' && v.trim() !== '-';
              return hasContent(c.composer) && hasContent(c.publisher);
            }).length}
            isLookingUp={isLookingUp}
            pendingTracks={cues.filter(c => !c.hidden && c.status !== 'complete' && !c.composer)}
            onExtractBMG={handleExtractBMG}
            onOpenBrowser={handleOpenBrowser}
            onOpenBrowserBatch={handleOpenBrowserBatch}
          />
        )}
        
        {/* Auris Chat Panel (Right) */}
        {showAurisChat && hasProject && (
          <AurisChatPanel
            isOpen={showAurisChat}
            onClose={() => setShowAurisChat(false)}
            messages={chatMessages}
            isProcessing={isChatProcessing}
            onSendMessage={handleSendChatMessage}
            highlights={unresolvedHighlights}
            onJumpToHighlight={handleJumpToHighlight}
            onResolveHighlight={resolveHighlight}
            selectedRowIds={selectedRows.map(r => r.id)}
            cues={cues}
          />
        )}
      </div>

      {/* Smart Suggestion Panel - Auto-shows when cells with missing data selected (only when AI assist enabled) */}
      {!showAurisChat && hasProject && smartSuggestions && aiAssistEnabled && !showTour && (
        <SmartSuggestionPanel
          suggestions={smartSuggestions}
          isLoading={isLoadingSuggestions}
          isRefining={isRefiningSuggestions}
          activeField={activeSuggestionField}
          onSelectField={getSuggestionsForField}
          onApplySuggestion={applySuggestion}
          onApplyCustom={applyCustomValue}
          onRefine={refineSuggestions}
          onDismiss={dismissSuggestions}
          position={selectionPosition}
        />
      )}

      {/* Tour Demo: Mock Suggestion Panel - shows only at Smart Fill step 3 */}
      {showTourPanel && createPortal(
        <div 
          style={{ position: 'fixed', top: 250, right: 100, zIndex: 10000 }}
          className="w-80 bg-auris-card border-2 border-auris-blue rounded-xl shadow-2xl overflow-hidden animate-pulse"
        >
          <div className="p-4 border-b border-auris-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-auris-text-muted uppercase tracking-wide">Smart Fill</span>
              <span className="text-xs text-auris-blue">2 tracks selected</span>
            </div>
            <div className="text-sm text-auris-text-secondary">
              Fill <span className="text-auris-text font-medium">Source</span> for selected tracks
            </div>
          </div>
          
          <div className="p-3 space-y-2">
            <div className="p-3 bg-auris-bg rounded-lg border border-auris-blue/50 cursor-pointer hover:border-auris-blue transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm text-auris-text font-medium">BMG</span>
                <span className="text-xs text-auris-green">95%</span>
              </div>
              <div className="text-xs text-auris-text-muted mt-1">
                From sibling track "Punch Drunk" (same library)
              </div>
            </div>
            
            <div className="p-3 bg-auris-bg rounded-lg border border-auris-border cursor-pointer hover:border-auris-border-light transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm text-auris-text">Extreme Music</span>
                <span className="text-xs text-auris-text-muted">72%</span>
              </div>
              <div className="text-xs text-auris-text-muted mt-1">
                From Learned Data (similar track name)
              </div>
            </div>
          </div>
          
          <div className="p-3 border-t border-auris-border">
            <div className="text-xs text-auris-text-muted text-center">
              Click a suggestion to apply, or type your own
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        sources={sources}
        onUpdateSources={setSources}
      />

      {/* Browser Panel for Manual Lookup (Single & Batch) */}
      <BrowserPanel
        isOpen={showBrowser}
        onClose={() => {
          setShowBrowser(false);
          setBrowserTrack(null);
          setBatchTracks([]);
          setBatchIndex(0);
          setBatchLibraryFilter(null);
        }}
        trackInfo={browserTrack}
        onDataExtracted={handleBrowserDataExtracted}
        pendingTracks={batchTracks}
        currentTrackIndex={batchIndex}
        onSelectTrack={handleSelectBatchTrack}
        onBatchComplete={handleBrowserBatchComplete}
        libraryFilter={batchLibraryFilter}
      />

      {/* New Project Modal */}
      {showNewProjectModal && (
        <div 
          data-modal-root
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]"
          onClick={() => setShowNewProjectModal(false)}
        >
          <div 
            className="bg-auris-bg-secondary border border-auris-border rounded-xl shadow-2xl w-[360px] p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-auris-text mb-4">New Project</h2>
            
            <div className="mb-4">
              <label className="block text-sm text-auris-text-muted mb-1.5">Project Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newProjectName.trim()) {
                    handleCreateNewProject(newProjectName.trim());
                  } else if (e.key === 'Escape') {
                    setShowNewProjectModal(false);
                  }
                }}
                placeholder="Enter project name..."
                className="w-full bg-auris-bg border border-auris-border rounded-lg px-3 py-2 text-auris-text placeholder:text-auris-text-muted/50 focus:outline-none focus:border-auris-text-muted/50"
                autoFocus
              />
            </div>
            
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 text-sm text-auris-text-muted hover:text-auris-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleCreateNewProject(newProjectName.trim())}
                disabled={!newProjectName.trim()}
                className="px-4 py-2 text-sm bg-white text-black rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      <LoginModal 
        isOpen={showLoginModal} 
        onClose={() => setShowLoginModal(false)} 
      />

      {/* Feedback Modal */}
      <FeedbackModal 
        isOpen={showFeedbackModal} 
        onClose={() => setShowFeedbackModal(false)} 
      />

      {/* Import Wizard */}
      <ImportWizard
        isOpen={showImportWizard}
        projectPath={importWizardPath}
        onClose={() => {
          setShowImportWizard(false);
          setImportWizardPath(null);
        }}
        onComplete={handleImportWizardComplete}
      />

      {/* Annotation Popover */}
      <AnnotationPopover
        isOpen={annotationPopover.isOpen}
        onClose={() => setAnnotationPopover(prev => ({ ...prev, isOpen: false }))}
        position={annotationPopover.position}
        mode={annotationPopover.mode}
        initialColor={annotationPopover.initialColor}
        initialAnnotation={annotationPopover.initialAnnotation}
        selectedCount={selectedRows.length}
        onSubmit={handleAnnotationSubmit}
        onDelete={annotationPopover.highlightId ? () => {
          deleteHighlight(annotationPopover.highlightId);
          setAnnotationPopover(prev => ({ ...prev, isOpen: false }));
        } : null}
        onSendToChat={handleSendAnnotationToChat}
      />

      {/* Toast Notification - positioned near Export button */}
      {toast && (
        <div 
          data-modal-root
          className={`
            fixed top-14 right-4 z-[9999] flex items-center gap-2 px-3 py-2 rounded-lg shadow-xl
            ${toast.type === 'success' 
              ? 'bg-green-900 border border-green-700 text-green-100' 
              : toast.type === 'info'
              ? 'bg-blue-900 border border-blue-700 text-blue-100'
              : toast.type === 'error'
              ? 'bg-red-900 border border-red-700 text-red-100'
              : 'bg-amber-900 border border-amber-700 text-amber-100'
            }
          `}
        >
          {toast.type === 'success' ? (
            <CheckCircle size={16} weight="fill" className="text-green-400 flex-shrink-0" />
          ) : toast.type === 'info' ? (
            <CircleNotch size={16} className="text-blue-400 flex-shrink-0 animate-spin" />
          ) : toast.type === 'error' ? (
            <Warning size={16} weight="fill" className="text-red-400 flex-shrink-0" />
          ) : (
            <Warning size={16} weight="fill" className="text-amber-400 flex-shrink-0" />
          )}
          <span className="text-sm font-medium max-w-[280px] truncate">{toast.message}</span>
          
          {/* Action button (e.g., Reveal in Finder) */}
          {toast.action && (
            <button
              onClick={() => {
                toast.action.onClick?.();
                setToast(null);
              }}
              className="p-1 hover:bg-white/20 rounded transition-colors flex-shrink-0"
              title={toast.action.label}
            >
              {toast.action.icon === 'folder' && <FolderSimple size={14} weight="fill" />}
            </button>
          )}
          
          <button 
            onClick={() => setToast(null)}
            className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      )}

      {/* Update Downloading Notification */}
      {updateAvailable && !updateDownloaded && (
        <div 
          data-modal-root
          className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 px-4 py-3 rounded-xl shadow-xl bg-auris-card border border-auris-purple/50 min-w-[280px]"
        >
          <div className="flex items-center gap-3">
            <CircleNotch size={20} className="text-auris-purple flex-shrink-0 animate-spin" />
            <div className="flex flex-col flex-1">
              <span className="text-sm font-medium text-auris-text">Downloading Update v{updateAvailable.version}</span>
              <span className="text-xs text-auris-text-muted">
                {updateProgress 
                  ? `${(updateProgress.transferred / 1024 / 1024).toFixed(1)} MB / ${(updateProgress.total / 1024 / 1024).toFixed(1)} MB`
                  : 'Starting download...'}
              </span>
            </div>
            <span className="text-sm font-semibold text-auris-purple">
              {updateProgress ? `${Math.round(updateProgress.percent)}%` : '0%'}
            </span>
          </div>
          {/* Progress Bar */}
          <div className="w-full h-2 bg-auris-bg rounded-full overflow-hidden">
            <div 
              className="h-full bg-auris-purple transition-all duration-300 ease-out rounded-full"
              style={{ width: `${updateProgress?.percent || 0}%` }}
            />
          </div>
          {updateProgress?.bytesPerSecond > 0 && (
            <span className="text-xs text-auris-text-muted text-right">
              {(updateProgress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s
            </span>
          )}
        </div>
      )}

      {/* Update Ready Notification */}
      {updateDownloaded && updateAvailable && (
        <div 
          data-modal-root
          className="fixed bottom-4 right-4 z-[9999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl bg-auris-card border border-auris-blue/50"
        >
          <ArrowsClockwise size={20} className="text-auris-blue flex-shrink-0" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-auris-text">Update Ready</span>
            <span className="text-xs text-auris-text-muted">v{updateAvailable.version} downloaded</span>
          </div>
          <button
            onClick={() => window.electronAPI?.updaterInstall()}
            className="ml-2 px-3 py-1.5 bg-auris-blue text-white text-sm font-medium rounded-lg hover:bg-auris-blue/80 transition-colors"
          >
            Restart
          </button>
          <button 
            onClick={() => setUpdateDownloaded(false)}
            className="p-1 hover:bg-white/10 rounded transition-colors flex-shrink-0 text-auris-text-muted"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}

      {/* Guided Tour */}
      <GuidedTour
        isActive={showTour}
        onComplete={handleTourComplete}
        onLoadSampleData={handleLoadSampleData}
        onClearSampleData={handleClearSampleData}
        onEnableAI={handleTourEnableAI}
        onSelectEmptyCells={handleTourSelectEmptyCells}
        onShowPanel={handleTourShowPanel}
        onHidePanel={handleTourHidePanel}
      />
    </div>
  );
}

export default App;
