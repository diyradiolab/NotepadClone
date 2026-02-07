import { escapeHtml } from '../utils/escape-html';

/**
 * TabManager handles the tab bar UI and tab state.
 * Each tab tracks: id, title, filePath, dirty status.
 * Supports drag reordering and right-click context menu.
 */
export class TabManager {
  constructor(tabBarElement) {
    this.tabBar = tabBarElement;
    this.tabs = new Map(); // tabId → { title, filePath, dirty }
    this.activeTabId = null;
    this.nextId = 1;

    this.onActivateCallbacks = [];
    this.onCloseCallbacks = [];
    this.saveCallback = null;

    this._draggedTabId = null;
    this._initContextMenu();
    this._initTabBarEvents();
  }

  createTab(title = 'new 1', filePath = null, encoding = 'UTF-8') {
    const tabId = `tab-${this.nextId++}`;

    this.tabs.set(tabId, {
      title,
      filePath,
      dirty: false,
      encoding,
    });

    this._renderTab(tabId);
    this.activate(tabId);

    return tabId;
  }

  activate(tabId) {
    if (!this.tabs.has(tabId)) return;
    this.activeTabId = tabId;
    this._updateTabStyles();
    this.onActivateCallbacks.forEach(cb => cb(tabId));
  }

  async closeTab(tabId) {
    const tab = this.tabs.get(tabId);
    if (!tab) return false;

    if (tab.dirty) {
      const result = await window.api.showSaveDialog(tab.title);
      if (result === 'cancel') return false;
      if (result === 'save') {
        const saved = await this.saveCallback?.(tabId);
        if (!saved) return false;
      }
    }

    this.onCloseCallbacks.forEach(cb => cb(tabId));

    const el = this.tabBar.querySelector(`[data-tab-id="${tabId}"]`);
    if (el) el.remove();

    this.tabs.delete(tabId);

    if (this.activeTabId === tabId) {
      const remaining = [...this.tabs.keys()];
      if (remaining.length > 0) {
        this.activate(remaining[remaining.length - 1]);
      } else {
        this.activeTabId = null;
      }
    }
    return true;
  }

  async closeOtherTabs(tabId) {
    const toClose = [...this.tabs.keys()].filter(id => id !== tabId);
    for (const id of toClose) {
      if (!(await this.closeTab(id))) return;
    }
  }

  async closeTabsToRight(tabId) {
    const tabIds = this._getTabOrder();
    const idx = tabIds.indexOf(tabId);
    if (idx < 0) return;
    const toClose = tabIds.slice(idx + 1);
    for (const id of toClose) {
      if (!(await this.closeTab(id))) return;
    }
  }

  async closeAllTabs() {
    const toClose = [...this.tabs.keys()];
    for (const id of toClose) {
      if (!(await this.closeTab(id))) return;
    }
  }

  setDirty(tabId, dirty) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.dirty = dirty;
    this._updateDirtyIndicator(tabId);
  }

  setTitle(tabId, title) {
    const tab = this.tabs.get(tabId);
    if (!tab) return;
    tab.title = title;
    const el = this.tabBar.querySelector(`[data-tab-id="${tabId}"] .tab-title`);
    if (el) el.textContent = title;
  }

  setFilePath(tabId, filePath) {
    const tab = this.tabs.get(tabId);
    if (tab) tab.filePath = filePath;
  }

  getTab(tabId) {
    return this.tabs.get(tabId);
  }

  getActiveTabId() {
    return this.activeTabId;
  }

  getTabCount() {
    return this.tabs.size;
  }

  setSaveCallback(fn) {
    this.saveCallback = fn;
  }

  getAllTabs() {
    return this.tabs;
  }

  findTabByPath(filePath) {
    for (const [id, tab] of this.tabs) {
      if (tab.filePath === filePath) return id;
    }
    return null;
  }

  onActivate(callback) {
    this.onActivateCallbacks.push(callback);
  }

  onClose(callback) {
    this.onCloseCallbacks.push(callback);
  }

  _getTabOrder() {
    return [...this.tabBar.querySelectorAll('.tab')].map(el => el.dataset.tabId);
  }

  _renderTab(tabId) {
    const tab = this.tabs.get(tabId);
    const el = document.createElement('div');
    el.className = 'tab';
    el.dataset.tabId = tabId;
    el.draggable = true;

    el.innerHTML = `
      <span class="tab-dirty" style="display:none">\u25CF</span>
      <span class="tab-title">${escapeHtml(tab.title)}</span>
      <button class="tab-close" title="Close">\u00D7</button>
    `;

    this.tabBar.appendChild(el);
  }

  // ── Delegated Tab Bar Events ──

  _initTabBarEvents() {
    // Click: activate tab or close tab
    this.tabBar.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      const tabId = tab.dataset.tabId;

      if (e.target.closest('.tab-close')) {
        e.stopPropagation();
        this.closeTab(tabId);
      } else {
        this.activate(tabId);
      }
    });

    // Context menu
    this.tabBar.addEventListener('contextmenu', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      e.preventDefault();
      this._showContextMenu(e.clientX, e.clientY, tab.dataset.tabId);
    });

    // Drag reordering
    this.tabBar.addEventListener('dragstart', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      this._draggedTabId = tab.dataset.tabId;
      tab.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    this.tabBar.addEventListener('dragend', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) tab.classList.remove('dragging');
      this._draggedTabId = null;
      this.tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over'));
    });

    this.tabBar.addEventListener('dragover', (e) => {
      if (!this._draggedTabId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const tab = e.target.closest('.tab');
      if (tab && tab.dataset.tabId !== this._draggedTabId) {
        tab.classList.add('drag-over');
      }
    });

    this.tabBar.addEventListener('dragleave', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) tab.classList.remove('drag-over');
    });

    this.tabBar.addEventListener('drop', (e) => {
      if (!this._draggedTabId) return;
      e.preventDefault();

      const tab = e.target.closest('.tab');
      if (tab) {
        tab.classList.remove('drag-over');
        if (tab.dataset.tabId === this._draggedTabId) return;

        const draggedEl = this.tabBar.querySelector(`[data-tab-id="${this._draggedTabId}"]`);
        if (!draggedEl) return;

        const rect = tab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        if (e.clientX < midX) {
          this.tabBar.insertBefore(draggedEl, tab);
        } else {
          this.tabBar.insertBefore(draggedEl, tab.nextSibling);
        }
      } else if (e.target === this.tabBar) {
        // Drop into empty space after last tab
        const draggedEl = this.tabBar.querySelector(`[data-tab-id="${this._draggedTabId}"]`);
        if (draggedEl) this.tabBar.appendChild(draggedEl);
      }
    });
  }

  // ── Context Menu ──

  _initContextMenu() {
    this._contextMenu = document.createElement('div');
    this._contextMenu.className = 'tab-context-menu';
    this._contextMenu.style.display = 'none';
    this._contextMenuActions = [];
    document.body.appendChild(this._contextMenu);

    // Single delegated click handler — no per-item listeners needed
    this._contextMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;
      e.stopPropagation();
      this._contextMenu.style.display = 'none';
      const idx = parseInt(item.dataset.index, 10);
      if (this._contextMenuActions[idx]) this._contextMenuActions[idx]();
    });

    document.addEventListener('click', () => {
      this._contextMenu.style.display = 'none';
    });
  }

  _showContextMenu(x, y, tabId) {
    this._contextMenuActions = [
      () => this.closeTab(tabId),
      () => this.closeOtherTabs(tabId),
      () => this.closeTabsToRight(tabId),
      () => this.closeAllTabs(),
    ];

    const labels = ['Close', 'Close Others', 'Close Tabs to the Right', 'Close All'];

    this._contextMenu.innerHTML = labels.map((label, i) =>
      `<div class="context-menu-item" data-index="${i}">${label}</div>`
    ).join('');

    this._contextMenu.style.display = 'block';
    this._contextMenu.style.left = `${x}px`;
    this._contextMenu.style.top = `${y}px`;
  }

  _updateTabStyles() {
    const tabs = this.tabBar.querySelectorAll('.tab');
    tabs.forEach(el => {
      el.classList.toggle('active', el.dataset.tabId === this.activeTabId);
    });
  }

  _updateDirtyIndicator(tabId) {
    const tab = this.tabs.get(tabId);
    const el = this.tabBar.querySelector(`[data-tab-id="${tabId}"] .tab-dirty`);
    if (el) {
      el.style.display = tab.dirty ? 'inline' : 'none';
    }
  }

}
