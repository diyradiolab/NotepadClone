import { escapeHtml } from '../utils/escape-html';

/**
 * FileExplorer renders a collapsible folder tree in a side panel.
 * Directories are lazily loaded on expand.
 */
export class FileExplorer {
  constructor(container) {
    this.container = container;
    this.rootPath = null;
    this.onFileOpenCallbacks = [];
    this.onFileHistoryCallbacks = [];
    this._contextMenu = null;
    this._filterActive = false;
    this._savedExpandedStates = null; // saved before first filter
    this._render();
    this._bindContextMenuDismiss();
  }

  _render() {
    this.container.innerHTML = `
      <div class="explorer-header panel-header">
        <span class="explorer-title">EXPLORER</span>
        <div class="explorer-header-buttons">
          <button class="explorer-btn panel-btn" id="explorer-refresh" title="Refresh">&#8635;</button>
          <button class="explorer-btn panel-btn" id="explorer-open-folder" title="Open Folder">+</button>
        </div>
      </div>
      <div class="explorer-filter" id="explorer-filter" style="display:none">
        <input class="explorer-filter-input" placeholder="Filter files..." />
        <button class="explorer-filter-clear" title="Clear filter">&times;</button>
        <span class="explorer-filter-count"></span>
      </div>
      <div class="explorer-tree" id="explorer-tree">
        <div class="explorer-empty">No folder opened</div>
      </div>
      <div class="explorer-resize" id="explorer-resize"></div>
    `;

    this._bindResize();

    this.container.querySelector('#explorer-open-folder').addEventListener('click', () => {
      this.openFolder();
    });

    this.container.querySelector('#explorer-refresh').addEventListener('click', () => {
      if (this.rootPath) this._refreshDirectory(this.rootPath);
    });

    // Filter input
    const filterInput = this.container.querySelector('.explorer-filter-input');
    filterInput.addEventListener('input', () => this._applyFilter(filterInput.value));

    this.container.querySelector('.explorer-filter-clear').addEventListener('click', () => {
      filterInput.value = '';
      this._clearFilter();
    });

    // Delegated click handler for tree items
    const tree = this.container.querySelector('#explorer-tree');
    tree.addEventListener('click', (e) => {
      const row = e.target.closest('.tree-row');
      if (!row) return;
      const item = row.closest('.tree-item');
      if (!item) return;

      if (item.classList.contains('tree-directory')) {
        this._toggleDirectory(item);
      } else if (item.classList.contains('tree-file')) {
        // Highlight active
        this.container.querySelectorAll('.tree-row.active').forEach(el => el.classList.remove('active'));
        row.classList.add('active');
        // Open file
        this.onFileOpenCallbacks.forEach(cb => cb(item.dataset.path));
      }
    });

    tree.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.tree-row');
      if (!row) return;
      const item = row.closest('.tree-item');
      if (!item) return;
      e.preventDefault();
      e.stopPropagation();
      const isDirectory = item.classList.contains('tree-directory');
      this._showContextMenu(e.clientX, e.clientY, item.dataset.path, isDirectory);
    });
  }

  async openFolder(folderPath) {
    if (!folderPath) {
      folderPath = await window.api.openFolder();
    }
    if (!folderPath) return;

    this.rootPath = folderPath;
    const tree = this.container.querySelector('#explorer-tree');
    tree.innerHTML = '';

    const rootName = folderPath.split(/[/\\]/).pop();
    const rootNode = this._createDirectoryNode(rootName, folderPath, true);
    tree.appendChild(rootNode);

    // Auto-expand root
    await this._toggleDirectory(rootNode);

    // Show filter bar
    this.container.querySelector('#explorer-filter').style.display = '';
  }

  _createDirectoryNode(name, fullPath, isRoot = false) {
    const node = document.createElement('div');
    node.className = 'tree-item tree-directory';
    node.dataset.path = fullPath;
    node.dataset.expanded = 'false';

    const row = document.createElement('div');
    row.className = `tree-row ${isRoot ? 'tree-root' : ''}`;
    row.innerHTML = `
      <span class="tree-arrow">&#9654;</span>
      <span class="tree-icon tree-icon-folder">&#128193;</span>
      <span class="tree-name">${escapeHtml(name)}</span>
    `;

    const children = document.createElement('div');
    children.className = 'tree-children';
    children.style.display = 'none';

    node.appendChild(row);
    node.appendChild(children);
    return node;
  }

  _createFileNode(name, fullPath) {
    const node = document.createElement('div');
    node.className = 'tree-item tree-file';
    node.dataset.path = fullPath;

    const row = document.createElement('div');
    row.className = 'tree-row';
    row.innerHTML = `
      <span class="tree-icon tree-icon-file">${this._getFileIcon(name)}</span>
      <span class="tree-name">${escapeHtml(name)}</span>
    `;

    node.appendChild(row);
    return node;
  }

  async _toggleDirectory(node) {
    const expanded = node.dataset.expanded === 'true';
    const children = node.querySelector('.tree-children');
    const arrow = node.querySelector('.tree-arrow');
    const folderIcon = node.querySelector('.tree-icon-folder');

    if (expanded) {
      children.style.display = 'none';
      node.dataset.expanded = 'false';
      arrow.innerHTML = '&#9654;'; // right arrow
      folderIcon.innerHTML = '&#128193;'; // closed folder
    } else {
      // Load children if empty
      if (children.children.length === 0) {
        await this._loadDirectoryChildren(node);
      }
      children.style.display = 'block';
      node.dataset.expanded = 'true';
      arrow.innerHTML = '&#9660;'; // down arrow
      folderIcon.innerHTML = '&#128194;'; // open folder
    }
  }

  async _loadDirectoryChildren(node) {
    const children = node.querySelector('.tree-children');
    const entries = await window.api.readDirectory(node.dataset.path);
    for (const entry of entries) {
      if (entry.isDirectory) {
        children.appendChild(this._createDirectoryNode(entry.name, entry.path));
      } else {
        children.appendChild(this._createFileNode(entry.name, entry.path));
      }
    }
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'tree-empty';
      empty.textContent = '(empty)';
      children.appendChild(empty);
    }
    node.dataset.loaded = 'true';
  }

  _expandDirectory(node) {
    const children = node.querySelector('.tree-children');
    const arrow = node.querySelector('.tree-arrow');
    const folderIcon = node.querySelector('.tree-icon-folder');
    children.style.display = 'block';
    node.dataset.expanded = 'true';
    arrow.innerHTML = '&#9660;';
    folderIcon.innerHTML = '&#128194;';
  }

  _collapseDirectory(node) {
    const children = node.querySelector('.tree-children');
    const arrow = node.querySelector('.tree-arrow');
    const folderIcon = node.querySelector('.tree-icon-folder');
    children.style.display = 'none';
    node.dataset.expanded = 'false';
    arrow.innerHTML = '&#9654;';
    folderIcon.innerHTML = '&#128193;';
  }

  // ── Refresh ──

  async _refreshDirectory(dirPath) {
    const tree = this.container.querySelector('#explorer-tree');
    const dirNode = tree.querySelector(`.tree-directory[data-path="${CSS.escape(dirPath)}"]`);
    if (!dirNode) return;

    // Collect currently expanded subdirectory paths
    const expandedPaths = new Set();
    dirNode.querySelectorAll('.tree-directory[data-expanded="true"]').forEach(d => {
      expandedPaths.add(d.dataset.path);
    });
    expandedPaths.add(dirPath); // include self if expanded

    const children = dirNode.querySelector('.tree-children');
    children.innerHTML = '';
    dirNode.dataset.loaded = 'false';

    await this._loadDirectoryChildren(dirNode);

    // Ensure dir stays expanded
    if (dirNode.dataset.expanded !== 'true') {
      this._expandDirectory(dirNode);
    }

    // Re-expand previously expanded subdirectories
    for (const p of expandedPaths) {
      if (p === dirPath) continue;
      const sub = children.querySelector(`.tree-directory[data-path="${CSS.escape(p)}"]`);
      if (sub) {
        await this._loadDirectoryChildren(sub);
        this._expandDirectory(sub);
      }
    }
  }

  // ── Filter ──

  async _applyFilter(query) {
    const tree = this.container.querySelector('#explorer-tree');
    const countEl = this.container.querySelector('.explorer-filter-count');

    if (!query.trim()) {
      this._clearFilter();
      return;
    }

    // Save expanded states before first filter application
    if (!this._filterActive) {
      this._savedExpandedStates = new Map();
      tree.querySelectorAll('.tree-directory').forEach(d => {
        this._savedExpandedStates.set(d.dataset.path, d.dataset.expanded === 'true');
      });
      this._filterActive = true;
    }

    // Ensure all directories are loaded before filtering
    await this._loadAllDirectories(tree);

    const lowerQuery = query.toLowerCase();
    let matchCount = 0;

    // Process files
    tree.querySelectorAll('.tree-file').forEach(fileNode => {
      const name = fileNode.querySelector('.tree-name').textContent.toLowerCase();
      if (name.includes(lowerQuery)) {
        fileNode.classList.remove('filtered-out');
        matchCount++;
      } else {
        fileNode.classList.add('filtered-out');
      }
    });

    // Process directories: show if name matches or any visible descendant file
    const dirs = Array.from(tree.querySelectorAll('.tree-directory'));
    // Process deepest-first so parent visibility accounts for children
    dirs.reverse();
    for (const dirNode of dirs) {
      const name = dirNode.querySelector('.tree-name').textContent.toLowerCase();
      const hasVisibleDescendant = dirNode.querySelector('.tree-file:not(.filtered-out)') !== null;
      const nameMatches = name.includes(lowerQuery);

      if (nameMatches || hasVisibleDescendant) {
        dirNode.classList.remove('filtered-out');
        // Auto-expand to reveal matches
        if (hasVisibleDescendant && dirNode.dataset.expanded !== 'true') {
          this._expandDirectory(dirNode);
        }
      } else {
        dirNode.classList.add('filtered-out');
      }
    }

    countEl.textContent = `${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
  }

  _clearFilter() {
    const tree = this.container.querySelector('#explorer-tree');
    const countEl = this.container.querySelector('.explorer-filter-count');

    // Remove filtered-out from all items
    tree.querySelectorAll('.filtered-out').forEach(el => el.classList.remove('filtered-out'));

    // Restore saved expanded states
    if (this._savedExpandedStates) {
      tree.querySelectorAll('.tree-directory').forEach(d => {
        const wasExpanded = this._savedExpandedStates.get(d.dataset.path);
        if (wasExpanded === true && d.dataset.expanded !== 'true') {
          this._expandDirectory(d);
        } else if (wasExpanded === false && d.dataset.expanded === 'true') {
          this._collapseDirectory(d);
        }
      });
      this._savedExpandedStates = null;
    }

    this._filterActive = false;
    countEl.textContent = '';
  }

  async _loadAllDirectories(container) {
    const unloaded = container.querySelectorAll('.tree-directory:not([data-loaded="true"])');
    for (const dirNode of unloaded) {
      await this._loadDirectoryChildren(dirNode);
    }
    // Recurse in case newly loaded dirs contain subdirs
    const stillUnloaded = container.querySelectorAll('.tree-directory:not([data-loaded="true"])');
    if (stillUnloaded.length > 0) {
      await this._loadAllDirectories(container);
    }
  }

  _getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    const icons = {
      js: '&#128312;',  // yellow circle
      ts: '&#128309;',  // blue circle
      json: '&#128310;', // green
      html: '&#128312;',
      css: '&#128309;',
      py: '&#128154;',
      rb: '&#128308;',  // red
      md: '&#128220;',  // memo
      txt: '&#128196;',
      log: '&#128196;',
    };
    return icons[ext] || '&#128196;'; // default: page
  }

  onFileOpen(callback) {
    this.onFileOpenCallbacks.push(callback);
  }

  onFileHistory(callback) {
    this.onFileHistoryCallbacks.push(callback);
  }

  // ── Context Menu ──

  _showContextMenu(x, y, itemPath, isDirectory) {
    this._dismissContextMenu();

    const menu = document.createElement('div');
    menu.className = 'explorer-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '9999';

    if (!isDirectory) {
      this._addMenuItem(menu, 'Git History', () => {
        this.onFileHistoryCallbacks.forEach(cb => cb(itemPath));
      });
      this._addMenuSeparator(menu);
    }

    this._addMenuItem(menu, 'Copy Path', () => {
      this._handleCopyPath(itemPath);
    });

    this._addMenuItem(menu, 'Reveal in Finder', () => {
      this._handleRevealInFinder(itemPath);
    });

    document.body.appendChild(menu);
    this._contextMenu = menu;

    // Adjust if menu goes off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    }
  }

  _addMenuItem(menu, label, onClick) {
    const item = document.createElement('div');
    item.className = 'explorer-context-item';
    item.textContent = label;
    item.addEventListener('click', () => {
      this._dismissContextMenu();
      onClick();
    });
    menu.appendChild(item);
  }

  _addMenuSeparator(menu) {
    const sep = document.createElement('div');
    sep.className = 'explorer-context-separator';
    menu.appendChild(sep);
  }

  _handleCopyPath(filePath) {
    navigator.clipboard.writeText(filePath);
  }

  _handleRevealInFinder(filePath) {
    window.api.revealInFinder(filePath);
  }

  _dismissContextMenu() {
    if (this._contextMenu) {
      this._contextMenu.remove();
      this._contextMenu = null;
    }
  }

  _bindContextMenuDismiss() {
    document.addEventListener('click', () => this._dismissContextMenu());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._dismissContextMenu();
    });
  }

  _bindResize() {
    const handle = this.container.querySelector('#explorer-resize');
    let startX, startWidth;

    const onMouseMove = (e) => {
      const newWidth = startWidth + (e.clientX - startX);
      this.container.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = this.container.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  toggle() {
    this.container.classList.toggle('hidden');
  }

  show() {
    this.container.classList.remove('hidden');
  }

  hide() {
    this.container.classList.add('hidden');
  }

  isVisible() {
    return !this.container.classList.contains('hidden');
  }

}
