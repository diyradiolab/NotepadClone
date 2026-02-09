import { escapeHtml } from '../utils/escape-html';

const LANGUAGES = [
  'SQL', 'PowerShell', 'C#', 'JavaScript', 'TypeScript', 'Python', 'HTML', 'CSS',
  'JSON', 'XML', 'YAML', 'Shell', 'Batch', 'Ruby', 'Go', 'Rust', 'Java', 'C',
  'C++', 'PHP', 'Markdown', 'Plain Text',
];

export class SnippetsDialog {
  constructor() {
    this.overlay = null;
    this.onInsertCallback = null;
    this.selectedIndex = -1;
    this.snippets = [];
    this.filtered = [];
  }

  onInsert(cb) {
    this.onInsertCallback = cb;
  }

  async show(opts = {}) {
    if (this.overlay) return;

    this.snippets = await window.api.getSnippets();
    this.selectedIndex = -1;

    this.overlay = document.createElement('div');
    this.overlay.className = 'snip-overlay dialog-overlay';

    const count = this.snippets.length;
    this.overlay.innerHTML = `
      <div class="snip-dialog dialog-box">
        <div class="snip-header dialog-header">
          <span class="snip-title dialog-title">Code Snippets</span>
          <span class="snip-count">${count} snippet${count !== 1 ? 's' : ''}</span>
        </div>
        <div class="snip-toolbar">
          <select class="snip-lang-filter">
            <option value="">All Languages</option>
          </select>
          <input type="text" class="snip-search dialog-search" placeholder="Search snippets..." autofocus>
        </div>
        <div class="snip-list"></div>
        <div class="snip-preview-container">
          <div class="snip-preview-label">Preview</div>
          <pre class="snip-preview"></pre>
        </div>
        <div class="snip-footer dialog-footer">
          <div class="snip-footer-left">
            <button class="snip-btn-new dialog-btn">New</button>
            <button class="snip-btn-edit dialog-btn" disabled>Edit</button>
            <button class="snip-btn-delete dialog-btn" disabled>Delete</button>
            <button class="snip-btn-import dialog-btn">Import</button>
            <button class="snip-btn-export dialog-btn">Export</button>
          </div>
          <button class="snip-btn-insert dialog-btn dialog-btn-primary" disabled>Insert</button>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);

    this._cacheElements();
    this._populateLangFilter();
    this._renderList();
    this._bindEvents();

    // If prefillCode is provided, go straight to new-snippet form
    if (opts.prefillCode) {
      this._showForm(null, opts.prefillCode, opts.prefillLanguage || 'Plain Text');
    }

    this.els.search.focus();
  }

  _cacheElements() {
    const o = this.overlay;
    this.els = {
      langFilter: o.querySelector('.snip-lang-filter'),
      search: o.querySelector('.snip-search'),
      list: o.querySelector('.snip-list'),
      preview: o.querySelector('.snip-preview'),
      previewContainer: o.querySelector('.snip-preview-container'),
      count: o.querySelector('.snip-count'),
      btnNew: o.querySelector('.snip-btn-new'),
      btnEdit: o.querySelector('.snip-btn-edit'),
      btnDelete: o.querySelector('.snip-btn-delete'),
      btnImport: o.querySelector('.snip-btn-import'),
      btnExport: o.querySelector('.snip-btn-export'),
      btnInsert: o.querySelector('.snip-btn-insert'),
      dialog: o.querySelector('.snip-dialog'),
    };
  }

  _populateLangFilter() {
    const usedLangs = [...new Set(this.snippets.map(s => s.language))].sort();
    const select = this.els.langFilter;
    // Keep "All Languages" option, clear rest
    select.innerHTML = '<option value="">All Languages</option>';
    for (const lang of usedLangs) {
      const opt = document.createElement('option');
      opt.value = lang;
      opt.textContent = lang;
      select.appendChild(opt);
    }
  }

  _getFiltered() {
    const langVal = this.els.langFilter.value;
    const searchVal = this.els.search.value.toLowerCase();
    return this.snippets.filter(s => {
      if (langVal && s.language !== langVal) return false;
      if (searchVal && !s.name.toLowerCase().includes(searchVal)) return false;
      return true;
    });
  }

  _renderList() {
    this.filtered = this._getFiltered();
    const listEl = this.els.list;

    if (this.filtered.length === 0) {
      listEl.innerHTML = '<div class="snip-empty">No snippets found</div>';
      this.selectedIndex = -1;
      this._updateSelection();
      return;
    }

    listEl.innerHTML = this.filtered.map((s, idx) => {
      const selected = idx === this.selectedIndex ? ' selected' : '';
      return `<div class="snip-item${selected}" data-index="${idx}">
        <span class="snip-item-name">${escapeHtml(s.name)}</span>
        <span class="snip-lang-badge">${escapeHtml(s.language)}</span>
      </div>`;
    }).join('');

    this._updateSelection();
  }

  _updateSelection() {
    const { preview, previewContainer, btnEdit, btnDelete, btnInsert } = this.els;
    const snippet = this.filtered[this.selectedIndex];

    if (snippet) {
      preview.textContent = snippet.code;
      previewContainer.style.display = '';
      btnEdit.disabled = false;
      btnDelete.disabled = false;
      btnInsert.disabled = false;
    } else {
      preview.textContent = '';
      previewContainer.style.display = 'none';
      btnEdit.disabled = true;
      btnDelete.disabled = true;
      btnInsert.disabled = true;
    }

    // Update visual selection in list
    const items = this.els.list.querySelectorAll('.snip-item');
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === this.selectedIndex);
    });
  }

  _updateCount() {
    const count = this.snippets.length;
    this.els.count.textContent = `${count} snippet${count !== 1 ? 's' : ''}`;
  }

  _bindEvents() {
    const { langFilter, search, list, btnNew, btnEdit, btnDelete, btnImport, btnExport, btnInsert } = this.els;

    langFilter.addEventListener('change', () => {
      this.selectedIndex = -1;
      this._renderList();
    });

    search.addEventListener('input', () => {
      this.selectedIndex = -1;
      this._renderList();
    });

    list.addEventListener('click', (e) => {
      const item = e.target.closest('.snip-item');
      if (!item) return;
      this.selectedIndex = parseInt(item.dataset.index, 10);
      this._updateSelection();
    });

    list.addEventListener('dblclick', (e) => {
      const item = e.target.closest('.snip-item');
      if (!item) return;
      this.selectedIndex = parseInt(item.dataset.index, 10);
      this._insertSelected();
    });

    btnNew.addEventListener('click', () => this._showForm(null));
    btnEdit.addEventListener('click', () => {
      const snippet = this.filtered[this.selectedIndex];
      if (snippet) this._showForm(snippet);
    });
    btnDelete.addEventListener('click', () => this._deleteSelected());
    btnImport.addEventListener('click', () => this._importSnippets());
    btnExport.addEventListener('click', () => this._exportSnippets());
    btnInsert.addEventListener('click', () => this._insertSelected());

    // Overlay click-outside
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Keyboard
    this._keyHandler = (e) => {
      if (e.key === 'Escape') {
        // If form is open, close form. Otherwise close dialog.
        const form = this.overlay && this.overlay.querySelector('.snip-form');
        if (form) {
          this._hideForm();
        } else {
          this.close();
        }
        e.stopPropagation();
      }
      if (e.key === 'Enter' && !e.target.closest('.snip-form')) {
        if (this.selectedIndex >= 0) {
          this._insertSelected();
        }
      }
      // Arrow keys for list navigation when search is focused
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.target.closest('.snip-form')) {
        e.preventDefault();
        if (e.key === 'ArrowDown' && this.selectedIndex < this.filtered.length - 1) {
          this.selectedIndex++;
        } else if (e.key === 'ArrowUp' && this.selectedIndex > 0) {
          this.selectedIndex--;
        }
        this._updateSelection();
        // Scroll selected into view
        const selectedEl = this.els.list.querySelector('.snip-item.selected');
        if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
      }
    };
    document.addEventListener('keydown', this._keyHandler, true);
  }

  _insertSelected() {
    const snippet = this.filtered[this.selectedIndex];
    if (!snippet) return;
    this.close();
    if (this.onInsertCallback) {
      this.onInsertCallback(snippet.code);
    }
  }

  _showForm(snippet, prefillCode, prefillLanguage) {
    const isEdit = !!snippet;
    const dialog = this.els.dialog;

    // Hide list, preview, and toolbar
    this.els.list.style.display = 'none';
    this.els.previewContainer.style.display = 'none';
    this.els.toolbar = this.overlay.querySelector('.snip-toolbar');
    this.els.toolbar.style.display = 'none';

    // Hide footer left buttons, show only cancel/save
    const footerLeft = this.overlay.querySelector('.snip-footer-left');
    footerLeft.style.display = 'none';
    this.els.btnInsert.style.display = 'none';

    // Create form
    const form = document.createElement('div');
    form.className = 'snip-form';

    const langOptions = LANGUAGES.map(l => {
      const sel = (isEdit ? snippet.language : (prefillLanguage || 'Plain Text')) === l ? ' selected' : '';
      return `<option value="${escapeHtml(l)}"${sel}>${escapeHtml(l)}</option>`;
    }).join('');

    form.innerHTML = `
      <div class="snip-form-row">
        <label class="snip-form-label">Name</label>
        <input type="text" class="snip-form-name" placeholder="Snippet name..." value="${isEdit ? escapeHtml(snippet.name) : ''}">
      </div>
      <div class="snip-form-row">
        <label class="snip-form-label">Language</label>
        <select class="snip-form-lang">${langOptions}</select>
      </div>
      <div class="snip-form-row">
        <label class="snip-form-label">Code</label>
        <textarea class="snip-form-textarea" rows="8" placeholder="Paste or type code...">${isEdit ? escapeHtml(snippet.code) : (prefillCode ? escapeHtml(prefillCode) : '')}</textarea>
      </div>
      <div class="snip-form-actions">
        <button class="snip-form-cancel dialog-btn">Cancel</button>
        <button class="snip-form-save dialog-btn dialog-btn-primary">${isEdit ? 'Save' : 'Add'}</button>
      </div>
    `;

    // Insert form before footer
    const footer = this.overlay.querySelector('.snip-footer');
    footer.style.display = 'none';
    dialog.insertBefore(form, footer);

    const nameInput = form.querySelector('.snip-form-name');
    const langSelect = form.querySelector('.snip-form-lang');
    const textarea = form.querySelector('.snip-form-textarea');

    nameInput.focus();

    form.querySelector('.snip-form-cancel').addEventListener('click', () => this._hideForm());
    form.querySelector('.snip-form-save').addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const language = langSelect.value;
      const code = textarea.value;

      if (!name) { nameInput.focus(); return; }
      if (!code) { textarea.focus(); return; }

      if (isEdit) {
        snippet.name = name;
        snippet.language = language;
        snippet.code = code;
      } else {
        this.snippets.push({
          id: crypto.randomUUID(),
          name,
          language,
          code,
          createdAt: Date.now(),
        });
      }

      await window.api.saveSnippets(this.snippets);
      this._hideForm();
      this._populateLangFilter();
      this._updateCount();
      this._renderList();
    });
  }

  _hideForm() {
    const form = this.overlay.querySelector('.snip-form');
    if (form) form.remove();

    // Restore list, preview, toolbar, footer
    this.els.list.style.display = '';
    this.overlay.querySelector('.snip-toolbar').style.display = '';
    const footerLeft = this.overlay.querySelector('.snip-footer-left');
    footerLeft.style.display = '';
    this.els.btnInsert.style.display = '';
    this.overlay.querySelector('.snip-footer').style.display = '';

    this._renderList();
    this.els.search.focus();
  }

  async _deleteSelected() {
    const snippet = this.filtered[this.selectedIndex];
    if (!snippet) return;

    const ok = confirm(`Delete snippet "${snippet.name}"?`);
    if (!ok) return;

    const idx = this.snippets.indexOf(snippet);
    if (idx !== -1) this.snippets.splice(idx, 1);

    await window.api.saveSnippets(this.snippets);
    this.selectedIndex = -1;
    this._populateLangFilter();
    this._updateCount();
    this._renderList();
  }

  async _importSnippets() {
    const imported = await window.api.importSnippets();
    if (!imported || !Array.isArray(imported)) return;

    const existingIds = new Set(this.snippets.map(s => s.id));
    let added = 0;
    for (const s of imported) {
      if (s.id && s.name && s.code && !existingIds.has(s.id)) {
        this.snippets.push(s);
        existingIds.add(s.id);
        added++;
      }
    }

    if (added > 0) {
      await window.api.saveSnippets(this.snippets);
      this._populateLangFilter();
      this._updateCount();
      this._renderList();
    }
  }

  async _exportSnippets() {
    if (this.snippets.length === 0) return;
    await window.api.exportSnippets(this.snippets);
  }

  close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler, true);
      this._keyHandler = null;
    }
    this.els = null;
  }
}
