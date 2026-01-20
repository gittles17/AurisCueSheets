import { useState, useCallback, useMemo } from 'react';
import { CaretRight, Folder, FileText, FolderOpen, FolderPlus, UploadSimple, MagnifyingGlass, X, Trash, Copy, ArrowSquareOut, ArrowsOutSimple, ArrowsInSimple, PencilSimple } from '@phosphor-icons/react';

function ProjectTree({ 
  projects, 
  activeProjectId, 
  onSelectProject, 
  onCreateFolder,
  onCreateCueSheet,
  onOpenFile,
  onRename,
  onDelete,
  onDuplicate,
  onMoveItem,
  onFileDrop,
  onRevealInFinder,
  openTabProjectIds = []  // IDs of projects that are open in tabs
}) {
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [contextMenu, setContextMenu] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [draggedItem, setDraggedItem] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedItemId, setSelectedItemId] = useState(null);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleContextMenu = useCallback((e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      item
    });
  }, []);

  // Context menu on empty space (for creating folders at root)
  const handleEmptyContextMenu = useCallback((e) => {
    // Only if clicking on the tree container itself, not an item
    if (e.target === e.currentTarget || e.target.closest('.tree-empty-area')) {
      e.preventDefault();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        item: null // null means root level
      });
    }
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const startEditing = useCallback((item) => {
    setEditingId(item.id);
    setEditValue(item.name);
    setContextMenu(null);
  }, []);

  const finishEditing = useCallback(() => {
    if (editingId && editValue.trim()) {
      onRename?.(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue('');
  }, [editingId, editValue, onRename]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      finishEditing();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditValue('');
    }
  }, [finishEditing]);

  // Collect all folders for "Move to..." menu
  const getAllFolders = useCallback((items, excludeId = null) => {
    const folders = [];
    const collect = (itemList) => {
      for (const item of itemList) {
        if (item.type === 'folder' && item.id !== excludeId) {
          folders.push(item);
          if (item.children) {
            collect(item.children);
          }
        }
      }
    };
    collect(items);
    return folders;
  }, []);

  // Filter tree items by search query
  const filterTree = useCallback((items, query) => {
    if (!query) return items;
    
    const filterItems = (itemList) => {
      return itemList.reduce((acc, item) => {
        const nameMatches = item.name.toLowerCase().includes(query);
        
        if (item.children && item.children.length > 0) {
          const filteredChildren = filterItems(item.children);
          if (filteredChildren.length > 0 || nameMatches) {
            acc.push({ ...item, children: filteredChildren });
          }
        } else if (nameMatches) {
          acc.push(item);
        }
        
        return acc;
      }, []);
    };
    
    return filterItems(items);
  }, []);

  // Filtered projects based on search
  const filteredProjects = useMemo(() => {
    return filterTree(projects, searchQuery.toLowerCase());
  }, [projects, searchQuery, filterTree]);

  // Expand all folders
  const expandAll = useCallback(() => {
    const allFolderIds = new Set();
    const collectIds = (items) => {
      items.forEach(item => {
        if (item.type === 'folder') {
          allFolderIds.add(item.id);
          if (item.children) collectIds(item.children);
        }
      });
    };
    collectIds(projects);
    setExpandedIds(allFolderIds);
  }, [projects]);

  // Collapse all folders
  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  // Check if any folders are expanded
  const hasExpandedFolders = expandedIds.size > 0;

  const renderTreeItem = (item, depth = 0) => {
    const isFolder = item.type === 'folder';
    const isCueSheet = item.type === 'cuesheet';
    const isExpanded = expandedIds.has(item.id);
    const hasChildren = isFolder && item.children && item.children.length > 0;
    const isActive = item.id === activeProjectId;
    const isSelected = item.id === selectedItemId;
    const isEditing = editingId === item.id;
    const isOpenInTab = isCueSheet && openTabProjectIds.includes(item.id);
    const isDragging = draggedItem?.id === item.id;
    const isDropTarget = dropTarget === item.id && isFolder;

    return (
      <div key={item.id}>
        <div
          draggable={!isEditing}
          onDragStart={(e) => {
            setDraggedItem(item);
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.id);
          }}
          onDragEnd={() => {
            setDraggedItem(null);
            setDropTarget(null);
          }}
          onDragOver={(e) => {
            if (isFolder && draggedItem && draggedItem.id !== item.id) {
              e.preventDefault();
              e.stopPropagation();
              setDropTarget(item.id);
            }
          }}
          onDragLeave={(e) => {
            if (dropTarget === item.id) {
              setDropTarget(null);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedItem && isFolder && draggedItem.id !== item.id) {
              onMoveItem?.(draggedItem.id, item.id);
            }
            setDraggedItem(null);
            setDropTarget(null);
          }}
          className={`
            flex items-center gap-1 px-2 cursor-pointer rounded-md mx-1
            transition-colors
            ${isActive ? 'bg-auris-blue/20 text-auris-blue' : isSelected ? 'bg-auris-card text-auris-text' : 'hover:bg-auris-card text-auris-text-secondary hover:text-auris-text'}
            ${isDragging ? 'opacity-50' : ''}
            ${isDropTarget ? 'bg-auris-purple/30 ring-1 ring-auris-purple' : ''}
          `}
          style={{ 
            paddingLeft: `${depth * 12 + 8}px`,
            paddingTop: `${0.375 * zoomLevel}rem`,
            paddingBottom: `${0.375 * zoomLevel}rem`,
            fontSize: `${0.875 * zoomLevel}rem`
          }}
          onClick={() => {
            setSelectedItemId(item.id);
            if (isCueSheet) {
              // Single click - select/switch to existing tab or open new
              onSelectProject?.(item.id, false);
            }
            // Folders expand on double-click, not single click
          }}
          onDoubleClick={() => {
            if (isFolder) {
              toggleExpand(item.id);
            } else if (isCueSheet) {
              // Double click - always open in new tab
              onSelectProject?.(item.id, true);
            }
          }}
          onContextMenu={(e) => handleContextMenu(e, item)}
        >
          {/* Expand/Collapse Arrow - only for folders */}
          {isFolder ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(item.id);
              }}
              className="w-4 h-4 flex items-center justify-center text-auris-text-muted hover:text-auris-text"
            >
              <CaretRight 
                size={12} 
                weight="bold"
                className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span className="w-4" />
          )}

          {/* Icon */}
          {isFolder && <Folder size={16} weight={isExpanded ? 'fill' : 'regular'} className="text-auris-text-muted" />}
          {isCueSheet && (
            <div className="relative">
              <FileText size={16} weight={isOpenInTab ? 'fill' : 'regular'} className={isOpenInTab ? 'text-auris-blue' : 'text-auris-text-muted'} />
              {isOpenInTab && !isActive && (
                <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-auris-blue" />
              )}
            </div>
          )}

          {/* Name */}
          {isEditing ? (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={finishEditing}
              onKeyDown={handleKeyDown}
              autoFocus
              className="flex-1 bg-auris-bg border border-auris-blue rounded px-1 py-0.5 text-xs focus:outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">{item.name}</span>
          )}

          {/* Active Indicator */}
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-auris-green" />
          )}
        </div>

        {/* Children */}
        {isExpanded && hasChildren && (
          <div>
            {item.children.map(child => renderTreeItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className="h-full flex flex-col bg-auris-bg-secondary border-r border-auris-border overflow-hidden"
      onClick={closeContextMenu}
    >
      {/* Search Bar */}
      <div className="p-2 border-b border-auris-border">
        <div className="relative">
          <MagnifyingGlass 
            size={14} 
            className="absolute left-2 top-1/2 -translate-y-1/2 text-auris-text-muted" 
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full bg-auris-bg border border-transparent focus:border-auris-border rounded pl-7 pr-7 py-1.5 text-sm text-auris-text placeholder:text-auris-text-muted/50 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-auris-text-muted hover:text-auris-text"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>


      {/* Tree */}
      <div 
        className={`flex-1 overflow-y-auto py-2 transition-colors ${
          dropTarget === 'root' ? 'bg-auris-purple/10' : ''
        } ${isDraggingFile ? 'bg-auris-blue/10 ring-2 ring-inset ring-auris-blue/30' : ''}`}
        onContextMenu={handleEmptyContextMenu}
        onDragOver={(e) => {
          e.preventDefault();
          // Check if it's an external file drag
          if (e.dataTransfer.types.includes('Files')) {
            setIsDraggingFile(true);
            return;
          }
          // Internal item drag - only if target is the container itself
          if (draggedItem && (e.target === e.currentTarget || e.target.closest('.tree-empty-area'))) {
            setDropTarget('root');
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) {
            setIsDraggingFile(false);
            if (dropTarget === 'root') {
              setDropTarget(null);
            }
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          
          // Handle external file drop
          if (e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            // In Electron, files have a path property
            const filePath = file.path || file.name;
            if (filePath.endsWith('.prproj')) {
              onFileDrop?.(filePath);
            }
            setIsDraggingFile(false);
            return;
          }
          
          // Handle internal item drop
          if (draggedItem && (e.target === e.currentTarget || e.target.closest('.tree-empty-area'))) {
            onMoveItem?.(draggedItem.id, null); // null = root level
            setDraggedItem(null);
            setDropTarget(null);
          }
        }}
      >
        {filteredProjects.length === 0 ? (
          <div 
            className="tree-empty-area px-4 py-6 text-center text-auris-text-muted text-sm h-full flex flex-col items-center justify-center"
            onContextMenu={handleEmptyContextMenu}
          >
            <div 
              className={`
                w-full max-w-[180px] py-6 px-4 rounded-lg border-2 border-dashed 
                flex flex-col items-center justify-center transition-all duration-200
                ${isDraggingFile 
                  ? 'border-auris-blue bg-auris-blue/10 scale-105' 
                  : 'border-auris-border/50 hover:border-auris-text-muted/30'
                }
              `}
            >
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-colors
                ${isDraggingFile ? 'bg-auris-blue/20' : 'bg-auris-card'}
              `}>
                <UploadSimple 
                  size={24} 
                  className={`transition-colors ${isDraggingFile ? 'text-auris-blue' : 'text-auris-text-muted'}`} 
                />
              </div>
              {isDraggingFile ? (
                <p className="text-auris-blue font-medium">Drop to import</p>
              ) : (
                <>
                  <p className="font-medium text-auris-text-secondary mb-1">Drop .prproj file</p>
                  <p className="text-xs text-auris-text-muted">or click folder icon above</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {filteredProjects.map(item => renderTreeItem(item, 0))}
            {/* Empty area at bottom for context menu */}
            <div 
              className="tree-empty-area min-h-[50px]"
              onContextMenu={handleEmptyContextMenu}
            />
          </>
        )}
      </div>

      {/* Bottom Toolbar */}
      <div className="p-2 border-t border-auris-border flex items-center gap-2 overflow-hidden">
        {/* Zoom Slider */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="range"
            min="0.7"
            max="1.4"
            step="0.1"
            value={zoomLevel}
            onChange={(e) => setZoomLevel(parseFloat(e.target.value))}
            className="flex-1 min-w-0 h-1 bg-auris-border rounded-lg appearance-none cursor-pointer accent-auris-text-muted"
            title={`Zoom: ${Math.round(zoomLevel * 100)}%`}
          />
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => onCreateFolder?.(null)}
            className="p-1.5 rounded hover:bg-auris-card text-auris-text-muted hover:text-auris-text transition-colors"
            title="New Folder"
          >
            <FolderPlus size={16} />
          </button>
          <button
            onClick={onOpenFile}
            className="p-1.5 rounded hover:bg-auris-card text-auris-text-muted hover:text-auris-text transition-colors"
            title="Import Project"
          >
            <FolderOpen size={16} />
          </button>
          <button
            onClick={() => selectedItemId && onDelete?.(selectedItemId)}
            disabled={!selectedItemId}
            className={`p-1.5 rounded transition-colors ${
              selectedItemId 
                ? 'hover:bg-auris-card text-auris-text-muted hover:text-auris-red' 
                : 'text-auris-text-muted/30 cursor-not-allowed'
            }`}
            title="Delete Selected"
          >
            <Trash size={16} />
          </button>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-auris-card border border-auris-border rounded-lg shadow-lg py-1 z-50 min-w-[180px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Empty area - just New Folder */}
          {!contextMenu.item && (
            <button
              onClick={() => {
                onCreateFolder?.(null);
                closeContextMenu();
              }}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
            >
              <FolderPlus size={14} />
              New Folder
            </button>
          )}

          {/* Folder context menu */}
          {contextMenu.item?.type === 'folder' && (
            <>
              <button
                onClick={() => {
                  onCreateFolder?.(contextMenu.item.id);
                  closeContextMenu();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                <FolderPlus size={14} />
                New Folder
              </button>
              <button
                onClick={() => {
                  onCreateCueSheet?.(contextMenu.item.id);
                  closeContextMenu();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                <FileText size={14} />
                New Cue Sheet
              </button>
              
              <div className="border-t border-auris-border my-1" />
              
              <button
                onClick={() => {
                  startEditing(contextMenu.item);
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                <PencilSimple size={14} />
                Rename
              </button>
              <button
                onClick={() => {
                  onDuplicate?.(contextMenu.item.id);
                  closeContextMenu();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                <Copy size={14} />
                Duplicate
              </button>
              
              {/* Move to... submenu */}
              <div className="relative group">
                <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center justify-between">
                  Move to...
                  <CaretRight size={12} />
                </button>
                <div className="absolute left-full top-0 hidden group-hover:block bg-auris-card border border-auris-border rounded-lg shadow-lg py-1 min-w-[140px] ml-1">
                  <button
                    onClick={() => {
                      onMoveItem?.(contextMenu.item.id, null);
                      closeContextMenu();
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
                  >
                    <Folder size={14} />
                    Root level
                  </button>
                  {getAllFolders(projects, contextMenu.item.id).length > 0 && (
                    <div className="border-t border-auris-border my-1" />
                  )}
                  {getAllFolders(projects, contextMenu.item.id).map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        onMoveItem?.(contextMenu.item.id, folder.id);
                        closeContextMenu();
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
                    >
                      <Folder size={14} />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="border-t border-auris-border my-1" />
              
              <button
                onClick={() => {
                  hasExpandedFolders ? collapseAll() : expandAll();
                  closeContextMenu();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                {hasExpandedFolders ? <ArrowsInSimple size={14} /> : <ArrowsOutSimple size={14} />}
                {hasExpandedFolders ? 'Collapse All' : 'Expand All'}
              </button>
              
              <div className="border-t border-auris-border my-1" />
              
              <button
                onClick={() => {
                  onDelete?.(contextMenu.item.id);
                  closeContextMenu();
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-auris-red hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                <Trash size={14} />
                Delete
              </button>
            </>
          )}

          {/* Cue Sheet context menu */}
          {contextMenu.item?.type === 'cuesheet' && (
            <>
              <button
                onClick={() => {
                  startEditing(contextMenu.item);
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                <PencilSimple size={14} />
                Rename
              </button>
              <button
                onClick={() => {
                  onDuplicate?.(contextMenu.item.id);
                  closeContextMenu();
                }}
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                <Copy size={14} />
                Duplicate
              </button>
              
              {/* Move to... submenu */}
              <div className="relative group">
                <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center justify-between">
                  Move to...
                  <CaretRight size={12} />
                </button>
                <div className="absolute left-full top-0 hidden group-hover:block bg-auris-card border border-auris-border rounded-lg shadow-lg py-1 min-w-[140px] ml-1">
                  <button
                    onClick={() => {
                      onMoveItem?.(contextMenu.item.id, null);
                      closeContextMenu();
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
                  >
                    <Folder size={14} />
                    Root level
                  </button>
                  {getAllFolders(projects, contextMenu.item.id).length > 0 && (
                    <div className="border-t border-auris-border my-1" />
                  )}
                  {getAllFolders(projects, contextMenu.item.id).map(folder => (
                    <button
                      key={folder.id}
                      onClick={() => {
                        onMoveItem?.(contextMenu.item.id, folder.id);
                        closeContextMenu();
                      }}
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
                    >
                      <Folder size={14} />
                      <span className="truncate">{folder.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="border-t border-auris-border my-1" />
              
              {contextMenu.item.filePath && (
                <>
                  <button
                    onClick={() => {
                      onRevealInFinder?.(contextMenu.item.filePath);
                      closeContextMenu();
                    }}
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-auris-bg transition-colors flex items-center gap-2"
                  >
                    <ArrowSquareOut size={14} />
                    Reveal in Finder
                  </button>
                  <div className="border-t border-auris-border my-1" />
                </>
              )}
              
              <button
                onClick={() => {
                  onDelete?.(contextMenu.item.id);
                  closeContextMenu();
                }}
                className="w-full px-3 py-1.5 text-left text-sm text-auris-red hover:bg-auris-bg transition-colors flex items-center gap-2"
              >
                <Trash size={14} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ProjectTree;
