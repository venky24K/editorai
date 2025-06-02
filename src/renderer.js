const path = require('path');
const { Terminal } = require('xterm');
const { FitAddon } = require('xterm-addon-fit');

// Global state
let currentFolder = null;
let terminal = null;
let terminalInitialized = false;

// Ensure window.openFiles is initialized
if (!window.openFiles) {
  window.openFiles = new Map(); // Map<filePath, {content: string, originalContent: string, status: 'deleted' | 'added' | 'modified' | null}>
}

// Ensure electronAPI is available
if (!window.electronAPI) {
  console.error('Electron API is not available');
  window.electronAPI = {
    readFile: () => Promise.reject('Electron API not available'),
    saveFile: () => Promise.reject('Electron API not available'),
    // Add other required methods
  };
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

// Initialize the terminal
async function initTerminal() {
  console.log('Initializing terminal...');
  
  if (terminalInitialized) {
    console.log('Terminal already initialized');
    return;
  }
  
  try {
    // Create terminal instance
    console.log('Creating new terminal instance...');
    terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
      theme: {
        background: '#1e1e1e',
        foreground: '#f0f0f0',
        cursor: '#f0f0f0',
        selection: 'rgba(255, 255, 255, 0.3)'
      }
    });
    console.log('Terminal instance created');

    // Add fit addon
    console.log('Adding fit addon...');
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    // Store fitAddon on the terminal instance for later use
    terminal.loadedAddons = { fitAddon };
    console.log('Fit addon added and stored');

    // Open terminal in container
    console.log('Opening terminal in container...');
    const terminalContainer = document.getElementById('terminal');
    if (!terminalContainer) {
      const error = 'Terminal container not found';
      console.error(error);
      throw new Error(error);
    }
    
    terminal.open(terminalContainer);
    console.log('Terminal opened in container');
    
    // Initialize terminal size
    console.log('Fitting terminal...');
    fitAddon.fit();
    console.log('Terminal fitted');
    
    // Set up data handler
    console.log('Setting up terminal data handlers...');
    window.electronAPI.onTerminalData((event, data) => {
      console.log('Received terminal data:', data);
      if (terminal) {
        terminal.write(data);
      }
    });
    
    // Handle terminal input
    terminal.onData(data => {
      console.log('Sending terminal input:', data);
      window.electronAPI.sendTerminalData(data);
    });
    
    // Handle terminal resize
    terminal.onResize(size => {
      console.log('Terminal resized:', size);
      window.electronAPI.resizeTerminal(size);
    });
    
    // Initialize the terminal in the main process
    try {
      console.log('Initializing terminal in main process...');
      await window.electronAPI.createTerminal();
      console.log('Terminal initialized in main process');
    } catch (error) {
      console.error('Error initializing terminal in main process:', error);
    }
    
    terminalInitialized = true;
    console.log('Terminal initialization complete');

    // Handle window resize
    window.addEventListener('resize', () => fitAddon.fit());

    // Initialize PTY
    await window.electronAPI.createPty();
    
    // Handle data from PTY
    window.electronAPI.onPtyData((event, data) => {
      terminal.write(data);
    });

    // Handle terminal input
    terminal.onData(data => {
      window.electronAPI.writeToPty(data);
    });

    // Handle terminal resize
    terminal.onResize(size => {
      window.electronAPI.resizePty({
        cols: size.cols,
        rows: size.rows
      });
    });

    terminalInitialized = true;
    console.log('Terminal initialized successfully');
  } catch (error) {
    console.error('Failed to initialize terminal:', error);
  }
}

// Toggle terminal visibility
function toggleTerminal() {
  try {
    console.log('=== toggleTerminal called ===');
    
    // Get terminal container
    const terminalContainer = document.getElementById('terminal-container');
    if (!terminalContainer) {
      console.error('❌ Terminal container not found in DOM');
      return;
    }
    
    // Check if terminal is currently visible
    const isHidden = terminalContainer.style.display === 'none' || 
                   window.getComputedStyle(terminalContainer).display === 'none';
    
    console.log(`Terminal is currently: ${isHidden ? 'hidden' : 'visible'}`);
    
    if (isHidden) {
      console.log('👁️ Showing terminal');
      terminalContainer.style.display = 'block';
      
      if (terminal) {
        console.log('🎯 Focusing terminal');
        terminal.focus();
        
        // Ensure proper rendering with a small delay
        setTimeout(() => {
          try {
            console.log('📏 Fitting terminal');
            const fitAddon = terminal.loadedAddons?.fitAddon;
            if (fitAddon) {
              fitAddon.fit();
              console.log('✅ Terminal fitted successfully');
              
              // Force a refresh of the terminal
              terminal.refresh(0, terminal.rows - 1);
              console.log('🔄 Terminal refreshed');
            } else {
              console.warn('⚠️ fitAddon not found on terminal instance');
              console.log('Terminal instance:', terminal);
            }
          } catch (error) {
            console.error('❌ Error fitting terminal:', error);
          }
        }, 100);
      } else {
        console.warn('⚠️ Terminal instance not available');
        console.log('Attempting to reinitialize terminal...');
        initTerminal().catch(err => {
          console.error('❌ Failed to reinitialize terminal:', err);
        });
      }
    } else {
      console.log('👻 Hiding terminal');
      terminalContainer.style.display = 'none';
    }
    
    console.log('=== toggleTerminal completed ===');
  } catch (error) {
    console.error('❌ Unhandled error in toggleTerminal:', error);
  }
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

// Initialize terminal when the window is fully loaded
window.addEventListener('load', () => {
  // Initialize terminal after a short delay to ensure everything is loaded
  setTimeout(() => {
    initTerminal().catch(error => {
      console.error('Failed to initialize terminal:', error);
    });
  }, 500);
});

// Listen for menu events
window.electronAPI.onMenuSaveFile(() => {
  const activeFile = window.editorAPI.getActiveFilePath();
  if (activeFile) {
    saveFile(activeFile);
  }
});

window.electronAPI.onMenuSaveAll(() => {
  saveAllFiles();
});

window.electronAPI.onMenuToggleTerminal(() => {
  toggleTerminal();
});

// Event handlers
async function handleOpenFolder() {
  console.log('=== [Open Folder] Starting handleOpenFolder ===');
  
  try {
    console.log('[1/6] Checking window.electronAPI...');
    if (!window.electronAPI) {
      const error = new Error('window.electronAPI is not available');
      console.error(error);
      throw error;
    }
    
    console.log('[2/6] Checking openFolderDialog method...');
    if (typeof window.electronAPI.openFolderDialog !== 'function') {
      const error = new Error('openFolderDialog is not a function');
      console.error(error);
      throw error;
    }
    
    console.log('[3/6] Opening folder dialog...');
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
      
      // Update terminal working directory if it's initialized
      if (terminalInitialized && terminal) {
        // Change directory in the terminal
        terminal.writeln(`\x1b[32m$ cd "${result.path}"\x1b[0m`);
        terminal.writeln('');
        
        // Focus the terminal
        terminal.focus();
      }
      
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
    alert('Please open a folder first');
    return;
  }

  try {
    console.log('[New Folder] Opening folder creation dialog...');
    
    // Prompt user for folder name
    const folderName = prompt('Enter folder name:');
    if (!folderName) {
      console.log('[New Folder] Folder creation cancelled');
      return;
    }

    const folderPath = path.join(basePath, folderName);
    
    // Check if folder already exists
    try {
      await window.electronAPI.accessFile(folderPath);
      alert('A folder with this name already exists');
      return;
    } catch (error) {
      // Folder doesn't exist, continue with creation
    }

    console.log(`[New Folder] Creating folder at: ${folderPath}`);
    
    // Create the folder
    await window.electronAPI.mkdir(folderPath, { recursive: true });
    
    // Refresh the file tree
    const contents = await window.electronAPI.readDirectory(basePath);
    await displayFileTree(contents);
    
    console.log('[New Folder] Folder created successfully');
  } catch (error) {
    console.error('[New Folder] Error:', error);
    alert(`Error creating folder: ${error.message}`);
    throw error; // Re-throw the error to propagate it up the call stack
  }
}

// Function to handle new folder button click
async function handleNewFolderClick() {
  try {
    const folderName = prompt('Enter folder name:');
    if (!folderName) return;

    const newFolderPath = path.join(currentFolder || '', folderName);
    
    // Create the folder using electronAPI
    await window.electronAPI.mkdir(newFolderPath, { recursive: true });
    console.log('Folder created successfully:', newFolderPath);
    
    // Refresh the file tree
    if (currentFolder) {
      await updateUI(currentFolder);
    }
  } catch (error) {
    console.error('Error in handleNewFolderClick:', error);
    alert(`Error creating folder: ${error.message}`);
  }
}

// Function to initialize event listeners
function initializeEventListeners() {
  console.log('[DEBUG] Initializing event listeners...');
  
  // Debug: Log the entire document to check if buttons exist
  console.log('[DEBUG] Document body:', document.body.innerHTML);
  
  // ... (rest of the function remains the same)
  // Terminal close button
  const terminalCloseBtn = document.querySelector('.terminal-close-btn');
  console.log('[DEBUG] Terminal close button:', terminalCloseBtn);
  if (terminalCloseBtn) {
    terminalCloseBtn.addEventListener('click', toggleTerminal);
    console.log('[DEBUG] Added click listener to terminal close button');
  } else {
    console.warn('[DEBUG] Terminal close button not found');
  }

  // Open Folder button
  const openFolderBtn = document.getElementById('openFolderBtn');
  console.log('[DEBUG] Open Folder button element:', openFolderBtn);
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', (e) => {
      console.log('[DEBUG] Open Folder button clicked');
      handleOpenFolder().catch(error => {
        console.error('[DEBUG] Error in Open Folder click handler:', error);
      });
    });
    console.log('[DEBUG] Open Folder button event listener added');
  } else {
    console.error('[DEBUG] Open Folder button not found!');
  }

  // New File button (in folder header)
  const newFileBtn = document.getElementById('newFileBtn');
  console.log('[DEBUG] New File button element:', newFileBtn);
  if (newFileBtn) {
    newFileBtn.addEventListener('click', (e) => {
      console.log('[DEBUG] New File button clicked');
      handleNewFile().catch(error => {
        console.error('[DEBUG] Error in New File click handler:', error);
      });
    });
    console.log('[DEBUG] New File button event listener added');
  } else {
    console.error('[DEBUG] New File button not found!');
  }

  // New Project button (in welcome section)
  const newProjectBtn = document.getElementById('newProjectBtn');
  console.log('[DEBUG] New Project button element:', newProjectBtn);
  if (newProjectBtn) {
    newProjectBtn.addEventListener('click', (e) => {
      console.log('[DEBUG] New Project button clicked');
      handleNewProject().catch(error => {
        console.error('[DEBUG] Error in New Project click handler:', error);
      });
    });
    console.log('[DEBUG] New Project button event listener added');
  } else {
    console.error('[DEBUG] New Project button not found!');
  }
  
  // New Folder button (in folder header)
  const newFolderBtn = document.getElementById('newFolderBtn');
  console.log('[DEBUG] New Folder button element:', newFolderBtn);
  if (newFolderBtn) {
    newFolderBtn.addEventListener('click', (e) => {
      console.log('[DEBUG] New Folder button clicked');
      handleNewFolder().catch(error => {
        console.error('[DEBUG] Error in New Folder click handler:', error);
      });
    });
    console.log('[DEBUG] New Folder button event listener added');
  } else {
    console.error('[DEBUG] New Folder button not found!');
  }
  
  // Debug: Check if buttons are in the DOM
  console.log('[DEBUG] All buttons in document:', document.querySelectorAll('button'));
}

// Debug: Log when DOM content is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[DEBUG] DOMContentLoaded event fired');  
  
  try {
    // Initialize event listeners
    initializeEventListeners();
    
    // Initialize the application
    await init();
    
    // Check if we're running in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log('Running in development mode');
      // Show terminal by default in development
      const terminalContainer = document.getElementById('terminal-container');
      if (terminalContainer) {
        terminalContainer.style.display = 'block';
        if (terminal) terminal.focus();
      }
    }
  } catch (error) {
    console.error('Error in DOMContentLoaded handler:', error);
  }
});

// Initialize the application
async function init() {
  try {
    // Set up event listeners
    const openFolderBtn = document.getElementById('open-folder-btn');
    const newProjectBtn = document.getElementById('new-project-btn');
    const terminalToggle = document.getElementById('terminal-toggle');
    
    if (openFolderBtn) openFolderBtn.addEventListener('click', handleOpenFolder);
    if (newProjectBtn) newProjectBtn.addEventListener('click', handleNewProject);
    if (terminalToggle) terminalToggle.addEventListener('click', toggleTerminal);
    
    // Initialize terminal
    await initTerminal();
    
    // Check for command line arguments
    const args = window.process ? window.process.argv : [];
    if (args.length > 1) {
      const folderPath = args[args.length - 1];
      if (folderPath && !folderPath.startsWith('--') && !folderPath.includes('electron')) {
        await loadFolder(folderPath);
      }
    }
    
    // Show welcome screen if no folder is loaded
    if (!currentFolder) {
      document.getElementById('welcome-screen').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
    }
  } catch (error) {
    console.error('Error during initialization:', error);
  }
}

// Also try initializing after a short delay as a fallback
setTimeout(() => {
  console.log('[DEBUG] Running delayed initialization check');
  // Check if buttons are present
  const openBtn = document.getElementById('openFolderBtn');
  const newBtn = document.getElementById('newFolderBtn');
  console.log('[DEBUG] Delayed check - Open Folder button:', openBtn);
  console.log('[DEBUG] Delayed check - New Folder button:', newBtn);
  
  // Re-initialize if buttons exist but event listeners might have failed
  if ((openBtn || newBtn) && (!openBtn?.onclick && !newBtn?.onclick)) {
    console.log('[DEBUG] Re-initializing event listeners');
    initializeEventListeners();
  }
}, 2000);

// Initial call to initialize event listeners
console.log('[DEBUG] Initial call to initializeEventListeners');
initializeEventListeners();

// Menu event handlers
window.electronAPI.onMenuNewProject(() => {
  document.getElementById('newFolderBtn')?.click();
});

window.electronAPI.onMenuOpenFolder(() => {
  document.getElementById('openFolderBtn')?.click();
});

window.electronAPI.onMenuSaveFile(async () => {
  try {
    const activeFilePath = window.editorAPI.getActiveFilePath();
    if (activeFilePath) {
      await saveFile(activeFilePath);
    } else {
      console.log('No active file to save');
    }
  } catch (error) {
    console.error('Error saving file from menu:', error);
  }
});

window.electronAPI.onMenuSaveAll(async () => {
  try {
    await saveAllFiles();
  } catch (error) {
    console.error('Error saving all files from menu:', error);
  }
});

console.log('Setting up terminal toggle handler');
window.electronAPI.onToggleTerminal((event) => {
  console.log('Received toggle-terminal event from main process');
  toggleTerminal();
});

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

// Initialize the application when the DOM is fully loaded
function initializeApp() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init().catch(error => {
        console.error('Error initializing application:', error);
      });
    });
  } else {
    init().catch(error => {
      console.error('Error initializing application:', error);
    });
  }
}

// Start the application
initializeApp();
