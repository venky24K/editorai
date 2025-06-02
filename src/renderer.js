const path = require('path');

// Global state
let currentFolder = null;

// Ensure window.openFiles is initialized
if (!window.openFiles) {
  window.openFiles = new Map(); // Map<filePath, {content: string, originalContent: string, status: 'deleted' | 'added' | 'modified' | null}>
}

// Log the current window state
console.log('[RENDERER] Renderer script loaded');
console.log('[RENDERER] Window properties:', {
  electronAPI: !!window.electronAPI,
  electronAPIMethods: window.electronAPI ? Object.keys(window.electronAPI) : 'undefined',
  nodeProcess: typeof process !== 'undefined' ? 'available' : 'unavailable',
  nodeVersion: typeof process !== 'undefined' ? process.versions.node : 'unavailable',
  chromeVersion: typeof process !== 'undefined' ? process.versions.chrome : 'unavailable',
  electronVersion: typeof process !== 'undefined' ? process.versions.electron : 'unavailable'
});

// Ensure electronAPI is available
if (!window.electronAPI) {
  const errorMsg = 'electronAPI not found on window object. This is likely a preload script issue.';
  console.error('[RENDERER]', errorMsg);
  console.error('[RENDERER] Available window properties:', Object.keys(window).filter(k => !k.startsWith('_')));
  
  // Create a minimal fallback
  window.electronAPI = {
    // Add a method to help diagnose the issue
    getDiagnostics: () => ({
      timestamp: new Date().toISOString(),
      electronAPIAvailable: false,
      windowKeys: Object.keys(window).filter(k => !k.startsWith('_')),
      location: window.location.href,
      userAgent: navigator.userAgent
    }),
    // Add stubs for required methods
    readFile: () => Promise.reject(new Error('electronAPI not available')),
    saveFile: () => Promise.reject(new Error('electronAPI not available')),
    openFolderDialog: () => Promise.reject(new Error('electronAPI not available')),
    readDirectory: () => Promise.reject(new Error('electronAPI not available'))
  };
  
  // Show an error message to the user
  setTimeout(() => {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #ff4444;
      color: white;
      padding: 15px;
      border-radius: 5px;
      max-width: 400px;
      z-index: 10000;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    `;
    errorDiv.innerHTML = `
      <h3 style="margin: 0 0 10px 0;">Electron Integration Error</h3>
      <p style="margin: 0 0 10px 0;">The application is not properly integrated with Electron.</p>
      <p style="margin: 0 0 10px 0; font-size: 12px;">${errorMsg}</p>
      <button onclick="this.parentNode.remove()" style="background: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer;">Dismiss</button>
    `;
    document.body.appendChild(errorDiv);
  }, 1000);
}

// Ensure editorAPI is available
if (!window.editorAPI) {
  console.error('Editor API is not available');
  window.editorAPI = {
    initializeEditor: () => Promise.resolve({ success: true }),
    openFile: () => Promise.resolve({ success: false, error: 'Editor not available' }),
    saveEditor: () => '',
    // Add other required methods
  };
}

// Function to update file status based on changes
function updateFileStatus(filePath, newContent) {
  const fileInfo = window.openFiles.get(filePath);
  if (!fileInfo) return;

  const originalLines = fileInfo.originalContent.split('\n');
  const newLines = newContent.split('\n');
  
  // Compare line counts
  if (newLines.length < originalLines.length) {
    fileInfo.status = 'deleted';
  } else if (newLines.length > originalLines.length) {
    fileInfo.status = 'added';
  } else {
    // Check for modifications
    const hasModifications = newLines.some((line, i) => line !== originalLines[i]);
    fileInfo.status = hasModifications ? 'modified' : null;
  }
  
  fileInfo.content = newContent;
  updateFileTreeStatus(filePath, fileInfo.status);
}

// Function to update file tree status indicators
function updateFileTreeStatus(filePath, status) {
  const treeItem = document.querySelector(`.tree-item[data-path="${filePath}"]`);
  if (!treeItem) return;

  // Remove existing status indicators and status element
  treeItem.classList.remove('status-deleted', 'status-added', 'status-modified');
  let statusEl = treeItem.querySelector('.file-status');
  
  // Add or update status indicator
  if (status) {
    treeItem.classList.add(`status-${status}`);
    
    // Create status element if it doesn't exist
    if (!statusEl) {
      statusEl = document.createElement('span');
      statusEl.className = 'file-status';
      const content = treeItem.querySelector('.item-content');
      if (content.firstChild) {
        content.insertBefore(statusEl, content.firstChild);
      } else {
        content.appendChild(statusEl);
      }
    }
    
    // Update status class
    statusEl.className = 'file-status';
    statusEl.classList.add(status);
  } else if (statusEl) {
    // Remove status indicator if no status
    statusEl.remove();
  }
}

// Function to open a file in the editor
async function openFileInEditor(filePath) {
  try {
    console.log('[DEBUG] openFileInEditor called with path:', filePath);
    
    if (!filePath) {
      console.error('[ERROR] No file path provided to openFileInEditor');
      return { success: false, error: 'No file path provided' };
    }
    
    // Check if window.electronAPI exists
    if (!window.electronAPI) {
      console.error('[ERROR] window.electronAPI is not available');
      return { success: false, error: 'Electron API not available' };
    }
    
    console.log('[DEBUG] Reading file content...');
    let content;
    try {
      content = await window.electronAPI.readFile(filePath);
      console.log(`[DEBUG] File content read successfully, length: ${content ? content.length : 0}`);
    } catch (readError) {
      console.error('[ERROR] Error reading file:', readError);
      return { success: false, error: `Failed to read file: ${readError.message}` };
    }
    
    // Check if editorAPI is available
    if (!window.editorAPI) {
      console.error('[ERROR] window.editorAPI is not available');
      return { success: false, error: 'Editor API not available' };
    }
    
    console.log('[DEBUG] Initializing editor...');
    try {
      await window.editorAPI.initializeEditor();
      console.log('[DEBUG] Editor initialized successfully');
    } catch (initError) {
      console.error('[ERROR] Error initializing editor:', initError);
      return { success: false, error: `Editor initialization failed: ${initError.message}` };
    }
    
    console.log('[DEBUG] Opening file in editor...');
    try {
      const result = await window.editorAPI.openFile(filePath, content || '');
      console.log('[DEBUG] openFile result:', result);
      
      if (result && result.success) {
        console.log(`[DEBUG] Successfully opened file: ${filePath}`);
        
        // Update active file path
        window.activeFilePath = filePath;
        
        // Update file status
        const fileInfo = {
          content: content || '',
          originalContent: content || '',
          status: null
        };
        
        window.openFiles.set(filePath, fileInfo);
        updateFileTreeStatus(filePath, null);
        updateActiveTab(filePath);
        
        console.log('[DEBUG] File state updated successfully');
        return { success: true };
      } else {
        const errorMsg = result?.error || 'Failed to open file in editor';
        console.error('[ERROR] Error opening file in editor:', errorMsg);
        return { success: false, error: errorMsg };
      }
    } catch (openError) {
      console.error('[ERROR] Error in editorAPI.openFile:', openError);
      return { success: false, error: `Editor error: ${openError.message}` };
    }
  } catch (error) {
    console.error('[ERROR] Unhandled error in openFileInEditor:', error);
    return { success: false, error: `Unexpected error: ${error.message}` };
  }
}

// Function to save a single file
async function saveFile(filePath) {
  try {
    console.log(`Saving file: ${filePath}`);
    
    // Get the current content from the editor
    const content = window.editorAPI.saveEditor(filePath);
    if (content === null) {
      console.error('No editor found for file:', filePath);
      return { success: false, error: 'No editor found' };
    }
    
    // Save the file
    const result = await window.electronAPI.saveFile({ filePath, content });
    if (result) {
      console.log('File saved successfully:', filePath);
      
      // Update file status
      if (window.openFiles.has(filePath)) {
        const fileInfo = window.openFiles.get(filePath);
        fileInfo.originalContent = content;
        fileInfo.status = null;
        updateFileTreeStatus(filePath, null);
      }
      
      return { success: true };
    } else {
      console.error('Failed to save file:', filePath);
      return { success: false, error: 'Failed to save file' };
    }
  } catch (error) {
    console.error('Error saving file:', error);
    return { success: false, error: error.message };
  }
}

// Function to save all modified files
async function saveAllFiles() {
  try {
    if (!window.openFiles) return;
    
    const savePromises = [];
    
    // Find all modified files and save them
    for (const [filePath, fileInfo] of window.openFiles.entries()) {
      if (fileInfo.status === 'modified') {
        savePromises.push(saveFile(filePath));
      }
    }
    
    if (savePromises.length === 0) {
      console.log('No modified files to save');
      return;
    }
    
    await Promise.all(savePromises);
    console.log('All files saved successfully');
  } catch (error) {
    console.error('Error saving all files:', error);
    throw error; // Re-throw to be handled by the caller
  }
}

// Function to update UI based on folder selection
function updateUI(folderPath) {
  console.log('Updating UI with folder path:', folderPath);
  
  const folderNameElement = document.getElementById('folderName');
  const welcomeButtons = document.getElementById('welcomeButtons');
  const sidebarContent = document.querySelector('.sidebar-content');
  const folderTree = document.querySelector('.folder-tree');

  console.log('UI Elements:', { folderNameElement, welcomeButtons, sidebarContent, folderTree });

  if (folderPath) {
    // Update folder name
    const folderName = folderPath.split(/[\\/]/).pop(); // Handle both forward and backslashes
    folderNameElement.textContent = folderName || 'Root';
    folderNameElement.title = folderPath; // Show full path on hover
    folderNameElement.setAttribute('data-path', folderPath);
    
    // Hide welcome buttons and show file tree
    console.log('Hiding welcome buttons and showing file tree');
    if (welcomeButtons) {
      console.log('Adding hidden class to welcome buttons');
      welcomeButtons.classList.add('hidden');
    }
    if (sidebarContent) {
      console.log('Setting sidebar content to flex');
      sidebarContent.style.display = 'flex';
    }
    if (folderTree) {
      console.log('Setting folder tree to block');
      folderTree.style.display = 'block';
    }
  } else {
    console.log('No folder path provided, showing welcome screen');
    folderNameElement.textContent = 'No folder opened';
    folderNameElement.title = '';
    folderNameElement.removeAttribute('data-path');
    
    // Show welcome buttons and hide file tree
    console.log('Showing welcome buttons and hiding file tree');
    if (welcomeButtons) {
      console.log('Removing hidden class from welcome buttons');
      welcomeButtons.classList.remove('hidden');
    }
    if (sidebarContent) {
      console.log('Hiding sidebar content');
      sidebarContent.style.display = 'none';
    }
    if (folderTree) {
      console.log('Hiding folder tree');
      folderTree.style.display = 'none';
    }
  }
  
  console.log('UI update complete');
}

// Function to create a file/folder tree item
function createTreeItem(item) {
  const itemDiv = document.createElement('div');
  itemDiv.className = `tree-item ${item.type}`;
  itemDiv.setAttribute('data-path', item.path);
  
  const itemContent = document.createElement('div');
  itemContent.className = 'tree-item-content';
  
  // Create content wrapper for icon and name
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'item-content';
  
  // Add icon
  const icon = document.createElement('span');
  icon.className = 'item-icon';
  icon.innerHTML = item.type === 'directory' 
    ? '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M14 4H8L6 2H2L1 3v10l1 1h12l1-1V5l-1-1zM13 13H3V4h2.4l2 2H13v7z"/></svg>'
    : '<svg width="16" height="16" viewBox="0 0 16 16"><path fill="currentColor" d="M13 4H7L5 2H3L2 3v10l1 1h10l1-1V5l-1-1zM3 4h1.3l2 2H13v6H3V4z"/></svg>';
  
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = item.name;
  
  // Build the item structure
  contentWrapper.appendChild(icon);
  contentWrapper.appendChild(name);
  itemContent.appendChild(contentWrapper);
  itemDiv.appendChild(itemContent);
  
  // Add click handler for files
  if (item.type === 'file') {
    itemContent.addEventListener('click', async () => {
      try {
        console.log('File clicked:', item.path);
        
        // Check if editor API is available
        if (!window.editorAPI) {
          console.error('Editor API not available');
          return;
        }
        
        // Ensure editor is ready
        console.log('Checking if editor is ready...');
        const editorReady = await window.editorAPI.initializeEditor();
        if (!editorReady || !editorReady.success) {
          console.error('Editor not ready');
          return;
        }
        
        console.log('Editor is ready, checking if file is already open...');
        
        // Initialize openFiles map if it doesn't exist
        if (!window.openFiles) {
          window.openFiles = new Map();
        }
        
        // Check if file is already open
        if (window.openFiles.has(item.path)) {
          console.log('File already open, switching to it');
          const fileInfo = window.openFiles.get(item.path);
          const result = await window.editorAPI.openFile(item.path, fileInfo.content);
          
          if (result && result.success) {
            console.log('Successfully switched to file');
            updateActiveTab(item.path);
            updateFileTreeStatus(item.path, fileInfo.status);
          } else {
            console.error('Failed to switch to file:', result?.error || 'Unknown error');
          }
          return;
        }

        console.log('Reading file content...');
        // Read file content
        const content = await window.electronAPI.readFile(item.path);
        
        // Update open files tracking
        window.openFiles.set(item.path, {
          content,
          originalContent: content,
          status: null
        });

        console.log('Opening file in editor...');
        // Open file in editor
        const result = await window.editorAPI.openFile(item.path, content);
        if (result && result.success) {
          console.log('File opened successfully');
          // Update UI
          updateActiveTab(item.path);
          updateFileTreeStatus(item.path, null);
        } else {
          console.error('Failed to open file in editor:', result?.error || 'Unknown error');
          // Clean up if opening failed
          window.openFiles.delete(item.path);
        }
      } catch (error) {
        console.error('Error opening file:', error);
      }
    });
  }
  
  if (item.type === 'directory' && item.children) {
    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'tree-children';
    childrenContainer.style.display = 'none';
    
    item.children.forEach(child => {
      childrenContainer.appendChild(createTreeItem(child));
    });
    
    itemDiv.appendChild(childrenContainer);
    
    // Add click handler to toggle children
    itemContent.addEventListener('click', () => {
      const isExpanded = childrenContainer.style.display !== 'none';
      childrenContainer.style.display = isExpanded ? 'none' : 'block';
      itemDiv.classList.toggle('expanded', !isExpanded);
    });
  }
  
  return itemDiv;
}

// Function to display the file tree
function displayFileTree(contents) {
  const treeContainer = document.querySelector('.folder-tree');
  treeContainer.innerHTML = '';
  
  contents.forEach(item => {
    treeContainer.appendChild(createTreeItem(item));
  });
}

// Event handlers
async function handleOpenFolder(event) {
  console.log('=== [Open Folder] Starting handleOpenFolder ===', { event });
  
  try {
    // Log the current state
    console.log('[1/8] Checking environment...', { 
      windowExists: typeof window !== 'undefined',
      documentReadyState: document.readyState,
      electronAPI: !!window.electronAPI,
      electronAPIMethods: window.electronAPI ? Object.keys(window.electronAPI) : 'N/A',
      openFolderDialogExists: window.electronAPI?.openFolderDialog ? 'function' : 'missing'
    });
    
    if (!window.electronAPI) {
      const error = new Error('window.electronAPI is not available');
      console.error('Error:', error, {
        windowKeys: Object.keys(window).filter(k => !k.startsWith('_')),
        documentScripts: Array.from(document.scripts).map(s => s.src)
      });
      alert('Electron API is not available. Please make sure you are running this in an Electron environment.');
      throw error;
    }
    
    console.log('[2/8] Electron API available, checking methods...');
    
    if (typeof window.electronAPI.openFolderDialog !== 'function') {
      const error = new Error('openFolderDialog is not a function');
      console.error('Error:', error, { 
        electronAPIMethods: Object.keys(window.electronAPI),
        electronAPIType: typeof window.electronAPI,
        openFolderDialogType: typeof window.electronAPI.openFolderDialog
      });
      alert('Open folder functionality is not available. The application may not be properly initialized.');
      throw error;
    }
    
    console.log('[3/8] Opening folder dialog...');
    const result = await window.electronAPI.openFolderDialog({
      title: 'Open Folder',
      buttonLabel: 'Open',
      properties: ['openDirectory', 'createDirectory']
    });
    
    console.log('[4/6] Dialog result:', result);
    
    if (!result || !result.path) {
      console.log('No folder selected or dialog was cancelled');
      return;
    }
    
    console.log(`[5/6] Folder selected: ${result.path}`);
    currentFolder = result.path;
    
    // Show loading state
    const appElement = document.getElementById('app');
    const welcomeScreen = document.getElementById('welcome-screen');
    if (appElement && welcomeScreen) {
      appElement.style.display = 'flex';
      welcomeScreen.style.display = 'none';
    }
    
    try {
      console.log('[6/6] Reading directory contents...');
      const contents = await window.electronAPI.readDirectory(result.path);
      console.log(`Found ${contents.length} items in directory`);
      
      await displayFileTree(contents);
      updateUI(result.path);
      
      console.log('=== [Open Folder] Completed successfully ===');
    } catch (readError) {
      console.error('Error reading directory:', readError);
      alert(`Error reading folder contents: ${readError.message}`);
    }
  } catch (error) {
    console.error('=== [Open Folder] Error ===');
    console.error('Error details:', error);
    
    // More detailed error messages
    if (error.message.includes('permission')) {
      alert('Permission denied. Please check folder permissions.');
    } else if (error.message.includes('ENOENT')) {
      alert('The specified folder does not exist.');
    } else {
      alert(`Error opening folder: ${error.message}`);
    }
  }

async function handleNewFolder() {
  try {
    console.log('[New Folder] Button clicked, opening new folder dialog...');
    
    if (!window.electronAPI || typeof window.electronAPI.newFolderDialog !== 'function') {
      throw new Error('electronAPI.newFolderDialog is not available');
    }
    
    const result = await window.electronAPI.newFolderDialog();
    console.log('[New Folder] Dialog result:', result);
    
    if (result && result.path) {
      console.log(`[New Folder] New folder created at: ${result.path}`);
      currentFolder = result.path;
      
      if (result.contents) {
        await displayFileTree(result.contents);
      } else {
        console.warn('[New Folder] No contents received with new folder');
      }
      
      updateUI(result.path);
      console.log('[New Folder] UI updated with new folder');
    } else {
      console.log('[New Folder] Dialog was cancelled');
    }
  } catch (error) {
    console.error('[New Folder] Error:', error);
    // Optionally show an error message to the user
    alert(`Error creating project: ${error.message}`);
  }
}

// Function to handle creating a new file
async function handleNewFile() {
  if (!currentFolder) {
    console.log('[New File] No folder is open');
    alert('Please open a folder first');
    return;
  }

  try {
    console.log('[New File] Opening file creation dialog...');
    
    // Prompt user for file name
    const fileName = prompt('Enter file name (e.g., index.js):');
    if (!fileName) {
      console.log('[New File] File creation cancelled');
      return;
    }

    const filePath = path.join(currentFolder, fileName);
    
    // Check if file already exists
    try {
      await window.electronAPI.accessFile(filePath);
      alert('A file with this name already exists');
      return;
    } catch (error) {
      // File doesn't exist, continue with creation
    }

    console.log(`[New File] Creating file at: ${filePath}`);
    
    // Create empty file
    await window.electronAPI.writeFile(filePath, '');
    
    // Refresh the file tree
    const contents = await window.electronAPI.readDirectory(currentFolder);
    await displayFileTree(contents);
    
    // Open the new file in the editor
    await openFileInEditor(filePath);
    
    console.log('[New File] File created and opened successfully');
  } catch (error) {
    console.error('[New File] Error:', error);
    alert(`Error creating file: ${error.message}`);
  }
}

// Function to handle creating a new project
async function handleNewProject() {
  try {
    console.log('[New Project] Opening project creation dialog...');
    
    // First, get the parent directory for the new project
    const parentResult = await window.electronAPI.openFolderDialog({
      title: 'Select Parent Directory',
      buttonLabel: 'Select',
      properties: ['openDirectory', 'createDirectory']
    });
    
    if (!parentResult || !parentResult.path) {
      console.log('[New Project] Project creation cancelled - no parent directory selected');
      return;
    }
    
    // Prompt for project name
    const projectName = prompt('Enter project name:');
    if (!projectName) {
      console.log('[New Project] Project creation cancelled - no project name provided');
      return;
    }
    
    const projectPath = path.join(parentResult.path, projectName);
    
    // Check if project directory already exists
    try {
      await window.electronAPI.accessFile(projectPath);
      alert('A project with this name already exists');
      return;
    } catch (error) {
      // Directory doesn't exist, continue with creation
    }
    
    console.log(`[New Project] Creating project at: ${projectPath}`);
    
    // Create project directory
    await window.electronAPI.mkdir(projectPath, { recursive: true });
    
    // Set as current folder
    currentFolder = projectPath;
    
    // Create a basic README.md file
    const readmePath = path.join(projectPath, 'README.md');
    const readmeContent = `# ${projectName}\n\nProject created with Editor`;
    await window.electronAPI.writeFile(readmePath, readmeContent);
    
    // Create a basic .gitignore file
    const gitignorePath = path.join(projectPath, '.gitignore');
    const gitignoreContent = `# Dependencies
node_modules/

# Environment variables
.env

# Build output
dist/
build/

# Logs
logs
*.log
npm-debug.log*

# Editor directories and files
.idea
.vscode
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?`;
    await window.electronAPI.writeFile(gitignorePath, gitignoreContent);
    
    // Create a basic package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJsonContent = JSON.stringify({
      name: projectName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      description: '',
      main: 'index.js',
      scripts: {
        start: 'electron .',
        test: 'echo \"Error: no test specified\" && exit 1'
      },
      keywords: [],
      author: '',
      license: 'ISC'
    }, null, 2);
    await window.electronAPI.writeFile(packageJsonPath, packageJsonContent);
    
    // Create a basic index.js file
    const indexPath = path.join(projectPath, 'index.js');
    const indexContent = NEW_PROJECT_TEMPLATE;
    await window.electronAPI.writeFile(indexPath, indexContent);
    
    // Create a src directory
    const srcPath = path.join(projectPath, 'src');
    await window.electronAPI.mkdir(srcPath, { recursive: true });
    
    // Refresh the file tree
    const contents = await window.electronAPI.readDirectory(projectPath);
    await displayFileTree(contents);
    
    // Update UI
    updateUI(projectPath);
    
    console.log('[New Project] Project created successfully');
    
    // Open the README.md file
    await openFileInEditor(readmePath);
  } catch (error) {
    console.error('[New Project] Error:', error);
    alert(`Error creating project: ${error.message}`);
  }
}

// Function to handle creating a new folder
async function handleNewFolder(parentPath = null) {
  const basePath = parentPath || currentFolder;
  
  if (!basePath) {
    console.log('[New Folder] No folder is open');
  try {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    // Use current folder if no parent path is provided
    const basePath = parentPath || currentFolder || process.cwd();
    const folderPath = path.join(basePath, folderName);
    
    // Check if folder already exists using readDirectory instead of accessFile
    try {
      const contents = await window.electronAPI.readDirectory(basePath);
      const folderExists = contents.some(item => 
        item.name === folderName && item.type === 'directory'
      );
      
      if (folderExists) {
        alert('A folder with this name already exists');
        return;
      }
    } catch (error) {
      console.warn('Error checking if folder exists:', error);
      // Continue with creation even if check fails
    }

    console.log(`[New Folder] Creating folder at: ${folderPath}`);
    
    // Create the folder
    await window.electronAPI.mkdir(folderPath, { recursive: true });
    
    // Refresh the file tree
    if (basePath) {
      const contents = await window.electronAPI.readDirectory(basePath);
      await displayFileTree(contents);
    }
    
    console.log('[New Folder] Folder created successfully');
    return folderPath;
  } catch (error) {
    console.error('[New Folder] Error:', error);
    const errorMessage = error.message || 'An unknown error occurred';
    alert(`Error creating folder: ${errorMessage}`);
    throw error;
  }
}

// Function to handle new folder button click (wrapper for handleNewFolder)
async function handleNewFolderClick() {
  try {
    await handleNewFolder(currentFolder);
  } catch (error) {
    console.error('Error in handleNewFolderClick:', error);
    // Error already shown in handleNewFolder
  }
}

// Single initialization point
let appInitialized = false;

// Initialize the application
async function initializeApp() {
  if (appInitialized) {
    console.log('[APP] App already initialized');
    return;
  }
  
  console.log('[APP] Initializing application...');
  
  const initApp = async () => {
    try {
      console.log('[APP] Starting initialization...');
      console.log('[APP] Document readyState:', document.readyState);
      console.log('[APP] window.electronAPI available:', !!window.electronAPI);
      
      if (window.electronAPI) {
        console.log('[APP] electronAPI methods:', Object.keys(window.electronAPI));
      }
      
      // Initialize event listeners
      initializeEventListeners();
      
      // Initialize the application
      await init();
      
      appInitialized = true;
      console.log('[APP] Application initialized successfully');
    } catch (error) {
      console.error('[APP] Error during initialization:', error);
      // Show error to user
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 10000;
      `;
      errorDiv.textContent = 'Failed to initialize application. Please check console for details.';
      document.body.appendChild(errorDiv);
      
      // Try again after a short delay
      setTimeout(() => {
        console.log('[APP] Retrying initialization...');
        initApp().catch(console.error);
      }, 1000);
    }
  };
  
  if (document.readyState === 'loading') {
    console.log('[APP] Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    console.log('[APP] DOM already loaded, initializing...');
    // Use setTimeout to ensure other scripts have loaded
    setTimeout(initApp, 100);
  }
}

// Legacy init function for backward compatibility
async function init() {
  try {
    console.log('[INIT] Initializing application components...');
    
    // Initialize event listeners
    initializeEventListeners();
    
    // Initialize terminal
    await initTerminal();
    
    // Handle command line arguments
    handleCommandLineArgs();
    
    console.log('[INIT] Application components initialized');
  } catch (error) {
    console.error('[INIT] Error initializing application components:', error);
    throw error; // Re-throw to be caught by the caller
  }
}

// Menu event handlers
if (window.electronAPI) {
  window.electronAPI.onMenuSaveAll?.(async () => {
    try {
      await saveAllFiles();
    } catch (error) {
      console.error('Error saving all files from menu:', error);
    }
  });
}

// Add keyboard shortcut for save (Ctrl+S / Cmd+S)
document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault(); // Prevent the browser's save dialog
    const activeFilePath = window.editorAPI?.getActiveFilePath();
    if (activeFilePath) {
      try {
        await saveFile(activeFilePath);
      } catch (error) {
        console.error('Error saving file with keyboard shortcut:', error);
      }
    }
  }
});

// Start the application
console.log('[APP] Starting application...');

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initializeApp().catch(console.error));
} else {
  // DOM already loaded, initialize immediately
  setTimeout(() => initializeApp().catch(console.error), 0);
}

  console.log('[APP] Initializing application...');
  
  const initApp = async () => {
    try {
      console.log('[APP] Starting initialization...');
      console.log('[APP] Document readyState:', document.readyState);
      console.log('[APP] window.electronAPI available:', !!window.electronAPI);
      
      if (window.electronAPI) {
        console.log('[APP] electronAPI methods:', Object.keys(window.electronAPI));
      }
      
      // Initialize event listeners
      initializeEventListeners();
      
      // Initialize the application
      await init();
      
      appInitialized = true;
      console.log('[APP] Initialization completed successfully');
    } catch (error) {
      console.error('[APP] Error during initialization:', error);
      
      // Show error to user
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 10px 15px;
        border-radius: 4px;
        z-index: 10000;
      `;
      errorDiv.textContent = 'Failed to initialize application. Please check console for details.';
      document.body.appendChild(errorDiv);
      
      // Try again after a short delay
      setTimeout(() => {
        console.log('[APP] Retrying initialization...');
        initApp().catch(console.error);
      }, 1000);
    }
  };
  
  if (document.readyState === 'loading') {
    console.log('[APP] Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    console.log('[APP] DOM already loaded, initializing...');
    // Use setTimeout to ensure other scripts have loaded
    setTimeout(initApp, 100);
  }
}

}
