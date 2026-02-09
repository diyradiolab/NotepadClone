/**
 * CaptainsLogPanel — right-side daily journal panel.
 * One entry per day, keyed by YYYY-MM-DD.
 * Persisted via electron-store through IPC.
 */
export class CaptainsLogPanel {
  constructor(container) {
    this.container = container;
    this.entries = {};        // { 'YYYY-MM-DD': 'content string' }
    this.activeDateKey = null;
    this.searchQuery = '';
    this._saveTimeout = null;
    this.onBeforeShow = null; // hook for panel coordination

    this._render();
    this._loadData();
    this._initResize();
  }

  // ── Public API ──

  toggle() {
    if (this.container.classList.contains('hidden')) {
      if (this.onBeforeShow) this.onBeforeShow();
      this.container.classList.remove('hidden');
      this._ensureToday();
      this.activeDateKey = this._todayKey();
      this._renderDateList();
      this._showActiveEntry();
      const ta = this.container.querySelector('.cl-textarea');
      if (ta) ta.focus();
    } else {
      this.flushSave();
      this.container.classList.add('hidden');
    }
    this._debounceSave();
  }

  show() {
    if (this.onBeforeShow) this.onBeforeShow();
    this.container.classList.remove('hidden');
    this._ensureToday();
    this.activeDateKey = this._todayKey();
    this._renderDateList();
    this._showActiveEntry();
  }

  hide() {
    this.flushSave();
    this.container.classList.add('hidden');
  }

  isVisible() {
    return !this.container.classList.contains('hidden');
  }

  flushSave() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
      this._saveData();
    }
  }

  // ── Render ──

  _render() {
    this.container.innerHTML = `
      <div class="cl-resize"></div>
      <div class="cl-header panel-header">
        <span class="cl-header-title">CAPTAIN'S LOG</span>
      </div>
      <div class="cl-search">
        <input type="text" class="cl-search-input" placeholder="Search entries..." />
      </div>
      <div class="cl-list"></div>
      <div class="cl-entry-header"></div>
      <textarea class="cl-textarea" placeholder="Begin today's log entry..."></textarea>
    `;

    // Bind search
    const searchInput = this.container.querySelector('.cl-search-input');
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this._renderDateList();
    });

    // Delegated click for date list
    const list = this.container.querySelector('.cl-list');
    list.addEventListener('click', (e) => {
      const item = e.target.closest('.cl-list-item');
      if (item) this._selectEntry(item.dataset.date);
    });

    // Bind textarea changes
    const textarea = this.container.querySelector('.cl-textarea');
    textarea.addEventListener('input', () => {
      if (!this.activeDateKey) return;
      this.entries[this.activeDateKey] = textarea.value;
      this._debounceSave();
    });
  }

  // ── Data ──

  async _loadData() {
    try {
      const data = await window.api.getCaptainsLog();
      this.entries = data.entries || {};
      if (data.panelWidth) {
        this.container.style.width = `${data.panelWidth}px`;
      }
      if (data.visible) {
        if (this.onBeforeShow) this.onBeforeShow();
        this.container.classList.remove('hidden');
        this._ensureToday();
        this.activeDateKey = this._todayKey();
      }
      this._renderDateList();
      this._showActiveEntry();
    } catch {
      this.entries = {};
      this._renderDateList();
      this._showActiveEntry();
    }
  }

  _saveData() {
    // Clean up today's entry if empty and auto-created
    const todayKey = this._todayKey();
    if (todayKey in this.entries && this.entries[todayKey] === '') {
      delete this.entries[todayKey];
    }

    const data = {
      entries: this.entries,
      panelWidth: parseInt(this.container.style.width, 10) || 280,
      visible: this.isVisible(),
    };
    window.api.saveCaptainsLog(data);
  }

  _debounceSave() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this._saveTimeout = null;
      this._saveData();
    }, 500);
  }

  // ── Entry Operations ──

  _todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  _ensureToday() {
    const key = this._todayKey();
    if (!(key in this.entries)) {
      this.entries[key] = '';
    }
  }

  _selectEntry(dateKey) {
    this.activeDateKey = dateKey;
    this._renderDateList();
    this._showActiveEntry();
    const ta = this.container.querySelector('.cl-textarea');
    if (ta) ta.focus();
  }

  // ── Date Formatting ──

  _formatDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00'); // noon to avoid timezone issues
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getDay()];
    const human = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    return { dayName, human, full: `${dayName}, ${human}` };
  }

  // ── Rendering ──

  _getSortedDates() {
    let dates = Object.keys(this.entries).sort().reverse();

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      dates = dates.filter(key => this.entries[key].toLowerCase().includes(q));
    }

    return dates;
  }

  _renderDateList() {
    const list = this.container.querySelector('.cl-list');
    if (!list) return;

    const dates = this._getSortedDates();
    const todayKey = this._todayKey();

    if (dates.length === 0 && Object.keys(this.entries).length === 0) {
      list.innerHTML = '<div class="cl-empty">No log entries yet.</div>';
      return;
    }

    if (dates.length === 0 && this.searchQuery) {
      list.innerHTML = '<div class="cl-empty">No entries match your search.</div>';
      return;
    }

    list.innerHTML = '';
    for (const dateKey of dates) {
      const fmt = this._formatDate(dateKey);
      const item = document.createElement('div');
      item.className = `cl-list-item${dateKey === this.activeDateKey ? ' active' : ''}${dateKey === todayKey ? ' today' : ''}`;
      item.dataset.date = dateKey;

      const todayLabel = dateKey === todayKey ? '<span class="cl-today-label">Today</span> ' : '';
      item.innerHTML = `
        <span class="cl-item-primary">${todayLabel}${fmt.dayName}</span>
        <span class="cl-item-date">${fmt.human}</span>
      `;
      list.appendChild(item);
    }
  }

  _showActiveEntry() {
    const textarea = this.container.querySelector('.cl-textarea');
    const header = this.container.querySelector('.cl-entry-header');
    if (!textarea || !header) return;

    if (!this.activeDateKey || !(this.activeDateKey in this.entries)) {
      textarea.value = '';
      textarea.disabled = true;
      textarea.placeholder = 'Select a date or open the panel to start...';
      header.textContent = '';
      return;
    }

    const fmt = this._formatDate(this.activeDateKey);
    header.textContent = fmt.full;
    textarea.disabled = false;
    textarea.value = this.entries[this.activeDateKey];
    textarea.placeholder = "Begin today's log entry...";
  }

  // ── Resize ──

  _initResize() {
    const handle = this.container.querySelector('.cl-resize');
    if (!handle) return;

    let startX, startWidth;

    const onMouseMove = (e) => {
      const diff = startX - e.clientX;
      const newWidth = Math.max(200, Math.min(500, startWidth + diff));
      this.container.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this._debounceSave();
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = parseInt(this.container.style.width, 10) || this.container.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }
}
