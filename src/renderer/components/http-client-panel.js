/**
 * HttpClientPanel — Postman-like HTTP endpoint tester.
 *
 * Renders a two-region layout: collections sidebar (left) + request/response (right).
 * Persists collections via IPC to electron-store.
 */

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const METHOD_COLORS = { GET: '#61affe', POST: '#49cc90', PUT: '#fca130', PATCH: '#50e3c2', DELETE: '#f93e3e', HEAD: '#9012fe', OPTIONS: '#0d5aa7' };
const AUTH_TYPES = ['none', 'bearer', 'basic', 'apikey'];
const BODY_TYPES = ['none', 'json', 'form-data', 'raw'];

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class HttpClientPanel {
  constructor(editorWrapper) {
    this._editorWrapper = editorWrapper;
    this._container = null;
    this._activeTabId = null;

    // Current request state
    this._method = 'GET';
    this._url = '';
    this._params = [{ key: '', value: '', enabled: true }];
    this._headers = [{ key: '', value: '', enabled: true }];
    this._bodyType = 'none';
    this._bodyJson = '';
    this._bodyFormData = [{ key: '', value: '', enabled: true }];
    this._bodyRaw = '';
    this._authType = 'none';
    this._authBearer = { token: '' };
    this._authBasic = { username: '', password: '' };
    this._authApikey = { key: '', value: '', in: 'header' };

    // Response state
    this._response = null;
    this._sending = false;

    // Request config tab
    this._activeRequestTab = 'params';
    this._activeResponseTab = 'body';

    // Collections
    this._collections = [];
    this._activeRequestId = null;
    this._expandedFolders = new Set();

    // Debounced save
    this._saveTimer = null;

    // Sidebar resize
    this._sidebarWidth = 240;
    this._resizingSidebar = false;

    // Request/response split
    this._splitRatio = 0.5;
    this._resizingSplit = false;
  }

  async show(tabId) {
    this._activeTabId = tabId;
    this._ensureContainer();
    this._container.classList.remove('hidden');
    await this._loadCollections();
    this._render();
  }

  hide() {
    if (this._container) this._container.classList.add('hidden');
  }

  destroy() {
    this._flushSave();
    if (this._saveTimer) clearTimeout(this._saveTimer);
    if (this._container) {
      this._container.remove();
      this._container = null;
    }
  }

  // ── Private ──

  _ensureContainer() {
    if (this._container) return;
    this._container = document.createElement('div');
    this._container.className = 'hcp-container hidden';
    this._editorWrapper.appendChild(this._container);
  }

  async _loadCollections() {
    try {
      const data = await window.api.httpClientGetCollections();
      this._collections = (data && data.collections) || [];
    } catch {
      this._collections = [];
    }
  }

  _scheduleSave() {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this._flushSave(), 800);
  }

  _flushSave() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    window.api.httpClientSaveCollections({ collections: this._collections, version: 1 });
  }

  _render() {
    if (!this._container) return;
    this._container.innerHTML = '';

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'hcp-sidebar';
    sidebar.style.width = this._sidebarWidth + 'px';
    this._renderSidebar(sidebar);

    // Sidebar resize handle
    const sidebarHandle = document.createElement('div');
    sidebarHandle.className = 'hcp-sidebar-handle';
    sidebarHandle.addEventListener('mousedown', (e) => this._startSidebarResize(e));

    // Main area
    const main = document.createElement('div');
    main.className = 'hcp-main';
    this._renderMain(main);

    this._container.appendChild(sidebar);
    this._container.appendChild(sidebarHandle);
    this._container.appendChild(main);
  }

  // ── Sidebar ──

  _renderSidebar(sidebar) {
    // Header
    const header = document.createElement('div');
    header.className = 'hcp-sidebar-header';
    header.innerHTML = `
      <span class="hcp-sidebar-title">COLLECTIONS</span>
      <div class="hcp-sidebar-actions">
        <button class="hcp-btn-icon" data-action="new-collection" title="New Collection">+</button>
        <button class="hcp-btn-icon" data-action="import" title="Import Collection">&#8595;</button>
      </div>
    `;
    header.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'new-collection') this._createCollection();
      if (btn.dataset.action === 'import') this._importCollection();
    });
    sidebar.appendChild(header);

    // Tree
    const tree = document.createElement('div');
    tree.className = 'hcp-sidebar-tree';
    if (this._collections.length === 0) {
      tree.innerHTML = '<div class="hcp-sidebar-empty">No collections yet.<br>Click + to create one.</div>';
    } else {
      this._collections.forEach(col => {
        tree.appendChild(this._renderCollectionNode(col));
      });
    }
    sidebar.appendChild(tree);
  }

  _renderCollectionNode(collection) {
    const node = document.createElement('div');
    node.className = 'hcp-tree-collection';

    const row = document.createElement('div');
    row.className = 'hcp-tree-row hcp-tree-collection-row';
    const expanded = this._expandedFolders.has(collection.id);
    row.innerHTML = `
      <span class="hcp-tree-arrow">${expanded ? '&#9660;' : '&#9654;'}</span>
      <span class="hcp-tree-name" title="${escapeHtml(collection.name)}">${escapeHtml(collection.name)}</span>
      <span class="hcp-tree-actions">
        <button class="hcp-btn-icon hcp-btn-tiny" data-action="add-request" title="Add Request">+</button>
        <button class="hcp-btn-icon hcp-btn-tiny" data-action="add-folder" title="Add Folder">&#128193;</button>
        <button class="hcp-btn-icon hcp-btn-tiny" data-action="export" title="Export">&#8599;</button>
        <button class="hcp-btn-icon hcp-btn-tiny hcp-btn-danger" data-action="delete-collection" title="Delete">&#10005;</button>
      </span>
    `;
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        if (btn.dataset.action === 'add-request') this._addRequest(collection);
        else if (btn.dataset.action === 'add-folder') this._addFolder(collection);
        else if (btn.dataset.action === 'export') this._exportCollection(collection);
        else if (btn.dataset.action === 'delete-collection') this._deleteCollection(collection);
        return;
      }
      // Toggle expand
      if (expanded) this._expandedFolders.delete(collection.id);
      else this._expandedFolders.add(collection.id);
      this._render();
    });
    node.appendChild(row);

    if (expanded && collection.items) {
      const children = document.createElement('div');
      children.className = 'hcp-tree-children';
      collection.items.forEach(item => {
        if (item.type === 'folder') {
          children.appendChild(this._renderFolderNode(item, collection));
        } else {
          children.appendChild(this._renderRequestNode(item));
        }
      });
      node.appendChild(children);
    }

    return node;
  }

  _renderFolderNode(folder, parent) {
    const node = document.createElement('div');
    node.className = 'hcp-tree-folder';
    const expanded = this._expandedFolders.has(folder.id);

    const row = document.createElement('div');
    row.className = 'hcp-tree-row hcp-tree-folder-row';
    row.innerHTML = `
      <span class="hcp-tree-arrow">${expanded ? '&#9660;' : '&#9654;'}</span>
      <span class="hcp-tree-name">${escapeHtml(folder.name)}</span>
      <span class="hcp-tree-actions">
        <button class="hcp-btn-icon hcp-btn-tiny" data-action="add-request" title="Add Request">+</button>
        <button class="hcp-btn-icon hcp-btn-tiny hcp-btn-danger" data-action="delete-folder" title="Delete">&#10005;</button>
      </span>
    `;
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        e.stopPropagation();
        if (btn.dataset.action === 'add-request') this._addRequest(folder);
        else if (btn.dataset.action === 'delete-folder') this._deleteItem(folder, parent);
        return;
      }
      if (expanded) this._expandedFolders.delete(folder.id);
      else this._expandedFolders.add(folder.id);
      this._render();
    });
    node.appendChild(row);

    if (expanded && folder.items) {
      const children = document.createElement('div');
      children.className = 'hcp-tree-children';
      folder.items.forEach(item => {
        children.appendChild(this._renderRequestNode(item));
      });
      node.appendChild(children);
    }

    return node;
  }

  _renderRequestNode(request) {
    const row = document.createElement('div');
    row.className = 'hcp-tree-row hcp-tree-request-row';
    if (request.id === this._activeRequestId) row.classList.add('hcp-tree-active');

    const methodColor = METHOD_COLORS[request.method] || '#999';
    row.innerHTML = `
      <span class="hcp-tree-method" style="color:${methodColor}">${request.method}</span>
      <span class="hcp-tree-name" title="${escapeHtml(request.name)}">${escapeHtml(request.name)}</span>
    `;
    row.addEventListener('click', () => this._loadRequest(request));
    return row;
  }

  // ── Main Area ──

  _renderMain(main) {
    // Request area
    const requestArea = document.createElement('div');
    requestArea.className = 'hcp-request-area';
    requestArea.style.flex = this._splitRatio.toString();
    this._renderRequestArea(requestArea);

    // Split handle
    const splitHandle = document.createElement('div');
    splitHandle.className = 'hcp-split-handle';
    splitHandle.addEventListener('mousedown', (e) => this._startSplitResize(e));

    // Response area
    const responseArea = document.createElement('div');
    responseArea.className = 'hcp-response-area';
    responseArea.style.flex = (1 - this._splitRatio).toString();
    this._renderResponseArea(responseArea);

    main.appendChild(requestArea);
    main.appendChild(splitHandle);
    main.appendChild(responseArea);
  }

  _renderRequestArea(area) {
    // URL bar
    const urlBar = document.createElement('div');
    urlBar.className = 'hcp-url-bar';

    const methodSelect = document.createElement('select');
    methodSelect.className = 'hcp-method-select';
    METHODS.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      opt.selected = m === this._method;
      methodSelect.appendChild(opt);
    });
    methodSelect.style.color = METHOD_COLORS[this._method] || '#fff';
    methodSelect.addEventListener('change', (e) => {
      this._method = e.target.value;
      methodSelect.style.color = METHOD_COLORS[this._method] || '#fff';
    });

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'hcp-url-input';
    urlInput.placeholder = 'https://api.example.com/endpoint';
    urlInput.value = this._url;
    urlInput.addEventListener('input', (e) => { this._url = e.target.value; });
    urlInput.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this._sendRequest();
    });

    const sendBtn = document.createElement('button');
    sendBtn.className = 'hcp-btn hcp-btn-send';
    sendBtn.textContent = this._sending ? 'Sending...' : 'Send';
    sendBtn.disabled = this._sending;
    sendBtn.addEventListener('click', () => this._sendRequest());

    const saveBtn = document.createElement('button');
    saveBtn.className = 'hcp-btn hcp-btn-save';
    saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => this._saveRequest());

    urlBar.appendChild(methodSelect);
    urlBar.appendChild(urlInput);
    urlBar.appendChild(sendBtn);
    urlBar.appendChild(saveBtn);
    area.appendChild(urlBar);

    // Request tabs
    const tabs = document.createElement('div');
    tabs.className = 'hcp-tabs';
    ['params', 'headers', 'body', 'auth'].forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'hcp-tab' + (t === this._activeRequestTab ? ' hcp-tab-active' : '');
      btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      btn.addEventListener('click', () => { this._activeRequestTab = t; this._render(); });
      tabs.appendChild(btn);
    });
    area.appendChild(tabs);

    // Tab content
    const content = document.createElement('div');
    content.className = 'hcp-tab-content';
    if (this._activeRequestTab === 'params') this._renderKvTable(content, this._params, 'params');
    else if (this._activeRequestTab === 'headers') this._renderKvTable(content, this._headers, 'headers');
    else if (this._activeRequestTab === 'body') this._renderBodyTab(content);
    else if (this._activeRequestTab === 'auth') this._renderAuthTab(content);
    area.appendChild(content);
  }

  _renderKvTable(container, items, key) {
    const table = document.createElement('div');
    table.className = 'hcp-kv-table';

    // Header
    const headerRow = document.createElement('div');
    headerRow.className = 'hcp-kv-row hcp-kv-header';
    headerRow.innerHTML = '<span class="hcp-kv-cell hcp-kv-check"></span><span class="hcp-kv-cell hcp-kv-key">KEY</span><span class="hcp-kv-cell hcp-kv-val">VALUE</span><span class="hcp-kv-cell hcp-kv-del"></span>';
    table.appendChild(headerRow);

    items.forEach((item, i) => {
      const row = document.createElement('div');
      row.className = 'hcp-kv-row';

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = item.enabled;
      check.className = 'hcp-kv-check';
      check.addEventListener('change', () => { item.enabled = check.checked; });

      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.className = 'hcp-kv-cell hcp-kv-key';
      keyInput.placeholder = 'Key';
      keyInput.value = item.key;
      keyInput.addEventListener('input', (e) => {
        item.key = e.target.value;
        this._autoAddRow(items, i, key);
      });

      const valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.className = 'hcp-kv-cell hcp-kv-val';
      valInput.placeholder = 'Value';
      valInput.value = item.value;
      valInput.addEventListener('input', (e) => {
        item.value = e.target.value;
        this._autoAddRow(items, i, key);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'hcp-btn-icon hcp-btn-tiny hcp-kv-del';
      delBtn.textContent = '\u00D7';
      delBtn.addEventListener('click', () => {
        if (items.length > 1) {
          items.splice(i, 1);
          this._render();
        }
      });

      row.appendChild(check);
      row.appendChild(keyInput);
      row.appendChild(valInput);
      row.appendChild(delBtn);
      table.appendChild(row);
    });

    container.appendChild(table);
  }

  _autoAddRow(items, index, key) {
    if (index === items.length - 1 && (items[index].key || items[index].value)) {
      items.push({ key: '', value: '', enabled: true });
      this._render();
    }
  }

  _renderBodyTab(container) {
    // Body type selector
    const selector = document.createElement('div');
    selector.className = 'hcp-body-type-selector';
    BODY_TYPES.forEach(t => {
      const label = document.createElement('label');
      label.className = 'hcp-radio-label';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'hcp-body-type';
      radio.value = t;
      radio.checked = t === this._bodyType;
      radio.addEventListener('change', () => { this._bodyType = t; this._render(); });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + t));
      selector.appendChild(label);
    });
    container.appendChild(selector);

    if (this._bodyType === 'json') {
      const textarea = document.createElement('textarea');
      textarea.className = 'hcp-body-editor';
      textarea.placeholder = '{\n  "key": "value"\n}';
      textarea.value = this._bodyJson;
      textarea.addEventListener('input', (e) => { this._bodyJson = e.target.value; });
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this._sendRequest();
      });
      container.appendChild(textarea);
    } else if (this._bodyType === 'form-data') {
      this._renderKvTable(container, this._bodyFormData, 'formData');
    } else if (this._bodyType === 'raw') {
      const textarea = document.createElement('textarea');
      textarea.className = 'hcp-body-editor';
      textarea.placeholder = 'Raw request body...';
      textarea.value = this._bodyRaw;
      textarea.addEventListener('input', (e) => { this._bodyRaw = e.target.value; });
      textarea.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') this._sendRequest();
      });
      container.appendChild(textarea);
    } else {
      container.innerHTML += '<div class="hcp-body-none">This request does not have a body.</div>';
    }
  }

  _renderAuthTab(container) {
    const selector = document.createElement('div');
    selector.className = 'hcp-auth-type-selector';
    AUTH_TYPES.forEach(t => {
      const label = document.createElement('label');
      label.className = 'hcp-radio-label';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'hcp-auth-type';
      radio.value = t;
      radio.checked = t === this._authType;
      radio.addEventListener('change', () => { this._authType = t; this._render(); });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + t.charAt(0).toUpperCase() + t.slice(1)));
      selector.appendChild(label);
    });
    container.appendChild(selector);

    const fields = document.createElement('div');
    fields.className = 'hcp-auth-fields';

    if (this._authType === 'bearer') {
      fields.innerHTML = '<label class="hcp-field-label">Token</label>';
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'hcp-input';
      input.placeholder = 'Bearer token';
      input.value = this._authBearer.token;
      input.addEventListener('input', (e) => { this._authBearer.token = e.target.value; });
      fields.appendChild(input);
    } else if (this._authType === 'basic') {
      fields.innerHTML = '<label class="hcp-field-label">Username</label>';
      const user = document.createElement('input');
      user.type = 'text';
      user.className = 'hcp-input';
      user.value = this._authBasic.username;
      user.addEventListener('input', (e) => { this._authBasic.username = e.target.value; });
      fields.appendChild(user);
      const lbl2 = document.createElement('label');
      lbl2.className = 'hcp-field-label';
      lbl2.textContent = 'Password';
      fields.appendChild(lbl2);
      const pass = document.createElement('input');
      pass.type = 'password';
      pass.className = 'hcp-input';
      pass.value = this._authBasic.password;
      pass.addEventListener('input', (e) => { this._authBasic.password = e.target.value; });
      fields.appendChild(pass);
    } else if (this._authType === 'apikey') {
      fields.innerHTML = '<label class="hcp-field-label">Key</label>';
      const keyInput = document.createElement('input');
      keyInput.type = 'text';
      keyInput.className = 'hcp-input';
      keyInput.placeholder = 'X-API-Key';
      keyInput.value = this._authApikey.key;
      keyInput.addEventListener('input', (e) => { this._authApikey.key = e.target.value; });
      fields.appendChild(keyInput);
      const lbl2 = document.createElement('label');
      lbl2.className = 'hcp-field-label';
      lbl2.textContent = 'Value';
      fields.appendChild(lbl2);
      const valInput = document.createElement('input');
      valInput.type = 'text';
      valInput.className = 'hcp-input';
      valInput.value = this._authApikey.value;
      valInput.addEventListener('input', (e) => { this._authApikey.value = e.target.value; });
      fields.appendChild(valInput);
      const lbl3 = document.createElement('label');
      lbl3.className = 'hcp-field-label';
      lbl3.textContent = 'Add to';
      fields.appendChild(lbl3);
      const sel = document.createElement('select');
      sel.className = 'hcp-input';
      ['header', 'query'].forEach(o => {
        const opt = document.createElement('option');
        opt.value = o;
        opt.textContent = o.charAt(0).toUpperCase() + o.slice(1);
        opt.selected = o === this._authApikey.in;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', (e) => { this._authApikey.in = e.target.value; });
      fields.appendChild(sel);
    } else {
      fields.innerHTML = '<div class="hcp-body-none">No authentication.</div>';
    }
    container.appendChild(fields);
  }

  // ── Response Area ──

  _renderResponseArea(area) {
    if (!this._response) {
      area.innerHTML = '<div class="hcp-response-empty">Send a request to see the response.</div>';
      return;
    }

    // Status line
    const statusLine = document.createElement('div');
    statusLine.className = 'hcp-status-line';
    const statusCode = this._response.status || 0;
    const statusColor = statusCode < 300 ? '#49cc90' : statusCode < 400 ? '#fca130' : '#f93e3e';
    const statusText = this._response.statusText || '';
    const time = this._response.time ? `${this._response.time}ms` : '';
    const size = this._response.size ? this._formatSize(this._response.size) : '';
    statusLine.innerHTML = `
      <span class="hcp-status-badge" style="background:${statusColor}">${statusCode} ${escapeHtml(statusText)}</span>
      ${time ? `<span class="hcp-status-meta">${time}</span>` : ''}
      ${size ? `<span class="hcp-status-meta">${size}</span>` : ''}
      <button class="hcp-btn-icon hcp-copy-btn" title="Copy response body">&#128203;</button>
    `;
    statusLine.querySelector('.hcp-copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(this._response.body || '');
    });
    area.appendChild(statusLine);

    // Response tabs
    const tabs = document.createElement('div');
    tabs.className = 'hcp-tabs';
    ['body', 'headers', 'raw'].forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'hcp-tab' + (t === this._activeResponseTab ? ' hcp-tab-active' : '');
      btn.textContent = t.charAt(0).toUpperCase() + t.slice(1);
      btn.addEventListener('click', () => { this._activeResponseTab = t; this._render(); });
      tabs.appendChild(btn);
    });
    area.appendChild(tabs);

    // Response content
    const content = document.createElement('div');
    content.className = 'hcp-response-content';

    if (this._activeResponseTab === 'body') {
      const pre = document.createElement('pre');
      pre.className = 'hcp-response-body';
      // Try to pretty-print JSON
      let bodyText = this._response.body || '';
      try {
        const parsed = JSON.parse(bodyText);
        bodyText = JSON.stringify(parsed, null, 2);
        pre.innerHTML = this._syntaxHighlightJson(bodyText);
      } catch {
        pre.textContent = bodyText;
      }
      content.appendChild(pre);
    } else if (this._activeResponseTab === 'headers') {
      const table = document.createElement('div');
      table.className = 'hcp-response-headers';
      const respHeaders = this._response.headers || {};
      Object.entries(respHeaders).forEach(([k, v]) => {
        const row = document.createElement('div');
        row.className = 'hcp-resp-header-row';
        row.innerHTML = `<span class="hcp-resp-header-key">${escapeHtml(k)}</span><span class="hcp-resp-header-val">${escapeHtml(String(v))}</span>`;
        table.appendChild(row);
      });
      if (Object.keys(respHeaders).length === 0) {
        table.innerHTML = '<div class="hcp-body-none">No headers.</div>';
      }
      content.appendChild(table);
    } else {
      const pre = document.createElement('pre');
      pre.className = 'hcp-response-body';
      pre.textContent = this._response.raw || this._response.body || '';
      content.appendChild(pre);
    }
    area.appendChild(content);
  }

  _syntaxHighlightJson(json) {
    return json.replace(/("(?:\\.|[^"\\])*")\s*:/g, '<span class="hcp-json-key">$1</span>:')
      .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="hcp-json-string">$1</span>')
      .replace(/:\s*(\d+\.?\d*)/g, ': <span class="hcp-json-number">$1</span>')
      .replace(/:\s*(true|false)/g, ': <span class="hcp-json-bool">$1</span>')
      .replace(/:\s*(null)/g, ': <span class="hcp-json-null">$1</span>');
  }

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ── Actions ──

  async _sendRequest() {
    if (this._sending || !this._url.trim()) return;
    this._sending = true;
    this._response = null;
    this._render();

    // Build headers
    const headers = {};
    this._headers.filter(h => h.enabled && h.key).forEach(h => { headers[h.key] = h.value; });

    // Build URL with params
    let url = this._url.trim();
    const enabledParams = this._params.filter(p => p.enabled && p.key);
    if (enabledParams.length > 0) {
      const sep = url.includes('?') ? '&' : '?';
      const qs = enabledParams.map(p => encodeURIComponent(p.key) + '=' + encodeURIComponent(p.value)).join('&');
      url = url + sep + qs;
    }

    // Apply auth
    if (this._authType === 'bearer' && this._authBearer.token) {
      headers['Authorization'] = 'Bearer ' + this._authBearer.token;
    } else if (this._authType === 'basic') {
      const encoded = btoa(this._authBasic.username + ':' + this._authBasic.password);
      headers['Authorization'] = 'Basic ' + encoded;
    } else if (this._authType === 'apikey' && this._authApikey.key) {
      if (this._authApikey.in === 'header') {
        headers[this._authApikey.key] = this._authApikey.value;
      } else {
        const sep = url.includes('?') ? '&' : '?';
        url = url + sep + encodeURIComponent(this._authApikey.key) + '=' + encodeURIComponent(this._authApikey.value);
      }
    }

    // Build body
    let body = null;
    if (this._method !== 'GET' && this._method !== 'HEAD') {
      if (this._bodyType === 'json' && this._bodyJson.trim()) {
        body = this._bodyJson;
        if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
      } else if (this._bodyType === 'form-data') {
        const formItems = this._bodyFormData.filter(f => f.enabled && f.key);
        if (formItems.length > 0) {
          const params = new URLSearchParams();
          formItems.forEach(f => params.append(f.key, f.value));
          body = params.toString();
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }
      } else if (this._bodyType === 'raw' && this._bodyRaw.trim()) {
        body = this._bodyRaw;
      }
    }

    try {
      const result = await window.api.httpClientSendRequest({
        method: this._method,
        url,
        headers,
        body,
      });
      this._response = result;
    } catch (err) {
      this._response = {
        status: 0,
        statusText: 'Error',
        body: err.message || String(err),
        headers: {},
        time: 0,
        size: 0,
      };
    }

    this._sending = false;
    this._render();
  }

  _saveRequest() {
    if (this._activeRequestId) {
      // Update existing request
      const req = this._findRequestById(this._activeRequestId);
      if (req) {
        this._serializeToRequest(req);
        this._scheduleSave();
        this._render();
        return;
      }
    }
    // No active request — prompt for save location
    this._showSaveDialog();
  }

  _serializeToRequest(req) {
    req.method = this._method;
    req.url = this._url;
    req.params = this._params.filter(p => p.key || p.value).map(p => ({ ...p }));
    if (req.params.length === 0) req.params = [{ key: '', value: '', enabled: true }];
    req.headers = this._headers.filter(h => h.key || h.value).map(h => ({ ...h }));
    if (req.headers.length === 0) req.headers = [{ key: '', value: '', enabled: true }];
    req.body = {
      type: this._bodyType,
      json: this._bodyJson,
      formData: this._bodyFormData.filter(f => f.key || f.value).map(f => ({ ...f })),
      raw: this._bodyRaw,
    };
    req.auth = {
      type: this._authType,
      bearer: { ...this._authBearer },
      basic: { ...this._authBasic },
      apikey: { ...this._authApikey },
    };
    req.name = `${req.method} ${this._extractPath(req.url)}`;
  }

  _extractPath(url) {
    try {
      const u = new URL(url);
      return u.pathname === '/' ? u.host : u.pathname;
    } catch {
      return url.slice(0, 30);
    }
  }

  _loadRequest(request) {
    this._activeRequestId = request.id;
    this._method = request.method || 'GET';
    this._url = request.url || '';
    this._params = (request.params && request.params.length > 0) ? request.params.map(p => ({ ...p })) : [{ key: '', value: '', enabled: true }];
    this._headers = (request.headers && request.headers.length > 0) ? request.headers.map(h => ({ ...h })) : [{ key: '', value: '', enabled: true }];
    const body = request.body || {};
    this._bodyType = body.type || 'none';
    this._bodyJson = body.json || '';
    this._bodyFormData = (body.formData && body.formData.length > 0) ? body.formData.map(f => ({ ...f })) : [{ key: '', value: '', enabled: true }];
    this._bodyRaw = body.raw || '';
    const auth = request.auth || {};
    this._authType = auth.type || 'none';
    this._authBearer = auth.bearer ? { ...auth.bearer } : { token: '' };
    this._authBasic = auth.basic ? { ...auth.basic } : { username: '', password: '' };
    this._authApikey = auth.apikey ? { ...auth.apikey } : { key: '', value: '', in: 'header' };
    this._response = null;
    this._render();
  }

  _findRequestById(id) {
    for (const col of this._collections) {
      const found = this._findInItems(col.items, id);
      if (found) return found;
    }
    return null;
  }

  _findInItems(items, id) {
    if (!items) return null;
    for (const item of items) {
      if (item.id === id) return item;
      if (item.type === 'folder' && item.items) {
        const found = this._findInItems(item.items, id);
        if (found) return found;
      }
    }
    return null;
  }

  // ── Collection Management ──

  _createCollection() {
    this._showInlineDialog('New Collection', 'Collection name', (name) => {
      if (!name) return;
      this._collections.push({ id: uuid(), name, items: [] });
      this._scheduleSave();
      this._render();
    });
  }

  _addRequest(parent) {
    const req = {
      id: uuid(),
      type: 'request',
      name: 'New Request',
      method: 'GET',
      url: '',
      params: [{ key: '', value: '', enabled: true }],
      headers: [{ key: '', value: '', enabled: true }],
      body: { type: 'none', json: '', formData: [], raw: '' },
      auth: { type: 'none', bearer: { token: '' }, basic: { username: '', password: '' }, apikey: { key: '', value: '', in: 'header' } },
    };
    if (!parent.items) parent.items = [];
    parent.items.push(req);
    this._expandedFolders.add(parent.id);
    this._loadRequest(req);
    this._scheduleSave();
  }

  _addFolder(parent) {
    this._showInlineDialog('New Folder', 'Folder name', (name) => {
      if (!name) return;
      if (!parent.items) parent.items = [];
      const folder = { id: uuid(), type: 'folder', name, items: [] };
      parent.items.push(folder);
      this._expandedFolders.add(parent.id);
      this._scheduleSave();
      this._render();
    });
  }

  _deleteCollection(collection) {
    this._showConfirmDialog(`Delete collection "${collection.name}"?`, () => {
      this._collections = this._collections.filter(c => c.id !== collection.id);
      if (this._activeRequestId) {
        const found = this._findRequestById(this._activeRequestId);
        if (!found) this._activeRequestId = null;
      }
      this._scheduleSave();
      this._render();
    });
  }

  _deleteItem(item, parent) {
    this._showConfirmDialog(`Delete "${item.name}"?`, () => {
      if (parent.items) {
        parent.items = parent.items.filter(i => i.id !== item.id);
      }
      if (this._activeRequestId === item.id) this._activeRequestId = null;
      this._scheduleSave();
      this._render();
    });
  }

  _showSaveDialog() {
    if (this._collections.length === 0) {
      // Create a default collection first
      const col = { id: uuid(), name: 'My API', items: [] };
      this._collections.push(col);
      this._expandedFolders.add(col.id);
    }

    // Build target options
    const options = [];
    this._collections.forEach(col => {
      options.push({ label: col.name, target: col });
      if (col.items) {
        col.items.filter(i => i.type === 'folder').forEach(f => {
          options.push({ label: `  ${col.name} / ${f.name}`, target: f });
        });
      }
    });

    this._showSelectDialog('Save to', options, (target) => {
      if (!target) return;
      const req = {
        id: uuid(),
        type: 'request',
        name: `${this._method} ${this._extractPath(this._url) || 'New Request'}`,
        method: this._method,
        url: this._url,
        params: [],
        headers: [],
        body: { type: 'none', json: '', formData: [], raw: '' },
        auth: { type: 'none', bearer: { token: '' }, basic: { username: '', password: '' }, apikey: { key: '', value: '', in: 'header' } },
      };
      this._serializeToRequest(req);
      if (!target.items) target.items = [];
      target.items.push(req);
      this._activeRequestId = req.id;
      this._expandedFolders.add(target.id);
      this._scheduleSave();
      this._render();
    });
  }

  async _exportCollection(collection) {
    try {
      await window.api.httpClientExportCollection({ collections: [collection], version: 1 });
    } catch { /* ignore */ }
  }

  async _importCollection() {
    try {
      const data = await window.api.httpClientImportCollection();
      if (!data) return;
      // Validate shape
      const imported = data.collections || [data];
      imported.forEach(col => {
        if (!col.id) col.id = uuid();
        if (!col.name) col.name = 'Imported Collection';
        if (!col.items) col.items = [];
      });
      this._collections.push(...imported);
      this._scheduleSave();
      this._render();
    } catch { /* ignore */ }
  }

  // ── Inline Dialogs ──

  _showInlineDialog(title, placeholder, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'hcp-dialog-overlay';
    overlay.innerHTML = `
      <div class="hcp-dialog">
        <div class="hcp-dialog-title">${escapeHtml(title)}</div>
        <input type="text" class="hcp-input hcp-dialog-input" placeholder="${escapeHtml(placeholder)}">
        <div class="hcp-dialog-buttons">
          <button class="hcp-btn hcp-dialog-cancel">Cancel</button>
          <button class="hcp-btn hcp-btn-send hcp-dialog-ok">OK</button>
        </div>
      </div>
    `;
    const input = overlay.querySelector('.hcp-dialog-input');
    overlay.querySelector('.hcp-dialog-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.hcp-dialog-ok').addEventListener('click', () => {
      const val = input.value.trim();
      overlay.remove();
      onConfirm(val);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { overlay.remove(); onConfirm(input.value.trim()); }
      if (e.key === 'Escape') overlay.remove();
    });
    this._container.appendChild(overlay);
    input.focus();
  }

  _showConfirmDialog(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'hcp-dialog-overlay';
    overlay.innerHTML = `
      <div class="hcp-dialog">
        <div class="hcp-dialog-title">${escapeHtml(message)}</div>
        <div class="hcp-dialog-buttons">
          <button class="hcp-btn hcp-dialog-cancel">Cancel</button>
          <button class="hcp-btn hcp-btn-send hcp-dialog-ok">Delete</button>
        </div>
      </div>
    `;
    overlay.querySelector('.hcp-dialog-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.hcp-dialog-ok').addEventListener('click', () => { overlay.remove(); onConfirm(); });
    this._container.appendChild(overlay);
  }

  _showSelectDialog(title, options, onSelect) {
    const overlay = document.createElement('div');
    overlay.className = 'hcp-dialog-overlay';
    const optionsHtml = options.map((o, i) =>
      `<div class="hcp-select-option" data-idx="${i}">${escapeHtml(o.label)}</div>`
    ).join('');
    overlay.innerHTML = `
      <div class="hcp-dialog">
        <div class="hcp-dialog-title">${escapeHtml(title)}</div>
        <div class="hcp-select-list">${optionsHtml}</div>
        <div class="hcp-dialog-buttons">
          <button class="hcp-btn hcp-dialog-cancel">Cancel</button>
        </div>
      </div>
    `;
    overlay.querySelector('.hcp-dialog-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelectorAll('.hcp-select-option').forEach(el => {
      el.addEventListener('click', () => {
        overlay.remove();
        onSelect(options[parseInt(el.dataset.idx)].target);
      });
    });
    this._container.appendChild(overlay);
  }

  // ── Resize Handles ──

  _startSidebarResize(e) {
    e.preventDefault();
    this._resizingSidebar = true;
    const startX = e.clientX;
    const startWidth = this._sidebarWidth;

    const onMove = (e) => {
      this._sidebarWidth = Math.max(150, Math.min(500, startWidth + e.clientX - startX));
      const sidebar = this._container.querySelector('.hcp-sidebar');
      if (sidebar) sidebar.style.width = this._sidebarWidth + 'px';
    };
    const onUp = () => {
      this._resizingSidebar = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  _startSplitResize(e) {
    e.preventDefault();
    this._resizingSplit = true;
    const main = this._container.querySelector('.hcp-main');
    if (!main) return;
    const mainRect = main.getBoundingClientRect();
    const startY = e.clientY;
    const startRatio = this._splitRatio;

    const onMove = (e) => {
      const delta = (e.clientY - startY) / mainRect.height;
      this._splitRatio = Math.max(0.2, Math.min(0.8, startRatio + delta));
      const reqArea = main.querySelector('.hcp-request-area');
      const resArea = main.querySelector('.hcp-response-area');
      if (reqArea) reqArea.style.flex = this._splitRatio.toString();
      if (resArea) resArea.style.flex = (1 - this._splitRatio).toString();
    };
    const onUp = () => {
      this._resizingSplit = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
}
