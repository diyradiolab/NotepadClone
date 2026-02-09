import './styles/main.css';
import './styles/notepadpp-theme.css';
import { EditorManager } from './editor/editor-manager';
import { TabManager } from './components/tab-manager';
import { StatusBar } from './components/status-bar';
import { setEditorTheme, updateDefaultOptions } from './editor/monaco-setup';
import { SettingsService } from './settings-service';
import { EventBus } from './event-bus';
import { CommandRegistry } from './command-registry';
import { ViewerRegistry } from './viewer-registry';
import { ToolbarManager } from './toolbar-manager';
import { PluginHost } from './plugin-host';

// Built-in plugins — viewer plugins
import * as coreEditingPlugin from '../../plugins/core-editing/index';
import coreEditingManifest from '../../plugins/core-editing/package.json';
import * as markdownPlugin from '../../plugins/markdown/index';
import markdownManifest from '../../plugins/markdown/package.json';
import * as tableViewerPlugin from '../../plugins/table-viewer/index';
import tableViewerManifest from '../../plugins/table-viewer/package.json';
import * as treeViewerPlugin from '../../plugins/tree-viewer/index';
import treeViewerManifest from '../../plugins/tree-viewer/package.json';
import * as spreadsheetPlugin from '../../plugins/spreadsheet/index';
import spreadsheetManifest from '../../plugins/spreadsheet/package.json';
import * as diagramPlugin from '../../plugins/diagram/index';
import diagramManifest from '../../plugins/diagram/package.json';
import * as largeFilePlugin from '../../plugins/large-file/index';
import largeFileManifest from '../../plugins/large-file/package.json';

// Built-in plugins — panels, dialogs, and services
import * as fileExplorerPlugin from '../../plugins/file-explorer/index';
import fileExplorerManifest from '../../plugins/file-explorer/package.json';
import * as findReplacePlugin from '../../plugins/find-replace/index';
import findReplaceManifest from '../../plugins/find-replace/package.json';
import * as sqlQueryPlugin from '../../plugins/sql-query/index';
import sqlQueryManifest from '../../plugins/sql-query/package.json';
import * as notesPlugin from '../../plugins/notes/index';
import notesManifest from '../../plugins/notes/package.json';
import * as clipboardHistoryPlugin from '../../plugins/clipboard-history/index';
import clipboardHistoryManifest from '../../plugins/clipboard-history/package.json';
import * as recentFilesPlugin from '../../plugins/recent-files/index';
import recentFilesManifest from '../../plugins/recent-files/package.json';
import * as compareTabsPlugin from '../../plugins/compare-tabs/index';
import compareTabsManifest from '../../plugins/compare-tabs/package.json';
import * as gitPlugin from '../../plugins/git/index';
import gitManifest from '../../plugins/git/package.json';
import * as pluginManagerPlugin from '../../plugins/plugin-manager/index';
import pluginManagerManifest from '../../plugins/plugin-manager/package.json';
import * as optionsPlugin from '../../plugins/options/index';
import optionsManifest from '../../plugins/options/package.json';
import * as snippetsPlugin from '../../plugins/snippets/index';
import snippetsManifest from '../../plugins/snippets/package.json';
import * as terminalPlugin from '../../plugins/terminal/index';
import terminalManifest from '../../plugins/terminal/package.json';
import * as commandPalettePlugin from '../../plugins/command-palette/index';
import commandPaletteManifest from '../../plugins/command-palette/package.json';
import * as captainsLogPlugin from '../../plugins/captains-log/index';
import captainsLogManifest from '../../plugins/captains-log/package.json';

// Help documents
import { PLUGIN_DEVELOPMENT_GUIDE } from './help/plugin-development-guide';
import { PLUGIN_USER_GUIDE } from './help/plugin-user-guide';

// ── Initialize Core Components ──
const editorContainer = document.getElementById('editor-container');
const tabBar = document.getElementById('tab-bar');

const editorManager = new EditorManager(editorContainer);
const tabManager = new TabManager(tabBar);
const statusBar = new StatusBar();


// ── Plugin Infrastructure ──
const eventBus = new EventBus();
const commandRegistry = new CommandRegistry();
const viewerRegistry = new ViewerRegistry();
const toolbarManager = new ToolbarManager(document.getElementById('toolbar'));
const settingsService = new SettingsService();
const pluginHost = new PluginHost({
  eventBus,
  commandRegistry,
  viewerRegistry,
  toolbarManager,
  tabManager,
  editorManager,
  statusBar,
  settingsService,
});
pluginHost.services.pluginHost = pluginHost;

// Register and activate all built-in plugins
pluginHost.register(coreEditingManifest, coreEditingPlugin);
pluginHost.register(markdownManifest, markdownPlugin);
pluginHost.register(tableViewerManifest, tableViewerPlugin);
pluginHost.register(treeViewerManifest, treeViewerPlugin);
pluginHost.register(spreadsheetManifest, spreadsheetPlugin);
pluginHost.register(diagramManifest, diagramPlugin);
pluginHost.register(largeFileManifest, largeFilePlugin);
pluginHost.register(fileExplorerManifest, fileExplorerPlugin);
pluginHost.register(findReplaceManifest, findReplacePlugin);
pluginHost.register(sqlQueryManifest, sqlQueryPlugin);
pluginHost.register(notesManifest, notesPlugin);
pluginHost.register(clipboardHistoryManifest, clipboardHistoryPlugin);
pluginHost.register(recentFilesManifest, recentFilesPlugin);
pluginHost.register(compareTabsManifest, compareTabsPlugin);
pluginHost.register(gitManifest, gitPlugin);
pluginHost.register(pluginManagerManifest, pluginManagerPlugin);
pluginHost.register(optionsManifest, optionsPlugin);
pluginHost.register(snippetsManifest, snippetsPlugin);
pluginHost.register(terminalManifest, terminalPlugin);
pluginHost.register(commandPaletteManifest, commandPalettePlugin);
pluginHost.register(captainsLogManifest, captainsLogPlugin);

// ── Apply Editor Settings from SettingsService to Monaco ──
function applyEditorSettings() {
  const monacoOpts = {
    fontSize: settingsService.get('editor.fontSize'),
    fontFamily: settingsService.get('editor.fontFamily'),
    tabSize: settingsService.get('editor.tabSize'),
    insertSpaces: settingsService.get('editor.insertSpaces'),
    minimap: { enabled: settingsService.get('editor.minimap') },
    lineNumbers: settingsService.get('editor.lineNumbers'),
    wordWrap: settingsService.get('editor.wordWrap'),
    cursorStyle: settingsService.get('editor.cursorStyle'),
    renderWhitespace: settingsService.get('editor.renderWhitespace'),
    smoothScrolling: settingsService.get('editor.smoothScrolling'),
    cursorBlinking: settingsService.get('editor.cursorBlinking'),
    folding: settingsService.get('editor.folding'),
    renderLineHighlight: settingsService.get('editor.renderLineHighlight'),
  };
  // Update defaults for future editors
  updateDefaultOptions(monacoOpts);
  // Update active editor if one exists
  const editor = editorManager.getActiveEditor();
  if (editor) editor.updateOptions(monacoOpts);
}

// ── Async Init: load settings, apply, then activate plugins ──
(async () => {
  await settingsService.init();
  applyEditorSettings();
  applyTheme(settingsService.get('appearance.theme'));

  // Wire onChange listeners for editor settings
  const editorKeys = [
    'editor.fontSize', 'editor.fontFamily', 'editor.tabSize', 'editor.insertSpaces',
    'editor.minimap', 'editor.lineNumbers', 'editor.wordWrap', 'editor.cursorStyle',
    'editor.renderWhitespace', 'editor.smoothScrolling', 'editor.cursorBlinking',
    'editor.folding', 'editor.renderLineHighlight',
  ];
  for (const key of editorKeys) {
    settingsService.onChange(key, () => applyEditorSettings());
  }
  settingsService.onChange('appearance.theme', (value) => applyTheme(value));

  // Activate plugins, skipping user-disabled (always activate plugin-manager + options)
  const alwaysActivate = new Set(['notepadclone-plugin-manager', 'notepadclone-options']);
  const disabledPlugins = JSON.parse(localStorage.getItem('notepadclone-disabled-plugins') || '[]');
  for (const id of pluginHost.getPluginIds()) {
    if (!alwaysActivate.has(id) && disabledPlugins.includes(id)) continue;
    await pluginHost.activatePlugin(id);
  }
})();

let newFileCounter = 1;
let currentFolderPath = null;

function refreshGitStatus() {
  const gitExports = _getPluginExports('notepadclone-git');
  if (gitExports) gitExports.refreshGitStatus();
}

// ── Event Bus Listeners (handle events from plugins) ──

eventBus.on('file:openByPath', ({ filePath, lineNumber }) => {
  openFileByPath(filePath, lineNumber);
});

eventBus.on('diff:create', ({ diffTabId, otherContent, activeContent, otherTitle, activeTitle }) => {
  editorManager.createDiffTab(diffTabId, otherContent, activeContent, otherTitle, activeTitle);
  editorManager.activateTab(diffTabId);
  statusBar.updateLanguage('Diff');
});

eventBus.on('folder:opened', ({ path }) => {
  currentFolderPath = path;
});

eventBus.on('help:open', ({ title, content }) => {
  openHelpDocument(title, content);
});

// ── Theme Logic ──

function resolveTheme(preference) {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolved);
  setEditorTheme(resolved === 'dark' ? 'notepadpp-dark' : 'notepadpp');
}

window.api.onThemeChanged((theme) => applyTheme(theme));

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const theme = settingsService.get('appearance.theme');
  if (theme === 'system') applyTheme('system');
});

// ── Markdown Formatting Toolbar (delegated click) ──
document.getElementById('markdown-format-toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.mft-btn');
  if (!btn) return;
  commandRegistry.execute('core-editing.markdownFormat', btn.dataset.mdAction);
});

// ── Tab ↔ Editor Wiring (using ViewerRegistry) ──

function deactivatePreviousEditor() {
  viewerRegistry.deactivateActive();

  if (editorManager.activeTabId && editorManager.editors.has(editorManager.activeTabId)) {
    const current = editorManager.editors.get(editorManager.activeTabId);
    if (current.isDiffTab) {
      if (current.diffEditor) { current.diffEditor.dispose(); current.diffEditor = null; }
    } else if (current.editor) {
      current.viewState = current.editor.saveViewState();
      current.editor.dispose();
      current.editor = null;
    }
  }
}

tabManager.onActivate((tabId) => {
  const tab = tabManager.getTab(tabId);
  const entry = editorManager.editors.get(tabId);

  // Try viewer registry first (handles diagram, spreadsheet, tree, table, markdown-read, large-file)
  const isSpecialViewer =
    (tab && tab.isDiagram && tab.diagramMode === 'diagram') ||
    (tab && tab.isSpreadsheet && tab.spreadsheetMode === 'spreadsheet') ||
    (tab && tab.isTreeFile && tab.treeMode === 'tree') ||
    (tab && tab.isTableFile && tab.tableMode === 'table') ||
    (tab && tab.isMarkdown && tab.markdownMode === 'read') ||
    (tab && tab.isLargeFile);

  if (isSpecialViewer) {
    deactivatePreviousEditor();
    editorManager.container.innerHTML = '';
    editorManager.activeTabId = tabId;

    // Let the viewer registry handle it
    viewerRegistry.activateTab(tab, tabId, entry, editorManager.container);

    // Update all viewer toolbars
    viewerRegistry.updateToolbars(tab);
  } else if (tab && tab.isHistoryTab) {
    // Git history tab — handled by git plugin's GitHistoryPanel
    if (entry) {
      deactivatePreviousEditor();
      editorManager.activeTabId = tabId;
      editorManager.container.innerHTML = '';
      const gitExports = _getPluginExports('notepadclone-git');
      if (gitExports) {
        gitExports.getHistoryPanel()._render(tabId, entry.filePath, entry.commits, entry.dirPath, entry.filename);
      }
    }
    statusBar.updateLanguage('Git History');
    viewerRegistry.updateToolbars(tab);
  } else if (tab && tab.isDiffTab) {
    editorManager.activateTab(tabId);
    statusBar.updateLanguage('Diff');
    viewerRegistry.updateToolbars(tab);
  } else {
    // Default: Monaco editor
    editorManager.activateTab(tabId);
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);

    // Update viewer toolbars (shows edit-mode toggles where applicable)
    viewerRegistry.updateToolbars(tab);
  }

  if (tab) {
    document.title = `${tab.title} - NotepadClone`;
    window.api.notifyActiveFile(tab.filePath || null);
  }

  refreshGitStatus();
});

tabManager.onClose((tabId) => {
  const tab = tabManager.getTab(tabId);
  if (tab && tab.filePath) {
    window.api.unwatchFile(tab.filePath);
  }

  // Let viewer registry destroy any active viewer
  if (tab) {
    viewerRegistry.destroyTab(tab);
  }

  // Clean up history tab
  if (tab && tab.isHistoryTab) {
    const gitExports = _getPluginExports('notepadclone-git');
    if (gitExports) gitExports.getHistoryPanel()._disposeDiffEditor();
    editorManager.editors.delete(tabId);
    if (editorManager.activeTabId === tabId) {
      editorManager.activeTabId = null;
    }
  }

  // Clean up large file viewer (plugin tracks its own map)
  if (tab && tab.isLargeFile) {
    // The large-file plugin's viewer registered with viewerRegistry handles destroy
    // But we also need to close the file handle
    window.api.closeLargeFile(tab.filePath);
  } else if (!tab || !tab.isHistoryTab) {
    editorManager.closeTab(tabId);
  }

  if (tabManager.getTabCount() === 0) {
    document.title = 'NotepadClone';
    statusBar.updatePosition(1, 1);
    statusBar.updateSelection(null);
    statusBar.updateLanguage('Plain Text');
  }
});

editorManager.onChange((tabId) => {
  tabManager.setDirty(tabId, true);
});

editorManager.onCursorChange((tabId, position, selection) => {
  if (tabId === tabManager.getActiveTabId()) {
    statusBar.updatePosition(position.lineNumber, position.column);
    statusBar.updateSelection(selection);
  }
});

editorManager.onClipboardCopy((text, tabId) => {
  const tab = tabManager.getTab(tabId);
  window.api.addClipboardEntry(text, tab ? tab.title : 'Unknown');
});

editorManager.onShowClipboardHistory(() => {
  commandRegistry.execute('clipboardHistory.show');
});

// ── Open a large file (delegates to plugin) ──

// Helper to access plugin activate() return values
function _getPluginExports(pluginName) {
  const plugin = pluginHost._plugins.get(pluginName);
  if (!plugin || !plugin.active) return null;
  return plugin._exports || null;
}

async function openLargeFile(filePath, fileSize) {
  const exports = _getPluginExports('notepadclone-large-file');
  if (exports && exports.openLargeFile) {
    await exports.openLargeFile(filePath, fileSize);
  }
}

// ── Progress listener for large file indexing ──

window.api.onLargeFileProgress((data) => {
  const fill = document.getElementById('lfv-progress-fill');
  const text = document.getElementById('lfv-progress-text');
  if (fill) fill.style.width = `${data.percent}%`;
  if (text) text.textContent = `${data.percent}%`;
});

// ── File type detection helpers (delegating to plugins) ──

function isMarkdownFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

function isTableFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return true;
  if (lower.endsWith('.json') || lower.endsWith('.xml')) return 'maybe';
  return false;
}

function isTableJSON(content) {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null;
  } catch { return false; }
}

function isTableXML(content) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'application/xml');
    if (doc.querySelector('parsererror')) return false;
    const root = doc.documentElement;
    const children = root.children;
    if (children.length < 2) return false;
    const firstTag = children[0].tagName;
    let sameCount = 0;
    for (const child of children) {
      if (child.tagName === firstTag) sameCount++;
    }
    return sameCount >= children.length * 0.8;
  } catch { return false; }
}

function isDiagramFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return lower.endsWith('.mmd') || lower.endsWith('.mermaid');
}

function isTreeFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('.xml');
}

// ── Create a tab for a file object ──

function createTabForFile(file) {
  const filename = file.filePath.split(/[/\\]/).pop();
  const tabId = tabManager.createTab(filename, file.filePath, file.encoding || 'UTF-8');
  tabManager.setFilePath(tabId, file.filePath);
  const langInfo = editorManager.createEditorForTab(tabId, file.content, filename);
  const tab = tabManager.getTab(tabId);

  // Detect markdown files — default to read mode
  if (isMarkdownFile(filename)) {
    tab.isMarkdown = true;
    tab.markdownMode = 'read';
  }

  // Detect table files — default to table mode
  const tableCheck = isTableFile(filename);
  if (tableCheck === true) {
    tab.isTableFile = true;
    tab.tableMode = 'table';
    tab.isSpreadsheet = true;
    tab.spreadsheetMode = 'edit';
  } else if (tableCheck === 'maybe') {
    if ((filename.toLowerCase().endsWith('.json') && isTableJSON(file.content)) ||
        (filename.toLowerCase().endsWith('.xml') && isTableXML(file.content))) {
      tab.isTableFile = true;
      tab.tableMode = 'table';
    }
  }

  // Detect diagram files
  if (isDiagramFile(filename)) {
    tab.isDiagram = true;
    tab.diagramMode = 'diagram';
  }

  // Detect tree files
  if (isTreeFile(filename)) {
    tab.isTreeFile = true;
    tab.treeMode = tab.isTableFile ? 'edit' : 'tree';
  }

  tabManager.activate(tabId);

  statusBar.updateLineEnding(file.lineEnding || 'LF');
  statusBar.updateEncoding(file.encoding || 'UTF-8');
  if (!tab.isMarkdown && !tab.isTableFile && !(tab.isTreeFile && tab.treeMode === 'tree') && !tab.isDiagram) {
    statusBar.updateLanguage(langInfo.displayName);
  }

  return tabId;
}

// ── Open a file by path ──

async function openFileByPath(filePath, lineNumber) {
  const existingTabId = tabManager.findTabByPath(filePath);
  if (existingTabId) {
    tabManager.activate(existingTabId);
    const tab = tabManager.getTab(existingTabId);
    if (lineNumber && tab && tab.isLargeFile) {
      const exports = _getPluginExports('notepadclone-large-file');
      if (exports) {
        const viewer = exports.getViewerForTab(existingTabId);
        if (viewer) viewer.scrollToLine(lineNumber);
      }
    } else if (lineNumber) {
      editorManager.revealLine(existingTabId, lineNumber);
    }
    return;
  }

  let file;
  try {
    file = await window.api.readFileByPath(filePath);
  } catch (err) {
    statusBar.showMessage(`Failed to open file: ${err.message}`);
    return;
  }
  if (!file) return;

  if (file.isLargeFile) {
    await openLargeFile(file.filePath, file.size);
    return;
  }

  const tabId = createTabForFile(file);
  if (lineNumber) editorManager.revealLine(tabId, lineNumber);
}

// ── Help Documents ──

function openHelpDocument(title, content) {
  for (const [id, tab] of tabManager.getAllTabs()) {
    if (tab.title === title) {
      tabManager.activate(id);
      return;
    }
  }
  const tabId = tabManager.createTab(title);
  editorManager.createEditorForTab(tabId, content, title);
  const tab = tabManager.getTab(tabId);
  tab.isMarkdown = true;
  tab.markdownMode = 'read';
  tabManager.activate(tabId);
}

// ── Actions ──

function newFile() {
  const title = `new ${newFileCounter++}`;
  const tabId = tabManager.createTab(title);
  editorManager.createEditorForTab(tabId, '', title);
  editorManager.activateTab(tabId);
  statusBar.updateLanguage('Plain Text');
}

async function openFile() {
  let files;
  try {
    files = await window.api.openFile();
  } catch (err) {
    statusBar.showMessage(`Failed to open file: ${err.message}`);
    return;
  }
  if (!files) return;

  for (const file of files) {
    const existingTabId = tabManager.findTabByPath(file.filePath);
    if (existingTabId) {
      tabManager.activate(existingTabId);
      continue;
    }
    if (file.isLargeFile) {
      await openLargeFile(file.filePath, file.size);
      continue;
    }
    createTabForFile(file);
  }
}

async function openFolder() {
  commandRegistry.execute('fileExplorer.openFolder');
}

async function saveFile() {
  const tabId = tabManager.getActiveTabId();
  if (!tabId) return;
  const tab = tabManager.getTab(tabId);
  if (tab.isLargeFile) return;

  const content = editorManager.getContent(tabId);

  if (tab.filePath) {
    try {
      const result = await window.api.saveFile(tab.filePath, content, tab.encoding);
      if (result.success) {
        tabManager.setDirty(tabId, false);
        refreshGitStatus();
      } else {
        statusBar.showMessage(`Save failed: ${result.error}`);
      }
      return result.success;
    } catch (err) {
      statusBar.showMessage(`Save failed: ${err.message}`);
      return false;
    }
  } else {
    return await saveFileAs();
  }
}

async function saveFileAs() {
  const tabId = tabManager.getActiveTabId();
  if (!tabId) return false;
  const tab = tabManager.getTab(tabId);
  if (tab.isLargeFile) return false;

  const content = editorManager.getContent(tabId);
  let result;
  try {
    result = await window.api.saveFileAs(content, tab.filePath || tab.title, tab.encoding);
  } catch (err) {
    statusBar.showMessage(`Save As failed: ${err.message}`);
    return false;
  }

  if (result) {
    tabManager.setFilePath(tabId, result.filePath);
    const filename = result.filePath.split(/[/\\]/).pop();
    tabManager.setTitle(tabId, filename);
    tabManager.setDirty(tabId, false);

    if (isMarkdownFile(filename) && !tab.isMarkdown) {
      tab.isMarkdown = true;
      tab.markdownMode = 'edit';
      viewerRegistry.updateToolbars(tab);
      statusBar.updateLanguage('Markdown (Edit)');
    } else if (!isMarkdownFile(filename) && tab.isMarkdown) {
      tab.isMarkdown = false;
      delete tab.markdownMode;
      viewerRegistry.updateToolbars(tab);
      const langInfo = editorManager.getLanguageInfo(tabId);
      statusBar.updateLanguage(langInfo.displayName);
    } else {
      const langInfo = editorManager.getLanguageInfo(tabId);
      statusBar.updateLanguage(langInfo.displayName);
    }

    window.api.notifyActiveFile(result.filePath);
    refreshGitStatus();
    return true;
  }
  return false;
}

async function saveTab(tabId) {
  const tab = tabManager.getTab(tabId);
  if (!tab || tab.isLargeFile) return false;

  const content = editorManager.getContent(tabId);

  if (tab.filePath) {
    const result = await window.api.saveFile(tab.filePath, content, tab.encoding);
    if (result.success) {
      tabManager.setDirty(tabId, false);
      return true;
    }
    statusBar.showMessage(`Save failed: ${result.error}`);
    return false;
  }

  const result = await window.api.saveFileAs(content, tab.title, tab.encoding);
  if (result) {
    tabManager.setFilePath(tabId, result.filePath);
    const filename = result.filePath.split(/[/\\]/).pop();
    tabManager.setTitle(tabId, filename);
    tabManager.setDirty(tabId, false);
    return true;
  }
  return false;
}

tabManager.setSaveCallback(saveTab);

function toggleColumnSelection() {
  const enabled = editorManager.toggleColumnSelection();
  const btn = document.getElementById('btn-column-select');
  btn.classList.toggle('toolbar-btn-active', enabled);
  document.getElementById('status-selection-mode').textContent = enabled ? 'Column' : 'Normal';
}

// ── Go To Line Dialog ──

let goToLineOverlay = null;

function showGoToLineDialog() {
  const editor = editorManager.getActiveEditor();
  if (!editor) return;

  if (goToLineOverlay) {
    goToLineOverlay.remove();
    goToLineOverlay = null;
  }

  const model = editor.getModel();
  const totalLines = model ? model.getLineCount() : 1;

  const overlay = document.createElement('div');
  overlay.className = 'goto-line-overlay dialog-overlay';
  overlay.innerHTML = `
    <div class="goto-line-dialog dialog-box">
      <label>Go to Line (1 - ${totalLines}):</label>
      <input type="number" id="goto-line-input" min="1" max="${totalLines}" value="${editor.getPosition().lineNumber}">
      <div class="goto-line-buttons dialog-footer">
        <button id="goto-line-cancel" class="dialog-btn">Cancel</button>
        <button id="goto-line-go" class="dialog-btn dialog-btn-primary">Go</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  goToLineOverlay = overlay;

  const input = overlay.querySelector('#goto-line-input');
  input.select();
  input.focus();

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeyDown);

  function close() {
    overlay.remove();
    goToLineOverlay = null;
    document.removeEventListener('keydown', onKeyDown);
  }

  function goToLine() {
    const line = parseInt(input.value, 10);
    if (line >= 1 && line <= totalLines) {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    }
    close();
  }

  overlay.querySelector('#goto-line-go').addEventListener('click', goToLine);
  overlay.querySelector('#goto-line-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      goToLine();
    }
  });
}

// ── File Watching ──

window.api.onFileChanged(async (filePath) => {
  try {
    const tabId = tabManager.findTabByPath(filePath);
    if (!tabId) return;

    const tab = tabManager.getTab(tabId);
    if (tab.isLargeFile) return;

    if (tab.dirty) {
      const filename = filePath.split(/[/\\]/).pop();
      tabManager.setTitle(tabId, `${filename} [changed on disk]`);
    } else {
      const file = await window.api.reloadFile(filePath);
      if (file) {
        editorManager.setContent(tabId, file.content);
        tabManager.setDirty(tabId, false);
        // If this is the active tab and in a viewer mode, re-activate to refresh
        if (tabId === tabManager.getActiveTabId()) {
          tabManager.activate(tabId);
        }
      }
    }
  } catch (err) {
    console.error('File change handler error:', err);
  }
});

// ── Toolbar Buttons ──

document.getElementById('toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.toolbar-btn');
  if (!btn) return;

  const action = btn.dataset.action;
  switch (action) {
    case 'new': newFile(); break;
    case 'open': openFile(); break;
    case 'save': saveFile(); break;
    case 'undo': editorManager.undo(); break;
    case 'redo': editorManager.redo(); break;
    case 'find': commandRegistry.execute('findReplace.find'); break;
    case 'replace': editorManager.replace(); break;
    case 'find-in-files': commandRegistry.execute('findReplace.findInFiles'); break;
    case 'word-wrap': editorManager.toggleWordWrap(); break;
    case 'column-select': toggleColumnSelection(); break;
    case 'sql-query': commandRegistry.execute('sqlQuery.toggle'); break;
    case 'terminal-toggle': commandRegistry.execute('terminal.toggle'); break;
    case 'git-init': commandRegistry.execute('git.init'); break;
    case 'git-stage': commandRegistry.execute('git.stageAll'); break;
    case 'git-stage-file': commandRegistry.execute('git.stageFile'); break;
    case 'git-commit': commandRegistry.execute('git.commit'); break;
    case 'git-push': commandRegistry.execute('git.push'); break;
    case 'git-pull': commandRegistry.execute('git.pull'); break;
    case 'git-history': commandRegistry.execute('git.fileHistory'); break;
    case 'notes-toggle': {
      const _clExp = _getPluginExports('notepadclone-captains-log');
      if (_clExp) { const _clP = _clExp.getPanel(); if (_clP.isVisible()) { _clP.flushSave(); _clP.hide(); } }
      commandRegistry.execute('notes.toggle');
      break;
    }
    case 'markdown-toggle': commandRegistry.execute('markdown.toggleMode'); break;
    case 'table-toggle': commandRegistry.execute('table.toggleMode'); break;
    case 'tree-toggle': commandRegistry.execute('tree.toggleMode'); break;
    case 'new-spreadsheet': commandRegistry.execute('spreadsheet.new'); break;
    case 'spreadsheet-toggle': commandRegistry.execute('spreadsheet.toggleMode'); break;
    case 'new-diagram': commandRegistry.execute('diagram.new'); break;
    case 'diagram-toggle': commandRegistry.execute('diagram.toggleSplit'); break;
    case 'diagram-export': commandRegistry.execute('diagram.exportSvg'); break;
  }
});

// ── Menu Events (from main process) ──

window.api.onMenuNewFile(() => newFile());
window.api.onMenuOpenFile(() => openFile());
window.api.onMenuOpenFolder(() => openFolder());
window.api.onMenuSave(() => saveFile());
window.api.onMenuSaveAs(() => saveFileAs());
window.api.onMenuCloseTab(() => {
  const tabId = tabManager.getActiveTabId();
  if (tabId) tabManager.closeTab(tabId);
});
window.api.onMenuUndo(() => editorManager.undo());
window.api.onMenuRedo(() => editorManager.redo());
window.api.onMenuFind(() => commandRegistry.execute('findReplace.find'));
window.api.onMenuReplace(() => editorManager.replace());
window.api.onMenuFindInFiles(() => commandRegistry.execute('findReplace.findInFiles'));
window.api.onMenuToggleWordWrap(() => editorManager.toggleWordWrap());
window.api.onMenuToggleShowAllChars(() => editorManager.toggleShowAllCharacters());
window.api.onMenuToggleExplorer(() => commandRegistry.execute('fileExplorer.toggle'));
window.api.onMenuToggleColumnSelection(() => toggleColumnSelection());
window.api.onMenuZoomIn(() => editorManager.zoomIn());
window.api.onMenuZoomOut(() => editorManager.zoomOut());
window.api.onMenuResetZoom(() => editorManager.resetZoom());
window.api.onMenuOpenRecent((filePath) => openFileByPath(filePath));
window.api.onMenuGoToLine(() => showGoToLineDialog());
window.api.onMenuShowRecentFiles(() => commandRegistry.execute('recentFiles.show'));
window.api.onMenuClipboardHistory(() => commandRegistry.execute('clipboardHistory.show'));
window.api.onMenuSqlQuery(() => commandRegistry.execute('sqlQuery.toggle'));
window.api.onMenuSnippets(() => commandRegistry.execute('snippets.show'));
window.api.onMenuToggleTerminal(() => commandRegistry.execute('terminal.toggle'));
window.api.onMenuCompareTabs(() => commandRegistry.execute('compareTabs.show'));
window.api.onMenuGitHistory(() => commandRegistry.execute('git.fileHistory'));
window.api.onMenuToggleNotes(() => {
  // If Captain's Log is visible, hide it first
  const clExports = _getPluginExports('notepadclone-captains-log');
  if (clExports) {
    const clPanel = clExports.getPanel();
    if (clPanel.isVisible()) {
      clPanel.flushSave();
      clPanel.hide();
    }
  }
  commandRegistry.execute('notes.toggle');
});
window.api.onMenuToggleCaptainsLog(() => commandRegistry.execute('captainsLog.toggle'));
window.api.onMenuNewSpreadsheet(() => commandRegistry.execute('spreadsheet.new'));
window.api.onMenuNewDiagram(() => commandRegistry.execute('diagram.new'));
window.api.onMenuExportDiagramSvg(() => commandRegistry.execute('diagram.exportSvg'));
window.api.onMenuToggleTreeView(() => commandRegistry.execute('tree.toggleMode'));
window.api.onMenuCommandPalette(() => commandRegistry.execute('commandPalette.show'));
window.api.onMenuPluginManager(() => commandRegistry.execute('pluginManager.show'));
window.api.onMenuOptions(() => commandRegistry.execute('options.show'));

// Help documents
window.api.onMenuHelpPluginDev(() => eventBus.emit('help:open', { title: 'Plugin Development Guide.md', content: PLUGIN_DEVELOPMENT_GUIDE }));
window.api.onMenuHelpPluginUser(() => eventBus.emit('help:open', { title: 'Using Plugins.md', content: PLUGIN_USER_GUIDE }));
window.api.onMenuHelpSqlQuery(() => commandRegistry.execute('sqlQuery.help'));

// Text transforms (via core-editing plugin)
window.api.onTextTransform((type) => {
  commandRegistry.execute('core-editing.textTransform', type);
});

// Let command registry handle all plugin-registered shortcuts
commandRegistry.setupKeyboardShortcuts();

// ── Window Close Flow ──

window.api.onGetDirtyTabs(() => {
  const dirtyTabs = [];
  for (const [tabId, tab] of tabManager.getAllTabs()) {
    if (tab.dirty) {
      dirtyTabs.push({ tabId, title: tab.title, filePath: tab.filePath });
    }
  }
  window.api.sendDirtyTabsResponse(dirtyTabs);
});

window.api.onSaveTab(async (tabId) => {
  const saved = await saveTab(tabId);
  window.api.sendSaveTabResponse(saved);
});

// ── Start with one blank tab ──
newFile();
