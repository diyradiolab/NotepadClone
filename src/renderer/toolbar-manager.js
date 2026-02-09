/**
 * ToolbarManager renders dynamic toolbar buttons from plugin contributions.
 * Plugins register buttons with groups and order; the manager renders them
 * and handles visibility updates when the active tab changes.
 */
export class ToolbarManager {
  constructor(toolbarElement) {
    this.toolbar = toolbarElement;
    this._buttons = new Map(); // id → { icon, title, group, order, visible?(), action, element? }
    this._dynamicContainer = null;
  }

  /**
   * Register a toolbar button contribution from a plugin.
   */
  register(button) {
    if (!button.id) throw new Error('Toolbar button must have an id');
    this._buttons.set(button.id, {
      ...button,
      element: null,
    });
  }

  unregister(id) {
    const btn = this._buttons.get(id);
    if (btn && btn.element) {
      btn.element.remove();
    }
    this._buttons.delete(id);
  }

  /**
   * Render all registered dynamic buttons into the toolbar.
   * Called once after all plugins are activated.
   */
  render() {
    // Create or clear the dynamic container
    if (!this._dynamicContainer) {
      this._dynamicContainer = document.createElement('span');
      this._dynamicContainer.className = 'toolbar-dynamic';
      this.toolbar.appendChild(this._dynamicContainer);
    }
    this._dynamicContainer.innerHTML = '';

    // Sort buttons by group then order
    const sorted = [...this._buttons.values()].sort((a, b) => {
      if (a.group !== b.group) return (a.group || '').localeCompare(b.group || '');
      return (a.order || 0) - (b.order || 0);
    });

    let lastGroup = null;
    for (const btn of sorted) {
      // Add separator between groups
      if (lastGroup !== null && btn.group !== lastGroup) {
        const sep = document.createElement('span');
        sep.className = 'toolbar-separator';
        this._dynamicContainer.appendChild(sep);
      }
      lastGroup = btn.group;

      const el = document.createElement('button');
      el.className = 'toolbar-btn';
      el.title = btn.title || '';
      el.innerHTML = `<span class="toolbar-icon">${btn.icon}</span>`;
      el.addEventListener('click', () => {
        if (typeof btn.action === 'function') {
          btn.action();
        }
      });
      btn.element = el;
      this._dynamicContainer.appendChild(el);
    }
  }

  /**
   * Update visibility of all dynamic buttons.
   * Called when the active tab changes.
   */
  updateVisibility(context) {
    for (const btn of this._buttons.values()) {
      if (!btn.element) continue;
      if (typeof btn.visible === 'function') {
        btn.element.style.display = btn.visible(context) ? '' : 'none';
      }
    }
  }

  /**
   * Show or hide a specific button by id.
   */
  setVisible(id, visible) {
    const btn = this._buttons.get(id);
    if (btn && btn.element) {
      btn.element.style.display = visible ? '' : 'none';
    }
  }
}
