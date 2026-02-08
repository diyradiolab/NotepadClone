import './styles/main.css';
import './styles/notepadpp-theme.css';
import './styles/file-explorer.css';
import './styles/find-in-files.css';
import './styles/large-file-viewer.css';
import './styles/recent-files-dialog.css';
import './styles/clipboard-history-dialog.css';
import './styles/compare-dialog.css';
import './styles/git-commit-dialog.css';
import './styles/sql-query-panel.css';
import './styles/git-history-panel.css';
import './styles/markdown-preview.css';
import './styles/table-viewer.css';
import './styles/notes-panel.css';
import './styles/tree-viewer.css';
import './styles/spreadsheet-viewer.css';
import { EditorManager } from './editor/editor-manager';
import { TabManager } from './components/tab-manager';
import { StatusBar } from './components/status-bar';
import { FileExplorer } from './components/file-explorer';
import { FindInFiles } from './components/find-in-files';
import { LargeFileViewer } from './editor/large-file-viewer';
import { RecentFilesDialog } from './components/recent-files-dialog';
import { ClipboardHistoryDialog } from './components/clipboard-history-dialog';
import { CompareTabDialog } from './components/compare-tab-dialog';
import { GitCommitDialog } from './components/git-commit-dialog';
import { SqlQueryPanel } from './components/sql-query-panel';
import { GitHistoryPanel } from './components/git-history-panel';
import { setEditorTheme } from './editor/monaco-setup';
import { applyTransform } from './editor/text-transforms';
import { MarkdownPreview } from './components/markdown-preview';
import { TableViewer, isTableFile, isTableJSON, isTableXML } from './components/table-viewer';
import { TreeViewer } from './components/tree-viewer';
import { NotesPanel } from './components/notes-panel';
import { SpreadsheetViewer } from './components/spreadsheet-viewer';
import { formatMarkdown } from './editor/markdown-format';
import { SQL_QUERY_HELP } from './help/sql-query-help';

// ── Initialize Components ──
const editorContainer = document.getElementById('editor-container');
const tabBar = document.getElementById('tab-bar');
const explorerContainer = document.getElementById('file-explorer');
const fifContainer = document.getElementById('find-in-files');

const editorManager = new EditorManager(editorContainer);
const tabManager = new TabManager(tabBar);
const statusBar = new StatusBar();
const fileExplorer = new FileExplorer(explorerContainer);
const findInFiles = new FindInFiles(fifContainer, editorManager, tabManager);
const sqlQueryPanel = new SqlQueryPanel(
  document.getElementById('sql-query'), editorManager, tabManager
);
const recentFilesDialog = new RecentFilesDialog();
const clipboardHistoryDialog = new ClipboardHistoryDialog();
const compareTabDialog = new CompareTabDialog();
const gitCommitDialog = new GitCommitDialog();
const gitHistoryPanel = new GitHistoryPanel(tabManager, editorManager);
const markdownPreview = new MarkdownPreview(editorContainer);
const tableViewer = new TableViewer(editorContainer);
const treeViewer = new TreeViewer(editorContainer);
const notesPanel = new NotesPanel(document.getElementById('notes-panel'));
const spreadsheetViewer = new SpreadsheetViewer(editorContainer);

recentFilesDialog.onFileOpen((filePath) => openFileByPath(filePath));

sqlQueryPanel.onRowClick((lineNumber) => {
  const tabId = tabManager.getActiveTabId();
  if (!tabId) return;
  const tab = tabManager.getTab(tabId);

  // If tab is in spreadsheet/table/tree/markdown mode, switch to editor first
  if (tab && tab.isSpreadsheet && tab.spreadsheetMode === 'spreadsheet') {
    tab.spreadsheetMode = 'edit';
    spreadsheetViewer.destroy();
    editorManager.activateTab(tabId);
    updateSpreadsheetToolbar(true, 'edit');
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
  } else if (tab && tab.isTableFile && tab.tableMode === 'table') {
    tab.tableMode = 'edit';
    tableViewer.destroy();
    editorManager.activateTab(tabId);
    updateTableToolbar(true, 'edit');
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
  } else if (tab && tab.isTreeFile && tab.treeMode === 'tree') {
    tab.treeMode = 'edit';
    treeViewer.destroy();
    editorManager.activateTab(tabId);
    updateTreeToolbar(true, 'edit');
    updateTableToolbar(tab.isTableFile || false, tab.isTableFile ? 'edit' : undefined);
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
  } else if (tab && tab.isMarkdown && tab.markdownMode === 'read') {
    tab.markdownMode = 'edit';
    editorManager.activateTab(tabId);
    updateMarkdownToolbar(true, 'edit');
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
  }

  editorManager.revealLine(tabId, lineNumber);
});

tableViewer.onRowClick((lineNumber) => {
  const tabId = tabManager.getActiveTabId();
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.isTableFile) return;
  // Switch to editor mode, then jump to line
  tab.tableMode = 'edit';
  tableViewer.destroy();
  editorManager.activateTab(tabId);
  updateTableToolbar(true, 'edit');
  updateMarkdownToolbar(false);
  const langInfo = editorManager.getLanguageInfo(tabId);
  statusBar.updateLanguage(langInfo.displayName);
  editorManager.revealLine(tabId, lineNumber);
});

treeViewer.onNodeClick((lineNumber) => {
  const tabId = tabManager.getActiveTabId();
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.isTreeFile) return;
  // Switch to editor mode, then jump to line
  tab.treeMode = 'edit';
  treeViewer.destroy();
  editorManager.activateTab(tabId);
  updateTreeToolbar(true, 'edit');
  updateTableToolbar(tab.isTableFile || false, tab.isTableFile ? 'edit' : undefined);
  updateMarkdownToolbar(false);
  const langInfo = editorManager.getLanguageInfo(tabId);
  statusBar.updateLanguage(langInfo.displayName);
  editorManager.revealLine(tabId, lineNumber);
});

compareTabDialog.onSelect((otherTabId) => {
  const activeTabId = tabManager.getActiveTabId();
  if (!activeTabId) return;
  const activeTab = tabManager.getTab(activeTabId);
  const otherTab = tabManager.getTab(otherTabId);
  if (!activeTab || !otherTab) return;

  const activeContent = editorManager.getContent(activeTabId);
  const otherContent = editorManager.getContent(otherTabId);

  const diffTitle = `${activeTab.title} ↔ ${otherTab.title}`;
  const diffTabId = tabManager.createTab(diffTitle);
  const diffTab = tabManager.getTab(diffTabId);
  diffTab.isDiffTab = true;

  editorManager.createDiffTab(diffTabId, otherContent, activeContent, otherTab.title, activeTab.title);
  editorManager.activateTab(diffTabId);
  statusBar.updateLanguage('Diff');
});

clipboardHistoryDialog.onPaste((text) => {
  const editor = editorManager.getActiveEditor();
  if (!editor) return;
  const selection = editor.getSelection();
  editor.executeEdits('clipboard-ring', [{
    range: selection,
    text,
  }]);
  editor.focus();
});

// Track large file viewers per tab
const largeFileViewers = new Map(); // tabId → LargeFileViewer

let newFileCounter = 1;
let sheetCounter = 1;
let currentFolderPath = null;

// ── Git State ──

let gitState = { isRepo: false, branch: '', dirtyCount: 0, hasRemote: false, repoRoot: null };

const gitIndicator = document.getElementById('git-status-indicator');
const gitInitBtn = document.getElementById('git-init-btn');
const gitStageBtn = document.getElementById('git-stage-btn');
const gitStageFileBtn = document.getElementById('git-stage-file-btn');
const gitCommitBtn = document.getElementById('git-commit-btn');
const gitPushBtn = document.getElementById('git-push-btn');
const gitPullBtn = document.getElementById('git-pull-btn');
const gitHistoryBtn = document.getElementById('git-history-btn');

function getActiveFileDirPath() {
  const tabId = tabManager.getActiveTabId();
  if (tabId) {
    const tab = tabManager.getTab(tabId);
    if (tab && tab.filePath) {
      const parts = tab.filePath.split(/[/\\]/);
      parts.pop();
      const dir = parts.join('/');
      if (dir) return dir;
    }
  }
  return currentFolderPath || null;
}

async function refreshGitStatus() {
  try {
    const dirPath = getActiveFileDirPath();
    gitState = await window.api.gitStatus(dirPath);
    updateGitUI();
  } catch (err) {
    console.error('Git status refresh failed:', err);
  }
}

function updateGitUI() {
  const hasDirPath = !!getActiveFileDirPath();

  // Indicator color + tooltip
  gitIndicator.classList.toggle('git-active', gitState.isRepo);
  if (gitState.isRepo) {
    let tip = `Branch: ${gitState.branch}`;
    if (gitState.dirtyCount > 0 && gitState.changedFiles) {
      tip += `\n${gitState.dirtyCount} changed, ${gitState.stagedCount || 0} staged:\n`;
      tip += gitState.changedFiles.map(f => `  ${f.staged ? '*' : ' '} ${f.status} ${f.file}`).join('\n');
    } else {
      tip += '\nWorking tree clean';
    }
    gitIndicator.title = tip;
  } else {
    gitIndicator.title = 'Git: not a repository';
  }

  // Show/hide buttons
  gitInitBtn.style.display = (!gitState.isRepo && hasDirPath) ? '' : 'none';
  gitStageBtn.style.display = gitState.isRepo ? '' : 'none';
  gitStageFileBtn.style.display = gitState.isRepo ? '' : 'none';
  gitCommitBtn.style.display = gitState.isRepo ? '' : 'none';
  gitPushBtn.style.display = (gitState.isRepo && gitState.hasRemote) ? '' : 'none';
  gitPullBtn.style.display = (gitState.isRepo && gitState.hasRemote) ? '' : 'none';

  // Active tab state for button visibility
  const activeTab = tabManager.getTab(tabManager.getActiveTabId());
  const hasActiveFile = activeTab && activeTab.filePath;

  // History button: visible when repo is active and active tab has a file
  gitHistoryBtn.style.display = (gitState.isRepo && hasActiveFile) ? '' : 'none';

  // Disable stage when nothing dirty
  gitStageBtn.disabled = gitState.dirtyCount === 0;

  // Disable stage-file when active tab has no file
  gitStageFileBtn.disabled = !hasActiveFile;

  // Status bar
  if (gitState.isRepo) {
    statusBar.updateGit(gitState.branch, gitState.dirtyCount);
  } else {
    statusBar.clearGit();
  }
}

async function gitInit() {
  const dirPath = getActiveFileDirPath();
  if (!dirPath) return;
  const result = await window.api.gitInit(dirPath);
  if (result.success) {
    statusBar.showMessage('Git repository initialized');
  } else {
    statusBar.showMessage(`Git init failed: ${result.error}`);
  }
  await refreshGitStatus();
}

async function gitStageAll() {
  const dirPath = getActiveFileDirPath();
  if (!dirPath) return;
  const result = await window.api.gitStageAll(dirPath);
  if (result.success) {
    statusBar.showMessage('All changes staged');
  } else {
    statusBar.showMessage(`Stage failed: ${result.error}`);
  }
  await refreshGitStatus();
}

async function gitStageFile() {
  const tabId = tabManager.getActiveTabId();
  if (!tabId) return;
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.filePath) {
    statusBar.showMessage('No file to stage (unsaved tab)');
    return;
  }
  const dirPath = getActiveFileDirPath();
  if (!dirPath) return;
  const result = await window.api.gitStageFile(dirPath, tab.filePath);
  if (result.success) {
    const filename = tab.filePath.split(/[/\\]/).pop();
    statusBar.showMessage(`Staged: ${filename}`);
  } else {
    statusBar.showMessage(`Stage failed: ${result.error}`);
  }
  await refreshGitStatus();
}

function gitCommitOpen() {
  gitCommitDialog.show(gitState);
}

gitCommitDialog.onCommit(async (message) => {
  const dirPath = getActiveFileDirPath();
  if (!dirPath) return;
  const result = await window.api.gitCommit(dirPath, message);
  if (result.success) {
    statusBar.showMessage(result.summary || 'Committed');
  } else {
    statusBar.showMessage(`Commit failed: ${result.error}`);
  }
  await refreshGitStatus();
});

async function gitPush() {
  const dirPath = getActiveFileDirPath();
  if (!dirPath) return;
  statusBar.showMessage('Pushing...');
  const result = await window.api.gitPush(dirPath);
  if (result.success) {
    statusBar.showMessage('Pushed successfully');
  } else {
    statusBar.showMessage(`Push failed: ${result.error}`);
  }
  await refreshGitStatus();
}

async function gitPull() {
  const dirPath = getActiveFileDirPath();
  if (!dirPath) return;
  statusBar.showMessage('Pulling...');
  const result = await window.api.gitPull(dirPath);
  if (result.success) {
    statusBar.showMessage('Pulled successfully');
  } else {
    statusBar.showMessage(`Pull failed: ${result.error}`);
  }
  await refreshGitStatus();
}

function showGitFileHistory() {
  const tabId = tabManager.getActiveTabId();
  if (!tabId) return;
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.filePath) return;
  gitHistoryPanel.show(tab.filePath);
}

// ── Theme Logic ──

function resolveTheme(preference) {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  // system: check OS preference
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.setAttribute('data-theme', resolved);
  setEditorTheme(resolved === 'dark' ? 'notepadpp-dark' : 'notepadpp');
}

// Init theme on load
(async function initTheme() {
  const theme = await window.api.getTheme();
  applyTheme(theme);
})();

// Listen for theme changes from main process (menu radio or OS change)
window.api.onThemeChanged((theme) => {
  applyTheme(theme);
});

// Listen for OS theme changes when in 'system' mode
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', async () => {
  const theme = await window.api.getTheme();
  if (theme === 'system') {
    applyTheme('system');
  }
});

// ── Markdown Preview ──

const mdToggleBtn = document.getElementById('btn-markdown-toggle');
const mdSeparator = document.getElementById('md-separator');
const mdToggleIcon = document.getElementById('md-toggle-icon');
const mdFormatToolbar = document.getElementById('markdown-format-toolbar');

// Eye icon for read mode (click to switch to edit)
const MD_ICON_EYE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>';
// Pencil icon for edit mode (click to switch to read)
const MD_ICON_PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';

function updateMarkdownToolbar(isMarkdown, mode) {
  if (!isMarkdown) {
    mdToggleBtn.style.display = 'none';
    mdSeparator.style.display = 'none';
    mdFormatToolbar.style.display = 'none';
    return;
  }
  mdToggleBtn.style.display = '';
  mdSeparator.style.display = '';
  if (mode === 'read') {
    mdToggleIcon.innerHTML = MD_ICON_PENCIL;
    mdToggleBtn.title = 'Switch to Edit Mode (Ctrl+Shift+M)';
    mdFormatToolbar.style.display = 'none';
  } else {
    mdToggleIcon.innerHTML = MD_ICON_EYE;
    mdToggleBtn.title = 'Switch to Read Mode (Ctrl+Shift+M)';
    mdFormatToolbar.style.display = '';
  }
}

function toggleMarkdownMode() {
  const tabId = tabManager.getActiveTabId();
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.isMarkdown) return;

  const entry = editorManager.editors.get(tabId);

  if (tab.markdownMode === 'read') {
    // Switch to edit
    tab.markdownMode = 'edit';
    markdownPreview.destroy();
    editorManager.activateTab(tabId);
    updateMarkdownToolbar(true, 'edit');
    statusBar.updateLanguage('Markdown (Edit)');
  } else {
    // Switch to read — save editor state first
    const editor = editorManager.getActiveEditor();
    if (editor && entry) {
      entry.viewState = editor.saveViewState();
      editor.dispose();
      entry.editor = null;
    }
    tab.markdownMode = 'read';
    editorManager.container.innerHTML = '';
    const content = entry.model.getValue();
    markdownPreview.render(content, tab.filePath);
    updateMarkdownToolbar(true, 'read');
    statusBar.updateLanguage('Markdown (Read)');
  }
}

function isMarkdownFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

// ── Markdown Formatting ──
document.getElementById('markdown-format-toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.mft-btn');
  if (!btn) return;
  formatMarkdown(btn.dataset.mdAction, editorManager.getActiveEditor());
});

// ── Table Viewer ──

const tvToggleBtn = document.getElementById('btn-table-toggle');
const tvSeparator = document.getElementById('tv-separator');
const tvToggleIcon = document.getElementById('tv-toggle-icon');

const TV_ICON_GRID = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2" width="13" height="12" rx="1"/><line x1="1.5" y1="5.5" x2="14.5" y2="5.5"/><line x1="1.5" y1="9" x2="14.5" y2="9"/><line x1="5.5" y1="5.5" x2="5.5" y2="14"/><line x1="10.5" y1="5.5" x2="10.5" y2="14"/></svg>';
const TV_ICON_PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';

function updateTableToolbar(isTable, mode) {
  if (!isTable) {
    tvToggleBtn.style.display = 'none';
    tvSeparator.style.display = 'none';
    return;
  }
  tvToggleBtn.style.display = '';
  tvSeparator.style.display = '';
  if (mode === 'table') {
    tvToggleIcon.innerHTML = TV_ICON_PENCIL;
    tvToggleBtn.title = 'Switch to Editor (Ctrl+Shift+T)';
  } else {
    tvToggleIcon.innerHTML = TV_ICON_GRID;
    tvToggleBtn.title = 'Switch to Table View (Ctrl+Shift+T)';
  }
}

function toggleTableMode() {
  const tabId = tabManager.getActiveTabId();
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.isTableFile) return;

  const entry = editorManager.editors.get(tabId);

  if (tab.tableMode === 'table') {
    // Switch to editor
    tab.tableMode = 'edit';
    tableViewer.destroy();
    editorManager.activateTab(tabId);
    updateTableToolbar(true, 'edit');
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
  } else {
    // Switch to table — save editor state first
    const editor = editorManager.getActiveEditor();
    if (editor && entry) {
      entry.viewState = editor.saveViewState();
      editor.dispose();
      entry.editor = null;
    }
    tab.tableMode = 'table';
    editorManager.container.innerHTML = '';
    const content = entry.model.getValue();
    tableViewer.render(content, tab.title);
    updateTableToolbar(true, 'table');
    statusBar.updateLanguage('Table View');
  }
}

// ── Tree Viewer ──

const treeToggleBtn = document.getElementById('btn-tree-toggle');
const treeSeparator = document.getElementById('tree-separator');
const treeToggleIcon = document.getElementById('tree-toggle-icon');

const TREE_ICON_TREE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="10" r="1.5"/><circle cx="13" cy="13" r="1.5"/><line x1="4.2" y1="3.7" x2="7.8" y2="5.5"/><line x1="4.2" y1="3.7" x2="7.8" y2="9.5"/><line x1="10.2" y1="10.7" x2="11.8" y2="12.5"/></svg>';
const TREE_ICON_PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';

function updateTreeToolbar(isTree, mode) {
  if (!isTree) {
    treeToggleBtn.style.display = 'none';
    treeSeparator.style.display = 'none';
    return;
  }
  treeToggleBtn.style.display = '';
  treeSeparator.style.display = '';
  if (mode === 'tree') {
    treeToggleIcon.innerHTML = TREE_ICON_PENCIL;
    treeToggleBtn.title = 'Switch to Editor (Ctrl+Shift+R)';
  } else {
    treeToggleIcon.innerHTML = TREE_ICON_TREE;
    treeToggleBtn.title = 'Switch to Tree View (Ctrl+Shift+R)';
  }
}

function toggleTreeMode() {
  const tabId = tabManager.getActiveTabId();
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.isTreeFile) return;

  const entry = editorManager.editors.get(tabId);

  if (tab.treeMode === 'tree') {
    // Switch to editor
    tab.treeMode = 'edit';
    treeViewer.destroy();
    editorManager.activateTab(tabId);
    updateTreeToolbar(true, 'edit');
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
  } else {
    // Switch to tree — save editor state first
    const editor = editorManager.getActiveEditor();
    if (editor && entry) {
      entry.viewState = editor.saveViewState();
      editor.dispose();
      entry.editor = null;
    }
    tab.treeMode = 'tree';
    editorManager.container.innerHTML = '';
    const content = entry.model.getValue();
    treeViewer.render(content, tab.title);
    updateTreeToolbar(true, 'tree');
    statusBar.updateLanguage('Tree View');
  }
}

function isTreeFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  return lower.endsWith('.json') || lower.endsWith('.xml');
}

// ── Spreadsheet Viewer ──

const ssToggleBtn = document.getElementById('btn-spreadsheet-toggle');
const ssSeparator = document.getElementById('ss-separator');
const ssToggleIcon = document.getElementById('ss-toggle-icon');

const SS_ICON_FX = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><text x="2" y="12" font-size="11" fill="currentColor" stroke="none" font-family="serif" font-style="italic">fx</text></svg>';
const SS_ICON_PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';

function updateSpreadsheetToolbar(show, mode) {
  if (!show) {
    ssToggleBtn.style.display = 'none';
    ssSeparator.style.display = 'none';
    return;
  }
  ssToggleBtn.style.display = '';
  ssSeparator.style.display = '';
  if (mode === 'spreadsheet') {
    ssToggleIcon.innerHTML = SS_ICON_PENCIL;
    ssToggleBtn.title = 'Switch to Editor';
  } else {
    ssToggleIcon.innerHTML = SS_ICON_FX;
    ssToggleBtn.title = 'Switch to Spreadsheet View';
  }
}

function toggleSpreadsheetMode() {
  const tabId = tabManager.getActiveTabId();
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.isSpreadsheet) return;

  const entry = editorManager.editors.get(tabId);

  if (tab.spreadsheetMode === 'spreadsheet') {
    // Switch to editor
    tab.spreadsheetMode = 'edit';
    spreadsheetViewer.destroy();
    editorManager.activateTab(tabId);
    updateSpreadsheetToolbar(true, 'edit');
    updateTableToolbar(tab.isTableFile || false, tab.isTableFile ? 'edit' : undefined);
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
  } else {
    // Switch to spreadsheet — save editor state first
    const editor = editorManager.getActiveEditor();
    if (editor && entry) {
      entry.viewState = editor.saveViewState();
      editor.dispose();
      entry.editor = null;
    }
    tab.spreadsheetMode = 'spreadsheet';
    // Also set tableMode to edit so table toggle shows correctly
    if (tab.isTableFile) tab.tableMode = 'edit';
    editorManager.container.innerHTML = '';
    editorManager.activeTabId = tabId;
    const content = entry ? entry.model.getValue() : '';
    spreadsheetViewer.render(content);
    spreadsheetViewer.onChange((csv) => {
      if (entry) entry.model.setValue(csv);
    });
    updateSpreadsheetToolbar(true, 'spreadsheet');
    updateTableToolbar(tab.isTableFile || false, tab.isTableFile ? 'edit' : undefined);
    statusBar.updateLanguage('Spreadsheet');
  }
}

function newSpreadsheet() {
  const title = `Sheet ${sheetCounter++}`;
  const tabId = tabManager.createTab(title);
  editorManager.createEditorForTab(tabId, '', title);
  const tab = tabManager.getTab(tabId);
  tab.isSpreadsheet = true;
  tab.spreadsheetMode = 'spreadsheet';
  tabManager.activate(tabId);
}

// ── Tab ↔ Editor Wiring ──

function deactivatePreviousEditor() {
  // Destroy spreadsheet viewer if previous tab was in spreadsheet mode
  const prevTab = editorManager.activeTabId ? tabManager.getTab(editorManager.activeTabId) : null;
  if (prevTab && prevTab.isSpreadsheet && prevTab.spreadsheetMode === 'spreadsheet') {
    spreadsheetViewer.destroy();
  }

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

  if (tab && tab.isSpreadsheet && tab.spreadsheetMode === 'spreadsheet') {
    deactivatePreviousEditor();
    editorManager.container.innerHTML = '';
    editorManager.activeTabId = tabId;
    const entry = editorManager.editors.get(tabId);
    const content = entry ? entry.model.getValue() : '';
    spreadsheetViewer.render(content);
    spreadsheetViewer.onChange((csv) => {
      if (entry) entry.model.setValue(csv);
    });
    statusBar.updateLanguage('Spreadsheet');
    updateSpreadsheetToolbar(true, 'spreadsheet');
    updateTableToolbar(false);
    updateTreeToolbar(false);
    updateMarkdownToolbar(false);
  } else if (tab && tab.isTreeFile && tab.treeMode === 'tree') {
    deactivatePreviousEditor();
    editorManager.container.innerHTML = '';
    editorManager.activeTabId = tabId;
    const entry = editorManager.editors.get(tabId);
    if (entry) {
      const content = entry.model.getValue();
      treeViewer.render(content, tab.title);
    }
    statusBar.updateLanguage('Tree View');
    updateTreeToolbar(true, 'tree');
    updateTableToolbar(tab.isTableFile || false, tab.isTableFile ? 'edit' : undefined);
    updateMarkdownToolbar(false);
    updateSpreadsheetToolbar(false);
  } else if (tab && tab.isTableFile && tab.tableMode === 'table') {
    deactivatePreviousEditor();
    editorManager.container.innerHTML = '';
    editorManager.activeTabId = tabId;
    const entry = editorManager.editors.get(tabId);
    if (entry) {
      const content = entry.model.getValue();
      tableViewer.render(content, tab.title);
    }
    statusBar.updateLanguage('Table View');
    updateTableToolbar(true, 'table');
    updateTreeToolbar(tab.isTreeFile || false, tab.isTreeFile ? 'edit' : undefined);
    updateMarkdownToolbar(false);
    updateSpreadsheetToolbar(tab.isSpreadsheet || false, tab.isSpreadsheet ? 'edit' : undefined);
  } else if (tab && tab.isMarkdown && tab.markdownMode === 'read') {
    deactivatePreviousEditor();
    editorManager.container.innerHTML = '';
    editorManager.activeTabId = tabId;
    const entry = editorManager.editors.get(tabId);
    if (entry) {
      const content = entry.model.getValue();
      markdownPreview.render(content, tab.filePath);
    }
    statusBar.updateLanguage('Markdown (Read)');
    updateMarkdownToolbar(true, 'read');
    updateTableToolbar(false);
    updateTreeToolbar(false);
    updateSpreadsheetToolbar(false);
  } else if (tab && tab.isLargeFile) {
    // Show large file viewer
    editorContainer.innerHTML = '';
    const viewer = largeFileViewers.get(tabId);
    if (viewer) {
      editorContainer.appendChild(viewer.container);
    }
    statusBar.updateLanguage('Large File');
    updateMarkdownToolbar(false);
    updateTableToolbar(false);
    updateTreeToolbar(false);
    updateSpreadsheetToolbar(false);
  } else if (tab && tab.isHistoryTab) {
    const entry = editorManager.editors.get(tabId);
    if (entry) {
      editorManager.activeTabId = tabId;
      editorManager.container.innerHTML = '';
      gitHistoryPanel._render(tabId, entry.filePath, entry.commits, entry.dirPath, entry.filename);
    }
    statusBar.updateLanguage('Git History');
    updateMarkdownToolbar(false);
    updateTableToolbar(false);
    updateTreeToolbar(false);
    updateSpreadsheetToolbar(false);
  } else if (tab && tab.isDiffTab) {
    editorManager.activateTab(tabId);
    statusBar.updateLanguage('Diff');
    updateMarkdownToolbar(false);
    updateTableToolbar(false);
    updateTreeToolbar(false);
    updateSpreadsheetToolbar(false);
  } else {
    editorManager.activateTab(tabId);
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
    // Show markdown toolbar if this is a .md file in edit mode
    if (tab && tab.isMarkdown) {
      updateMarkdownToolbar(true, 'edit');
      updateTableToolbar(false);
      updateTreeToolbar(false);
      updateSpreadsheetToolbar(false);
    } else if (tab && tab.isTableFile) {
      // Table file in edit mode
      updateTableToolbar(true, 'edit');
      updateTreeToolbar(tab.isTreeFile || false, tab.isTreeFile ? 'edit' : undefined);
      updateMarkdownToolbar(false);
      updateSpreadsheetToolbar(tab.isSpreadsheet || false, tab.isSpreadsheet ? 'edit' : undefined);
    } else if (tab && tab.isTreeFile) {
      // Tree file in edit mode (not table-compatible)
      updateTreeToolbar(true, 'edit');
      updateTableToolbar(false);
      updateMarkdownToolbar(false);
      updateSpreadsheetToolbar(false);
    } else {
      updateMarkdownToolbar(false);
      updateTableToolbar(false);
      updateTreeToolbar(false);
      updateSpreadsheetToolbar(false);
    }
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

  // Clean up spreadsheet viewer if active
  if (tab && tab.isSpreadsheet && tab.spreadsheetMode === 'spreadsheet') {
    spreadsheetViewer.destroy();
  }

  // Clean up markdown preview if active
  if (tab && tab.isMarkdown && tab.markdownMode === 'read') {
    markdownPreview.destroy();
  }

  // Clean up table viewer if active
  if (tab && tab.isTableFile && tab.tableMode === 'table') {
    tableViewer.destroy();
  }

  // Clean up tree viewer if active
  if (tab && tab.isTreeFile && tab.treeMode === 'tree') {
    treeViewer.destroy();
  }

  // Clean up history tab
  if (tab && tab.isHistoryTab) {
    gitHistoryPanel._disposeDiffEditor();
    editorManager.editors.delete(tabId);
    if (editorManager.activeTabId === tabId) {
      editorManager.activeTabId = null;
    }
  }

  // Clean up large file viewer
  if (tab && tab.isLargeFile) {
    const viewer = largeFileViewers.get(tabId);
    if (viewer) {
      viewer.destroy();
      largeFileViewers.delete(tabId);
    }
    window.api.closeLargeFile(tab.filePath);
  } else {
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
  clipboardHistoryDialog.show();
});

// ── Open a large file ──

async function openLargeFile(filePath, fileSize) {
  const existingTabId = tabManager.findTabByPath(filePath);
  if (existingTabId) {
    tabManager.activate(existingTabId);
    return;
  }

  const filename = filePath.split(/[/\\]/).pop();
  const tabId = tabManager.createTab(filename, filePath);
  tabManager.setFilePath(tabId, filePath);

  // Mark tab as large file
  const tab = tabManager.getTab(tabId);
  tab.isLargeFile = true;

  // Create a container for this viewer
  const viewerContainer = document.createElement('div');
  viewerContainer.style.width = '100%';
  viewerContainer.style.height = '100%';
  viewerContainer.style.position = 'relative';

  const viewer = new LargeFileViewer(viewerContainer);
  largeFileViewers.set(tabId, viewer);

  viewer.onCursorChange((line, col) => {
    if (tabId === tabManager.getActiveTabId()) {
      statusBar.updatePosition(line, col);
    }
  });

  // Show loading state (viewer defers _render to init(), so this is safe)
  editorContainer.innerHTML = '';
  editorContainer.appendChild(viewerContainer);
  viewerContainer.innerHTML = `
    <div class="lfv-loading">
      <div>Indexing large file...</div>
      <div class="lfv-progress-bar"><div class="lfv-progress-fill" id="lfv-progress-fill"></div></div>
      <div class="lfv-progress-text" id="lfv-progress-text">0%</div>
    </div>
  `;

  // Index the file
  let result;
  try {
    result = await window.api.openLargeFile(filePath);
  } catch (err) {
    viewerContainer.innerHTML = `<div class="lfv-loading"><div>Error: ${err.message}</div></div>`;
    return;
  }

  if (result.error) {
    viewerContainer.innerHTML = `<div class="lfv-loading"><div>Error: ${result.error}</div></div>`;
    return;
  }

  // Initialize the viewer (init calls _render and _bindEvents internally)
  try {
    await viewer.init(filePath, result.totalLines, result.fileSize);
  } catch (err) {
    viewerContainer.innerHTML = `<div class="lfv-loading"><div>Error initializing viewer: ${err.message}</div></div>`;
    return;
  }

  // Register "Open in Editor" override
  viewer.onOpenInEditor(async () => {
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    const confirmed = await window.api.showConfirmDialog(
      `This file is ${sizeMB} MB. Loading it into the editor may use significant memory and could slow down the application.\n\nContinue?`
    );
    if (!confirmed) return;

    // Tear down the large file viewer
    viewer.destroy();
    largeFileViewers.delete(tabId);

    // Read the full file content (bypasses size check, closes large file handle)
    const file = await window.api.readFileFull(filePath);
    if (!file) {
      statusBar.showMessage('Failed to read file');
      return;
    }

    // Clear the large file flag, set up as normal tab
    const tab2 = tabManager.getTab(tabId);
    tab2.isLargeFile = false;
    tab2.encoding = file.encoding || 'UTF-8';

    // Create a normal editor in the same tab
    const filename2 = filePath.split(/[/\\]/).pop();
    const langInfo = editorManager.createEditorForTab(tabId, file.content, filename2);
    editorManager.activateTab(tabId);

    statusBar.updateEncoding(file.encoding || 'UTF-8');
    statusBar.updateLineEnding(file.lineEnding || 'LF');
    statusBar.updateLanguage(langInfo.displayName);
  });

  const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
  statusBar.updateEncoding('UTF-8');
  statusBar.updateLineEnding('LF');
  statusBar.updateLanguage(`Large File (${sizeMB} MB)`);
}

// ── Progress listener for large file indexing ──

window.api.onLargeFileProgress((data) => {
  const fill = document.getElementById('lfv-progress-fill');
  const text = document.getElementById('lfv-progress-text');
  if (fill) fill.style.width = `${data.percent}%`;
  if (text) text.textContent = `${data.percent}%`;
});

// ── Create a tab for a file object (shared by openFileByPath and openFile) ──

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
    // CSV/TSV files also support spreadsheet mode
    tab.isSpreadsheet = true;
    tab.spreadsheetMode = 'edit'; // default to table view, spreadsheet available via toggle
  } else if (tableCheck === 'maybe') {
    if ((filename.toLowerCase().endsWith('.json') && isTableJSON(file.content)) ||
        (filename.toLowerCase().endsWith('.xml') && isTableXML(file.content))) {
      tab.isTableFile = true;
      tab.tableMode = 'table';
    }
  }

  // Detect tree files (JSON/XML) — default to tree if not table-compatible
  if (isTreeFile(filename)) {
    tab.isTreeFile = true;
    tab.treeMode = tab.isTableFile ? 'edit' : 'tree';
  }

  tabManager.activate(tabId);

  statusBar.updateLineEnding(file.lineEnding || 'LF');
  statusBar.updateEncoding(file.encoding || 'UTF-8');
  if (!tab.isMarkdown && !tab.isTableFile && !(tab.isTreeFile && tab.treeMode === 'tree')) {
    statusBar.updateLanguage(langInfo.displayName);
  }

  return tabId;
}

// ── Open a file by path (used by explorer, recent files, find in files) ──

async function openFileByPath(filePath, lineNumber) {
  const existingTabId = tabManager.findTabByPath(filePath);
  if (existingTabId) {
    tabManager.activate(existingTabId);
    const tab = tabManager.getTab(existingTabId);
    if (lineNumber && tab && tab.isLargeFile) {
      const viewer = largeFileViewers.get(existingTabId);
      if (viewer) viewer.scrollToLine(lineNumber);
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

  // Route to large file viewer
  if (file.isLargeFile) {
    await openLargeFile(file.filePath, file.size);
    return;
  }

  const tabId = createTabForFile(file);
  if (lineNumber) editorManager.revealLine(tabId, lineNumber);
}

// ── Help Documents ──

function openHelpDocument(title, content) {
  // Check if help tab is already open
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

    // Route large files
    if (file.isLargeFile) {
      await openLargeFile(file.filePath, file.size);
      continue;
    }

    createTabForFile(file);
  }
}

async function openFolder() {
  fileExplorer.show();
  await fileExplorer.openFolder();
  currentFolderPath = fileExplorer.rootPath;
  findInFiles.setSearchDir(currentFolderPath);
  refreshGitStatus();
}

async function saveFile() {
  const tabId = tabManager.getActiveTabId();
  if (!tabId) return;

  const tab = tabManager.getTab(tabId);
  if (tab.isLargeFile) return; // Large files are read-only for now

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
  if (tab.isLargeFile) return false; // Large files are read-only for now

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

    // Handle Save As to .md — transition to markdown mode
    if (isMarkdownFile(filename) && !tab.isMarkdown) {
      tab.isMarkdown = true;
      tab.markdownMode = 'edit'; // Stay in edit mode after Save As
      updateMarkdownToolbar(true, 'edit');
      statusBar.updateLanguage('Markdown (Edit)');
    } else if (!isMarkdownFile(filename) && tab.isMarkdown) {
      // Was .md, saved as something else — remove markdown mode
      tab.isMarkdown = false;
      delete tab.markdownMode;
      updateMarkdownToolbar(false);
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

// Save a specific tab by ID (used by save callback and window close flow)
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

  // No file path — need Save As
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

// Register save callback so TabManager can save tabs during close
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

  // Close existing dialog if open
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

  // Global Escape handler
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

// ── File Explorer → Open File ──

fileExplorer.onFileOpen((filePath) => {
  openFileByPath(filePath);
});

fileExplorer.onFileHistory((filePath) => {
  gitHistoryPanel.show(filePath);
});

// ── Find in Files → Open Result ──

findInFiles.onResultClick((filePath, line) => {
  if (filePath === null) {
    // Current document search — jump to line in active tab
    const tabId = tabManager.getActiveTabId();
    if (tabId) editorManager.revealLine(tabId, line);
  } else {
    openFileByPath(filePath, line);
  }
});

// ── File Watching ──

window.api.onFileChanged(async (filePath) => {
  try {
    const tabId = tabManager.findTabByPath(filePath);
    if (!tabId) return;

    const tab = tabManager.getTab(tabId);
    if (tab.isLargeFile) return; // Don't auto-reload large files

    if (tab.dirty) {
      const filename = filePath.split(/[/\\]/).pop();
      tabManager.setTitle(tabId, `${filename} [changed on disk]`);
    } else {
      const file = await window.api.reloadFile(filePath);
      if (file) {
        editorManager.setContent(tabId, file.content);
        tabManager.setDirty(tabId, false);
        // Re-render markdown preview if in read mode
        if (tab.isMarkdown && tab.markdownMode === 'read' && tabId === tabManager.getActiveTabId()) {
          const entry = editorManager.editors.get(tabId);
          if (entry) markdownPreview.render(entry.model.getValue(), tab.filePath);
        }
        // Re-render table viewer if in table mode
        if (tab.isTableFile && tab.tableMode === 'table' && tabId === tabManager.getActiveTabId()) {
          const entry = editorManager.editors.get(tabId);
          if (entry) tableViewer.render(entry.model.getValue(), tab.title);
        }
        // Re-render tree viewer if in tree mode
        if (tab.isTreeFile && tab.treeMode === 'tree' && tabId === tabManager.getActiveTabId()) {
          const entry = editorManager.editors.get(tabId);
          if (entry) treeViewer.render(entry.model.getValue(), tab.title);
        }
        // Re-render spreadsheet viewer if in spreadsheet mode
        if (tab.isSpreadsheet && tab.spreadsheetMode === 'spreadsheet' && tabId === tabManager.getActiveTabId()) {
          const entry = editorManager.editors.get(tabId);
          if (entry) {
            spreadsheetViewer.render(entry.model.getValue());
            spreadsheetViewer.onChange((csv) => {
              entry.model.setValue(csv);
            });
          }
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
    case 'find': findInFiles.show('document'); break;
    case 'replace': editorManager.replace(); break;
    case 'find-in-files': findInFiles.show('directory'); break;
    case 'word-wrap': editorManager.toggleWordWrap(); break;
    case 'column-select': toggleColumnSelection(); break;
    case 'sql-query': sqlQueryPanel.toggle(); break;
    case 'git-init': gitInit(); break;
    case 'git-stage': gitStageAll(); break;
    case 'git-stage-file': gitStageFile(); break;
    case 'git-commit': gitCommitOpen(); break;
    case 'git-push': gitPush(); break;
    case 'git-pull': gitPull(); break;
    case 'git-history': showGitFileHistory(); break;
    case 'notes-toggle': notesPanel.toggle(); break;
    case 'markdown-toggle': toggleMarkdownMode(); break;
    case 'table-toggle': toggleTableMode(); break;
    case 'tree-toggle': toggleTreeMode(); break;
    case 'new-spreadsheet': newSpreadsheet(); break;
    case 'spreadsheet-toggle': toggleSpreadsheetMode(); break;
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
window.api.onMenuFind(() => findInFiles.show('document'));
window.api.onMenuReplace(() => editorManager.replace());
window.api.onMenuFindInFiles(() => findInFiles.show('directory'));
window.api.onMenuToggleWordWrap(() => editorManager.toggleWordWrap());
window.api.onMenuToggleShowAllChars(() => editorManager.toggleShowAllCharacters());
window.api.onMenuToggleExplorer(() => fileExplorer.toggle());
window.api.onMenuToggleColumnSelection(() => toggleColumnSelection());
window.api.onMenuZoomIn(() => editorManager.zoomIn());
window.api.onMenuZoomOut(() => editorManager.zoomOut());
window.api.onMenuResetZoom(() => editorManager.resetZoom());
window.api.onMenuOpenRecent((filePath) => openFileByPath(filePath));
window.api.onMenuGoToLine(() => showGoToLineDialog());
window.api.onMenuShowRecentFiles(() => recentFilesDialog.show());
window.api.onMenuClipboardHistory(() => clipboardHistoryDialog.show());
window.api.onMenuSqlQuery(() => sqlQueryPanel.toggle());
window.api.onMenuCompareTabs(() => {
  compareTabDialog.show(tabManager.getAllTabs(), tabManager.getActiveTabId());
});
window.api.onMenuGitHistory(() => showGitFileHistory());

window.api.onMenuToggleNotes(() => notesPanel.toggle());
window.api.onMenuNewSpreadsheet(() => newSpreadsheet());
window.api.onMenuToggleTreeView(() => toggleTreeMode());

// Help documents
window.api.onMenuHelpSqlQuery(() => openHelpDocument('SQL Query Builder Guide.md', SQL_QUERY_HELP));

// Text transforms (Edit > Convert Case / Line Operations / Encode/Decode)
window.api.onTextTransform((type) => {
  const editor = editorManager.getActiveEditor();
  if (editor) applyTransform(editor, type, statusBar);
});

// ── Markdown Keyboard Shortcut (Ctrl+Shift+M) ──

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
    e.preventDefault();
    toggleMarkdownMode();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
    e.preventDefault();
    toggleTableMode();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
    e.preventDefault();
    notesPanel.toggle();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'R') {
    e.preventDefault();
    toggleTreeMode();
  }
});

// ── Window Close Flow (main asks renderer for dirty tabs / to save) ──

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

// ── Flush notes on close ──
window.addEventListener('beforeunload', () => {
  notesPanel.flushSave();
});

// ── Start with one blank tab ──
newFile();
