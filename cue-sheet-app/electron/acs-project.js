const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// File format version
const ACS_VERSION = '1.0';

// Max number of recent projects to track
const MAX_RECENT = 10;

// Get path to recent projects file
function getRecentFilePath() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'recent-projects.json');
}

// Load recent projects list
function getRecentProjects() {
  try {
    const filePath = getRecentFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[ACS] Error loading recent projects:', err);
  }
  return [];
}

// Save recent projects list
function saveRecentProjects(projects) {
  try {
    const filePath = getRecentFilePath();
    fs.writeFileSync(filePath, JSON.stringify(projects, null, 2));
  } catch (err) {
    console.error('[ACS] Error saving recent projects:', err);
  }
}

// Add a project to recent list
function addToRecent(filePath, name) {
  const recent = getRecentProjects();
  
  // Remove if already exists
  const filtered = recent.filter(p => p.path !== filePath);
  
  // Add to front
  filtered.unshift({
    path: filePath,
    name: name || path.basename(filePath, '.acs'),
    openedAt: new Date().toISOString()
  });
  
  // Trim to max
  const trimmed = filtered.slice(0, MAX_RECENT);
  
  saveRecentProjects(trimmed);
  return trimmed;
}

// Remove a project from recent list (e.g., if file no longer exists)
function removeFromRecent(filePath) {
  const recent = getRecentProjects();
  const filtered = recent.filter(p => p.path !== filePath);
  saveRecentProjects(filtered);
  return filtered;
}

// Clear all recent projects
function clearAllRecent() {
  saveRecentProjects([]);
  return [];
}

// Save project to .acs file
function saveProject(filePath, data) {
  try {
    const projectData = {
      version: ACS_VERSION,
      name: data.name || path.basename(filePath, '.acs'),
      createdAt: data.createdAt || new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      items: data.items || [],
      activeItemId: data.activeItemId || null,
      projectFolder: data.projectFolder || path.dirname(filePath)
    };
    
    fs.writeFileSync(filePath, JSON.stringify(projectData, null, 2));
    
    // Add to recent
    addToRecent(filePath, projectData.name);
    
    console.log('[ACS] Saved project to:', filePath);
    return { success: true, path: filePath, name: projectData.name, projectFolder: projectData.projectFolder };
  } catch (err) {
    console.error('[ACS] Error saving project:', err);
    return { success: false, error: err.message };
  }
}

// Load project from .acs file
function loadProject(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }
    
    const data = fs.readFileSync(filePath, 'utf-8');
    const project = JSON.parse(data);
    
    // Validate version
    if (!project.version) {
      console.warn('[ACS] Loading project without version info');
    }
    
    // Add to recent
    addToRecent(filePath, project.name);
    
    console.log('[ACS] Loaded project from:', filePath);
    return { 
      success: true, 
      path: filePath,
      data: project 
    };
  } catch (err) {
    console.error('[ACS] Error loading project:', err);
    return { success: false, error: err.message };
  }
}

// Create new empty project
function createNewProject() {
  return {
    version: ACS_VERSION,
    name: 'Untitled Project',
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    items: [],
    activeItemId: null,
    projectFolder: null
  };
}

// Create project folder structure
function createProjectFolder(basePath, projectName) {
  try {
    const projectFolder = path.join(basePath, projectName);
    const exportsFolder = path.join(projectFolder, 'Exports');
    const importsFolder = path.join(projectFolder, 'Imports');
    const acsFilePath = path.join(projectFolder, `${projectName}.acs`);
    
    // Create directories
    if (!fs.existsSync(projectFolder)) {
      fs.mkdirSync(projectFolder, { recursive: true });
    }
    if (!fs.existsSync(exportsFolder)) {
      fs.mkdirSync(exportsFolder, { recursive: true });
    }
    if (!fs.existsSync(importsFolder)) {
      fs.mkdirSync(importsFolder, { recursive: true });
    }
    
    // Create initial .acs file
    const projectData = {
      version: ACS_VERSION,
      name: projectName,
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      items: [],
      activeItemId: null,
      projectFolder: projectFolder
    };
    
    fs.writeFileSync(acsFilePath, JSON.stringify(projectData, null, 2));
    
    // Add to recent
    addToRecent(acsFilePath, projectName);
    
    console.log('[ACS] Created project folder:', projectFolder);
    
    return {
      success: true,
      projectFolder,
      exportsFolder,
      importsFolder,
      acsFilePath,
      name: projectName,
      data: projectData
    };
  } catch (err) {
    console.error('[ACS] Error creating project folder:', err);
    return { success: false, error: err.message };
  }
}

// Get exports folder path with date subfolder
function getExportPath(projectFolder, format = 'xlsx') {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const exportsFolder = path.join(projectFolder, 'Exports', today);
  
  // Create date folder if needed
  if (!fs.existsSync(exportsFolder)) {
    fs.mkdirSync(exportsFolder, { recursive: true });
  }
  
  return exportsFolder;
}

// Copy file to Imports folder
function copyToImports(projectFolder, sourceFilePath) {
  try {
    const importsFolder = path.join(projectFolder, 'Imports');
    const fileName = path.basename(sourceFilePath);
    const destPath = path.join(importsFolder, fileName);
    
    // Create imports folder if needed
    if (!fs.existsSync(importsFolder)) {
      fs.mkdirSync(importsFolder, { recursive: true });
    }
    
    // Copy file
    fs.copyFileSync(sourceFilePath, destPath);
    
    console.log('[ACS] Copied to imports:', destPath);
    return { success: true, path: destPath };
  } catch (err) {
    console.error('[ACS] Error copying to imports:', err);
    return { success: false, error: err.message };
  }
}

// Validate recent projects (remove ones that no longer exist)
function validateRecentProjects() {
  const recent = getRecentProjects();
  const valid = recent.filter(p => {
    try {
      return fs.existsSync(p.path);
    } catch {
      return false;
    }
  });
  
  if (valid.length !== recent.length) {
    saveRecentProjects(valid);
  }
  
  return valid;
}

module.exports = {
  saveProject,
  loadProject,
  createNewProject,
  createProjectFolder,
  getExportPath,
  copyToImports,
  getRecentProjects,
  addToRecent,
  removeFromRecent,
  clearAllRecent,
  validateRecentProjects,
  ACS_VERSION
};
