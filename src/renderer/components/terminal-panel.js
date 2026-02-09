import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export class TerminalPanel {
  constructor(container, api) {
    this.container = container;
    this.api = api;
    this.xterm = null;
    this.fitAddon = null;
    this.removeDataListener = null;
    this.removeExitListener = null;
    this._exited = false;
    this._resizeTimeout = null;
    this._rendered = false;

    this._render();
    this._initResize();
    this._restoreHeight();

    // ResizeObserver to refit terminal when container resizes
    this._resizeObserver = new ResizeObserver(() => this._debouncedFit());
    this._resizeObserver.observe(this.container);
  }

  // ── Render ──

  _render() {
    this.container.innerHTML = `
      <div class="term-resize-handle"></div>
      <div class="term-header">
        <span class="term-title">Terminal</span>
        <button class="term-btn-close" title="Close (Ctrl+\`)">×</button>
      </div>
      <div class="term-body"></div>
    `;
    this._rendered = true;

    this.container.querySelector('.term-btn-close').addEventListener('click', () => this.hide());
  }

  // ── Lifecycle ──

  toggle() {
    if (this.container.classList.contains('hidden')) {
      this.show();
    } else {
      // If terminal is focused, move focus to editor. Otherwise hide panel.
      if (this.xterm && this.xterm.textarea === document.activeElement) {
        const editor = this.api.editor.getActiveEditor();
        if (editor) editor.focus();
      } else {
        this.hide();
      }
    }
  }

  show() {
    this.container.classList.remove('hidden');

    if (!this.xterm) {
      this._spawnTerminal();
    } else {
      // Refit existing terminal to possibly new container size
      this._debouncedFit();
      this.xterm.focus();
    }
  }

  hide() {
    this.container.classList.add('hidden');
    // Session stays alive — just hide the panel
  }

  destroy() {
    if (this.removeDataListener) { this.removeDataListener(); this.removeDataListener = null; }
    if (this.removeExitListener) { this.removeExitListener(); this.removeExitListener = null; }
    if (this._resizeObserver) { this._resizeObserver.disconnect(); }
    if (this.xterm) { this.xterm.dispose(); this.xterm = null; }
    window.api.terminalKill();
  }

  // ── Terminal Management ──

  async _spawnTerminal() {
    const body = this.container.querySelector('.term-body');
    body.innerHTML = '';

    // Create xterm.js instance
    this.xterm = new Terminal({
      scrollback: 5000,
      fontSize: 13,
      fontFamily: "'Courier New', Consolas, 'Liberation Mono', monospace",
      theme: this._getXtermTheme(),
      cursorBlink: true,
      allowProposedApi: true,
    });

    this.fitAddon = new FitAddon();
    this.xterm.loadAddon(this.fitAddon);
    this.xterm.loadAddon(new WebLinksAddon());

    this.xterm.open(body);

    // Fit after a frame so the container has dimensions
    requestAnimationFrame(() => {
      this.fitAddon.fit();

      // Wire IPC: xterm input → main process
      this.xterm.onData((data) => {
        if (this._exited) {
          // If shell exited and user presses Enter, restart
          if (data === '\r') {
            this._exited = false;
            this._spawnTerminal();
          }
          return;
        }
        window.api.terminalWrite(data);
      });

      // Wire IPC: main process output → xterm
      this.removeDataListener = window.api.onTerminalData((data) => {
        if (this.xterm) this.xterm.write(data);
      });

      this.removeExitListener = window.api.onTerminalExit((exitCode) => {
        this._exited = true;
        if (this.xterm) {
          this.xterm.writeln('');
          this.xterm.writeln(`\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`);
          this.xterm.writeln('\x1b[90m[Press Enter to start a new session]\x1b[0m');
        }
      });

      // Spawn PTY in main process
      const cwd = this._getWorkingDirectory();
      window.api.terminalCreate({ cwd }).then((result) => {
        if (!result.success) {
          this.xterm.writeln(`\x1b[31mFailed to start terminal: ${result.error}\x1b[0m`);
          this._exited = true;
        }
      });

      this.xterm.focus();
    });
  }

  _getWorkingDirectory() {
    // Check if file-explorer has an open folder
    try {
      const pluginHost = this.api._services.pluginHost;
      const explorerPlugin = pluginHost._plugins.get('notepadclone-file-explorer');
      if (explorerPlugin && explorerPlugin._exports) {
        const panel = explorerPlugin._exports.getPanel();
        if (panel && panel.currentPath) return panel.currentPath;
      }
    } catch (_) { /* fallback */ }
    return null; // terminal-service will use os.homedir()
  }

  // ── Theme ──

  _getXtermTheme() {
    // Always dark — terminals look best dark regardless of app theme
    return {
      background: '#1e1e1e',
      foreground: '#cccccc',
      cursor: '#f0f0f0',
      cursorAccent: '#1e1e1e',
      selectionBackground: 'rgba(255, 255, 255, 0.2)',
      black: '#000000',
      red: '#cd3131',
      green: '#0dbc79',
      yellow: '#e5e510',
      blue: '#2472c8',
      magenta: '#bc3fbc',
      cyan: '#11a8cd',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff',
    };
  }

  // ── Resize ──

  _initResize() {
    const handle = this.container.querySelector('.term-resize-handle');
    if (!handle) return;

    let startY, startHeight;

    const onMouseMove = (e) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.8, startHeight + delta));
      this.container.style.height = newHeight + 'px';
    };

    const onMouseUp = () => {
      handle.classList.remove('term-dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this._persistHeight();
      this._debouncedFit();
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = this.container.offsetHeight;
      handle.classList.add('term-dragging');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _debouncedFit() {
    clearTimeout(this._resizeTimeout);
    this._resizeTimeout = setTimeout(() => {
      if (this.fitAddon && this.xterm && !this.container.classList.contains('hidden')) {
        try {
          this.fitAddon.fit();
          const dims = this.fitAddon.proposeDimensions();
          if (dims && dims.cols > 0 && dims.rows > 0) {
            window.api.terminalResize(dims.cols, dims.rows);
          }
        } catch (_) { /* ignore if disposed */ }
      }
    }, 100);
  }

  _persistHeight() {
    localStorage.setItem('terminal-panel-height', this.container.style.height);
  }

  _restoreHeight() {
    const saved = localStorage.getItem('terminal-panel-height');
    if (saved) {
      this.container.style.height = saved;
    }
  }
}
