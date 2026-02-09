/**
 * Centralized command + keyboard shortcut registry.
 * Plugins register commands; toolbar, menus, and keyboard shortcuts all resolve through here.
 */
export class CommandRegistry {
  constructor() {
    this._commands = new Map(); // id → { title, handler, shortcut?, when?() }
  }

  register(id, { title, handler, shortcut, when }) {
    if (this._commands.has(id)) {
      console.warn(`[CommandRegistry] Overwriting command "${id}"`);
    }
    this._commands.set(id, { title, handler, shortcut, when });
  }

  unregister(id) {
    this._commands.delete(id);
  }

  async execute(id, ...args) {
    const cmd = this._commands.get(id);
    if (!cmd) {
      console.warn(`[CommandRegistry] Unknown command "${id}"`);
      return;
    }
    if (cmd.when && !cmd.when()) return;
    return await cmd.handler(...args);
  }

  has(id) {
    return this._commands.has(id);
  }

  get(id) {
    return this._commands.get(id);
  }

  getAll() {
    return this._commands;
  }

  /**
   * Set up a global keydown listener that dispatches to registered commands.
   * Shortcut format: "Ctrl+Shift+M", "Cmd+S", "Alt+Shift+C"
   * Ctrl and Cmd are treated as equivalent (Ctrl/Meta).
   */
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      for (const [id, cmd] of this._commands) {
        if (!cmd.shortcut) continue;
        if (this._matchesShortcut(e, cmd.shortcut)) {
          if (cmd.when && !cmd.when()) continue;
          e.preventDefault();
          cmd.handler();
          return;
        }
      }
    });
  }

  _matchesShortcut(e, shortcut) {
    const parts = shortcut.toLowerCase().split('+');
    const key = parts.pop();

    const needsCtrl = parts.includes('ctrl') || parts.includes('cmd');
    const needsShift = parts.includes('shift');
    const needsAlt = parts.includes('alt');

    const hasCtrl = e.ctrlKey || e.metaKey;
    const hasShift = e.shiftKey;
    const hasAlt = e.altKey;

    if (needsCtrl !== hasCtrl) return false;
    if (needsShift !== hasShift) return false;
    if (needsAlt !== hasAlt) return false;

    return e.key.toLowerCase() === key;
  }
}
