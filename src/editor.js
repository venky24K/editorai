// Editor module - Basic implementation
let activeFilePath = null;

// Initialize editor
function initializeEditor() {
  console.log('Editor initialized');
  return { success: true };
}

// Open file in editor
function openFile(filePath, content) {
  console.log(`Opening file: ${filePath}`);
  activeFilePath = filePath;
  
  // Initialize window.openFiles if it doesn't exist
  if (!window.openFiles) {
    window.openFiles = new Map();
  }
  
  // Add to open files if not already there
  if (!window.openFiles.has(filePath)) {
    window.openFiles.set(filePath, {
      content: content || '',
      originalContent: content || '',
      status: null
    });
  }
  
  // Update the active tab
  updateActiveTab(filePath);
  
  return { success: true };
}

// Close file
function closeFile(filePath) {
  console.log(`Closing file: ${filePath}`);
  
  // If this was the active file, clear it
  if (activeFilePath === filePath) {
    activeFilePath = null;
  }
  
  // Remove from open files
  if (window.openFiles?.has(filePath)) {
    window.openFiles.delete(filePath);
  }
  
  // Remove the editor tab
  removeEditorTab(filePath);
}

// Update active tab
function updateActiveTab(filePath) {
  const tabs = document.querySelectorAll('.editor-tab');
  tabs.forEach(tab => {
    if (tab.dataset.file === filePath) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

// Remove editor tab
function removeEditorTab(filePath) {
  const tab = document.querySelector(`.editor-tab[data-file="${filePath}"]`);
  if (tab) tab.remove();
}

// Get active file path
function getActiveFilePath() {
  return activeFilePath;
}

// Get editor content
function getEditorContent(filePath) {
  const fileInfo = window.openFiles?.get(filePath);
  return fileInfo?.content || '';
}

// Save editor content
async function saveEditor(filePath) {
  const fileInfo = window.openFiles?.get(filePath);
  if (fileInfo) {
    try {
      await window.electronAPI.saveFile(filePath, fileInfo.content);
      return { success: true };
    } catch (error) {
      console.error('Error saving file:', error);
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'File not found' };
}

// Export editor API
window.editorAPI = {
  initializeEditor,
  openFile,
  getActiveEditorContent: () => {
    if (!activeFilePath) return '';
    return getEditorContent(activeFilePath);
  },
  getEditorContent,
  saveEditor,
  getActiveFilePath
};
