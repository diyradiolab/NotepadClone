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

// ── Initialize Components ──
const editorContainer = document.getElementById('editor-container');
const tabBar = document.getElementById('tab-bar');
const explorerContainer = document.getElementById('file-explorer');
const fifContainer = document.getElementById('find-in-files');

const editorManager = new EditorManager(editorContainer);
const tabManager = new TabManager(tabBar);
const statusBar = new StatusBar();
const fileExplorer = new FileExplorer(explorerContainer);
const findInFiles = new FindInFiles(fifContainer);
const sqlQueryPanel = new SqlQueryPanel(
  document.getElementById('sql-query'), editorManager, tabManager
);
const recentFilesDialog = new RecentFilesDialog();
const clipboardHistoryDialog = new ClipboardHistoryDialog();
const compareTabDialog = new CompareTabDialog();
const gitCommitDialog = new GitCommitDialog();
const gitHistoryPanel = new GitHistoryPanel(tabManager, editorManager);

recentFilesDialog.onFileOpen((filePath) => openFileByPath(filePath));

sqlQueryPanel.onRowClick((lineNumber) => {
  const tabId = tabManager.getActiveTabId();
  if (tabId) editorManager.revealLine(tabId, lineNumber);
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
  const dirPath = getActiveFileDirPath();
  gitState = await window.api.gitStatus(dirPath);
  updateGitUI();
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

  // History button: visible when repo is active and active tab has a file
  const activeTabForHistory = tabManager.getTab(tabManager.getActiveTabId());
  gitHistoryBtn.style.display = (gitState.isRepo && activeTabForHistory && activeTabForHistory.filePath) ? '' : 'none';

  // Disable stage when nothing dirty
  gitStageBtn.disabled = gitState.dirtyCount === 0;

  // Disable stage-file when active tab has no file
  const activeTab = tabManager.getTab(tabManager.getActiveTabId());
  gitStageFileBtn.disabled = !activeTab || !activeTab.filePath;

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

// ── Tab ↔ Editor Wiring ──

tabManager.onActivate((tabId) => {
  const tab = tabManager.getTab(tabId);

  if (tab && tab.isLargeFile) {
    // Show large file viewer
    editorContainer.innerHTML = '';
    const viewer = largeFileViewers.get(tabId);
    if (viewer) {
      editorContainer.appendChild(viewer.container);
    }
    statusBar.updateLanguage('Large File');
  } else if (tab && tab.isHistoryTab) {
    const entry = editorManager.editors.get(tabId);
    if (entry) {
      editorManager.activeTabId = tabId;
      editorManager.container.innerHTML = '';
      gitHistoryPanel._render(tabId, entry.filePath, entry.commits, entry.dirPath, entry.filename);
    }
    statusBar.updateLanguage('Git History');
  } else if (tab && tab.isDiffTab) {
    editorManager.activateTab(tabId);
    statusBar.updateLanguage('Diff');
  } else {
    editorManager.activateTab(tabId);
    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
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

  // Clean up history tab
  if (tab && tab.isHistoryTab) {
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
  const result = await window.api.openLargeFile(filePath);

  if (result.error) {
    viewerContainer.innerHTML = `<div class="lfv-loading"><div>Error: ${result.error}</div></div>`;
    return;
  }

  // Initialize the viewer (init calls _render and _bindEvents internally)
  await viewer.init(filePath, result.totalLines, result.fileSize);

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

  const file = await window.api.readFileByPath(filePath);
  if (!file) return;

  // Route to large file viewer
  if (file.isLargeFile) {
    await openLargeFile(file.filePath, file.size);
    return;
  }

  const filename = file.filePath.split(/[/\\]/).pop();
  const tabId = tabManager.createTab(filename, file.filePath, file.encoding || 'UTF-8');
  tabManager.setFilePath(tabId, file.filePath);
  const langInfo = editorManager.createEditorForTab(tabId, file.content, filename);
  editorManager.activateTab(tabId);

  statusBar.updateLineEnding(file.lineEnding || 'LF');
  statusBar.updateEncoding(file.encoding || 'UTF-8');
  statusBar.updateLanguage(langInfo.displayName);

  if (lineNumber) editorManager.revealLine(tabId, lineNumber);
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
  const files = await window.api.openFile();
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

    const filename = file.filePath.split(/[/\\]/).pop();
    const tabId = tabManager.createTab(filename, file.filePath, file.encoding || 'UTF-8');
    tabManager.setFilePath(tabId, file.filePath);
    const langInfo = editorManager.createEditorForTab(tabId, file.content, filename);
    editorManager.activateTab(tabId);

    statusBar.updateLineEnding(file.lineEnding || 'LF');
    statusBar.updateEncoding(file.encoding || 'UTF-8');
    statusBar.updateLanguage(langInfo.displayName);
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
    const result = await window.api.saveFile(tab.filePath, content, tab.encoding);
    if (result.success) {
      tabManager.setDirty(tabId, false);
      refreshGitStatus();
    } else {
      statusBar.showMessage(`Save failed: ${result.error}`);
    }
    return result.success;
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
  const result = await window.api.saveFileAs(content, tab.filePath || tab.title, tab.encoding);

  if (result) {
    tabManager.setFilePath(tabId, result.filePath);
    const filename = result.filePath.split(/[/\\]/).pop();
    tabManager.setTitle(tabId, filename);
    tabManager.setDirty(tabId, false);

    const langInfo = editorManager.getLanguageInfo(tabId);
    statusBar.updateLanguage(langInfo.displayName);
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

function showGoToLineDialog() {
  const editor = editorManager.getActiveEditor();
  if (!editor) return;

  const model = editor.getModel();
  const totalLines = model ? model.getLineCount() : 1;

  const overlay = document.createElement('div');
  overlay.className = 'goto-line-overlay';
  overlay.innerHTML = `
    <div class="goto-line-dialog">
      <label>Go to Line (1 - ${totalLines}):</label>
      <input type="number" id="goto-line-input" min="1" max="${totalLines}" value="${editor.getPosition().lineNumber}">
      <div class="goto-line-buttons">
        <button id="goto-line-cancel">Cancel</button>
        <button id="goto-line-go" class="primary">Go</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('goto-line-input');
  input.select();
  input.focus();

  function goToLine() {
    const line = parseInt(input.value, 10);
    if (line >= 1 && line <= totalLines) {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    }
    close();
  }

  function close() {
    document.body.removeChild(overlay);
  }

  document.getElementById('goto-line-go').addEventListener('click', goToLine);
  document.getElementById('goto-line-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') goToLine();
    if (e.key === 'Escape') close();
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
  openFileByPath(filePath, line);
});

// ── File Watching ──

window.api.onFileChanged(async (filePath) => {
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
    }
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
    case 'find': editorManager.find(); break;
    case 'replace': editorManager.replace(); break;
    case 'find-in-files': findInFiles.toggle(); break;
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
window.api.onMenuFind(() => editorManager.find());
window.api.onMenuReplace(() => editorManager.replace());
window.api.onMenuFindInFiles(() => findInFiles.toggle());
window.api.onMenuToggleWordWrap(() => editorManager.toggleWordWrap());
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

// ── Start with one blank tab ──
newFile();
