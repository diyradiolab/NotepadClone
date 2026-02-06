/**
 * FindInFiles provides a search panel at the bottom of the window.
 * Searches all files in a directory, shows results, click to open.
 */
export class FindInFiles {
  constructor(container) {
    this.container = container;
    this.searchDir = null;
    this.onResultClickCallbacks = [];
    this._render();
  }

  _render() {
    this.container.innerHTML = `
      <div class="fif-header">
        <span class="fif-title">FIND IN FILES</span>
        <button class="fif-close-btn" title="Close">\u00D7</button>
      </div>
      <div class="fif-search-bar">
        <input type="text" class="fif-input" id="fif-query" placeholder="Search text..." />
        <label class="fif-option"><input type="checkbox" id="fif-regex"> Regex</label>
        <label class="fif-option"><input type="checkbox" id="fif-case"> Match Case</label>
        <button class="fif-search-btn" id="fif-search-btn">Search</button>
      </div>
      <div class="fif-status" id="fif-status"></div>
      <div class="fif-results" id="fif-results"></div>
    `;

    this.container.querySelector('.fif-close-btn').addEventListener('click', () => this.hide());

    const queryInput = this.container.querySelector('#fif-query');
    const searchBtn = this.container.querySelector('#fif-search-btn');

    searchBtn.addEventListener('click', () => this._doSearch());
    queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this._doSearch();
      if (e.key === 'Escape') this.hide();
    });
  }

  async _doSearch() {
    const query = this.container.querySelector('#fif-query').value.trim();
    if (!query) return;
    if (!this.searchDir) {
      this._setStatus('No folder open. Use File > Open Folder first.');
      return;
    }

    const useRegex = this.container.querySelector('#fif-regex').checked;
    const caseSensitive = this.container.querySelector('#fif-case').checked;
    const resultsEl = this.container.querySelector('#fif-results');

    this._setStatus('Searching...');
    resultsEl.innerHTML = '';

    const { results, truncated, error } = await window.api.searchInFiles(
      this.searchDir, query, useRegex, caseSensitive
    );

    if (error) {
      this._setStatus(`Error: ${error}`);
      return;
    }

    const statusText = `${results.length} match${results.length !== 1 ? 'es' : ''}${truncated ? ' (results truncated)' : ''}`;
    this._setStatus(statusText);

    // Group by file
    const grouped = new Map();
    for (const r of results) {
      if (!grouped.has(r.filePath)) grouped.set(r.filePath, []);
      grouped.get(r.filePath).push(r);
    }

    for (const [filePath, matches] of grouped) {
      const fileEl = document.createElement('div');
      fileEl.className = 'fif-file-group';

      const shortPath = this.searchDir
        ? filePath.replace(this.searchDir, '').replace(/^[/\\]/, '')
        : filePath;

      const headerEl = document.createElement('div');
      headerEl.className = 'fif-file-header';
      headerEl.textContent = `${shortPath} (${matches.length})`;
      fileEl.appendChild(headerEl);

      for (const match of matches) {
        const lineEl = document.createElement('div');
        lineEl.className = 'fif-result-line';
        lineEl.innerHTML = `<span class="fif-line-num">${match.line}:</span> ${this._escapeHtml(match.text)}`;
        lineEl.addEventListener('click', () => {
          this.onResultClickCallbacks.forEach(cb => cb(match.filePath, match.line));
        });
        fileEl.appendChild(lineEl);
      }

      resultsEl.appendChild(fileEl);
    }
  }

  _setStatus(text) {
    this.container.querySelector('#fif-status').textContent = text;
  }

  setSearchDir(dirPath) {
    this.searchDir = dirPath;
  }

  show() {
    this.container.classList.remove('hidden');
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

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
