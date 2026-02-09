import { escapeHtml } from '../utils/escape-html';

/**
 * Two-column plugin manager dialog: list on left, detail on right.
 * Toggle plugins on/off with persistence via localStorage.
 */
export class PluginManagerDialog {
  constructor(pluginHost) {
    this.pluginHost = pluginHost;
    this.overlay = null;
    this._keyHandler = null;
    this._selectedId = null;
  }

  show() {
    if (this.overlay) return;

    const plugins = this._getPluginList();

    this.overlay = document.createElement('div');
    this.overlay.className = 'pm-overlay dialog-overlay';
    this.overlay.innerHTML = `
      <div class="pm-dialog dialog-box">
        <div class="pm-header dialog-header">
          <span class="dialog-title">Plugin Manager</span>
          <button class="pm-close-x" title="Close">\u00d7</button>
        </div>
        <input type="text" class="pm-search dialog-search" placeholder="Filter plugins..." autofocus>
        <div class="pm-body">
          <div class="pm-list"></div>
          <div class="pm-detail"></div>
        </div>
        <div class="pm-footer dialog-footer">
          <span class="pm-summary"></span>
          <button class="pm-close-btn dialog-btn">Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    const search = this.overlay.querySelector('.pm-search');
    const listEl = this.overlay.querySelector('.pm-list');
    const detailEl = this.overlay.querySelector('.pm-detail');
    const closeX = this.overlay.querySelector('.pm-close-x');
    const closeBtn = this.overlay.querySelector('.pm-close-btn');
    const summaryEl = this.overlay.querySelector('.pm-summary');

    const renderList = (filter = '') => {
      const lower = filter.toLowerCase();
      const filtered = filter
        ? plugins.filter(p => p.displayName.toLowerCase().includes(lower))
        : plugins;

      if (filtered.length === 0) {
        listEl.innerHTML = '<div class="dialog-empty">No matching plugins</div>';
        detailEl.innerHTML = '';
        return;
      }

      listEl.innerHTML = filtered.map(p => `
        <div class="pm-item${p.id === this._selectedId ? ' active' : ''}${!p.active ? ' disabled' : ''}" data-id="${escapeHtml(p.id)}">
          <span class="pm-status-dot ${p.active ? 'pm-dot-active' : 'pm-dot-inactive'}"></span>
          <span class="pm-item-name">${escapeHtml(p.displayName)}</span>
          <span class="pm-item-version">${escapeHtml(p.version)}</span>
        </div>
      `).join('');

      // Auto-select first if current selection not in filtered list
      if (!filtered.find(p => p.id === this._selectedId)) {
        this._selectedId = filtered[0].id;
        const first = listEl.querySelector('.pm-item');
        if (first) first.classList.add('active');
      }

      renderDetail();
    };

    const renderDetail = () => {
      const p = plugins.find(p => p.id === this._selectedId);
      if (!p) {
        detailEl.innerHTML = '';
        return;
      }

      const activationEvents = p.manifest.notepadclone?.activationEvents || [];
      const contributes = p.manifest.notepadclone?.contributes || {};

      const contributionLines = [];
      for (const [type, items] of Object.entries(contributes)) {
        const count = Array.isArray(items) ? items.length : 1;
        contributionLines.push(`<span class="pm-badge">${count} ${escapeHtml(type)}</span>`);
      }

      const isSelf = p.id === 'notepadclone-plugin-manager';

      detailEl.innerHTML = `
        <div class="pm-detail-header">
          <div class="pm-detail-name">${escapeHtml(p.displayName)}</div>
          <div class="pm-detail-version">v${escapeHtml(p.version)}</div>
          <div class="pm-detail-id">${escapeHtml(p.id)}</div>
        </div>
        ${activationEvents.length > 0 ? `
          <div class="pm-section">
            <div class="pm-section-title">ACTIVATES ON</div>
            ${activationEvents.map(e => `<div class="pm-activation-event">${escapeHtml(e)}</div>`).join('')}
          </div>
        ` : ''}
        ${contributionLines.length > 0 ? `
          <div class="pm-section">
            <div class="pm-section-title">CONTRIBUTIONS</div>
            <div class="pm-badges">${contributionLines.join('')}</div>
          </div>
        ` : ''}
        <div class="pm-section">
          ${isSelf
            ? '<div class="pm-self-note">This plugin cannot be disabled.</div>'
            : `<button class="pm-toggle-btn dialog-btn ${p.active ? 'dialog-btn-danger' : 'dialog-btn-primary'}">${p.active ? 'Disable' : 'Enable'}</button>`
          }
        </div>
      `;

      // Wire toggle button
      const toggleBtn = detailEl.querySelector('.pm-toggle-btn');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => this._togglePlugin(p.id, plugins, renderList, summaryEl, search));
      }
    };

    const updateSummary = () => {
      const total = plugins.length;
      const enabled = plugins.filter(p => p.active).length;
      summaryEl.textContent = `${total} plugins \u00b7 ${enabled} enabled`;
    };

    // List click handler
    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.pm-item');
      if (!item) return;
      this._selectedId = item.dataset.id;
      listEl.querySelectorAll('.pm-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      renderDetail();
    });

    // Search
    search.addEventListener('input', () => renderList(search.value));

    // Close handlers
    closeX.addEventListener('click', () => this.close());
    closeBtn.addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._keyHandler);

    // Initial render
    this._selectedId = plugins.length > 0 ? plugins[0].id : null;
    renderList();
    updateSummary();

    // Store updateSummary for toggle use
    this._updateSummary = updateSummary;

    search.focus();
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
    this._selectedId = null;
    this._updateSummary = null;
  }

  _getPluginList() {
    const plugins = [];
    for (const [id, entry] of this.pluginHost._plugins) {
      plugins.push({
        id,
        displayName: entry.manifest.displayName || id,
        version: entry.manifest.version || '0.0.0',
        active: entry.active,
        manifest: entry.manifest,
      });
    }
    return plugins;
  }

  _getDisabledPlugins() {
    try {
      return JSON.parse(localStorage.getItem('notepadclone-disabled-plugins') || '[]');
    } catch {
      return [];
    }
  }

  _setDisabledPlugins(list) {
    localStorage.setItem('notepadclone-disabled-plugins', JSON.stringify(list));
  }

  async _togglePlugin(id, plugins, renderList, summaryEl, search) {
    const p = plugins.find(p => p.id === id);
    if (!p || id === 'notepadclone-plugin-manager') return;

    const disabled = this._getDisabledPlugins();

    if (p.active) {
      // Deactivate
      await this.pluginHost.deactivatePlugin(id);
      p.active = false;
      if (!disabled.includes(id)) disabled.push(id);
    } else {
      // Activate
      await this.pluginHost.activatePlugin(id);
      p.active = true;
      const idx = disabled.indexOf(id);
      if (idx !== -1) disabled.splice(idx, 1);
    }

    this._setDisabledPlugins(disabled);
    renderList(search.value);
    summaryEl.textContent = `${plugins.length} plugins \u00b7 ${plugins.filter(p => p.active).length} enabled`;
  }
}
