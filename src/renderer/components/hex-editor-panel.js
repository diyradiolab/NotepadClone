const BYTES_PER_ROW = 16;
const MAX_RENDER_BYTES = 1024 * 1024; // 1MB rendered at a time

export class HexEditorPanel {
  constructor(parentEl) {
    this.el = document.createElement('div');
    this.el.className = 'hex-editor-panel';
    this.el.style.display = 'none';
    parentEl.appendChild(this.el);

    this._bytes = null; // Uint8Array
    this._filePath = null;
    this._selectedOffset = -1;
    this._searchMatches = new Set();

    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    this.el.innerHTML = `
      <div class="hex-toolbar">
        <label style="color:#888;">Go to offset:</label>
        <input type="text" class="hex-goto-input" placeholder="0x0000 or decimal">
        <button class="hex-goto-btn">Go</button>
        <span style="color:#666;">|</span>
        <label style="color:#888;">Search:</label>
        <input type="text" class="hex-search-input" placeholder="hex bytes or ASCII">
        <button class="hex-search-btn">Find</button>
        <span class="hex-file-info"></span>
      </div>
      <div class="hex-grid-container">
        <div class="hex-loading">Loading file...</div>
      </div>
      <div class="hex-status">
        <span class="hex-status-offset">Offset: —</span>
        <span class="hex-status-value">Value: —</span>
        <span class="hex-status-size">Size: —</span>
      </div>
    `;

    this._gotoInput = this.el.querySelector('.hex-goto-input');
    this._gotoBtn = this.el.querySelector('.hex-goto-btn');
    this._searchInput = this.el.querySelector('.hex-search-input');
    this._searchBtn = this.el.querySelector('.hex-search-btn');
    this._gridContainer = this.el.querySelector('.hex-grid-container');
    this._fileInfo = this.el.querySelector('.hex-file-info');
    this._statusOffset = this.el.querySelector('.hex-status-offset');
    this._statusValue = this.el.querySelector('.hex-status-value');
    this._statusSize = this.el.querySelector('.hex-status-size');
  }

  _bindEvents() {
    this._gotoBtn.addEventListener('click', () => this._goToOffset());
    this._gotoInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._goToOffset();
    });

    this._searchBtn.addEventListener('click', () => this._search());
    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._search();
    });

    this._gridContainer.addEventListener('click', (e) => {
      const byteEl = e.target.closest('[data-offset]');
      if (byteEl) {
        this._selectOffset(parseInt(byteEl.dataset.offset, 10));
      }
    });
  }

  async loadFile(filePath) {
    this._filePath = filePath;
    this._gridContainer.innerHTML = '<div class="hex-loading">Loading file...</div>';

    try {
      const base64 = await window.api.readFileBinary(filePath);
      const binaryStr = atob(base64);
      this._bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        this._bytes[i] = binaryStr.charCodeAt(i);
      }

      const fileName = filePath.split('/').pop().split('\\').pop();
      this._fileInfo.textContent = `${fileName} — ${this._formatSize(this._bytes.length)}`;
      this._statusSize.textContent = `Size: ${this._bytes.length.toLocaleString()} bytes`;

      this._renderGrid();
    } catch (err) {
      this._gridContainer.innerHTML = `<div class="hex-loading" style="color:#f44336;">Error: ${err.message || err}</div>`;
    }
  }

  _renderGrid() {
    if (!this._bytes) return;

    const totalBytes = Math.min(this._bytes.length, MAX_RENDER_BYTES);
    const rows = Math.ceil(totalBytes / BYTES_PER_ROW);
    const offsetWidth = Math.max(8, this._bytes.length.toString(16).length);

    const fragment = document.createDocumentFragment();
    const grid = document.createElement('div');
    grid.className = 'hex-grid';

    for (let row = 0; row < rows; row++) {
      const rowStart = row * BYTES_PER_ROW;
      const rowEl = document.createElement('div');
      rowEl.className = 'hex-row';

      // Offset column
      const offsetEl = document.createElement('span');
      offsetEl.className = 'hex-offset';
      offsetEl.textContent = rowStart.toString(16).toUpperCase().padStart(offsetWidth, '0');
      rowEl.appendChild(offsetEl);

      // Hex bytes column
      const bytesEl = document.createElement('span');
      bytesEl.className = 'hex-bytes';

      let hexStr = '';
      for (let col = 0; col < BYTES_PER_ROW; col++) {
        const offset = rowStart + col;
        if (col === 8) hexStr += ' '; // gap between groups of 8
        if (offset < this._bytes.length) {
          const hex = this._bytes[offset].toString(16).toUpperCase().padStart(2, '0');
          const matchClass = this._searchMatches.has(offset) ? ' search-match' : '';
          const selClass = offset === this._selectedOffset ? ' selected' : '';
          hexStr += `<span class="hex-byte${matchClass}${selClass}" data-offset="${offset}">${hex}</span> `;
        } else {
          hexStr += '   ';
        }
      }
      bytesEl.innerHTML = hexStr;
      rowEl.appendChild(bytesEl);

      // Separator
      const sep = document.createElement('span');
      sep.className = 'hex-separator';
      rowEl.appendChild(sep);

      // ASCII column
      const asciiEl = document.createElement('span');
      asciiEl.className = 'hex-ascii';

      let asciiStr = '';
      for (let col = 0; col < BYTES_PER_ROW; col++) {
        const offset = rowStart + col;
        if (offset < this._bytes.length) {
          const byte = this._bytes[offset];
          const ch = (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
          const isPrintable = byte >= 32 && byte <= 126;
          const matchClass = this._searchMatches.has(offset) ? ' search-match' : '';
          const selClass = offset === this._selectedOffset ? ' selected' : '';
          const npClass = isPrintable ? '' : ' non-printable';
          const escaped = ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '&' ? '&amp;' : ch === '"' ? '&quot;' : ch;
          asciiStr += `<span class="ascii-char${npClass}${matchClass}${selClass}" data-offset="${offset}">${escaped}</span>`;
        }
      }
      asciiEl.innerHTML = asciiStr;
      rowEl.appendChild(asciiEl);

      grid.appendChild(rowEl);
    }

    if (this._bytes.length > MAX_RENDER_BYTES) {
      const notice = document.createElement('div');
      notice.style.cssText = 'text-align:center; padding:12px; color:#888; font-family:system-ui;';
      notice.textContent = `Showing first ${this._formatSize(MAX_RENDER_BYTES)} of ${this._formatSize(this._bytes.length)}`;
      grid.appendChild(notice);
    }

    fragment.appendChild(grid);
    this._gridContainer.innerHTML = '';
    this._gridContainer.appendChild(fragment);
  }

  _selectOffset(offset) {
    if (!this._bytes || offset < 0 || offset >= this._bytes.length) return;

    // Remove old selection
    this._gridContainer.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

    this._selectedOffset = offset;

    // Add new selection
    this._gridContainer.querySelectorAll(`[data-offset="${offset}"]`).forEach(el => el.classList.add('selected'));

    // Update status
    const byte = this._bytes[offset];
    this._statusOffset.textContent = `Offset: 0x${offset.toString(16).toUpperCase()} (${offset})`;
    this._statusValue.textContent = `Value: 0x${byte.toString(16).toUpperCase().padStart(2, '0')} (${byte}) '${byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'}'`;
  }

  _goToOffset() {
    const input = this._gotoInput.value.trim();
    if (!input) return;

    let offset;
    if (input.startsWith('0x') || input.startsWith('0X')) {
      offset = parseInt(input, 16);
    } else {
      offset = parseInt(input, 10);
    }

    if (isNaN(offset) || offset < 0) return;
    if (!this._bytes || offset >= this._bytes.length) return;

    this._selectOffset(offset);

    // Scroll to the row
    const row = Math.floor(offset / BYTES_PER_ROW);
    const rowEl = this._gridContainer.querySelectorAll('.hex-row')[row];
    if (rowEl) rowEl.scrollIntoView({ block: 'center' });
  }

  _search() {
    const query = this._searchInput.value.trim();
    if (!query || !this._bytes) return;

    this._searchMatches.clear();

    // Try parsing as hex bytes first (e.g., "FF 00 AB" or "ff00ab")
    const hexPattern = query.replace(/\s+/g, '');
    const isHex = /^[0-9a-fA-F]+$/.test(hexPattern) && hexPattern.length % 2 === 0;

    let searchBytes;
    if (isHex && hexPattern.length >= 2) {
      searchBytes = [];
      for (let i = 0; i < hexPattern.length; i += 2) {
        searchBytes.push(parseInt(hexPattern.slice(i, i + 2), 16));
      }
    } else {
      // ASCII search
      searchBytes = [];
      for (let i = 0; i < query.length; i++) {
        searchBytes.push(query.charCodeAt(i));
      }
    }

    if (searchBytes.length === 0) return;

    // Find all occurrences
    for (let i = 0; i <= this._bytes.length - searchBytes.length; i++) {
      let match = true;
      for (let j = 0; j < searchBytes.length; j++) {
        if (this._bytes[i + j] !== searchBytes[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        for (let j = 0; j < searchBytes.length; j++) {
          this._searchMatches.add(i + j);
        }
      }
    }

    this._renderGrid();

    // Scroll to first match
    if (this._searchMatches.size > 0) {
      const firstMatch = Math.min(...this._searchMatches);
      const row = Math.floor(firstMatch / BYTES_PER_ROW);
      const rowEl = this._gridContainer.querySelectorAll('.hex-row')[row];
      if (rowEl) rowEl.scrollIntoView({ block: 'center' });
      this._selectOffset(firstMatch);
    }
  }

  _formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  show() {
    this.el.style.display = 'flex';
  }

  hide() {
    this.el.style.display = 'none';
  }

  destroy() {
    this.el.remove();
  }
}
