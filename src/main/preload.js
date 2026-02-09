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

  // Help
  onMenuHelpSqlQuery: (callback) => ipcRenderer.on('main:help-sql-query', callback),
});
