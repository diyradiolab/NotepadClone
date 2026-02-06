/**
 * StatusBar updates the bottom bar with cursor position,
 * selection info, encoding, line endings, and language.
 */
export class StatusBar {
  constructor() {
    this.positionEl = document.getElementById('status-position');
    this.selectionEl = document.getElementById('status-selection');
    this.gitEl = document.getElementById('status-git');
    this.encodingEl = document.getElementById('status-encoding');
    this.lineEndingEl = document.getElementById('status-line-ending');
    this.languageEl = document.getElementById('status-language');
  }

  updatePosition(line, column) {
    this.positionEl.textContent = `Ln ${line}, Col ${column}`;
  }

  updateSelection(selection) {
    if (!selection || selection.isEmpty()) {
      this.selectionEl.textContent = '';
      return;
    }
    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    const lines = endLine - startLine + 1;
    if (lines > 1) {
      this.selectionEl.textContent = `(${lines} lines selected)`;
    } else {
      const chars = selection.endColumn - selection.startColumn;
      this.selectionEl.textContent = chars > 0 ? `(${chars} chars selected)` : '';
    }
  }

  updateEncoding(encoding) {
    this.encodingEl.textContent = encoding || 'UTF-8';
  }

  updateLineEnding(ending) {
    this.lineEndingEl.textContent = ending || 'LF';
  }

  updateLanguage(language) {
    this.languageEl.textContent = language || 'Plain Text';
  }

  updateGit(branch, dirtyCount) {
    if (!branch) {
      this.gitEl.style.display = 'none';
      this.gitEl.textContent = '';
      return;
    }
    this.gitEl.style.display = '';
    if (dirtyCount > 0) {
      this.gitEl.textContent = `${branch} \u25CF ${dirtyCount} modified`;
    } else {
      this.gitEl.textContent = branch;
    }
  }

  clearGit() {
    this.gitEl.style.display = 'none';
    this.gitEl.textContent = '';
  }

  showMessage(message, duration = 5000) {
    const prev = this.positionEl.textContent;
    this.positionEl.textContent = message;
    setTimeout(() => {
      this.positionEl.textContent = prev;
    }, duration);
  }
}
