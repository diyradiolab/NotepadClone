/**
 * Browser shim for window.api — replaces Electron IPC with browser-native APIs.
 * Must be imported before the renderer entry point.
 */

// ── File handle cache (File System Access API) ──
const fileHandles = new Map(); // pseudo-path → FileSystemFileHandle

function pseudoPath(handle) {
  return `browser:///${handle.name}`;
}

async function readHandle(handle) {
  const file = await handle.getFile();
  const content = await file.text();
  const name = handle.name;
  const filePath = pseudoPath(handle);
  fileHandles.set(filePath, handle);
  return {
    filePath,
    content,
    encoding: 'UTF-8',
    lineEnding: content.includes('\r\n') ? 'CRLF' : 'LF',
    isLargeFile: false,
  };
}

// ── localStorage helpers ──
function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

function lsSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Clipboard ring (in-memory) ──
let clipboardRing = [];
const CLIPBOARD_MAX = 20;

// ── Menu callback registry (used by web-toolbar.js) ──
// Each onMenu* stores its callback so keyboard shortcuts can trigger them.
const menuCallbacks = {};
window._npcMenuCallbacks = menuCallbacks;

function registerMenuCallback(name, callback) {
  menuCallbacks[name] = callback;
}

// ── No-op helper ──
const noop = () => {};
const noopAsync = () => Promise.resolve(null);
const unsupported = (feature) => () => Promise.resolve({ error: `${feature} is not available in the web version.` });

// ── Build window.api ──
window.api = {
  // ── File I/O (File System Access API) ──
  openFile: async () => {
    if (!window.showOpenFilePicker) {
      alert('Your browser does not support the File System Access API. Please use Chrome or Edge.');
      return null;
    }
    try {
      const handles = await window.showOpenFilePicker({ multiple: true });
      const files = [];
      for (const handle of handles) {
        files.push(await readHandle(handle));
      }
      return files;
    } catch (e) {
      if (e.name === 'AbortError') return null; // user cancelled
      throw e;
    }
  },

  saveFile: async (filePath, content, _encoding) => {
    const handle = fileHandles.get(filePath);
    if (handle) {
      try {
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    // No handle cached — fall through to Save As
    return window.api.saveFileAs(content, filePath);
  },

  saveFileAs: async (content, defaultName, _encoding) => {
    if (!window.showSaveFilePicker) {
      // Fallback: download as file
      const blob = new Blob([content], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = defaultName || 'untitled.txt';
      a.click();
      URL.revokeObjectURL(a.href);
      return { filePath: `browser:///${a.download}` };
    }
    try {
      const name = defaultName ? defaultName.split(/[/\\]/).pop() : 'untitled.txt';
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
      });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      const filePath = pseudoPath(handle);
      fileHandles.set(filePath, handle);
      return { filePath };
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
  },

  readFileByPath: async (_path) => null,

  reloadFile: async (filePath) => {
    const handle = fileHandles.get(filePath);
    if (!handle) return null;
    return readHandle(handle);
  },

  getFileStats: noopAsync,

  showSaveDialog: async (fileName) => {
    if (!window.showSaveFilePicker) return null;
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: fileName || 'untitled.txt' });
      const filePath = pseudoPath(handle);
      fileHandles.set(filePath, handle);
      return filePath;
    } catch (e) {
      if (e.name === 'AbortError') return null;
      throw e;
    }
  },

  // ── File watching (no-op in browser) ──
  unwatchFile: noop,
  onFileChanged: () => noop,

  // ── Active file tracking ──
  notifyActiveFile: noop,

  // ── External URLs ──
  openExternal: (url) => { window.open(url, '_blank'); return Promise.resolve(); },

  // ── Directory operations (unsupported) ──
  openFolder: unsupported('Folder browsing'),
  readDirectory: unsupported('Directory reading'),
  revealInFinder: noop,

  // ── Recent files (localStorage) ──
  getRecentFiles: async () => lsGet('npc-recent-files', []),
  clearRecentFiles: async () => { localStorage.removeItem('npc-recent-files'); },

  // ── Find in files (unsupported — requires filesystem) ──
  pickFolder: unsupported('Folder picking'),
  searchInFiles: unsupported('Search in files'),

  // ── Large file operations (unsupported) ──
  openLargeFile: unsupported('Large file'),
  readLargeFileLines: unsupported('Large file'),
  searchLargeFile: unsupported('Large file'),
  closeLargeFile: noop,
  readFileFull: noopAsync,
  onLargeFileProgress: () => noop,
  onLargeFileSearchProgress: () => noop,

  // ── Dialogs ──
  showConfirmDialog: async (message) => window.confirm(message),

  // ── Theme (localStorage) ──
  getTheme: async () => lsGet('npc-theme', 'system'),
  setTheme: async (theme) => { lsSet('npc-theme', theme); },
  onThemeChanged: noop,

  // ── Window close flow (no-op in browser) ──
  onGetDirtyTabs: noop,
  sendDirtyTabsResponse: noop,
  onSaveTab: noop,
  sendSaveTabResponse: noop,

  // ── Menu events (all no-op; web-toolbar.js handles shortcuts) ──
  onMenuNewFile: (cb) => registerMenuCallback('newFile', cb),
  onMenuOpenFile: (cb) => registerMenuCallback('openFile', cb),
  onMenuOpenFolder: (cb) => registerMenuCallback('openFolder', cb),
  onMenuSave: (cb) => registerMenuCallback('save', cb),
  onMenuSaveAs: (cb) => registerMenuCallback('saveAs', cb),
  onMenuCloseTab: (cb) => registerMenuCallback('closeTab', cb),
  onMenuUndo: (cb) => registerMenuCallback('undo', cb),
  onMenuRedo: (cb) => registerMenuCallback('redo', cb),
  onMenuFind: (cb) => registerMenuCallback('find', cb),
  onMenuReplace: (cb) => registerMenuCallback('replace', cb),
  onMenuToggleWordWrap: (cb) => registerMenuCallback('toggleWordWrap', cb),
  onMenuToggleShowAllChars: (cb) => registerMenuCallback('toggleShowAllChars', cb),
  onMenuToggleExplorer: (cb) => registerMenuCallback('toggleExplorer', cb),
  onMenuZoomIn: (cb) => registerMenuCallback('zoomIn', cb),
  onMenuZoomOut: (cb) => registerMenuCallback('zoomOut', cb),
  onMenuResetZoom: (cb) => registerMenuCallback('resetZoom', cb),
  onMenuOpenRecent: noop,
  onMenuFindInFiles: (cb) => registerMenuCallback('findInFiles', cb),
  onMenuToggleColumnSelection: (cb) => registerMenuCallback('toggleColumnSelection', cb),
  onMenuGoToLine: (cb) => registerMenuCallback('goToLine', cb),
  onMenuShowRecentFiles: (cb) => registerMenuCallback('showRecentFiles', cb),

  // ── Clipboard ring (in-memory) ──
  addClipboardEntry: async ({ text, source }) => {
    clipboardRing.unshift({ text, source, timestamp: Date.now() });
    if (clipboardRing.length > CLIPBOARD_MAX) clipboardRing.length = CLIPBOARD_MAX;
  },
  getClipboardRing: async () => clipboardRing,
  clearClipboardRing: async () => { clipboardRing = []; },
  onMenuClipboardHistory: (cb) => registerMenuCallback('clipboardHistory', cb),

  // ── Compare/diff ──
  onMenuCompareTabs: (cb) => registerMenuCallback('compareTabs', cb),

  // ── SQL Query ──
  onMenuSqlQuery: (cb) => registerMenuCallback('sqlQuery', cb),

  // ── Git (unsupported) ──
  gitStatus: unsupported('Git'),
  gitInit: unsupported('Git'),
  gitStageAll: unsupported('Git'),
  gitStageFile: unsupported('Git'),
  gitCommit: unsupported('Git'),
  gitPush: unsupported('Git'),
  gitPull: unsupported('Git'),
  gitFileLog: unsupported('Git'),
  gitFileDiff: unsupported('Git'),
  onMenuGitHistory: noop,

  // ── Text transforms ──
  onTextTransform: (cb) => registerMenuCallback('textTransform', cb),

  // ── Notes (localStorage) ──
  getNotesData: async () => lsGet('npc-notes', null),
  saveNotesData: async (data) => { lsSet('npc-notes', data); },
  exportNotes: async (notes) => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'notes-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
    return { success: true };
  },
  importNotes: async () => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        if (!input.files.length) { resolve(null); return; }
        const text = await input.files[0].text();
        try { resolve(JSON.parse(text)); } catch { resolve(null); }
      };
      input.click();
    });
  },
  onMenuToggleNotes: (cb) => registerMenuCallback('toggleNotes', cb),
  onMenuToggleTreeView: (cb) => registerMenuCallback('toggleTreeView', cb),

  // ── Spreadsheet ──
  onMenuNewSpreadsheet: (cb) => registerMenuCallback('newSpreadsheet', cb),

  // ── Diagram ──
  onMenuNewDiagram: (cb) => registerMenuCallback('newDiagram', cb),
  onMenuExportDiagramSvg: (cb) => registerMenuCallback('exportDiagramSvg', cb),
  exportSvgFile: async (svgContent, defaultPath) => {
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (defaultPath || 'diagram').split(/[/\\]/).pop().replace(/\.[^.]+$/, '') + '.svg';
    a.click();
    URL.revokeObjectURL(a.href);
    return { success: true };
  },

  // ── Captain's Log (localStorage) ──
  getCaptainsLog: async () => lsGet('npc-captains-log', null),
  saveCaptainsLog: async (data) => { lsSet('npc-captains-log', data); },
  onMenuToggleCaptainsLog: (cb) => registerMenuCallback('toggleCaptainsLog', cb),

  // ── Snippets (localStorage) ──
  getSnippets: async () => lsGet('npc-snippets', []),
  saveSnippets: async (snippets) => { lsSet('npc-snippets', snippets); },
  exportSnippets: async (snippets) => {
    const blob = new Blob([JSON.stringify(snippets, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'snippets-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
    return { success: true };
  },
  importSnippets: async () => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async () => {
        if (!input.files.length) { resolve(null); return; }
        const text = await input.files[0].text();
        try { resolve(JSON.parse(text)); } catch { resolve(null); }
      };
      input.click();
    });
  },
  onMenuSnippets: (cb) => registerMenuCallback('snippets', cb),

  // ── Web Dashboard (unsupported) ──
  getDashboardLinks: async () => lsGet('npc-dashboard-links', []),
  saveDashboardLinks: async (links) => { lsSet('npc-dashboard-links', links); },
  onMenuNewDashboard: noop,
  dashboardBrowserCreate: unsupported('Web dashboard browser'),
  dashboardBrowserDestroy: unsupported('Web dashboard browser'),
  dashboardBrowserNavigate: unsupported('Web dashboard browser'),
  dashboardBrowserBack: unsupported('Web dashboard browser'),
  dashboardBrowserForward: unsupported('Web dashboard browser'),
  dashboardBrowserReload: unsupported('Web dashboard browser'),
  dashboardBrowserSetBounds: unsupported('Web dashboard browser'),
  onDashboardBrowserNavigated: noop,
  onDashboardBrowserTitle: noop,
  onDashboardBrowserLoadFailed: noop,

  // ── Database Export (unsupported) ──
  pickSQLiteFile: unsupported('SQLite'),
  getSQLiteTables: unsupported('SQLite'),
  exportToSQLite: unsupported('SQLite export'),
  exportToMSSQL: unsupported('MSSQL export'),
  testMSSQLConnection: unsupported('MSSQL'),
  getLastMSSQLConfig: async () => lsGet('npc-mssql-config', null),
  saveLastMSSQLConfig: async (config) => { lsSet('npc-mssql-config', config); },

  // ── Terminal (unsupported) ──
  terminalCreate: unsupported('Terminal'),
  terminalWrite: noop,
  terminalResize: noop,
  terminalKill: unsupported('Terminal'),
  onTerminalData: () => noop,
  onTerminalExit: () => noop,
  onMenuToggleTerminal: noop,

  // ── Command Palette ──
  onMenuCommandPalette: (cb) => registerMenuCallback('commandPalette', cb),

  // ── Plugin Manager ──
  onMenuPluginManager: (cb) => registerMenuCallback('pluginManager', cb),

  // ── Options (localStorage) ──
  getOptions: async () => lsGet('npc-options', {}),
  setOption: async ({ key, value }) => {
    const opts = lsGet('npc-options', {});
    // key is "section.name" — store nested
    const parts = key.split('.');
    let obj = opts;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    lsSet('npc-options', opts);
  },
  resetOptionsSection: async (section) => {
    const opts = lsGet('npc-options', {});
    delete opts[section];
    lsSet('npc-options', opts);
    return {};
  },
  onMenuOptions: (cb) => registerMenuCallback('options', cb),

  // ── Help ──
  onMenuHelpPluginDev: (cb) => registerMenuCallback('helpPluginDev', cb),
  onMenuHelpPluginUser: (cb) => registerMenuCallback('helpPluginUser', cb),
  onMenuHelpSqlQuery: (cb) => registerMenuCallback('helpSqlQuery', cb),
  onMenuHelpMigration: (cb) => registerMenuCallback('helpMigration', cb),
};
