import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  CaretDown, 
  CaretUp, 
  CheckCircle, 
  CircleNotch, 
  Lightbulb,
  PaperPlaneTilt,
  Sparkle,
  Brain
} from '@phosphor-icons/react';

/**
 * Smart Suggestion Panel - Contextual fill-in UI
 * Positioned near selected cells
 */
function SmartSuggestionPanel({
  suggestions,
  isLoading,
  isRefining,
  activeField,
  onSelectField,
  onApplySuggestion,
  onApplyCustom,
  onRefine,
  onDismiss,
  position // { x, y } from selection
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const [refineInput, setRefineInput] = useState('');
  const [applyToSimilar, setApplyToSimilar] = useState(false);
  const [rememberPattern, setRememberPattern] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });
  
  const panelRef = useRef(null);
  const refineInputRef = useRef(null);

  // Calculate panel position to avoid clipping
  useEffect(() => {
    if (!panelRef.current || !position) return;
    
    const panel = panelRef.current;
    const panelRect = panel.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 16;
    
    let x = position.x;
    let y = position.y;
    
    // Check right edge clipping
    if (x + panelRect.width > viewportWidth - padding) {
      // Position to the left of the selection instead
      x = Math.max(padding, position.x - panelRect.width - 100);
    }
    
    // Check bottom edge clipping
    if (y + panelRect.height > viewportHeight - padding) {
      y = Math.max(padding, viewportHeight - panelRect.height - padding);
    }
    
    // Check top edge
    if (y < padding) {
      y = padding;
    }
    
    setPanelPosition({ x, y });
  }, [position, suggestions, showAlternatives]);

  // Default position if none provided
  const finalPosition = useMemo(() => {
    if (position) {
      return panelPosition.x || panelPosition.y ? panelPosition : position;
    }
    // Fallback to center-right
    return { x: window.innerWidth - 400, y: 80 };
  }, [position, panelPosition]);

  // Handle click outside to dismiss
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onDismiss?.();
      }
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onDismiss?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onDismiss]);

  // Handle apply with success animation
  const handleApply = useCallback(async (option) => {
    const success = await onApplySuggestion?.(option, { applyToSimilar, rememberPattern });
    if (success) {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onDismiss?.();
      }, 800);
    }
  }, [onApplySuggestion, applyToSimilar, rememberPattern, onDismiss]);

  // Handle custom value apply
  const handleApplyCustom = useCallback(async () => {
    if (!customValue.trim()) return;
    const success = await onApplyCustom?.(customValue, { applyToSimilar, rememberPattern });
    if (success) {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onDismiss?.();
      }, 800);
    }
  }, [customValue, onApplyCustom, applyToSimilar, rememberPattern, onDismiss]);

  // Handle refine submit
  const handleRefineSubmit = useCallback(async () => {
    if (!refineInput.trim()) return;
    await onRefine?.(refineInput);
    setRefineInput('');
  }, [refineInput, onRefine]);

  // Don't render if no suggestions
  if (!suggestions) return null;

  // Panel style with dynamic positioning
  const panelStyle = {
    position: 'fixed',
    left: `${finalPosition.x}px`,
    top: `${finalPosition.y}px`,
    zIndex: 9999,
    maxHeight: 'calc(100vh - 100px)',
    overflowY: 'auto'
  };

  // Show success state
  if (showSuccess) {
    return createPortal(
      <div 
        ref={panelRef}
        style={panelStyle}
        className="w-72 bg-auris-card border border-auris-green/50 rounded-xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 flex flex-col items-center justify-center gap-3">
          <CheckCircle size={40} className="text-auris-green" weight="fill" />
          <span className="text-sm text-auris-green font-medium">Applied successfully!</span>
        </div>
      </div>,
      document.body
    );
  }

  // Multiple fields missing - show field selector
  if (suggestions.multipleFields) {
    return createPortal(
      <div 
        ref={panelRef}
        style={panelStyle}
        className="w-72 bg-auris-card border border-auris-border rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-auris-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain size={18} className="text-auris-blue" />
            <span className="text-sm font-medium text-auris-text">
              {suggestions.trackCount} track{suggestions.trackCount > 1 ? 's' : ''} selected
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-auris-bg transition-colors"
          >
            <X size={16} className="text-auris-text-muted" />
          </button>
        </div>

        {/* Field options */}
        <div className="p-3">
          <p className="text-xs text-auris-text-muted mb-3">Choose a field to fill:</p>
          <div className="space-y-2">
            {suggestions.missingFields.map(({ field, count }) => (
              <button
                key={field}
                onClick={() => onSelectField?.(field)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-auris-bg border border-auris-border rounded-lg hover:border-auris-blue/50 hover:bg-auris-blue/5 transition-all group"
              >
                <span className="text-sm text-auris-text capitalize">{field}</span>
                <span className="text-xs text-auris-text-muted group-hover:text-auris-blue">
                  {count} empty
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>,
      document.body
    );
  }

  const { field, tracks, trackCount, options = [], topSuggestion, alternativeCount } = suggestions;
  const alternatives = options.slice(1).filter(o => o.value && o.value !== '__CUSTOM__');

  return createPortal(
    <div 
      ref={panelRef}
      style={panelStyle}
      className="w-80 bg-auris-card border border-auris-border rounded-xl shadow-2xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-auris-border">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Sparkle size={16} className="text-auris-blue" />
            <span className="text-sm font-medium text-auris-text capitalize">
              Fill: {field}
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-auris-bg transition-colors"
          >
            <X size={16} className="text-auris-text-muted" />
          </button>
        </div>
        <p className="text-xs text-auris-text-muted">
          for "{tracks[0]?.trackName}"{trackCount > 1 ? ` + ${trackCount - 1} more` : ''}
        </p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="p-6 flex items-center justify-center gap-2">
          <CircleNotch size={20} className="animate-spin text-auris-blue" />
          <span className="text-sm text-auris-text-muted">Finding suggestions...</span>
        </div>
      )}

      {/* Top suggestion */}
      {!isLoading && topSuggestion && (
        <div className="p-4 border-b border-auris-border">
          <button
            onClick={() => handleApply(topSuggestion)}
            className="w-full flex items-center justify-between p-3 bg-auris-blue/10 border border-auris-blue/30 rounded-lg hover:bg-auris-blue/20 transition-all group"
          >
            <div className="text-left">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-auris-text">
                  "{topSuggestion.value}"
                </span>
                <span className="text-xs text-auris-green">
                  {Math.round((topSuggestion.confidence || 0) * 100)}%
                </span>
              </div>
              <p className="text-xs text-auris-text-muted">
                {topSuggestion.reasoning}
              </p>
            </div>
            <span className="px-3 py-1.5 bg-auris-blue text-white text-xs font-medium rounded-md group-hover:bg-auris-blue/90 transition-colors">
              Apply
            </span>
          </button>
        </div>
      )}

      {/* No suggestions state */}
      {!isLoading && !topSuggestion && (
        <div className="p-4 border-b border-auris-border">
          <div className="flex items-center gap-2 text-auris-text-muted">
            <Lightbulb size={16} />
            <span className="text-sm">No suggestions found</span>
          </div>
          <p className="text-xs text-auris-text-muted mt-1">
            Try adding context below or enter a custom value
          </p>
        </div>
      )}

      {/* Alternatives (collapsible) */}
      {!isLoading && alternatives.length > 0 && (
        <div className="border-b border-auris-border">
          <button
            onClick={() => setShowAlternatives(!showAlternatives)}
            className="w-full px-4 py-2 flex items-center justify-between text-xs text-auris-text-muted hover:text-auris-text hover:bg-auris-bg/50 transition-colors"
          >
            <span>See {alternatives.length} alternative{alternatives.length > 1 ? 's' : ''}</span>
            {showAlternatives ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </button>
          
          {showAlternatives && (
            <div className="px-4 pb-3 space-y-2">
              {alternatives.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleApply(option)}
                  className="w-full flex items-center justify-between p-2.5 bg-auris-bg border border-auris-border rounded-lg hover:border-auris-border-light transition-all text-left group"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-auris-text">"{option.value}"</span>
                      <span className="text-xs text-auris-text-muted">
                        {Math.round((option.confidence || 0) * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-auris-text-muted mt-0.5">{option.reasoning}</p>
                  </div>
                  <span className="px-2 py-1 text-xs text-auris-text-muted group-hover:text-auris-blue transition-colors">
                    Apply
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Options */}
      {!isLoading && (
        <div className="px-4 py-3 border-b border-auris-border space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToSimilar}
              onChange={(e) => setApplyToSimilar(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-auris-border text-auris-blue focus:ring-auris-blue focus:ring-offset-0 bg-auris-bg"
            />
            <span className="text-xs text-auris-text-secondary">
              Apply to all similar tracks
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberPattern}
              onChange={(e) => setRememberPattern(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-auris-border text-auris-blue focus:ring-auris-blue focus:ring-offset-0 bg-auris-bg"
            />
            <span className="text-xs text-auris-text-secondary">
              Remember as pattern
            </span>
          </label>
        </div>
      )}

      {/* Custom value input */}
      {!isLoading && (
        <div className="px-4 py-3 border-b border-auris-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-auris-text-muted whitespace-nowrap">Or set to:</span>
            <input
              type="text"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleApplyCustom()}
              placeholder="Enter value..."
              className="flex-1 bg-auris-bg border border-auris-border rounded px-2 py-1.5 text-xs text-auris-text placeholder:text-auris-text-muted focus:outline-none focus:border-auris-blue"
            />
            <button
              onClick={handleApplyCustom}
              disabled={!customValue.trim()}
              className="px-2 py-1.5 text-xs font-medium text-auris-blue hover:text-auris-blue/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* Follow-up context input */}
      {!isLoading && (
        <div className="p-3 bg-auris-bg/30">
          <div className="flex items-center gap-2 mb-2">
            <Brain size={14} className="text-auris-text-muted" />
            <span className="text-xs text-auris-text-muted">Add context to refine</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={refineInputRef}
              type="text"
              value={refineInput}
              onChange={(e) => setRefineInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRefineSubmit()}
              placeholder='e.g. "use N/A" or "same as track 1"'
              className="flex-1 bg-auris-card border border-auris-border rounded-lg px-3 py-2 text-xs text-auris-text placeholder:text-auris-text-muted/60 focus:outline-none focus:border-auris-blue"
            />
            <button
              onClick={handleRefineSubmit}
              disabled={!refineInput.trim() || isRefining}
              className="p-2 bg-auris-blue text-white rounded-lg hover:bg-auris-blue/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isRefining ? (
                <CircleNotch size={14} className="animate-spin" />
              ) : (
                <PaperPlaneTilt size={14} />
              )}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

export default SmartSuggestionPanel;
