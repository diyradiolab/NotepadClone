export class RegexTesterPanel {
  constructor(parentEl) {
    this.el = document.createElement('div');
    this.el.className = 'regex-tester-panel';
    this.el.style.display = 'none';
    parentEl.appendChild(this.el);

    this._debounceTimer = null;
    this._flags = { g: true, i: false, m: false, s: false };
    this._matches = [];

    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    this.el.innerHTML = `
      <div class="rt-section">
        <div class="rt-section-label">Regular Expression</div>
        <div class="rt-regex-row">
          <span style="font-family:monospace; font-size:16px; color:#888;">/</span>
          <input type="text" class="rt-regex-input" placeholder="Enter regex pattern..." spellcheck="false">
          <span style="font-family:monospace; font-size:16px; color:#888;">/</span>
          <div class="rt-flags">
            <button class="rt-flag-btn active" data-flag="g" title="Global">g</button>
            <button class="rt-flag-btn" data-flag="i" title="Case insensitive">i</button>
            <button class="rt-flag-btn" data-flag="m" title="Multiline">m</button>
            <button class="rt-flag-btn" data-flag="s" title="Dotall">s</button>
          </div>
        </div>
        <div class="rt-error"></div>
      </div>
      <div class="rt-test-area">
        <div class="rt-section-label">Test String</div>
        <div class="rt-highlight-display" contenteditable="true" spellcheck="false"></div>
      </div>
      <div class="rt-results">
        <div class="rt-results-header">
          <div class="rt-section-label">Matches</div>
          <button class="rt-copy-btn" title="Copy matches as JSON">Copy JSON</button>
        </div>
        <div class="rt-results-body">
          <div class="rt-no-matches">No matches</div>
        </div>
      </div>
    `;

    this._regexInput = this.el.querySelector('.rt-regex-input');
    this._errorEl = this.el.querySelector('.rt-error');
    this._highlightDisplay = this.el.querySelector('.rt-highlight-display');
    this._resultsBody = this.el.querySelector('.rt-results-body');
    this._copyBtn = this.el.querySelector('.rt-copy-btn');
  }

  _bindEvents() {
    this._regexInput.addEventListener('input', () => this._scheduleUpdate());

    // Handle text input in contenteditable
    this._highlightDisplay.addEventListener('input', () => this._scheduleUpdate());
    this._highlightDisplay.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    // Flag toggles
    this.el.querySelectorAll('.rt-flag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const flag = btn.dataset.flag;
        this._flags[flag] = !this._flags[flag];
        btn.classList.toggle('active', this._flags[flag]);
        this._scheduleUpdate();
      });
    });

    // Copy JSON
    this._copyBtn.addEventListener('click', () => {
      const json = JSON.stringify(this._matches, null, 2);
      navigator.clipboard.writeText(json);
      this._copyBtn.textContent = 'Copied!';
      setTimeout(() => { this._copyBtn.textContent = 'Copy JSON'; }, 1500);
    });
  }

  _scheduleUpdate() {
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._runMatch(), 100);
  }

  _getTestText() {
    return this._highlightDisplay.innerText || '';
  }

  _runMatch() {
    const pattern = this._regexInput.value;
    const testStr = this._getTestText();
    this._errorEl.textContent = '';
    this._matches = [];

    if (!pattern) {
      this._renderHighlights(testStr, []);
      this._renderResults([]);
      return;
    }

    let flags = '';
    for (const [f, on] of Object.entries(this._flags)) {
      if (on) flags += f;
    }

    let regex;
    try {
      regex = new RegExp(pattern, flags);
    } catch (e) {
      this._errorEl.textContent = e.message;
      this._renderHighlights(testStr, []);
      this._renderResults([]);
      return;
    }

    const matches = [];
    let match;

    if (flags.includes('g')) {
      while ((match = regex.exec(testStr)) !== null) {
        matches.push(this._extractMatch(match));
        if (match[0].length === 0) {
          regex.lastIndex++;
          if (regex.lastIndex > testStr.length) break;
        }
      }
    } else {
      match = regex.exec(testStr);
      if (match) matches.push(this._extractMatch(match));
    }

    this._matches = matches;
    this._renderHighlights(testStr, matches);
    this._renderResults(matches);
  }

  _extractMatch(match) {
    const result = {
      value: match[0],
      index: match.index,
      length: match[0].length,
      groups: [],
    };

    // Capture groups
    for (let i = 1; i < match.length; i++) {
      result.groups.push({
        index: i,
        name: match.groups ? Object.entries(match.groups).find(([, v]) => v === match[i])?.[0] : null,
        value: match[i] ?? null,
      });
    }

    return result;
  }

  _renderHighlights(text, matches) {
    if (matches.length === 0) {
      // Preserve cursor position by not touching innerHTML if only text is present
      const sel = window.getSelection();
      const hadFocus = this._highlightDisplay.contains(sel.anchorNode);
      this._highlightDisplay.textContent = text;
      if (hadFocus) {
        // Place cursor at end
        const range = document.createRange();
        range.selectNodeContents(this._highlightDisplay);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      return;
    }

    // Save cursor offset
    const sel = window.getSelection();
    const hadFocus = this._highlightDisplay.contains(sel.anchorNode);
    let cursorOffset = 0;
    if (hadFocus) {
      cursorOffset = this._getCursorOffset();
    }

    // Build highlighted HTML
    let html = '';
    let lastEnd = 0;
    for (const m of matches) {
      if (m.index > lastEnd) {
        html += this._escapeHtml(text.slice(lastEnd, m.index));
      }
      html += `<mark>${this._escapeHtml(text.slice(m.index, m.index + m.length))}</mark>`;
      lastEnd = m.index + m.length;
    }
    if (lastEnd < text.length) {
      html += this._escapeHtml(text.slice(lastEnd));
    }

    this._highlightDisplay.innerHTML = html;

    // Restore cursor
    if (hadFocus) {
      this._setCursorOffset(cursorOffset);
    }
  }

  _getCursorOffset() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(this._highlightDisplay);
    preRange.setEnd(range.startContainer, range.startOffset);
    return preRange.toString().length;
  }

  _setCursorOffset(offset) {
    const sel = window.getSelection();
    const range = document.createRange();
    let current = 0;

    const walk = document.createTreeWalker(this._highlightDisplay, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walk.nextNode())) {
      if (current + node.length >= offset) {
        range.setStart(node, offset - current);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      current += node.length;
    }

    // Fallback: place at end
    range.selectNodeContents(this._highlightDisplay);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  _renderResults(matches) {
    if (matches.length === 0) {
      this._resultsBody.innerHTML = '<div class="rt-no-matches">No matches</div>';
      return;
    }

    let html = `<table><thead><tr>
      <th>#</th><th>Match</th><th>Index</th><th>Length</th><th>Groups</th>
    </tr></thead><tbody>`;

    matches.forEach((m, i) => {
      const groupStr = m.groups.length > 0
        ? m.groups.map(g => {
            const label = g.name ? `${g.name}: ` : `$${g.index}: `;
            return `${label}${g.value === null ? '(undefined)' : `"${this._escapeHtml(g.value)}"`}`;
          }).join(', ')
        : '—';

      html += `<tr>
        <td>${i + 1}</td>
        <td><code>${this._escapeHtml(m.value)}</code></td>
        <td>${m.index}</td>
        <td>${m.length}</td>
        <td>${groupStr}</td>
      </tr>`;
    });

    html += '</tbody></table>';
    this._resultsBody.innerHTML = html;
  }

  _escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  setTestString(text) {
    this._highlightDisplay.textContent = text;
    this._scheduleUpdate();
  }

  setPattern(pattern) {
    this._regexInput.value = pattern;
    this._scheduleUpdate();
  }

  show() {
    this.el.style.display = 'flex';
    this._regexInput.focus();
  }

  hide() {
    this.el.style.display = 'none';
  }

  destroy() {
    clearTimeout(this._debounceTimer);
    this.el.remove();
  }
}
