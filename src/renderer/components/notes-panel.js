import { escapeHtml } from '../utils/escape-html';

/**
 * NotesPanel — right-side scratchpad for quick notes.
 * Multiple named plain-text notes, persisted via electron-store.
 */
export class NotesPanel {
  constructor(container) {
    this.container = container;
    this.notes = [];
    this.activeNoteId = null;
    this.searchQuery = '';
    this._saveTimeout = null;
    this._noteCounter = 0;
    this._render();
    this._loadNotes();
    this._initResize();
  }

  // ── Public API ──

  toggle() {
    this.container.classList.toggle('hidden');
    if (!this.container.classList.contains('hidden')) {
      // Focus textarea when opening
      const ta = this.container.querySelector('.notes-textarea');
      if (ta) ta.focus();
    }
    this._debounceSave();
  }

  show() {
    this.container.classList.remove('hidden');
  }

  hide() {
    this.container.classList.add('hidden');
  }

  isVisible() {
    return !this.container.classList.contains('hidden');
  }

  // Flush any pending save (call on beforeunload)
  flushSave() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
      this._saveNotes();
    }
  }

  // ── Render ──

  _render() {
    this.container.innerHTML = `
      <div class="notes-resize"></div>
      <div class="notes-header panel-header">
        <span class="notes-header-title">NOTES</span>
        <button class="notes-header-btn panel-btn" id="notes-import-btn" title="Import Notes">&#8615;</button>
        <button class="notes-header-btn panel-btn" id="notes-export-btn" title="Export Notes">&#8613;</button>
        <button class="notes-header-btn panel-btn" id="notes-add-btn" title="New Note">+</button>
      </div>
      <div class="notes-search">
        <input type="text" class="notes-search-input" placeholder="Search notes..." />
      </div>
      <div class="notes-list"></div>
      <textarea class="notes-textarea" placeholder="Select or create a note..."></textarea>
    `;

    // Bind header buttons
    this.container.querySelector('#notes-add-btn').addEventListener('click', () => {
      this._createNote();
    });
    this.container.querySelector('#notes-export-btn').addEventListener('click', () => {
      this._exportNotes();
    });
    this.container.querySelector('#notes-import-btn').addEventListener('click', () => {
      this._importNotes();
    });

    // Bind search
    const searchInput = this.container.querySelector('.notes-search-input');
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this._renderNoteList();
    });

    // Delegated click/dblclick handlers for note list items
    const noteList = this.container.querySelector('.notes-list');
    noteList.addEventListener('click', (e) => {
      const pin = e.target.closest('.notes-pin');
      if (pin) {
        const item = pin.closest('.notes-list-item');
        if (item) this._togglePin(item.dataset.id);
        return;
      }
      const close = e.target.closest('.notes-item-close');
      if (close) {
        const item = close.closest('.notes-list-item');
        if (item) this._deleteNote(item.dataset.id);
        return;
      }
      const item = e.target.closest('.notes-list-item');
      if (item) this._selectNote(item.dataset.id);
    });
    noteList.addEventListener('dblclick', (e) => {
      const item = e.target.closest('.notes-list-item');
      if (item) {
        e.preventDefault();
        this._startRename(item.dataset.id);
      }
    });

    // Bind textarea changes
    const textarea = this.container.querySelector('.notes-textarea');
    textarea.addEventListener('input', () => {
      if (!this.activeNoteId) return;
      const note = this.notes.find(n => n.id === this.activeNoteId);
      if (note) {
        note.content = textarea.value;
        this._debounceSave();
      }
    });
  }

  // ── Data ──

  async _loadNotes() {
    try {
      const data = await window.api.getNotesData();
      this.notes = data.notes || [];
      this.activeNoteId = data.activeNoteId || null;

      // Restore panel width
      if (data.panelWidth) {
        this.container.style.width = `${data.panelWidth}px`;
      }

      // Restore visibility
      if (data.visible) {
        this.container.classList.remove('hidden');
      }

      // Find max counter for naming
      for (const note of this.notes) {
        const match = note.title.match(/^Note (\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num >= this._noteCounter) this._noteCounter = num;
        }
      }

      this._renderNoteList();
      this._showActiveNote();
    } catch {
      // If data is corrupted, start fresh
      this.notes = [];
      this.activeNoteId = null;
      this._renderNoteList();
      this._showActiveNote();
    }
  }

  _saveNotes() {
    const data = {
      notes: this.notes,
      activeNoteId: this.activeNoteId,
      panelWidth: parseInt(this.container.style.width, 10) || 250,
      visible: this.isVisible(),
    };
    window.api.saveNotesData(data);
  }

  _debounceSave() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this._saveTimeout = null;
      this._saveNotes();
    }, 500);
  }

  // ── Note Operations ──

  _createNote() {
    this._noteCounter++;
    const note = {
      id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Note ${this._noteCounter}`,
      content: '',
      pinned: false,
      createdAt: Date.now(),
    };
    this.notes.push(note);
    this.activeNoteId = note.id;
    this._renderNoteList();
    this._showActiveNote();
    this._debounceSave();

    // Focus textarea
    const ta = this.container.querySelector('.notes-textarea');
    if (ta) ta.focus();
  }

  _deleteNote(id) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;

    this._showConfirmDialog(`Delete "${escapeHtml(note.title)}"?`, () => {
      const index = this.notes.findIndex(n => n.id === id);
      this.notes.splice(index, 1);

      if (this.activeNoteId === id) {
        // Select next, or previous, or null
        const sorted = this._getSortedNotes();
        if (sorted.length > 0) {
          // Try to pick the note at the same position
          const newIndex = Math.min(index, sorted.length - 1);
          this.activeNoteId = sorted[Math.max(0, newIndex)].id;
        } else {
          this.activeNoteId = null;
        }
      }

      this._renderNoteList();
      this._showActiveNote();
      this._debounceSave();
    });
  }

  _selectNote(id) {
    this.activeNoteId = id;
    this._renderNoteList();
    this._showActiveNote();
    this._debounceSave();
  }

  _togglePin(id) {
    const note = this.notes.find(n => n.id === id);
    if (note) {
      note.pinned = !note.pinned;
      this._renderNoteList();
      this._debounceSave();
    }
  }

  _startRename(id) {
    const item = this.container.querySelector(`.notes-list-item[data-id="${id}"]`);
    if (!item) return;

    const titleSpan = item.querySelector('.notes-item-title');
    const note = this.notes.find(n => n.id === id);
    if (!note || !titleSpan) return;

    // Replace title span with input
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'notes-item-title-input';
    input.value = note.title;
    titleSpan.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const newTitle = input.value.trim();
      if (newTitle) {
        note.title = newTitle;
      }
      // Re-render to go back to span
      this._renderNoteList();
      this._debounceSave();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        // Revert — just re-render without saving
        input.removeEventListener('blur', commit);
        this._renderNoteList();
      }
    });
  }

  // ── Rendering ──

  _getSortedNotes() {
    const filtered = this.searchQuery
      ? this.notes.filter(n =>
          n.title.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
          n.content.toLowerCase().includes(this.searchQuery.toLowerCase())
        )
      : [...this.notes];

    // Pinned first (alphabetical), then unpinned (alphabetical)
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return a.title.localeCompare(b.title);
    });

    return filtered;
  }

  _renderNoteList() {
    const list = this.container.querySelector('.notes-list');
    if (!list) return;

    const sorted = this._getSortedNotes();

    if (sorted.length === 0 && this.notes.length === 0) {
      list.innerHTML = '<div class="notes-empty">No notes yet. Click + to create one.</div>';
      return;
    }

    if (sorted.length === 0 && this.searchQuery) {
      list.innerHTML = '<div class="notes-empty">No matching notes.</div>';
      return;
    }

    list.innerHTML = '';
    for (const note of sorted) {
      const item = document.createElement('div');
      item.className = `notes-list-item${note.id === this.activeNoteId ? ' active' : ''}${note.pinned ? ' pinned' : ''}`;
      item.dataset.id = note.id;

      const pin = document.createElement('span');
      pin.className = 'notes-pin';
      pin.textContent = '\u{1F4CC}';
      pin.title = note.pinned ? 'Unpin' : 'Pin to top';
      pin.style.opacity = note.pinned ? '1' : '0.3';

      const title = document.createElement('span');
      title.className = 'notes-item-title';
      title.textContent = note.title;

      const close = document.createElement('button');
      close.className = 'notes-item-close';
      close.textContent = '\u00D7';
      close.title = 'Delete note';

      item.appendChild(pin);
      item.appendChild(title);
      item.appendChild(close);
      list.appendChild(item);
    }
  }

  _showActiveNote() {
    const textarea = this.container.querySelector('.notes-textarea');
    if (!textarea) return;

    if (!this.activeNoteId) {
      textarea.value = '';
      textarea.disabled = true;
      textarea.placeholder = 'Select or create a note...';
      return;
    }

    const note = this.notes.find(n => n.id === this.activeNoteId);
    if (!note) {
      textarea.value = '';
      textarea.disabled = true;
      return;
    }

    textarea.disabled = false;
    textarea.value = note.content;
    textarea.placeholder = 'Start typing...';
  }

  // ── Resize ──

  _initResize() {
    const handle = this.container.querySelector('.notes-resize');
    if (!handle) return;

    let startX, startWidth;

    const onMouseMove = (e) => {
      // Panel is on the right, so dragging left = wider
      const diff = startX - e.clientX;
      const newWidth = Math.max(180, Math.min(400, startWidth + diff));
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

  // ── Confirm Dialog ──

  _showConfirmDialog(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'notes-confirm-overlay dialog-overlay';
    overlay.innerHTML = `
      <div class="notes-confirm-dialog dialog-box">
        <p>${message}</p>
        <div class="notes-confirm-buttons dialog-footer">
          <button class="cancel-btn dialog-btn">Cancel</button>
          <button class="confirm-btn dialog-btn dialog-btn-danger">Delete</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      document.body.removeChild(overlay);
    };

    overlay.querySelector('.cancel-btn').addEventListener('click', close);
    overlay.querySelector('.confirm-btn').addEventListener('click', () => {
      close();
      onConfirm();
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Focus the cancel button for keyboard users
    overlay.querySelector('.cancel-btn').focus();

    // Escape to close
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        close();
        document.removeEventListener('keydown', onKeyDown);
      }
    };
    document.addEventListener('keydown', onKeyDown);
  }

  // ── Export / Import ──

  async _exportNotes() {
    if (this.notes.length === 0) return;
    this.flushSave();
    await window.api.exportNotes(this.notes);
  }

  async _importNotes() {
    let imported;
    try {
      imported = await window.api.importNotes();
    } catch {
      return; // invalid JSON or dialog cancelled
    }
    if (!imported || !Array.isArray(imported) || imported.length === 0) return;

    // Validate each note has required fields
    const valid = imported.filter(n => n && typeof n.title === 'string' && typeof n.content === 'string');
    if (valid.length === 0) return;

    // Merge: add imported notes, skip duplicates by title+content match
    let added = 0;
    for (const imp of valid) {
      const exists = this.notes.some(n => n.title === imp.title && n.content === imp.content);
      if (!exists) {
        this.notes.push({
          id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: imp.title,
          content: imp.content,
          pinned: imp.pinned || false,
          createdAt: imp.createdAt || Date.now(),
        });
        added++;
      }
    }

    if (added > 0) {
      // Select first imported note if none active
      if (!this.activeNoteId) {
        this.activeNoteId = this.notes[this.notes.length - 1].id;
      }
      this._renderNoteList();
      this._showActiveNote();
      this._debounceSave();
    }
  }

  // ── Util ──

}
