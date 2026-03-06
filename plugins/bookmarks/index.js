export function activate(api) {
  // bookmarks: Map<filePath, Set<lineNumber>>
  const bookmarks = new Map();
  let decorationIds = [];
  let styleSheet = null;

  // Inject gutter icon CSS
  function ensureStyles() {
    if (styleSheet) return;
    styleSheet = document.createElement('style');
    styleSheet.textContent = `
      .bookmark-glyph {
        background: #3794ff;
        border-radius: 50%;
        width: 8px !important;
        height: 8px !important;
        margin-left: 4px;
        margin-top: 6px;
        display: inline-block;
      }
      .bookmark-line-highlight {
        background: rgba(55, 148, 255, 0.08);
      }
      .bookmarks-panel-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.5);
        display: flex; align-items: flex-start; justify-content: center;
        padding-top: 80px; z-index: 10000;
      }
      .bookmarks-panel {
        background: var(--bg-color, #1e1e1e); color: var(--text-color, #d4d4d4);
        border: 1px solid var(--border-color, #444); border-radius: 6px;
        padding: 16px; min-width: 500px; max-width: 700px; max-height: 500px;
        font-family: system-ui, sans-serif; font-size: 13px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5); overflow: auto;
      }
      .bookmarks-panel .bm-item {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 8px; border-radius: 4px; cursor: pointer;
      }
      .bookmarks-panel .bm-item:hover {
        background: var(--hover-bg, #2a2d2e);
      }
      .bookmarks-panel .bm-dot {
        width: 8px; height: 8px; border-radius: 50%; background: #3794ff; flex-shrink: 0;
      }
      .bookmarks-panel .bm-file {
        color: #888; font-size: 12px;
      }
      .bookmarks-panel .bm-line {
        color: #3794ff; font-size: 12px; font-family: monospace;
      }
      .bookmarks-panel .bm-remove {
        margin-left: auto; background: none; border: none; color: #888;
        cursor: pointer; font-size: 14px; padding: 2px 6px;
      }
      .bookmarks-panel .bm-remove:hover { color: #f44336; }
    `;
    document.head.appendChild(styleSheet);
  }

  ensureStyles();

  function getFileKey() {
    const tabId = api.tabs.getActiveId();
    const tab = api.tabs.getTab(tabId);
    return tab?.filePath || `untitled:${tabId}`;
  }

  function getBookmarksForFile(fileKey) {
    if (!bookmarks.has(fileKey)) bookmarks.set(fileKey, new Set());
    return bookmarks.get(fileKey);
  }

  function toggleBookmark() {
    const editor = api.editor.getActiveEditor();
    if (!editor) return;

    const line = editor.getPosition().lineNumber;
    const fileKey = getFileKey();
    const lines = getBookmarksForFile(fileKey);

    if (lines.has(line)) {
      lines.delete(line);
    } else {
      lines.add(line);
    }

    updateDecorations(editor, fileKey);
    saveBookmarks();
  }

  function nextBookmark() {
    navigateBookmark(1);
  }

  function prevBookmark() {
    navigateBookmark(-1);
  }

  function navigateBookmark(direction) {
    const editor = api.editor.getActiveEditor();
    if (!editor) return;

    const fileKey = getFileKey();
    const lines = getBookmarksForFile(fileKey);
    if (lines.size === 0) return;

    const sorted = [...lines].sort((a, b) => a - b);
    const currentLine = editor.getPosition().lineNumber;

    let target;
    if (direction > 0) {
      target = sorted.find(l => l > currentLine) || sorted[0];
    } else {
      target = [...sorted].reverse().find(l => l < currentLine) || sorted[sorted.length - 1];
    }

    editor.revealLineInCenter(target);
    editor.setPosition({ lineNumber: target, column: 1 });
    editor.focus();
  }

  function updateDecorations(editor, fileKey) {
    const lines = getBookmarksForFile(fileKey);
    const decorations = [...lines].map(line => ({
      range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
      options: {
        isWholeLine: true,
        className: 'bookmark-line-highlight',
        glyphMarginClassName: 'bookmark-glyph',
        stickiness: 1, // AlwaysGrowsWhenTypingAtEdges
      },
    }));

    decorationIds = editor.deltaDecorations(decorationIds, decorations);
  }

  function showAllBookmarks() {
    const existing = document.querySelector('.bookmarks-panel-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'bookmarks-panel-overlay';

    const panel = document.createElement('div');
    panel.className = 'bookmarks-panel';

    let html = '<h3 style="margin:0 0 12px; font-size:15px;">Bookmarks</h3>';

    let hasBookmarks = false;
    for (const [fileKey, lines] of bookmarks) {
      if (lines.size === 0) continue;
      hasBookmarks = true;
      const fileName = fileKey.includes('/') || fileKey.includes('\\')
        ? fileKey.split('/').pop().split('\\').pop()
        : fileKey;

      const sorted = [...lines].sort((a, b) => a - b);
      for (const line of sorted) {
        html += `
          <div class="bm-item" data-file="${escapeHtml(fileKey)}" data-line="${line}">
            <span class="bm-dot"></span>
            <span class="bm-file">${escapeHtml(fileName)}</span>
            <span class="bm-line">Line ${line}</span>
            <button class="bm-remove" data-file="${escapeHtml(fileKey)}" data-line="${line}" title="Remove">&times;</button>
          </div>
        `;
      }
    }

    if (!hasBookmarks) {
      html += '<div style="text-align:center; color:#888; padding:20px;">No bookmarks set</div>';
    }

    html += '<div style="margin-top:12px; text-align:right;"><button class="bm-close" style="padding:6px 16px; background:#555; color:#fff; border:none; border-radius:4px; cursor:pointer;">Close</button></div>';

    panel.innerHTML = html;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Events
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    panel.querySelector('.bm-close').addEventListener('click', () => overlay.remove());
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); }
    });

    // Click to navigate
    panel.querySelectorAll('.bm-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('bm-remove')) return;
        const fileKey = item.dataset.file;
        const line = parseInt(item.dataset.line, 10);
        overlay.remove();
        jumpToBookmark(fileKey, line);
      });
    });

    // Remove buttons
    panel.querySelectorAll('.bm-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fileKey = btn.dataset.file;
        const line = parseInt(btn.dataset.line, 10);
        const lines = bookmarks.get(fileKey);
        if (lines) {
          lines.delete(line);
          if (lines.size === 0) bookmarks.delete(fileKey);
        }
        saveBookmarks();
        btn.closest('.bm-item').remove();
        // Update decorations if this is the active file
        const currentKey = getFileKey();
        if (currentKey === fileKey) {
          const editor = api.editor.getActiveEditor();
          if (editor) updateDecorations(editor, fileKey);
        }
      });
    });
  }

  function jumpToBookmark(fileKey, line) {
    if (fileKey.startsWith('untitled:')) {
      // Jump to tab
      const tabId = fileKey.replace('untitled:', '');
      api.tabs.activate(tabId);
    } else {
      // Open file by path
      api.events.emit('file:openByPath', { filePath: fileKey, lineNumber: line });
      return;
    }
    // Navigate to line
    setTimeout(() => {
      const editor = api.editor.getActiveEditor();
      if (editor) {
        editor.revealLineInCenter(line);
        editor.setPosition({ lineNumber: line, column: 1 });
        editor.focus();
      }
    }, 100);
  }

  function saveBookmarks() {
    const data = {};
    for (const [key, lines] of bookmarks) {
      if (lines.size > 0) data[key] = [...lines];
    }
    try {
      localStorage.setItem('npc-bookmarks', JSON.stringify(data));
    } catch (_) { /* quota exceeded */ }
  }

  function loadBookmarks() {
    try {
      const stored = localStorage.getItem('npc-bookmarks');
      if (stored) {
        const data = JSON.parse(stored);
        for (const [key, lines] of Object.entries(data)) {
          bookmarks.set(key, new Set(lines));
        }
      }
    } catch (_) { /* corrupt data */ }
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Update decorations when switching tabs
  function onTabActivated() {
    setTimeout(() => {
      const editor = api.editor.getActiveEditor();
      if (!editor) return;
      const fileKey = getFileKey();
      decorationIds = [];
      updateDecorations(editor, fileKey);
    }, 50);
  }

  // Load saved bookmarks
  loadBookmarks();

  // Listen for tab changes
  api.events.on('tab:activated', onTabActivated);

  // Register commands
  api.registerCommand({ id: 'bookmarks.toggle', title: 'Toggle Bookmark', handler: toggleBookmark });
  api.registerCommand({ id: 'bookmarks.nextBookmark', title: 'Next Bookmark', handler: nextBookmark });
  api.registerCommand({ id: 'bookmarks.prevBookmark', title: 'Previous Bookmark', handler: prevBookmark });
  api.registerCommand({ id: 'bookmarks.showAll', title: 'Show All Bookmarks', handler: showAllBookmarks });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // F2 = next, Shift+F2 = prev
    if (e.key === 'F2' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) {
        prevBookmark();
      } else {
        nextBookmark();
      }
    }
  });

  return {
    toggleBookmark,
    nextBookmark,
    prevBookmark,
    showAllBookmarks,
    deactivate() {
      if (styleSheet) styleSheet.remove();
      api.events.off('tab:activated', onTabActivated);
    },
  };
}
