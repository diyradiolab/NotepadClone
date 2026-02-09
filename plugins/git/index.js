import '../../src/renderer/styles/git-commit-dialog.css';
import '../../src/renderer/styles/git-history-panel.css';
import { GitCommitDialog } from '../../src/renderer/components/git-commit-dialog';
import { GitHistoryPanel } from '../../src/renderer/components/git-history-panel';

export function activate(api) {
  const { tabManager, editorManager } = api._services;
  let gitState = { isRepo: false, branch: '', dirtyCount: 0, hasRemote: false, repoRoot: null };
  let currentFolderPath = null;

  const gitCommitDialog = new GitCommitDialog();
  const gitHistoryPanel = new GitHistoryPanel(tabManager, editorManager);

  // Git DOM elements
  const gitIndicator = document.getElementById('git-status-indicator');
  const gitInitBtn = document.getElementById('git-init-btn');
  const gitStageBtn = document.getElementById('git-stage-btn');
  const gitStageFileBtn = document.getElementById('git-stage-file-btn');
  const gitCommitBtn = document.getElementById('git-commit-btn');
  const gitPushBtn = document.getElementById('git-push-btn');
  const gitPullBtn = document.getElementById('git-pull-btn');
  const gitHistoryBtn = document.getElementById('git-history-btn');

  function getActiveFileDirPath() {
    const tabId = api.tabs.getActiveId();
    if (tabId) {
      const tab = api.tabs.getTab(tabId);
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

    gitInitBtn.style.display = (!gitState.isRepo && hasDirPath) ? '' : 'none';
    gitStageBtn.style.display = gitState.isRepo ? '' : 'none';
    gitStageFileBtn.style.display = gitState.isRepo ? '' : 'none';
    gitCommitBtn.style.display = gitState.isRepo ? '' : 'none';
    gitPushBtn.style.display = (gitState.isRepo && gitState.hasRemote) ? '' : 'none';
    gitPullBtn.style.display = (gitState.isRepo && gitState.hasRemote) ? '' : 'none';

    const activeTab = api.tabs.getTab(api.tabs.getActiveId());
    const hasActiveFile = activeTab && activeTab.filePath;
    gitHistoryBtn.style.display = (gitState.isRepo && hasActiveFile) ? '' : 'none';
    gitStageBtn.disabled = gitState.dirtyCount === 0;
    gitStageFileBtn.disabled = !hasActiveFile;

    if (gitState.isRepo) {
      api.statusBar.updateGit(gitState.branch, gitState.dirtyCount);
    } else {
      api.statusBar.clearGit();
    }
  }

  async function gitInit() {
    const dirPath = getActiveFileDirPath();
    if (!dirPath) return;
    const result = await window.api.gitInit(dirPath);
    api.statusBar.showMessage(result.success ? 'Git repository initialized' : `Git init failed: ${result.error}`);
    await refreshGitStatus();
  }

  async function gitStageAll() {
    const dirPath = getActiveFileDirPath();
    if (!dirPath) return;
    const result = await window.api.gitStageAll(dirPath);
    api.statusBar.showMessage(result.success ? 'All changes staged' : `Stage failed: ${result.error}`);
    await refreshGitStatus();
  }

  async function gitStageFile() {
    const tabId = api.tabs.getActiveId();
    if (!tabId) return;
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.filePath) {
      api.statusBar.showMessage('No file to stage (unsaved tab)');
      return;
    }
    const dirPath = getActiveFileDirPath();
    if (!dirPath) return;
    const result = await window.api.gitStageFile(dirPath, tab.filePath);
    if (result.success) {
      const filename = tab.filePath.split(/[/\\]/).pop();
      api.statusBar.showMessage(`Staged: ${filename}`);
    } else {
      api.statusBar.showMessage(`Stage failed: ${result.error}`);
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
    api.statusBar.showMessage(result.success ? (result.summary || 'Committed') : `Commit failed: ${result.error}`);
    await refreshGitStatus();
  });

  async function gitPush() {
    const dirPath = getActiveFileDirPath();
    if (!dirPath) return;
    api.statusBar.showMessage('Pushing...');
    const result = await window.api.gitPush(dirPath);
    api.statusBar.showMessage(result.success ? 'Pushed successfully' : `Push failed: ${result.error}`);
    await refreshGitStatus();
  }

  async function gitPull() {
    const dirPath = getActiveFileDirPath();
    if (!dirPath) return;
    api.statusBar.showMessage('Pulling...');
    const result = await window.api.gitPull(dirPath);
    api.statusBar.showMessage(result.success ? 'Pulled successfully' : `Pull failed: ${result.error}`);
    await refreshGitStatus();
  }

  function showGitFileHistory() {
    const tabId = api.tabs.getActiveId();
    if (!tabId) return;
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.filePath) return;
    gitHistoryPanel.show(tab.filePath);
  }

  // Listen for folder changes to track current folder
  api.events.on('folder:opened', ({ path }) => {
    currentFolderPath = path;
  });

  // Register commands (handlers call directly, no event emission needed)
  api.registerCommand({ id: 'git.init', title: 'Initialize Git Repository', handler: gitInit });
  api.registerCommand({ id: 'git.stageAll', title: 'Stage All Changes', handler: gitStageAll });
  api.registerCommand({ id: 'git.stageFile', title: 'Stage Current File', handler: gitStageFile });
  api.registerCommand({ id: 'git.commit', title: 'Commit', handler: gitCommitOpen });
  api.registerCommand({ id: 'git.push', title: 'Push', handler: gitPush });
  api.registerCommand({ id: 'git.pull', title: 'Pull', handler: gitPull });
  api.registerCommand({ id: 'git.fileHistory', title: 'Git File History', handler: showGitFileHistory });

  // Initial refresh
  refreshGitStatus();

  return {
    refreshGitStatus,
    getGitState: () => gitState,
    getHistoryPanel: () => gitHistoryPanel,
    getCommitDialog: () => gitCommitDialog,
    deactivate() {},
  };
}
