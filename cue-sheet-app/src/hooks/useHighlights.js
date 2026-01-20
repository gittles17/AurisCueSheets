import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Hook for managing row selection and highlights in the cue table
 * Supports shift+click selection, highlight colors, and annotations
 */
export function useHighlights(projectId) {
  // Selected row IDs (temporary selection state)
  const [selectedRowIds, setSelectedRowIds] = useState(new Set());
  
  // Persistent highlights with colors and annotations
  const [highlights, setHighlights] = useState([]);
  
  // Last clicked row for shift+click range selection
  const lastClickedRowRef = useRef(null);
  
  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Load highlights from cloud/local storage when project changes
  useEffect(() => {
    if (!projectId) {
      setHighlights([]);
      return;
    }
    
    const loadHighlights = async () => {
      setIsLoading(true);
      try {
        if (window.electronAPI?.highlightsGet) {
          const data = await window.electronAPI.highlightsGet(projectId);
          setHighlights(data || []);
        }
        
        // Subscribe to real-time changes
        if (window.electronAPI?.highlightsSubscribe) {
          await window.electronAPI.highlightsSubscribe(projectId);
        }
      } catch (err) {
        console.error('[useHighlights] Failed to load:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadHighlights();
    
    // Set up real-time listener
    const handleChange = (change) => {
      console.log('[useHighlights] Real-time change:', change);
      if (change.projectId !== projectId) return;
      
      if (change.type === 'INSERT') {
        setHighlights(prev => {
          // Don't add if already exists
          if (prev.find(h => h.id === change.highlight.id?.toString())) return prev;
          return [...prev, {
            id: change.highlight.id?.toString(),
            projectId: change.highlight.project_id,
            rowIds: change.highlight.row_ids || [],
            color: change.highlight.color,
            annotation: change.highlight.annotation,
            resolved: change.highlight.resolved,
            createdAt: change.highlight.created_at
          }];
        });
      } else if (change.type === 'UPDATE') {
        setHighlights(prev => prev.map(h => 
          h.id === change.highlight.id?.toString() 
            ? {
                ...h,
                color: change.highlight.color,
                annotation: change.highlight.annotation,
                resolved: change.highlight.resolved,
                resolvedAt: change.highlight.resolved_at
              }
            : h
        ));
      } else if (change.type === 'DELETE') {
        setHighlights(prev => prev.filter(h => h.id !== change.highlight.id?.toString()));
      }
    };
    
    window.electronAPI?.onHighlightsChange?.(handleChange);
    
    return () => {
      window.electronAPI?.removeHighlightsChangeListener?.();
    };
  }, [projectId]);

  // Handle row click with shift+click support
  const handleRowClick = useCallback((rowId, allRowIds, event) => {
    if (!event) {
      // Simple selection without event
      setSelectedRowIds(new Set([rowId]));
      lastClickedRowRef.current = rowId;
      return;
    }

    if (event.shiftKey && lastClickedRowRef.current) {
      // Shift+click: select range
      const lastIndex = allRowIds.indexOf(lastClickedRowRef.current);
      const currentIndex = allRowIds.indexOf(rowId);
      
      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = allRowIds.slice(start, end + 1);
        
        setSelectedRowIds(prev => {
          const newSet = new Set(prev);
          rangeIds.forEach(id => newSet.add(id));
          return newSet;
        });
      }
    } else if (event.metaKey || event.ctrlKey) {
      // Cmd/Ctrl+click: toggle selection
      setSelectedRowIds(prev => {
        const newSet = new Set(prev);
        if (newSet.has(rowId)) {
          newSet.delete(rowId);
        } else {
          newSet.add(rowId);
        }
        return newSet;
      });
      lastClickedRowRef.current = rowId;
    } else {
      // Regular click: select only this row
      setSelectedRowIds(new Set([rowId]));
      lastClickedRowRef.current = rowId;
    }
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedRowIds(new Set());
    lastClickedRowRef.current = null;
  }, []);

  // Select all rows
  const selectAll = useCallback((allRowIds) => {
    setSelectedRowIds(new Set(allRowIds));
  }, []);

  // Create a highlight from the current selection
  const createHighlight = useCallback(async (color = 'yellow', annotation = '') => {
    if (selectedRowIds.size === 0) return null;
    
    const newHighlight = {
      id: `highlight-${Date.now()}`,
      projectId,
      rowIds: Array.from(selectedRowIds),
      color,
      annotation,
      resolved: false,
      createdAt: new Date().toISOString()
    };
    
    setHighlights(prev => [...prev, newHighlight]);
    
    // Save to backend
    if (window.electronAPI?.highlightsCreate) {
      try {
        const result = await window.electronAPI.highlightsCreate(newHighlight);
        if (result?.id) {
          newHighlight.id = result.id;
        }
      } catch (err) {
        console.error('[useHighlights] Failed to save:', err);
      }
    }
    
    // Clear selection after creating highlight
    clearSelection();
    
    return newHighlight;
  }, [selectedRowIds, projectId, clearSelection]);

  // Update a highlight's annotation
  const updateHighlightAnnotation = useCallback(async (highlightId, annotation) => {
    setHighlights(prev => prev.map(h => 
      h.id === highlightId ? { ...h, annotation, updatedAt: new Date().toISOString() } : h
    ));
    
    if (window.electronAPI?.highlightsUpdate) {
      try {
        await window.electronAPI.highlightsUpdate(highlightId, { annotation });
      } catch (err) {
        console.error('[useHighlights] Failed to update:', err);
      }
    }
  }, []);

  // Update a highlight's color
  const updateHighlightColor = useCallback(async (highlightId, color) => {
    setHighlights(prev => prev.map(h => 
      h.id === highlightId ? { ...h, color, updatedAt: new Date().toISOString() } : h
    ));
    
    if (window.electronAPI?.highlightsUpdate) {
      try {
        await window.electronAPI.highlightsUpdate(highlightId, { color });
      } catch (err) {
        console.error('[useHighlights] Failed to update:', err);
      }
    }
  }, []);

  // Mark a highlight as resolved (processed by AI)
  const resolveHighlight = useCallback(async (highlightId) => {
    setHighlights(prev => prev.map(h => 
      h.id === highlightId ? { ...h, resolved: true, resolvedAt: new Date().toISOString() } : h
    ));
    
    if (window.electronAPI?.highlightsUpdate) {
      try {
        await window.electronAPI.highlightsUpdate(highlightId, { resolved: true });
      } catch (err) {
        console.error('[useHighlights] Failed to resolve:', err);
      }
    }
  }, []);

  // Delete a highlight
  const deleteHighlight = useCallback(async (highlightId) => {
    setHighlights(prev => prev.filter(h => h.id !== highlightId));
    
    if (window.electronAPI?.highlightsDelete) {
      try {
        await window.electronAPI.highlightsDelete(highlightId);
      } catch (err) {
        console.error('[useHighlights] Failed to delete:', err);
      }
    }
  }, []);

  // Get highlight for a specific row (returns first match)
  const getRowHighlight = useCallback((rowId) => {
    return highlights.find(h => h.rowIds.includes(rowId));
  }, [highlights]);

  // Get all highlights for specific row IDs
  const getRowsHighlights = useCallback((rowIds) => {
    return highlights.filter(h => h.rowIds.some(id => rowIds.includes(id)));
  }, [highlights]);

  // Get all unresolved highlights
  const unresolvedHighlights = highlights.filter(h => !h.resolved);

  // Check if a row is selected
  const isRowSelected = useCallback((rowId) => {
    return selectedRowIds.has(rowId);
  }, [selectedRowIds]);

  // Get highlight color for a row
  const getRowHighlightColor = useCallback((rowId) => {
    const highlight = highlights.find(h => h.rowIds.includes(rowId) && !h.resolved);
    return highlight?.color || null;
  }, [highlights]);

  // Get annotation for a row
  const getRowAnnotation = useCallback((rowId) => {
    const highlight = highlights.find(h => h.rowIds.includes(rowId) && !h.resolved);
    return highlight?.annotation || null;
  }, [highlights]);

  return {
    // Selection state
    selectedRowIds: Array.from(selectedRowIds),
    selectedCount: selectedRowIds.size,
    isRowSelected,
    handleRowClick,
    clearSelection,
    selectAll,
    
    // Highlights
    highlights,
    unresolvedHighlights,
    createHighlight,
    updateHighlightAnnotation,
    updateHighlightColor,
    resolveHighlight,
    deleteHighlight,
    getRowHighlight,
    getRowsHighlights,
    getRowHighlightColor,
    getRowAnnotation,
    
    // Loading
    isLoading
  };
}

export default useHighlights;
