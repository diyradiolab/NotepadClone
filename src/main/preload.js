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

  // Active file tracking (for Share menu)
  notifyActiveFile: (filePath) => ipcRenderer.invoke('renderer:notify-active-file', filePath),

  // File watching
  unwatchFile: (filePath) => ipcRenderer.invoke('renderer:unwatch-file', filePath),
  onFileChanged: (callback) => ipcRenderer.on('main:file-changed', (_event, filePath) => callback(filePath)),

  // Recent files
  getRecentFiles: () => ipcRenderer.invoke('renderer:get-recent-files'),
  clearRecentFiles: () => ipcRenderer.invoke('renderer:clear-recent-files'),

  // Find in files
  searchInFiles: (dirPath, query, useRegex, caseSensitive) =>
    ipcRenderer.invoke('renderer:search-in-files', { dirPath, query, useRegex, caseSensitive }),

  // Large file operations
  openLargeFile: (filePath) => ipcRenderer.invoke('renderer:open-large-file', filePath),
  readLargeFileLines: (filePath, startLine, endLine) =>
    ipcRenderer.invoke('renderer:read-large-file-lines', { filePath, startLine, endLine }),
  searchLargeFile: (filePath, query, useRegex, caseSensitive) =>
    ipcRenderer.invoke('renderer:search-large-file', { filePath, query, useRegex, caseSensitive }),
  closeLargeFile: (filePath) => ipcRenderer.invoke('renderer:close-large-file', filePath),
  onLargeFileProgress: (callback) =>
    ipcRenderer.on('main:large-file-progress', (_event, data) => callback(data)),
  onLargeFileSearchProgress: (callback) =>
    ipcRenderer.on('main:large-file-search-progress', (_event, data) => callback(data)),

  // Theme
  getTheme: () => ipcRenderer.invoke('renderer:get-theme'),
  setTheme: (theme) => ipcRenderer.invoke('renderer:set-theme', theme),
  onThemeChanged: (callback) => ipcRenderer.on('main:theme-changed', (_event, theme) => callback(theme)),

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
  onMenuToggleExplorer: (callback) => ipcRenderer.on('main:toggle-explorer', callback),
  onMenuZoomIn: (callback) => ipcRenderer.on('main:zoom-in', callback),
  onMenuZoomOut: (callback) => ipcRenderer.on('main:zoom-out', callback),
  onMenuResetZoom: (callback) => ipcRenderer.on('main:reset-zoom', callback),
  onMenuOpenRecent: (callback) => ipcRenderer.on('main:open-recent', (_event, filePath) => callback(filePath)),
  onMenuFindInFiles: (callback) => ipcRenderer.on('main:find-in-files', callback),
  onMenuToggleColumnSelection: (callback) => ipcRenderer.on('main:toggle-column-selection', callback),
  onMenuGoToLine: (callback) => ipcRenderer.on('main:go-to-line', callback),
});
