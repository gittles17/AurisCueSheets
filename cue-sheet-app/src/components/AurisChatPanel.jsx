import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, PaperPlaneTilt, CircleNotch, CheckCircle, Warning, TrendUp, Lightbulb, Target, Brain } from '@phosphor-icons/react';
import PatternChoiceCard from './PatternChoiceCard';

/**
 * Message bubble component
 */
function MessageBubble({ message, isLatest }) {
  const isUser = message.role === 'user';
  const isThinking = message.isThinking;
  const timestamp = message.timestamp 
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) 
    : new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  
  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[85%]">
          <div className="rounded-2xl px-4 py-3 text-sm bg-auris-blue/20 text-auris-text border border-auris-blue/30">
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
          <p className="text-xs text-auris-text-muted/50 mt-1.5 text-right mr-1">{timestamp}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-1">
          <img src="./auris-logo-icon.png" alt="" className="w-8 h-8" />
        </div>
        <div className="flex-1">
          <div
            className={`
              rounded-2xl px-4 py-3 text-sm bg-auris-card text-auris-text-secondary border border-auris-border
              ${isThinking ? 'animate-pulse' : ''}
            `}
          >
            {isThinking ? (
              <div className="flex items-center gap-2">
                <CircleNotch size={14} className="animate-spin text-auris-blue" />
                <span className="text-auris-text-muted">Thinking...</span>
              </div>
            ) : (
              <div className="whitespace-pre-wrap">{message.content}</div>
            )}
            
            {/* Tool calls display */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-2 pt-2 border-t border-auris-border">
                {message.toolCalls.map((tool, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-auris-text-muted">
                    {tool.status === 'running' && (
                      <CircleNotch size={12} className="animate-spin text-auris-blue" />
                    )}
                    {tool.status === 'complete' && (
                      <CheckCircle size={12} className="text-auris-green" weight="fill" />
                    )}
                    {tool.status === 'error' && (
                      <Warning size={12} className="text-auris-red" weight="fill" />
                    )}
                    <span>{tool.name}</span>
                    {tool.result && (
                      <span className="text-auris-text-muted/60">- {tool.result}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-auris-text-muted/50 mt-1.5 ml-1">{timestamp}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Strategic question suggestion card
 */
function StrategicQuestion({ icon: Icon, text, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 p-4 rounded-xl bg-auris-card border border-auris-border hover:border-auris-border-light hover:bg-auris-card-hover transition-all text-left group"
    >
      <div className="flex-shrink-0 mt-0.5 text-auris-text-muted group-hover:text-auris-text-secondary transition-colors">
        <Icon size={18} />
      </div>
      <span className="text-sm text-auris-text-secondary group-hover:text-auris-text transition-colors leading-snug">
        {text}
      </span>
    </button>
  );
}

/**
 * Auris Chat Panel - AI assistant for cue sheet editing
 */
function AurisChatPanel({
  isOpen,
  onClose,
  messages = [],
  isProcessing = false,
  onSendMessage,
  highlights = [],
  onJumpToHighlight,
  onResolveHighlight,
  selectedRowIds = [],
  cues = [],
  onUpdateCue = null
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [pendingChoices, setPendingChoices] = useState(null);
  const [isLoadingChoices, setIsLoadingChoices] = useState(false);

  // Get selected cue data (must be defined before callbacks that use it)
  const selectedCues = cues.filter(c => selectedRowIds.includes(c.id));
  const hasSelection = selectedCues.length > 0;

  // Analyze cue sheet state for dynamic questions
  const cueSheetAnalysis = useMemo(() => {
    if (!cues || cues.length === 0) return null;
    
    const missingComposer = cues.filter(c => !c.composer || c.composer.trim() === '').length;
    const missingPublisher = cues.filter(c => !c.publisher || c.publisher.trim() === '').length;
    const missingArtist = cues.filter(c => !c.artist || c.artist.trim() === '').length;
    const lowConfidence = cues.filter(c => 
      (c.composerConfidence && c.composerConfidence < 0.8) ||
      (c.publisherConfidence && c.publisherConfidence < 0.8)
    ).length;
    const totalTracks = cues.length;
    const completeTracks = cues.filter(c => c.composer && c.publisher).length;
    const completionPercent = Math.round((completeTracks / totalTracks) * 100);
    
    // Check for common patterns (same library, same source)
    const libraries = {};
    const sources = {};
    cues.forEach(c => {
      if (c.label || c.library) libraries[c.label || c.library] = (libraries[c.label || c.library] || 0) + 1;
      if (c.source) sources[c.source] = (sources[c.source] || 0) + 1;
    });
    const dominantLibrary = Object.entries(libraries).sort((a, b) => b[1] - a[1])[0];
    const hasMultipleSources = Object.keys(sources).length > 1;
    
    return {
      missingComposer,
      missingPublisher,
      missingArtist,
      lowConfidence,
      totalTracks,
      completeTracks,
      completionPercent,
      dominantLibrary: dominantLibrary ? { name: dominantLibrary[0], count: dominantLibrary[1] } : null,
      hasMultipleSources
    };
  }, [cues]);

  // Generate dynamic strategic questions based on context
  const strategicQuestions = useMemo(() => {
    const questions = [];
    const analysis = cueSheetAnalysis;
    
    if (!analysis) {
      // No cues loaded - show onboarding questions
      return [
        { icon: Lightbulb, text: 'How does Auris Chat work?', prompt: 'Explain how you can help me complete cue sheets faster.' },
        { icon: CheckCircle, text: 'What can you auto-fill?', prompt: 'What types of data can you automatically fill in for my cue sheets?' }
      ];
    }
    
    // Priority 1: If mostly complete, focus on finishing touches
    if (analysis.completionPercent >= 90 && analysis.completeTracks < analysis.totalTracks) {
      questions.push({
        icon: CheckCircle,
        text: `Finish the last ${analysis.totalTracks - analysis.completeTracks} track${analysis.totalTracks - analysis.completeTracks > 1 ? 's' : ''}`,
        prompt: `I'm almost done! Please fill in the remaining ${analysis.totalTracks - analysis.completeTracks} incomplete track${analysis.totalTracks - analysis.completeTracks > 1 ? 's' : ''} using the learned database.`
      });
    }
    
    // Priority 2: Major missing data
    if (analysis.missingComposer > 0 || analysis.missingPublisher > 0) {
      const missingCount = Math.max(analysis.missingComposer, analysis.missingPublisher);
      if (missingCount > analysis.totalTracks * 0.5) {
        // More than half missing - suggest batch fill
        questions.push({
          icon: CheckCircle,
          text: `Auto-fill ${missingCount} missing fields`,
          prompt: `Fill in all missing composer and publisher data for the ${missingCount} tracks that need it. Use the learned database and be proactive.`
        });
      } else if (missingCount > 0 && missingCount <= 5) {
        // Just a few missing - be specific
        questions.push({
          icon: CheckCircle,
          text: `Complete the ${missingCount} tracks missing data`,
          prompt: `There are ${missingCount} tracks with missing composer or publisher data. Please find and fill in this data.`
        });
      }
    }
    
    // Priority 3: Low confidence entries
    if (analysis.lowConfidence > 0) {
      questions.push({
        icon: TrendUp,
        text: `Review ${analysis.lowConfidence} low-confidence ${analysis.lowConfidence === 1 ? 'entry' : 'entries'}`,
        prompt: `I have ${analysis.lowConfidence} track${analysis.lowConfidence > 1 ? 's' : ''} with low-confidence data. Please verify or correct them.`
      });
    }
    
    // Priority 4: Library-specific optimization
    if (analysis.dominantLibrary && analysis.dominantLibrary.count >= 3) {
      questions.push({
        icon: Lightbulb,
        text: `Verify all ${analysis.dominantLibrary.name} tracks`,
        prompt: `Most tracks are from ${analysis.dominantLibrary.name}. Please verify all tracks from this library have consistent and correct metadata.`
      });
    }
    
    // Priority 5: Summary/status
    if (questions.length < 3) {
      if (analysis.completionPercent === 100) {
        questions.push({
          icon: CheckCircle,
          text: 'Final quality check',
          prompt: 'All tracks have composer and publisher data. Please do a final quality check to ensure everything looks correct.'
        });
      } else {
        questions.push({
          icon: Lightbulb,
          text: 'What still needs attention?',
          prompt: 'Give me a quick summary of which tracks still need work and what you can help with.'
        });
      }
    }
    
    // Ensure we always have at least 2 questions
    if (questions.length < 2) {
      questions.push({
        icon: TrendUp,
        text: 'Learn from this sheet',
        prompt: 'Save all the track data from this cue sheet to your learned database so you can auto-fill similar tracks in the future.'
      });
    }
    
    return questions.slice(0, 3); // Max 3 questions
  }, [cueSheetAnalysis]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isProcessing) return;
    
    onSendMessage?.(input.trim());
    setInput('');
  }, [input, isProcessing, onSendMessage]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleStrategicQuestion = (prompt) => {
    onSendMessage?.(prompt);
  };

  // Helper to check if a field has content
  const hasFieldContent = (value) => {
    return value && value.trim() !== '' && value.trim() !== '-';
  };

  // Find sibling tracks that have the field filled in
  const findSiblingValues = useCallback((tracksNeedingField, field) => {
    const siblingOptions = [];
    const seenValues = new Set();
    
    // Helper to normalize strings for comparison
    const normalize = (s) => s ? s.toLowerCase().trim() : '';
    
    // Helper to check if two values share a common root (e.g., "BMG Production Music" matches "BMG Production Music (UK)")
    const shareCommonRoot = (a, b) => {
      if (!a || !b) return false;
      const aNorm = normalize(a);
      const bNorm = normalize(b);
      // Check if one contains the other or they share a significant prefix
      return aNorm.includes(bNorm) || bNorm.includes(aNorm) || 
             (aNorm.length > 5 && bNorm.length > 5 && aNorm.substring(0, 5) === bNorm.substring(0, 5));
    };
    
    for (const track of tracksNeedingField) {
      // Find other tracks in the cue sheet that share characteristics and HAVE this field
      const siblings = cues.filter(c => {
        // Must have the field filled
        if (!hasFieldContent(c[field])) return false;
        // Must not be one of the tracks we're filling
        if (tracksNeedingField.some(t => t.id === c.id)) return false;
        
        // Check various similarity criteria
        const sameSource = track.source && c.source && normalize(track.source) === normalize(c.source);
        const sameLibrary = shareCommonRoot(track.label || track.library, c.label || c.library);
        const samePublisher = shareCommonRoot(track.publisher, c.publisher);
        
        // Match if any key field is shared
        return sameSource || sameLibrary || samePublisher;
      });
      
      for (const sibling of siblings) {
        const value = sibling[field];
        if (!seenValues.has(value)) {
          seenValues.add(value);
          
          // Determine why they matched for the reasoning
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
            confidence: 0.75, // High confidence since it's from same cue sheet
            reasoning: `Track "${sibling.trackName}" has ${matchReason} and uses this value`,
            source: 'sibling',
            siblingTrack: sibling.trackName
          });
        }
      }
    }
    
    // Fallback: if no siblings found with matching attributes, check ALL tracks in the cue sheet
    // This helps when tracks don't share obvious metadata but the user has filled in one track
    if (siblingOptions.length === 0) {
      const allTracksWithField = cues.filter(c => {
        if (!hasFieldContent(c[field])) return false;
        if (tracksNeedingField.some(t => t.id === c.id)) return false;
        return true;
      });
      
      // Count occurrences of each value
      const valueCounts = {};
      for (const track of allTracksWithField) {
        const value = track[field];
        if (!valueCounts[value]) {
          valueCounts[value] = { count: 0, exampleTrack: track };
        }
        valueCounts[value].count++;
      }
      
      // Add the most common values as suggestions
      const sortedValues = Object.entries(valueCounts)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 3);
      
      for (const [value, data] of sortedValues) {
        siblingOptions.push({
          id: `cuesheet_${data.exampleTrack.id}`,
          value,
          confidence: 0.5, // Lower confidence since no direct attribute match
          reasoning: `${data.count} track${data.count > 1 ? 's' : ''} in this cue sheet use${data.count === 1 ? 's' : ''} this value (e.g., "${data.exampleTrack.trackName}")`,
          source: 'cuesheet',
          siblingTrack: data.exampleTrack.trackName
        });
      }
    }
    
    return siblingOptions;
  }, [cues]);

  // Request interactive choices for a field using the pattern engine
  const requestChoicesForField = useCallback(async (field) => {
    if (!hasSelection || selectedCues.length === 0) return;
    
    setIsLoadingChoices(true);
    setPendingChoices(null);
    
    try {
      // Get tracks that are missing this field
      const tracksNeedingField = selectedCues.filter(c => 
        !c[field] || c[field].trim() === '' || c[field] === '-' || c[field] === 'N/A'
      );
      
      if (tracksNeedingField.length === 0) {
        // All tracks have this field
        return;
      }
      
      // Get batch choices from pattern engine
      const choices = await window.electronAPI?.patternGetBatchChoices?.(tracksNeedingField, field);
      
      // Also check for sibling patterns (other tracks in cue sheet with same source/library)
      const siblingOptions = findSiblingValues(tracksNeedingField, field);
      
      if (choices && choices.length > 0) {
        // Merge sibling options with pattern choices
        const mergedChoice = { ...choices[0] };
        
        // Add sibling options at the top (they're from the current cue sheet)
        if (siblingOptions.length > 0) {
          // Filter out any sibling values that are already in the options
          const existingValues = new Set(mergedChoice.options.map(o => o.value));
          const newSiblingOptions = siblingOptions.filter(o => !existingValues.has(o.value));
          
          // Insert sibling options at the beginning (before pattern options)
          mergedChoice.options = [...newSiblingOptions, ...mergedChoice.options];
          
          // Update top confidence if sibling is higher
          if (newSiblingOptions.length > 0 && newSiblingOptions[0].confidence > (mergedChoice.topConfidence || 0)) {
            mergedChoice.topConfidence = newSiblingOptions[0].confidence;
          }
        }
        
        setPendingChoices(mergedChoice);
      } else if (siblingOptions.length > 0) {
        // No pattern choices but we have sibling suggestions
        setPendingChoices({
          field,
          track: tracksNeedingField[0],
          tracks: tracksNeedingField.map(t => ({ id: t.id, trackName: t.trackName })),
          trackCount: tracksNeedingField.length,
          options: [
            ...siblingOptions,
            { id: 'leave_empty', value: null, confidence: 0, reasoning: 'Leave empty for manual entry', source: 'user_choice' },
            { id: 'custom', value: '__CUSTOM__', confidence: 0, reasoning: 'Enter a custom value', source: 'user_choice' }
          ],
          topConfidence: siblingOptions[0]?.confidence || 0
        });
      }
    } catch (error) {
      console.error('[AurisChat] Error getting choices:', error);
    } finally {
      setIsLoadingChoices(false);
    }
  }, [selectedCues, hasSelection, findSiblingValues]);

  // Handle when user selects a choice
  const handleChoiceSelect = useCallback(async (chosenOption, meta) => {
    if (!pendingChoices) return;
    
    setIsLoadingChoices(true);
    
    try {
      const { field, tracks } = pendingChoices;
      
      // Apply the choice to all tracks in this group
      for (const trackInfo of tracks) {
        const fullTrack = cues.find(c => c.id === trackInfo.id);
        if (!fullTrack) continue;
        
        // Record the choice for learning
        await window.electronAPI?.patternRecordChoice?.(
          fullTrack, 
          field, 
          chosenOption, 
          pendingChoices.options
        );
        
        // Update the cue if we have a value
        if (chosenOption.value && chosenOption.value !== '__CUSTOM__' && onUpdateCue) {
          onUpdateCue(trackInfo.id, { [field]: chosenOption.value });
        }
      }
      
      // If "apply to all similar" was checked, apply to all tracks with same context
      if (meta.applyToAll && pendingChoices.trackCount > tracks.length) {
        // This would apply to other groups with similar context
        // For now, just apply to the current group
      }
      
      // Clear choices and show success message
      setPendingChoices(null);
      
      // Add a message about what was done
      const valueText = chosenOption.value === null ? 'empty' : `"${chosenOption.value}"`;
      const trackCount = tracks.length;
      
      // Create a system message about the action
      onSendMessage?.(`Set ${field} to ${valueText} for ${trackCount} track${trackCount > 1 ? 's' : ''}.`);
      
    } catch (error) {
      console.error('[AurisChat] Error applying choice:', error);
    } finally {
      setIsLoadingChoices(false);
    }
  }, [pendingChoices, cues, onUpdateCue, onSendMessage]);

  if (!isOpen) return null;

  const hasMessages = messages.length > 0 || pendingChoices;
  
  // Detect which fields are missing across selected tracks
  const getMissingFields = () => {
    if (!hasSelection) return [];
    const fields = ['composer', 'publisher', 'source', 'label', 'artist', 'trackNumber'];
    const missing = [];
    
    for (const field of fields) {
      const missingCount = selectedCues.filter(c => !c[field] || c[field].trim() === '' || c[field] === '-').length;
      if (missingCount > 0) {
        missing.push({ field, count: missingCount });
      }
    }
    return missing;
  };
  
  const missingFields = getMissingFields();
  const missingFieldNames = missingFields.map(f => f.field).join(', ');
  
  // Build selection prompt based on what's actually missing
  const getSelectionPrompt = () => {
    if (!hasSelection) return null;
    const trackNames = selectedCues.map(c => c.trackName).slice(0, 3);
    const more = selectedCues.length > 3 ? ` and ${selectedCues.length - 3} more` : '';
    
    if (missingFields.length === 0) {
      return `Check and verify the data for the ${selectedCues.length} selected track${selectedCues.length > 1 ? 's' : ''}: ${trackNames.join(', ')}${more}.`;
    }
    
    return `Fill in the missing ${missingFieldNames} data for the ${selectedCues.length} selected track${selectedCues.length > 1 ? 's' : ''}: ${trackNames.join(', ')}${more}. Use the learned database to find matches.`;
  };
  
  // Button label based on what's missing
  const getButtonLabel = () => {
    if (missingFields.length === 0) {
      return 'Verify selected tracks';
    }
    if (missingFields.length === 1) {
      return `Fill in ${missingFields[0].field}`;
    }
    return `Fill in missing data`;
  };

  return (
    <div className="w-96 h-full bg-auris-bg border-l border-auris-border flex flex-col">
      {/* Header - just close button */}
      <div className="px-4 py-3 flex items-center justify-end flex-shrink-0">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-auris-card transition-colors"
        >
          <X size={18} className="text-auris-text-muted" />
        </button>
      </div>
      
      {/* Selection indicator with smart field buttons */}
      {hasSelection && !pendingChoices && (
        <div className="mx-4 mb-3 p-3 bg-auris-blue/10 border border-auris-blue/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-auris-blue" />
              <span className="text-sm text-auris-blue font-medium">
                {selectedCues.length} track{selectedCues.length > 1 ? 's' : ''} selected
              </span>
            </div>
          </div>
          
          {missingFields.length > 0 ? (
            <>
              <p className="text-xs text-auris-text-muted mt-2 mb-2">
                Choose a field to fill:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {missingFields.map(({ field, count }) => (
                  <button
                    key={field}
                    onClick={() => requestChoicesForField(field)}
                    disabled={isProcessing || isLoadingChoices}
                    className="px-2.5 py-1.5 text-xs bg-auris-card border border-auris-border rounded-lg hover:bg-auris-card-hover hover:border-auris-border-light transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Brain size={12} className="text-auris-blue" />
                    {field}
                    <span className="text-auris-text-muted">({count})</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-auris-blue/20">
                <button
                  onClick={() => onSendMessage?.(getSelectionPrompt())}
                  disabled={isProcessing}
                  className="w-full py-2 px-3 bg-auris-blue text-white text-xs font-medium rounded-lg hover:bg-auris-blue/90 transition-colors disabled:opacity-50"
                >
                  {getButtonLabel()} with AI
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => onSendMessage?.(getSelectionPrompt())}
              disabled={isProcessing}
              className="mt-2 w-full py-2 px-3 bg-auris-blue text-white text-sm font-medium rounded-lg hover:bg-auris-blue/90 transition-colors disabled:opacity-50"
            >
              Verify selected tracks
            </button>
          )}
        </div>
      )}
      
      {/* Pending choices card */}
      {pendingChoices && (
        <div className="mx-4 mb-3">
          <PatternChoiceCard
            choices={pendingChoices}
            onSelect={handleChoiceSelect}
            isProcessing={isLoadingChoices}
          />
          <button
            onClick={() => setPendingChoices(null)}
            className="mt-2 w-full py-1.5 text-xs text-auris-text-muted hover:text-auris-text transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
      
      {/* Loading choices indicator */}
      {isLoadingChoices && !pendingChoices && (
        <div className="mx-4 mb-3 p-4 bg-auris-card border border-auris-border rounded-xl flex items-center justify-center gap-2">
          <CircleNotch size={16} className="animate-spin text-auris-blue" />
          <span className="text-sm text-auris-text-muted">Getting smart suggestions...</span>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5">
        {!hasMessages ? (
          // Welcome state with strategic questions
          <div className="h-full flex flex-col">
            {/* Welcome message */}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-shrink-0 mt-1">
                <img src="./auris-logo-icon.png" alt="" className="w-8 h-8" />
              </div>
              <div className="flex-1">
                <div className="rounded-2xl px-4 py-3 text-sm bg-auris-card text-auris-text-secondary border border-auris-border leading-relaxed">
                  Ready to speed up your cue sheet! I can look up composers, publishers, and fill in missing data from your learned database. What do you need help with?
                </div>
                <p className="text-xs text-auris-text-muted/50 mt-1.5 ml-1">
                  {new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Dynamic Suggestions */}
            <div className="pb-4">
              <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={16} className="text-auris-blue" />
                <span className="text-sm text-auris-blue font-medium">
                  {cueSheetAnalysis?.completionPercent === 100 
                    ? 'Quality Check' 
                    : cueSheetAnalysis?.completionPercent >= 50 
                      ? 'Next Steps' 
                      : 'Quick Actions'}
                </span>
              </div>
              <div className="space-y-2">
                {strategicQuestions.map((q, i) => (
                  <StrategicQuestion
                    key={i}
                    icon={q.icon}
                    text={q.text}
                    onClick={() => handleStrategicQuestion(q.prompt)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble 
                key={msg.id || i} 
                message={msg} 
                isLatest={i === messages.length - 1}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 flex-shrink-0">
        <div className="flex items-center gap-2 bg-auris-card border border-auris-border rounded-full px-4 py-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about cue sheet data..."
            disabled={isProcessing}
            className="flex-1 bg-transparent text-sm text-auris-text placeholder:text-auris-text-muted focus:outline-none disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="p-1 text-auris-text-muted hover:text-auris-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing ? (
              <CircleNotch size={20} className="animate-spin" />
            ) : (
              <PaperPlaneTilt size={20} />
            )}
          </button>
        </div>
        
        {/* Footer */}
        <p className="text-[11px] text-auris-text-muted/40 text-center mt-3">
          Powered by Claude AI
        </p>
      </div>
    </div>
  );
}

export default AurisChatPanel;
