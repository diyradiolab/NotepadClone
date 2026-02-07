import { escapeHtml } from '../utils/escape-html';

/**
 * Simple overlay listing all non-active, non-diff tabs for comparison.
 * User picks a tab to compare against the current active tab.
 */
export class CompareTabDialog {
  constructor() {
    this.overlay = null;
    this.onSelectCallback = null;
  }

  onSelect(cb) {
    this.onSelectCallback = cb;
  }

  show(allTabs, activeTabId) {
    if (this.overlay) return;

    // Build list of eligible tabs (exclude active tab and diff tabs)
    const eligible = [];
    for (const [tabId, tab] of allTabs) {
      if (tabId === activeTabId) continue;
      if (tab.isDiffTab) continue;
      if (tab.isLargeFile) continue;
      eligible.push({ tabId, title: tab.title, filePath: tab.filePath });
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'compare-dialog-overlay dialog-overlay';

    if (eligible.length === 0) {
      this.overlay.innerHTML = `
        <div class="compare-dialog dialog-box">
          <div class="compare-dialog-header dialog-title">Compare Active Tab With...</div>
          <div class="compare-dialog-empty dialog-empty">No other tabs available for comparison</div>
          <div class="compare-dialog-footer dialog-footer">
            <button class="compare-dialog-close dialog-btn">Close</button>
          </div>
        </div>
      `;
    } else {
      this.overlay.innerHTML = `
        <div class="compare-dialog dialog-box">
          <div class="compare-dialog-header dialog-title">Compare Active Tab With...</div>
          <div class="compare-dialog-list">
            ${eligible.map(t => `
              <div class="compare-dialog-item" data-tab-id="${t.tabId}">
                <span class="compare-dialog-item-name">${escapeHtml(t.title)}</span>
                ${t.filePath ? `<span class="compare-dialog-item-path">${escapeHtml(t.filePath)}</span>` : ''}
              </div>
            `).join('')}
          </div>
          <div class="compare-dialog-footer dialog-footer">
            <button class="compare-dialog-close dialog-btn">Close</button>
          </div>
        </div>
      `;
    }

    document.body.appendChild(this.overlay);

    const closeBtn = this.overlay.querySelector('.compare-dialog-close');
    closeBtn.addEventListener('click', () => this.close());

    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
      const item = e.target.closest('.compare-dialog-item');
      if (item) {
        const tabId = item.dataset.tabId;
        this.close();
        if (this.onSelectCallback) this.onSelectCallback(tabId);
      }
    });

    // Escape to close
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._keyHandler);
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

}
