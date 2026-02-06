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

  show(summaryText) {
    if (this.overlay) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'git-commit-overlay';
    this.overlay.innerHTML = `
      <div class="git-commit-dialog">
        <div class="git-commit-header">Commit Changes</div>
        <div class="git-commit-summary">${this._escapeHtml(summaryText || '')}</div>
        <textarea class="git-commit-textarea" placeholder="Enter commit message..." autofocus></textarea>
        <div class="git-commit-footer">
          <button class="git-commit-cancel">Cancel</button>
          <button class="git-commit-ok primary">Commit</button>
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

    textarea.focus();
  }

  close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
