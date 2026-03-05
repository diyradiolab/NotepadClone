/**
 * TerminalFileOpener — handles opening files from the terminal.
 *
 * Owns:
 * - CWD tracking via OSC 7
 * - `edit` command via OSC 9999
 * - Ctrl+click file links via xterm link provider
 * - Shared path resolution logic
 */
export class TerminalFileOpener {
  constructor(xterm, api, initialCwd) {
    this.xterm = xterm;
    this.api = api;
    this._cwd = initialCwd || null;

    this._registerOsc7Handler();
    this._registerOsc9999Handler();
    this._registerLinkProvider();
  }

  // ── CWD Tracking (OSC 7) ──

  _registerOsc7Handler() {
    this.xterm.parser.registerOscHandler(7, (data) => {
      // OSC 7 format: file://hostname/path/to/dir
      try {
        const url = new URL(data);
        if (url.protocol === 'file:') {
          this._cwd = decodeURIComponent(url.pathname);
        }
      } catch {
        // Not a valid URL — try plain path fallback
        if (data.startsWith('/')) {
          this._cwd = data;
        }
      }
      return false; // allow other handlers to process too
    });
  }

  getCwd() {
    return this._cwd;
  }

  // ── edit Command (OSC 9999) ──

  _registerOsc9999Handler() {
    this.xterm.parser.registerOscHandler(9999, (data) => {
      if (data) {
        this._openFile(data, true);
      }
      return true;
    });
  }

  // ── Ctrl+Click File Links ──

  _registerLinkProvider() {
    const self = this;

    this.xterm.registerLinkProvider({
      provideLinks(bufferLineNumber, callback) {
        const buffer = self.xterm.buffer.active;
        const bufferLine = buffer.getLine(bufferLineNumber - 1);
        if (!bufferLine) { callback(undefined); return; }

        const line = bufferLine.translateToString(true);
        if (!line.trim()) { callback(undefined); return; }

        const links = [];

        // Match paths containing / (with optional :line suffix)
        // Covers: ./src/file.js, ../lib/utils.ts, /abs/path, src/dir/file.js, file.js:42
        const regex = /(?:\.{0,2}\/[^\s:]+|[a-zA-Z0-9_][a-zA-Z0-9_\-.]*\/[^\s:]+)(?::(\d+))?/g;
        let match;

        while ((match = regex.exec(line)) !== null) {
          const text = match[0];

          // Skip URLs
          if (text.includes('://')) continue;

          const startX = match.index + 1; // 1-based
          const endX = startX + text.length; // exclusive end

          links.push({
            range: {
              start: { x: startX, y: bufferLineNumber },
              end: { x: endX, y: bufferLineNumber },
            },
            text,
            decorations: { pointerCursor: true, underline: true },
            activate(_event, linkText) {
              self._openFile(linkText, false);
            },
            hover(_event, linkText) {
              // Tooltip handled by xterm decorations
            },
          });
        }

        callback(links.length > 0 ? links : undefined);
      },
    });
  }

  // ── Shared File Opening ──

  async _openFile(rawPath, focusEditor) {
    const { filePath, lineNumber } = this._parsePath(rawPath);
    const result = await window.api.resolvePath(filePath, this._cwd);

    if (!result.exists) {
      this._showNotification(`File not found: ${result.absolutePath}`);
      return;
    }

    this.api.events.emit('file:openByPath', {
      filePath: result.absolutePath,
      lineNumber: lineNumber || undefined,
    });

    if (focusEditor) {
      // Small delay to let the tab/editor activate before focusing
      requestAnimationFrame(() => {
        const editor = this.api.editor.getActiveEditor();
        if (editor) editor.focus();
      });
    }
  }

  _parsePath(rawPath) {
    // Strip trailing :lineNumber pattern
    const match = rawPath.match(/^(.+?):(\d+)(?::(\d+))?$/);
    if (match) {
      return {
        filePath: match[1],
        lineNumber: parseInt(match[2], 10),
      };
    }
    return { filePath: rawPath, lineNumber: null };
  }

  _showNotification(message) {
    // Use a simple toast-style notification
    const toast = document.createElement('div');
    toast.className = 'term-notification';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 60px;
      right: 16px;
      background: #d32f2f;
      color: #fff;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 12px;
      font-family: sans-serif;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.2s;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  destroy() {
    // xterm.js disposes handlers when terminal is disposed — nothing extra needed
    this.xterm = null;
    this.api = null;
  }
}
