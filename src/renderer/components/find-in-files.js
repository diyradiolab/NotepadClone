import { escapeHtml } from '../utils/escape-html';

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * FindInFiles provides a unified search panel at the bottom of the window.
 * Supports two scopes:
 *   - Document: searches the current editor tab (default, Ctrl+F)
 *   - Directory: searches all files in a directory (Ctrl+Shift+F)
 */
export class FindInFiles {
  constructor(container, editorManager, tabManager) {
    this.container = container;
    this.editorManager = editorManager;
    this.tabManager = tabManager;
    this.searchDir = null;
    this.scope = 'document';
    this.onResultClickCallbacks = [];
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="fif-resize-handle" id="fif-resize-handle"></div>
      <div class="fif-header panel-header">
        <span class="fif-title" id="fif-title">FIND</span>
        <button class="fif-close-btn panel-btn" title="Close">\u00D7</button>
      </div>
      <div class="fif-search-bar">
        <div class="fif-scope-bar">
          <button class="fif-scope-btn fif-scope-active" id="fif-scope-doc">Document</button>
          <button class="fif-scope-btn" id="fif-scope-dir">Directory</button>
        </div>
        <input type="text" class="fif-input" id="fif-query" placeholder="Search text..." />
        <label class="fif-option"><input type="checkbox" id="fif-regex"> Regex</label>
        <label class="fif-option"><input type="checkbox" id="fif-case"> Match Case</label>
        <button class="fif-search-btn" id="fif-search-btn">Search</button>
      </div>
      <div class="fif-search-bar fif-search-row2 hidden" id="fif-row2">
        <input type="text" class="fif-input fif-dir-input" id="fif-dir" placeholder="Search directory..." readonly />
        <button class="fif-browse-btn" id="fif-browse-btn" title="Browse folder">\uD83D\uDCC1</button>
        <input type="text" class="fif-input fif-filter-input" id="fif-filter" placeholder="*.js, *.ts" title="File filter (comma-separated globs)" />
        <input type="number" class="fif-input fif-depth-input" id="fif-depth" placeholder="\u221E" min="1" title="Max depth (empty = unlimited)" />
      </div>
      <div class="fif-status" id="fif-status"></div>
      <div class="fif-results" id="fif-results"></div>
    `;

    this.container.querySelector('.fif-close-btn').addEventListener('click', () => this.hide());

    const queryInput = this.container.querySelector('#fif-query');
    const searchBtn = this.container.querySelector('#fif-search-btn');
    const browseBtn = this.container.querySelector('#fif-browse-btn');

    searchBtn.addEventListener('click', () => this._doSearch());
    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._doSearch();
      if (e.key === 'Escape') this.hide();
    });

    // Allow Enter in filter/depth to trigger search
    this.container.querySelector('#fif-filter').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._doSearch();
      if (e.key === 'Escape') this.hide();
    });
    this.container.querySelector('#fif-depth').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._doSearch();
      if (e.key === 'Escape') this.hide();
    });

    this._initResize();

    browseBtn.addEventListener('click', async () => {
      const folder = await window.api.pickFolder();
      if (folder) {
        this.searchDir = folder;
        this.container.querySelector('#fif-dir').value = folder;
      }
    });

    // Scope toggle handlers
    const scopeDocBtn = this.container.querySelector('#fif-scope-doc');
    const scopeDirBtn = this.container.querySelector('#fif-scope-dir');

    scopeDocBtn.addEventListener('click', () => this._setScope('document'));
    scopeDirBtn.addEventListener('click', () => this._setScope('directory'));

    // Delegated click handler for results (file headers + result lines)
    this.container.querySelector('#fif-results').addEventListener('click', (e) => {
      // Collapse toggle on file header
      const header = e.target.closest('.fif-file-header');
      if (header) {
        const group = header.closest('.fif-file-group');
        if (group) {
          group.classList.toggle('collapsed');
          const icon = header.querySelector('.fif-collapse-icon');
          icon.textContent = group.classList.contains('collapsed') ? '\u25B6' : '\u25BC';
        }
        return;
      }
      // Result line click — jump to file/line
      const line = e.target.closest('.fif-result-line');
      if (line) {
        const lineNum = parseInt(line.dataset.line, 10);
        const filePath = line.dataset.path || null;
        this.onResultClickCallbacks.forEach(cb => cb(filePath, lineNum));
      }
    });
  }

  _setScope(scope) {
    if (scope === this.scope) return;
    this.scope = scope;
    const scopeDocBtn = this.container.querySelector('#fif-scope-doc');
    const scopeDirBtn = this.container.querySelector('#fif-scope-dir');
    const row2 = this.container.querySelector('#fif-row2');
    const title = this.container.querySelector('#fif-title');
    const resultsEl = this.container.querySelector('#fif-results');

    if (scope === 'document') {
      scopeDocBtn.classList.add('fif-scope-active');
      scopeDirBtn.classList.remove('fif-scope-active');
      row2.classList.add('hidden');
      title.textContent = 'FIND';
    } else {
      scopeDirBtn.classList.add('fif-scope-active');
      scopeDocBtn.classList.remove('fif-scope-active');
      row2.classList.remove('hidden');
      title.textContent = 'FIND IN FILES';
    }

    // Clear results on scope switch, preserve query
    resultsEl.innerHTML = '';
    this._setStatus('');
  }

  async _doSearch() {
    if (this.scope === 'document') {
      this._searchCurrentDocument();
    } else {
      await this._searchDirectory();
    }
  }

  _searchCurrentDocument() {
    const query = this.container.querySelector('#fif-query').value.trim();
    if (!query) return;

    const tabId = this.tabManager.getActiveTabId();
    if (!tabId) {
      this._setStatus('No document open');
      return;
    }

    const content = this.editorManager.getContent(tabId);
    if (content === null || content === undefined) {
      this._setStatus('No document open');
      return;
    }

    const useRegex = this.container.querySelector('#fif-regex').checked;
    const caseSensitive = this.container.querySelector('#fif-case').checked;
    const resultsEl = this.container.querySelector('#fif-results');
    resultsEl.innerHTML = '';

    // Build search pattern
    let pattern;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      pattern = useRegex
        ? new RegExp(query, flags)
        : new RegExp(escapeRegex(query), flags);
    } catch (e) {
      this._setStatus(`Invalid regex: ${e.message}`);
      return;
    }

    // Search line by line
    const lines = content.split('\n');
    const matches = [];
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      if (pattern.test(lines[i])) {
        matches.push({ line: i + 1, text: lines[i] });
      }
    }

    const statusText = `${matches.length} match${matches.length !== 1 ? 'es' : ''} in current document`;
    this._setStatus(statusText);

    if (matches.length === 0) return;

    // Render results — no file grouping needed for single document
    const tab = this.tabManager.getTab(tabId);
    const docName = tab ? tab.title : 'Current Document';

    const fileEl = document.createElement('div');
    fileEl.className = 'fif-file-group';

    const headerEl = document.createElement('div');
    headerEl.className = 'fif-file-header';
    headerEl.innerHTML = `<span class="fif-collapse-icon">\u25BC</span> ${escapeHtml(docName)} (${matches.length})`;
    fileEl.appendChild(headerEl);

    const linesContainer = document.createElement('div');
    linesContainer.className = 'fif-file-lines';

    for (const match of matches) {
      const lineEl = document.createElement('div');
      lineEl.className = 'fif-result-line';
      lineEl.dataset.line = match.line;

      const lineNumSpan = `<span class="fif-line-num">${match.line}:</span> `;
      const highlightedText = this._highlightMatches(match.text, pattern);
      lineEl.innerHTML = lineNumSpan + highlightedText;

      linesContainer.appendChild(lineEl);
    }

    fileEl.appendChild(linesContainer);
    resultsEl.appendChild(fileEl);
  }

  async _searchDirectory() {
    const query = this.container.querySelector('#fif-query').value.trim();
    if (!query) return;

    // Use the directory field if set, otherwise fall back to the default searchDir
    const dirInput = this.container.querySelector('#fif-dir').value.trim();
    const searchDir = dirInput || this.searchDir;

    if (!searchDir) {
      this._setStatus('No folder open. Use File > Open Folder or browse for a folder.');
      return;
    }

    const useRegex = this.container.querySelector('#fif-regex').checked;
    const caseSensitive = this.container.querySelector('#fif-case').checked;
    const fileFilter = this.container.querySelector('#fif-filter').value.trim();
    const depthVal = this.container.querySelector('#fif-depth').value.trim();
    const maxDepth = depthVal ? parseInt(depthVal, 10) : null;
    const resultsEl = this.container.querySelector('#fif-results');

    this._setStatus('Searching...');
    resultsEl.innerHTML = '';

    const { results, truncated, error } = await window.api.searchInFiles(
      searchDir, query, useRegex, caseSensitive, fileFilter || null, maxDepth
    );

    if (error) {
      this._setStatus(`Error: ${error}`);
      return;
    }

    const statusText = `${results.length} match${results.length !== 1 ? 'es' : ''}${truncated ? ' (results truncated)' : ''}`;
    this._setStatus(statusText);

    // Build regex for highlighting matches in results
    let highlightPattern;
    try {
      const flags = caseSensitive ? 'g' : 'gi';
      highlightPattern = useRegex
        ? new RegExp(query, flags)
        : new RegExp(escapeRegex(query), flags);
    } catch {
      highlightPattern = null;
    }

    // Group by file
    const grouped = new Map();
    for (const r of results) {
      if (!grouped.has(r.filePath)) grouped.set(r.filePath, []);
      grouped.get(r.filePath).push(r);
    }

    for (const [filePath, matches] of grouped) {
      const fileEl = document.createElement('div');
      fileEl.className = 'fif-file-group';

      const shortPath = searchDir
        ? filePath.replace(searchDir, '').replace(/^[/\\]/, '')
        : filePath;

      const headerEl = document.createElement('div');
      headerEl.className = 'fif-file-header';
      headerEl.innerHTML = `<span class="fif-collapse-icon">\u25BC</span> ${escapeHtml(shortPath)} (${matches.length})`;
      fileEl.appendChild(headerEl);

      const linesContainer = document.createElement('div');
      linesContainer.className = 'fif-file-lines';

      for (const match of matches) {
        const lineEl = document.createElement('div');
        lineEl.className = 'fif-result-line';
        lineEl.dataset.line = match.line;
        lineEl.dataset.path = match.filePath;

        const lineNumSpan = `<span class="fif-line-num">${match.line}:</span> `;
        const highlightedText = this._highlightMatches(match.text, highlightPattern);
        lineEl.innerHTML = lineNumSpan + highlightedText;

        linesContainer.appendChild(lineEl);
      }

      fileEl.appendChild(linesContainer);
      resultsEl.appendChild(fileEl);
    }
  }

  _highlightMatches(text, pattern) {
    const escaped = escapeHtml(text);
    if (!pattern) return escaped;

    const segments = [];
    let lastIndex = 0;
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      if (m.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, m.index), highlight: false });
      }
      segments.push({ text: m[0], highlight: true });
      lastIndex = m.index + m[0].length;
      if (m[0].length === 0) { pattern.lastIndex++; lastIndex++; }
    }
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), highlight: false });
    }

    return segments.map(s =>
      s.highlight
        ? `<span class="fif-match">${escapeHtml(s.text)}</span>`
        : escapeHtml(s.text)
    ).join('');
  }

  _initResize() {
    const handle = this.container.querySelector('#fif-resize-handle');
    let startY, startHeight;

    const onMouseMove = (e) => {
      const delta = startY - e.clientY;
      const newHeight = Math.max(150, Math.min(window.innerHeight * 0.8, startHeight + delta));
      this.container.style.height = newHeight + 'px';
    };

    const onMouseUp = () => {
      handle.classList.remove('fif-dragging');
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startY = e.clientY;
      startHeight = this.container.offsetHeight;
      handle.classList.add('fif-dragging');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _setStatus(text) {
    this.container.querySelector('#fif-status').textContent = text;
  }

  setSearchDir(dirPath) {
    this.searchDir = dirPath;
    const dirInput = this.container.querySelector('#fif-dir');
    if (dirInput) dirInput.value = dirPath;
  }

  show(mode) {
    if (mode) {
      this._setScope(mode);
    }

    this.container.classList.remove('hidden');

    // Pre-fill with selected text from editor
    const editor = this.editorManager.getActiveEditor();
    if (editor) {
      const selection = editor.getSelection();
      if (selection && !selection.isEmpty()) {
        const selectedText = editor.getModel().getValueInRange(selection);
        // Only use single-line selections for pre-fill
        if (selectedText && !selectedText.includes('\n')) {
          this.container.querySelector('#fif-query').value = selectedText;
        }
      }
    }

    const input = this.container.querySelector('#fif-query');
    input.focus();
    input.select();
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

  onResultClick(callback) {
    this.onResultClickCallbacks.push(callback);
  }

}
