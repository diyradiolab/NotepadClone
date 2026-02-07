/**
 * Table viewer for CSV, TSV, JSON (array of objects), and XML (repeating elements).
 * Mirrors MarkdownPreview pattern: renders into editorContainer, toggled via toolbar.
 */

// ── Public helpers (used by index.js for file detection) ──

export function isTableFile(filename) {
  if (!filename) return false;
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return true;
  if (lower.endsWith('.json') || lower.endsWith('.xml')) return 'maybe';
  return false;
}

export function isTableJSON(content) {
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null;
  } catch {
    return false;
  }
}

export function isTableXML(content) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'application/xml');
    if (doc.querySelector('parsererror')) return false;
    const root = doc.documentElement;
    const children = Array.from(root.children);
    if (children.length < 2) return false;
    const firstName = children[0].tagName;
    const repeating = children.filter(c => c.tagName === firstName);
    return repeating.length >= 2;
  } catch {
    return false;
  }
}

// ── TableViewer class ──

export class TableViewer {
  constructor(container) {
    this.container = container;
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.headers = [];
    this.rows = [];
    this.sourceLineMap = []; // row index → source line number
    this.sortCol = -1;
    this.sortAsc = true;
    this.type = '';
    this._rowClickCb = null;
  }

  onRowClick(callback) {
    this._rowClickCb = callback;
  }

  render(content, filename) {
    const lower = (filename || '').toLowerCase();
    let result = null;

    if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
      result = this._parseCSV(content, filename);
    } else if (lower.endsWith('.json')) {
      result = this._parseJSON(content);
    } else if (lower.endsWith('.xml')) {
      result = this._parseXML(content);
    }

    if (!result) {
      this.container.innerHTML = '<div class="tv-content"><div class="tv-status">Could not parse as table</div></div>';
      return;
    }

    this.headers = result.headers;
    this.rows = result.rows;
    this.sourceLineMap = result.sourceLineMap || [];
    this.type = result.type;
    this.sortCol = -1;
    this.sortAsc = true;
    this._renderTable();
  }

  _parseCSV(content, filename) {
    const lower = (filename || '').toLowerCase();
    // Auto-detect delimiter: check first line for tab, semicolon, pipe, or default comma
    const firstLine = content.split('\n', 1)[0];
    let delimiter = ',';
    if (lower.endsWith('.tsv')) {
      delimiter = '\t';
    } else if (firstLine.includes('\t') && !firstLine.includes(',')) {
      delimiter = '\t';
    } else if (firstLine.includes(';') && !firstLine.includes(',')) {
      delimiter = ';';
    } else if (firstLine.includes('|') && !firstLine.includes(',')) {
      delimiter = '|';
    }

    const rows = this._parseCSVRows(content, delimiter);
    if (rows.length === 0) return null;

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Build source line map — CSV lines account for quoted multiline fields
    const sourceLineMap = this._buildCSVLineMap(content, delimiter);

    return { headers, rows: dataRows, type: `CSV (${this._delimName(delimiter)})`, sourceLineMap };
  }

  _delimName(d) {
    if (d === '\t') return 'tab';
    if (d === ';') return 'semicolon';
    if (d === '|') return 'pipe';
    return 'comma';
  }

  _parseCSVRows(content, delimiter) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    let i = 0;

    while (i < content.length) {
      const ch = content[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < content.length && content[i + 1] === '"') {
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
          row.push(field);
          field = '';
          i++;
        } else if (ch === '\r') {
          // skip \r, newline handled by \n
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

  _buildCSVLineMap(content, delimiter) {
    // Walk through to find which source line each data row starts on
    const lineMap = [];
    let currentLine = 1; // header is line 1
    let inQuotes = false;
    let rowIndex = -1; // -1 = header

    // Start at line 2 for first data row
    currentLine = 1;
    let fieldCount = 0;
    const firstLineFields = this._parseCSVRows(content.split('\n', 1)[0], delimiter);

    // Simpler approach: walk character by character tracking line numbers
    const map = [];
    let line = 1;
    let inQ = false;
    let rowStart = 1;
    let isHeader = true;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (inQ) {
        if (ch === '"') {
          if (i + 1 < content.length && content[i + 1] === '"') {
            i++;
          } else {
            inQ = false;
          }
        } else if (ch === '\n') {
          line++;
        }
      } else {
        if (ch === '"') {
          inQ = true;
        } else if (ch === '\n') {
          if (isHeader) {
            isHeader = false;
          } else {
            map.push(rowStart);
          }
          line++;
          rowStart = line;
        }
      }
    }
    // Last row if no trailing newline
    if (!isHeader && rowStart <= line) {
      // Check there's content after last newline
      const lastNewline = content.lastIndexOf('\n');
      if (lastNewline < content.length - 1) {
        map.push(rowStart);
      }
    }

    return map;
  }

  _parseJSON(content) {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;

      // Union all keys for headers
      const keySet = new Set();
      for (const obj of parsed) {
        if (typeof obj !== 'object' || obj === null) return null;
        Object.keys(obj).forEach(k => keySet.add(k));
      }
      const headers = Array.from(keySet);

      const rows = parsed.map(obj =>
        headers.map(h => {
          const val = obj[h];
          if (val === undefined || val === null) return '';
          if (typeof val === 'object') return JSON.stringify(val);
          return String(val);
        })
      );

      // Build approximate line map for JSON array elements
      const sourceLineMap = this._buildJSONLineMap(content, parsed.length);

      return { headers, rows, type: 'JSON', sourceLineMap };
    } catch {
      return null;
    }
  }

  _buildJSONLineMap(content, count) {
    // Find approximate line numbers for each array element by searching for object starts
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
        if (depth === 1 && ch === '{') {
          map.push(line);
        }
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) break; // end of array
      }
    }

    return map;
  }

  _parseXML(content) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'application/xml');
      if (doc.querySelector('parsererror')) return null;

      const root = doc.documentElement;
      const children = Array.from(root.children);
      if (children.length < 2) return null;

      // Find repeating tag name
      const firstName = children[0].tagName;
      const repeating = children.filter(c => c.tagName === firstName);
      if (repeating.length < 2) return null;

      // Extract columns from child element tag names
      const keySet = new Set();
      for (const el of repeating) {
        Array.from(el.children).forEach(child => keySet.add(child.tagName));
      }
      const headers = Array.from(keySet);

      const rows = repeating.map(el => {
        return headers.map(h => {
          const child = el.querySelector(h);
          return child ? child.textContent : '';
        });
      });

      // Build line map by searching for opening tags
      const sourceLineMap = this._buildXMLLineMap(content, firstName);

      return { headers, rows, type: 'XML', sourceLineMap };
    } catch {
      return null;
    }
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

  _renderTable() {
    const wrapper = document.createElement('div');
    wrapper.className = 'tv-content';

    // Status bar
    const status = document.createElement('div');
    status.className = 'tv-status';
    status.textContent = `${this.type} \u2014 ${this.rows.length} row${this.rows.length !== 1 ? 's' : ''}, ${this.headers.length} column${this.headers.length !== 1 ? 's' : ''}`;
    wrapper.appendChild(status);

    // Table
    const table = document.createElement('table');
    table.className = 'tv-table';

    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    // Row number column
    const thNum = document.createElement('th');
    thNum.className = 'tv-col-rownum';
    thNum.textContent = '#';
    headerRow.appendChild(thNum);

    this.headers.forEach((h, colIdx) => {
      const th = document.createElement('th');
      th.textContent = h;
      const indicator = document.createElement('span');
      indicator.className = 'tv-sort-indicator';
      if (colIdx === this.sortCol) {
        indicator.classList.add('tv-sort-active');
        indicator.textContent = this.sortAsc ? ' \u25B2' : ' \u25BC';
      }
      th.appendChild(indicator);
      th.addEventListener('click', () => this._sort(colIdx));
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    this.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr');
      tr.className = rowIdx % 2 === 0 ? 'tv-row-even' : 'tv-row-odd';

      // Row number
      const tdNum = document.createElement('td');
      tdNum.className = 'tv-col-rownum';
      tdNum.textContent = rowIdx + 1;
      tr.appendChild(tdNum);

      // Pad row to header length
      for (let c = 0; c < this.headers.length; c++) {
        const td = document.createElement('td');
        td.textContent = row[c] !== undefined ? row[c] : '';
        tr.appendChild(td);
      }

      // Row click → jump to source line
      tr.addEventListener('click', () => {
        const sourceLine = this.sourceLineMap[rowIdx];
        if (sourceLine && this._rowClickCb) {
          this._rowClickCb(sourceLine);
        }
      });

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);

    this.container.innerHTML = '';
    this.container.appendChild(wrapper);

    // Restore scroll position
    wrapper.scrollTop = this.scrollTop;
    wrapper.scrollLeft = this.scrollLeft;
  }

  _sort(colIdx) {
    if (this.sortCol === colIdx) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortCol = colIdx;
      this.sortAsc = true;
    }

    // Pair rows with their original indices so sourceLineMap stays correct
    const paired = this.rows.map((row, i) => ({ row, lineIdx: i }));

    paired.sort((a, b) => {
      const aVal = a.row[colIdx] !== undefined ? a.row[colIdx] : '';
      const bVal = b.row[colIdx] !== undefined ? b.row[colIdx] : '';

      // Numeric-aware sort
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!isNaN(aNum) && !isNaN(bNum) && aVal !== '' && bVal !== '') {
        return this.sortAsc ? aNum - bNum : bNum - aNum;
      }

      const cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
      return this.sortAsc ? cmp : -cmp;
    });

    this.rows = paired.map(p => p.row);
    // Rebuild sourceLineMap to match new order
    const origMap = this.sourceLineMap;
    this.sourceLineMap = paired.map(p => origMap[p.lineIdx]);

    this._saveScrollPosition();
    this._renderTable();
  }

  _saveScrollPosition() {
    const wrapper = this.container.querySelector('.tv-content');
    if (wrapper) {
      this.scrollTop = wrapper.scrollTop;
      this.scrollLeft = wrapper.scrollLeft;
    }
  }

  destroy() {
    this._saveScrollPosition();
    this.container.innerHTML = '';
  }
}
