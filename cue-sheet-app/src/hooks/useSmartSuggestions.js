import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook for smart field suggestions
 * Combines sibling detection, pattern matching, and AI refinement
 */
export function useSmartSuggestions({ 
  selectedCues = [], 
  allCues = [],
  onUpdateCue = null,
  enabled = true  // When false, suggestions are disabled (normal spreadsheet mode)
}) {
  const [suggestions, setSuggestions] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [activeField, setActiveField] = useState(null);
  const debounceRef = useRef(null);

  // Helper to check if a field has content
  const hasFieldContent = useCallback((value) => {
    return value && value.trim() !== '' && value.trim() !== '-';
  }, []);

  // Helper to normalize strings for comparison
  const normalize = useCallback((s) => s ? s.toLowerCase().trim() : '', []);

  // Helper to check if two values share a common root
  const shareCommonRoot = useCallback((a, b) => {
    if (!a || !b) return false;
    const aNorm = normalize(a);
    const bNorm = normalize(b);
    return aNorm.includes(bNorm) || bNorm.includes(aNorm) || 
           (aNorm.length > 5 && bNorm.length > 5 && aNorm.substring(0, 5) === bNorm.substring(0, 5));
  }, [normalize]);

  /**
   * Find sibling tracks in the cue sheet that have the field filled
   */
  const findSiblingValues = useCallback((tracksNeedingField, field) => {
    const siblingOptions = [];
    const seenValues = new Set();
    
    for (const track of tracksNeedingField) {
      // Find other tracks in the cue sheet that share characteristics and HAVE this field
      const siblings = allCues.filter(c => {
        if (!hasFieldContent(c[field])) return false;
        if (tracksNeedingField.some(t => t.id === c.id)) return false;
        
        const sameSource = track.source && c.source && normalize(track.source) === normalize(c.source);
        const sameLibrary = shareCommonRoot(track.label || track.library, c.label || c.library);
        const samePublisher = shareCommonRoot(track.publisher, c.publisher);
        
        return sameSource || sameLibrary || samePublisher;
      });
      
      for (const sibling of siblings) {
        const value = sibling[field];
        if (!seenValues.has(value)) {
          seenValues.add(value);
          
          let matchReason = 'similar characteristics';
          if (track.source && sibling.source && normalize(track.source) === normalize(sibling.source)) {
            matchReason = 'the same source';
          } else if (shareCommonRoot(track.label || track.library, sibling.label || sibling.library)) {
            matchReason = 'the same library';
          } else if (shareCommonRoot(track.publisher, sibling.publisher)) {
            matchReason = 'the same publisher';
          }
          
          siblingOptions.push({
            id: `sibling_${sibling.id}`,
            value,
            confidence: 0.75,
            reasoning: `Track "${sibling.trackName}" has ${matchReason}`,
            source: 'sibling',
            siblingTrack: sibling.trackName
          });
        }
      }
    }
    
    // Fallback: check ALL tracks in cue sheet if no siblings found
    if (siblingOptions.length === 0) {
      const allTracksWithField = allCues.filter(c => {
        if (!hasFieldContent(c[field])) return false;
        if (tracksNeedingField.some(t => t.id === c.id)) return false;
        return true;
      });
      
      const valueCounts = {};
      for (const track of allTracksWithField) {
        const value = track[field];
        if (!valueCounts[value]) {
          valueCounts[value] = { count: 0, exampleTrack: track };
        }
        valueCounts[value].count++;
      }
      
      const sortedValues = Object.entries(valueCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);
      
      for (const [value, data] of sortedValues) {
        siblingOptions.push({
          id: `cuesheet_${data.exampleTrack.id}`,
          value,
          confidence: 0.5,
          reasoning: `${data.count} track${data.count > 1 ? 's' : ''} in this cue sheet use${data.count === 1 ? 's' : ''} this value`,
          source: 'cuesheet',
          siblingTrack: data.exampleTrack.trackName
        });
      }
    }
    
    return siblingOptions;
  }, [allCues, hasFieldContent, normalize, shareCommonRoot]);

  /**
   * Detect which fields are missing in selected tracks
   */
  const detectMissingFields = useCallback(() => {
    if (selectedCues.length === 0) return [];
    
    const fields = ['artist', 'composer', 'publisher', 'source', 'label'];
    const missing = [];
    
    for (const field of fields) {
      const missingCount = selectedCues.filter(c => 
        !c[field] || c[field].trim() === '' || c[field] === '-'
      ).length;
      if (missingCount > 0) {
        missing.push({ field, count: missingCount });
      }
    }
    return missing;
  }, [selectedCues]);

  /**
   * Get suggestions for a specific field
   */
  const getSuggestionsForField = useCallback(async (field) => {
    if (selectedCues.length === 0) return null;
    
    setIsLoading(true);
    setActiveField(field);
    
    try {
      // Get tracks that are missing this field
      const tracksNeedingField = selectedCues.filter(c => 
        !c[field] || c[field].trim() === '' || c[field] === '-' || c[field] === 'N/A'
      );
      
      if (tracksNeedingField.length === 0) {
        return null;
      }

      // Step 1: Get sibling suggestions (instant, local)
      const siblingOptions = findSiblingValues(tracksNeedingField, field);
      
      // Step 2: Get pattern engine suggestions (cloud, fast)
      let patternOptions = [];
      try {
        const choices = await window.electronAPI?.patternGetBatchChoices?.(tracksNeedingField, field);
        if (choices && choices.length > 0 && choices[0].options) {
          patternOptions = choices[0].options.filter(o => 
            o.id !== 'leave_empty' && o.id !== 'custom' && o.value !== null
          );
        }
      } catch (e) {
        console.error('[SmartSuggestions] Pattern engine error:', e);
      }

      // Merge and dedupe options, prioritizing siblings
      const seenValues = new Set();
      const allOptions = [];
      
      // Add sibling options first (highest priority)
      for (const opt of siblingOptions) {
        if (!seenValues.has(opt.value)) {
          seenValues.add(opt.value);
          allOptions.push(opt);
        }
      }
      
      // Add pattern options
      for (const opt of patternOptions) {
        if (!seenValues.has(opt.value)) {
          seenValues.add(opt.value);
          allOptions.push(opt);
        }
      }
      
      // Sort by confidence
      allOptions.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

      const result = {
        field,
        tracks: tracksNeedingField.map(t => ({ id: t.id, trackName: t.trackName })),
        trackCount: tracksNeedingField.length,
        options: allOptions,
        topSuggestion: allOptions[0] || null,
        alternativeCount: Math.max(0, allOptions.length - 1)
      };
      
      setSuggestions(result);
      return result;
      
    } catch (error) {
      console.error('[SmartSuggestions] Error getting suggestions:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [selectedCues, findSiblingValues]);

  /**
   * Refine suggestions with user context (uses Opus AI)
   */
  const refineSuggestions = useCallback(async (context) => {
    if (!suggestions || !context.trim()) return;
    
    setIsRefining(true);
    
    try {
      const result = await window.electronAPI?.aurisChatSendMessage({
        message: context,
        conversationHistory: [],
        context: {
          cues: allCues,
          pendingSuggestions: [{
            field: suggestions.field,
            tracksMissing: suggestions.tracks,
            suggestedValue: suggestions.topSuggestion?.value
          }]
        }
      });
      
      if (result?.success && result?.actions?.length > 0) {
        // AI returned actions to apply
        return { type: 'actions', actions: result.actions, message: result.message };
      } else if (result?.suggestions?.length > 0) {
        // AI returned new suggestions
        const newOptions = result.suggestions.map(s => ({
          id: `ai_${Date.now()}`,
          value: s.suggestedValue,
          confidence: 0.8,
          reasoning: s.reasoning || 'AI suggestion based on your context',
          source: 'ai'
        }));
        
        setSuggestions(prev => ({
          ...prev,
          options: [...newOptions, ...prev.options],
          topSuggestion: newOptions[0]
        }));
        
        return { type: 'suggestions', message: result.message };
      } else if (result?.message) {
        return { type: 'message', message: result.message };
      }
    } catch (error) {
      console.error('[SmartSuggestions] Refine error:', error);
    } finally {
      setIsRefining(false);
    }
    
    return null;
  }, [suggestions, allCues]);

  /**
   * Apply a suggestion to the selected tracks
   */
  const applySuggestion = useCallback(async (option, options = {}) => {
    if (!suggestions || !option || !onUpdateCue) return false;
    
    const { applyToSimilar = false, rememberPattern = false } = options;
    
    try {
      // Apply to all tracks in the suggestion
      for (const track of suggestions.tracks) {
        if (option.value && option.value !== '__CUSTOM__') {
          onUpdateCue(track.id, { [suggestions.field]: option.value });
        }
      }
      
      // Record the choice for pattern learning
      if (rememberPattern && window.electronAPI?.patternRecordChoice) {
        const fullTrack = allCues.find(c => c.id === suggestions.tracks[0]?.id);
        if (fullTrack) {
          await window.electronAPI.patternRecordChoice(
            fullTrack,
            suggestions.field,
            option,
            suggestions.options
          );
        }
      }
      
      // Clear suggestions after successful apply
      setSuggestions(null);
      setActiveField(null);
      
      return true;
    } catch (error) {
      console.error('[SmartSuggestions] Apply error:', error);
      return false;
    }
  }, [suggestions, allCues, onUpdateCue]);

  /**
   * Apply a custom value
   */
  const applyCustomValue = useCallback(async (value, options = {}) => {
    if (!suggestions || !value.trim() || !onUpdateCue) return false;
    
    const customOption = {
      id: 'custom',
      value: value.trim(),
      confidence: 1,
      reasoning: 'Custom value entered by user',
      source: 'user'
    };
    
    return applySuggestion(customOption, options);
  }, [suggestions, onUpdateCue, applySuggestion]);

  /**
   * Dismiss suggestions
   */
  const dismiss = useCallback(() => {
    setSuggestions(null);
    setActiveField(null);
    setIsLoading(false);
    setIsRefining(false);
  }, []);

  /**
   * Auto-detect missing fields when selection changes (only when enabled)
   */
  useEffect(() => {
    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    // If disabled or no selection, clear suggestions
    if (!enabled || selectedCues.length === 0) {
      dismiss();
      return;
    }
    
    // Debounce to avoid flickering during rapid selection changes
    debounceRef.current = setTimeout(() => {
      const missing = detectMissingFields();
      
      // If there's exactly one missing field type, auto-get suggestions
      if (missing.length === 1) {
        getSuggestionsForField(missing[0].field);
      } else if (missing.length > 1) {
        // Multiple fields missing - show field selector
        setSuggestions({
          multipleFields: true,
          missingFields: missing,
          tracks: selectedCues.map(t => ({ id: t.id, trackName: t.trackName })),
          trackCount: selectedCues.length
        });
      }
    }, 300);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [selectedCues, detectMissingFields, getSuggestionsForField, dismiss, enabled]);

  return {
    // State
    suggestions,
    isLoading,
    isRefining,
    activeField,
    
    // Actions
    getSuggestionsForField,
    refineSuggestions,
    applySuggestion,
    applyCustomValue,
    dismiss,
    
    // Helpers
    detectMissingFields,
    hasSelection: selectedCues.length > 0
  };
}

export default useSmartSuggestions;
