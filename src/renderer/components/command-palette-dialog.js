import { escapeHtml } from '../utils/escape-html';

/**
 * Command Palette — fuzzy-search launcher for all registered commands.
 * Ctrl+Shift+P to open. Type to filter, arrow keys to navigate, Enter to execute.
 */
export class CommandPaletteDialog {
  constructor(commandRegistry) {
    this._commandRegistry = commandRegistry;
    this._overlay = null;
    this._selectedIndex = 0;
    this._filteredCommands = [];
    this._keyHandler = null;
  }

  show() {
    if (this._overlay) return;

    const commands = this._getCommands();
    this._filteredCommands = commands;
    this._selectedIndex = 0;

    this._overlay = document.createElement('div');
    this._overlay.className = 'cmd-palette-overlay dialog-overlay';
    this._overlay.innerHTML = `
      <div class="cmd-palette-dialog">
        <div class="cmd-palette-input-wrap">
          <span class="cmd-palette-prefix">&gt;</span>
          <input type="text" class="cmd-palette-input" placeholder="Search commands..." autofocus>
        </div>
        <div class="cmd-palette-list"></div>
      </div>
    `;
    document.body.appendChild(this._overlay);

    const input = this._overlay.querySelector('.cmd-palette-input');
    const listEl = this._overlay.querySelector('.cmd-palette-list');

    this._renderList(listEl, commands);

    input.addEventListener('input', () => {
      this._filteredCommands = this._filterCommands(commands, input.value);
      this._selectedIndex = 0;
      this._renderList(listEl, this._filteredCommands);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (this._selectedIndex < this._filteredCommands.length - 1) {
          this._selectedIndex++;
          this._updateSelection(listEl);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (this._selectedIndex > 0) {
          this._selectedIndex--;
          this._updateSelection(listEl);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this._executeSelected();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });

    listEl.addEventListener('click', (e) => {
      const item = e.target.closest('.cmd-palette-item');
      if (item) {
        this._selectedIndex = parseInt(item.dataset.index, 10);
        this._executeSelected();
      }
    });

    // Click outside closes
    this._overlay.addEventListener('click', (e) => {
      if (e.target === this._overlay) this.close();
    });

    // Global Escape
    this._keyHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this._keyHandler);

    input.focus();
  }

  close() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
  }

  _getCommands() {
    const all = this._commandRegistry.getAll();
    const result = [];
    for (const [id, cmd] of all) {
      // Exclude the palette's own command
      if (id === 'commandPalette.show') continue;
      result.push({ id, title: cmd.title, shortcut: cmd.shortcut, handler: cmd.handler, when: cmd.when });
    }
    result.sort((a, b) => a.title.localeCompare(b.title));
    return result;
  }

  _filterCommands(commands, query) {
    if (!query.trim()) return commands;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return commands.filter(cmd => {
      const title = cmd.title.toLowerCase();
      return words.every(w => title.includes(w));
    });
  }

  _renderList(listEl, commands) {
    if (commands.length === 0) {
      listEl.innerHTML = '<div class="cmd-palette-empty">No matching commands</div>';
      return;
    }

    listEl.innerHTML = commands.map((cmd, idx) => {
      const selected = idx === this._selectedIndex ? ' selected' : '';
      const shortcutHtml = cmd.shortcut
        ? `<span class="cmd-palette-shortcut">${escapeHtml(this._formatShortcut(cmd.shortcut))}</span>`
        : '';
      return `<div class="cmd-palette-item${selected}" data-index="${idx}">
        <span class="cmd-palette-item-title">${escapeHtml(cmd.title)}</span>
        ${shortcutHtml}
      </div>`;
    }).join('');

    // Ensure selected item is visible
    this._scrollToSelected(listEl);
  }

  _updateSelection(listEl) {
    const items = listEl.querySelectorAll('.cmd-palette-item');
    items.forEach((item, idx) => {
      item.classList.toggle('selected', idx === this._selectedIndex);
    });
    this._scrollToSelected(listEl);
  }

  _scrollToSelected(listEl) {
    const selected = listEl.querySelector('.cmd-palette-item.selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }

  _executeSelected() {
    const cmd = this._filteredCommands[this._selectedIndex];
    if (!cmd) return;
    this.close();
    // Execute via the registry so `when` guards are respected
    this._commandRegistry.execute(cmd.id);
  }

  _formatShortcut(shortcut) {
    // Display as-is — already in readable format like "Ctrl+Shift+P"
    return shortcut;
  }
}
