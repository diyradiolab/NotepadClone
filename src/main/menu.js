const { Menu } = require('electron');
const path = require('path');
const { FEATURE_SUBLABELS } = require('../shared/feature-guide-data');

function buildMenu(mainWindow, store, currentFilePath) {
  const isMac = process.platform === 'darwin';
  const currentTheme = store ? store.get('theme', 'system') : 'system';
  const showHelp = store ? store.get('options.appearance.showMenuHelp', false) : false;
  const sl = (label) => showHelp ? FEATURE_SUBLABELS.get(label) : undefined;

  // Build recent files submenu — show top 5 for quick access, then "Show All..."
  const recentFiles = store ? store.get('recentFiles', []) : [];
  const recentSubmenu = recentFiles.length > 0
    ? [
        ...recentFiles.slice(0, 5).map(filePath => ({
          label: path.basename(filePath),
          sublabel: filePath,
          click: () => mainWindow.webContents.send('main:open-recent', filePath),
        })),
        { type: 'separator' },
        {
          label: 'Show All Recent Files...',
          accelerator: 'CmdOrCtrl+E',
          click: () => mainWindow.webContents.send('main:show-recent-files'),
        },
        { type: 'separator' },
        {
          label: 'Clear Recent Files',
          click: () => {
            store.set('recentFiles', []);
            buildMenu(mainWindow, store, currentFilePath);
          },
        },
      ]
    : [{ label: '(No Recent Files)', enabled: false }];

  const template = [
    // File menu
    {
      label: '&File',
      submenu: [
        {
          label: '&New',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('main:new-file'),
        },
        {
          label: 'New &Spreadsheet',
          sublabel: sl('New &Spreadsheet'),
          click: () => mainWindow.webContents.send('main:new-spreadsheet'),
        },
        {
          label: 'New &Diagram',
          sublabel: sl('New &Diagram'),
          click: () => mainWindow.webContents.send('main:new-diagram'),
        },
        {
          label: 'New &Whiteboard',
          sublabel: sl('New &Whiteboard'),
          click: () => mainWindow.webContents.send('main:new-whiteboard'),
        },
        {
          label: 'New Dashboard',
          sublabel: sl('New Dashboard'),
          click: () => mainWindow.webContents.send('main:new-dashboard'),
        },
        {
          label: '&Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('main:open-file'),
        },
        {
          label: 'Open &Folder...',
          sublabel: sl('Open &Folder...'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow.webContents.send('main:open-folder'),
        },
        {
          label: 'Recent Files',
          submenu: recentSubmenu,
        },
        { type: 'separator' },
        {
          label: '&Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('main:save'),
        },
        {
          label: 'Save &As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('main:save-as'),
        },
        {
          label: 'Export Diagram as SVG...',
          sublabel: sl('Export Diagram as SVG...'),
          click: () => mainWindow.webContents.send('main:export-diagram-svg'),
        },
        { type: 'separator' },
        ...(isMac && currentFilePath ? [{
          label: 'Share',
          role: 'shareMenu',
          sharingItem: {
            filePaths: [currentFilePath],
          },
        }] : []),
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => mainWindow.webContents.send('main:close-tab'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },

    // Edit menu
    {
      label: '&Edit',
      submenu: [
        {
          label: '&Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => mainWindow.webContents.send('main:undo'),
        },
        {
          label: '&Redo',
          accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y',
          click: () => mainWindow.webContents.send('main:redo'),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Clipboard History...',
          sublabel: sl('Clipboard History...'),
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => mainWindow.webContents.send('main:clipboard-history'),
        },
        { type: 'separator' },
        {
          label: 'Convert Case',
          sublabel: sl('Convert Case'),
          submenu: [
            { label: 'UPPERCASE', click: () => mainWindow.webContents.send('main:text-transform', 'uppercase') },
            { label: 'lowercase', click: () => mainWindow.webContents.send('main:text-transform', 'lowercase') },
            { label: 'Title Case', click: () => mainWindow.webContents.send('main:text-transform', 'title-case') },
            { label: 'camelCase', click: () => mainWindow.webContents.send('main:text-transform', 'camel-case') },
            { label: 'snake_case', click: () => mainWindow.webContents.send('main:text-transform', 'snake-case') },
            { label: 'kebab-case', click: () => mainWindow.webContents.send('main:text-transform', 'kebab-case') },
          ],
        },
        {
          label: 'Line Operations',
          sublabel: sl('Line Operations'),
          submenu: [
            { label: 'Sort Lines (A\u2192Z)', click: () => mainWindow.webContents.send('main:text-transform', 'sort-asc') },
            { label: 'Sort Lines (Z\u2192A)', click: () => mainWindow.webContents.send('main:text-transform', 'sort-desc') },
            { label: 'Sort Lines (Numeric)', click: () => mainWindow.webContents.send('main:text-transform', 'sort-numeric') },
            { type: 'separator' },
            { label: 'Remove Duplicate Lines', click: () => mainWindow.webContents.send('main:text-transform', 'remove-duplicates') },
            { label: 'Remove Empty Lines', click: () => mainWindow.webContents.send('main:text-transform', 'remove-empty-lines') },
            { label: 'Trim Trailing Whitespace', click: () => mainWindow.webContents.send('main:text-transform', 'trim-trailing') },
            { type: 'separator' },
            { label: 'Join Lines', click: () => mainWindow.webContents.send('main:text-transform', 'join-lines') },
            { label: 'Reverse Line Order', click: () => mainWindow.webContents.send('main:text-transform', 'reverse-lines') },
          ],
        },
        {
          label: 'Encode/Decode',
          sublabel: sl('Encode/Decode'),
          submenu: [
            { label: 'Base64 Encode', click: () => mainWindow.webContents.send('main:text-transform', 'base64-encode') },
            { label: 'Base64 Decode', click: () => mainWindow.webContents.send('main:text-transform', 'base64-decode') },
            { type: 'separator' },
            { label: 'URL Encode', click: () => mainWindow.webContents.send('main:text-transform', 'url-encode') },
            { label: 'URL Decode', click: () => mainWindow.webContents.send('main:text-transform', 'url-decode') },
            { type: 'separator' },
            { label: 'JSON Escape', click: () => mainWindow.webContents.send('main:text-transform', 'json-escape') },
            { label: 'JSON Unescape', click: () => mainWindow.webContents.send('main:text-transform', 'json-unescape') },
          ],
        },
      ],
    },

    // Search menu
    {
      label: '&Search',
      submenu: [
        {
          label: '&Find...',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('main:find'),
        },
        {
          label: '&Replace...',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.webContents.send('main:replace'),
        },
        { type: 'separator' },
        {
          label: 'Find in &Files...',
          sublabel: sl('Find in &Files...'),
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow.webContents.send('main:find-in-files'),
        },
        { type: 'separator' },
        {
          label: 'Go to &Line...',
          sublabel: sl('Go to &Line...'),
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow.webContents.send('main:go-to-line'),
        },
        { type: 'separator' },
        {
          label: 'Column Selection Mode',
          sublabel: sl('Column Selection Mode'),
          accelerator: 'Alt+Shift+C',
          click: () => mainWindow.webContents.send('main:toggle-column-selection'),
        },
      ],
    },

    // Dev menu
    {
      label: '&Dev',
      submenu: [
        {
          label: 'Compare Active Tab With...',
          sublabel: sl('Compare Active Tab With...'),
          click: () => mainWindow.webContents.send('main:compare-tabs'),
        },
        { type: 'separator' },
        {
          label: 'Git File History',
          sublabel: sl('Git File History'),
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => mainWindow.webContents.send('main:git-history'),
        },
        { type: 'separator' },
        {
          label: 'SQL Query...',
          sublabel: sl('SQL Query...'),
          accelerator: 'CmdOrCtrl+Shift+Q',
          click: () => mainWindow.webContents.send('main:sql-query'),
        },
        {
          label: 'Code Snippets...',
          sublabel: sl('Code Snippets...'),
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => mainWindow.webContents.send('main:snippets'),
        },
        { type: 'separator' },
        {
          label: 'HTTP Client',
          sublabel: sl('HTTP Client'),
          accelerator: 'CmdOrCtrl+Alt+H',
          click: () => mainWindow.webContents.send('main:http-client'),
        },
        { type: 'separator' },
        {
          label: 'Regex Tester',
          sublabel: sl('Regex Tester'),
          accelerator: 'CmdOrCtrl+Alt+R',
          click: () => mainWindow.webContents.send('main:regex-tester'),
        },
        {
          label: 'Bookmarks',
          sublabel: sl('Bookmarks'),
          accelerator: 'CmdOrCtrl+Alt+B',
          click: () => mainWindow.webContents.send('main:bookmarks'),
        },
      ],
    },

    // Ops menu
    {
      label: '&Ops',
      submenu: [
        {
          label: 'Tail File (Auto-scroll)',
          sublabel: sl('Tail File (Auto-scroll)'),
          accelerator: 'CmdOrCtrl+Shift+Y',
          click: () => mainWindow.webContents.send('main:toggle-tail'),
        },
        {
          label: 'Tail Filter',
          sublabel: sl('Tail Filter'),
          accelerator: 'CmdOrCtrl+Shift+F5',
          click: () => mainWindow.webContents.send('main:toggle-tail-filter'),
        },
        {
          label: 'Log Analyzer',
          sublabel: sl('Log Analyzer'),
          accelerator: 'CmdOrCtrl+Alt+L',
          click: () => mainWindow.webContents.send('main:log-analyzer'),
        },
        { type: 'separator' },
        {
          label: 'Hex Editor',
          sublabel: sl('Hex Editor'),
          click: () => mainWindow.webContents.send('main:hex-editor'),
        },
        {
          label: 'Checksums',
          sublabel: sl('Checksums'),
          click: () => mainWindow.webContents.send('main:checksums'),
        },
      ],
    },

    // View menu
    {
      label: '&View',
      submenu: [
        {
          label: 'File Explorer',
          sublabel: sl('File Explorer'),
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('main:toggle-explorer'),
        },
        {
          label: 'Word Wrap',
          accelerator: 'Alt+W',
          click: () => mainWindow.webContents.send('main:toggle-word-wrap'),
        },
        {
          label: 'Show All Characters',
          sublabel: sl('Show All Characters'),
          accelerator: 'CmdOrCtrl+Shift+8',
          click: () => mainWindow.webContents.send('main:toggle-show-all-chars'),
        },
        {
          label: 'Notes Panel',
          sublabel: sl('Notes Panel'),
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => mainWindow.webContents.send('main:toggle-notes'),
        },
        {
          label: store ? (store.get('options.plugin.notepadclone-captains-log.general.panelTitle') || "Captain's Log") : "Captain's Log",
          sublabel: sl("Captain's Log"),
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => mainWindow.webContents.send('main:toggle-captains-log'),
        },
        {
          label: 'Toggle Tree View',
          sublabel: sl('Toggle Tree View'),
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => mainWindow.webContents.send('main:toggle-tree-view'),
        },
        {
          label: 'Terminal',
          sublabel: sl('Terminal'),
          accelerator: 'Ctrl+`',
          click: () => mainWindow.webContents.send('main:toggle-terminal'),
        },
        { type: 'separator' },
        {
          label: 'Options...',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('main:options'),
        },
        {
          label: 'Command Palette...',
          sublabel: sl('Command Palette...'),
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('main:command-palette'),
        },
        {
          label: 'Plugin Manager',
          sublabel: sl('Plugin Manager'),
          click: () => mainWindow.webContents.send('main:plugin-manager'),
        },
        { type: 'separator' },
        {
          label: 'Theme',
          submenu: [
            {
              label: 'Light',
              type: 'radio',
              checked: currentTheme === 'light',
              click: () => {
                store.set('theme', 'light');
                mainWindow.webContents.send('main:theme-changed', 'light');
                buildMenu(mainWindow, store, currentFilePath);
              },
            },
            {
              label: 'Dark',
              type: 'radio',
              checked: currentTheme === 'dark',
              click: () => {
                store.set('theme', 'dark');
                mainWindow.webContents.send('main:theme-changed', 'dark');
                buildMenu(mainWindow, store, currentFilePath);
              },
            },
            {
              label: 'System',
              type: 'radio',
              checked: currentTheme === 'system',
              click: () => {
                store.set('theme', 'system');
                mainWindow.webContents.send('main:theme-changed', 'system');
                buildMenu(mainWindow, store, currentFilePath);
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => mainWindow.webContents.send('main:zoom-in'),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => mainWindow.webContents.send('main:zoom-out'),
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow.webContents.send('main:reset-zoom'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },

    // Help menu
    {
      label: '&Help',
      submenu: [
        {
          label: 'Feature Guide...',
          accelerator: 'F1',
          click: () => mainWindow.webContents.send('main:feature-guide'),
        },
        { type: 'separator' },
        {
          label: 'Plugin Development Guide',
          click: () => mainWindow.webContents.send('main:help-plugin-dev'),
        },
        {
          label: 'Using Plugins',
          click: () => mainWindow.webContents.send('main:help-plugin-user'),
        },
        {
          label: 'SQL Query Builder Guide',
          click: () => mainWindow.webContents.send('main:help-sql-query'),
        },
        {
          label: 'Moving to a New Computer',
          click: () => mainWindow.webContents.send('main:help-migration'),
        },
        { type: 'separator' },
        {
          label: 'About NotepadClone',
          click: () => {
            const { dialog } = require('electron');
            const electronVersion = process.versions.electron;
            const chromeVersion = process.versions.chrome;
            const nodeVersion = process.versions.node;
            const v8Version = process.versions.v8;
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About NotepadClone',
              message: 'NotepadClone v1.0.0',
              detail: `A cross-platform Notepad++ alternative.\nBuilt with Electron + Monaco Editor.\n\nElectron: ${electronVersion}\nChrome: ${chromeVersion}\nNode.js: ${nodeVersion}\nV8: ${v8Version}`,
            });
          },
        },
      ],
    },
  ];

  // macOS app menu
  if (isMac) {
    template.unshift({
      label: 'NotepadClone',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

module.exports = { buildMenu };
