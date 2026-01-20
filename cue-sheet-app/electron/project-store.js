const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// Store projects in app data directory
const getStorePath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'projects.json');
};

// Default empty state (version 2 = new flexible structure)
const defaultState = {
  version: 2,
  items: [], // Can contain folders and cue sheets at any level
  activeItemId: null,
  lastModified: null
};

// Load projects from disk
function loadProjects() {
  try {
    const storePath = getStorePath();
    if (fs.existsSync(storePath)) {
      const data = fs.readFileSync(storePath, 'utf-8');
      const state = JSON.parse(data);
      // Migrate old structure if needed
      return migrateIfNeeded(state);
    }
  } catch (error) {
    console.error('Error loading projects:', error);
  }
  return { ...defaultState };
}

// Migrate old structure (version 1) to new structure (version 2)
function migrateIfNeeded(state) {
  // Already new version
  if (state.version === 2) return state;
  
  // Old version had 'projects' array with nested structure
  if (state.projects && Array.isArray(state.projects)) {
    console.log('[ProjectStore] Migrating from version 1 to version 2...');
    
    const migrateItem = (item, type) => {
      const migrated = {
        ...item,
        type: type
      };
      
      if (item.children && item.children.length > 0) {
        // If it has children, determine child type
        if (type === 'folder') {
          migrated.children = item.children.map(child => {
            // Check if child has cues (it's a cue sheet) or children (it's a folder)
            if (child.cues !== undefined) {
              return migrateItem(child, 'cuesheet');
            } else {
              return migrateItem(child, 'folder');
            }
          });
        }
      }
      
      return migrated;
    };
    
    // Convert old projects to new items
    const items = state.projects.map(proj => {
      // Old projects become folders
      const folder = {
        id: proj.id,
        type: 'folder',
        name: proj.name,
        children: [],
        createdAt: proj.createdAt
      };
      
      // Old spots become sub-folders, old cue sheets stay as cue sheets
      if (proj.children) {
        folder.children = proj.children.map(spot => {
          if (spot.cues !== undefined) {
            // It's actually a cue sheet
            return { ...spot, type: 'cuesheet' };
          } else {
            // It's a spot (folder)
            const subFolder = {
              id: spot.id,
              type: 'folder',
              name: spot.name,
              children: [],
              createdAt: spot.createdAt
            };
            if (spot.children) {
              subFolder.children = spot.children.map(cue => ({
                ...cue,
                type: 'cuesheet'
              }));
            }
            return subFolder;
          }
        });
      }
      
      return folder;
    });
    
    console.log('[ProjectStore] Migration complete. Migrated', items.length, 'items');
    
    return {
      version: 2,
      items,
      activeItemId: state.activeProjectId || null,
      lastModified: state.lastModified
    };
  }
  
  // Unknown structure, return default
  return { ...defaultState };
}

// Save projects to disk
function saveProjects(state) {
  try {
    const storePath = getStorePath();
    state.lastModified = new Date().toISOString();
    fs.writeFileSync(storePath, JSON.stringify(state, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving projects:', error);
    return false;
  }
}

// Generate unique ID
function generateId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Find item by ID in nested structure
function findItemById(items, id) {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findItemById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

// Find parent of an item
function findParentById(items, id, parent = null) {
  for (const item of items) {
    if (item.id === id) return parent;
    if (item.children) {
      const found = findParentById(item.children, id, item);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

// Create a new folder
function createFolder(parentId = null, name = 'New Folder') {
  const state = loadProjects();
  const newFolder = {
    id: generateId('folder'),
    type: 'folder',
    name,
    children: [],
    createdAt: new Date().toISOString()
  };
  
  if (parentId) {
    const parent = findItemById(state.items, parentId);
    if (parent && parent.type === 'folder') {
      if (!parent.children) parent.children = [];
      parent.children.push(newFolder);
    } else {
      // Parent not found or not a folder, add to root
      state.items.push(newFolder);
    }
  } else {
    // Add to root
    state.items.push(newFolder);
  }
  
  saveProjects(state);
  return newFolder;
}

// Create a new cue sheet
function createCueSheet(parentId = null, name = 'New Cue Sheet', data = {}) {
  const state = loadProjects();
  const newCueSheet = {
    id: generateId('cue'),
    type: 'cuesheet',
    name,
    filePath: data.filePath || null,
    cues: data.cues || [],
    projectInfo: data.projectInfo || {
      project: '',
      spotTitle: name,
      type: '',
      datePrepared: new Date().toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit'
      }).replace(/\//g, '.')
    },
    createdAt: new Date().toISOString()
  };
  
  if (parentId) {
    const parent = findItemById(state.items, parentId);
    if (parent && parent.type === 'folder') {
      if (!parent.children) parent.children = [];
      parent.children.push(newCueSheet);
    } else {
      // Parent not found or not a folder, add to root
      state.items.push(newCueSheet);
    }
  } else {
    // Add to root
    state.items.push(newCueSheet);
  }
  
  saveProjects(state);
  return newCueSheet;
}

// Rename an item
function renameItem(id, newName) {
  const state = loadProjects();
  const item = findItemById(state.items, id);
  
  if (item) {
    item.name = newName;
    saveProjects(state);
    return item;
  }
  return null;
}

// Delete an item
function deleteItem(id) {
  const state = loadProjects();
  
  // Check if it's a root-level item
  const rootIndex = state.items.findIndex(i => i.id === id);
  if (rootIndex !== -1) {
    state.items.splice(rootIndex, 1);
    saveProjects(state);
    return true;
  }
  
  // Otherwise find parent and remove from children
  const parent = findParentById(state.items, id);
  if (parent && parent.children) {
    const index = parent.children.findIndex(c => c.id === id);
    if (index !== -1) {
      parent.children.splice(index, 1);
      saveProjects(state);
      return true;
    }
  }
  
  return false;
}

// Move an item to a new parent (or to root if parentId is null)
function moveItem(itemId, newParentId = null) {
  const state = loadProjects();
  const item = findItemById(state.items, itemId);
  if (!item) return null;
  
  // Remove from current location
  const currentParent = findParentById(state.items, itemId);
  if (currentParent && currentParent.children) {
    const index = currentParent.children.findIndex(c => c.id === itemId);
    if (index !== -1) {
      currentParent.children.splice(index, 1);
    }
  } else {
    // It's at root level
    const index = state.items.findIndex(i => i.id === itemId);
    if (index !== -1) {
      state.items.splice(index, 1);
    }
  }
  
  // Add to new location
  if (newParentId) {
    const newParent = findItemById(state.items, newParentId);
    if (newParent && newParent.type === 'folder') {
      if (!newParent.children) newParent.children = [];
      newParent.children.push(item);
    } else {
      // New parent not found or not a folder, add to root
      state.items.push(item);
    }
  } else {
    // Move to root
    state.items.push(item);
  }
  
  saveProjects(state);
  return item;
}

// Duplicate an item (folder or cue sheet)
function duplicateItem(id) {
  const state = loadProjects();
  const item = findItemById(state.items, id);
  if (!item) return null;
  
  // Deep clone the item with new IDs
  const cloneItem = (original) => {
    const clone = {
      ...original,
      id: generateId(original.type === 'folder' ? 'folder' : 'cue'),
      name: `${original.name} copy`,
      createdAt: new Date().toISOString()
    };
    
    if (original.children) {
      clone.children = original.children.map(child => cloneItem(child));
    }
    
    // Deep clone cues array if present
    if (original.cues) {
      clone.cues = JSON.parse(JSON.stringify(original.cues));
    }
    
    // Deep clone projectInfo if present
    if (original.projectInfo) {
      clone.projectInfo = { ...original.projectInfo };
    }
    
    return clone;
  };
  
  const duplicate = cloneItem(item);
  
  // Find parent to add duplicate next to original
  const parent = findParentById(state.items, id);
  if (parent && parent.children) {
    const index = parent.children.findIndex(c => c.id === id);
    parent.children.splice(index + 1, 0, duplicate);
  } else {
    // Root level
    const index = state.items.findIndex(i => i.id === id);
    state.items.splice(index + 1, 0, duplicate);
  }
  
  saveProjects(state);
  return duplicate;
}

// Update cue sheet data
function updateCueSheet(id, updates) {
  const state = loadProjects();
  const cueSheet = findItemById(state.items, id);
  
  if (cueSheet && cueSheet.type === 'cuesheet') {
    Object.assign(cueSheet, updates, { updatedAt: new Date().toISOString() });
    saveProjects(state);
    return cueSheet;
  }
  return null;
}

// Get a specific cue sheet
function getCueSheet(id) {
  const state = loadProjects();
  const item = findItemById(state.items, id);
  return (item && item.type === 'cuesheet') ? item : null;
}

// Get the parent folder name for an item
function getParentFolderName(id) {
  const state = loadProjects();
  const parent = findParentById(state.items, id);
  return parent?.name || null;
}

// Get all items (the whole tree)
function getAllProjects() {
  const state = loadProjects();
  return state.items;
}

// Set active item
function setActiveItem(id) {
  const state = loadProjects();
  state.activeItemId = id;
  saveProjects(state);
  return id;
}

// Get active item ID
function getActiveItemId() {
  const state = loadProjects();
  return state.activeItemId;
}

// Import a .prproj file as a new cue sheet (at root level by default)
function importPrprojAsCueSheet(parentId = null, prprojData) {
  // Create the cue sheet directly (at root or in specified folder)
  const cueSheet = createCueSheet(parentId, prprojData.projectName, {
    filePath: prprojData.filePath,
    cues: prprojData.audioClips,
    projectInfo: {
      project: '',
      spotTitle: prprojData.spotTitle || prprojData.projectName,
      type: '',
      datePrepared: new Date().toLocaleDateString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: '2-digit'
      }).replace(/\//g, '.')
    }
  });
  
  return {
    cueSheetId: cueSheet.id,
    cueSheet
  };
}

// Legacy compatibility - these now just call the new functions
function createProject(name) {
  return createFolder(null, name);
}

function createSpot(parentId, name) {
  return createFolder(parentId, name);
}

// Get the full state object (for ACS export)
function getState() {
  return loadProjects();
}

// Clear all projects (for ACS new project)
function clearAll() {
  const state = { ...defaultState };
  saveProjects(state);
  return state;
}

// Load state from ACS file data
function loadFromACS(acsData) {
  const state = {
    version: 2,
    name: acsData.name || 'Untitled Project',
    items: acsData.items || [],
    activeItemId: acsData.activeItemId || null,
    createdAt: acsData.createdAt,
    lastModified: new Date().toISOString()
  };
  saveProjects(state);
  return state;
}

// Set project name
function setProjectName(name) {
  const state = loadProjects();
  state.name = name;
  saveProjects(state);
  return state;
}

module.exports = {
  loadProjects,
  saveProjects,
  createFolder,
  createCueSheet,
  createProject, // Legacy
  createSpot, // Legacy
  renameItem,
  deleteItem,
  moveItem,
  duplicateItem,
  updateCueSheet,
  getCueSheet,
  getParentFolderName,
  getAllProjects,
  setActiveItem,
  getActiveItemId,
  importPrprojAsCueSheet,
  findItemById,
  // ACS integration
  getState,
  clearAll,
  loadFromACS,
  setProjectName
};
