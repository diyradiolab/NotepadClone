import alasql from 'alasql';

/**
 * SqlQueryPanel — query text file contents with SQL.
 * Each line becomes a row; columns are derived by splitting on a delimiter.
 * Results rendered as a scrollable table; clicking a row jumps to that line.
 */
export class SqlQueryPanel {
  constructor(container, editorManager, tabManager) {
    this.container = container;
    this.editorManager = editorManager;
    this.tabManager = tabManager;
    this.onRowClickCallbacks = [];
    this.lastResults = null;
    this.lastColumns = null;
    this.lastSourceName = null;
    this.lastQuery = null;
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="sqp-header">
        <span>SQL QUERY</span>
        <button class="sqp-close-btn" title="Close">\u00D7</button>
      </div>
      <div class="sqp-options-bar">
        <label>Delimiter:
          <select class="sqp-delimiter-select" id="sqp-delimiter">
            <option value="auto">Auto-detect</option>
            <option value=",">,  (comma)</option>
            <option value="\t">Tab</option>
            <option value="|">|  (pipe)</option>
            <option value=";">; (semicolon)</option>
            <option value="whitespace">Whitespace</option>
            <option value="custom">Custom regex...</option>
          </select>
        </label>
        <input type="text" class="sqp-custom-regex" id="sqp-custom-regex" placeholder="e.g. ::" style="display:none" />
        <label><input type="checkbox" id="sqp-header"> First line as header</label>
      </div>
      <div class="sqp-query-bar">
        <textarea class="sqp-textarea" id="sqp-query" rows="1"
          placeholder="SELECT * FROM data WHERE _line LIKE '%ERROR%' ORDER BY _num LIMIT 100"></textarea>
        <div class="sqp-btn-group">
          <button class="sqp-run-btn" id="sqp-run-btn">Run</button>
          <button class="sqp-export-btn" id="sqp-export-btn" title="Export results to new tab" disabled>Export</button>
        </div>
      </div>
      <div class="sqp-status" id="sqp-status">Enter a SQL query and click Run (Ctrl+Enter).</div>
      <div class="sqp-results" id="sqp-results"></div>
    `;

    this.container.querySelector('.sqp-close-btn').addEventListener('click', () => this.hide());
    this.container.querySelector('#sqp-run-btn').addEventListener('click', () => this._executeQuery());
    this.container.querySelector('#sqp-export-btn').addEventListener('click', () => this._exportResults());

    const delimSelect = this.container.querySelector('#sqp-delimiter');
    const customInput = this.container.querySelector('#sqp-custom-regex');
    delimSelect.addEventListener('change', () => {
      customInput.style.display = delimSelect.value === 'custom' ? '' : 'none';
    });

    const textarea = this.container.querySelector('#sqp-query');
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this._executeQuery();
      }
      if (e.key === 'Escape') this.hide();
    });
  }

  // ── Delimiter logic ──

  _getDelimiter() {
    const val = this.container.querySelector('#sqp-delimiter').value;
    if (val === 'auto') return null; // signal auto-detect
    if (val === 'whitespace') return /\s+/;
    if (val === 'custom') {
      const pattern = this.container.querySelector('#sqp-custom-regex').value.trim();
      if (!pattern) return /\s+/;
      try { return new RegExp(pattern); } catch { return pattern; }
    }
    if (val === '\t') return '\t';
    return val;
  }

  _detectDelimiter(lines) {
    const sample = lines.slice(0, 10);
    const candidates = [
      { d: ',', score: 0 },
      { d: '\t', score: 0 },
      { d: '|', score: 0 },
      { d: ';', score: 0 },
    ];

    for (const line of sample) {
      for (const c of candidates) {
        const count = line.split(c.d).length - 1;
        if (count > 0) c.score += count;
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0].score > 0) return candidates[0].d;
    return /\s+/; // fallback to whitespace
  }

  // ── Parse content into rows ──

  _parseContent(content) {
    const rawLines = content.split(/\r?\n/);
    // Remove trailing empty line if present
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();

    if (rawLines.length === 0) return { data: [], columns: [] };

    let delimiter = this._getDelimiter();
    if (delimiter === null) delimiter = this._detectDelimiter(rawLines);

    const useHeader = this.container.querySelector('#sqp-header').checked;
    const startIdx = useHeader ? 1 : 0;

    // Determine column names
    const firstSplit = rawLines[0].split(delimiter);
    const colCount = firstSplit.length;
    let colNames;
    if (useHeader) {
      colNames = firstSplit.map((h, i) => {
        const sanitized = h.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
        return sanitized || `c${i + 1}`;
      });
    } else {
      colNames = firstSplit.map((_, i) => `c${i + 1}`);
    }

    // Build rows
    const data = [];
    for (let i = startIdx; i < rawLines.length; i++) {
      const parts = rawLines[i].split(delimiter);
      const row = { _num: i + 1, _line: rawLines[i] };
      for (let j = 0; j < colCount; j++) {
        row[colNames[j]] = parts[j] !== undefined ? parts[j].trim() : '';
      }
      data.push(row);
    }

    const columns = ['_num', '_line', ...colNames];
    return { data, columns };
  }

  // ── Execute ──

  _executeQuery() {
    const tabId = this.tabManager.getActiveTabId();
    if (!tabId) {
      this._setStatus('No active tab.', true);
      return;
    }

    const tab = this.tabManager.getTab(tabId);
    if (tab && tab.isLargeFile) {
      this._setStatus('SQL query is not supported for large files.', true);
      return;
    }

    const content = this.editorManager.getContent(tabId);
    if (!content || content.trim().length === 0) {
      this._setStatus('Active file is empty.', true);
      return;
    }

    let sql = this.container.querySelector('#sqp-query').value.trim();
    if (!sql) {
      this._setStatus('Enter a SQL query.', true);
      return;
    }

    // Replace FROM data → FROM ? (case-insensitive)
    sql = sql.replace(/\bFROM\s+data\b/gi, 'FROM ?');

    const { data, columns } = this._parseContent(content);
    if (data.length === 0) {
      this._setStatus('No data rows found.', true);
      return;
    }

    const t0 = performance.now();
    let results;
    try {
      results = alasql(sql, [data]);
    } catch (err) {
      this._setStatus(`Error: ${err.message}`, true);
      return;
    }
    const elapsed = (performance.now() - t0).toFixed(1);

    if (!Array.isArray(results)) {
      this._setStatus(`Query returned: ${JSON.stringify(results)} (${elapsed} ms)`);
      this.container.querySelector('#sqp-results').innerHTML = '';
      this.lastResults = null;
      this.container.querySelector('#sqp-export-btn').disabled = true;
      return;
    }

    this._setStatus(`${results.length} row${results.length !== 1 ? 's' : ''} (${elapsed} ms)`);
    this._renderResults(results);

    this.lastResults = results;
    this.lastColumns = results.length > 0 ? Object.keys(results[0]) : columns;
    this.lastSourceName = tab.title || 'untitled';
    this.lastQuery = this.container.querySelector('#sqp-query').value.trim();
    this.container.querySelector('#sqp-export-btn').disabled = false;
  }

  // ── Render results table ──

  _renderResults(results) {
    const resultsEl = this.container.querySelector('#sqp-results');

    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="sqp-empty">No rows returned.</div>';
      return;
    }

    const cols = Object.keys(results[0]);
    const table = document.createElement('table');
    table.className = 'sqp-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    for (const col of cols) {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    for (const row of results) {
      const tr = document.createElement('tr');
      const lineNum = row._num;

      if (lineNum != null) {
        tr.classList.add('sqp-clickable');
        tr.addEventListener('click', () => {
          this.onRowClickCallbacks.forEach(cb => cb(lineNum));
        });
      }

      for (const col of cols) {
        const td = document.createElement('td');
        td.textContent = row[col] != null ? String(row[col]) : '';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);

    resultsEl.innerHTML = '';
    resultsEl.appendChild(table);
  }

  // ── Export results to a new tab ──

  _exportResults() {
    if (!this.lastResults || this.lastResults.length === 0) return;

    const cols = this.lastColumns;
    const rows = this.lastResults;
    const delimiter = '\t';

    // Build TSV content: header + rows
    const lines = [cols.join(delimiter)];
    for (const row of rows) {
      const vals = cols.map(c => {
        const v = row[c];
        return v != null ? String(v).replace(/\t/g, ' ') : '';
      });
      lines.push(vals.join(delimiter));
    }
    const content = lines.join('\n');

    // Auto-generate filename: source_query-snippet_timestamp.tsv
    const baseName = this.lastSourceName.replace(/\.[^.]+$/, '');
    const querySnippet = this.lastQuery
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_*]/g, '')
      .substring(0, 30);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const exportName = `${baseName}_${querySnippet}_${ts}.tsv`;

    // Create a new tab with the content
    const tabId = this.tabManager.createTab(exportName);
    this.editorManager.createEditorForTab(tabId, content, exportName);
    this.editorManager.activateTab(tabId);
    this.tabManager.setDirty(tabId, true);
  }

  // ── Status ──

  _setStatus(text, isError) {
    const el = this.container.querySelector('#sqp-status');
    el.textContent = text;
    el.classList.toggle('sqp-status-error', !!isError);
  }

  // ── Show/hide ──

  show() {
    this.container.classList.remove('hidden');
    const textarea = this.container.querySelector('#sqp-query');
    textarea.focus();
    textarea.select();
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

  onRowClick(callback) {
    this.onRowClickCallbacks.push(callback);
  }
}
