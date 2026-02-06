const { app, BrowserWindow, ipcMain, dialog, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// macOS: disable press-and-hold accent picker so keys repeat (essential for code editors)
if (process.platform === 'darwin') {
  try {
    execSync('defaults write com.notepadclone.app ApplePressAndHoldEnabled -bool false');
    if (!app.isPackaged) {
      execSync('defaults write com.github.Electron ApplePressAndHoldEnabled -bool false');
    }
  } catch (_) { /* ignore */ }
}
const chokidar = require('chokidar');
const Store = require('electron-store');
const { buildMenu } = require('./menu');
const { readFile, writeFile, readDirectory } = require('./file-service');
const { LargeFileManager, LARGE_FILE_THRESHOLD } = require('./large-file-service');

const largeFileManager = new LargeFileManager();

const store = new Store({
  defaults: {
    recentFiles: [],
    windowBounds: { width: 1200, height: 800 },
    theme: 'system',
  },
});

let mainWindow = null;
let currentFilePath = null; // track active file for Share menu
const fileWatchers = new Map(); // filePath → chokidar watcher

function createWindow() {
  const { width, height } = store.get('windowBounds');

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 600,
    minHeight: 400,
    title: 'NotepadClone',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../../assets/icons/app-icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));

  buildMenu(mainWindow, store, currentFilePath);

  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', { width: bounds.width, height: bounds.height });
  });

  mainWindow.on('closed', () => {
    // Clean up all file watchers
    for (const watcher of fileWatchers.values()) {
      watcher.close();
    }
    fileWatchers.clear();
    mainWindow = null;
  });
}

// Listen for OS theme changes and forward to renderer (registered once at module level)
nativeTheme.on('updated', () => {
  if (mainWindow && store.get('theme') === 'system') {
    mainWindow.webContents.send('main:theme-changed', 'system');
  }
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// ── Recent Files ──

function addRecentFile(filePath) {
  let recent = store.get('recentFiles', []);
  recent = recent.filter(f => f !== filePath);
  recent.unshift(filePath);
  if (recent.length > 15) recent = recent.slice(0, 15);
  store.set('recentFiles', recent);
  buildMenu(mainWindow, store, currentFilePath);
}

// ── File Watching ──

function watchFile(filePath) {
  if (fileWatchers.has(filePath)) return;

  const watcher = chokidar.watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('change', () => {
    if (mainWindow) {
      mainWindow.webContents.send('main:file-changed', filePath);
    }
  });

  fileWatchers.set(filePath, watcher);
}

function unwatchFile(filePath) {
  const watcher = fileWatchers.get(filePath);
  if (watcher) {
    watcher.close();
    fileWatchers.delete(filePath);
  }
}

// ── IPC Handlers ──

ipcMain.handle('renderer:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt', 'log', 'md'] },
      { name: 'Source Code', extensions: ['js', 'ts', 'py', 'rb', 'java', 'c', 'cpp', 'h', 'css', 'html', 'json', 'xml', 'yaml', 'yml'] },
    ],
  });

  if (result.canceled) return null;

  const files = [];
  for (const filePath of result.filePaths) {
    // Check if large file
    if (largeFileManager.isLargeFile(filePath)) {
      const stats = fs.statSync(filePath);
      addRecentFile(filePath);
      files.push({
        filePath,
        filename: path.basename(filePath),
        isLargeFile: true,
        size: stats.size,
      });
      continue;
    }

    const data = await readFile(filePath);
    addRecentFile(filePath);
    watchFile(filePath);
    files.push(data);
  }
  return files;
});

ipcMain.handle('renderer:save-file', async (_event, { filePath, content }) => {
  // Temporarily stop watching to avoid self-triggered change events
  unwatchFile(filePath);
  await writeFile(filePath, content);
  watchFile(filePath);
  return { success: true };
});

ipcMain.handle('renderer:save-file-as', async (_event, { content, defaultPath }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'untitled.txt',
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt'] },
    ],
  });

  if (result.canceled) return null;

  await writeFile(result.filePath, content);
  addRecentFile(result.filePath);
  watchFile(result.filePath);
  return { filePath: result.filePath };
});

ipcMain.handle('renderer:get-file-stats', async (_event, filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return { size: stats.size, mtime: stats.mtimeMs };
  } catch {
    return null;
  }
});

// ── Directory reading for file explorer ──

ipcMain.handle('renderer:read-directory', async (_event, dirPath) => {
  try {
    return await readDirectory(dirPath);
  } catch {
    return [];
  }
});

ipcMain.handle('renderer:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle('renderer:read-file-by-path', async (_event, filePath) => {
  try {
    if (largeFileManager.isLargeFile(filePath)) {
      const stats = fs.statSync(filePath);
      addRecentFile(filePath);
      return {
        filePath,
        filename: path.basename(filePath),
        isLargeFile: true,
        size: stats.size,
      };
    }

    const data = await readFile(filePath);
    addRecentFile(filePath);
    watchFile(filePath);
    return data;
  } catch {
    return null;
  }
});

// ── File watching control ──

ipcMain.handle('renderer:unwatch-file', async (_event, filePath) => {
  unwatchFile(filePath);
  return { success: true };
});

ipcMain.handle('renderer:reload-file', async (_event, filePath) => {
  try {
    return await readFile(filePath);
  } catch {
    return null;
  }
});

// ── Active file tracking (for Share menu) ──

ipcMain.handle('renderer:notify-active-file', async (_event, filePath) => {
  if (filePath !== currentFilePath) {
    currentFilePath = filePath;
    buildMenu(mainWindow, store, currentFilePath);
  }
  return { success: true };
});

// ── Recent files ──

ipcMain.handle('renderer:get-recent-files', async () => {
  return store.get('recentFiles', []);
});

ipcMain.handle('renderer:clear-recent-files', async () => {
  store.set('recentFiles', []);
  buildMenu(mainWindow, store, currentFilePath);
  return { success: true };
});

// ── Theme ──

ipcMain.handle('renderer:get-theme', async () => {
  return store.get('theme', 'system');
});

ipcMain.handle('renderer:set-theme', async (_event, theme) => {
  store.set('theme', theme);
  if (mainWindow) {
    mainWindow.webContents.send('main:theme-changed', theme);
  }
  buildMenu(mainWindow, store, currentFilePath);
  return { success: true };
});

// ── Find in Files ──

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg', 'webp',
  'mp3', 'mp4', 'avi', 'mov', 'wav', 'flac',
  'zip', 'gz', 'tar', 'rar', '7z',
  'exe', 'dll', 'so', 'dylib', 'o',
  'pdf', 'doc', 'docx', 'xls', 'xlsx',
  'woff', 'woff2', 'ttf', 'eot',
  'db', 'sqlite',
]);

const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'dist', 'build', '.next', '__pycache__']);

ipcMain.handle('renderer:search-in-files', async (_event, { dirPath, query, useRegex, caseSensitive, maxResults }) => {
  const results = [];
  maxResults = maxResults || 500;

  let pattern;
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    pattern = useRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch {
    return { results: [], error: 'Invalid regex' };
  }

  function searchDir(dir) {
    if (results.length >= maxResults) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          searchDir(fullPath);
        }
        continue;
      }

      const ext = entry.name.split('.').pop().toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      // Skip large files
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 2 * 1024 * 1024) continue; // skip > 2MB
      } catch {
        continue;
      }

      let content;
      try {
        content = fs.readFileSync(fullPath, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) return;
        pattern.lastIndex = 0;
        if (pattern.test(lines[i])) {
          results.push({
            filePath: fullPath,
            line: i + 1,
            text: lines[i].trim().substring(0, 200),
          });
        }
      }
    }
  }

  searchDir(dirPath);
  return { results, truncated: results.length >= maxResults };
});

// ── Large File Handlers ──

ipcMain.handle('renderer:open-large-file', async (_event, filePath) => {
  try {
    const handle = await largeFileManager.open(filePath, (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('main:large-file-progress', { filePath, percent });
      }
    });
    return {
      filePath,
      totalLines: handle.totalLines,
      fileSize: handle.fileSize,
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('renderer:read-large-file-lines', async (_event, { filePath, startLine, endLine }) => {
  const handle = largeFileManager.get(filePath);
  if (!handle) return null;
  return handle.readLines(startLine, endLine);
});

ipcMain.handle('renderer:search-large-file', async (_event, { filePath, query, useRegex, caseSensitive }) => {
  const handle = largeFileManager.get(filePath);
  if (!handle) return { results: [], error: 'File not open' };

  let pattern;
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    pattern = useRegex ? new RegExp(query, flags) : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  } catch {
    return { results: [], error: 'Invalid regex' };
  }

  const results = [];
  await handle.search(
    pattern,
    (lineNumber, text) => {
      results.push({ line: lineNumber, text });
    },
    (percent) => {
      if (mainWindow) {
        mainWindow.webContents.send('main:large-file-search-progress', { filePath, percent });
      }
    }
  );

  return { results };
});

ipcMain.handle('renderer:close-large-file', async (_event, filePath) => {
  largeFileManager.close(filePath);
  return { success: true };
});
