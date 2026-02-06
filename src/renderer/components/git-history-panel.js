import { createDiffEditor, detectLanguage, monaco } from '../editor/monaco-setup';

export class GitHistoryPanel {
  constructor(tabManager, editorManager) {
    this.tabManager = tabManager;
    this.editorManager = editorManager;
  }

  async show(filePath) {
    if (!filePath) return;

    const filename = filePath.split(/[/\\]/).pop();
    const dirPath = filePath.split(/[/\\]/).slice(0, -1).join('/');

    const commits = await window.api.gitFileLog(dirPath, filePath);

    const tabTitle = `History: ${filename}`;
    const tabId = this.tabManager.createTab(tabTitle);
    const tab = this.tabManager.getTab(tabId);
    tab.isHistoryTab = true;
    tab.historyFilePath = filePath;

    // Store render info so we can build the panel when this tab activates
    this.editorManager.editors.set(tabId, {
      isHistoryTab: true,
      filePath,
      commits,
      dirPath,
      filename,
      diffEditor: null,
      language: 'diff',
    });

    this.editorManager.activateTab(tabId);
    this._render(tabId, filePath, commits, dirPath, filename);
  }

  _render(tabId, filePath, commits, dirPath, filename) {
    const container = this.editorManager.container;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'git-history';
    wrapper.style.width = '100%';
    wrapper.style.height = '100%';

    if (commits.length === 0) {
      wrapper.innerHTML = '<div class="ghp-empty">No git history found for this file.</div>';
      container.appendChild(wrapper);
      return;
    }

    // Commit list
    const listPanel = document.createElement('div');
    listPanel.className = 'ghp-commit-list';

    const listHeader = document.createElement('div');
    listHeader.className = 'ghp-commit-list-header';
    listHeader.textContent = `${commits.length} commit${commits.length !== 1 ? 's' : ''}`;
    listPanel.appendChild(listHeader);

    commits.forEach((commit, index) => {
      const row = document.createElement('div');
      row.className = 'ghp-commit';
      row.dataset.index = index;

      const subject = document.createElement('div');
      subject.className = 'ghp-subject';
      subject.textContent = commit.subject;
      subject.title = commit.subject;

      const meta = document.createElement('div');
      meta.className = 'ghp-meta';

      const hash = document.createElement('span');
      hash.className = 'ghp-hash';
      hash.textContent = commit.hash.substring(0, 7);

      const author = document.createElement('span');
      author.textContent = commit.author;

      const date = document.createElement('span');
      date.textContent = this._formatRelativeDate(commit.date);

      meta.appendChild(hash);
      meta.appendChild(author);
      meta.appendChild(date);

      row.appendChild(subject);
      row.appendChild(meta);

      row.addEventListener('click', () => {
        listPanel.querySelectorAll('.ghp-commit.active').forEach(el => el.classList.remove('active'));
        row.classList.add('active');
        this._showDiff(wrapper, filePath, commits, index, dirPath, filename);
      });

      listPanel.appendChild(row);
    });

    // Diff area
    const diffPanel = document.createElement('div');
    diffPanel.className = 'ghp-diff';
    diffPanel.innerHTML = '<div class="ghp-select-prompt">Select a commit to view changes</div>';

    wrapper.appendChild(listPanel);
    wrapper.appendChild(diffPanel);
    container.appendChild(wrapper);
  }

  async _showDiff(wrapper, filePath, commits, index, dirPath, filename) {
    const diffPanel = wrapper.querySelector('.ghp-diff');
    diffPanel.innerHTML = '';

    const commit = commits[index];
    const prevCommit = commits[index + 1]; // older commit

    // Header
    const header = document.createElement('div');
    header.className = 'ghp-diff-header';

    if (prevCommit) {
      header.textContent = `${prevCommit.hash.substring(0, 7)} → ${commit.hash.substring(0, 7)}: ${commit.subject}`;
    } else {
      header.textContent = `Initial: ${commit.hash.substring(0, 7)}: ${commit.subject}`;
    }
    diffPanel.appendChild(header);

    // Diff editor container
    const editorDiv = document.createElement('div');
    editorDiv.className = 'ghp-diff-editor';
    diffPanel.appendChild(editorDiv);

    // Fetch file content at this commit and previous
    const newContent = await window.api.gitFileDiff(dirPath, commit.hash, filePath);
    let oldContent;

    if (prevCommit) {
      oldContent = await window.api.gitFileDiff(dirPath, prevCommit.hash, filePath);
    } else {
      oldContent = '';
    }

    const lang = detectLanguage(filename);
    const originalModel = monaco.editor.createModel(oldContent || '', lang);
    const modifiedModel = monaco.editor.createModel(newContent || '', lang);

    const diffEditor = createDiffEditor(editorDiv);
    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    // Store for cleanup
    this._currentDiffEditor = diffEditor;
    this._currentModels = [originalModel, modifiedModel];
  }

  _formatRelativeDate(isoDate) {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    const diffWeek = Math.floor(diffDay / 7);
    const diffMonth = Math.floor(diffDay / 30);
    const diffYear = Math.floor(diffDay / 365);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
    if (diffWeek < 5) return `${diffWeek} week${diffWeek !== 1 ? 's' : ''} ago`;
    if (diffMonth < 12) return `${diffMonth} month${diffMonth !== 1 ? 's' : ''} ago`;
    return `${diffYear} year${diffYear !== 1 ? 's' : ''} ago`;
  }
}
