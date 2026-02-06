const { Menu } = require('electron');
const path = require('path');

function buildMenu(mainWindow, store, currentFilePath) {
  const isMac = process.platform === 'darwin';
  const currentTheme = store ? store.get('theme', 'system') : 'system';

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
          label: '&Open...',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('main:open-file'),
        },
        {
          label: 'Open &Folder...',
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
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => mainWindow.webContents.send('main:clipboard-history'),
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
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow.webContents.send('main:find-in-files'),
        },
        { type: 'separator' },
        {
          label: 'Go to &Line...',
          accelerator: 'CmdOrCtrl+G',
          click: () => mainWindow.webContents.send('main:go-to-line'),
        },
        { type: 'separator' },
        {
          label: 'Column Selection Mode',
          accelerator: 'Alt+Shift+C',
          click: () => mainWindow.webContents.send('main:toggle-column-selection'),
        },
      ],
    },

    // Tools menu
    {
      label: '&Tools',
      submenu: [
        {
          label: 'Compare Active Tab With...',
          click: () => mainWindow.webContents.send('main:compare-tabs'),
        },
      ],
    },

    // View menu
    {
      label: '&View',
      submenu: [
        {
          label: 'File Explorer',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('main:toggle-explorer'),
        },
        {
          label: 'Word Wrap',
          accelerator: 'Alt+W',
          click: () => mainWindow.webContents.send('main:toggle-word-wrap'),
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
