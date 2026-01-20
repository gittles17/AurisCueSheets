import { X } from '@phosphor-icons/react';

/**
 * TabBar component - Browser-style tabs for multiple cue sheets
 */
function TabBar({
  tabs = [],
  activeTabId,
  onTabSelect,
  onTabClose,
  aiAssistEnabled = false,
  onToggleAiAssist
}) {

  return (
    <div className="h-9 bg-auris-bg border-b border-auris-border flex items-center px-2 gap-1">
      {/* Tabs container - scrollable if many tabs */}
      <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-hide">
        {tabs.length === 0 ? (
          // No tabs - show hint
          <span className="text-xs text-auris-text-muted px-2">Click a project to open</span>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                onClick={() => onTabSelect?.(tab.id)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg cursor-pointer transition-all min-w-0 max-w-[180px] ${
                  isActive
                    ? 'bg-auris-card border-t border-l border-r border-auris-border -mb-px'
                    : 'bg-auris-bg-secondary hover:bg-auris-card/50 border border-transparent'
                }`}
              >
                {/* Tab name */}
                <span className={`text-xs truncate ${
                  isActive ? 'text-auris-text font-medium' : 'text-auris-text-muted'
                }`}>
                  {tab.name || 'Untitled'}
                </span>
                
                {/* Dirty indicator */}
                {tab.isDirty && (
                  <div className="w-1.5 h-1.5 rounded-full bg-auris-blue flex-shrink-0" />
                )}
                
                {/* Close button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTabClose?.(tab.id);
                  }}
                  className={`p-0.5 rounded hover:bg-auris-bg transition-colors flex-shrink-0 ${
                    isActive 
                      ? 'text-auris-text-muted hover:text-auris-text' 
                      : 'opacity-0 group-hover:opacity-100 text-auris-text-muted hover:text-auris-text'
                  }`}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })
        )}
      </div>
      
      {/* Right side - AI Assist toggle */}
      <div className="flex items-center pl-2 ml-2">
        <button
          onClick={onToggleAiAssist}
          className="p-1 rounded transition-all"
          title={aiAssistEnabled ? 'AI Assist ON - click to disable' : 'AI Assist OFF - click to enable smart suggestions'}
          data-tour="ai-toggle"
        >
          <img 
            src="./ai-selector-icon.svg" 
            alt="AI Assist" 
            className="w-5 h-5 transition-all"
            style={{ 
              filter: aiAssistEnabled 
                ? 'invert(48%) sepia(79%) saturate(2476%) hue-rotate(200deg) brightness(100%) contrast(95%)' 
                : 'invert(70%) brightness(90%)',
              opacity: aiAssistEnabled ? 1 : 0.6
            }}
          />
        </button>
      </div>
    </div>
  );
}

export default TabBar;
