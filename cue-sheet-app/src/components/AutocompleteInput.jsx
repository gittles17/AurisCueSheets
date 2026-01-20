import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * AutocompleteInput - Input field with dropdown suggestions
 * 
 * Shows recent values on focus, filters as user types.
 * Supports keyboard navigation (Arrow Up/Down, Enter, Escape).
 */
function AutocompleteInput({ 
  value, 
  onChange, 
  onBlur,
  onKeyDown: externalKeyDown,
  field,
  placeholder,
  className,
  autoFocus = false
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const fetchTimeoutRef = useRef(null);

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback(async (query) => {
    if (!window.electronAPI?.getAutocompleteSuggestions) return;
    
    setIsLoading(true);
    try {
      const results = await window.electronAPI.getAutocompleteSuggestions(field, query);
      setSuggestions(results || []);
      setSelectedIndex(-1);
    } catch (err) {
      console.error('[Autocomplete] Error fetching suggestions:', err);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [field]);

  // Fetch suggestions on focus (show recent values)
  const handleFocus = useCallback(async () => {
    setShowSuggestions(true);
    fetchSuggestions(value || '');
  }, [fetchSuggestions, value]);

  // Filter suggestions as user types (debounced)
  const handleChange = useCallback((e) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // Clear existing timeout
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    
    // Debounce the fetch
    fetchTimeoutRef.current = setTimeout(() => {
      fetchSuggestions(newValue);
    }, 150);
    
    setShowSuggestions(true);
  }, [onChange, fetchSuggestions]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!showSuggestions || suggestions.length === 0) {
      // Pass through to external handler if no suggestions
      if (externalKeyDown) externalKeyDown(e);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, -1));
        break;
      case 'Enter':
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          e.preventDefault();
          onChange(suggestions[selectedIndex]);
          setShowSuggestions(false);
          setSelectedIndex(-1);
        } else if (externalKeyDown) {
          externalKeyDown(e);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setSelectedIndex(-1);
        break;
      case 'Tab':
        // Allow tab to work normally but close suggestions
        setShowSuggestions(false);
        if (externalKeyDown) externalKeyDown(e);
        break;
      default:
        if (externalKeyDown) externalKeyDown(e);
    }
  }, [showSuggestions, suggestions, selectedIndex, onChange, externalKeyDown]);

  // Handle blur - delay to allow click on suggestion
  const handleBlur = useCallback(() => {
    // Delay to allow clicking on suggestions
    setTimeout(() => {
      setShowSuggestions(false);
      setSelectedIndex(-1);
      if (onBlur) onBlur();
    }, 200);
  }, [onBlur]);

  // Select a suggestion
  const handleSelectSuggestion = useCallback((suggestion) => {
    onChange(suggestion);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    // Re-focus the input after selection
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [onChange]);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && suggestionsRef.current) {
      const selectedElement = suggestionsRef.current.children[selectedIndex];
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);

  // Highlight matching text in suggestion
  const highlightMatch = (text, query) => {
    if (!query || query.length === 0) return text;
    
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.slice(0, index)}
        <span className="text-auris-purple font-medium">
          {text.slice(index, index + query.length)}
        </span>
        {text.slice(index + query.length)}
      </>
    );
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        spellCheck="false"
      />
      
      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div 
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-auris-card border border-auris-border 
                     rounded-md shadow-lg max-h-48 overflow-auto"
        >
          {suggestions.map((suggestion, i) => (
            <div
              key={i}
              className={`
                px-3 py-2 text-sm cursor-pointer
                ${i === selectedIndex 
                  ? 'bg-auris-purple/30 text-white' 
                  : 'text-auris-text hover:bg-white/5'
                }
              `}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur
                handleSelectSuggestion(suggestion);
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <div className="truncate">
                {highlightMatch(suggestion, value)}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Loading indicator */}
      {isLoading && showSuggestions && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <div className="w-3 h-3 border border-auris-purple/50 border-t-auris-purple 
                          rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

export default AutocompleteInput;
