import alasql from 'alasql';

/**
 * SqlQueryPanel — query text file contents with SQL.
 * Each line becomes a row; columns are derived by splitting on a delimiter.
 * Results rendered as a scrollable table; clicking a row jumps to that line.
 *
 * Supports Basic mode (simple column/alias/sort/filter grid) and Advanced mode
 * (aggregates, GROUP BY, HAVING, comparison operators, JOINs across open tabs).
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
    this.advancedMode = false;
    this.joinData = []; // [{tabId, joinType, leftCol, rightCol, data, columns}]
    this.savedTables = new Map(); // name → { data: [...], columns: [...] }
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="sqp-resize-handle" id="sqp-resize-handle"></div>
      <div class="sqp-header panel-header">
        <span>SQL QUERY</span>
        <button class="sqp-close-btn panel-btn" title="Close">\u00D7</button>
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
      <div class="sqp-tables-ref" id="sqp-tables-ref" style="display:none"></div>
      <div class="sqp-builder" id="sqp-builder">
        <div class="sqp-builder-header">
          <button class="sqp-builder-toggle" id="sqp-builder-toggle" title="Collapse/expand builder">&#9660;</button>
          <span>QUERY BUILDER</span>
          <button id="sqp-refresh-cols">Refresh</button>
          <button id="sqp-clear-builder">Clear</button>
          <button class="sqp-mode-toggle" id="sqp-mode-toggle">Advanced</button>
        </div>
        <div id="sqp-join-section" class="sqp-join-section" style="display:none">
          <div class="sqp-join-header">JOINS <button id="sqp-add-join">+ Add Join</button></div>
          <div id="sqp-join-rows"></div>
        </div>
        <table class="sqp-builder-table">
          <thead>
            <tr>
              <th>Column</th>
              <th class="sqp-adv-header">Aggregate</th>
              <th>Alias</th>
              <th class="sqp-adv-header">Group</th>
              <th>Sort</th>
              <th class="sqp-adv-header">Operator</th>
              <th class="sqp-adv-header">Value</th>
              <th class="sqp-basic-header">Filter</th>
              <th>Output</th>
              <th></th>
            </tr>
          </thead>
          <tbody id="sqp-builder-body"></tbody>
        </table>
        <div id="sqp-having-section" class="sqp-having-section" style="display:none">
          <div class="sqp-having-header">HAVING <button id="sqp-add-having">+ Add</button></div>
          <table class="sqp-having-table">
            <thead>
              <tr>
                <th>Aggregate</th>
                <th>Column</th>
                <th>Operator</th>
                <th>Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="sqp-having-body"></tbody>
          </table>
        </div>
      </div>
      <div class="sqp-query-bar">
        <textarea class="sqp-textarea" id="sqp-query" rows="1"
          placeholder="SELECT * FROM data WHERE _line LIKE '%ERROR%' ORDER BY _num LIMIT 100"></textarea>
        <div class="sqp-btn-group">
          <button class="sqp-run-btn" id="sqp-run-btn">Run</button>
          <button class="sqp-export-btn" id="sqp-export-btn" title="Export results to new tab" disabled>Export</button>
          <button class="sqp-save-results-btn" id="sqp-save-results-btn" title="Save last query results as a named table" disabled>Save Results</button>
          <button class="sqp-export-db-btn" id="sqp-export-db-btn" title="Export results to a database" disabled>Export DB</button>
        </div>
      </div>
      <div class="sqp-status" id="sqp-status">Enter a SQL query and click Run (Ctrl+Enter).</div>
      <div class="sqp-results" id="sqp-results"></div>
    `;

    this.container.querySelector('.sqp-close-btn').addEventListener('click', () => this.hide());
    this.container.querySelector('#sqp-run-btn').addEventListener('click', () => this._executeQuery());
    this.container.querySelector('#sqp-export-btn').addEventListener('click', () => this._exportResults());
    this.container.querySelector('#sqp-save-results-btn').addEventListener('click', () => this._saveResultsAsTable());
    this.container.querySelector('#sqp-export-db-btn').addEventListener('click', () => this._showExportDBDialog());

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
    this.container.querySelector('#sqp-builder-toggle').addEventListener('click', () => this._toggleBuilder());
    this.container.querySelector('#sqp-mode-toggle').addEventListener('click', () => this._toggleMode());
    this.container.querySelector('#sqp-add-join').addEventListener('click', () => this._addJoinRow());
    this.container.querySelector('#sqp-add-having').addEventListener('click', () => this._addHavingRow());

    // Delegated click on results table — row clicks jump to source line
    this.container.querySelector('#sqp-results').addEventListener('click', (e) => {
      const tr = e.target.closest('tr.sqp-clickable');
      if (!tr) return;
      const lineNum = parseInt(tr.dataset.lineNum, 10);
      if (!isNaN(lineNum)) {
        this.onRowClickCallbacks.forEach(cb => cb(lineNum));
      }
    });

    // Delegated click on tables reference bar — chip clicks insert SELECT query, × deletes saved table
    this.container.querySelector('#sqp-tables-ref').addEventListener('click', (e) => {
      // Handle delete button on saved table chips
      const deleteBtn = e.target.closest('.sqp-saved-chip-delete');
      if (deleteBtn) {
        const chip = deleteBtn.closest('.sqp-table-chip');
        const tableName = chip && chip.dataset.tableName;
        if (tableName) {
          this.savedTables.delete(tableName);
          this._updateTablesRef(this._lastParsedTables);
          this._setStatus(`Removed saved table "${tableName}".`);
        }
        return;
      }

      const chip = e.target.closest('.sqp-table-chip');
      if (!chip) return;
      const tableName = chip.dataset.tableName;
      if (tableName) {
        this.container.querySelector('#sqp-query').value = `SELECT * FROM [${tableName}] LIMIT 100`;
      }
    });

    this._initResize();
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

  _toggleMode() {
    this.advancedMode = !this.advancedMode;
    const builder = this.container.querySelector('#sqp-builder');
    const toggleBtn = this.container.querySelector('#sqp-mode-toggle');

    if (this.advancedMode) {
      builder.classList.add('sqp-advanced-mode');
      builder.classList.remove('sqp-basic-mode');
      toggleBtn.textContent = 'Basic';
      toggleBtn.classList.add('sqp-mode-active');
      this.container.querySelector('#sqp-join-section').style.display = '';
      this.container.querySelector('#sqp-having-section').style.display = '';
    } else {
      builder.classList.remove('sqp-advanced-mode');
      builder.classList.add('sqp-basic-mode');
      toggleBtn.textContent = 'Advanced';
      toggleBtn.classList.remove('sqp-mode-active');
      this.container.querySelector('#sqp-join-section').style.display = 'none';
      this.container.querySelector('#sqp-having-section').style.display = 'none';
    }

    this._updateColumnPrefixes();
    this._generateSQL();
  }

  _refreshColumns() {
    const tabId = this.tabManager.getActiveTabId();
    if (!tabId) return;

    const tab = this.tabManager.getTab(tabId);
    if (tab && tab.isLargeFile) return;

    const content = this.editorManager.getContent(tabId);
    if (!content || content.trim().length === 0) return;

    const parsed = this._parseContent(content, tab.title);
    this.builderColumns = parsed.columns;

    // Multi-table: show tables reference bar, store tables for _executeQuery
    this._lastParsedTables = parsed.tables || null;
    this._lastPrimaryTableName = parsed.primaryTableName || null;
    this._updateTablesRef(parsed.tables);

    this._updateColumnDropdowns();

    // Also refresh JOIN right-column dropdowns
    this._refreshJoinColumns();
  }

  /** Update all main builder column dropdowns (and HAVING) with current column list */
  _updateColumnDropdowns() {
    const allColumns = this._getAllColumns();

    // Update main grid column selects
    const selects = this.container.querySelectorAll('.sqp-col-select');
    for (const select of selects) {
      const current = select.value;
      select.innerHTML = '<option value="">—</option>';
      for (const col of allColumns) {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        select.appendChild(opt);
      }
      if (allColumns.includes(current)) {
        select.value = current;
      }
    }

    // Update HAVING column selects
    const havingSelects = this.container.querySelectorAll('.sqp-having-col-select');
    for (const select of havingSelects) {
      const current = select.value;
      select.innerHTML = '<option value="">—</option>';
      for (const col of allColumns) {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        select.appendChild(opt);
      }
      if (allColumns.includes(current)) {
        select.value = current;
      }
    }
  }

  /** Get all available columns, with t1/tN prefixes when JOINs are active in advanced mode */
  _getAllColumns() {
    if (!this.advancedMode || this.joinData.length === 0) {
      return this.builderColumns;
    }

    const cols = [];
    for (const col of this.builderColumns) {
      cols.push(`t1.${col}`);
    }
    for (let i = 0; i < this.joinData.length; i++) {
      const join = this.joinData[i];
      if (join.columns) {
        for (const col of join.columns) {
          cols.push(`t${i + 2}.${col}`);
        }
      }
    }
    return cols;
  }

  /** Update column prefixes when toggling mode or adding/removing joins */
  _updateColumnPrefixes() {
    this._updateColumnDropdowns();

    // Update JOIN left-column dropdowns
    const leftSelects = this.container.querySelectorAll('.sqp-join-left-col');
    for (const select of leftSelects) {
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

    const allColumns = this._getAllColumns();

    // Column select
    const tdCol = document.createElement('td');
    const colSelect = document.createElement('select');
    colSelect.className = 'sqp-col-select';
    colSelect.innerHTML = '<option value="">—</option>';
    for (const col of allColumns) {
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

    // Aggregate select (advanced only)
    const tdAgg = document.createElement('td');
    tdAgg.className = 'sqp-adv-cell';
    const aggSelect = document.createElement('select');
    aggSelect.className = 'sqp-agg-select';
    aggSelect.innerHTML = '<option value="">NONE</option><option value="COUNT">COUNT</option><option value="SUM">SUM</option><option value="AVG">AVG</option><option value="MIN">MIN</option><option value="MAX">MAX</option>';
    aggSelect.addEventListener('change', () => this._generateSQL());
    tdAgg.appendChild(aggSelect);
    tr.appendChild(tdAgg);

    // Alias input
    const tdAlias = document.createElement('td');
    const aliasInput = document.createElement('input');
    aliasInput.type = 'text';
    aliasInput.className = 'sqp-alias-input';
    aliasInput.placeholder = 'alias';
    aliasInput.addEventListener('input', () => this._generateSQL());
    tdAlias.appendChild(aliasInput);
    tr.appendChild(tdAlias);

    // Group By checkbox (advanced only)
    const tdGroup = document.createElement('td');
    tdGroup.className = 'sqp-adv-cell';
    const groupCheck = document.createElement('input');
    groupCheck.type = 'checkbox';
    groupCheck.className = 'sqp-group-check';
    groupCheck.addEventListener('change', () => this._generateSQL());
    tdGroup.appendChild(groupCheck);
    tr.appendChild(tdGroup);

    // Sort select
    const tdSort = document.createElement('td');
    const sortSelect = document.createElement('select');
    sortSelect.className = 'sqp-sort-select';
    sortSelect.innerHTML = '<option value="">—</option><option value="ASC">ASC</option><option value="DESC">DESC</option>';
    sortSelect.addEventListener('change', () => this._generateSQL());
    tdSort.appendChild(sortSelect);
    tr.appendChild(tdSort);

    // Operator select (advanced only)
    const tdOp = document.createElement('td');
    tdOp.className = 'sqp-adv-cell';
    const opSelect = document.createElement('select');
    opSelect.className = 'sqp-operator-select';
    opSelect.innerHTML = `
      <option value="">—</option>
      <option value="=">=</option>
      <option value="!=">!=</option>
      <option value=">">&gt;</option>
      <option value="<">&lt;</option>
      <option value=">=">&gt;=</option>
      <option value="<=">&lt;=</option>
      <option value="LIKE">LIKE</option>
      <option value="NOT LIKE">NOT LIKE</option>
      <option value="IN">IN</option>
      <option value="NOT IN">NOT IN</option>
      <option value="BETWEEN">BETWEEN</option>
      <option value="IS NULL">IS NULL</option>
      <option value="IS NOT NULL">IS NOT NULL</option>
    `;
    tdOp.appendChild(opSelect);
    tr.appendChild(tdOp);

    // Value input (advanced only)
    const tdVal = document.createElement('td');
    tdVal.className = 'sqp-adv-cell sqp-value-cell';
    const valWrapper = document.createElement('div');
    valWrapper.className = 'sqp-value-wrapper';
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'sqp-value-input';
    valInput.placeholder = 'value';
    valInput.addEventListener('input', () => this._generateSQL());
    valWrapper.appendChild(valInput);

    const betweenLabel = document.createElement('span');
    betweenLabel.className = 'sqp-between-label';
    betweenLabel.textContent = 'AND';
    betweenLabel.style.display = 'none';
    valWrapper.appendChild(betweenLabel);

    const val2Input = document.createElement('input');
    val2Input.type = 'text';
    val2Input.className = 'sqp-value2-input';
    val2Input.placeholder = 'value2';
    val2Input.style.display = 'none';
    val2Input.addEventListener('input', () => this._generateSQL());
    valWrapper.appendChild(val2Input);

    tdVal.appendChild(valWrapper);
    tr.appendChild(tdVal);

    // Operator change handler — adjust value input visibility/placeholders
    opSelect.addEventListener('change', () => {
      const op = opSelect.value;
      if (op === 'IS NULL' || op === 'IS NOT NULL') {
        valInput.style.display = 'none';
        betweenLabel.style.display = 'none';
        val2Input.style.display = 'none';
      } else if (op === 'BETWEEN') {
        valInput.style.display = '';
        valInput.placeholder = 'from';
        betweenLabel.style.display = '';
        val2Input.style.display = '';
        val2Input.placeholder = 'to';
      } else if (op === 'IN' || op === 'NOT IN') {
        valInput.style.display = '';
        valInput.placeholder = 'val1, val2, val3';
        betweenLabel.style.display = 'none';
        val2Input.style.display = 'none';
      } else if (op === 'LIKE' || op === 'NOT LIKE') {
        valInput.style.display = '';
        valInput.placeholder = '%pattern%';
        betweenLabel.style.display = 'none';
        val2Input.style.display = 'none';
      } else {
        valInput.style.display = '';
        valInput.placeholder = 'value';
        betweenLabel.style.display = 'none';
        val2Input.style.display = 'none';
      }
      this._generateSQL();
    });

    // Filter input (basic only)
    const tdFilter = document.createElement('td');
    tdFilter.className = 'sqp-basic-cell';
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
    outputCheck.className = 'sqp-output-check';
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

  // ── JOIN Section ──

  _addJoinRow() {
    const container = this.container.querySelector('#sqp-join-rows');
    const row = document.createElement('div');
    row.className = 'sqp-join-row';
    const joinIndex = container.querySelectorAll('.sqp-join-row').length;

    // Tab dropdown
    const tabSelect = document.createElement('select');
    tabSelect.className = 'sqp-join-tab-select';
    tabSelect.innerHTML = '<option value="">Select tab...</option>';

    const activeTabId = this.tabManager.getActiveTabId();
    const allTabs = this.tabManager.getAllTabs();
    for (const [tId, tData] of allTabs) {
      if (tId === activeTabId) continue;
      if (tData.isLargeFile) continue;
      const opt = document.createElement('option');
      opt.value = tId;
      opt.textContent = tData.title || 'untitled';
      tabSelect.appendChild(opt);
    }

    // Join type dropdown
    const typeSelect = document.createElement('select');
    typeSelect.className = 'sqp-join-type-select';
    typeSelect.innerHTML = '<option value="JOIN">INNER</option><option value="LEFT JOIN">LEFT</option><option value="RIGHT JOIN">RIGHT</option><option value="FULL JOIN">FULL</option>';

    // ON label
    const onLabel = document.createElement('span');
    onLabel.className = 'sqp-join-label';
    onLabel.textContent = 'ON';

    // Left column dropdown (from active tab)
    const leftSelect = document.createElement('select');
    leftSelect.className = 'sqp-join-col-select sqp-join-left-col';
    leftSelect.innerHTML = '<option value="">—</option>';
    for (const col of this.builderColumns) {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      leftSelect.appendChild(opt);
    }

    // = label
    const eqLabel = document.createElement('span');
    eqLabel.className = 'sqp-join-label';
    eqLabel.textContent = '=';

    // Right column dropdown (from joined tab, populated on tab selection)
    const rightSelect = document.createElement('select');
    rightSelect.className = 'sqp-join-col-select sqp-join-right-col';
    rightSelect.innerHTML = '<option value="">—</option>';

    // Warning span (for closed/unparseable tabs)
    const warning = document.createElement('span');
    warning.className = 'sqp-join-warning';

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'sqp-join-remove-btn';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove join';

    row.appendChild(tabSelect);
    row.appendChild(typeSelect);
    row.appendChild(onLabel);
    row.appendChild(leftSelect);
    row.appendChild(eqLabel);
    row.appendChild(rightSelect);
    row.appendChild(warning);
    row.appendChild(removeBtn);
    container.appendChild(row);

    // Store join data entry
    const joinEntry = { tabId: '', joinType: 'JOIN', leftCol: '', rightCol: '', data: null, columns: [] };
    this.joinData.push(joinEntry);
    const currentJoinIndex = this.joinData.length - 1;

    // Tab selection → parse joined tab content, populate right column dropdown
    tabSelect.addEventListener('change', () => {
      const selectedTabId = tabSelect.value;
      joinEntry.tabId = selectedTabId;
      warning.textContent = '';

      if (!selectedTabId) {
        rightSelect.innerHTML = '<option value="">—</option>';
        joinEntry.data = null;
        joinEntry.columns = [];
        this._updateColumnPrefixes();
        this._generateSQL();
        return;
      }

      const tab = this.tabManager.getTab(selectedTabId);
      if (!tab) {
        warning.textContent = 'Tab not found';
        rightSelect.innerHTML = '<option value="">—</option>';
        joinEntry.data = null;
        joinEntry.columns = [];
        this._updateColumnPrefixes();
        this._generateSQL();
        return;
      }

      const content = this.editorManager.getContent(selectedTabId);
      if (!content || content.trim().length === 0) {
        warning.textContent = 'Tab is empty';
        rightSelect.innerHTML = '<option value="">—</option>';
        joinEntry.data = null;
        joinEntry.columns = [];
        this._updateColumnPrefixes();
        this._generateSQL();
        return;
      }

      const parsed = this._parseContent(content, tab.title);
      joinEntry.data = parsed.data;
      joinEntry.columns = parsed.columns;

      rightSelect.innerHTML = '<option value="">—</option>';
      for (const col of parsed.columns) {
        const opt = document.createElement('option');
        opt.value = col;
        opt.textContent = col;
        rightSelect.appendChild(opt);
      }

      this._updateColumnPrefixes();
      this._generateSQL();
    });

    typeSelect.addEventListener('change', () => {
      joinEntry.joinType = typeSelect.value;
      this._generateSQL();
    });

    leftSelect.addEventListener('change', () => {
      joinEntry.leftCol = leftSelect.value;
      this._generateSQL();
    });

    rightSelect.addEventListener('change', () => {
      joinEntry.rightCol = rightSelect.value;
      this._generateSQL();
    });

    removeBtn.addEventListener('click', () => {
      const idx = this.joinData.indexOf(joinEntry);
      if (idx !== -1) this.joinData.splice(idx, 1);
      row.remove();
      this._updateColumnPrefixes();
      this._generateSQL();
    });
  }

  /** Refresh right-column dropdowns for all join rows */
  _refreshJoinColumns() {
    const rows = this.container.querySelectorAll('.sqp-join-row');
    rows.forEach((row, idx) => {
      if (idx >= this.joinData.length) return;
      const joinEntry = this.joinData[idx];
      if (!joinEntry.tabId) return;

      const tab = this.tabManager.getTab(joinEntry.tabId);
      const warning = row.querySelector('.sqp-join-warning');

      if (!tab) {
        if (warning) warning.textContent = 'Tab closed';
        joinEntry.data = null;
        joinEntry.columns = [];
        return;
      }

      const content = this.editorManager.getContent(joinEntry.tabId);
      if (!content || content.trim().length === 0) {
        if (warning) warning.textContent = 'Tab is empty';
        joinEntry.data = null;
        joinEntry.columns = [];
        return;
      }

      if (warning) warning.textContent = '';
      const parsed = this._parseContent(content, tab.title);
      joinEntry.data = parsed.data;
      joinEntry.columns = parsed.columns;

      const rightSelect = row.querySelector('.sqp-join-right-col');
      if (rightSelect) {
        const current = rightSelect.value;
        rightSelect.innerHTML = '<option value="">—</option>';
        for (const col of parsed.columns) {
          const opt = document.createElement('option');
          opt.value = col;
          opt.textContent = col;
          rightSelect.appendChild(opt);
        }
        if (parsed.columns.includes(current)) {
          rightSelect.value = current;
        }
      }

      // Also refresh left column selects
      const leftSelect = row.querySelector('.sqp-join-left-col');
      if (leftSelect) {
        const current = leftSelect.value;
        leftSelect.innerHTML = '<option value="">—</option>';
        for (const col of this.builderColumns) {
          const opt = document.createElement('option');
          opt.value = col;
          opt.textContent = col;
          leftSelect.appendChild(opt);
        }
        if (this.builderColumns.includes(current)) {
          leftSelect.value = current;
        }
      }
    });
  }

  // ── Tables Reference Bar (multi-table JSON) ──

  _updateTablesRef(tables) {
    const ref = this.container.querySelector('#sqp-tables-ref');
    const hasMultiTables = tables && Object.keys(tables).length > 1;
    const hasSavedTables = this.savedTables.size > 0;

    if (!hasMultiTables && !hasSavedTables) {
      ref.style.display = 'none';
      ref.innerHTML = '';
      return;
    }

    ref.style.display = '';
    ref.innerHTML = '<span class="sqp-tables-label">Tables:</span>';

    // Multi-table JSON chips
    if (hasMultiTables) {
      for (const [name, tbl] of Object.entries(tables)) {
        const chip = document.createElement('button');
        chip.className = 'sqp-table-chip';
        chip.textContent = `${name} (${tbl.data.length})`;
        chip.title = tbl.columns.join(', ');
        chip.dataset.tableName = name;
        ref.appendChild(chip);
      }
    }

    // Saved table chips (blue style + delete button)
    for (const [name, tbl] of this.savedTables) {
      const chip = document.createElement('button');
      chip.className = 'sqp-table-chip sqp-saved-chip';
      chip.title = tbl.columns.join(', ');
      chip.dataset.tableName = name;

      const label = document.createElement('span');
      label.textContent = `${name} (${tbl.data.length})`;
      chip.appendChild(label);

      const del = document.createElement('span');
      del.className = 'sqp-saved-chip-delete';
      del.textContent = '\u00D7';
      del.title = `Remove "${name}"`;
      chip.appendChild(del);

      ref.appendChild(chip);
    }
  }

  // ── HAVING Section ──

  _addHavingRow() {
    const tbody = this.container.querySelector('#sqp-having-body');
    const tr = document.createElement('tr');
    const allColumns = this._getAllColumns();

    // Aggregate dropdown
    const tdAgg = document.createElement('td');
    const aggSelect = document.createElement('select');
    aggSelect.className = 'sqp-having-agg-select';
    aggSelect.innerHTML = '<option value="COUNT">COUNT</option><option value="SUM">SUM</option><option value="AVG">AVG</option><option value="MIN">MIN</option><option value="MAX">MAX</option>';
    aggSelect.addEventListener('change', () => this._generateSQL());
    tdAgg.appendChild(aggSelect);
    tr.appendChild(tdAgg);

    // Column dropdown
    const tdCol = document.createElement('td');
    const colSelect = document.createElement('select');
    colSelect.className = 'sqp-having-col-select';
    colSelect.innerHTML = '<option value="">—</option>';
    for (const col of allColumns) {
      const opt = document.createElement('option');
      opt.value = col;
      opt.textContent = col;
      colSelect.appendChild(opt);
    }
    colSelect.addEventListener('change', () => this._generateSQL());
    tdCol.appendChild(colSelect);
    tr.appendChild(tdCol);

    // Operator dropdown
    const tdOp = document.createElement('td');
    const opSelect = document.createElement('select');
    opSelect.className = 'sqp-having-op-select';
    opSelect.innerHTML = '<option value="=">=</option><option value="!=">!=</option><option value=">">&gt;</option><option value="<">&lt;</option><option value=">=">&gt;=</option><option value="<=">&lt;=</option>';
    opSelect.addEventListener('change', () => this._generateSQL());
    tdOp.appendChild(opSelect);
    tr.appendChild(tdOp);

    // Value input
    const tdVal = document.createElement('td');
    const valInput = document.createElement('input');
    valInput.type = 'text';
    valInput.className = 'sqp-having-value-input';
    valInput.placeholder = 'value';
    valInput.addEventListener('input', () => this._generateSQL());
    tdVal.appendChild(valInput);
    tr.appendChild(tdVal);

    // Remove button
    const tdRemove = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.className = 'sqp-remove-row-btn';
    removeBtn.textContent = '\u00D7';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', () => {
      tr.remove();
      this._generateSQL();
    });
    tdRemove.appendChild(removeBtn);
    tr.appendChild(tdRemove);

    tbody.appendChild(tr);
  }

  // ── SQL Generation ──

  _generateSQL() {
    const tbody = this.container.querySelector('#sqp-builder-body');
    const rows = tbody.querySelectorAll('tr');

    const selectParts = [];
    const whereParts = [];
    const orderParts = [];
    const groupByParts = [];
    const hasJoins = this.advancedMode && this.joinData.some(j => j.tabId && j.leftCol && j.rightCol);

    for (const row of rows) {
      const col = row.querySelector('.sqp-col-select').value;
      if (!col) continue;

      const alias = row.querySelector('.sqp-alias-input').value.trim();
      const sort = row.querySelector('.sqp-sort-select').value;
      const output = row.querySelector('.sqp-output-check').checked;

      if (this.advancedMode) {
        const agg = row.querySelector('.sqp-agg-select').value;
        const group = row.querySelector('.sqp-group-check').checked;
        const op = row.querySelector('.sqp-operator-select').value;
        const val = row.querySelector('.sqp-value-input').value.trim();
        const val2El = row.querySelector('.sqp-value2-input');
        const val2 = val2El ? val2El.value.trim() : '';

        // SELECT part
        if (output) {
          if (agg) {
            selectParts.push(alias ? `${agg}(${col}) AS ${alias}` : `${agg}(${col})`);
          } else {
            selectParts.push(alias ? `${col} AS ${alias}` : col);
          }
        }

        // WHERE part
        if (op) {
          const whereExpr = this._buildWhereExpr(col, op, val, val2);
          if (whereExpr) whereParts.push(whereExpr);
        }

        // GROUP BY part
        if (group) {
          groupByParts.push(col);
        }

        // ORDER BY part
        if (sort) {
          if (agg) {
            orderParts.push(`${agg}(${col}) ${sort}`);
          } else {
            orderParts.push(`${col} ${sort}`);
          }
        }
      } else {
        // Basic mode
        const filter = row.querySelector('.sqp-filter-input').value.trim();

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
    }

    // HAVING parts (advanced mode only)
    const havingParts = [];
    if (this.advancedMode) {
      const havingRows = this.container.querySelectorAll('#sqp-having-body tr');
      for (const hRow of havingRows) {
        const hAgg = hRow.querySelector('.sqp-having-agg-select').value;
        const hCol = hRow.querySelector('.sqp-having-col-select').value;
        const hOp = hRow.querySelector('.sqp-having-op-select').value;
        const hVal = hRow.querySelector('.sqp-having-value-input').value.trim();
        if (hAgg && hCol && hOp && hVal) {
          havingParts.push(`${hAgg}(${hCol}) ${hOp} ${this._quoteValue(hVal)}`);
        }
      }
    }

    // Build SQL — always include _num for row-click navigation (unless aggregate/group)
    const hasAggregates = groupByParts.length > 0;
    if (selectParts.length > 0 && !hasAggregates && !hasJoins &&
        !selectParts.some(p => p === '_num' || p.startsWith('_num '))) {
      selectParts.unshift('_num');
    }
    const selectClause = selectParts.length > 0 ? selectParts.join(', ') : '*';
    let sql;

    if (hasJoins) {
      sql = `SELECT ${selectClause} FROM ? AS t1`;
      let tIdx = 2;
      for (const join of this.joinData) {
        if (join.tabId && join.leftCol && join.rightCol) {
          sql += ` ${join.joinType} ? AS t${tIdx} ON t1.${join.leftCol} = t${tIdx}.${join.rightCol}`;
          tIdx++;
        }
      }
    } else {
      sql = `SELECT ${selectClause} FROM data`;
    }

    if (whereParts.length > 0) {
      sql += ` WHERE ${whereParts.join(' AND ')}`;
    }

    if (groupByParts.length > 0) {
      sql += ` GROUP BY ${groupByParts.join(', ')}`;
    }

    if (havingParts.length > 0) {
      sql += ` HAVING ${havingParts.join(' AND ')}`;
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

  /** Build a WHERE expression for a column given operator and value(s) */
  _buildWhereExpr(col, op, val, val2) {
    if (op === 'IS NULL') return `${col} IS NULL`;
    if (op === 'IS NOT NULL') return `${col} IS NOT NULL`;
    if (!val) return null;

    if (op === 'BETWEEN') {
      if (!val2) return null;
      return `${col} BETWEEN ${this._quoteValue(val)} AND ${this._quoteValue(val2)}`;
    }

    if (op === 'IN' || op === 'NOT IN') {
      const vals = val.split(',').map(v => this._quoteValue(v.trim())).join(', ');
      return `${col} ${op} (${vals})`;
    }

    if (op === 'LIKE' || op === 'NOT LIKE') {
      return `${col} ${op} '${val.replace(/'/g, "''")}'`;
    }

    return `${col} ${op} ${this._quoteValue(val)}`;
  }

  /** Quote a value for SQL — numbers stay bare, strings get single-quoted */
  _quoteValue(val) {
    if (val === '') return "''";
    // If it looks like a number, leave it bare
    if (/^-?\d+(\.\d+)?$/.test(val)) return val;
    return `'${val.replace(/'/g, "''")}'`;
  }

  _clearBuilder() {
    const tbody = this.container.querySelector('#sqp-builder-body');
    tbody.innerHTML = '';

    // Clear HAVING rows
    const havingBody = this.container.querySelector('#sqp-having-body');
    havingBody.innerHTML = '';

    // Clear JOIN rows
    const joinRows = this.container.querySelector('#sqp-join-rows');
    joinRows.innerHTML = '';
    this.joinData = [];

    this._addBuilderRow();
    this.container.querySelector('#sqp-query').value = '';
    this._updateColumnPrefixes();
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

  /**
   * Split a single CSV line into fields, respecting double-quoted values.
   * Handles escaped quotes ("") inside quoted fields per RFC 4180.
   * Falls back to regex split for non-string delimiters.
   */
  _splitCSVFields(line, delimiter) {
    if (typeof delimiter !== 'string' || delimiter.length !== 1) {
      return line.split(delimiter);
    }

    const fields = [];
    let field = '';
    let inQuotes = false;
    let i = 0;

    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            inQuotes = false;
            i++;
          }
        } else {
          field += ch;
          i++;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
          i++;
        } else if (ch === delimiter) {
          fields.push(field);
          field = '';
          i++;
        } else {
          field += ch;
          i++;
        }
      }
    }
    fields.push(field);
    return fields;
  }

  // ── Parse content into rows ──

  _parseContent(content, filename) {
    const lower = (filename || '').toLowerCase();

    // Try JSON structured parsing for .json files
    if (lower.endsWith('.json')) {
      const result = this._parseJSONContent(content);
      if (result) return result;
    }

    // Try XML structured parsing for .xml files
    if (lower.endsWith('.xml')) {
      const result = this._parseXMLContent(content);
      if (result) return result;
    }

    // Fallback: delimiter-based line splitting
    const rawLines = content.split(/\r?\n/);
    // Remove trailing empty line if present
    if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') rawLines.pop();

    if (rawLines.length === 0) return { data: [], columns: [] };

    let delimiter = this._getDelimiter();
    if (delimiter === null) delimiter = this._detectDelimiter(rawLines);

    const useHeader = this.container.querySelector('#sqp-header').checked;
    const startIdx = useHeader ? 1 : 0;

    // Determine column names (quote-aware split)
    const firstSplit = this._splitCSVFields(rawLines[0], delimiter);
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
      const parts = this._splitCSVFields(rawLines[i], delimiter);
      const row = { _num: i + 1, _line: rawLines[i] };
      for (let j = 0; j < colCount; j++) {
        row[colNames[j]] = parts[j] !== undefined ? parts[j].trim() : '';
      }
      data.push(row);
    }

    const columns = ['_num', '_line', ...colNames];
    return { data, columns };
  }

  // ── Nested JSON multi-table flattening ──

  /**
   * Detect nested JSON and flatten into multiple relational tables with foreign keys.
   * Returns { tableName: { data: [...], columns: [...] } } or null if JSON is flat.
   */
  _flattenNestedJSON(content, parsed) {
    // Find root array
    let arr = null;
    let tableName = 'data';

    if (Array.isArray(parsed) && parsed.length > 0) {
      arr = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      arr = this._findLargestObjectArray(parsed);
    }

    if (!arr || arr.length === 0) return null;
    // Ensure all elements are objects
    if (!arr.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) return null;

    // Single-key wrapper detection: [{employee: {...}}, ...] → unwrap
    const firstKeys = Object.keys(arr[0]);
    if (firstKeys.length === 1 && typeof arr[0][firstKeys[0]] === 'object' && !Array.isArray(arr[0][firstKeys[0]])) {
      const wrapperKey = firstKeys[0];
      const allWrap = arr.every(item => {
        const keys = Object.keys(item);
        return keys.length === 1 && keys[0] === wrapperKey && typeof item[wrapperKey] === 'object' && !Array.isArray(item[wrapperKey]);
      });
      if (allWrap) {
        arr = arr.map(item => item[wrapperKey]);
        tableName = wrapperKey;
      }
    }

    const tables = {};
    this._processArray(arr, tableName, null, null, tables);

    // If only one table was produced, no nesting was detected
    if (Object.keys(tables).length <= 1) {
      // Check if the single table has no nested data — just return null for flat
      const tbl = tables[tableName];
      if (tbl) return null;
      return null;
    }

    // Add _num (source line number) and _index to root table
    const lineMap = this._buildJSONLineMap(content, arr.length);
    const rootTable = tables[tableName];
    if (rootTable) {
      rootTable.data.forEach((row, idx) => {
        row._num = lineMap[idx] || (idx + 1);
        row._index = idx;
      });
      if (!rootTable.columns.includes('_num')) rootTable.columns.unshift('_num');
      if (!rootTable.columns.includes('_index')) rootTable.columns.splice(1, 0, '_index');
    }

    return tables;
  }

  /**
   * Core recursive flattener. Processes an array of objects into a table,
   * detecting child arrays to create linked child tables.
   */
  _processArray(arr, tableName, fkName, fkValues, tables) {
    const columnSet = new Set();
    const rows = [];
    // Collect child arrays to recurse into after processing all rows
    const pendingChildren = []; // [{arr, childTableName, fkName, fkValues}]

    for (let i = 0; i < arr.length; i++) {
      const obj = arr[i];
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) continue;

      const row = {};
      // Add FK column if this is a child table
      if (fkName && fkValues) {
        row[fkName] = fkValues[i];
        columnSet.add(fkName);
      }

      // Detect ID field for this object
      const idField = this._findIdField(obj);

      const childArrays = []; // [{key, arr, parentIdField, parentIdValue}]
      this._flattenFields(obj, '', row, columnSet, childArrays, idField, idField ? obj[idField] : i, tableName);

      rows.push(row);

      // Buffer child arrays with FK values
      for (const child of childArrays) {
        // Find or create the pending child entry
        let pending = pendingChildren.find(p => p.childTableName === child.key);
        if (!pending) {
          // FK naming: _parentIdField, or _row if no ID field found on parent
          const fk = child.parentIdField ? `_${child.parentIdField}` : '_row';
          pending = { arr: [], childTableName: child.key, fkName: fk, fkValues: [] };
          pendingChildren.push(pending);
        }
        for (const item of child.arr) {
          pending.arr.push(item);
          pending.fkValues.push(child.parentIdValue);
        }
      }
    }

    tables[tableName] = { data: rows, columns: Array.from(columnSet) };

    // Recurse into child arrays
    for (const child of pendingChildren) {
      this._processArray(child.arr, child.childTableName, child.fkName, child.fkValues, tables);
    }
  }

  /**
   * Walk an object's fields, flattening scalars and nested objects into the row,
   * and buffering child arrays for separate table creation.
   */
  _flattenFields(obj, prefix, row, columnSet, childArrays, parentIdField, parentIdValue, parentTableName) {
    for (const [key, val] of Object.entries(obj)) {
      const colName = prefix ? `${prefix}_${key}` : key;

      if (val === null || val === undefined) {
        row[colName] = null;
        columnSet.add(colName);
      } else if (Array.isArray(val)) {
        if (val.length === 0) continue;
        // Array of objects → child table
        if (typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0])) {
          childArrays.push({ key, arr: val, parentIdField: parentIdField, parentIdValue: parentIdValue });
        } else {
          // Array of scalars → child table with {value: item} rows
          const wrapped = val.map(item => ({ value: item }));
          childArrays.push({ key, arr: wrapped, parentIdField: parentIdField, parentIdValue: parentIdValue });
        }
      } else if (typeof val === 'object') {
        // Nested object → flatten with prefix
        this._flattenFields(val, colName, row, columnSet, childArrays, parentIdField, parentIdValue, parentTableName);
      } else {
        // Scalar — preserve original type (number, string, boolean)
        row[colName] = val;
        columnSet.add(colName);
      }
    }
  }

  /**
   * Find the best ID field in an object: 'id' first, then any field ending in 'Id' or '_id'.
   */
  _findIdField(obj) {
    const keys = Object.keys(obj);
    if (keys.includes('id')) return 'id';
    for (const k of keys) {
      if (k.endsWith('Id') || k.endsWith('_id')) return k;
    }
    return null;
  }

  // ── JSON structured parsing (array of objects → rows) ──

  _parseJSONContent(content) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }

    // Try multi-table nested flattening first
    const tables = this._flattenNestedJSON(content, parsed);
    if (tables && Object.keys(tables).length > 1) {
      // Multi-table: return primary table data + full tables map
      const primaryName = Object.keys(tables)[0];
      const primary = tables[primaryName];
      return { data: primary.data, columns: primary.columns, tables, primaryTableName: primaryName };
    }

    // Single table or flat JSON — use existing flat logic
    let arr = null;
    if (Array.isArray(parsed) && parsed.length > 0) {
      arr = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      arr = this._findLargestObjectArray(parsed);
    }

    if (!arr || arr.length === 0) return null;

    // Union all keys for columns (skip non-object entries)
    const keySet = new Set();
    for (const obj of arr) {
      if (typeof obj !== 'object' || obj === null) return null;
      Object.keys(obj).forEach(k => keySet.add(k));
    }
    const colNames = Array.from(keySet);

    // Build source line map (approximate line for each array element)
    const lineMap = this._buildJSONLineMap(content, arr.length);

    const data = arr.map((obj, idx) => {
      const row = { _num: lineMap[idx] || (idx + 1), _index: idx };
      for (const key of colNames) {
        const val = obj[key];
        if (val === undefined || val === null) {
          row[key] = '';
        } else if (typeof val === 'object') {
          row[key] = JSON.stringify(val);
        } else {
          row[key] = String(val);
        }
      }
      return row;
    });

    const columns = ['_num', '_index', ...colNames];
    return { data, columns };
  }

  _buildJSONLineMap(content, count) {
    const map = [];
    let depth = 0;
    let inString = false;
    let escape = false;
    let line = 1;
    let arrayFound = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (ch === '\n') { line++; continue; }
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;

      if (ch === '[' && !arrayFound) {
        arrayFound = true;
        depth = 1;
        continue;
      }
      if (!arrayFound) continue;

      if (ch === '{' || ch === '[') {
        if (depth === 1 && ch === '{') map.push(line);
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) break;
      }
    }
    return map;
  }

  /** Recursively find the largest array of plain objects within a JSON value */
  _findLargestObjectArray(value) {
    let best = null;

    const search = (node) => {
      if (Array.isArray(node)) {
        // Check if this array contains objects
        if (node.length >= 2 && node.every(item => typeof item === 'object' && item !== null && !Array.isArray(item))) {
          if (!best || node.length > best.length) {
            best = node;
          }
        }
        // Also search within array elements
        for (const item of node) {
          if (typeof item === 'object' && item !== null) search(item);
        }
      } else if (typeof node === 'object' && node !== null) {
        for (const val of Object.values(node)) {
          if (typeof val === 'object' && val !== null) search(val);
        }
      }
    };

    search(value);
    return best;
  }

  // ── XML structured parsing (repeating elements → rows) ──

  _parseXMLContent(content) {
    let doc;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(content, 'application/xml');
    } catch {
      return null;
    }
    if (doc.querySelector('parsererror')) return null;

    const root = doc.documentElement;
    const children = Array.from(root.children);
    if (children.length < 2) return null;

    // Find repeating tag name
    const firstName = children[0].tagName;
    const repeating = children.filter(c => c.tagName === firstName);
    if (repeating.length < 2) return null;

    // Extract columns from child element tag names + attributes
    const keySet = new Set();
    const attrSet = new Set();
    for (const el of repeating) {
      Array.from(el.children).forEach(child => keySet.add(child.tagName));
      Array.from(el.attributes).forEach(attr => attrSet.add('@' + attr.name));
    }
    const colNames = [...Array.from(attrSet), ...Array.from(keySet)];

    // Build source line map
    const lineMap = this._buildXMLLineMap(content, firstName);

    const data = repeating.map((el, idx) => {
      const row = { _num: lineMap[idx] || (idx + 1), _index: idx };
      for (const col of colNames) {
        if (col.startsWith('@')) {
          const attrName = col.slice(1);
          row[col] = el.getAttribute(attrName) || '';
        } else {
          const child = el.querySelector(col);
          row[col] = child ? child.textContent : '';
        }
      }
      return row;
    });

    const columns = ['_num', '_index', ...colNames];
    return { data, columns };
  }

  _buildXMLLineMap(content, tagName) {
    const map = [];
    const regex = new RegExp(`<${tagName}[\\s>]`, 'g');
    let match;
    while ((match = regex.exec(content)) !== null) {
      const line = content.substring(0, match.index).split('\n').length;
      map.push(line);
    }
    return map;
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

    const parsed = this._parseContent(content, tab.title);
    const { data, columns } = parsed;
    if (data.length === 0) {
      this._setStatus('No data rows found.', true);
      return;
    }

    const isMultiTable = parsed.tables && Object.keys(parsed.tables).length > 1;

    // Register saved tables in alasql before query
    const savedTableNames = [];
    for (const [name, tbl] of this.savedTables) {
      savedTableNames.push(name);
      alasql(`CREATE TABLE IF NOT EXISTS [${name}]`);
      alasql.tables[name].data = tbl.data;
    }

    const t0 = performance.now();
    let results;

    if (isMultiTable) {
      // Multi-table path: register all tables in alasql, execute SQL directly
      const tableNames = Object.keys(parsed.tables);
      try {
        for (const name of tableNames) {
          alasql(`CREATE TABLE IF NOT EXISTS [${name}]`);
          alasql.tables[name].data = parsed.tables[name].data;
        }
        results = alasql(sql);
      } catch (err) {
        this._setStatus(`Error: ${err.message}`, true);
        return;
      } finally {
        for (const name of tableNames) {
          try { alasql(`DROP TABLE IF EXISTS [${name}]`); } catch { /* ignore */ }
        }
        for (const name of savedTableNames) {
          try { alasql(`DROP TABLE IF EXISTS [${name}]`); } catch { /* ignore */ }
        }
      }
    } else {
      // Single-table path (existing logic)
      // Build params array — main data first, then join data
      const hasJoins = this.advancedMode && this.joinData.some(j => j.tabId && j.leftCol && j.rightCol && j.data);
      const params = [data];

      if (hasJoins) {
        // Replace FROM data → FROM ? only if not already using ? syntax from join generation
        if (!/FROM\s+\?/i.test(sql)) {
          sql = sql.replace(/\bFROM\s+data\b/gi, 'FROM ?');
        }
        for (const join of this.joinData) {
          if (join.tabId && join.leftCol && join.rightCol && join.data) {
            params.push(join.data);
          } else if (join.tabId && (!join.data)) {
            // Joined tab has no data — check if tab still exists
            const jTab = this.tabManager.getTab(join.tabId);
            this._dropSavedAlasqlTables(savedTableNames);
            if (!jTab) {
              this._setStatus('Error: A joined tab has been closed.', true);
              return;
            }
            this._setStatus('Error: A joined tab has no parseable data.', true);
            return;
          }
        }
      } else {
        // Basic mode or no joins — replace FROM data → FROM ?
        sql = sql.replace(/\bFROM\s+data\b/gi, 'FROM ?');
      }

      try {
        results = alasql(sql, params);
      } catch (err) {
        this._setStatus(`Error: ${err.message}`, true);
        return;
      } finally {
        for (const name of savedTableNames) {
          try { alasql(`DROP TABLE IF EXISTS [${name}]`); } catch { /* ignore */ }
        }
      }
    }

    const elapsed = (performance.now() - t0).toFixed(1);

    if (!Array.isArray(results)) {
      this._setStatus(`Query returned: ${JSON.stringify(results)} (${elapsed} ms)`);
      this.container.querySelector('#sqp-results').innerHTML = '';
      this.lastResults = null;
      this.container.querySelector('#sqp-export-btn').disabled = true;
      this.container.querySelector('#sqp-save-results-btn').disabled = true;
      this.container.querySelector('#sqp-export-db-btn').disabled = true;
      return;
    }

    this._setStatus(`${results.length} row${results.length !== 1 ? 's' : ''} (${elapsed} ms)`);
    this._renderResults(results);

    this.lastResults = results;
    this.lastColumns = results.length > 0 ? Object.keys(results[0]) : columns;
    this.lastSourceName = tab.title || 'untitled';
    this.lastQuery = this.container.querySelector('#sqp-query').value.trim();
    this.container.querySelector('#sqp-export-btn').disabled = false;
    this.container.querySelector('#sqp-save-results-btn').disabled = false;
    this.container.querySelector('#sqp-export-db-btn').disabled = false;
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
        tr.dataset.lineNum = lineNum;
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

  _dropSavedAlasqlTables(names) {
    for (const name of names) {
      try { alasql(`DROP TABLE IF EXISTS [${name}]`); } catch { /* ignore */ }
    }
  }

  // ── Save as Table ──

  /**
   * Show an inline modal prompt for a table name.
   * Returns a Promise<string|null>.
   */
  _promptTableName(defaultName) {
    return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.className = 'sqp-prompt-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'sqp-prompt-dialog';

      dialog.innerHTML = `
        <div class="sqp-prompt-title">Save as Table</div>
        <label class="sqp-prompt-label">Table name (letters, numbers, underscores):</label>
        <input type="text" class="sqp-prompt-input" value="${defaultName || ''}" />
        <div class="sqp-prompt-error"></div>
        <div class="sqp-prompt-buttons">
          <button class="sqp-prompt-cancel">Cancel</button>
          <button class="sqp-prompt-ok">Save</button>
        </div>
      `;

      overlay.appendChild(dialog);
      this.container.appendChild(overlay);

      const input = dialog.querySelector('.sqp-prompt-input');
      const errorEl = dialog.querySelector('.sqp-prompt-error');
      const okBtn = dialog.querySelector('.sqp-prompt-ok');
      const cancelBtn = dialog.querySelector('.sqp-prompt-cancel');

      input.focus();
      input.select();

      const cleanup = () => overlay.remove();

      const submit = () => {
        const raw = input.value.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
        if (!raw) {
          errorEl.textContent = 'Name cannot be empty.';
          return;
        }
        if (this.savedTables.has(raw)) {
          // Show overwrite confirmation
          errorEl.textContent = '';
          dialog.innerHTML = `
            <div class="sqp-prompt-title">Table "${raw}" already exists</div>
            <div class="sqp-prompt-label">Overwrite it?</div>
            <div class="sqp-prompt-buttons">
              <button class="sqp-prompt-cancel">Cancel</button>
              <button class="sqp-prompt-ok">Overwrite</button>
            </div>
          `;
          dialog.querySelector('.sqp-prompt-cancel').addEventListener('click', () => { cleanup(); resolve(null); });
          dialog.querySelector('.sqp-prompt-ok').addEventListener('click', () => { cleanup(); resolve(raw); });
          dialog.querySelector('.sqp-prompt-ok').focus();
          return;
        }
        cleanup();
        resolve(raw);
      };

      okBtn.addEventListener('click', submit);
      cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') { cleanup(); resolve(null); }
      });
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) { cleanup(); resolve(null); }
      });
    });
  }

  async _saveResultsAsTable() {
    if (!this.lastResults || this.lastResults.length === 0) return;

    const name = await this._promptTableName('results');
    if (!name) return;

    this.savedTables.set(name, { data: this.lastResults, columns: this.lastColumns });
    this._updateTablesRef(this._lastParsedTables);
    this._setStatus(`Saved "${name}" (${this.lastResults.length} rows).`);
  }

  // ── Export to Database Dialog ──

  async _showExportDBDialog() {
    if (!this.lastResults || this.lastResults.length === 0) return;

    // Load last MSSQL config
    let lastConfig = null;
    try { lastConfig = await window.api.getLastMSSQLConfig(); } catch { /* ignore */ }

    const overlay = document.createElement('div');
    overlay.className = 'sqp-prompt-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'sqp-prompt-dialog sqp-export-db-dialog';

    const defaultTable = (this.lastSourceName || 'results')
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/^(\d)/, '_$1') || 'results';

    dialog.innerHTML = `
      <div class="sqp-prompt-title">Export to Database</div>

      <div class="sqp-export-db-type">
        <label><input type="radio" name="sqp-db-type" value="sqlite" checked> SQLite</label>
        <label><input type="radio" name="sqp-db-type" value="mssql"> SQL Server</label>
      </div>

      <label class="sqp-prompt-label">Table name:</label>
      <input type="text" class="sqp-prompt-input sqp-export-table-name" value="${defaultTable}" />

      <div class="sqp-mssql-fields" style="display:none">
        <div class="sqp-export-db-row">
          <label class="sqp-prompt-label">Server:
            <input type="text" class="sqp-prompt-input sqp-mssql-server" value="${lastConfig?.server || 'localhost'}" />
          </label>
          <label class="sqp-prompt-label sqp-port-label">Port:
            <input type="text" class="sqp-prompt-input sqp-mssql-port" value="${lastConfig?.port || '1433'}" />
          </label>
        </div>
        <label class="sqp-prompt-label">Database:
          <input type="text" class="sqp-prompt-input sqp-mssql-database" value="${lastConfig?.database || ''}" />
        </label>
        <label class="sqp-prompt-label">Username:
          <input type="text" class="sqp-prompt-input sqp-mssql-user" value="${lastConfig?.user || 'sa'}" />
        </label>
        <label class="sqp-prompt-label">Password:
          <input type="password" class="sqp-prompt-input sqp-mssql-password" value="" />
        </label>
        <label class="sqp-export-db-checkbox">
          <input type="checkbox" class="sqp-mssql-trust" ${lastConfig?.trustServerCertificate !== false ? 'checked' : ''}>
          Trust server certificate
        </label>
        <div class="sqp-export-db-test-row">
          <button class="sqp-test-conn-btn">Test Connection</button>
          <span class="sqp-test-conn-status"></span>
        </div>
      </div>

      <div class="sqp-prompt-error"></div>
      <div class="sqp-prompt-buttons">
        <button class="sqp-prompt-cancel">Cancel</button>
        <button class="sqp-prompt-ok">Export</button>
      </div>
    `;

    overlay.appendChild(dialog);
    this.container.appendChild(overlay);

    const tableNameInput = dialog.querySelector('.sqp-export-table-name');
    const mssqlFields = dialog.querySelector('.sqp-mssql-fields');
    const errorEl = dialog.querySelector('.sqp-prompt-error');
    const okBtn = dialog.querySelector('.sqp-prompt-ok');
    const cancelBtn = dialog.querySelector('.sqp-prompt-cancel');
    const testBtn = dialog.querySelector('.sqp-test-conn-btn');
    const testStatus = dialog.querySelector('.sqp-test-conn-status');
    const radios = dialog.querySelectorAll('input[name="sqp-db-type"]');

    tableNameInput.focus();
    tableNameInput.select();

    // Toggle MSSQL fields visibility
    for (const radio of radios) {
      radio.addEventListener('change', () => {
        const isMSSQL = dialog.querySelector('input[name="sqp-db-type"]:checked').value === 'mssql';
        mssqlFields.style.display = isMSSQL ? '' : 'none';
        errorEl.textContent = '';
        testStatus.textContent = '';
        testStatus.className = 'sqp-test-conn-status';
      });
    }

    // Test Connection
    testBtn.addEventListener('click', async () => {
      testStatus.textContent = 'Connecting...';
      testStatus.className = 'sqp-test-conn-status sqp-test-pending';
      testBtn.disabled = true;

      const config = this._getMSSQLConfigFromDialog(dialog);
      try {
        const result = await window.api.testMSSQLConnection(config);
        if (result.success) {
          testStatus.textContent = 'Connected';
          testStatus.className = 'sqp-test-conn-status sqp-test-success';
        } else {
          testStatus.textContent = result.error || 'Failed';
          testStatus.className = 'sqp-test-conn-status sqp-test-error';
        }
      } catch (err) {
        testStatus.textContent = err.message || 'Failed';
        testStatus.className = 'sqp-test-conn-status sqp-test-error';
      }
      testBtn.disabled = false;
    });

    const cleanup = () => overlay.remove();

    // Cancel
    cancelBtn.addEventListener('click', cleanup);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(); });

    // Escape key
    const onKeydown = (e) => {
      if (e.key === 'Escape') { cleanup(); }
    };
    dialog.addEventListener('keydown', onKeydown);

    // Export
    okBtn.addEventListener('click', async () => {
      const tableName = tableNameInput.value.trim().replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
      if (!tableName) {
        errorEl.textContent = 'Table name cannot be empty.';
        return;
      }

      const dbType = dialog.querySelector('input[name="sqp-db-type"]:checked').value;
      errorEl.textContent = '';
      okBtn.disabled = true;
      okBtn.textContent = 'Exporting...';

      const columns = this.lastColumns;
      const rows = this.lastResults;

      try {
        let result;
        if (dbType === 'sqlite') {
          result = await window.api.exportToSQLite({ tableName, columns, rows });
          if (result.canceled) {
            okBtn.disabled = false;
            okBtn.textContent = 'Export';
            return;
          }
        } else {
          const config = this._getMSSQLConfigFromDialog(dialog);
          // Save config (without password)
          try { await window.api.saveLastMSSQLConfig(config); } catch { /* ignore */ }
          result = await window.api.exportToMSSQL({ config, tableName, columns, rows });
        }

        if (result.success) {
          this._setStatus(`Exported ${result.rowCount} rows to ${dbType === 'sqlite' ? 'SQLite' : 'SQL Server'} table "${tableName}".`);
          cleanup();
        } else {
          errorEl.textContent = result.error || 'Export failed.';
          okBtn.disabled = false;
          okBtn.textContent = 'Export';
        }
      } catch (err) {
        errorEl.textContent = err.message || 'Export failed.';
        okBtn.disabled = false;
        okBtn.textContent = 'Export';
      }
    });
  }

  _getMSSQLConfigFromDialog(dialog) {
    return {
      server: dialog.querySelector('.sqp-mssql-server').value.trim(),
      port: dialog.querySelector('.sqp-mssql-port').value.trim(),
      database: dialog.querySelector('.sqp-mssql-database').value.trim(),
      user: dialog.querySelector('.sqp-mssql-user').value.trim(),
      password: dialog.querySelector('.sqp-mssql-password').value,
      trustServerCertificate: dialog.querySelector('.sqp-mssql-trust').checked,
    };
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
