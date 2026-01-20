import { useState } from 'react';
import { CheckCircle, Question, Lightbulb, CaretDown, CaretUp } from '@phosphor-icons/react';

/**
 * Interactive choice card for pattern-based suggestions
 * Displays when Auris needs user input for uncertain fields
 */
function PatternChoiceCard({ 
  choices, 
  onSelect, 
  onApplyToAll = null,
  onRememberAsRule = null,
  isProcessing = false 
}) {
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [customValue, setCustomValue] = useState('');
  const [applyToAll, setApplyToAll] = useState(false);
  const [rememberAsRule, setRememberAsRule] = useState(false);
  const [showReasoning, setShowReasoning] = useState({});

  if (!choices || !choices.track) return null;

  const { field, track, options, topConfidence } = choices;

  const handleSelect = (option) => {
    if (option.id === 'custom') {
      setSelectedOptionId('custom');
    } else {
      setSelectedOptionId(option.id);
      setCustomValue('');
    }
  };

  const handleApply = () => {
    const selectedOption = options.find(o => o.id === selectedOptionId);
    if (!selectedOption) return;

    const finalOption = selectedOption.id === 'custom' 
      ? { ...selectedOption, value: customValue }
      : selectedOption;

    onSelect?.(finalOption, {
      applyToAll,
      rememberAsRule,
      field,
      track
    });
  };

  const toggleReasoning = (optionId) => {
    setShowReasoning(prev => ({
      ...prev,
      [optionId]: !prev[optionId]
    }));
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.85) return 'text-auris-green';
    if (confidence >= 0.5) return 'text-auris-orange';
    return 'text-auris-text-muted';
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 0.85) return 'High confidence';
    if (confidence >= 0.5) return 'Medium confidence';
    if (confidence >= 0.3) return 'Low confidence';
    return '';
  };

  return (
    <div className="bg-auris-card border border-auris-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-auris-border bg-auris-card/50">
        <div className="flex items-center gap-2 mb-1">
          <Question size={16} className="text-auris-blue" weight="fill" />
          <span className="text-sm font-medium text-auris-text">
            Fill in: {field}
          </span>
        </div>
        <p className="text-xs text-auris-text-muted">
          Track: {track.trackName}
          {track.library && <span className="ml-2 text-auris-text-muted/60">({track.library})</span>}
        </p>
      </div>

      {/* Options */}
      <div className="p-3 space-y-2">
        {options.filter(o => o.id !== 'custom' && o.id !== 'leave_empty').map((option) => (
          <div key={option.id} className="group">
            <button
              onClick={() => handleSelect(option)}
              className={`
                w-full flex items-start gap-3 p-3 rounded-lg border transition-all text-left
                ${selectedOptionId === option.id 
                  ? 'border-auris-blue bg-auris-blue/10' 
                  : 'border-auris-border hover:border-auris-border-light hover:bg-auris-card-hover'
                }
              `}
            >
              {/* Radio indicator */}
              <div className={`
                flex-shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 transition-colors
                ${selectedOptionId === option.id 
                  ? 'border-auris-blue bg-auris-blue' 
                  : 'border-auris-text-muted'
                }
              `}>
                {selectedOptionId === option.id && (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  </div>
                )}
              </div>

              {/* Option content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-auris-text">
                    {option.value === null ? 'Leave empty' : `"${option.value}"`}
                  </span>
                  {option.confidence > 0 && (
                    <span className={`text-xs ${getConfidenceColor(option.confidence)}`}>
                      {Math.round(option.confidence * 100)}%
                    </span>
                  )}
                </div>
                
                {/* Reasoning toggle */}
                {option.reasoning && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleReasoning(option.id);
                    }}
                    className="flex items-center gap-1 mt-1 text-xs text-auris-text-muted hover:text-auris-text-secondary transition-colors"
                  >
                    <Lightbulb size={12} />
                    <span>Why?</span>
                    {showReasoning[option.id] ? <CaretUp size={10} /> : <CaretDown size={10} />}
                  </button>
                )}
                
                {showReasoning[option.id] && option.reasoning && (
                  <p className="mt-2 text-xs text-auris-text-muted leading-relaxed bg-auris-bg/50 rounded p-2">
                    {option.reasoning}
                  </p>
                )}
              </div>

              {/* Confidence indicator */}
              {option.source === 'pattern' && option.timesConfirmed > 0 && (
                <div className="flex-shrink-0 text-xs text-auris-text-muted/60">
                  Used {option.timesConfirmed}x
                </div>
              )}
            </button>
          </div>
        ))}

        {/* Leave empty option */}
        <button
          onClick={() => handleSelect({ id: 'leave_empty', value: null })}
          className={`
            w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left
            ${selectedOptionId === 'leave_empty' 
              ? 'border-auris-blue bg-auris-blue/10' 
              : 'border-auris-border hover:border-auris-border-light hover:bg-auris-card-hover'
            }
          `}
        >
          <div className={`
            flex-shrink-0 w-4 h-4 rounded-full border-2 transition-colors
            ${selectedOptionId === 'leave_empty' 
              ? 'border-auris-blue bg-auris-blue' 
              : 'border-auris-text-muted'
            }
          `}>
            {selectedOptionId === 'leave_empty' && (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            )}
          </div>
          <span className="text-sm text-auris-text-muted">Leave empty for manual entry</span>
        </button>

        {/* Custom value option */}
        <div className={`
          rounded-lg border transition-all
          ${selectedOptionId === 'custom' 
            ? 'border-auris-blue bg-auris-blue/10' 
            : 'border-auris-border'
          }
        `}>
          <button
            onClick={() => handleSelect({ id: 'custom' })}
            className="w-full flex items-center gap-3 p-3 text-left"
          >
            <div className={`
              flex-shrink-0 w-4 h-4 rounded-full border-2 transition-colors
              ${selectedOptionId === 'custom' 
                ? 'border-auris-blue bg-auris-blue' 
                : 'border-auris-text-muted'
              }
            `}>
              {selectedOptionId === 'custom' && (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                </div>
              )}
            </div>
            <span className="text-sm text-auris-text-muted">Enter custom value...</span>
          </button>
          
          {selectedOptionId === 'custom' && (
            <div className="px-3 pb-3">
              <input
                type="text"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder={`Enter ${field}...`}
                className="w-full bg-auris-bg border border-auris-border rounded-lg px-3 py-2 text-sm text-auris-text placeholder:text-auris-text-muted focus:outline-none focus:border-auris-blue"
                autoFocus
              />
            </div>
          )}
        </div>
      </div>

      {/* Learning options */}
      {choices.trackCount > 1 && (
        <div className="px-4 py-3 border-t border-auris-border bg-auris-bg/30 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
              className="w-4 h-4 rounded border-auris-border text-auris-blue focus:ring-auris-blue focus:ring-offset-0 bg-auris-card"
            />
            <span className="text-xs text-auris-text-secondary">
              Apply to all {choices.trackCount} similar tracks
            </span>
          </label>
        </div>
      )}

      <div className="px-4 py-3 border-t border-auris-border bg-auris-bg/30">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberAsRule}
            onChange={(e) => setRememberAsRule(e.target.checked)}
            className="w-4 h-4 rounded border-auris-border text-auris-blue focus:ring-auris-blue focus:ring-offset-0 bg-auris-card"
          />
          <span className="text-xs text-auris-text-secondary">
            Remember this as a rule for future imports
          </span>
        </label>
      </div>

      {/* Apply button */}
      <div className="px-4 py-3 border-t border-auris-border">
        <button
          onClick={handleApply}
          disabled={!selectedOptionId || (selectedOptionId === 'custom' && !customValue.trim()) || isProcessing}
          className="w-full py-2.5 px-4 bg-auris-blue text-white text-sm font-medium rounded-lg hover:bg-auris-blue/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Applying...
            </>
          ) : (
            <>
              <CheckCircle size={16} weight="fill" />
              Apply
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default PatternChoiceCard;
