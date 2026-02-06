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
    this.builderColumns = [];
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="sqp-resize-handle" id="sqp-resize-handle"></div>
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
      <div class="sqp-builder" id="sqp-builder">
        <div class="sqp-builder-header">
          <button class="sqp-builder-toggle" id="sqp-builder-toggle" title="Collapse/expand builder">&#9660;</button>
          <span>QUERY BUILDER</span>
          <button id="sqp-refresh-cols">Refresh</button>
          <button id="sqp-clear-builder">Clear</button>
        </div>
        <table class="sqp-builder-table">
          <thead>
            <tr>
              <th>Column</th>
              <th>Alias</th>
              <th>Sort</th>
              <th>Filter</th>
              <th>Output</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="sqp-builder-body"></tbody>
        </table>
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

    this.container.querySelector('#sqp-refresh-cols').addEventListener('click', () => this._refreshColumns());
    this.container.querySelector('#sqp-clear-builder').addEventListener('click', () => this._clearBuilder());

    // Builder collapse toggle
    this.container.querySelector('#sqp-builder-toggle').addEventListener('click', () => this._toggleBuilder());

    // Resize handle drag
    this._initResize();

    // Add initial empty row
    this._addBuilderRow();
  }

  // ── Resize ──

  _initResize() {
    const handle = this.container.querySelector('#sqp-resize-handle');
    let startY, startHeight;

    const onMouseMove = (e) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeight + delta));
      this.container.style.height = newHeight + 'px';
    };

    const onMouseUp = () => {
      handle.classList.remove('sqp-dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = this.container.offsetHeight;
      handle.classList.add('sqp-dragging');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ── Query Builder ──

  _toggleBuilder() {
    const builder = this.container.querySelector('#sqp-builder');
    const toggle = this.container.querySelector('#sqp-builder-toggle');
    builder.classList.toggle('sqp-builder-collapsed');
    toggle.innerHTML = builder.classList.contains('sqp-builder-collapsed') ? '&#9654;' : '&#9660;';
  }

  _refreshColumns() {
    const tabId = this.tabManager.getActiveTabId();
    if (!tabId) return;

    const tab = this.tabManager.getTab(tabId);
    if (tab && tab.isLargeFile) return;

    const content = this.editorManager.getContent(tabId);
    if (!content || content.trim().length === 0) return;

    const { columns } = this._parseContent(content);
    this.builderColumns = columns;

    // Update all column dropdowns, preserving current selection
    const selects = this.container.querySelectorAll('.sqp-col-select');
    for (const select of selects) {
      const current = select.value;
      select.innerHTML = '<option value="">—</option>';
      for (const col of this.builderColumns) {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        select.appendChild(opt);
      }
      if (this.builderColumns.includes(current)) {
        select.value = current;
      }
    }
  }

  _addBuilderRow() {
    const tbody = this.container.querySelector('#sqp-builder-body');
    const tr = document.createElement('tr');

    // Column select
    const tdCol = document.createElement('td');
    const colSelect = document.createElement('select');
    colSelect.className = 'sqp-col-select';
    colSelect.innerHTML = '<option value="">—</option>';
    for (const col of this.builderColumns) {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      colSelect.appendChild(opt);
    }
    colSelect.addEventListener('change', () => {
      this._generateSQL();
      this._autoAppendRow();
      this._updateRemoveButtons();
    });
    tdCol.appendChild(colSelect);
    tr.appendChild(tdCol);

    // Alias input
    const tdAlias = document.createElement('td');
    const aliasInput = document.createElement('input');
    aliasInput.type = 'text';
    aliasInput.className = 'sqp-alias-input';
    aliasInput.placeholder = 'alias';
    aliasInput.addEventListener('input', () => this._generateSQL());
    tdAlias.appendChild(aliasInput);
    tr.appendChild(tdAlias);

    // Sort select
    const tdSort = document.createElement('td');
    const sortSelect = document.createElement('select');
    sortSelect.className = 'sqp-sort-select';
    sortSelect.innerHTML = '<option value="">—</option><option value="ASC">ASC</option><option value="DESC">DESC</option>';
    sortSelect.addEventListener('change', () => this._generateSQL());
    tdSort.appendChild(sortSelect);
    tr.appendChild(tdSort);

    // Filter input
    const tdFilter = document.createElement('td');
    const filterInput = document.createElement('input');
    filterInput.type = 'text';
    filterInput.className = 'sqp-filter-input';
    filterInput.placeholder = "e.g. > 100";
    filterInput.addEventListener('input', () => this._generateSQL());
    tdFilter.appendChild(filterInput);
    tr.appendChild(tdFilter);

    // Output checkbox
    const tdOutput = document.createElement('td');
    const outputCheck = document.createElement('input');
    outputCheck.type = 'checkbox';
    outputCheck.checked = true;
    outputCheck.addEventListener('change', () => this._generateSQL());
    tdOutput.appendChild(outputCheck);
    tr.appendChild(tdOutput);

    // Remove button
    const tdRemove = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'sqp-remove-row-btn';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove row';
    removeBtn.addEventListener('click', () => {
      tr.remove();
      this._updateRemoveButtons();
      this._generateSQL();
    });
    tdRemove.appendChild(removeBtn);
    tr.appendChild(tdRemove);

    tbody.appendChild(tr);
    this._updateRemoveButtons();
  }

  _autoAppendRow() {
    const tbody = this.container.querySelector('#sqp-builder-body');
    const rows = tbody.querySelectorAll('tr');
    if (rows.length === 0) return;
    const lastRow = rows[rows.length - 1];
    const lastSelect = lastRow.querySelector('.sqp-col-select');
    if (lastSelect && lastSelect.value) {
      this._addBuilderRow();
    }
  }

  _updateRemoveButtons() {
    const tbody = this.container.querySelector('#sqp-builder-body');
    const rows = tbody.querySelectorAll('tr');
    const btns = tbody.querySelectorAll('.sqp-remove-row-btn');
    for (const btn of btns) {
      btn.classList.toggle('sqp-hidden', rows.length <= 1);
    }
  }

  _generateSQL() {
    const tbody = this.container.querySelector('#sqp-builder-body');
    const rows = tbody.querySelectorAll('tr');

    const selectParts = [];
    const whereParts = [];
    const orderParts = [];

    for (const row of rows) {
      const col = row.querySelector('.sqp-col-select').value;
      if (!col) continue;

      const alias = row.querySelector('.sqp-alias-input').value.trim();
      const sort = row.querySelector('.sqp-sort-select').value;
      const filter = row.querySelector('.sqp-filter-input').value.trim();
      const output = row.querySelector('input[type="checkbox"]').checked;

      if (output) {
        selectParts.push(alias ? `${col} AS ${alias}` : col);
      }

      if (filter) {
        whereParts.push(`${col} ${filter}`);
      }

      if (sort) {
        orderParts.push(`${col} ${sort}`);
      }
    }

    const selectClause = selectParts.length > 0 ? selectParts.join(', ') : '*';
    let sql = `SELECT ${selectClause} FROM data`;

    if (whereParts.length > 0) {
      sql += ` WHERE ${whereParts.join(' AND ')}`;
    }

    if (orderParts.length > 0) {
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // Only update textarea if builder has at least one active row
    const hasActiveRow = Array.from(rows).some(r => r.querySelector('.sqp-col-select').value);
    if (hasActiveRow) {
      this.container.querySelector('#sqp-query').value = sql;
    }
  }

  _clearBuilder() {
    const tbody = this.container.querySelector('#sqp-builder-body');
    tbody.innerHTML = '';
    this._addBuilderRow();
    this.container.querySelector('#sqp-query').value = '';
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
    this._refreshColumns();
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
