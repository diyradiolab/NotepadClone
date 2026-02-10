import { escapeHtml } from '../utils/escape-html';

/**
 * WebDashboardViewer — manages the dashboard grid and embedded browser.
 *
 * Browser is a BrowserView in the main process, controlled via IPC.
 * The grid/tiles/toolbar live in a persistent DOM container outside
 * editorManager.container so they survive tab switches.
 */
export class WebDashboardViewer {
  constructor(editorWrapper) {
    this._editorWrapper = editorWrapper;
    this._container = null;
    this._toolbar = null;
    this._gridWrapper = null;
    this._browserEl = null;     // placeholder div whose bounds we report to main
    this._browserId = null;     // unique id for this viewer's BrowserView
    this._browserCreated = false;
    this._mode = 'grid';        // 'grid' | 'browser'
    this._activeTabId = null;
    this._links = [];
    this._addFormVisible = false;
    this._onTitleChange = null;
    this._resizeObserver = null;
    this._boundOnNavigated = (data) => this._onNavigated(data);
    this._boundOnTitle = (data) => this._onTitleUpdate(data);
    this._boundOnLoadFailed = (data) => this._onLoadFailed(data);
  }

  async show(tabId, onTitleChange) {
    this._activeTabId = tabId;
    this._onTitleChange = onTitleChange;
    this._browserId = `dashboard-${tabId}`;
    this._ensureContainer();
    this._container.classList.remove('hidden');
    this._listenForBrowserEvents();

    if (this._mode === 'browser' && this._browserCreated) {
      this._showBrowserView();
      this._updateBrowserBounds();
    } else {
      await this._showDashboard();
    }
  }

  hide() {
    if (this._container) {
      this._container.classList.add('hidden');
    }
    // Hide the BrowserView (zero-size bounds)
    if (this._browserCreated) {
      window.api.dashboardBrowserSetBounds(this._browserId, { x: 0, y: 0, width: 0, height: 0 });
    }
  }

  destroy() {
    this._stopListeningForBrowserEvents();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._browserCreated) {
      window.api.dashboardBrowserDestroy(this._browserId);
      this._browserCreated = false;
    }
    if (this._container) {
      this._container.remove();
      this._container = null;
    }
    this._toolbar = null;
    this._gridWrapper = null;
    this._browserEl = null;
    this._mode = 'grid';
    this._activeTabId = null;
  }

  // ── Private Methods ──

  _ensureContainer() {
    if (this._container) return;

    this._container = document.createElement('div');
    this._container.className = 'wd-container hidden';

    this._toolbar = this._buildToolbar();
    this._container.appendChild(this._toolbar);
    this._toolbar.style.display = 'none';

    this._gridWrapper = document.createElement('div');
    this._gridWrapper.className = 'wd-grid-wrapper';
    this._container.appendChild(this._gridWrapper);

    // Browser placeholder — BrowserView is positioned over this element
    this._browserEl = document.createElement('div');
    this._browserEl.className = 'wd-browser';
    this._browserEl.style.display = 'none';
    this._container.appendChild(this._browserEl);

    this._editorWrapper.appendChild(this._container);

    // Track size changes to reposition the BrowserView
    this._resizeObserver = new ResizeObserver(() => {
      if (this._mode === 'browser' && this._browserCreated) {
        this._updateBrowserBounds();
      }
    });
    this._resizeObserver.observe(this._browserEl);
  }

  _buildToolbar() {
    const bar = document.createElement('div');
    bar.className = 'wd-toolbar';
    bar.innerHTML = `
      <button class="wd-btn-home" title="Dashboard Home">Home</button>
      <button class="wd-btn-back" title="Back" disabled>&larr;</button>
      <button class="wd-btn-forward" title="Forward" disabled>&rarr;</button>
      <button class="wd-btn-refresh" title="Refresh">&#x21bb;</button>
      <input type="text" class="wd-url-bar" placeholder="Enter URL..." />
    `;

    bar.querySelector('.wd-btn-home').addEventListener('click', () => this._goHome());
    bar.querySelector('.wd-btn-back').addEventListener('click', () => {
      if (this._browserCreated) window.api.dashboardBrowserBack(this._browserId);
    });
    bar.querySelector('.wd-btn-forward').addEventListener('click', () => {
      if (this._browserCreated) window.api.dashboardBrowserForward(this._browserId);
    });
    bar.querySelector('.wd-btn-refresh').addEventListener('click', () => {
      if (this._browserCreated) window.api.dashboardBrowserReload(this._browserId);
    });

    const urlBar = bar.querySelector('.wd-url-bar');
    urlBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        let url = urlBar.value.trim();
        if (url && !url.match(/^https?:\/\//)) {
          url = 'https://' + url;
        }
        if (url && this._browserCreated) {
          window.api.dashboardBrowserNavigate(this._browserId, url);
        }
      }
    });

    return bar;
  }

  _listenForBrowserEvents() {
    window.api.onDashboardBrowserNavigated(this._boundOnNavigated);
    window.api.onDashboardBrowserTitle(this._boundOnTitle);
    window.api.onDashboardBrowserLoadFailed(this._boundOnLoadFailed);
  }

  _stopListeningForBrowserEvents() {
    // Events are broadcast to all viewers; filtering by browserId handles multiplexing
  }

  _onNavigated(data) {
    if (data.browserId !== this._browserId) return;
    const urlBar = this._toolbar.querySelector('.wd-url-bar');
    const backBtn = this._toolbar.querySelector('.wd-btn-back');
    const fwdBtn = this._toolbar.querySelector('.wd-btn-forward');
    urlBar.value = data.url;
    backBtn.disabled = !data.canGoBack;
    fwdBtn.disabled = !data.canGoForward;
  }

  _onTitleUpdate(data) {
    if (data.browserId !== this._browserId) return;
    if (this._onTitleChange) {
      this._onTitleChange(data.title || 'Dashboard');
    }
  }

  _onLoadFailed(data) {
    if (data.browserId !== this._browserId) return;
    // Show error in the URL bar
    const urlBar = this._toolbar.querySelector('.wd-url-bar');
    urlBar.value = `Error: ${data.errorDescription || 'Load failed'}`;
  }

  _updateBrowserBounds() {
    if (!this._browserEl || !this._browserCreated) return;
    const rect = this._browserEl.getBoundingClientRect();
    window.api.dashboardBrowserSetBounds(this._browserId, {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }

  async _showDashboard() {
    this._mode = 'grid';
    this._toolbar.style.display = 'none';
    this._browserEl.style.display = 'none';
    this._gridWrapper.style.display = '';

    // Destroy BrowserView when returning to grid (frees resources)
    if (this._browserCreated) {
      await window.api.dashboardBrowserDestroy(this._browserId);
      this._browserCreated = false;
    }

    try {
      this._links = await window.api.getDashboardLinks();
    } catch {
      this._links = [];
    }

    this._renderGrid();

    if (this._onTitleChange) {
      this._onTitleChange('Dashboard');
    }
  }

  _renderGrid() {
    if (!this._gridWrapper) return;

    if (this._links.length === 0 && !this._addFormVisible) {
      this._gridWrapper.innerHTML = `
        <div class="wd-empty">
          <div class="wd-empty-msg">No links configured.<br>Click + to add your first link.</div>
        </div>
      `;
      const addTile = this._createAddTile();
      this._gridWrapper.querySelector('.wd-empty').appendChild(addTile);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'wd-grid';

    for (const link of this._links) {
      const tile = document.createElement('div');
      tile.className = 'wd-tile';
      tile.innerHTML = `
        <span class="wd-tile-name">${escapeHtml(link.name)}</span>
        <span class="wd-tile-url">${escapeHtml(link.url)}</span>
        <button class="wd-tile-delete" title="Remove link">&times;</button>
      `;

      tile.addEventListener('click', (e) => {
        if (e.target.closest('.wd-tile-delete')) return;
        this._navigateTo(link.url);
      });

      tile.querySelector('.wd-tile-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteLink(link.id);
      });

      grid.appendChild(tile);
    }

    if (!this._addFormVisible) {
      grid.appendChild(this._createAddTile());
    } else {
      grid.appendChild(this._createAddForm());
    }

    this._gridWrapper.innerHTML = '';
    this._gridWrapper.appendChild(grid);
  }

  _createAddTile() {
    const tile = document.createElement('div');
    tile.className = 'wd-add-tile';
    tile.innerHTML = `+<span class="wd-add-label">Add Link</span>`;
    tile.addEventListener('click', () => {
      this._addFormVisible = true;
      this._renderGrid();
      const nameInput = this._gridWrapper.querySelector('.wd-add-name');
      if (nameInput) nameInput.focus();
    });
    return tile;
  }

  _createAddForm() {
    const form = document.createElement('div');
    form.className = 'wd-add-form';
    form.innerHTML = `
      <input type="text" class="wd-add-name" placeholder="Name (e.g. GitHub)" />
      <input type="text" class="wd-add-url" placeholder="URL (e.g. github.com)" />
      <div class="wd-add-form-buttons">
        <button class="wd-btn-cancel">Cancel</button>
        <button class="wd-btn-save">Save</button>
      </div>
    `;

    form.querySelector('.wd-btn-cancel').addEventListener('click', () => {
      this._addFormVisible = false;
      this._renderGrid();
    });

    form.querySelector('.wd-btn-save').addEventListener('click', () => {
      this._saveNewLink(form);
    });

    const urlInput = form.querySelector('.wd-add-url');
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._saveNewLink(form);
      }
    });

    form.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._addFormVisible = false;
        this._renderGrid();
      }
    });

    return form;
  }

  async _saveNewLink(form) {
    const name = form.querySelector('.wd-add-name').value.trim();
    let url = form.querySelector('.wd-add-url').value.trim();
    if (!name || !url) return;

    if (!url.match(/^https?:\/\//)) {
      url = 'https://' + url;
    }

    this._links.push({ id: Date.now(), name, url });
    await window.api.saveDashboardLinks(this._links);
    this._addFormVisible = false;
    this._renderGrid();
  }

  async _deleteLink(id) {
    this._links = this._links.filter(l => l.id !== id);
    await window.api.saveDashboardLinks(this._links);
    this._renderGrid();
  }

  async _navigateTo(url) {
    this._mode = 'browser';
    this._gridWrapper.style.display = 'none';
    this._toolbar.style.display = '';
    this._browserEl.style.display = '';

    if (!this._browserCreated) {
      await window.api.dashboardBrowserCreate(this._browserId);
      this._browserCreated = true;
      // Give the placeholder a frame to lay out before reading bounds
      await new Promise(r => requestAnimationFrame(r));
    }

    this._updateBrowserBounds();
    window.api.dashboardBrowserNavigate(this._browserId, url);
    this._toolbar.querySelector('.wd-url-bar').value = url;
  }

  _showBrowserView() {
    this._gridWrapper.style.display = 'none';
    this._toolbar.style.display = '';
    this._browserEl.style.display = '';
  }

  async _goHome() {
    if (this._onTitleChange) {
      this._onTitleChange('Dashboard');
    }
    await this._showDashboard();
  }
}
