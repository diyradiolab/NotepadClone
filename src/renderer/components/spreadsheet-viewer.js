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
  }

  /**
   * Render a spreadsheet from CSV text (or blank).
   * @param {string} csvContent - CSV text, or empty/null for blank sheet
   */
  render(csvContent) {
    this.destroy();

    const wrapper = document.createElement('div');
    wrapper.className = 'spreadsheet-wrapper';
    this.container.innerHTML = '';
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
        tableHeight: `${containerHeight}px`,
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
      onafterchanges: () => this._notifyChange(),
      oninsertrow: () => this._notifyChange(),
      ondeleterow: () => this._notifyChange(),
      oninsertcolumn: () => this._notifyChange(),
      ondeletecolumn: () => this._notifyChange(),
      onsort: () => this._notifyChange(),
      onmoverow: () => this._notifyChange(),
    });
  }

  /** Get the active worksheet (first one) */
  _ws() {
    return this.worksheets && this.worksheets[0] ? this.worksheets[0] : null;
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
