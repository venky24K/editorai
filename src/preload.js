const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded');

// Editor state management
let editorInstance = null;
let activeFilePath = null;
let isEditorReady = false;

// Initialize editorAPI
const editorAPI = {
  // Set the editor instance
  setEditorInstance: function(editor) {
    console.log('Setting editor instance');
    editorInstance = editor;
    return { success: true };
  },

  // Set editor ready state
  setEditorReady: function(ready) {
    console.log('Setting editor ready state:', ready);
    isEditorReady = ready;
    return { success: true };
  },

  // Initialize editor
  initializeEditor: async function() {
    console.log('Initializing editor...');
    return { success: true };
  },

  // Open a file in the editor
  openFile: async function(filePath, content) {
    console.log(`Opening file: ${filePath}`);
    
    if (!editorInstance) {
      console.error('Editor instance not available');
      return { success: false, error: 'Editor not initialized' };
    }
    
    try {
      // Set the content in our editor instance
      editorInstance.value = content || '';
      
      // Update active file path
      activeFilePath = filePath;
      
      console.log('File opened successfully');
      return { success: true };
    } catch (error) {
      console.error('Error opening file:', error);
      return { success: false, error: error.message };
    }
  },

  // Get active file path
  getActiveFilePath: function() {
    return activeFilePath;
  },

  // Save editor content
  saveEditor: async function(filePath) {
    if (!editorInstance) {
      console.error('No editor instance available');
      return { success: false, error: 'No editor instance' };
    }
    
    try {
      const content = editorInstance.value;
      await ipcRenderer.invoke('save-file', { filePath, content });
      return { success: true };
    } catch (error) {
      console.error('Error saving file:', error);
      return { success: false, error: error.message };
    }
  },

  // Error handling
  onError: function(error) {
    console.error('Editor error:', error);
  }
};

console.log('Exposing APIs to renderer process');

// Expose the APIs to the renderer process
console.log('Preload: Exposing electronAPI to renderer');

const electronAPI = {
  // Terminal related methods
  createTerminal: () => ipcRenderer.invoke('terminal:create'),
  sendTerminalData: (data) => ipcRenderer.send('terminal:write', data),
  resizeTerminal: (size) => ipcRenderer.send('terminal:resize', size),
  destroyTerminal: () => ipcRenderer.send('terminal:destroy'),
  onTerminalData: (callback) => {
    ipcRenderer.on('terminal:data', (event, data) => {
      callback(event, data);
    });
  },
  // For backward compatibility
  createPty: () => ipcRenderer.invoke('terminal:create'),
  writeToPty: (data) => ipcRenderer.send('terminal:write', data),
  resizePty: (size) => ipcRenderer.send('terminal:resize', size),
  destroyPty: () => ipcRenderer.send('terminal:destroy'),
  onPtyData: (callback) => {
    ipcRenderer.on('terminal:data', (event, data) => {
      callback(event, data);
    });
  },
  
  // Dialog handlers
  openFolderDialog: async (options = {}) => {
    console.log('[Preload] openFolderDialog called with options:', options);
    try {
      const result = await ipcRenderer.invoke('open-folder-dialog', options);
      console.log('[Preload] openFolderDialog result:', result);
      return result;
    } catch (error) {
      console.error('[Preload] Error in openFolderDialog:', error);
      throw error;
    }
  },
  
  // File system operations
  readDirectory: async (path) => {
    console.log(`[Preload] readDirectory called for path: ${path}`);
    try {
      const result = await ipcRenderer.invoke('read-directory', path);
      console.log(`[Preload] readDirectory result: ${result ? result.length : 0} items`);
      return result;
    } catch (error) {
      console.error(`[Preload] Error in readDirectory for ${path}:`, error);
      throw error;
    }
  },
  
  // Other file operations
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', { path, content }),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', { filePath, content }),
  saveAllFiles: (files) => ipcRenderer.invoke('save-all-files', files),
  mkdir: (path, options) => ipcRenderer.invoke('mkdir', { path, options }),
  accessFile: (path) => ipcRenderer.invoke('access-file', path),
  
  // Menu event handlers
  onMenuNewProject: (callback) => {
    console.log('[Preload] Setting up menu-new-project listener');
    ipcRenderer.on('menu-new-project', callback);
  },
  onMenuOpenFolder: (callback) => {
    console.log('[Preload] Setting up menu-open-folder listener');
    ipcRenderer.on('menu-open-folder', callback);
  },
  onMenuSaveFile: (callback) => ipcRenderer.on('menu-save-file', callback),
  onMenuSaveAll: (callback) => ipcRenderer.on('menu-save-all', callback),
  onToggleTerminal: (callback) => ipcRenderer.on('toggle-terminal', callback)
};

// Log all exposed methods
console.log('[Preload] Exposing electronAPI with methods:', Object.keys(electronAPI));

// Expose the API to the renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Log when the API is exposed
console.log('[Preload] electronAPI exposed to renderer');

// Expose editor API
contextBridge.exposeInMainWorld('editorAPI', editorAPI);
