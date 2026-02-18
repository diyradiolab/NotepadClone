const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // File operations
  openFile: () => ipcRenderer.invoke('renderer:open-file'),
  saveFile: (filePath, content, encoding) => ipcRenderer.invoke('renderer:save-file', { filePath, content, encoding }),
  saveFileAs: (content, defaultPath, encoding) => ipcRenderer.invoke('renderer:save-file-as', { content, defaultPath, encoding }),
  getFileStats: (filePath) => ipcRenderer.invoke('renderer:get-file-stats', filePath),
  readFileByPath: (filePath) => ipcRenderer.invoke('renderer:read-file-by-path', filePath),
  reloadFile: (filePath) => ipcRenderer.invoke('renderer:reload-file', filePath),

  // Directory operations (file explorer)
  openFolder: () => ipcRenderer.invoke('renderer:open-folder'),
  readDirectory: (dirPath) => ipcRenderer.invoke('renderer:read-directory', dirPath),
  revealInFinder: (filePath) => ipcRenderer.invoke('renderer:reveal-in-finder', filePath),

  // Active file tracking (for Share menu)
  notifyActiveFile: (filePath) => ipcRenderer.invoke('renderer:notify-active-file', filePath),

  // Open external URLs (for markdown preview links)
  openExternal: (url) => ipcRenderer.invoke('renderer:open-external', url),

  // Dialogs
  showSaveDialog: (fileName) => ipcRenderer.invoke('renderer:show-save-dialog', fileName),

  // File watching
  unwatchFile: (filePath) => ipcRenderer.invoke('renderer:unwatch-file', filePath),
  onFileChanged: (callback) => {
    const handler = (_event, filePath) => callback(filePath);
    ipcRenderer.on('main:file-changed', handler);
    return () => ipcRenderer.removeListener('main:file-changed', handler);
  },

  // Tail (auto-follow)
  startTail: (filePath) => ipcRenderer.invoke('renderer:start-tail', filePath),
  stopTail: (filePath) => ipcRenderer.invoke('renderer:stop-tail', filePath),
  onTailData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('main:tail-data', handler);
    return () => ipcRenderer.removeListener('main:tail-data', handler);
  },
  onTailReset: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('main:tail-reset', handler);
    return () => ipcRenderer.removeListener('main:tail-reset', handler);
  },
  onMenuToggleTail: (callback) => ipcRenderer.on('main:toggle-tail', callback),
  onMenuToggleTailFilter: (callback) => ipcRenderer.on('main:toggle-tail-filter', callback),

  // Recent files
  getRecentFiles: () => ipcRenderer.invoke('renderer:get-recent-files'),
  clearRecentFiles: () => ipcRenderer.invoke('renderer:clear-recent-files'),

  // Find in files
  pickFolder: () => ipcRenderer.invoke('renderer:pick-folder'),
  searchInFiles: (dirPath, query, useRegex, caseSensitive, fileFilter, maxDepth) =>
    ipcRenderer.invoke('renderer:search-in-files', { dirPath, query, useRegex, caseSensitive, fileFilter, maxDepth }),

  // Large file operations
  openLargeFile: (filePath) => ipcRenderer.invoke('renderer:open-large-file', filePath),
  readLargeFileLines: (filePath, startLine, endLine) =>
    ipcRenderer.invoke('renderer:read-large-file-lines', { filePath, startLine, endLine }),
  searchLargeFile: (filePath, query, useRegex, caseSensitive) =>
    ipcRenderer.invoke('renderer:search-large-file', { filePath, query, useRegex, caseSensitive }),
  closeLargeFile: (filePath) => ipcRenderer.invoke('renderer:close-large-file', filePath),
  readFileFull: (filePath) => ipcRenderer.invoke('renderer:read-file-force', filePath),
  showConfirmDialog: (message) => ipcRenderer.invoke('renderer:confirm-dialog', message),
  onLargeFileProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('main:large-file-progress', handler);
    return () => ipcRenderer.removeListener('main:large-file-progress', handler);
  },
  onLargeFileSearchProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('main:large-file-search-progress', handler);
    return () => ipcRenderer.removeListener('main:large-file-search-progress', handler);
  },

  // Theme
  getTheme: () => ipcRenderer.invoke('renderer:get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('renderer:set-theme', theme),
  onThemeChanged: (callback) => ipcRenderer.on('main:theme-changed', (_event, theme) => callback(theme)),

  // Window close flow (main → renderer → main)
  onGetDirtyTabs: (callback) => ipcRenderer.on('main:get-dirty-tabs', callback),
  sendDirtyTabsResponse: (tabs) => ipcRenderer.send('main:get-dirty-tabs-response', tabs),
  onSaveTab: (callback) => ipcRenderer.on('main:save-tab', (_event, tabId) => callback(tabId)),
  sendSaveTabResponse: (saved) => ipcRenderer.send('main:save-tab-response', saved),

  // Menu events (main → renderer)
  onMenuNewFile: (callback) => ipcRenderer.on('main:new-file', callback),
  onMenuOpenFile: (callback) => ipcRenderer.on('main:open-file', callback),
  onMenuOpenFolder: (callback) => ipcRenderer.on('main:open-folder', callback),
  onMenuSave: (callback) => ipcRenderer.on('main:save', callback),
  onMenuSaveAs: (callback) => ipcRenderer.on('main:save-as', callback),
  onMenuCloseTab: (callback) => ipcRenderer.on('main:close-tab', callback),
  onMenuUndo: (callback) => ipcRenderer.on('main:undo', callback),
  onMenuRedo: (callback) => ipcRenderer.on('main:redo', callback),
  onMenuFind: (callback) => ipcRenderer.on('main:find', callback),
  onMenuReplace: (callback) => ipcRenderer.on('main:replace', callback),
  onMenuToggleWordWrap: (callback) => ipcRenderer.on('main:toggle-word-wrap', callback),
  onMenuToggleShowAllChars: (callback) => ipcRenderer.on('main:toggle-show-all-chars', callback),
  onMenuToggleExplorer: (callback) => ipcRenderer.on('main:toggle-explorer', callback),
  onMenuZoomIn: (callback) => ipcRenderer.on('main:zoom-in', callback),
  onMenuZoomOut: (callback) => ipcRenderer.on('main:zoom-out', callback),
  onMenuResetZoom: (callback) => ipcRenderer.on('main:reset-zoom', callback),
  onMenuOpenRecent: (callback) => ipcRenderer.on('main:open-recent', (_event, filePath) => callback(filePath)),
  onMenuFindInFiles: (callback) => ipcRenderer.on('main:find-in-files', callback),
  onMenuToggleColumnSelection: (callback) => ipcRenderer.on('main:toggle-column-selection', callback),
  onMenuGoToLine: (callback) => ipcRenderer.on('main:go-to-line', callback),
  onMenuShowRecentFiles: (callback) => ipcRenderer.on('main:show-recent-files', callback),

  // Clipboard ring
  addClipboardEntry: (text, source) => ipcRenderer.invoke('renderer:clipboard-add', { text, source }),
  getClipboardRing: () => ipcRenderer.invoke('renderer:get-clipboard-ring'),
  clearClipboardRing: () => ipcRenderer.invoke('renderer:clear-clipboard-ring'),
  onMenuClipboardHistory: (callback) => ipcRenderer.on('main:clipboard-history', callback),

  // Compare/diff
  onMenuCompareTabs: (callback) => ipcRenderer.on('main:compare-tabs', callback),

  // SQL Query
  onMenuSqlQuery: (callback) => ipcRenderer.on('main:sql-query', callback),

  // Git operations
  gitStatus: (dirPath) => ipcRenderer.invoke('renderer:git-status', dirPath),
  gitInit: (dirPath) => ipcRenderer.invoke('renderer:git-init', dirPath),
  gitStageAll: (dirPath) => ipcRenderer.invoke('renderer:git-stage-all', dirPath),
  gitStageFile: (dirPath, filePath) => ipcRenderer.invoke('renderer:git-stage-file', { dirPath, filePath }),
  gitCommit: (dirPath, message) => ipcRenderer.invoke('renderer:git-commit', { dirPath, message }),
  gitPush: (dirPath) => ipcRenderer.invoke('renderer:git-push', dirPath),
  gitPull: (dirPath) => ipcRenderer.invoke('renderer:git-pull', dirPath),
  gitFileLog: (dirPath, filePath) => ipcRenderer.invoke('renderer:git-file-log', { dirPath, filePath }),
  gitFileDiff: (dirPath, hash, filePath) => ipcRenderer.invoke('renderer:git-file-diff', { dirPath, hash, filePath }),

  // Menu events — Git History
  onMenuGitHistory: (callback) => ipcRenderer.on('main:git-history', callback),

  // Text transforms
  onTextTransform: (callback) => ipcRenderer.on('main:text-transform', (_e, type) => callback(type)),

  // Notes panel
  getNotesData: () => ipcRenderer.invoke('renderer:get-notes-data'),
  saveNotesData: (data) => ipcRenderer.invoke('renderer:save-notes-data', data),
  exportNotes: (notes) => ipcRenderer.invoke('renderer:export-notes', notes),
  importNotes: () => ipcRenderer.invoke('renderer:import-notes'),
  onMenuToggleNotes: (callback) => ipcRenderer.on('main:toggle-notes', callback),
  onMenuToggleTreeView: (callback) => ipcRenderer.on('main:toggle-tree-view', callback),

  // Spreadsheet
  onMenuNewSpreadsheet: (callback) => ipcRenderer.on('main:new-spreadsheet', callback),

  // Diagram
  onMenuNewDiagram: (callback) => ipcRenderer.on('main:new-diagram', callback),
  onMenuExportDiagramSvg: (callback) => ipcRenderer.on('main:export-diagram-svg', callback),
  exportSvgFile: (svgContent, defaultPath) =>
    ipcRenderer.invoke('renderer:export-svg-file', { svgContent, defaultPath }),

  // Captain's Log
  getCaptainsLog: () => ipcRenderer.invoke('renderer:get-captains-log'),
  saveCaptainsLog: (data) => ipcRenderer.invoke('renderer:save-captains-log', data),
  onMenuToggleCaptainsLog: (callback) => ipcRenderer.on('main:toggle-captains-log', callback),

  // Snippets
  getSnippets: () => ipcRenderer.invoke('renderer:get-snippets'),
  saveSnippets: (snippets) => ipcRenderer.invoke('renderer:save-snippets', snippets),
  exportSnippets: (snippets) => ipcRenderer.invoke('renderer:export-snippets', snippets),
  importSnippets: () => ipcRenderer.invoke('renderer:import-snippets'),
  onMenuSnippets: (callback) => ipcRenderer.on('main:snippets', callback),

  // Web Dashboard
  getDashboardLinks: () => ipcRenderer.invoke('renderer:get-dashboard-links'),
  saveDashboardLinks: (links) => ipcRenderer.invoke('renderer:save-dashboard-links', links),
  onMenuNewDashboard: (callback) => ipcRenderer.on('main:new-dashboard', callback),
  dashboardBrowserCreate: (browserId) => ipcRenderer.invoke('renderer:dashboard-browser-create', { browserId }),
  dashboardBrowserDestroy: (browserId) => ipcRenderer.invoke('renderer:dashboard-browser-destroy', { browserId }),
  dashboardBrowserNavigate: (browserId, url) => ipcRenderer.invoke('renderer:dashboard-browser-navigate', { browserId, url }),
  dashboardBrowserBack: (browserId) => ipcRenderer.invoke('renderer:dashboard-browser-back', { browserId }),
  dashboardBrowserForward: (browserId) => ipcRenderer.invoke('renderer:dashboard-browser-forward', { browserId }),
  dashboardBrowserReload: (browserId) => ipcRenderer.invoke('renderer:dashboard-browser-reload', { browserId }),
  dashboardBrowserSetBounds: (browserId, bounds) => ipcRenderer.invoke('renderer:dashboard-browser-set-bounds', { browserId, bounds }),
  onDashboardBrowserNavigated: (callback) => ipcRenderer.on('main:dashboard-browser-navigated', (_e, data) => callback(data)),
  onDashboardBrowserTitle: (callback) => ipcRenderer.on('main:dashboard-browser-title', (_e, data) => callback(data)),
  onDashboardBrowserLoadFailed: (callback) => ipcRenderer.on('main:dashboard-browser-load-failed', (_e, data) => callback(data)),

  // Database Export
  pickSQLiteFile: () => ipcRenderer.invoke('renderer:pick-sqlite-file'),
  getSQLiteTables: (filePath) => ipcRenderer.invoke('renderer:get-sqlite-tables', filePath),
  exportToSQLite: (data) => ipcRenderer.invoke('renderer:export-to-sqlite', data),
  exportToMSSQL: (data) => ipcRenderer.invoke('renderer:export-to-mssql', data),
  testMSSQLConnection: (config) => ipcRenderer.invoke('renderer:test-mssql-connection', config),
  getLastMSSQLConfig: () => ipcRenderer.invoke('renderer:get-last-mssql-config'),
  saveLastMSSQLConfig: (config) => ipcRenderer.invoke('renderer:save-last-mssql-config', config),

  // Terminal
  terminalCreate: (options) => ipcRenderer.invoke('renderer:terminal-create', options),
  terminalWrite: (data) => ipcRenderer.send('renderer:terminal-write', data),
  terminalResize: (cols, rows) => ipcRenderer.send('renderer:terminal-resize', { cols, rows }),
  terminalKill: () => ipcRenderer.invoke('renderer:terminal-kill'),
  onTerminalData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('main:terminal-data', handler);
    return () => ipcRenderer.removeListener('main:terminal-data', handler);
  },
  onTerminalExit: (callback) => {
    const handler = (_event, exitCode) => callback(exitCode);
    ipcRenderer.on('main:terminal-exit', handler);
    return () => ipcRenderer.removeListener('main:terminal-exit', handler);
  },
  onMenuToggleTerminal: (callback) => ipcRenderer.on('main:toggle-terminal', callback),

  // Command Palette
  onMenuCommandPalette: (callback) => ipcRenderer.on('main:command-palette', callback),

  // Plugin Manager
  onMenuPluginManager: (callback) => ipcRenderer.on('main:plugin-manager', callback),

  // Options
  getOptions: () => ipcRenderer.invoke('renderer:get-options'),
  setOption: (key, value) => ipcRenderer.invoke('renderer:set-option', { key, value }),
  resetOptionsSection: (section) => ipcRenderer.invoke('renderer:reset-options-section', section),
  onMenuOptions: (callback) => ipcRenderer.on('main:options', callback),

  // Help
  onMenuHelpPluginDev: (callback) => ipcRenderer.on('main:help-plugin-dev', callback),
  onMenuHelpPluginUser: (callback) => ipcRenderer.on('main:help-plugin-user', callback),
  onMenuHelpSqlQuery: (callback) => ipcRenderer.on('main:help-sql-query', callback),
  onMenuHelpMigration: (callback) => ipcRenderer.on('main:help-migration', callback),
});
