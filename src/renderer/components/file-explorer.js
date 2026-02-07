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
    this._render();
    this._bindContextMenuDismiss();
  }

  _render() {
    this.container.innerHTML = `
      <div class="explorer-header">
        <span class="explorer-title">EXPLORER</span>
        <button class="explorer-btn" id="explorer-open-folder" title="Open Folder">+</button>
      </div>
      <div class="explorer-tree" id="explorer-tree">
        <div class="explorer-empty">No folder opened</div>
      </div>
    `;

    this.container.querySelector('#explorer-open-folder').addEventListener('click', () => {
      this.openFolder();
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

    row.addEventListener('click', () => this._toggleDirectory(node));

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

    row.addEventListener('click', () => {
      this.onFileOpenCallbacks.forEach(cb => cb(fullPath));
    });

    // Highlight active
    row.addEventListener('click', () => {
      this.container.querySelectorAll('.tree-row.active').forEach(el => el.classList.remove('active'));
      row.classList.add('active');
    });

    // Context menu
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showContextMenu(e.clientX, e.clientY, fullPath);
    });

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
      }
      children.style.display = 'block';
      node.dataset.expanded = 'true';
      arrow.innerHTML = '&#9660;'; // down arrow
      folderIcon.innerHTML = '&#128194;'; // open folder
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

  _showContextMenu(x, y, filePath) {
    this._dismissContextMenu();

    const menu = document.createElement('div');
    menu.className = 'explorer-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.zIndex = '9999';

    const historyItem = document.createElement('div');
    historyItem.className = 'explorer-context-item';
    historyItem.textContent = 'Git History';
    historyItem.addEventListener('click', () => {
      this._dismissContextMenu();
      this.onFileHistoryCallbacks.forEach(cb => cb(filePath));
    });
    menu.appendChild(historyItem);

    document.body.appendChild(menu);
    this._contextMenu = menu;
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
