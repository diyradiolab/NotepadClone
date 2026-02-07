import { escapeHtml } from '../utils/escape-html';

/**
 * Searchable dialog showing all recent files (up to 100).
 * Follows the go-to-line overlay pattern.
 */
export class RecentFilesDialog {
  constructor() {
    this.overlay = null;
    this.onFileOpenCallback = null;
  }

  onFileOpen(cb) {
    this.onFileOpenCallback = cb;
  }

  async show() {
    if (this.overlay) return;

    const files = await window.api.getRecentFiles();

    this.overlay = document.createElement('div');
    this.overlay.className = 'recent-files-overlay dialog-overlay';
    this.overlay.innerHTML = `
      <div class="recent-files-dialog dialog-box">
        <div class="recent-files-header dialog-header">
          <span class="recent-files-title dialog-title">Recent Files</span>
          <span class="recent-files-count">${files.length} files</span>
        </div>
        <input type="text" class="recent-files-search dialog-search" placeholder="Search by filename or path..." autofocus>
        <div class="recent-files-list"></div>
        <div class="recent-files-footer dialog-footer">
          <button class="recent-files-clear dialog-btn">Clear All</button>
          <button class="recent-files-close dialog-btn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    const input = this.overlay.querySelector('.recent-files-search');
    const listEl = this.overlay.querySelector('.recent-files-list');
    const clearBtn = this.overlay.querySelector('.recent-files-clear');
    const closeBtn = this.overlay.querySelector('.recent-files-close');

    const renderList = (filter = '') => {
      const lowerFilter = filter.toLowerCase();
      const filtered = filter
        ? files.filter(f => f.toLowerCase().includes(lowerFilter))
        : files;

      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="recent-files-empty">No matching files</div>';
        return;
      }

      listEl.innerHTML = filtered.map(filePath => {
        const parts = filePath.split(/[/\\]/);
        const filename = parts.pop();
        const dir = parts.join('/');
        return `<div class="recent-files-item" data-path="${this._escapeAttr(filePath)}">
          <span class="recent-files-item-name">${escapeHtml(filename)}</span>
          <span class="recent-files-item-dir">${escapeHtml(dir)}</span>
        </div>`;
      }).join('');
    };

    renderList();

    input.addEventListener('input', () => renderList(input.value));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = listEl.querySelector('.recent-files-item');
        if (first) {
          this._selectFile(first.dataset.path);
        }
      }
      if (e.key === 'Escape') this.close();
    });

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.recent-files-item');
      if (item) this._selectFile(item.dataset.path);
    });

    clearBtn.addEventListener('click', async () => {
      await window.api.clearRecentFiles();
      this.close();
    });

    closeBtn.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    input.focus();
  }

  close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  _selectFile(filePath) {
    this.close();
    if (this.onFileOpenCallback) {
      this.onFileOpenCallback(filePath);
    }
  }


  _escapeAttr(text) {
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
}
