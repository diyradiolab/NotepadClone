/**
 * Tree viewer for JSON and XML files.
 * Renders a collapsible tree into editorContainer, toggled via toolbar button.
 * Follows the same pattern as TableViewer and MarkdownPreview.
 */

export class TreeViewer {
  constructor(container) {
    this.container = container;
    this._onNodeClickCb = null;
    this._searchQuery = '';
    this._nodes = null;     // parsed tree root(s)
    this._format = '';      // 'json' or 'xml'
    this._nodeCount = 0;
  }

  onNodeClick(callback) {
    this._onNodeClickCb = callback;
  }

  render(content, filename) {
    this.container.innerHTML = '';
    this._nodeCount = 0;

    if (!content || !content.trim()) {
      this.container.innerHTML = '<div class="tree-viewer-empty">Empty file</div>';
      return;
    }

    const lower = (filename || '').toLowerCase();
    let nodes = null;

    if (lower.endsWith('.json')) {
      this._format = 'json';
      nodes = this._parseJSON(content);
    } else if (lower.endsWith('.xml')) {
      this._format = 'xml';
      nodes = this._parseXML(content);
    }

    if (!nodes) return; // error already rendered

    this._nodes = nodes;
    this._renderTree();
  }

  destroy() {
    this.container.innerHTML = '';
    this._nodes = null;
    this._searchQuery = '';
  }

  // ── JSON Parsing ──

  _parseJSON(content) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      this._renderError('Invalid JSON', e.message);
      return null;
    }

    // Build source line map
    const lineMap = this._buildJSONLineMap(content);

    // Build tree from parsed value
    const root = this._buildJSONNode(null, parsed, 0, '', lineMap);
    return [root];
  }

  _buildJSONLineMap(content) {
    // Map JSON paths to approximate line numbers by scanning for key positions
    const map = new Map();
    let line = 1;
    let inString = false;
    let escape = false;
    let depth = 0;
    let pathStack = [];   // stack of keys/indices at each depth
    let arrayIndexStack = []; // stack of array index counters
    let expectingKey = false;
    let currentKey = '';
    let collectingKey = false;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (ch === '\n') { line++; continue; }

      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }

      if (inString) {
        if (ch === '"') {
          inString = false;
          if (collectingKey) {
            collectingKey = false;
          }
        } else if (collectingKey) {
          currentKey += ch;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        if (expectingKey) {
          collectingKey = true;
          currentKey = '';
        }
        continue;
      }

      if (ch === '{') {
        if (arrayIndexStack.length > 0 && pathStack.length > 0) {
          const idx = arrayIndexStack[arrayIndexStack.length - 1];
          const path = [...pathStack, idx].join('.');
          map.set(path, line);
          arrayIndexStack[arrayIndexStack.length - 1] = idx + 1;
          pathStack.push(idx);
        } else if (currentKey) {
          const path = [...pathStack, currentKey].join('.');
          map.set(path, line);
          pathStack.push(currentKey);
          currentKey = '';
        } else {
          const path = pathStack.join('.');
          if (!map.has(path)) map.set(path, line);
        }
        depth++;
        expectingKey = true;
        arrayIndexStack.push(-1); // -1 = not an array
        continue;
      }

      if (ch === '[') {
        if (currentKey) {
          const path = [...pathStack, currentKey].join('.');
          map.set(path, line);
          pathStack.push(currentKey);
          currentKey = '';
        } else if (arrayIndexStack.length > 0 && arrayIndexStack[arrayIndexStack.length - 1] >= 0) {
          const idx = arrayIndexStack[arrayIndexStack.length - 1];
          const path = [...pathStack, idx].join('.');
          map.set(path, line);
          arrayIndexStack[arrayIndexStack.length - 1] = idx + 1;
          pathStack.push(idx);
        }
        depth++;
        arrayIndexStack.push(0); // 0 = array starting
        expectingKey = false;
        continue;
      }

      if (ch === '}') {
        depth--;
        arrayIndexStack.pop();
        if (pathStack.length > 0) pathStack.pop();
        expectingKey = false;
        continue;
      }

      if (ch === ']') {
        depth--;
        arrayIndexStack.pop();
        if (pathStack.length > 0) pathStack.pop();
        expectingKey = false;
        continue;
      }

      if (ch === ':') {
        if (currentKey) {
          const path = [...pathStack, currentKey].join('.');
          map.set(path, line);
        }
        expectingKey = false;
        continue;
      }

      if (ch === ',') {
        currentKey = '';
        // If in an object, next thing is a key
        if (arrayIndexStack.length > 0 && arrayIndexStack[arrayIndexStack.length - 1] === -1) {
          expectingKey = true;
        }
        continue;
      }
    }

    return map;
  }

  _buildJSONNode(key, value, depth, pathPrefix, lineMap) {
    this._nodeCount++;
    const path = key !== null ? (pathPrefix ? pathPrefix + '.' + key : String(key)) : pathPrefix;
    const sourceLine = lineMap.get(path) || null;

    if (value === null) {
      return { key, value: 'null', type: 'null', children: null, sourceLine, expanded: false, depth };
    }

    const t = typeof value;

    if (t === 'string') {
      return { key, value: `"${value}"`, type: 'string', children: null, sourceLine, expanded: false, depth };
    }
    if (t === 'number') {
      return { key, value: String(value), type: 'number', children: null, sourceLine, expanded: false, depth };
    }
    if (t === 'boolean') {
      return { key, value: String(value), type: 'boolean', children: null, sourceLine, expanded: false, depth };
    }

    if (Array.isArray(value)) {
      const children = value.map((item, idx) =>
        this._buildJSONNode(idx, item, depth + 1, path, lineMap)
      );
      return {
        key,
        value: null,
        type: 'array',
        children,
        sourceLine,
        expanded: depth < 2,
        depth,
        count: value.length,
      };
    }

    // Object
    const children = Object.keys(value).map(k =>
      this._buildJSONNode(k, value[k], depth + 1, path, lineMap)
    );
    return {
      key,
      value: null,
      type: 'object',
      children,
      sourceLine,
      expanded: depth < 2,
      depth,
      count: Object.keys(value).length,
    };
  }

  // ── XML Parsing ──

  _parseXML(content) {
    let doc;
    try {
      const parser = new DOMParser();
      doc = parser.parseFromString(content, 'application/xml');
    } catch (e) {
      this._renderError('Invalid XML', e.message);
      return null;
    }

    const parseError = doc.querySelector('parsererror');
    if (parseError) {
      this._renderError('Invalid XML', parseError.textContent);
      return null;
    }

    // Build line map for tag occurrences
    const tagLineMap = this._buildXMLLineMap(content);

    const root = this._buildXMLNode(doc.documentElement, 0, tagLineMap);
    return [root];
  }

  _buildXMLLineMap(content) {
    // Map: "tagName" → [line1, line2, ...] for each occurrence
    const map = new Map();
    const regex = /<([a-zA-Z_][\w.\-]*)/g;
    let match;
    let line = 1;
    let lastIdx = 0;

    while ((match = regex.exec(content)) !== null) {
      // Count newlines between lastIdx and match.index
      for (let i = lastIdx; i < match.index; i++) {
        if (content[i] === '\n') line++;
      }
      lastIdx = match.index;

      const tagName = match[1];
      if (!map.has(tagName)) map.set(tagName, []);
      map.get(tagName).push(line);
    }

    return map;
  }

  _buildXMLNode(element, depth, tagLineMap) {
    this._nodeCount++;
    const tagName = element.tagName;

    // Get source line from tagLineMap (consume first occurrence)
    let sourceLine = null;
    if (tagLineMap.has(tagName)) {
      const lines = tagLineMap.get(tagName);
      if (lines.length > 0) sourceLine = lines.shift();
    }

    // Attributes
    const attrs = [];
    for (const attr of element.attributes) {
      attrs.push({ name: attr.name, value: attr.value });
    }

    // Children elements
    const childElements = Array.from(element.children);
    const textContent = this._getDirectTextContent(element);

    if (childElements.length === 0) {
      // Leaf node — show text content as value
      return {
        key: tagName,
        value: textContent || '',
        type: 'xml-leaf',
        children: null,
        sourceLine,
        expanded: false,
        depth,
        attrs,
      };
    }

    // Branch node with child elements
    const children = childElements.map(child =>
      this._buildXMLNode(child, depth + 1, tagLineMap)
    );

    // If there's also text content mixed in, add it as a text child
    if (textContent) {
      children.unshift({
        key: '#text',
        value: textContent,
        type: 'xml-text',
        children: null,
        sourceLine: null,
        expanded: false,
        depth: depth + 1,
        attrs: [],
      });
    }

    return {
      key: tagName,
      value: null,
      type: 'xml-element',
      children,
      sourceLine,
      expanded: depth < 2,
      depth,
      count: children.length,
      attrs,
    };
  }

  _getDirectTextContent(element) {
    // Get only direct text nodes (not from children)
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }

  // ── Tree Rendering ──

  _renderTree() {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-viewer-wrapper';

    // Controls
    wrapper.appendChild(this._renderControls());

    // Tree content
    const tree = document.createElement('div');
    tree.className = 'tree-viewer-tree';

    for (const rootNode of this._nodes) {
      tree.appendChild(this._renderNode(rootNode));
    }

    wrapper.appendChild(tree);
    this.container.innerHTML = '';
    this.container.appendChild(wrapper);
  }

  _renderControls() {
    const controls = document.createElement('div');
    controls.className = 'tree-viewer-controls';

    const expandBtn = document.createElement('button');
    expandBtn.className = 'tree-viewer-btn';
    expandBtn.textContent = 'Expand All';
    expandBtn.addEventListener('click', () => this._expandAll());

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'tree-viewer-btn';
    collapseBtn.textContent = 'Collapse All';
    collapseBtn.addEventListener('click', () => this._collapseAll());

    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'tree-viewer-search';
    search.placeholder = 'Filter keys/values...';
    search.addEventListener('input', (e) => {
      this._searchQuery = e.target.value.toLowerCase();
      this._applyFilter();
    });

    const status = document.createElement('span');
    status.className = 'tree-viewer-status';
    status.textContent = `${this._format.toUpperCase()} \u2014 ${this._nodeCount} nodes`;

    controls.appendChild(expandBtn);
    controls.appendChild(collapseBtn);
    controls.appendChild(search);
    controls.appendChild(status);

    return controls;
  }

  _renderNode(node) {
    const container = document.createElement('div');
    container.className = 'tree-viewer-node';
    container.dataset.key = node.key !== null ? String(node.key) : '';
    container.dataset.type = node.type;

    const row = document.createElement('div');
    row.className = 'tree-viewer-row';

    const hasChildren = node.children && node.children.length > 0;

    // Arrow
    if (hasChildren) {
      const arrow = document.createElement('span');
      arrow.className = 'tree-viewer-arrow';
      arrow.textContent = node.expanded ? '\u25BC' : '\u25B6';
      arrow.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleNode(container, node);
      });
      row.appendChild(arrow);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'tree-viewer-arrow-placeholder';
      row.appendChild(spacer);
    }

    // Key
    if (node.key !== null) {
      const keySpan = document.createElement('span');
      if (node.type === 'xml-element' || node.type === 'xml-leaf') {
        keySpan.className = 'tree-viewer-tag';
        keySpan.textContent = `<${node.key}>`;
      } else {
        keySpan.className = 'tree-viewer-key';
        keySpan.textContent = typeof node.key === 'number' ? `[${node.key}]` : node.key;
      }
      row.appendChild(keySpan);
    }

    // XML attributes
    if (node.attrs && node.attrs.length > 0) {
      for (const attr of node.attrs) {
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tree-viewer-attr-name';
        nameSpan.textContent = attr.name + '=';
        row.appendChild(nameSpan);

        const valSpan = document.createElement('span');
        valSpan.className = 'tree-viewer-attr-value';
        valSpan.textContent = `"${attr.value}"`;
        row.appendChild(valSpan);
      }
    }

    // Colon + value (for primitives)
    if (node.children === null && node.value !== null && node.value !== undefined) {
      if (node.type !== 'xml-leaf' && node.type !== 'xml-text') {
        const colon = document.createElement('span');
        colon.className = 'tree-viewer-colon';
        colon.textContent = ':';
        row.appendChild(colon);
      } else if (node.value) {
        const colon = document.createElement('span');
        colon.className = 'tree-viewer-colon';
        colon.textContent = ':';
        row.appendChild(colon);
      }

      if (node.value) {
        const valSpan = document.createElement('span');
        valSpan.className = `tree-viewer-value--${node.type === 'xml-leaf' || node.type === 'xml-text' ? 'string' : node.type}`;
        valSpan.textContent = node.value;
        row.appendChild(valSpan);
      }
    }

    // Summary for objects/arrays
    if (hasChildren && node.count !== undefined) {
      const colon = document.createElement('span');
      colon.className = 'tree-viewer-colon';
      colon.textContent = ':';
      row.appendChild(colon);

      const summary = document.createElement('span');
      summary.className = 'tree-viewer-summary';
      if (node.type === 'object') {
        summary.textContent = `{${node.count} key${node.count !== 1 ? 's' : ''}}`;
      } else if (node.type === 'array') {
        summary.textContent = `[${node.count} item${node.count !== 1 ? 's' : ''}]`;
      } else if (node.type === 'xml-element') {
        summary.textContent = `(${node.count} child${node.count !== 1 ? 'ren' : ''})`;
      }
      row.appendChild(summary);
    }

    // Click handler — jump to source
    row.addEventListener('click', () => {
      if (node.sourceLine && this._onNodeClickCb) {
        this._onNodeClickCb(node.sourceLine);
      }
    });

    container.appendChild(row);

    // Children container (lazy: only render if expanded)
    if (hasChildren) {
      const childrenDiv = document.createElement('div');
      childrenDiv.className = 'tree-viewer-children' + (node.expanded ? '' : ' collapsed');

      if (node.expanded) {
        // Render children immediately for default-expanded nodes
        for (const child of node.children) {
          childrenDiv.appendChild(this._renderNode(child));
        }
        childrenDiv._rendered = true;
      } else {
        childrenDiv._rendered = false;
      }

      container.appendChild(childrenDiv);
      container._childrenDiv = childrenDiv;
      container._node = node;
    }

    return container;
  }

  _toggleNode(container, node) {
    const childrenDiv = container._childrenDiv;
    if (!childrenDiv) return;

    node.expanded = !node.expanded;

    // Update arrow
    const arrow = container.querySelector('.tree-viewer-arrow');
    if (arrow) arrow.textContent = node.expanded ? '\u25BC' : '\u25B6';

    if (node.expanded) {
      // Lazy render children on first expand
      if (!childrenDiv._rendered) {
        for (const child of node.children) {
          childrenDiv.appendChild(this._renderNode(child));
        }
        childrenDiv._rendered = true;
      }
      childrenDiv.classList.remove('collapsed');
    } else {
      childrenDiv.classList.add('collapsed');
    }
  }

  // ── Expand/Collapse All ──

  _expandAll() {
    if (!this._nodes) return;
    this._setExpandAll(this._nodes, true);
    this._renderTree();
  }

  _collapseAll() {
    if (!this._nodes) return;
    this._setExpandAll(this._nodes, false);
    this._renderTree();
  }

  _setExpandAll(nodes, expanded) {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        node.expanded = expanded;
        this._setExpandAll(node.children, expanded);
      }
    }
  }

  // ── Search/Filter ──

  _applyFilter() {
    const wrapper = this.container.querySelector('.tree-viewer-wrapper');
    if (!wrapper) return;

    const query = this._searchQuery;
    const allNodes = wrapper.querySelectorAll('.tree-viewer-node');

    if (!query) {
      // Clear all filter styles
      for (const el of allNodes) {
        el.classList.remove('tree-viewer-search-match', 'tree-viewer-search-nomatch');
      }
      return;
    }

    // Mark each node as match or nomatch
    for (const el of allNodes) {
      const row = el.querySelector(':scope > .tree-viewer-row');
      if (!row) continue;

      const text = row.textContent.toLowerCase();
      if (text.includes(query)) {
        el.classList.add('tree-viewer-search-match');
        el.classList.remove('tree-viewer-search-nomatch');
        // Ensure parent chain is visible
        this._expandParentChain(el);
      } else {
        el.classList.remove('tree-viewer-search-match');
        el.classList.add('tree-viewer-search-nomatch');
      }
    }

    // Show matched nodes' parents even if they don't match
    for (const el of wrapper.querySelectorAll('.tree-viewer-search-match')) {
      let parent = el.parentElement;
      while (parent && parent !== wrapper) {
        if (parent.classList.contains('tree-viewer-node')) {
          parent.classList.remove('tree-viewer-search-nomatch');
        }
        parent = parent.parentElement;
      }
    }
  }

  _expandParentChain(el) {
    let parent = el.parentElement;
    while (parent) {
      if (parent.classList.contains('tree-viewer-children') && parent.classList.contains('collapsed')) {
        parent.classList.remove('collapsed');
        // Lazy render if needed
        if (!parent._rendered && parent.parentElement && parent.parentElement._node) {
          const node = parent.parentElement._node;
          if (node.children) {
            for (const child of node.children) {
              parent.appendChild(this._renderNode(child));
            }
            parent._rendered = true;
          }
        }
        // Update arrow
        const arrow = parent.parentElement?.querySelector(':scope > .tree-viewer-row > .tree-viewer-arrow');
        if (arrow) arrow.textContent = '\u25BC';
      }
      parent = parent.parentElement;
    }
  }

  // ── Error rendering ──

  _renderError(title, detail) {
    this.container.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'tree-viewer-error';

    const titleEl = document.createElement('div');
    titleEl.className = 'tree-viewer-error-title';
    titleEl.textContent = title;
    div.appendChild(titleEl);

    if (detail) {
      const detailEl = document.createElement('div');
      detailEl.className = 'tree-viewer-error-detail';
      detailEl.textContent = detail;
      div.appendChild(detailEl);
    }

    this.container.appendChild(div);
  }
}
