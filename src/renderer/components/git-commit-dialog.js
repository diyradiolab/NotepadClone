import { escapeHtml } from '../utils/escape-html';

/**
 * Modal dialog for entering a Git commit message.
 * Same overlay pattern as ClipboardHistoryDialog.
 */
export class GitCommitDialog {
  constructor() {
    this.overlay = null;
    this.onCommitCallback = null;
  }

  onCommit(cb) {
    this.onCommitCallback = cb;
  }

  show(gitState) {
    if (this.overlay) return;

    const { branch, stagedCount, dirtyCount, changedFiles } = gitState;
    const staged = (changedFiles || []).filter(f => f.staged);
    const unstaged = (changedFiles || []).filter(f => !f.staged);
    const willCommitAll = stagedCount === 0;

    let fileListHtml = '';
    if (willCommitAll) {
      fileListHtml = `<div class="git-commit-note">Staging and committing ${dirtyCount} file${dirtyCount !== 1 ? 's' : ''}:</div>`;
      fileListHtml += this._buildFileList(changedFiles || []);
    } else {
      fileListHtml = `<div class="git-commit-note">Committing ${stagedCount} file${stagedCount !== 1 ? 's' : ''}:</div>`;
      fileListHtml += this._buildFileList(staged);
      if (unstaged.length > 0) {
        fileListHtml += `<div class="git-commit-note git-commit-note-muted">${unstaged.length} unstaged (won't be committed)</div>`;
      }
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'git-commit-overlay dialog-overlay';
    this.overlay.innerHTML = `
      <div class="git-commit-dialog dialog-box">
        <div class="git-commit-header dialog-title">Commit to <strong>${escapeHtml(branch)}</strong></div>
        <div class="git-commit-files">${fileListHtml}</div>
        <textarea class="git-commit-textarea" placeholder="Enter commit message..." autofocus></textarea>
        <div class="git-commit-footer dialog-footer">
          <button class="git-commit-cancel dialog-btn">Cancel</button>
          <button class="git-commit-ok dialog-btn dialog-btn-primary">Commit</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    const textarea = this.overlay.querySelector('.git-commit-textarea');
    const cancelBtn = this.overlay.querySelector('.git-commit-cancel');
    const okBtn = this.overlay.querySelector('.git-commit-ok');

    const submit = () => {
      const message = textarea.value.trim();
      if (!message) return;
      this.close();
      if (this.onCommitCallback) this.onCommitCallback(message);
    };

    okBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
      if (e.key === 'Escape') this.close();
    });

    // Global Escape handler
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._keyHandler);

    textarea.focus();
  }

  close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }

  _buildFileList(files) {
    if (!files.length) return '';
    const items = files.map(f =>
      `<div class="git-commit-file"><span class="git-commit-file-status">${escapeHtml(f.status)}</span> ${escapeHtml(f.file)}</div>`
    ).join('');
    return `<div class="git-commit-file-list">${items}</div>`;
  }

}
