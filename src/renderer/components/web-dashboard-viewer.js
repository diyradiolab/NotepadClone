import { escapeHtml } from '../utils/escape-html';

/**
 * WebDashboardViewer — manages the dashboard grid.
 *
 * Link tiles open in the OS default browser via shell.openExternal.
 * App tiles launch local applications via shell.openPath.
 */
export class WebDashboardViewer {
  constructor(editorWrapper) {
    this._editorWrapper = editorWrapper;
    this._container = null;
    this._gridWrapper = null;
    this._activeTabId = null;
    this._links = [];
    this._addFormVisible = false;
    this._addFormType = 'link';  // 'link' | 'app'
    this._onTitleChange = null;
  }

  async show(tabId, onTitleChange) {
    this._activeTabId = tabId;
    this._onTitleChange = onTitleChange;
    this._ensureContainer();
    this._container.classList.remove('hidden');
    await this._showDashboard();
  }

  hide() {
    if (this._container) {
      this._container.classList.add('hidden');
    }
  }

  destroy() {
    if (this._container) {
      this._container.remove();
      this._container = null;
    }
    this._gridWrapper = null;
    this._activeTabId = null;
  }

  // ── Private Methods ──

  _ensureContainer() {
    if (this._container) return;

    this._container = document.createElement('div');
    this._container.className = 'wd-container hidden';

    this._gridWrapper = document.createElement('div');
    this._gridWrapper.className = 'wd-grid-wrapper';
    this._container.appendChild(this._gridWrapper);

    this._editorWrapper.appendChild(this._container);
  }

  async _showDashboard() {
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
          <div class="wd-empty-msg">No links configured.<br>Click + to add your first link or app.</div>
        </div>
      `;
      const addTile = this._createAddTile();
      this._gridWrapper.querySelector('.wd-empty').appendChild(addTile);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'wd-grid';

    for (const link of this._links) {
      const isApp = link.type === 'app';
      const tile = document.createElement('div');
      tile.className = isApp ? 'wd-tile wd-tile--app' : 'wd-tile';

      if (isApp) {
        tile.innerHTML = `
          <span class="wd-tile-badge">APP</span>
          <span class="wd-tile-name">${escapeHtml(link.name)}</span>
          <span class="wd-tile-path">${escapeHtml(link.path)}</span>
          <button class="wd-tile-delete" title="Remove app">&times;</button>
        `;
      } else {
        tile.innerHTML = `
          <span class="wd-tile-name">${escapeHtml(link.name)}</span>
          <span class="wd-tile-url">${escapeHtml(link.url || '')}</span>
          <button class="wd-tile-delete" title="Remove link">&times;</button>
        `;
      }

      tile.addEventListener('click', (e) => {
        if (e.target.closest('.wd-tile-delete')) return;
        if (isApp) {
          this._launchApp(link.path, link.name);
        } else {
          this._openLink(link.url);
        }
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
    tile.innerHTML = `+<span class="wd-add-label">Add Link / App</span>`;
    tile.addEventListener('click', () => {
      this._addFormVisible = true;
      this._addFormType = 'link';
      this._renderGrid();
      const nameInput = this._gridWrapper.querySelector('.wd-add-name');
      if (nameInput) nameInput.focus();
    });
    return tile;
  }

  _createAddForm() {
    const form = document.createElement('div');
    form.className = 'wd-add-form';

    const isApp = this._addFormType === 'app';

    form.innerHTML = `
      <div class="wd-add-type-toggle">
        <button class="wd-type-btn ${!isApp ? 'active' : ''}" data-type="link">Link</button>
        <button class="wd-type-btn ${isApp ? 'active' : ''}" data-type="app">App</button>
      </div>
      <input type="text" class="wd-add-name" placeholder="Name (e.g. ${isApp ? 'VS Code' : 'GitHub'})" />
      ${isApp
        ? `<div class="wd-add-path-row">
             <input type="text" class="wd-add-path" placeholder="Application path" readonly />
             <button class="wd-btn-browse">Browse</button>
           </div>`
        : `<input type="text" class="wd-add-url" placeholder="URL (e.g. github.com)" />`
      }
      <div class="wd-add-form-buttons">
        <button class="wd-btn-cancel">Cancel</button>
        <button class="wd-btn-save">Save</button>
      </div>
    `;

    // Type toggle buttons
    form.querySelectorAll('.wd-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._addFormType = btn.dataset.type;
        this._renderGrid();
        const nameInput = this._gridWrapper.querySelector('.wd-add-name');
        if (nameInput) nameInput.focus();
      });
    });

    // Browse button (app mode)
    if (isApp) {
      form.querySelector('.wd-btn-browse').addEventListener('click', async () => {
        const result = await window.api.browseForApp();
        if (result.cancelled) return;
        const pathInput = form.querySelector('.wd-add-path');
        const nameInput = form.querySelector('.wd-add-name');
        pathInput.value = result.filePath;
        if (!nameInput.value.trim()) {
          nameInput.value = this._extractAppName(result.filePath);
        }
      });
    }

    form.querySelector('.wd-btn-cancel').addEventListener('click', () => {
      this._addFormVisible = false;
      this._renderGrid();
    });

    form.querySelector('.wd-btn-save').addEventListener('click', () => {
      if (isApp) {
        this._saveNewApp(form);
      } else {
        this._saveNewLink(form);
      }
    });

    const lastInput = isApp ? form.querySelector('.wd-add-path') : form.querySelector('.wd-add-url');
    lastInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isApp) {
          this._saveNewApp(form);
        } else {
          this._saveNewLink(form);
        }
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

  _extractAppName(filePath) {
    const basename = filePath.split(/[/\\]/).pop() || filePath;
    return basename.replace(/\.(app|exe|lnk)$/i, '');
  }

  async _saveNewLink(form) {
    const name = form.querySelector('.wd-add-name').value.trim();
    let url = form.querySelector('.wd-add-url').value.trim();
    if (!name || !url) return;

    if (!url.match(/^https?:\/\//)) {
      url = 'https://' + url;
    }

    this._links.push({ id: Date.now(), type: 'link', name, url });
    await window.api.saveDashboardLinks(this._links);
    this._addFormVisible = false;
    this._renderGrid();
  }

  async _saveNewApp(form) {
    const name = form.querySelector('.wd-add-name').value.trim();
    const appPath = form.querySelector('.wd-add-path').value.trim();
    if (!name || !appPath) return;

    if (this._links.some(l => l.type === 'app' && l.path === appPath)) {
      this._showToast(`${name} is already on your dashboard`);
      return;
    }

    this._links.push({ id: Date.now(), type: 'app', name, path: appPath });
    await window.api.saveDashboardLinks(this._links);
    this._addFormVisible = false;
    this._renderGrid();
  }

  _openLink(url) {
    window.api.openExternalUrl(url);
  }

  async _launchApp(appPath, name) {
    const result = await window.api.launchApp(appPath);
    if (!result.success) {
      this._showToast(`Could not launch ${name}: ${result.error}`);
    }
  }

  _showToast(message) {
    const existing = this._container.querySelector('.wd-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'wd-toast';
    toast.textContent = message;
    this._container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('wd-toast--fade');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  async _deleteLink(id) {
    this._links = this._links.filter(l => l.id !== id);
    await window.api.saveDashboardLinks(this._links);
    this._renderGrid();
  }
}
