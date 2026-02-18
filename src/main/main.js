const { app, BrowserWindow, WebContentsView, ipcMain, dialog, nativeTheme, protocol, net, shell } = require('electron');
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
const gitService = require('./git-service');
const terminalService = require('./terminal-service');
const dbExportService = require('./db-export-service');

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const largeFileManager = new LargeFileManager();

const OPTIONS_DEFAULTS = {
  editor: {
    fontSize: 14,
    fontFamily: "'Courier New', Consolas, 'Liberation Mono', monospace",
    tabSize: 4,
    insertSpaces: false,
    minimap: false,
    lineNumbers: 'on',
    wordWrap: 'off',
    cursorStyle: 'line',
    renderWhitespace: 'none',
    smoothScrolling: true,
    cursorBlinking: 'blink',
    folding: true,
    renderLineHighlight: 'all',
  },
  appearance: {
    theme: 'system',
  },
  files: {
    defaultEncoding: 'UTF-8',
    defaultLineEnding: 'LF',
    autoSave: 'off',
    autoSaveDelay: 1000,
    largeFileThreshold: 5,
  },
  tail: {
    maxLines: 100000,
  },
};

const store = new Store({
  defaults: {
    recentFiles: [],
    clipboardRing: [],
    windowBounds: { width: 1200, height: 800 },
    theme: 'system',
    snippets: [],
    dashboardLinks: [],
    options: OPTIONS_DEFAULTS,
  },
});

// One-time migration: sync legacy theme into options.appearance.theme
if (store.get('theme') && !store.has('options.appearance.theme')) {
  store.set('options.appearance.theme', store.get('theme'));
} else if (store.has('options.appearance.theme') && store.get('theme') !== store.get('options.appearance.theme')) {
  store.set('theme', store.get('options.appearance.theme'));
}

let mainWindow = null;
let currentFilePath = null; // track active file for Share menu
let isClosing = false; // re-entrancy guard for window close handler
const fileWatchers = new Map(); // filePath → chokidar watcher
const tailState = new Map(); // filePath → { watcher, offset, timer }

// Send a message to renderer and wait for a response on a paired channel (with timeout)
function invokeRenderer(channel, ...args) {
  return new Promise((resolve) => {
    const responseChannel = `${channel}-response`;
    const timeout = setTimeout(() => {
      ipcMain.removeListener(responseChannel, handler);
      resolve(null);
    }, 5000);
    const handler = (_event, result) => {
      clearTimeout(timeout);
      resolve(result);
    };
    ipcMain.once(responseChannel, handler);
    mainWindow.webContents.send(channel, ...args);
  });
}

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
      webviewTag: false, // deprecated; dashboard uses WebContentsView instead
    },
    icon: path.join(__dirname, '../../assets/icons/app-icon.png'),
  });

  mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));

  buildMenu(mainWindow, store, currentFilePath);

  mainWindow.on('resize', () => {
    const bounds = mainWindow.getBounds();
    store.set('windowBounds', { width: bounds.width, height: bounds.height });
  });

  mainWindow.on('close', async (event) => {
    if (isClosing) return;
    event.preventDefault();

    isClosing = true;
    try {
      const dirtyTabs = await invokeRenderer('main:get-dirty-tabs');
      if (!dirtyTabs || dirtyTabs.length === 0) {
        mainWindow.destroy();
        return;
      }

      for (const tab of dirtyTabs) {
        const { response } = await dialog.showMessageBox(mainWindow, {
          type: 'warning',
          title: 'Save Changes',
          message: `Save changes to ${tab.title}?`,
          buttons: ['Save', "Don't Save", 'Cancel'],
          defaultId: 0,
          cancelId: 2,
        });
        if (response === 0) { // Save
          const saved = await invokeRenderer('main:save-tab', tab.tabId);
          if (!saved) return; // save failed or timed out, abort close
        } else if (response === 2) { // Cancel
          return;
        }
      }
      mainWindow.destroy();
    } finally {
      isClosing = false;
    }
  });

  mainWindow.on('closed', () => {
    // Clean up terminal
    terminalService.kill();
    // Clean up all file watchers
    for (const watcher of fileWatchers.values()) {
      watcher.close();
    }
    fileWatchers.clear();
    // Clean up all tail watchers
    for (const tail of tailState.values()) {
      if (tail.timer) clearTimeout(tail.timer);
      tail.watcher.close();
    }
    tailState.clear();
    mainWindow = null;
  });
}

// Listen for OS theme changes and forward to renderer (registered once at module level)
nativeTheme.on('updated', () => {
  if (mainWindow && store.get('theme') === 'system') {
    mainWindow.webContents.send('main:theme-changed', 'system');
  }
});

// ── Custom Protocol for Markdown Preview Images ──
// Scoped protocol so only markdown preview can load local images (not global file: access)
protocol.registerSchemesAsPrivileged([{
  scheme: 'local-image',
  privileges: { bypassCSP: false, supportFetchAPI: true, standard: false },
}]);

app.whenReady().then(() => {
  protocol.handle('local-image', (request) => {
    const filePath = decodeURIComponent(request.url.replace('local-image://', ''));
    return net.fetch('file://' + filePath);
  });

  createWindow();
});

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

// ── Open External URLs ──

ipcMain.handle('renderer:open-external', async (_event, url) => {
  if (url && (url.startsWith('http:') || url.startsWith('https:'))) {
    await shell.openExternal(url);
  }
  return { success: true };
});

// ── Recent Files ──

function addRecentFile(filePath) {
  let recent = store.get('recentFiles', []);
  recent = recent.filter(f => f !== filePath);
  recent.unshift(filePath);
  if (recent.length > 100) recent = recent.slice(0, 100);
  store.set('recentFiles', recent);
  buildMenu(mainWindow, store, currentFilePath);
}

// ── Clipboard Ring ──

const MAX_CLIPBOARD_ENTRY_SIZE = 100 * 1024; // 100KB per entry

function addClipboardEntry(text, source) {
  if (!text || text.length > MAX_CLIPBOARD_ENTRY_SIZE) return;
  let ring = store.get('clipboardRing', []);
  // Deduplicate: remove existing entry with same text
  ring = ring.filter(entry => entry.text !== text);
  ring.unshift({ text, timestamp: Date.now(), source: source || 'Unknown' });
  if (ring.length > 100) ring = ring.slice(0, 100);
  store.set('clipboardRing', ring);
}

// ── File Watching ──

function watchFile(filePath) {
  if (fileWatchers.has(filePath)) return;

  const watcher = chokidar.watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('change', () => {
    if (mainWindow && !tailState.has(filePath)) {
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

// ── Tail (auto-follow) ──

ipcMain.handle('renderer:start-tail', async (_event, filePath) => {
  if (tailState.has(filePath)) return { success: true };

  let offset;
  try {
    const stats = await fs.promises.stat(filePath);
    offset = stats.size;
  } catch (err) {
    return { success: false, error: err.message };
  }

  const state = { offset, watcher: null, timer: null };

  const watcher = chokidar.watch(filePath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  });

  watcher.on('change', () => {
    // Throttle: batch rapid writes with 50ms debounce
    if (state.timer) return;
    state.timer = setTimeout(async () => {
      state.timer = null;
      if (!mainWindow || !tailState.has(filePath)) return;

      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.size < state.offset) {
          // File was truncated/rotated — full re-read
          state.offset = stats.size;
          const content = await fs.promises.readFile(filePath, 'utf-8');
          mainWindow.webContents.send('main:tail-reset', { filePath, data: content });
          return;
        }
        if (stats.size === state.offset) return; // no new data

        // Read only new bytes
        const chunks = [];
        const stream = fs.createReadStream(filePath, { start: state.offset, encoding: 'utf-8' });
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        const newData = chunks.join('');
        state.offset = stats.size;

        if (newData) {
          mainWindow.webContents.send('main:tail-data', { filePath, data: newData });
        }
      } catch {
        // File may have been deleted — stop tailing
      }
    }, 50);
  });

  state.watcher = watcher;
  tailState.set(filePath, state);
  return { success: true };
});

ipcMain.handle('renderer:stop-tail', async (_event, filePath) => {
  const state = tailState.get(filePath);
  if (state) {
    if (state.timer) clearTimeout(state.timer);
    state.watcher.close();
    tailState.delete(filePath);
  }
  return { success: true };
});

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
    const { isLarge, size } = await largeFileManager.isLargeFile(filePath);
    if (isLarge) {
      addRecentFile(filePath);
      files.push({
        filePath,
        filename: path.basename(filePath),
        isLargeFile: true,
        size,
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

ipcMain.handle('renderer:save-file', async (_event, { filePath, content, encoding }) => {
  // Temporarily stop watching to avoid self-triggered change events
  unwatchFile(filePath);
  try {
    await writeFile(filePath, content, encoding);
    watchFile(filePath);
    return { success: true };
  } catch (err) {
    try { watchFile(filePath); } catch {} // restore watcher safely
    return { success: false, error: err.message };
  }
});

ipcMain.handle('renderer:save-file-as', async (_event, { content, defaultPath, encoding }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'untitled.txt',
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Text Files', extensions: ['txt'] },
    ],
  });

  if (result.canceled) return null;

  await writeFile(result.filePath, content, encoding);
  addRecentFile(result.filePath);
  watchFile(result.filePath);
  return { filePath: result.filePath };
});

ipcMain.handle('renderer:get-file-stats', async (_event, filePath) => {
  try {
    const stats = await fs.promises.stat(filePath);
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

ipcMain.handle('renderer:reveal-in-finder', (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('renderer:read-file-by-path', async (_event, filePath) => {
  try {
    const { isLarge, size } = await largeFileManager.isLargeFile(filePath);
    if (isLarge) {
      addRecentFile(filePath);
      return {
        filePath,
        filename: path.basename(filePath),
        isLargeFile: true,
        size,
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

// ── Clipboard Ring ──

ipcMain.handle('renderer:clipboard-add', async (_event, { text, source }) => {
  addClipboardEntry(text, source);
  return { success: true };
});

ipcMain.handle('renderer:get-clipboard-ring', async () => {
  return store.get('clipboardRing', []);
});

ipcMain.handle('renderer:clear-clipboard-ring', async () => {
  store.set('clipboardRing', []);
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

// ── Options ──

ipcMain.handle('renderer:get-options', async () => {
  return store.get('options', OPTIONS_DEFAULTS);
});

ipcMain.handle('renderer:set-option', async (_event, { key, value }) => {
  store.set(`options.${key}`, value);
  // Keep top-level theme in sync with options.appearance.theme
  if (key === 'appearance.theme') {
    store.set('theme', value);
    if (mainWindow) {
      mainWindow.webContents.send('main:theme-changed', value);
    }
    buildMenu(mainWindow, store, currentFilePath);
  }
  return { success: true };
});

ipcMain.handle('renderer:reset-options-section', async (_event, section) => {
  const defaults = OPTIONS_DEFAULTS[section];
  if (!defaults) return null;
  store.set(`options.${section}`, { ...defaults });
  // If resetting appearance, sync theme
  if (section === 'appearance') {
    store.set('theme', defaults.theme);
    if (mainWindow) {
      mainWindow.webContents.send('main:theme-changed', defaults.theme);
    }
    buildMenu(mainWindow, store, currentFilePath);
  }
  return { ...defaults };
});

// ── Save Dialog (renderer-driven, for tab close) ──

ipcMain.handle('renderer:show-save-dialog', async (_event, fileName) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Save Changes',
    message: `Save changes to ${fileName}?`,
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  return ['save', 'discard', 'cancel'][response];
});

// ── Pick Folder (for Find in Files) ──

ipcMain.handle('renderer:pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
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

ipcMain.handle('renderer:search-in-files', async (_event, { dirPath, query, useRegex, caseSensitive, maxResults, fileFilter, maxDepth }) => {
  const results = [];
  maxResults = maxResults || 500;

  let pattern;
  try {
    const flags = caseSensitive ? 'g' : 'gi';
    pattern = useRegex ? new RegExp(query, flags) : new RegExp(escapeRegex(query), flags);
  } catch {
    return { results: [], error: 'Invalid regex' };
  }

  // Parse file filter globs (e.g. "*.js, *.ts") into a set of extensions
  let filterExts = null;
  if (fileFilter && fileFilter.trim()) {
    filterExts = new Set();
    for (const glob of fileFilter.split(',')) {
      const g = glob.trim();
      if (!g) continue;
      // Support *.ext patterns — extract the extension
      const m = g.match(/^\*\.(\S+)$/);
      if (m) {
        filterExts.add(m[1].toLowerCase());
      }
    }
    if (filterExts.size === 0) filterExts = null;
  }

  // Normalize maxDepth: null/0/undefined = unlimited
  const depthLimit = (maxDepth && maxDepth > 0) ? maxDepth : null;

  async function searchDir(dir, depth) {
    if (results.length >= maxResults) return;

    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && (depthLimit === null || depth < depthLimit)) {
          await searchDir(fullPath, depth + 1);
        }
        continue;
      }

      const ext = entry.name.split('.').pop().toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      // Apply file filter
      if (filterExts && !filterExts.has(ext)) continue;

      // Skip large files
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > 2 * 1024 * 1024) continue; // skip > 2MB
      } catch {
        continue;
      }

      let content;
      try {
        content = await fs.promises.readFile(fullPath, 'utf-8');
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

  await searchDir(dirPath, 0);
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
    pattern = useRegex ? new RegExp(query, flags) : new RegExp(escapeRegex(query), flags);
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

ipcMain.handle('renderer:read-file-force', async (_event, filePath) => {
  largeFileManager.close(filePath);
  const data = await readFile(filePath);
  addRecentFile(filePath);
  watchFile(filePath);
  return data;
});

ipcMain.handle('renderer:confirm-dialog', async (_event, message) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Continue'],
    defaultId: 0,
    message,
  });
  return response === 1;
});

// ── Git Operations ──

ipcMain.handle('renderer:git-status', async (_event, dirPath) => {
  return gitService.getStatus(dirPath);
});

ipcMain.handle('renderer:git-init', async (_event, dirPath) => {
  return gitService.init(dirPath);
});

ipcMain.handle('renderer:git-stage-all', async (_event, dirPath) => {
  return gitService.stageAll(dirPath);
});

ipcMain.handle('renderer:git-stage-file', async (_event, { dirPath, filePath }) => {
  return gitService.stageFile(dirPath, filePath);
});

ipcMain.handle('renderer:git-commit', async (_event, { dirPath, message }) => {
  return gitService.commit(dirPath, message);
});

ipcMain.handle('renderer:git-push', async (_event, dirPath) => {
  return gitService.push(dirPath);
});

ipcMain.handle('renderer:git-pull', async (_event, dirPath) => {
  return gitService.pull(dirPath);
});

ipcMain.handle('renderer:git-file-log', async (_event, { dirPath, filePath }) => {
  return gitService.fileLog(dirPath, filePath);
});

ipcMain.handle('renderer:git-file-diff', async (_event, { dirPath, hash, filePath }) => {
  return gitService.fileShow(dirPath, hash, filePath);
});

// ── Notes Panel ──

ipcMain.handle('renderer:get-notes-data', async () => {
  return store.get('notesPanel', { notes: [], activeNoteId: null, panelWidth: 250 });
});

ipcMain.handle('renderer:save-notes-data', async (_event, data) => {
  store.set('notesPanel', data);
});

ipcMain.handle('renderer:export-notes', async (_event, notes) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'notes-export.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (result.canceled) return { success: false };
  await fs.promises.writeFile(result.filePath, JSON.stringify(notes, null, 2), 'utf-8');
  return { success: true, filePath: result.filePath };
});

// ── Diagram SVG Export ──

ipcMain.handle('renderer:export-svg-file', async (_event, { svgContent, defaultPath }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'diagram.svg',
    filters: [{ name: 'SVG Files', extensions: ['svg'] }],
  });
  if (result.canceled) return { success: false };
  await fs.promises.writeFile(result.filePath, svgContent, 'utf-8');
  return { success: true, filePath: result.filePath };
});

ipcMain.handle('renderer:import-notes', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (result.canceled) return null;
  const raw = await fs.promises.readFile(result.filePaths[0], 'utf-8');
  return JSON.parse(raw);
});

// ── Captain's Log ──

ipcMain.handle('renderer:get-captains-log', async () => {
  return store.get('captainsLog', { entries: {}, panelWidth: 280, visible: false });
});

ipcMain.handle('renderer:save-captains-log', async (_event, data) => {
  store.set('captainsLog', data);
});

// ── Snippets ──

ipcMain.handle('renderer:get-snippets', async () => {
  return store.get('snippets', []);
});

ipcMain.handle('renderer:save-snippets', async (_event, snippets) => {
  store.set('snippets', snippets);
});

ipcMain.handle('renderer:export-snippets', async (_event, snippets) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'snippets-export.json',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (result.canceled) return { success: false };
  await fs.promises.writeFile(result.filePath, JSON.stringify(snippets, null, 2), 'utf-8');
  return { success: true, filePath: result.filePath };
});

ipcMain.handle('renderer:import-snippets', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (result.canceled) return null;
  const raw = await fs.promises.readFile(result.filePaths[0], 'utf-8');
  return JSON.parse(raw);
});

// ── Web Dashboard ──

ipcMain.handle('renderer:get-dashboard-links', async () => {
  return store.get('dashboardLinks', []);
});

ipcMain.handle('renderer:save-dashboard-links', async (_event, links) => {
  // Validate input: must be an array of { id, name, url } objects, max 100
  if (!Array.isArray(links) || links.length > 100) return;
  const valid = links.every(l =>
    l && typeof l.id === 'number' && typeof l.name === 'string' && typeof l.url === 'string' &&
    l.name.length <= 200 && l.url.length <= 2000
  );
  if (!valid) return;
  store.set('dashboardLinks', links);
});

// Dashboard embedded browser (WebContentsView — recommended replacement for <webview>)
const dashboardViews = new Map(); // browserId → WebContentsView

ipcMain.handle('renderer:dashboard-browser-create', async (_event, { browserId }) => {
  if (dashboardViews.has(browserId)) return;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  dashboardViews.set(browserId, view);
  mainWindow.contentView.addChildView(view);
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });

  // Allow popups for OAuth flows
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Forward navigation events to renderer
  view.webContents.on('did-navigate', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('main:dashboard-browser-navigated', {
      browserId,
      url: view.webContents.getURL(),
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward(),
    });
  });
  view.webContents.on('did-navigate-in-page', () => {
    if (!mainWindow) return;
    mainWindow.webContents.send('main:dashboard-browser-navigated', {
      browserId,
      url: view.webContents.getURL(),
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward(),
    });
  });
  view.webContents.on('page-title-updated', (_e, title) => {
    if (!mainWindow) return;
    mainWindow.webContents.send('main:dashboard-browser-title', { browserId, title });
  });
  view.webContents.on('did-fail-load', (_e, errorCode, errorDescription) => {
    if (errorCode === -3) return; // aborted
    if (!mainWindow) return;
    mainWindow.webContents.send('main:dashboard-browser-load-failed', { browserId, errorCode, errorDescription });
  });
});

ipcMain.handle('renderer:dashboard-browser-destroy', async (_event, { browserId }) => {
  const view = dashboardViews.get(browserId);
  if (!view) return;
  mainWindow.contentView.removeChildView(view);
  view.webContents.close();
  dashboardViews.delete(browserId);
});

ipcMain.handle('renderer:dashboard-browser-navigate', async (_event, { browserId, url }) => {
  const view = dashboardViews.get(browserId);
  if (view) view.webContents.loadURL(url);
});

ipcMain.handle('renderer:dashboard-browser-back', async (_event, { browserId }) => {
  const view = dashboardViews.get(browserId);
  if (view && view.webContents.canGoBack()) view.webContents.goBack();
});

ipcMain.handle('renderer:dashboard-browser-forward', async (_event, { browserId }) => {
  const view = dashboardViews.get(browserId);
  if (view && view.webContents.canGoForward()) view.webContents.goForward();
});

ipcMain.handle('renderer:dashboard-browser-reload', async (_event, { browserId }) => {
  const view = dashboardViews.get(browserId);
  if (view) view.webContents.reload();
});

ipcMain.handle('renderer:dashboard-browser-set-bounds', async (_event, { browserId, bounds }) => {
  const view = dashboardViews.get(browserId);
  if (view) view.setBounds(bounds);
});

// ── Terminal ──

ipcMain.handle('renderer:terminal-create', async (_event, { cwd }) => {
  try {
    const result = terminalService.create(
      cwd,
      (data) => { if (mainWindow) mainWindow.webContents.send('main:terminal-data', data); },
      (exitCode) => { if (mainWindow) mainWindow.webContents.send('main:terminal-exit', exitCode); },
    );
    return { success: true, pid: result.pid };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('renderer:terminal-write', (_event, data) => {
  terminalService.write(data);
});

ipcMain.on('renderer:terminal-resize', (_event, { cols, rows }) => {
  terminalService.resize(cols, rows);
});

ipcMain.handle('renderer:terminal-kill', async () => {
  terminalService.kill();
});

// ── Database Export ──

ipcMain.handle('renderer:pick-sqlite-file', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'export.db',
    filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.handle('renderer:get-sqlite-tables', async (_event, filePath) => {
  return dbExportService.getSQLiteTables(filePath);
});

ipcMain.handle('renderer:export-to-sqlite', async (_event, { filePath, tableName, columns, rows }) => {
  return dbExportService.exportToSQLite(filePath, tableName, columns, rows);
});

ipcMain.handle('renderer:export-to-mssql', async (_event, { config, tableName, columns, rows }) => {
  return dbExportService.exportToMSSQL(config, tableName, columns, rows);
});

ipcMain.handle('renderer:test-mssql-connection', async (_event, config) => {
  return dbExportService.testMSSQLConnection(config);
});

ipcMain.handle('renderer:get-last-mssql-config', async () => {
  return store.get('lastMSSQLConfig', null);
});

ipcMain.handle('renderer:save-last-mssql-config', async (_event, config) => {
  // Strip password before persisting
  const safe = { ...config };
  delete safe.password;
  store.set('lastMSSQLConfig', safe);
});
