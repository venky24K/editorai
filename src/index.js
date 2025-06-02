const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('node-pty');

// Terminal process management
let ptyProcess = null;

function createPty() {
  if (ptyProcess) {
    ptyProcess.kill();
  }

  const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash';
  
  ptyProcess = spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
  });

  return new Promise((resolve) => {
    // Small delay to ensure the terminal is ready
    setTimeout(() => resolve('Terminal ready'), 100);
  });
}

// Clean up terminal process on app exit
app.on('will-quit', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Create the browser window
const createWindow = () => {
  console.log('[MAIN] Creating browser window...');
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('[MAIN] Preload script path:', preloadPath);
  
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true, // Required for security
      webSecurity: true,      // Enable web security
      webviewTag: false,      // Disable webview tag for security
      enableRemoteModule: false, // Disable remote module for security
      sandbox: true,          // Enable sandbox for better security
      additionalArguments: ['--enable-logging']
    },
    backgroundColor: '#1e1e1e',
    show: false,
    title: 'Code Editor',
    icon: path.join(__dirname, 'assets/icon.png') // Optional: Add an icon
  });

  // Load the index.html of the app
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Maximize and show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Open the DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
  
  // Log when the window is ready to show
  mainWindow.once('ready-to-show', () => {
    console.log('[MAIN] Window ready to show');
  });
  
  // Log when the window is shown
  mainWindow.on('show', () => {
    console.log('[MAIN] Window shown');
  });
  
  // Log when the window is focused
  mainWindow.on('focus', () => {
    console.log('[MAIN] Window focused');
  });
  
  // Log when the window is closed
  mainWindow.on('closed', () => {
    console.log('[MAIN] Window closed');
  });
  
  // Log webContents events
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[MAIN] Window finished loading');
  });
  
  mainWindow.webContents.on('dom-ready', () => {
    console.log('[MAIN] DOM ready');
  });
  
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER:${level}] ${message} (${sourceId}:${line})`);
  });

  return mainWindow;
};

// Create application menu
function createMenu(mainWindow) {
  const isMac = process.platform === 'darwin';

  const template = [
    // App Menu (macOS)
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),

    // File Menu
    {
      label: 'File',
      submenu: [
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-new-file')
        },
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu-open-folder')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-save-file')
        },
        {
          label: 'Save All',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu-save-all')
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },

    // Edit Menu
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },

    // View Menu
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Terminal',
          accelerator: 'Ctrl+`',
          click: () => {
            console.log('Terminal toggle menu item clicked');
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              console.log('Sending toggle-terminal event to renderer');
              focusedWindow.webContents.send('toggle-terminal');
            } else {
              console.warn('No focused window to send toggle-terminal event');
            }
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },

    // Window Menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },

    // Help Menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            const { shell } = require('electron');
            await shell.openExternal('https://electronjs.org');
          }
        }
      ]
    }
  ];

  // Create the menu from the template
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App lifecycle events
app.whenReady().then(() => {
  const mainWindow = createWindow();
  createMenu(mainWindow);

  app.on('activate', () => {
    // On macOS it's common to re-create a window when the dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * Recursively reads a directory and returns its contents as a tree structure
 * @param {string} dirPath - Path to the directory to read
 * @returns {Promise<Array>} Array of file/folder objects
 */
async function readDirectoryRecursive(dirPath) {
  try {
    // Check directory accessibility
    try {
      await fs.access(dirPath, fs.constants.R_OK);
    } catch (accessError) {
      console.error(`[ERROR] Cannot access directory ${dirPath}:`, accessError);
      return [];
    }

    // Read directory contents
    let items;
    try {
      items = await fs.readdir(dirPath, { withFileTypes: true });
    } catch (readError) {
      console.error(`[ERROR] Error reading directory ${dirPath}:`, readError);
      return [];
    }
    
    const contents = [];

    // Process each item in the directory
    for (const item of items) {
      // Skip hidden files and system files
      if (item.name.startsWith('.')) continue;
      
      const fullPath = path.join(dirPath, item.name);
      
      try {
        if (item.isDirectory()) {
          // Recursively process subdirectories
          const children = await readDirectoryRecursive(fullPath);
          contents.push({
            name: item.name,
            path: fullPath,
            type: 'directory',
            children: children.sort(sortFileSystemItems)
          });
        } else if (item.isFile()) {
          // Process files
          try {
            const stats = await fs.stat(fullPath);
            contents.push({
              name: item.name,
              path: fullPath,
              type: 'file',
              size: stats.size,
              modified: stats.mtime.getTime()
            });
          } catch (statError) {
            console.warn(`[WARN] Could not get stats for ${fullPath}:`, statError);
            contents.push(createErrorFileEntry(item.name, fullPath));
          }
        }
      } catch (processError) {
        console.error(`[ERROR] Error processing ${fullPath}:`, processError);
        continue;
      }
    }
    
    return contents.sort(sortFileSystemItems);
  } catch (error) {
    console.error(`[ERROR] Unexpected error in readDirectoryRecursive for ${dirPath}:`, error);
    return [];
  }
}

/**
 * Helper function to sort file system items (directories first, then files)
 */
function sortFileSystemItems(a, b) {
  // Directories first, then files
  if (a.type === 'directory' && b.type === 'file') return -1;
  if (a.type === 'file' && b.type === 'directory') return 1;
  // Alphabetical order within same type
  return a.name.localeCompare(b.name);
}

/**
 * Creates an error file entry when file stats cannot be read
 */
function createErrorFileEntry(name, path) {
  return {
    name,
    path,
    type: 'file',
    size: 0,
    modified: 0,
    error: 'Could not read file stats'
  };
}

// Terminal IPC handlers
ipcMain.handle('terminal:create', async () => {
  try {
    console.log('Creating new terminal instance...');
    const result = await createPty();
    console.log('Terminal created successfully');
    
    // Set up data handler for terminal output
    ptyProcess.on('data', (data) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('terminal:data', data);
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error creating terminal:', error);
    throw error;
  }
});

// Handle terminal input from renderer
ipcMain.on('terminal:write', (event, data) => {
  console.log('Received terminal write:', data);
  if (ptyProcess) {
    ptyProcess.write(data);
  }
});

// Handle terminal resize
ipcMain.on('terminal:resize', (event, size) => {
  console.log('Resizing terminal to:', size);
  if (ptyProcess) {
    ptyProcess.resize(size.cols, size.rows);
  }
});

// Handle terminal cleanup
ipcMain.on('terminal:destroy', () => {
  console.log('Destroying terminal...');
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
});

ipcMain.on('terminal:destroy', () => {
  if (ptyProcess) {
    ptyProcess.kill();
    ptyProcess = null;
  }
});

// File system IPC handlers
ipcMain.handle('open-folder-dialog', async (event, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    console.error('Could not find window for webContents');
    return null;
  }
  
  try {
    console.log('Showing folder dialog with options:', options);
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: options.title || 'Open Folder',
      buttonLabel: options.buttonLabel || 'Open',
      defaultPath: options.defaultPath || require('os').homedir(),
      ...options
    });
    
    console.log('Dialog result:', result);
    
    if (result.canceled || result.filePaths.length === 0) {
      console.log('Dialog was cancelled');
      return null;
    }
    
    const folderPath = result.filePaths[0];
    console.log('Selected folder:', folderPath);
    
    // Only read contents if not in create mode
    const contents = options.skipContents ? [] : await readDirectoryRecursive(folderPath);
    console.log('Read directory contents, items:', contents.length);
    
    return { path: folderPath, contents };
  } catch (error) {
    console.error('Error in open-folder-dialog:', error);
    // Re-throw the error to be caught by the renderer
    throw error;
  }
});

ipcMain.handle('new-folder-dialog', async () => {
  try {
    const result = await dialog.showSaveDialog({
      properties: ['createDirectory'],
      title: 'Create New Folder',
      buttonLabel: 'Create Folder'
    });
    if (result.canceled) return null;
    await fs.mkdir(result.filePath, { recursive: true });
    const contents = await readDirectoryRecursive(result.filePath);
    return { path: result.filePath, contents };
  } catch (error) {
    console.error('Error in new-folder-dialog:', error);
    throw error;
  }
});

ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    if (!dirPath) throw new Error('Directory path is required');
    return await readDirectoryRecursive(dirPath);
  } catch (error) {
    console.error('Error in read-directory:', error);
    throw error;
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  console.log('[MAIN] read-file called with path:', filePath);
  
  try {
    if (!filePath) {
      const error = new Error('File path is required');
      console.error('[MAIN] Error: No file path provided');
      throw error;
    }
    
    // Check if file exists
    try {
      await fs.access(filePath, fs.constants.F_OK);
    } catch (accessError) {
      console.error(`[MAIN] File does not exist or is not accessible: ${filePath}`, accessError);
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    console.log(`[MAIN] Successfully read ${content.length} characters from file`);
    
    return content;
  } catch (error) {
    console.error('[MAIN] Error in read-file handler:', error);
    // Re-throw with additional context
    error.message = `Failed to read file '${filePath}': ${error.message}`;
    throw error;
  }
});

// Handle file write operation
ipcMain.handle('write-file', async (event, { path, content }) => {
  console.log(`[MAIN] write-file called for path: ${path}`);
  
  try {
    if (!path) {
      throw new Error('File path is required');
    }
    
    await fs.writeFile(path, content || '', 'utf-8');
    console.log(`[MAIN] Successfully wrote to file: ${path}`);
    return { success: true };
  } catch (error) {
    console.error(`[MAIN] Error writing to file ${path}:`, error);
    throw error;
  }
});

// Handle directory creation
ipcMain.handle('mkdir', async (event, { path, options = {} }) => {
  console.log(`[MAIN] mkdir called for path: ${path}`);
  
  try {
    if (!path) {
      throw new Error('Directory path is required');
    }
    
    await fs.mkdir(path, { recursive: true, ...options });
    console.log(`[MAIN] Successfully created directory: ${path}`);
    return { success: true };
  } catch (error) {
    console.error(`[MAIN] Error creating directory ${path}:`, error);
    throw error;
  }
});

// Handle file access check
ipcMain.handle('access-file', async (event, filePath) => {
  console.log(`[MAIN] access-file called for path: ${filePath}`);
  
  try {
    if (!filePath) {
      throw new Error('File path is required');
    }
    
    await fs.access(filePath, fs.constants.F_OK);
    console.log(`[MAIN] File exists: ${filePath}`);
    return { exists: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log(`[MAIN] File does not exist: ${filePath}`);
      return { exists: false };
    }
    console.error(`[MAIN] Error accessing file ${filePath}:`, error);
    throw error;
  }
});

// Handle saving a single file
ipcMain.handle('save-file', async (event, { filePath, content }) => {
  try {
    if (!filePath) throw new Error('File path is required');
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    console.error('Error in save-file:', error);
    throw error;
  }
});

// Handle saving all open files
ipcMain.handle('save-all-files', async (event, files) => {
  try {
    if (!Array.isArray(files)) throw new Error('Files must be an array');
    
    const savePromises = files.map(({ filePath, content }) => {
      if (!filePath) throw new Error('File path is required for all files');
      return fs.writeFile(filePath, content, 'utf-8');
    });
    
    await Promise.all(savePromises);
    return true;
  } catch (error) {
    console.error('Error in save-all-files:', error);
    throw error;
  }
});
