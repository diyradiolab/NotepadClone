import { escapeHtml } from '../utils/escape-html';

/**
 * TailFilterPanel — live log filtering for tailed files.
 * Acts like `tail -f | grep`: filters incoming tail data in real-time
 * and displays matching lines with highlighted matches.
 */
export class TailFilterPanel {
  constructor(container) {
    this.container = container;
    this.lines = [];          // { lineNum, text }[]
    this.maxLines = 10000;
    this.pattern = null;      // compiled RegExp or null
    this.filterText = '';
    this.useRegex = false;
    this.caseSensitive = false;
    this.mode = 'include';    // 'include' or 'exclude'
    this.baseLineNum = 0;     // absolute line number offset from editor
    this.onLineClick = null;  // callback(lineNumber)
    this._userAtBottom = true;

    this._render();
    this._initResize();
  }

  _render() {
    this.container.innerHTML = `
      <div class="tfp-resize-handle" id="tfp-resize-handle"></div>
      <div class="tfp-header panel-header">
        <span class="tfp-title">TAIL FILTER</span>
        <button class="tfp-close-btn panel-btn" title="Close">\u00D7</button>
      </div>
      <div class="tfp-controls">
        <input type="text" class="tfp-input" id="tfp-query" placeholder="Filter pattern..." />
        <label class="tfp-option"><input type="checkbox" id="tfp-regex"> Regex</label>
        <label class="tfp-option"><input type="checkbox" id="tfp-case"> Match Case</label>
        <div class="tfp-mode-bar">
          <button class="tfp-mode-btn tfp-mode-active" id="tfp-mode-include">Include</button>
          <button class="tfp-mode-btn" id="tfp-mode-exclude">Exclude</button>
        </div>
      </div>
      <div class="tfp-status" id="tfp-status"></div>
      <div class="tfp-results" id="tfp-results"></div>
    `;

    // Close button
    this.container.querySelector('.tfp-close-btn').addEventListener('click', () => this.hide());

    // Filter input — re-filter on every keystroke
    const queryInput = this.container.querySelector('#tfp-query');
    queryInput.addEventListener('input', () => this._onFilterChange());
    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });

    // Regex / Case checkboxes
    this.container.querySelector('#tfp-regex').addEventListener('change', () => this._onFilterChange());
    this.container.querySelector('#tfp-case').addEventListener('change', () => this._onFilterChange());

    // Mode toggle
    const includeBtn = this.container.querySelector('#tfp-mode-include');
    const excludeBtn = this.container.querySelector('#tfp-mode-exclude');
    includeBtn.addEventListener('click', () => this._setMode('include'));
    excludeBtn.addEventListener('click', () => this._setMode('exclude'));

    // Results click — jump to line in editor
    this.container.querySelector('#tfp-results').addEventListener('click', (e) => {
      const line = e.target.closest('.tfp-line');
      if (line && this.onLineClick) {
        const lineNum = parseInt(line.dataset.line, 10);
        if (!isNaN(lineNum)) this.onLineClick(lineNum);
      }
    });

    // Track scroll position for auto-scroll
    const results = this.container.querySelector('#tfp-results');
    results.addEventListener('scroll', () => {
      this._userAtBottom = results.scrollTop + results.clientHeight >= results.scrollHeight - 10;
    });
  }

  _initResize() {
    const handle = this.container.querySelector('#tfp-resize-handle');
    let startY, startHeight;

    const onMouseMove = (e) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeight + delta));
      this.container.style.height = newHeight + 'px';
    };

    const onMouseUp = () => {
      handle.classList.remove('tfp-dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = this.container.offsetHeight;
      handle.classList.add('tfp-dragging');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    const includeBtn = this.container.querySelector('#tfp-mode-include');
    const excludeBtn = this.container.querySelector('#tfp-mode-exclude');
    if (mode === 'include') {
      includeBtn.classList.add('tfp-mode-active');
      excludeBtn.classList.remove('tfp-mode-active');
    } else {
      excludeBtn.classList.add('tfp-mode-active');
      includeBtn.classList.remove('tfp-mode-active');
    }
    this._refilter();
  }

  _onFilterChange() {
    const queryInput = this.container.querySelector('#tfp-query');
    const regexCb = this.container.querySelector('#tfp-regex');
    const caseCb = this.container.querySelector('#tfp-case');

    this.filterText = queryInput.value;
    this.useRegex = regexCb.checked;
    this.caseSensitive = caseCb.checked;
    this._compilePattern();
    this._refilter();
  }

  _compilePattern() {
    if (!this.filterText) {
      this.pattern = null;
      return;
    }
    try {
      const flags = this.caseSensitive ? 'g' : 'gi';
      const source = this.useRegex ? this.filterText : this.filterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      this.pattern = new RegExp(source, flags);
    } catch {
      this.pattern = null;
    }
  }

  _matchesLine(text) {
    if (!this.pattern) return this.mode === 'include'; // no filter = show all in include, none in exclude
    this.pattern.lastIndex = 0;
    const matches = this.pattern.test(text);
    return this.mode === 'include' ? matches : !matches;
  }

  _refilter() {
    const results = this.container.querySelector('#tfp-results');
    results.innerHTML = '';

    // No filter text: in include mode show all lines, in exclude mode show all lines too
    if (!this.filterText) {
      const matchCount = this.lines.length;
      for (const line of this.lines) {
        results.appendChild(this._renderLine(line.lineNum, line.text));
      }
      this._updateStatus(matchCount, this.lines.length);
      this._autoScroll();
      return;
    }

    let matchCount = 0;
    for (const line of this.lines) {
      if (this._matchesLine(line.text)) {
        results.appendChild(this._renderLine(line.lineNum, line.text));
        matchCount++;
      }
    }
    this._updateStatus(matchCount, this.lines.length);
    this._autoScroll();
  }

  _renderLine(lineNum, text) {
    const div = document.createElement('div');
    div.className = 'tfp-line';
    div.dataset.line = lineNum;

    const numSpan = document.createElement('span');
    numSpan.className = 'tfp-line-num';
    numSpan.textContent = lineNum;
    div.appendChild(numSpan);

    const textSpan = document.createElement('span');
    textSpan.className = 'tfp-line-text';

    if (this.pattern && this.filterText && this.mode === 'include') {
      textSpan.innerHTML = this._highlightMatches(text);
    } else {
      textSpan.textContent = text;
    }

    div.appendChild(textSpan);
    return div;
  }

  _highlightMatches(text) {
    const escaped = escapeHtml(text);
    const escapedFilter = this.useRegex ? this.filterText : this.filterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      const flags = this.caseSensitive ? 'g' : 'gi';
      const re = new RegExp(`(${escapedFilter})`, flags);
      // We need to match on escaped HTML, so re-escape the pattern parts
      // Simpler approach: match on raw text, build highlighted output
      const parts = [];
      let lastIdx = 0;
      const rawRe = new RegExp(escapedFilter, flags);
      let m;
      rawRe.lastIndex = 0;
      while ((m = rawRe.exec(text)) !== null) {
        if (m.index > lastIdx) {
          parts.push(escapeHtml(text.slice(lastIdx, m.index)));
        }
        parts.push(`<span class="tfp-match">${escapeHtml(m[0])}</span>`);
        lastIdx = m.index + m[0].length;
        if (m[0].length === 0) { rawRe.lastIndex++; } // prevent infinite loop on zero-length match
      }
      if (lastIdx < text.length) {
        parts.push(escapeHtml(text.slice(lastIdx)));
      }
      return parts.join('');
    } catch {
      return escaped;
    }
  }

  _updateStatus(matchCount, totalLines) {
    const status = this.container.querySelector('#tfp-status');
    if (!this.filterText) {
      status.textContent = `${totalLines} lines`;
    } else {
      status.textContent = `${matchCount} of ${totalLines} lines matched`;
    }
  }

  _autoScroll() {
    if (!this._userAtBottom) return;
    const results = this.container.querySelector('#tfp-results');
    results.scrollTop = results.scrollHeight;
  }

  // ── Public API ──

  show() {
    this.container.classList.remove('hidden');
    this._userAtBottom = true;
    const input = this.container.querySelector('#tfp-query');
    if (input) input.focus();
  }

  hide() {
    this.container.classList.add('hidden');
  }

  toggle() {
    if (this.container.classList.contains('hidden')) {
      this.show();
    } else {
      this.hide();
    }
  }

  isVisible() {
    return !this.container.classList.contains('hidden');
  }

  setMaxLines(max) {
    this.maxLines = max || 10000;
  }

  setBaseLineNum(num) {
    this.baseLineNum = num;
  }

  onTailData(newText) {
    if (!newText) return;
    const newLines = newText.split('\n');
    // Last element might be empty from trailing newline
    if (newLines.length > 0 && newLines[newLines.length - 1] === '') {
      newLines.pop();
    }
    if (newLines.length === 0) return;

    const startLineNum = this.baseLineNum + this.lines.length + 1;
    const results = this.container.querySelector('#tfp-results');
    let newMatchCount = 0;

    for (let i = 0; i < newLines.length; i++) {
      const lineNum = startLineNum + i;
      const text = newLines[i];
      this.lines.push({ lineNum, text });

      // Filter and append if visible
      if (this.isVisible()) {
        if (this._matchesLine(text)) {
          results.appendChild(this._renderLine(lineNum, text));
          newMatchCount++;
        }
      }
    }

    // Trim old lines if over max
    this._trimLines();

    // Update status
    if (this.isVisible()) {
      this._updateStatusFromDOM();
      this._autoScroll();
    }
  }

  onTailReset() {
    this.lines = [];
    this.baseLineNum = 0;
    const results = this.container.querySelector('#tfp-results');
    if (results) results.innerHTML = '';
    this._updateStatus(0, 0);
  }

  clear() {
    this.lines = [];
    this.baseLineNum = 0;
    this.filterText = '';
    this.pattern = null;
    const queryInput = this.container.querySelector('#tfp-query');
    if (queryInput) queryInput.value = '';
    const regexCb = this.container.querySelector('#tfp-regex');
    if (regexCb) regexCb.checked = false;
    const caseCb = this.container.querySelector('#tfp-case');
    if (caseCb) caseCb.checked = false;
    this._setMode('include');
    const results = this.container.querySelector('#tfp-results');
    if (results) results.innerHTML = '';
    this._updateStatus(0, 0);
    this._userAtBottom = true;
  }

  _trimLines() {
    if (this.lines.length <= this.maxLines) return;
    const excess = this.lines.length - this.maxLines;
    const removedLines = this.lines.splice(0, excess);

    // Remove corresponding DOM nodes from results
    const results = this.container.querySelector('#tfp-results');
    if (!results) return;
    const firstValidLineNum = this.lines.length > 0 ? this.lines[0].lineNum : Infinity;
    const children = results.children;
    let removeCount = 0;
    for (let i = 0; i < children.length; i++) {
      const ln = parseInt(children[i].dataset.line, 10);
      if (ln < firstValidLineNum) {
        removeCount++;
      } else {
        break;
      }
    }
    for (let i = 0; i < removeCount; i++) {
      results.removeChild(results.firstChild);
    }
  }

  _updateStatusFromDOM() {
    const results = this.container.querySelector('#tfp-results');
    const matchCount = results ? results.children.length : 0;
    this._updateStatus(matchCount, this.lines.length);
  }
}
