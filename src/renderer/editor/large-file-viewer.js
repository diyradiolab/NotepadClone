import { escapeHtml } from '../utils/escape-html';

/**
 * LargeFileViewer renders a virtual-scrolling text view for files too large for Monaco.
 * Only visible lines (plus a buffer) are in the DOM at any time.
 */
export class LargeFileViewer {
  constructor(container) {
    this.container = container;
    this.filePath = null;
    this.totalLines = 0;
    this.fileSize = 0;
    this.lineHeight = 20; // px per line
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.buffer = 20; // extra lines above/below viewport
    this.lineCache = new Map(); // lineNumber → text
    this.fetchingRange = null;

    this.onCursorCallbacks = [];
    this._boundScrollHandler = null;
  }

  _render() {
    this.container.innerHTML = `
      <div class="lfv-wrapper">
        <div class="lfv-gutter" id="lfv-gutter"></div>
        <div class="lfv-scroll-container" id="lfv-scroll-container">
          <div class="lfv-spacer" id="lfv-spacer"></div>
          <div class="lfv-content" id="lfv-content"></div>
        </div>
      </div>
      <div class="lfv-status" id="lfv-status"></div>
    `;

    this.gutter = this.container.querySelector('#lfv-gutter');
    this.scrollContainer = this.container.querySelector('#lfv-scroll-container');
    this.spacer = this.container.querySelector('#lfv-spacer');
    this.content = this.container.querySelector('#lfv-content');
    this.statusEl = this.container.querySelector('#lfv-status');
  }

  _bindEvents() {
    this._boundScrollHandler = () => this._onScroll();
    this.scrollContainer.addEventListener('scroll', this._boundScrollHandler);
  }

  async init(filePath, totalLines, fileSize) {
    this.filePath = filePath;
    this.totalLines = totalLines;
    this.fileSize = fileSize;
    this.lineCache.clear();

    this._render();
    this._bindEvents();

    // Set total height to represent all lines
    const totalHeight = this.totalLines * this.lineHeight;
    this.spacer.style.height = `${totalHeight}px`;

    this._updateStatus();
    this._onScroll();
  }

  _onScroll() {
    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight;

    const firstVisible = Math.floor(scrollTop / this.lineHeight);
    const visibleCount = Math.ceil(viewportHeight / this.lineHeight);

    const start = Math.max(0, firstVisible - this.buffer);
    const end = Math.min(this.totalLines, firstVisible + visibleCount + this.buffer);

    if (start !== this.visibleStart || end !== this.visibleEnd) {
      this.visibleStart = start;
      this.visibleEnd = end;
      this._fetchAndRender(start, end);
    }

    // Update cursor position for status bar
    const cursorLine = firstVisible + 1;
    this.onCursorCallbacks.forEach(cb => cb(cursorLine, 1));
  }

  async _fetchAndRender(start, end) {
    // Check what we need to fetch
    const missingStart = start;
    const missingEnd = end;
    let needsFetch = false;

    for (let i = missingStart; i < missingEnd; i++) {
      if (!this.lineCache.has(i)) {
        needsFetch = true;
        break;
      }
    }

    if (needsFetch) {
      const rangeKey = `${start}-${end}`;
      if (this.fetchingRange === rangeKey) return;
      this.fetchingRange = rangeKey;

      const lines = await window.api.readLargeFileLines(this.filePath, start, end);
      if (lines) {
        for (let i = 0; i < lines.length; i++) {
          this.lineCache.set(start + i, lines[i]);
        }
      }
      this.fetchingRange = null;

      // Evict cache entries far from viewport
      this._evictCache(start, end);
    }

    this._renderLines(start, end);
  }

  _renderLines(start, end) {
    const scrollTop = this.scrollContainer.scrollTop;
    const topOffset = start * this.lineHeight;

    // Build content lines
    let contentHtml = '';
    let gutterHtml = '';
    const gutterWidth = String(this.totalLines).length;

    for (let i = start; i < end; i++) {
      const text = this.lineCache.get(i) || '';
      const lineNum = String(i + 1).padStart(gutterWidth, ' ');

      gutterHtml += `<div class="lfv-line-number" style="height:${this.lineHeight}px">${lineNum}</div>`;
      contentHtml += `<div class="lfv-line" style="height:${this.lineHeight}px">${escapeHtml(text)}</div>`;
    }

    this.content.style.position = 'absolute';
    this.content.style.top = `${topOffset}px`;
    this.content.style.left = '0';
    this.content.style.right = '0';
    this.content.innerHTML = contentHtml;

    this.gutter.style.paddingTop = `${topOffset}px`;
    this.gutter.innerHTML = gutterHtml;

    // Sync gutter scroll with content
    this.gutter.style.marginTop = `-${scrollTop}px`;
  }

  _evictCache(visibleStart, visibleEnd) {
    const keepRange = 500; // keep 500 lines around viewport
    for (const key of this.lineCache.keys()) {
      if (key < visibleStart - keepRange || key > visibleEnd + keepRange) {
        this.lineCache.delete(key);
      }
    }
  }

  _updateStatus() {
    const sizeMB = (this.fileSize / (1024 * 1024)).toFixed(1);
    this.statusEl.textContent = `Large file mode: ${this.totalLines.toLocaleString()} lines, ${sizeMB} MB`;
  }

  scrollToLine(lineNumber) {
    const targetScroll = (lineNumber - 1) * this.lineHeight;
    this.scrollContainer.scrollTop = targetScroll;
  }

  onCursorChange(callback) {
    this.onCursorCallbacks.push(callback);
  }

  destroy() {
    if (this.scrollContainer && this._boundScrollHandler) {
      this.scrollContainer.removeEventListener('scroll', this._boundScrollHandler);
    }
    this.onCursorCallbacks = [];
    this.lineCache.clear();
    this.container.innerHTML = '';
  }

}
