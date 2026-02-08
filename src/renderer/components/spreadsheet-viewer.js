/**
 * Spreadsheet viewer wrapping Jspreadsheet CE v5.
 * Supports blank spreadsheets (New Spreadsheet) and CSV/TSV editing.
 */
import jspreadsheet from 'jspreadsheet-ce';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import 'jsuites/dist/jsuites.css';

export class SpreadsheetViewer {
  constructor(container) {
    this.container = container;
    this.worksheets = null; // v5 returns array of worksheet instances
    this._onChangeCb = null;
    this._wrapper = null;
    this._formulaBar = null;
    this._cellRef = null;
    this._formulaInput = null;
    this._selectedCell = null; // { x, y }
  }

  /**
   * Render a spreadsheet from CSV text (or blank).
   * @param {string} csvContent - CSV text, or empty/null for blank sheet
   */
  render(csvContent) {
    this.destroy();

    this.container.innerHTML = '';

    // Formula bar
    this._formulaBar = this._createFormulaBar();
    this.container.appendChild(this._formulaBar);

    const wrapper = document.createElement('div');
    wrapper.className = 'spreadsheet-wrapper';
    this.container.appendChild(wrapper);
    this._wrapper = wrapper;

    let data;
    let columns;
    if (csvContent && csvContent.trim()) {
      const parsed = this._parseCSV(csvContent);
      const headers = parsed[0] || [];
      data = parsed.slice(1);
      // Ensure all rows have same number of columns as headers
      data = data.map(row => {
        while (row.length < headers.length) row.push('');
        return row;
      });
      columns = headers.map(h => ({ type: 'text', title: h, width: 120 }));
    } else {
      // Blank spreadsheet: 26 columns (A-Z), 50 rows
      data = Array.from({ length: 50 }, () => Array(26).fill(''));
      columns = Array.from({ length: 26 }, (_, i) => ({
        type: 'text',
        title: String.fromCharCode(65 + i),
        width: 100,
      }));
    }

    // jspreadsheet needs pixel dimensions — percentage doesn't resolve
    const containerHeight = this.container.clientHeight || 600;
    const containerWidth = this.container.clientWidth || 800;
    const formulaBarHeight = this._formulaBar ? this._formulaBar.offsetHeight || 34 : 34;

    // v5 API: config uses worksheets array, returns worksheet instances array
    this.worksheets = jspreadsheet(wrapper, {
      worksheets: [{
        data,
        columns,
        minDimensions: [columns.length, Math.max(data.length, 50)],
        minSpareRows: 5,
        minSpareCols: 0,
        tableOverflow: true,
        tableWidth: `${containerWidth}px`,
        tableHeight: `${containerHeight - formulaBarHeight}px`,
        parseFormulas: true,
        columnSorting: true,
        columnResize: true,
        rowResize: true,
        allowInsertRow: true,
        allowDeleteRow: true,
        allowInsertColumn: true,
        allowDeleteColumn: true,
      }],
      contextMenu: true,
      onafterchanges: () => {
        this._notifyChange();
        this._updateFormulaInput();
      },
      oninsertrow: () => this._notifyChange(),
      ondeleterow: () => this._notifyChange(),
      oninsertcolumn: () => this._notifyChange(),
      ondeletecolumn: () => this._notifyChange(),
      onsort: () => this._notifyChange(),
      onmoverow: () => this._notifyChange(),
      onselection: (el, borderLeft, borderTop, borderRight, borderBottom, origin) => {
        // borderLeft = startCol, borderTop = startRow
        this._selectedCell = { x: borderLeft, y: borderTop };
        this._updateFormulaBar(borderLeft, borderTop);
      },
    });
  }

  /** Get the active worksheet (first one) */
  _ws() {
    return this.worksheets && this.worksheets[0] ? this.worksheets[0] : null;
  }

  /** Convert column index (0-based) to letter(s): 0→A, 25→Z, 26→AA */
  _colName(x) {
    let name = '';
    let n = x;
    while (n >= 0) {
      name = String.fromCharCode(65 + (n % 26)) + name;
      n = Math.floor(n / 26) - 1;
    }
    return name;
  }

  _createFormulaBar() {
    const bar = document.createElement('div');
    bar.className = 'ss-formula-bar';

    // Cell reference label
    const cellRef = document.createElement('div');
    cellRef.className = 'ss-formula-cell-ref';
    cellRef.textContent = 'A1';
    this._cellRef = cellRef;

    // Separator
    const sep = document.createElement('div');
    sep.className = 'ss-formula-sep';

    // fx label
    const fxLabel = document.createElement('span');
    fxLabel.className = 'ss-formula-fx';
    fxLabel.textContent = 'fx';

    // Formula input
    const input = document.createElement('input');
    input.className = 'ss-formula-input';
    input.type = 'text';
    input.spellcheck = false;
    this._formulaInput = input;

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._applyFormulaInput();
        // Return focus to spreadsheet
        const ws = this._ws();
        if (ws && ws.element) ws.element.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this._updateFormulaInput(); // revert
        const ws = this._ws();
        if (ws && ws.element) ws.element.focus();
      }
    });

    input.addEventListener('blur', () => {
      this._applyFormulaInput();
    });

    // Function buttons — primary buttons + grouped dropdowns
    const funcs = document.createElement('div');
    funcs.className = 'ss-formula-funcs';

    // Primary buttons (always visible)
    const primaryFuncs = [
      { label: 'SUM', formula: 'SUM(', tip: '=SUM(A1:A10)' },
      { label: 'AVG', formula: 'AVERAGE(', tip: '=AVERAGE(A1:A10)' },
      { label: 'IF', formula: 'IF(', tip: '=IF(A1>0,"Yes","No")' },
    ];

    for (const fn of primaryFuncs) {
      const btn = document.createElement('button');
      btn.className = 'ss-formula-func-btn';
      btn.textContent = fn.label;
      btn.title = fn.tip;
      btn.addEventListener('click', () => this._insertFunction(fn.formula));
      funcs.appendChild(btn);
    }

    // Grouped dropdown menus
    const groups = [
      { label: 'Math', items: [
        { label: 'MIN', formula: 'MIN(', tip: '=MIN(A1:A10)' },
        { label: 'MAX', formula: 'MAX(', tip: '=MAX(A1:A10)' },
        { label: 'ROUND', formula: 'ROUND(', tip: '=ROUND(A1,2)' },
        { label: 'ABS', formula: 'ABS(', tip: '=ABS(A1)' },
        { label: 'SQRT', formula: 'SQRT(', tip: '=SQRT(A1)' },
      ]},
      { label: 'Stats', items: [
        { label: 'COUNT', formula: 'COUNT(', tip: '=COUNT(A1:A10)' },
        { label: 'COUNTA', formula: 'COUNTA(', tip: '=COUNTA(A1:A10)' },
        { label: 'SUMIF', formula: 'SUMIF(', tip: '=SUMIF(A1:A10,">5")' },
        { label: 'COUNTIF', formula: 'COUNTIF(', tip: '=COUNTIF(A1:A10,">0")' },
      ]},
      { label: 'Text', items: [
        { label: 'CONCAT', formula: 'CONCATENATE(', tip: '=CONCATENATE(A1,B1)' },
        { label: 'UPPER', formula: 'UPPER(', tip: '=UPPER(A1)' },
        { label: 'LOWER', formula: 'LOWER(', tip: '=LOWER(A1)' },
        { label: 'TRIM', formula: 'TRIM(', tip: '=TRIM(A1)' },
        { label: 'LEN', formula: 'LEN(', tip: '=LEN(A1)' },
      ]},
    ];

    for (const group of groups) {
      const dropdown = document.createElement('div');
      dropdown.className = 'ss-formula-dropdown';

      const trigger = document.createElement('button');
      trigger.className = 'ss-formula-func-btn ss-formula-dropdown-trigger';
      trigger.textContent = group.label + ' \u25BE';
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close any other open dropdown
        funcs.querySelectorAll('.ss-formula-dropdown-menu.open').forEach(m => {
          if (m !== menu) m.classList.remove('open');
        });
        menu.classList.toggle('open');
      });

      const menu = document.createElement('div');
      menu.className = 'ss-formula-dropdown-menu';

      for (const fn of group.items) {
        const item = document.createElement('button');
        item.className = 'ss-formula-dropdown-item';
        item.textContent = fn.label;
        item.title = fn.tip;
        item.addEventListener('click', () => {
          this._insertFunction(fn.formula);
          menu.classList.remove('open');
        });
        menu.appendChild(item);
      }

      dropdown.appendChild(trigger);
      dropdown.appendChild(menu);
      funcs.appendChild(dropdown);
    }

    // Close dropdowns on outside click
    document.addEventListener('click', () => {
      funcs.querySelectorAll('.ss-formula-dropdown-menu.open').forEach(m => m.classList.remove('open'));
    });

    bar.appendChild(cellRef);
    bar.appendChild(sep);
    bar.appendChild(fxLabel);
    bar.appendChild(input);
    bar.appendChild(funcs);

    return bar;
  }

  /** Update formula bar when a cell is selected */
  _updateFormulaBar(x, y) {
    if (this._cellRef) {
      this._cellRef.textContent = `${this._colName(x)}${y + 1}`;
    }
    this._updateFormulaInput();
  }

  /** Sync formula input with current selected cell value */
  _updateFormulaInput() {
    const ws = this._ws();
    if (!ws || !this._selectedCell || !this._formulaInput) return;
    const { x, y } = this._selectedCell;
    const val = ws.getValueFromCoords(x, y);
    this._formulaInput.value = val != null ? String(val) : '';
  }

  /** Apply formula input value to the selected cell */
  _applyFormulaInput() {
    const ws = this._ws();
    if (!ws || !this._selectedCell || !this._formulaInput) return;
    const { x, y } = this._selectedCell;
    const currentVal = ws.getValueFromCoords(x, y);
    const newVal = this._formulaInput.value;
    if (String(currentVal ?? '') !== newVal) {
      ws.setValueFromCoords(x, y, newVal);
    }
  }

  /** Insert a function template into the formula input */
  _insertFunction(formulaPrefix) {
    if (!this._formulaInput || !this._selectedCell) return;
    const ws = this._ws();
    if (!ws) return;

    const { x, y } = this._selectedCell;
    const formula = '=' + formulaPrefix + ')';
    this._formulaInput.value = formula;
    this._formulaInput.focus();
    // Place cursor before the closing paren
    const pos = formula.length - 1;
    this._formulaInput.setSelectionRange(pos, pos);
  }

  _notifyChange() {
    if (this._onChangeCb) {
      this._onChangeCb(this.toCSV());
    }
  }

  onChange(callback) {
    this._onChangeCb = callback;
  }

  /**
   * Serialize current spreadsheet state to CSV text.
   * Formulas are resolved to computed values.
   */
  toCSV() {
    const ws = this._ws();
    if (!ws) return '';

    // getHeaders returns comma-separated string in v5
    const headerStr = ws.getHeaders();
    const headers = headerStr ? headerStr.split(',') : [];
    const data = ws.getData();

    // Trim trailing empty rows
    let lastNonEmpty = data.length - 1;
    while (lastNonEmpty >= 0) {
      const row = data[lastNonEmpty];
      if (row.some(cell => cell != null && String(cell) !== '')) break;
      lastNonEmpty--;
    }
    const trimmedData = data.slice(0, lastNonEmpty + 1);

    const rows = [headers, ...trimmedData];
    return rows.map(row =>
      row.map(cell => {
        const val = (cell == null) ? '' : String(cell);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',')
    ).join('\n');
  }

  destroy() {
    const ws = this._ws();
    if (ws && ws.parent) {
      try { ws.parent.destroy(); } catch (_) { /* ignore */ }
    }
    this.worksheets = null;
    this._onChangeCb = null;
    this._wrapper = null;
    this._formulaBar = null;
    this._cellRef = null;
    this._formulaInput = null;
    this._selectedCell = null;
    this.container.innerHTML = '';
  }

  /**
   * RFC 4180 CSV parser. Returns 2D array of strings.
   */
  _parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;

    while (i < text.length) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
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
        } else if (ch === ',') {
          row.push(field);
          field = '';
          i++;
        } else if (ch === '\r') {
          i++;
        } else if (ch === '\n') {
          row.push(field);
          field = '';
          rows.push(row);
          row = [];
          i++;
        } else {
          field += ch;
          i++;
        }
      }
    }

    // Last field/row
    if (field || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    // Remove trailing empty row
    if (rows.length > 0) {
      const last = rows[rows.length - 1];
      if (last.length === 1 && last[0] === '') rows.pop();
    }

    return rows;
  }
}
