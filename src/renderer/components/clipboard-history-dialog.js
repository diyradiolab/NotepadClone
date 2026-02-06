/**
 * Searchable dialog showing clipboard ring history (up to 100 items).
 * Same overlay pattern as RecentFilesDialog.
 */
export class ClipboardHistoryDialog {
  constructor() {
    this.overlay = null;
    this.onPasteCallback = null;
  }

  onPaste(cb) {
    this.onPasteCallback = cb;
  }

  async show() {
    if (this.overlay) return;

    const entries = await window.api.getClipboardRing();

    this.overlay = document.createElement('div');
    this.overlay.className = 'clipboard-history-overlay';
    this.overlay.innerHTML = `
      <div class="clipboard-history-dialog">
        <div class="clipboard-history-header">
          <span class="clipboard-history-title">Clipboard History</span>
          <span class="clipboard-history-count">${entries.length} items</span>
        </div>
        <input type="text" class="clipboard-history-search" placeholder="Search clipboard..." autofocus>
        <div class="clipboard-history-list"></div>
        <div class="clipboard-history-footer">
          <button class="clipboard-history-clear">Clear History</button>
          <button class="clipboard-history-close">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    const input = this.overlay.querySelector('.clipboard-history-search');
    const listEl = this.overlay.querySelector('.clipboard-history-list');
    const clearBtn = this.overlay.querySelector('.clipboard-history-clear');
    const closeBtn = this.overlay.querySelector('.clipboard-history-close');

    const renderList = (filter = '') => {
      const lowerFilter = filter.toLowerCase();
      const filtered = filter
        ? entries.filter(e => e.text.toLowerCase().includes(lowerFilter))
        : entries;

      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="clipboard-history-empty">No matching entries</div>';
        return;
      }

      listEl.innerHTML = filtered.map((entry, idx) => {
        const preview = this._formatPreview(entry.text, 80);
        const timeStr = this._formatTime(entry.timestamp);
        return `<div class="clipboard-history-item" data-index="${idx}">
          <span class="clipboard-history-item-text">${this._escapeHtml(preview)}</span>
          <div class="clipboard-history-item-meta">
            <span class="clipboard-history-item-source">${this._escapeHtml(entry.source)}</span>
            <span class="clipboard-history-item-time">${timeStr}</span>
          </div>
        </div>`;
      }).join('');

      // Store filtered entries for click handler
      listEl._filteredEntries = filtered;
    };

    renderList();

    input.addEventListener('input', () => renderList(input.value));

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = listEl.querySelector('.clipboard-history-item');
        if (first && listEl._filteredEntries && listEl._filteredEntries.length > 0) {
          this._selectEntry(listEl._filteredEntries[0].text);
        }
      }
      if (e.key === 'Escape') this.close();
    });

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.clipboard-history-item');
      if (item && listEl._filteredEntries) {
        const idx = parseInt(item.dataset.index, 10);
        this._selectEntry(listEl._filteredEntries[idx].text);
      }
    });

    clearBtn.addEventListener('click', async () => {
      await window.api.clearClipboardRing();
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

  _selectEntry(text) {
    this.close();
    if (this.onPasteCallback) {
      this.onPasteCallback(text);
    }
  }

  _formatPreview(text, maxLen) {
    // Replace newlines with return symbol, truncate
    let preview = text.replace(/\r?\n/g, '\u21B5');
    if (preview.length > maxLen) {
      preview = preview.substring(0, maxLen) + '...';
    }
    return preview;
  }

  _formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
