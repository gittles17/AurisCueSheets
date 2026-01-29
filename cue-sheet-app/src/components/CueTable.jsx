import { useState, useCallback, useRef, useEffect, memo, useMemo } from 'react';
import { List } from 'react-window';
import { CircleNotch, Warning, CheckCircle, XCircle, Database, Sparkle, Eye, EyeSlash, NotePencil, MagnifyingGlassMinus, MagnifyingGlassPlus, Lightning } from '@phosphor-icons/react';
import AutocompleteInput from './AutocompleteInput';

// Row height constant for virtualization
const ROW_HEIGHT = 48;

// Debounce utility for selection updates (~60fps)
function useDebounce(callback, delay = 16) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(callback);
  
  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  return useCallback((...args) => {
    if (timeoutRef.current) {
      cancelAnimationFrame(timeoutRef.current);
    }
    timeoutRef.current = requestAnimationFrame(() => {
      callbackRef.current(...args);
    });
  }, []);
}

/**
 * Get confidence color class based on level
 */
function getConfidenceColor(confidence) {
  if (confidence >= 0.9) return 'text-auris-green';
  if (confidence >= 0.7) return 'text-auris-blue';
  if (confidence >= 0.5) return 'text-auris-orange';
  return 'text-auris-red';
}

/**
 * Confidence indicator - small inline icon with approval state
 */
function ConfidenceIndicator({ confidence, source, onApprove, matchedTrack, matchReason, patternReason }) {
  if (confidence === undefined || confidence === null) return null;
  
  const percent = Math.round(confidence * 100);
  const isApproved = source === 'user' || source === 'user_edit' || source === 'user_approved';
  const isLearned = source === 'learned_db' || source === 'pattern_prediction';
  const isPattern = source === 'pattern_auto' || source === 'pattern';
  const needsApproval = confidence < 1 && !isApproved;
  
  // Build detailed tooltip for approval decisions
  const buildTooltip = () => {
    if (isApproved || confidence >= 1) return 'Verified';
    
    // Pattern-applied data
    if (isPattern && patternReason) {
      return `Auto-filled by pattern (${percent}%)\n${patternReason}\n\nClick to approve or change`;
    }
    
    // Concise explanation: "Matched 'X' - reason"
    let tip = '';
    if (matchedTrack && matchReason) {
      tip = `Matched "${matchedTrack}"\n${matchReason}`;
    } else if (matchedTrack) {
      tip = `Matched "${matchedTrack}"\n${percent}% similar - verify this is correct`;
    } else if (matchReason) {
      tip = matchReason;
    } else if (isLearned) {
      // Fallback for old data without match reason
      tip = `Found in database (${percent}% match)\nRe-import file for detailed match info`;
    } else if (isPattern) {
      tip = `Auto-filled by learned pattern (${percent}%)`;
    } else {
      tip = `${percent}% confidence`;
    }
    tip += '\n\nClick to approve or edit';
    return tip;
  };
  
  // Already approved or 100% confidence
  if (isApproved || confidence >= 1) {
    return (
      <span 
        className="inline-flex items-center text-auris-green"
        title="Verified"
      >
        <CheckCircle size={12} weight="fill" />
      </span>
    );
  }
  
  // Needs approval - show warning with click to approve
  if (needsApproval) {
    return (
      <button 
        className={`inline-flex items-center ${confidence >= 0.7 ? 'text-auris-orange' : 'text-auris-red'} hover:text-auris-green transition-colors`}
        title={buildTooltip()}
        onClick={(e) => {
          e.stopPropagation();
          onApprove?.();
        }}
      >
        <Warning size={12} weight="fill" />
      </button>
    );
  }
  
  // Learned data indicator
  if (isLearned) {
    return (
      <span 
        className="inline-flex items-center text-auris-purple"
        title={`${percent}% - From database`}
      >
        <Database size={12} weight="fill" />
      </span>
    );
  }
  
  // Pattern-applied indicator (lightning bolt for "smart")
  if (isPattern) {
    return (
      <button 
        className="inline-flex items-center text-auris-blue hover:text-auris-green transition-colors"
        title={buildTooltip()}
        onClick={(e) => {
          e.stopPropagation();
          onApprove?.();
        }}
      >
        <Lightning size={12} weight="fill" />
      </button>
    );
  }
  
  const color = getConfidenceColor(confidence);
  
  return (
    <span 
      className={`inline-flex items-center ${color}`}
      title={`${percent}% confidence`}
    >
      <CheckCircle size={12} weight="fill" />
    </span>
  );
}

// Highlight color classes
const HIGHLIGHT_COLORS = {
  yellow: 'bg-yellow-500/20 border-l-yellow-500',
  blue: 'bg-blue-500/20 border-l-blue-500',
  green: 'bg-green-500/20 border-l-green-500',
  orange: 'bg-orange-500/20 border-l-orange-500',
  purple: 'bg-purple-500/20 border-l-purple-500',
};

/**
 * Virtualized Row Component - Memoized for performance
 * Used by react-window to render only visible rows
 * react-window v2 passes index, style, and any rowProps directly
 */
const VirtualizedRow = memo(function VirtualizedRow({ 
  index, 
  style,
  // rowProps are spread directly onto the component in v2
  cues, 
  columns, 
  columnWidths, 
  getRowBg, 
  getRowHighlightColor, 
  getRowAnnotation,
  onAnnotationClick,
  renderCell,
  setHoveredRow 
}) {
  
  const cue = cues[index];
  if (!cue) return null;
  
  const highlightColor = getRowHighlightColor?.(cue.id);
  const annotation = getRowAnnotation?.(cue.id);
  
  return (
    <div
      style={style}
      className={`
        flex px-4 border-b border-auris-border/20 transition-colors relative
        hover:bg-auris-card/30
        ${getRowBg(cue)}
        ${cue.hidden ? 'opacity-40' : ''}
        ${highlightColor ? 'border-l-2' : ''}
      `}
      onMouseEnter={() => setHoveredRow(cue.id)}
      onMouseLeave={() => setHoveredRow(null)}
    >
      {/* Annotation badge */}
      {annotation && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAnnotationClick?.(cue.id);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-auris-card border border-auris-border hover:bg-auris-card/80 transition-colors z-10"
          title={annotation}
        >
          <NotePencil size={12} className="text-auris-text-muted" />
        </button>
      )}
      
      {columns.map((col, colIndex) => (
        <div
          key={col.key}
          className={`px-1.5 flex items-center ${cue.hidden && col.key !== 'visibility' ? 'pointer-events-none' : ''}`}
          style={{ width: columnWidths[col.key], minWidth: col.minWidth, flexShrink: 0, height: ROW_HEIGHT }}
        >
          {renderCell(cue, col, index, colIndex)}
        </div>
      ))}
    </div>
  );
});

function CueTable({ 
  cues, 
  onUpdateCue,
  onBatchUpdateCues,
  onLookupCue, 
  isLoading, 
  isLookingUp, 
  onOpenBrowser, 
  onShowAllTracks,
  // Selection props - now cell-based
  onSelectionChange,
  getRowHighlightColor,
  getRowAnnotation,
  onAnnotationClick,
  // Scroll position for tab state
  scrollPosition,
  onScrollChange,
  // External selection for tour demo
  externalSelection
}) {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [lookingUpCueId, setLookingUpCueId] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [updatePrompt, setUpdatePrompt] = useState(null);
  
  // Cell-based selection state
  const [selection, setSelection] = useState(null); // { startRow, startCol, endRow, endCol }
  const [isSelecting, setIsSelecting] = useState(false);
  const [anchorCell, setAnchorCell] = useState(null); // { row, col }
  const tableRef = useRef(null);
  
  // Apply external selection (for tour demo)
  useEffect(() => {
    if (externalSelection) {
      setSelection(externalSelection);
    }
  }, [externalSelection]);
  const scrollContainerRef = useRef(null);
  
  // Fill handle state (Excel-style drag to fill)
  const [isFilling, setIsFilling] = useState(false);
  const [fillStart, setFillStart] = useState(null); // { row, col, value, field }
  const [fillEnd, setFillEnd] = useState(null); // { row, col }
  
  // Zoom state
  const [zoomLevel, setZoomLevel] = useState(1);
  
  // Container height for virtualization
  const [containerHeight, setContainerHeight] = useState(600);
  
  // Column resize state
  const [columnWidths, setColumnWidths] = useState({
    visibility: 28,
    index: 40,
    trackName: 200,
    duration: 90,
    artist: 140,
    source: 160,
    trackNumber: 70,
    composer: 200,
    publisher: 220,
    label: 180,
    use: 50,
    actions: 60
  });
  const [resizingColumn, setResizingColumn] = useState(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  // Track container height for virtualization
  useEffect(() => {
    const updateHeight = () => {
      if (scrollContainerRef.current) {
        // Subtract header height (~45px) and footer height (~40px)
        const availableHeight = scrollContainerRef.current.clientHeight - 45;
        setContainerHeight(Math.max(200, availableHeight));
      }
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Restore scroll position when tab changes
  useEffect(() => {
    if (scrollContainerRef.current && scrollPosition) {
      scrollContainerRef.current.scrollLeft = scrollPosition.x || 0;
      scrollContainerRef.current.scrollTop = scrollPosition.y || 0;
    }
  }, [scrollPosition]);

  // Handle scroll events to save position
  const handleScroll = useCallback((e) => {
    if (onScrollChange) {
      onScrollChange({
        x: e.target.scrollLeft,
        y: e.target.scrollTop
      });
    }
  }, [onScrollChange]);

  // Column definitions - optional fields show N/A when empty
  const columns = [
    { key: 'visibility', label: '', minWidth: 28, editable: false, selectable: false },
    { key: 'index', label: '#', minWidth: 40, editable: false, selectable: false },
    { key: 'trackName', label: 'Track Name', minWidth: 100, editable: true, selectable: true, sourceKey: 'trackNameSource' },
    { key: 'duration', label: 'Cue Length', minWidth: 70, editable: true, mono: true, selectable: true, sourceKey: 'durationSource' },
    { key: 'artist', label: 'Artist', minWidth: 80, editable: true, selectable: true, sourceKey: 'artistSource', optional: true },
    { key: 'source', label: 'Source', minWidth: 80, editable: true, selectable: true, sourceKey: 'sourceSource' },
    { key: 'trackNumber', label: 'Track #', minWidth: 50, editable: true, selectable: true, sourceKey: 'trackNumberSource', optional: true },
    { key: 'composer', label: 'Composer', minWidth: 100, editable: true, hasConfidence: true, selectable: true, sourceKey: 'composerSource', required: true },
    { key: 'publisher', label: 'Publisher', minWidth: 100, editable: true, hasConfidence: true, selectable: true, sourceKey: 'publisherSource', required: true },
    { key: 'label', label: 'Master/Label/Library', minWidth: 100, editable: true, selectable: true, sourceKey: 'labelSource' },
    { key: 'use', label: 'Use', minWidth: 40, editable: true, selectable: true, sourceKey: 'useSource' },
    { key: 'actions', label: '', minWidth: 50, editable: false, selectable: false },
  ];

  // Handle column resize start
  const handleResizeStart = useCallback((e, columnKey) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnKey);
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = columnWidths[columnKey];
  }, [columnWidths]);

  // Handle column resize drag
  useEffect(() => {
    if (!resizingColumn) return;
    
    const handleMouseMove = (e) => {
      const delta = e.clientX - resizeStartX.current;
      const column = columns.find(c => c.key === resizingColumn);
      const minWidth = column?.minWidth || 50;
      const newWidth = Math.max(minWidth, resizeStartWidth.current + delta);
      setColumnWidths(prev => ({ ...prev, [resizingColumn]: newWidth }));
    };
    
    const handleMouseUp = () => {
      setResizingColumn(null);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingColumn, columns]);

  // Double-click to auto-fit column width
  const handleColumnAutoFit = useCallback((columnKey) => {
    if (!cues.length) return;
    
    // Create a temporary span to measure text width
    const measureSpan = document.createElement('span');
    measureSpan.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font-size:14px;';
    document.body.appendChild(measureSpan);
    
    let maxWidth = 60; // Minimum width
    
    // Measure header
    const column = columns.find(c => c.key === columnKey);
    if (column?.label) {
      measureSpan.textContent = column.label;
      maxWidth = Math.max(maxWidth, measureSpan.offsetWidth + 24);
    }
    
    // Measure all cell values
    for (const cue of cues) {
      const value = cue[columnKey];
      if (value) {
        measureSpan.textContent = String(value);
        maxWidth = Math.max(maxWidth, measureSpan.offsetWidth + 32); // Extra padding for confidence icons
      }
    }
    
    document.body.removeChild(measureSpan);
    
    // Cap at reasonable max
    maxWidth = Math.min(maxWidth, 400);
    
    setColumnWidths(prev => ({ ...prev, [columnKey]: maxWidth }));
  }, [cues, columns]);

  // Format data source for tooltip display
  const formatSourceTooltip = (source, value, confidence, matchedTrack) => {
    if (!value) return null;
    
    const sourceLabels = {
      'file_metadata': 'File metadata',
      'filename_parse': 'Parsed from filename',
      'learned_db': 'Matched from database',
      'pattern_prediction': 'Pattern match',
      'bmg_bookmarklet': 'BMG bookmarklet',
      'bmg_website': 'BMG website',
      'bmg_extract': 'BMG extraction',
      'ai_extract': 'AI extraction',
      'user_edit': 'You edited this',
      'user': 'You edited this',
      'user_fill': 'Copied from above',
      'user_approved': 'You approved this',
      'premiere_import': 'Premiere import',
      'voyage_lookup': 'Database (Voyage)',
      'opus_fill': 'AI filled (Opus)',
      'auto_lookup': 'Auto lookup',
      'batch_lookup': 'Batch lookup',
    };
    
    const label = sourceLabels[source] || source || 'Unknown';
    
    // Build concise tooltip
    let tooltip = label;
    
    // Add matched track if available
    if (matchedTrack && source === 'learned_db') {
      tooltip += `\nMatched: "${matchedTrack}"`;
    }
    
    // Add confidence if not 100%
    if (confidence && confidence < 1) {
      tooltip += `\n${Math.round(confidence * 100)}% confidence`;
    }
    
    // Add approval hint if needed
    if (confidence && confidence < 1 && source !== 'user' && source !== 'user_edit' && source !== 'user_approved') {
      tooltip += '\nClick to approve or edit';
    }
    
    return tooltip;
  };

  const selectableColumns = columns.filter(c => c.selectable);
  const selectableColIndices = columns.map((c, i) => c.selectable ? i : -1).filter(i => i >= 0);

  // Check if a cell is in the current selection
  const isCellSelected = useCallback((rowIndex, colIndex) => {
    if (!selection) return false;
    const minRow = Math.min(selection.startRow, selection.endRow);
    const maxRow = Math.max(selection.startRow, selection.endRow);
    const minCol = Math.min(selection.startCol, selection.endCol);
    const maxCol = Math.max(selection.startCol, selection.endCol);
    return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
  }, [selection]);

  // Get selection bounds
  const getSelectionBounds = useCallback(() => {
    if (!selection) return null;
    return {
      minRow: Math.min(selection.startRow, selection.endRow),
      maxRow: Math.max(selection.startRow, selection.endRow),
      minCol: Math.min(selection.startCol, selection.endCol),
      maxCol: Math.max(selection.startCol, selection.endCol)
    };
  }, [selection]);

  // Handle cell mouse down - start selection
  const handleCellMouseDown = useCallback((rowIndex, colIndex, event) => {
    // Only handle left click
    if (event.button !== 0) return;
    
    // Don't select on non-selectable columns
    if (!columns[colIndex]?.selectable) return;
    
    event.preventDefault(); // Prevent browser text selection
    
    if (event.shiftKey && anchorCell) {
      // Shift+click: extend selection from anchor
      setSelection({
        startRow: anchorCell.row,
        startCol: anchorCell.col,
        endRow: rowIndex,
        endCol: colIndex
      });
    } else {
      // Regular click: start new selection
      setAnchorCell({ row: rowIndex, col: colIndex });
      setSelection({
        startRow: rowIndex,
        startCol: colIndex,
        endRow: rowIndex,
        endCol: colIndex
      });
      setIsSelecting(true);
    }
  }, [anchorCell, columns]);

  // Handle cell mouse enter during drag - debounced for performance
  const pendingSelectionRef = useRef(null);
  const handleCellMouseEnter = useCallback((rowIndex, colIndex) => {
    if (!isSelecting || !anchorCell) return;
    if (!columns[colIndex]?.selectable) return;
    
    // Store pending selection and use RAF to batch updates
    const newSelection = {
      startRow: anchorCell.row,
      startCol: anchorCell.col,
      endRow: rowIndex,
      endCol: colIndex
    };
    
    if (!pendingSelectionRef.current) {
      pendingSelectionRef.current = requestAnimationFrame(() => {
        setSelection(newSelection);
        pendingSelectionRef.current = null;
      });
    }
  }, [isSelecting, anchorCell, columns]);

  // Handle mouse up - end selection
  useEffect(() => {
    const handleMouseUp = () => {
      if (isSelecting) {
        setIsSelecting(false);
        // Mark that we just finished selecting (prevents background click from clearing)
        justFinishedSelectingRef.current = true;
        // Notify parent of selection change
        if (selection && onSelectionChange) {
          const bounds = getSelectionBounds();
          if (bounds) {
            const selectedCells = [];
            for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
              for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
                if (columns[c]?.selectable && cues[r]) {
                  selectedCells.push({
                    rowId: cues[r].id,
                    rowIndex: r,
                    colIndex: c,
                    field: columns[c].key,
                    value: cues[r][columns[c].key]
                  });
                }
              }
            }
            // Get position of selected cells for contextual UI
            const selectedRows = cues.slice(bounds.minRow, bounds.maxRow + 1);
            const firstCell = tableRef.current?.querySelector(`[data-row="${bounds.minRow}"][data-col="${bounds.minCol}"]`);
            const rect = firstCell?.getBoundingClientRect();
            const position = rect ? { x: rect.right + 8, y: rect.top } : null;
            onSelectionChange(selectedCells, selectedRows, position);
          }
        }
      }
    };
    
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [isSelecting, selection, onSelectionChange, cues, columns, getSelectionBounds]);

  // Track if we just finished selecting (to prevent background click from clearing)
  const justFinishedSelectingRef = useRef(false);
  
  // Clear selection when clicking outside table cells
  const handleBackgroundClick = useCallback((e) => {
    // Don't clear if we just finished a selection drag
    if (justFinishedSelectingRef.current) {
      justFinishedSelectingRef.current = false;
      return;
    }
    
    // Check if clicking on a cell or cell content - if so, don't clear
    const clickedOnCell = e.target.closest('[data-cell]') || 
                          e.target.closest('.fill-handle') ||
                          e.target.tagName === 'INPUT' ||
                          e.target.tagName === 'BUTTON';
    
    if (!clickedOnCell) {
      setSelection(null);
      setAnchorCell(null);
      onSelectionChange?.([], []);
    }
  }, [onSelectionChange]);

  // Handle keyboard shortcuts (Escape to clear selection, Delete/Backspace to clear cells)
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      // Check if user is actively typing in an input/textarea (not just focused on table)
      const isTypingInInput = (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') && 
                              !e.target.closest('[data-cell]'); // Allow if input is inside a table cell
      
      // Ignore if we're editing a cell OR typing in an input outside the table
      if (editingCell || isTypingInInput) return;
      
      if (e.key === 'Escape') {
        setSelection(null);
        setAnchorCell(null);
        setEditingCell(null);
        onSelectionChange?.([], []);
      }
      
      // Delete or Backspace clears selected cells
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        e.stopPropagation();
        const bounds = getSelectionBounds();
        if (bounds && onBatchUpdateCues) {
          // Collect all updates to apply as a batch
          const batchUpdates = [];
          for (let r = bounds.minRow; r <= bounds.maxRow; r++) {
            for (let c = bounds.minCol; c <= bounds.maxCol; c++) {
              const col = columns[c];
              const cue = cues[r];
              if (col?.editable && col?.selectable && cue) {
                batchUpdates.push({
                  cueId: cue.id,
                  updates: {
                    [col.key]: '',
                    [`${col.key}Confidence`]: 1.0,
                    [`${col.key}Source`]: 'user'
                  }
                });
              }
            }
          }
          // Apply all updates in one batch
          if (batchUpdates.length > 0) {
            onBatchUpdateCues(batchUpdates);
          }
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }, [onSelectionChange, selection, getSelectionBounds, columns, cues, onBatchUpdateCues, editingCell]);

  // Fill handle - start dragging
  const handleFillHandleMouseDown = useCallback((e, rowIndex, colIndex, value, field) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFilling(true);
    setFillStart({ row: rowIndex, col: colIndex, value, field });
    setFillEnd({ row: rowIndex, col: colIndex });
  }, []);

  // Fill handle - drag to extend
  const handleFillMouseMove = useCallback((rowIndex, colIndex) => {
    if (!isFilling || !fillStart) return;
    // Only allow filling in the same column (vertical fill)
    if (colIndex === fillStart.col) {
      setFillEnd({ row: rowIndex, col: colIndex });
    }
  }, [isFilling, fillStart]);

  // Fill handle - complete fill
  useEffect(() => {
    const handleFillEnd = () => {
      if (isFilling && fillStart && fillEnd && fillStart.row !== fillEnd.row) {
        // Apply fill to all cells in range
        const minRow = Math.min(fillStart.row, fillEnd.row);
        const maxRow = Math.max(fillStart.row, fillEnd.row);
        
        for (let r = minRow; r <= maxRow; r++) {
          if (r !== fillStart.row && cues[r]) {
            onUpdateCue(cues[r].id, {
              [fillStart.field]: fillStart.value,
              [`${fillStart.field}Confidence`]: 1.0,
              [`${fillStart.field}Source`]: 'user_fill'
            });
          }
        }
      }
      setIsFilling(false);
      setFillStart(null);
      setFillEnd(null);
    };
    
    window.addEventListener('mouseup', handleFillEnd);
    return () => window.removeEventListener('mouseup', handleFillEnd);
  }, [isFilling, fillStart, fillEnd, cues, onUpdateCue]);

  // Check if cell is in fill preview range
  const isInFillRange = useCallback((rowIndex, colIndex) => {
    if (!isFilling || !fillStart || !fillEnd) return false;
    if (colIndex !== fillStart.col) return false;
    const minRow = Math.min(fillStart.row, fillEnd.row);
    const maxRow = Math.max(fillStart.row, fillEnd.row);
    return rowIndex >= minRow && rowIndex <= maxRow && rowIndex !== fillStart.row;
  }, [isFilling, fillStart, fillEnd]);

  const handleCellClick = useCallback((cueId, field, value, event) => {
    const rect = event?.currentTarget?.getBoundingClientRect();
    setEditingCell({ 
      cueId, 
      field,
      position: rect ? { top: rect.bottom, left: rect.left } : null
    });
    setEditValue(value || '');
  }, []);

  const handleCellBlur = useCallback(() => {
    if (editingCell) {
      const cue = cues.find(c => c.id === editingCell.cueId);
      const oldValue = cue?.[editingCell.field] || '';
      const wasFromDatabase = cue?._fromDatabase || 
        cue?.composerSource === 'learned_db' || 
        cue?.publisherSource === 'learned_db';
      
      // Always save, even if value hasn't changed (user might want to confirm)
      if (wasFromDatabase && editValue !== oldValue && editValue.trim() !== '') {
        setUpdatePrompt({
          cueId: editingCell.cueId,
          field: editingCell.field,
          newValue: editValue,
          oldValue: oldValue,
          trackName: cue?.trackName || 'this track',
          position: editingCell.position
        });
      } else {
        // Auto-save on blur
        onUpdateCue(editingCell.cueId, { 
          [editingCell.field]: editValue,
          [`${editingCell.field}Confidence`]: 1.0,
          [`${editingCell.field}Source`]: 'user'
        });
      }
      setEditingCell(null);
    }
  }, [editingCell, editValue, onUpdateCue, cues]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  }, [handleCellBlur]);

  const handleToggleHidden = useCallback((cueId) => {
    const cue = cues.find(c => c.id === cueId);
    if (cue) {
      onUpdateCue(cueId, { hidden: !cue.hidden });
    }
  }, [cues, onUpdateCue]);

  // Helper to check if a value has meaningful content
  const hasContent = (value) => value && value.trim() !== '' && value.trim() !== '-';

  const renderCell = (cue, column, rowIndex, colIndex) => {
    const isEditing = editingCell?.cueId === cue.id && editingCell?.field === column.key;
    const value = column.key === 'index' ? rowIndex + 1 : cue[column.key];
    const confidence = column.hasConfidence ? cue[`${column.key}Confidence`] : null;
    const source = column.hasConfidence ? cue[`${column.key}Source`] : null;
    const isLooking = lookingUpCueId === cue.id;
    const isHovered = hoveredRow === cue.id;
    const isHidden = cue.hidden;
    const isSelected = isCellSelected(rowIndex, colIndex);

    // Visibility toggle column
    if (column.key === 'visibility') {
      return (
        <button
          onClick={() => handleToggleHidden(cue.id)}
          className={`p-0.5 rounded transition-colors ${
            isHidden 
              ? 'text-auris-text-muted/40 hover:text-auris-text-muted' 
              : 'text-auris-text-muted/60 hover:text-auris-text'
          }`}
          title={isHidden ? 'Show track (include in export)' : 'Hide track (exclude from export)'}
        >
          {isHidden ? <EyeSlash size={14} /> : <Eye size={14} />}
        </button>
      );
    }

    if (column.key === 'actions') {
      // Check track status - only user_approved means actually saved to DB
      const hasRequiredData = hasContent(cue.composer) && hasContent(cue.publisher);
      const composerNeedsApproval = cue.composer && cue.composerConfidence && cue.composerConfidence < 1 && cue.composerSource !== 'user_approved';
      const publisherNeedsApproval = cue.publisher && cue.publisherConfidence && cue.publisherConfidence < 1 && cue.publisherSource !== 'user_approved';
      const needsApproval = composerNeedsApproval || publisherNeedsApproval || cue.status === 'needs_approval';
      // Only show green if explicitly saved by user
      const isSavedToDb = cue.composerSource === 'user_approved' && cue.publisherSource === 'user_approved';
      
      if (!isHovered && !isLooking) {
        if (needsApproval) {
          return <Warning size={16} weight="fill" className="text-auris-orange/60" title="Needs approval - click to review" />;
        }
        // Green ONLY if user explicitly approved and saved
        if (isSavedToDb) {
          return <CheckCircle size={16} weight="fill" className="text-auris-green/60" title="Saved to database" />;
        }
        // Yellow if has required data but not yet saved
        if (hasRequiredData) {
          return <CheckCircle size={16} weight="fill" className="text-yellow-500/70" title="Ready to save - hover to approve" />;
        }
        // Nothing if incomplete
        return null;
      }
      
      // Handle approving entire row and saving to database
      const handleApproveRow = () => {
        const updates = {
          status: 'complete',
          // Approve all fields with data (empty fields stay empty)
          composerSource: 'user_approved', 
          composerConfidence: 1.0,
          publisherSource: 'user_approved', 
          publisherConfidence: 1.0,
          // Optional fields - mark as approved if they have content
          ...(cue.artist && { artistSource: 'user_approved', artistConfidence: 1.0 }),
          ...(cue.source && { sourceSource: 'user_approved' }),
          ...(cue.label && { labelSource: 'user_approved' }),
        };
        
        // Update the cue and save to database
        onUpdateCue(cue.id, { ...updates, _updateDatabase: true });
      };
      
      // Handle unapproving - removes from learned database
      const handleUnapproveRow = async () => {
        // Remove from cloud database
        if (window.electronAPI?.cloudTrackDelete) {
          try {
            // Find and delete by track name
            await window.electronAPI.cloudTrackDeleteByName(cue.trackName);
          } catch (err) {
            console.error('[CueTable] Error removing from database:', err);
          }
        }
        
        // Reset local state to not approved
        const updates = {
          status: 'pending',
          composerSource: 'learned_db',
          composerConfidence: 0.7,
          publisherSource: 'learned_db', 
          publisherConfidence: 0.7,
          artistSource: cue.artist ? 'learned_db' : null,
          sourceSource: cue.source ? 'learned_db' : null,
          labelSource: cue.label ? 'learned_db' : null,
        };
        
        onUpdateCue(cue.id, updates);
      };
      
      return (
        <div className="flex items-center gap-1">
          {isLooking ? (
            <CircleNotch size={16} className="animate-spin text-auris-blue" />
          ) : (
            <>
              {/* Approve & Save button - show for any track with required data that isn't saved yet */}
              {hasRequiredData && !isSavedToDb && (
                <button
                  onClick={handleApproveRow}
                  className={`p-1 rounded hover:bg-auris-green/20 transition-colors ${needsApproval ? 'text-auris-orange' : 'text-yellow-500'} hover:text-auris-green`}
                  title="Approve & save to database"
                >
                  <CheckCircle size={16} weight="fill" />
                </button>
              )}
              {/* Unapprove button - show for tracks already saved to database */}
              {isSavedToDb && (
                <button
                  onClick={handleUnapproveRow}
                  className="p-1 rounded hover:bg-red-500/20 transition-colors text-auris-green hover:text-red-400"
                  title="Unapprove & remove from database"
                >
                  <XCircle size={16} weight="fill" />
                </button>
              )}
              {/* Smart lookup for incomplete tracks */}
              {onOpenBrowser && !hasRequiredData && (
                <button
                  onClick={async () => {
                    const cleanName = (cue.trackName || '')
                      .replace(/^(BYND-|mx.*?_)/i, '')
                      .replace(/_/g, ' ')
                      .replace(/STEM.*/i, '')
                      .trim();
                    try {
                      await navigator.clipboard.writeText(cleanName);
                    } catch (e) {}
                    onOpenBrowser({ ...cue, cleanName });
                  }}
                  className="p-1 rounded hover:bg-auris-card transition-colors text-auris-text-muted hover:text-auris-purple"
                  title="Smart Lookup"
                  data-tour="browser-button"
                >
                  <Sparkle size={16} weight="fill" />
                </button>
              )}
            </>
          )}
        </div>
      );
    }

    if (isEditing && column.editable) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={handleKeyDown}
          autoFocus
          onFocus={(e) => e.target.select()}
          className="w-full bg-auris-bg border border-auris-blue rounded px-2 py-1 text-sm focus:outline-none"
        />
      );
    }

    // Get data source and confidence for this field
    const fieldSource = column.sourceKey ? cue[column.sourceKey] : null;
    const fieldConfidence = cue[`${column.key}Confidence`];
    const matchedTrack = cue[`${column.key}MatchedTrack`] || cue.matchedTrack;
    const matchReason = cue[`${column.key}MatchReason`] || cue.matchReason;
    const patternReason = cue[`${column.key}PatternReason`];
    const needsApproval = fieldConfidence && fieldConfidence < 1 && fieldSource !== 'user' && fieldSource !== 'user_edit' && fieldSource !== 'user_approved';
    const tooltip = value ? formatSourceTooltip(fieldSource, value, fieldConfidence, matchedTrack) : (column.editable ? 'Click to edit' : '');

    // Handle approval of uncertain data
    const handleApprove = () => {
      onUpdateCue(cue.id, {
        [`${column.key}Source`]: 'user_approved',
        [`${column.key}Confidence`]: 1.0
      });
    };

    // Cell wrapper with selection styling
    const cellContent = column.hasConfidence && value ? (
      <div className="flex items-center gap-1.5 w-full h-full">
        <span className="truncate flex-1 text-sm">{value}</span>
        {fieldConfidence !== null && fieldConfidence !== undefined && (
          <ConfidenceIndicator 
            confidence={fieldConfidence} 
            source={fieldSource} 
            onApprove={handleApprove}
            matchedTrack={matchedTrack}
            matchReason={matchReason}
            patternReason={patternReason}
          />
        )}
      </div>
    ) : (
      <span className={`truncate text-sm ${!value && column.editable ? 'text-auris-text-muted/40' : ''} ${needsApproval ? 'text-auris-orange' : ''}`}>
        {value || (column.optional ? 'N/A' : '')}
      </span>
    );

    const inFillRange = isInFillRange(rowIndex, colIndex);
    // Show fill handle on hover if cell has content and is editable
    const showFillHandle = (isHovered || isSelected) && column.editable && value && !editingCell;
    
    return (
      <div
        data-cell="true"
        onMouseDown={(e) => {
          // If clicking on fill handle, don't trigger selection
          if (e.target.classList.contains('fill-handle')) return;
          
          // Handle cell selection (for multi-select with shift/ctrl)
          handleCellMouseDown(rowIndex, colIndex, e);
        }}
        onDoubleClick={(e) => {
          // Double-click to enter edit mode
          if (column.editable && e.button === 0) {
            handleCellClick(cue.id, column.key, value, e);
          }
        }}
        onMouseEnter={() => {
          handleCellMouseEnter(rowIndex, colIndex);
          handleFillMouseMove(rowIndex, colIndex);
        }}
        className={`
          w-full h-full min-h-[28px] flex items-center select-none relative group cursor-cell
          ${column.mono ? 'font-mono text-xs' : ''}
          ${column.secondary ? 'text-auris-text-muted' : ''}
          ${isSelected ? 'bg-auris-blue/30 ring-1 ring-auris-blue ring-inset' : ''}
          ${inFillRange ? 'bg-auris-blue/20 ring-1 ring-auris-blue/50 ring-inset' : ''}
        `}
        title={tooltip}
      >
        {cellContent}
        {/* Fill handle - small square at bottom-right corner */}
        {showFillHandle && (
          <div
            className={`fill-handle absolute -bottom-[1px] -right-[1px] w-2 h-2 bg-auris-blue cursor-cell z-20 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            onMouseDown={(e) => handleFillHandleMouseDown(e, rowIndex, colIndex, value, column.key)}
            title="Drag to fill"
          />
        )}
      </div>
    );
  };

  const getRowBg = useCallback((cue) => {
    const highlightColor = getRowHighlightColor?.(cue.id);
    if (highlightColor && HIGHLIGHT_COLORS[highlightColor]) {
      return HIGHLIGHT_COLORS[highlightColor];
    }
    
    if (cue.hidden) return 'bg-auris-card/20';
    
    // Check if needs approval (has data but not 100% confidence)
    const composerNeedsApproval = cue.composer && cue.composerConfidence && cue.composerConfidence < 1 && cue.composerSource !== 'user_approved';
    const publisherNeedsApproval = cue.publisher && cue.publisherConfidence && cue.publisherConfidence < 1 && cue.publisherSource !== 'user_approved';
    
    if (composerNeedsApproval || publisherNeedsApproval || cue.status === 'needs_approval') {
      return 'bg-auris-orange/[0.05]'; // Orange tint for needs approval
    }
    
    // Only show green if EXPLICITLY saved to database by user
    const isSavedToDb = cue.composerSource === 'user_approved' && cue.publisherSource === 'user_approved';
    if (isSavedToDb) {
      return 'bg-auris-green/[0.03]';
    }
    
    return '';
  }, [getRowHighlightColor]);

  // Memoized row data for react-window
  const rowData = useMemo(() => ({
    cues,
    columns,
    columnWidths,
    getRowBg,
    getRowHighlightColor,
    getRowAnnotation,
    onAnnotationClick,
    renderCell,
    setHoveredRow,
  }), [cues, columns, columnWidths, getRowBg, getRowHighlightColor, getRowAnnotation, onAnnotationClick, renderCell]);
  
  const visibleCues = cues.filter(c => !c.hidden);
  const totalCues = visibleCues.length;
  const completeCues = visibleCues.filter(c => hasContent(c.composer) && hasContent(c.publisher)).length;
  const hiddenCount = cues.filter(c => c.hidden).length;

  // Calculate selection stats
  const bounds = getSelectionBounds();
  const selectedCellCount = bounds 
    ? (bounds.maxRow - bounds.minRow + 1) * (bounds.maxCol - bounds.minCol + 1)
    : 0;
  const selectedRowCount = bounds ? bounds.maxRow - bounds.minRow + 1 : 0;

  return (
    <div className="flex-1 overflow-hidden flex flex-col relative" ref={tableRef}>
      {/* Scrollable Table Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-auto table-background"
        onClick={handleBackgroundClick}
        onScroll={handleScroll}
      >
        <div 
          className="min-w-max origin-top-left transition-transform duration-100"
          style={{ transform: `scale(${zoomLevel})` }}
        >
          {/* Table Header */}
          <div className="sticky top-0 z-10 border-b border-auris-border bg-auris-bg-secondary">
            <div className="flex px-4 py-2.5">
              {columns.map((col) => (
                <div
                  key={col.key}
                  className={`text-xs font-semibold uppercase tracking-wider px-1.5 flex items-center relative group/header ${
                    col.secondary ? 'text-auris-text-muted/60' : 'text-auris-text-muted'
                  }`}
                  style={{ width: columnWidths[col.key], minWidth: col.minWidth, flexShrink: 0 }}
                  onDoubleClick={() => col.editable && handleColumnAutoFit(col.key)}
                  title={col.editable ? 'Double-click to auto-fit width' : ''}
                >
                  {/* Resize handle */}
                  {col.editable && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-auris-blue/50 opacity-0 group-hover/header:opacity-100 transition-opacity"
                      onMouseDown={(e) => handleResizeStart(e, col.key)}
                    />
                  )}
                  {col.key === 'visibility' ? (
                    <button
                      onClick={onShowAllTracks}
                      disabled={hiddenCount === 0}
                      className={`p-0.5 rounded transition-colors ${
                        hiddenCount > 0 
                          ? 'text-auris-text-muted hover:text-auris-text cursor-pointer' 
                          : 'text-auris-text-muted/30 cursor-default'
                      }`}
                      title={hiddenCount > 0 ? `Show all ${hiddenCount} hidden tracks` : 'No hidden tracks'}
                    >
                      <Eye size={14} />
                    </button>
                  ) : (
                    col.label
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Table Body - Virtualized */}
          {cues.length > 0 ? (
            <List
              defaultHeight={containerHeight}
              rowCount={cues.length}
              rowHeight={ROW_HEIGHT}
              overscanCount={5}
              rowComponent={VirtualizedRow}
              rowProps={rowData}
            />
          ) : (
            <div className="flex items-center justify-center h-40 text-auris-text-muted text-sm">
              No cues found
            </div>
          )}
        </div>
      </div>

      {/* Bottom Zoom Bar */}
      {cues.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2 bg-auris-bg-secondary/50 border-t border-auris-border/30 text-xs">
          <span className="text-auris-text-muted">
            <span className="text-auris-green font-semibold">{completeCues}</span>
            <span className="mx-1">/</span>
            <span>{totalCues}</span>
            <span className="ml-1">complete</span>
            {selectedCellCount > 0 && (
              <span className="ml-3 text-auris-blue font-medium">
                {selectedRowCount} row{selectedRowCount > 1 ? 's' : ''} selected
              </span>
            )}
          </span>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setZoomLevel(z => Math.max(0.6, z - 0.1))}
              className="p-1 rounded hover:bg-auris-card text-auris-text-muted hover:text-auris-text transition-colors"
              title="Zoom out"
            >
              <MagnifyingGlassMinus size={14} />
            </button>
            <input
              type="range"
              min="0.6"
              max="1.4"
              step="0.1"
              value={zoomLevel}
              onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
              className="w-24 h-1 bg-auris-border rounded-lg appearance-none cursor-pointer"
              title={`Zoom: ${Math.round(zoomLevel * 100)}%`}
            />
            <button
              onClick={() => setZoomLevel(z => Math.min(1.4, z + 0.1))}
              className="p-1 rounded hover:bg-auris-card text-auris-text-muted hover:text-auris-text transition-colors"
              title="Zoom in"
            >
              <MagnifyingGlassPlus size={14} />
            </button>
            <span className="text-auris-text-muted w-12 text-right">{Math.round(zoomLevel * 100)}%</span>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-auris-bg/80 flex items-center justify-center z-10">
          <div className="text-center">
            <CircleNotch size={40} weight="thin" className="text-auris-blue animate-spin mx-auto mb-3" />
            <p className="text-auris-text-secondary text-sm">Loading...</p>
          </div>
        </div>
      )}

      {/* Update Learned Data Prompt */}
      {updatePrompt && (
        <div 
          className="fixed z-50 bg-auris-card border border-auris-border 
                     rounded-lg shadow-xl p-3 max-w-xs animate-in fade-in duration-150"
          style={updatePrompt.position ? {
            top: Math.min(updatePrompt.position.top + 8, window.innerHeight - 160),
            left: Math.min(updatePrompt.position.left, window.innerWidth - 320),
          } : {
            bottom: 80,
            right: 24
          }}
        >
          <div className="flex items-start gap-2 mb-2">
            <Database size={16} className="text-auris-purple flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-auris-text font-medium">
                Update library?
              </p>
              <p className="text-xs text-auris-text-muted mt-0.5">
                Save this change for future lookups
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button 
              onClick={() => {
                onUpdateCue(updatePrompt.cueId, { 
                  [updatePrompt.field]: updatePrompt.newValue,
                  [`${updatePrompt.field}Confidence`]: 1.0,
                  [`${updatePrompt.field}Source`]: 'user'
                });
                setUpdatePrompt(null);
              }}
              className="px-2 py-1 text-xs bg-auris-bg-secondary border border-auris-border 
                         rounded hover:bg-auris-card transition-colors text-auris-text-muted"
            >
              No
            </button>
            <button 
              onClick={() => {
                onUpdateCue(updatePrompt.cueId, { 
                  [updatePrompt.field]: updatePrompt.newValue,
                  [`${updatePrompt.field}Confidence`]: 1.0,
                  [`${updatePrompt.field}Source`]: 'user',
                  _updateDatabase: true
                });
                setUpdatePrompt(null);
              }}
              className="px-2 py-1 text-xs bg-auris-purple text-white rounded 
                         hover:bg-auris-purple/80 transition-colors font-medium"
            >
              Yes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CueTable;
