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
    this._initTabBarDrop();
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
      <span class="tab-title">${this._escapeHtml(tab.title)}</span>
      <button class="tab-close" title="Close">\u00D7</button>
    `;

    el.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        this.activate(tabId);
      }
    });

    el.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeTab(tabId);
    });

    // Context menu
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._showContextMenu(e.clientX, e.clientY, tabId);
    });

    // Drag reordering
    el.addEventListener('dragstart', (e) => {
      this._draggedTabId = tabId;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      this._draggedTabId = null;
      this.tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('drag-over'));
    });

    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (this._draggedTabId && this._draggedTabId !== tabId) {
        el.classList.add('drag-over');
      }
    });

    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over');
      if (!this._draggedTabId || this._draggedTabId === tabId) return;

      const draggedEl = this.tabBar.querySelector(`[data-tab-id="${this._draggedTabId}"]`);
      if (!draggedEl) return;

      const rect = el.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      if (e.clientX < midX) {
        this.tabBar.insertBefore(draggedEl, el);
      } else {
        this.tabBar.insertBefore(draggedEl, el.nextSibling);
      }
    });

    this.tabBar.appendChild(el);
  }

  // ── Tab Bar Drop (for dropping into empty space after last tab) ──

  _initTabBarDrop() {
    this.tabBar.addEventListener('dragover', (e) => {
      if (!this._draggedTabId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    this.tabBar.addEventListener('drop', (e) => {
      if (!this._draggedTabId) return;
      e.preventDefault();

      // Only act if the drop target is the tab bar itself (empty space),
      // not a child tab element (those have their own handlers)
      if (e.target !== this.tabBar) return;

      const draggedEl = this.tabBar.querySelector(`[data-tab-id="${this._draggedTabId}"]`);
      if (draggedEl) {
        this.tabBar.appendChild(draggedEl);
      }
    });
  }

  // ── Context Menu ──

  _initContextMenu() {
    this._contextMenu = document.createElement('div');
    this._contextMenu.className = 'tab-context-menu';
    this._contextMenu.style.display = 'none';
    document.body.appendChild(this._contextMenu);

    document.addEventListener('click', () => {
      this._contextMenu.style.display = 'none';
    });
  }

  _showContextMenu(x, y, tabId) {
    const items = [
      { label: 'Close', action: () => this.closeTab(tabId) },
      { label: 'Close Others', action: () => this.closeOtherTabs(tabId) },
      { label: 'Close Tabs to the Right', action: () => this.closeTabsToRight(tabId) },
      { label: 'Close All', action: () => this.closeAllTabs() },
    ];

    this._contextMenu.innerHTML = items.map(item =>
      `<div class="context-menu-item">${item.label}</div>`
    ).join('');

    this._contextMenu.querySelectorAll('.context-menu-item').forEach((el, i) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        this._contextMenu.style.display = 'none';
        items[i].action();
      });
    });

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

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
