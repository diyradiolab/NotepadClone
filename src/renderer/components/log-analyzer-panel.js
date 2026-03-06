const ROW_HEIGHT = 24;
const VISIBLE_BUFFER = 20; // extra rows above/below viewport

// Log level normalization
const LEVEL_MAP = {
  error: 'ERROR', err: 'ERROR', fatal: 'ERROR', critical: 'ERROR',
  warn: 'WARN', warning: 'WARN',
  info: 'INFO', notice: 'INFO',
  debug: 'DEBUG', trace: 'DEBUG', verbose: 'DEBUG',
};

function normalizeLevel(raw) {
  if (!raw) return 'INFO';
  const lower = raw.toLowerCase().trim();
  return LEVEL_MAP[lower] || 'INFO';
}

export class LogAnalyzerPanel {
  constructor(parentEl) {
    this.el = document.createElement('div');
    this.el.className = 'log-analyzer';
    this.el.style.display = 'none';
    parentEl.appendChild(this.el);

    this._tabId = null;
    this._entries = [];       // all parsed entries
    this._filtered = [];      // entries after filter
    this._format = 'unknown';
    this._columns = [];
    this._filterText = '';
    this._filterTimer = null;
    this._levelToggles = { ERROR: true, WARN: true, INFO: true, DEBUG: true };
    this._levelCounts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
    this._selectedIndex = -1;
    this._scrollTop = 0;

    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    this.el.innerHTML = `
      <div class="la-filter-bar">
        <label class="la-label">Filter:</label>
        <input type="text" class="la-filter-input" placeholder="Search messages...">
        <label class="la-label">Format:</label>
        <span class="la-format-badge">—</span>
      </div>
      <div class="la-level-toggles"></div>
      <div class="la-table-wrapper">
        <table class="la-table">
          <thead class="la-thead"><tr></tr></thead>
          <tbody class="la-tbody"></tbody>
        </table>
        <div class="la-virtual-spacer"></div>
      </div>
      <div class="la-detail" style="display:none">
        <div class="la-detail-header">
          <span class="la-detail-title">Entry Detail</span>
          <button class="la-detail-close">\u00D7</button>
        </div>
        <pre class="la-detail-content"></pre>
      </div>
      <div class="la-status-bar">
        <span class="la-status-count"></span>
        <span class="la-status-line"></span>
      </div>
    `;

    this._filterInput = this.el.querySelector('.la-filter-input');
    this._formatBadge = this.el.querySelector('.la-format-badge');
    this._levelTogglesEl = this.el.querySelector('.la-level-toggles');
    this._tableWrapper = this.el.querySelector('.la-table-wrapper');
    this._thead = this.el.querySelector('.la-thead tr');
    this._tbody = this.el.querySelector('.la-tbody');
    this._virtualSpacer = this.el.querySelector('.la-virtual-spacer');
    this._detailPane = this.el.querySelector('.la-detail');
    this._detailContent = this.el.querySelector('.la-detail-content');
    this._detailClose = this.el.querySelector('.la-detail-close');
    this._statusCount = this.el.querySelector('.la-status-count');
    this._statusLine = this.el.querySelector('.la-status-line');
  }

  _bindEvents() {
    this._filterInput.addEventListener('input', () => {
      clearTimeout(this._filterTimer);
      this._filterTimer = setTimeout(() => {
        this._filterText = this._filterInput.value;
        this._applyFilters();
      }, 150);
    });

    this._levelTogglesEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.la-level-btn');
      if (!btn) return;
      const level = btn.dataset.level;
      this._levelToggles[level] = !this._levelToggles[level];
      btn.classList.toggle('la-level-off', !this._levelToggles[level]);
      this._applyFilters();
    });

    this._tableWrapper.addEventListener('scroll', () => {
      this._scrollTop = this._tableWrapper.scrollTop;
      this._renderVisibleRows();
    });

    this._tbody.addEventListener('click', (e) => {
      const row = e.target.closest('.la-row');
      if (!row) return;
      const idx = parseInt(row.dataset.index, 10);
      this._selectRow(idx);
    });

    this._detailClose.addEventListener('click', () => {
      this._detailPane.style.display = 'none';
      this._selectedIndex = -1;
    });

    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._detailPane.style.display = 'none';
        this._selectedIndex = -1;
      }
    });
  }

  show(tabId, content, filename) {
    this._tabId = tabId;
    this.el.style.display = '';

    // Only re-parse if content changed
    const contentHash = content.length;
    if (this._lastHash !== contentHash || this._lastFilename !== filename) {
      this._lastHash = contentHash;
      this._lastFilename = filename;
      this._parse(content);
    }

    this._renderLevelToggles();
    this._applyFilters();
  }

  hide() {
    this.el.style.display = 'none';
  }

  destroy() {
    clearTimeout(this._filterTimer);
    this.el.remove();
  }

  // ── Format Detection ──

  _detectFormat(lines) {
    const sample = lines.slice(0, 20).filter(l => l.trim());
    if (sample.length === 0) return 'plain';

    // JSONL: every non-empty sample line is valid JSON with log-like keys
    let jsonCount = 0;
    for (const line of sample) {
      try {
        const obj = JSON.parse(line);
        if (typeof obj === 'object' && obj !== null &&
            (obj.level || obj.severity || obj.msg || obj.message || obj.timestamp || obj.time)) {
          jsonCount++;
        }
      } catch { /* not JSON */ }
    }
    if (jsonCount >= sample.length * 0.8) return 'jsonl';

    // Syslog: ^<\d+> or ^Mon DD HH:MM:SS
    const syslogRe = /^(<\d+>|[A-Z][a-z]{2}\s+\d+\s+\d+:\d+:\d+)/;
    if (sample.filter(l => syslogRe.test(l)).length >= sample.length * 0.6) return 'syslog';

    // Apache/nginx combined log
    const apacheRe = /^[\d.]+\s+-\s+-?\s*\[/;
    if (sample.filter(l => apacheRe.test(l)).length >= sample.length * 0.6) return 'apache';

    // Generic timestamped: ISO-8601 or YYYY-MM-DD HH:MM:SS
    const tsRe = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
    if (sample.filter(l => tsRe.test(l)).length >= sample.length * 0.5) return 'timestamp';

    return 'plain';
  }

  // ── Parsers ──

  _parse(content) {
    const lines = content.split('\n');
    this._format = this._detectFormat(lines);
    this._formatBadge.textContent = this._format.toUpperCase();

    switch (this._format) {
      case 'jsonl': this._entries = this._parseJsonLines(lines); break;
      case 'syslog': this._entries = this._parseSyslog(lines); break;
      case 'apache': this._entries = this._parseApache(lines); break;
      case 'timestamp': this._entries = this._parseGenericTimestamp(lines); break;
      default: this._entries = this._parsePlainLines(lines); break;
    }

    // Set columns based on format
    switch (this._format) {
      case 'jsonl': this._columns = ['timestamp', 'level', 'source', 'message']; break;
      case 'syslog': this._columns = ['timestamp', 'hostname', 'process', 'level', 'message']; break;
      case 'apache': this._columns = ['ip', 'timestamp', 'method', 'path', 'status', 'size']; break;
      case 'timestamp': this._columns = ['timestamp', 'level', 'message']; break;
      default: this._columns = ['line', 'text']; break;
    }

    // Count levels
    this._levelCounts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
    for (const entry of this._entries) {
      const lvl = entry._level || 'INFO';
      if (this._levelCounts[lvl] !== undefined) this._levelCounts[lvl]++;
    }
  }

  _parseJsonLines(lines) {
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        const level = normalizeLevel(obj.level || obj.severity || obj.loglevel || '');
        const msg = obj.message || obj.msg || obj.error || '';
        const ts = obj.timestamp || obj.time || obj.ts || obj['@timestamp'] || '';
        const source = obj.source || obj.logger || obj.module || obj.component || '';
        entries.push({
          _level: level,
          _lineNum: i + 1,
          _raw: line,
          timestamp: typeof ts === 'number' ? new Date(ts).toISOString() : String(ts),
          level,
          source: String(source),
          message: String(msg),
          _extra: obj,
        });
      } catch {
        entries.push({
          _level: 'INFO',
          _lineNum: i + 1,
          _raw: line,
          timestamp: '',
          level: 'INFO',
          source: '',
          message: line,
        });
      }
    }
    return entries;
  }

  _parseSyslog(lines) {
    // RFC 3164: <PRI>Mon DD HH:MM:SS hostname process[pid]: message
    // or: Mon DD HH:MM:SS hostname process[pid]: message
    const re = /^(?:<\d+>)?([A-Z][a-z]{2}\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(\S+?)(?:\[\d+\])?:\s*(.*)/;
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const m = re.exec(line);
      if (m) {
        const msg = m[4];
        const level = this._inferLevelFromMessage(msg);
        entries.push({
          _level: level,
          _lineNum: i + 1,
          _raw: line,
          timestamp: m[1],
          hostname: m[2],
          process: m[3],
          level,
          message: msg,
        });
      } else {
        entries.push({
          _level: 'INFO',
          _lineNum: i + 1,
          _raw: line,
          timestamp: '',
          hostname: '',
          process: '',
          level: 'INFO',
          message: line,
        });
      }
    }
    return entries;
  }

  _parseApache(lines) {
    // Combined log format: IP - - [timestamp] "METHOD /path HTTP/x.x" status size
    const re = /^([\d.]+)\s+-\s+-?\s*\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+|-)/;
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const m = re.exec(line);
      if (m) {
        const status = parseInt(m[5], 10);
        let level = 'INFO';
        if (status >= 500) level = 'ERROR';
        else if (status >= 400) level = 'WARN';
        entries.push({
          _level: level,
          _lineNum: i + 1,
          _raw: line,
          ip: m[1],
          timestamp: m[2],
          method: m[3],
          path: m[4],
          status: m[5],
          size: m[6],
        });
      } else {
        entries.push({
          _level: 'INFO',
          _lineNum: i + 1,
          _raw: line,
          ip: '',
          timestamp: '',
          method: '',
          path: '',
          status: '',
          size: '',
          message: line,
        });
      }
    }
    return entries;
  }

  _parseGenericTimestamp(lines) {
    // ISO-8601 or YYYY-MM-DD HH:MM:SS [LEVEL] message
    const re = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[^ ]*)\s+(?:\[?(\w+)\]?\s+)?(.*)/;
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const m = re.exec(line);
      if (m) {
        const rawLevel = m[2] || '';
        const level = LEVEL_MAP[rawLevel.toLowerCase()] ? normalizeLevel(rawLevel) : this._inferLevelFromMessage(m[3]);
        entries.push({
          _level: level,
          _lineNum: i + 1,
          _raw: line,
          timestamp: m[1],
          level,
          message: m[3],
        });
      } else {
        entries.push({
          _level: 'INFO',
          _lineNum: i + 1,
          _raw: line,
          timestamp: '',
          level: 'INFO',
          message: line,
        });
      }
    }
    return entries;
  }

  _parsePlainLines(lines) {
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line && i === lines.length - 1) continue; // skip trailing empty
      const level = this._inferLevelFromMessage(line);
      entries.push({
        _level: level,
        _lineNum: i + 1,
        _raw: line,
        line: String(i + 1),
        text: line,
      });
    }
    return entries;
  }

  _inferLevelFromMessage(msg) {
    if (!msg) return 'INFO';
    const upper = msg.toUpperCase();
    if (/\b(FATAL|CRITICAL|ERROR|ERR)\b/.test(upper)) return 'ERROR';
    if (/\b(WARN|WARNING)\b/.test(upper)) return 'WARN';
    if (/\b(DEBUG|TRACE|VERBOSE)\b/.test(upper)) return 'DEBUG';
    return 'INFO';
  }

  // ── Filtering ──

  _applyFilters() {
    const text = this._filterText.toLowerCase();
    this._filtered = this._entries.filter(entry => {
      // Level filter
      if (!this._levelToggles[entry._level]) return false;
      // Text filter
      if (text) {
        const searchable = (entry.message || entry.text || entry._raw || '').toLowerCase();
        if (!searchable.includes(text)) return false;
      }
      return true;
    });

    this._selectedIndex = -1;
    this._detailPane.style.display = 'none';
    this._renderHeader();
    this._renderVisibleRows();
    this._updateStatus();
  }

  // ── Rendering ──

  _renderLevelToggles() {
    const levels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    const colors = { ERROR: '#e74c3c', WARN: '#f39c12', INFO: '#6c757d', DEBUG: '#888' };
    this._levelTogglesEl.innerHTML = levels.map(lvl => {
      const off = this._levelToggles[lvl] ? '' : ' la-level-off';
      return `<button class="la-level-btn${off}" data-level="${lvl}" style="--level-color:${colors[lvl]}">
        <span class="la-level-dot" style="background:${colors[lvl]}"></span>
        ${lvl} <span class="la-level-count">(${this._levelCounts[lvl]})</span>
      </button>`;
    }).join('');
  }

  _renderHeader() {
    this._thead.innerHTML = this._columns.map(col =>
      `<th class="la-th">${col.charAt(0).toUpperCase() + col.slice(1)}</th>`
    ).join('');
  }

  _renderVisibleRows() {
    const total = this._filtered.length;
    const wrapperHeight = this._tableWrapper.clientHeight;
    const totalHeight = total * ROW_HEIGHT;
    this._virtualSpacer.style.height = `${totalHeight}px`;

    const scrollTop = this._tableWrapper.scrollTop;
    const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VISIBLE_BUFFER);
    const endIdx = Math.min(total, Math.ceil((scrollTop + wrapperHeight) / ROW_HEIGHT) + VISIBLE_BUFFER);

    const rows = [];
    for (let i = startIdx; i < endIdx; i++) {
      const entry = this._filtered[i];
      const levelClass = entry._level === 'ERROR' ? ' la-row--error'
        : entry._level === 'WARN' ? ' la-row--warn'
        : entry._level === 'DEBUG' ? ' la-row--debug'
        : '';
      const selected = i === this._selectedIndex ? ' la-row--selected' : '';
      const top = i * ROW_HEIGHT;

      const cells = this._columns.map(col => {
        const val = entry[col] !== undefined ? entry[col] : '';
        return `<td class="la-td">${this._escapeHtml(String(val))}</td>`;
      }).join('');

      rows.push(`<tr class="la-row${levelClass}${selected}" data-index="${i}" style="position:absolute;top:${top}px;width:100%">${cells}</tr>`);
    }

    this._tbody.style.position = 'relative';
    this._tbody.style.height = `${totalHeight}px`;
    this._tbody.innerHTML = rows.join('');
  }

  _selectRow(filteredIndex) {
    if (filteredIndex < 0 || filteredIndex >= this._filtered.length) return;
    this._selectedIndex = filteredIndex;
    const entry = this._filtered[filteredIndex];

    // Show detail pane
    let detailText = entry._raw || '';
    if (entry._extra) {
      try {
        detailText = JSON.stringify(entry._extra, null, 2);
      } catch { /* use raw */ }
    }
    this._detailContent.textContent = detailText;
    this._detailPane.style.display = '';
    this._statusLine.textContent = `Line ${entry._lineNum}`;

    // Re-render to update selected highlight
    this._renderVisibleRows();
  }

  _updateStatus() {
    const total = this._entries.length;
    const shown = this._filtered.length;
    const filtered = total - shown;
    this._statusCount.textContent = `${shown} entries` + (filtered > 0 ? ` (${filtered} filtered)` : '');
  }

  _escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
