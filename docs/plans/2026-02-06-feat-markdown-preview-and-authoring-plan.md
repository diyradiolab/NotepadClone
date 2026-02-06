---
title: "feat: Markdown preview and authoring"
type: feat
date: 2026-02-06
revised: true
---

# Markdown Preview & Authoring

## Overview

Add a markdown reading and authoring system. When a `.md` file is opened, it renders as formatted HTML by default — headings, bold, links, images display naturally. A toolbar toggle switches between Read (rendered) and Edit (Monaco source) modes. In Edit mode, a formatting toolbar provides buttons for inserting common markdown syntax.

Brainstorm: `docs/brainstorms/2026-02-06-markdown-preview-brainstorm.md`

## Proposed Solution

**Inline toggle approach**: The markdown preview replaces the Monaco editor area in the same tab. Each `.md` tab tracks its mode (Read/Edit) via a flag on the tab object (single source of truth). This follows the established pattern for custom tab types (`isHistoryTab`, `isDiffTab`, `isLargeFile`).

**Dependencies (2):**
- `markdown-it` — CommonMark + GFM rendering (tables, strikethrough)
- `dompurify` — HTML sanitization to prevent XSS from untrusted markdown

No new IPC channels needed — rendering is purely renderer-side (editor content -> HTML).

## Technical Approach

### Architecture

```
Tab opened (.md file)
  -> TabManager creates tab with isMarkdown: true, markdownMode: 'read'
  -> EditorManager stores model (for Edit mode) — no markdown flags on entry
  -> index.js onActivate routes to MarkdownPreview.render()

Toggle to Edit:
  -> tab.markdownMode = 'edit'
  -> markdownPreview.destroy()
  -> EditorManager activateTab() creates Monaco editor as normal
  -> Formatting toolbar shown

Toggle to Read:
  -> Save Monaco viewState, dispose editor
  -> tab.markdownMode = 'read'
  -> MarkdownPreview re-renders from model content
  -> Formatting toolbar hidden
```

**State ownership**: `markdownMode` lives on the `tab` object only. EditorManager does not track markdown state — the routing in `index.js` prevents `editorManager.activateTab()` from being called for markdown-read tabs, so no guard is needed in EditorManager.

**Key integration points:**
- `index.js` `tabManager.onActivate()` — add markdown routing alongside existing `isLargeFile`, `isHistoryTab`, `isDiffTab`
- `index.js` toolbar click handler — add `markdown-toggle` action and formatting actions
- `index.js` `tabManager.onClose()` — add cleanup for markdown preview

### Implementation Phases

#### Phase 1: Preview + Toggle

This is the minimum viable feature — preview and toggle ship together. A preview with no toggle is an editor that can't edit.

**New files:**
- `src/renderer/components/markdown-preview.js` — MarkdownPreview class
- `src/renderer/styles/markdown-preview.css` — preview styling with `.mdp-` prefix

**Modified files:**
- `src/renderer/index.html` — add toggle button to toolbar, add formatting toolbar row, update CSP
- `src/renderer/index.js` — import MarkdownPreview, wire tab activation routing, toggle logic, toolbar handlers
- `package.json` — add `markdown-it`, `dompurify`

**MarkdownPreview component (`src/renderer/components/markdown-preview.js`):**
```javascript
import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

export class MarkdownPreview {
  constructor(container) {
    this.container = container;  // editorManager.container
    this.md = new MarkdownIt({ html: true, linkify: true, typographer: true });
    this.scrollTop = 0;  // per-render scroll position
  }

  render(markdownContent, filePath) {
    const rawHtml = this.md.render(markdownContent);
    const clean = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['h1','h2','h3','h4','h5','h6','p','a','img','ul','ol','li',
                     'code','pre','blockquote','table','thead','tbody','tr','th','td',
                     'strong','em','del','br','hr','input','span','div'],
      ALLOWED_ATTR: ['href','src','alt','title','class','type','checked','disabled'],
      ALLOW_DATA_ATTR: false,
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'mdp-content';
    wrapper.innerHTML = clean;

    // Resolve relative image paths
    this._resolveImagePaths(wrapper, filePath);

    // Open links in system browser
    wrapper.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link) {
        e.preventDefault();
        window.api.openExternal(link.href);
      }
    });

    this.container.innerHTML = '';
    this.container.appendChild(wrapper);
    wrapper.scrollTop = this.scrollTop;
  }

  saveScrollPosition() {
    const wrapper = this.container.querySelector('.mdp-content');
    if (wrapper) this.scrollTop = wrapper.scrollTop;
  }

  _resolveImagePaths(wrapper, filePath) {
    if (!filePath) return;
    const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));

    wrapper.querySelectorAll('img').forEach(img => {
      const src = img.getAttribute('src');
      if (!src) return;
      // Only resolve paths that are clearly relative (no protocol)
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(src) || src.startsWith('//')) return;
      // Resolve relative path from file's directory
      const resolved = fileDir + '/' + src;
      img.src = 'local-image://' + encodeURIComponent(resolved);
    });
  }

  destroy() {
    this.saveScrollPosition();
    this.container.innerHTML = '';
  }
}
```

**CSP + Custom protocol for images:**

Instead of adding bare `file:` to the global CSP (too broad for an Electron app), register a custom protocol in the main process:

```javascript
// main.js — register custom protocol for preview images
const { protocol, net } = require('electron');

protocol.handle('local-image', (request) => {
  const filePath = decodeURIComponent(request.url.replace('local-image://', ''));
  return net.fetch('file://' + filePath);
});
```

CSP update in `index.html`:
```html
<meta http-equiv="Content-Security-Policy"
  content="... img-src 'self' data: local-image:;">
```

This limits image loading to the explicit `local-image://` protocol rather than opening all `file://` access.

**Tab activation routing in `index.js`:**
```javascript
tabManager.onActivate((tabId) => {
  const tab = tabManager.getTab(tabId);

  if (tab && tab.isMarkdown && tab.markdownMode === 'read') {
    // Save previous editor state if switching from a normal tab
    editorManager.deactivateCurrentTab();
    editorManager.activeTabId = tabId;
    const entry = editorManager.editors.get(tabId);
    const content = entry.model.getValue();
    markdownPreview.render(content, tab.filePath);
    statusBar.updateLanguage('Markdown (Read)');
    updateMarkdownToolbar(true, 'read');
  } else if (tab && tab.isLargeFile) {
    // existing...
  } else if (tab && tab.isHistoryTab) {
    // existing...
  } else if (tab && tab.isDiffTab) {
    // existing...
  } else {
    editorManager.activateTab(tabId);
    if (tab && tab.isMarkdown) {
      updateMarkdownToolbar(true, 'edit');
    } else {
      updateMarkdownToolbar(false);
    }
  }
});
```

**File open flow** — detect `.md` extension:
```javascript
// In openFile / openFileByPath
const tabId = tabManager.createTab(filename, filePath, encoding);
const tab = tabManager.getTab(tabId);

if (filename.endsWith('.md') || filename.endsWith('.markdown')) {
  tab.isMarkdown = true;
  tab.markdownMode = 'read';  // Default to read
}

// Always create the Monaco model (needed for Edit mode)
const langInfo = editorManager.createEditorForTab(tabId, content, filename);

// Activation routing handles the rest — onActivate will render preview or editor
tabManager.activate(tabId);
```

Note: `markdownMode` is on the `tab` object only. No flags on the EditorManager entry. No guard needed in `editor-manager.js` — the `onActivate` routing in `index.js` handles all branching.

**Toggle logic in `index.js`:**
```javascript
case 'markdown-toggle': toggleMarkdownMode(); break;

function toggleMarkdownMode() {
  const tabId = tabManager.getActiveTabId();
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.isMarkdown) return;

  const entry = editorManager.editors.get(tabId);

  if (tab.markdownMode === 'read') {
    // Switch to edit
    tab.markdownMode = 'edit';
    markdownPreview.destroy();
    editorManager.activateTab(tabId);  // Creates Monaco editor, restores viewState
    updateMarkdownToolbar(true, 'edit');
    statusBar.updateLanguage('Markdown (Edit)');
  } else {
    // Switch to read — save editor state first
    const editor = editorManager.getActiveEditor();
    if (editor && entry) {
      entry.viewState = editor.saveViewState();
      editor.dispose();
      entry.editor = null;
    }
    tab.markdownMode = 'read';
    editorManager.container.innerHTML = '';
    const content = entry.model.getValue();
    markdownPreview.render(content, tab.filePath);
    updateMarkdownToolbar(true, 'read');
    statusBar.updateLanguage('Markdown (Read)');
  }
}
```

**Toggle button in `index.html`:**
```html
<span class="toolbar-separator" id="md-separator" style="display:none"></span>
<button class="toolbar-btn" data-action="markdown-toggle" id="btn-markdown-toggle"
        title="Toggle Read/Edit Mode (Ctrl+Shift+M)" style="display:none">
  <span class="toolbar-icon"><!-- pencil/eye SVG icon --></span>
</button>
```

**Keyboard shortcut**: `Ctrl+Shift+M` for mode toggle — register globally via `window.api.onMenuMarkdownToggle`.

**Button visibility** — `updateMarkdownToolbar(isMarkdown, mode)`:
- Show toggle button when active tab is `.md`
- Toggle icon: eye icon (in read mode, click to edit) vs pencil (in edit mode, click to read)
- Show formatting toolbar only when `mode === 'edit'`
- Hide both when switching to non-markdown tab

**Close cleanup** — add to `tabManager.onClose()`:
```javascript
// In onClose handler
if (tab && tab.isMarkdown && tab.markdownMode === 'read') {
  markdownPreview.destroy();
}
```

**Save As transition** — in `saveFileAs()`, after the new filename is set:
```javascript
// After successful Save As
if (newFilename.endsWith('.md') || newFilename.endsWith('.markdown')) {
  if (!tab.isMarkdown) {
    tab.isMarkdown = true;
    tab.markdownMode = 'edit';  // Stay in edit mode after Save As
    updateMarkdownToolbar(true, 'edit');
  }
} else if (tab.isMarkdown) {
  // Was .md, saved as something else — remove markdown mode
  tab.isMarkdown = false;
  delete tab.markdownMode;
  updateMarkdownToolbar(false);
}
```

**External file change** — in the file watcher reload handler, after updating model content:
```javascript
// After editorManager.setContent(tabId, file.content)
if (tab.isMarkdown && tab.markdownMode === 'read') {
  const entry = editorManager.editors.get(tabId);
  markdownPreview.render(entry.model.getValue(), tab.filePath);
}
```

**Preview CSS** — theme-aware with readable typography:
- Max-width 800px, centered, for comfortable reading
- Headings, paragraphs, lists, tables, code blocks styled
- Uses CSS variables from `main.css` (`--bg-primary`, `--text-primary`, etc.)
- Code blocks get monospace font, subtle background
- Links colored with `--input-border-focus` for visibility
- Images constrained: `max-width: 100%; height: auto;`
- Overflow-y: auto on the wrapper for scrolling

#### Phase 2: Formatting Toolbar

**No new files** — toolbar logic inlined into `index.js` following the existing toolbar pattern.

**HTML — secondary toolbar row below main toolbar in `index.html`:**
```html
<div id="markdown-format-toolbar" class="markdown-format-toolbar" style="display:none">
  <button class="mft-btn" data-md-action="bold" title="Bold (Ctrl+B)"><b>B</b></button>
  <button class="mft-btn" data-md-action="italic" title="Italic (Ctrl+I)"><i>I</i></button>
  <span class="toolbar-separator"></span>
  <button class="mft-btn" data-md-action="h1" title="Heading 1">H1</button>
  <button class="mft-btn" data-md-action="h2" title="Heading 2">H2</button>
  <span class="toolbar-separator"></span>
  <button class="mft-btn" data-md-action="ul" title="Bullet List"><!-- list icon --></button>
  <button class="mft-btn" data-md-action="ol" title="Numbered List"><!-- numbered icon --></button>
  <span class="toolbar-separator"></span>
  <button class="mft-btn" data-md-action="link" title="Insert Link (Ctrl+Shift+K)"><!-- link icon --></button>
  <button class="mft-btn" data-md-action="code" title="Inline Code"><!-- code icon --></button>
</div>
```

**8 buttons** covering the 90% case: bold, italic, H1, H2, bullet list, numbered list, link, inline code. Additional buttons (strikethrough, H3, checklist, image, code block, blockquote, table, hr) can be added later based on user demand.

**Data-driven action map in `index.js`:**
```javascript
const MARKDOWN_ACTIONS = {
  bold:   { wrap: '**', placeholder: 'text' },
  italic: { wrap: '*',  placeholder: 'text' },
  code:   { wrap: '`',  placeholder: 'code' },
  h1:     { linePrefix: '# ',  placeholder: 'Heading' },
  h2:     { linePrefix: '## ', placeholder: 'Heading' },
  ul:     { linePrefix: '- ',  placeholder: 'Item' },
  ol:     { linePrefix: '1. ', placeholder: 'Item' },
  link:   { before: '[', after: '](url)', placeholder: 'text', cursorTarget: 'url' },
};

function formatMarkdown(action, editor) {
  const spec = MARKDOWN_ACTIONS[action];
  if (!spec || !editor) return;

  const selection = editor.getSelection();
  const selectedText = editor.getModel().getValueInRange(selection);

  if (spec.wrap) {
    wrapSelection(editor, selection, selectedText, spec.wrap, spec.placeholder);
  } else if (spec.linePrefix) {
    prefixLines(editor, selection, selectedText, spec.linePrefix, spec.placeholder);
  } else if (spec.before) {
    insertAround(editor, selection, selectedText, spec);
  }

  editor.focus();
}
```

Three generic functions (`wrapSelection`, `prefixLines`, `insertAround`) handle all 8 actions. Adding more actions later means adding entries to the map, not writing new functions.

**Click handler** — added to existing toolbar delegation in `index.js`:
```javascript
document.getElementById('markdown-format-toolbar').addEventListener('click', (e) => {
  const btn = e.target.closest('.mft-btn');
  if (!btn) return;
  formatMarkdown(btn.dataset.mdAction, editorManager.getActiveEditor());
});
```

**Formatting behavior reference:**

| Action | With Selection | Without Selection |
|--------|---------------|-------------------|
| bold | `**selection**` | `**text**` (selects "text") |
| italic | `*selection*` | `*text*` (selects "text") |
| code | `` `selection` `` | `` `code` `` (selects "code") |
| h1 | Prepend `# ` to line | Insert `# Heading` |
| h2 | Prepend `## ` to line | Insert `## Heading` |
| ul | Prepend `- ` to each selected line | Insert `- Item` |
| ol | Prepend `1. ` to each selected line | Insert `1. Item` |
| link | `[selection](url)` (cursor on "url") | `[text](url)` (cursor on "url") |

**Keyboard shortcuts** — register via Monaco `editor.addAction` with precondition context:
- `Ctrl+B` — bold (safe: Monaco doesn't bind Ctrl+B in standard editor context)
- `Ctrl+I` — italic (safe: Monaco doesn't bind Ctrl+I by default)
- `Ctrl+Shift+K` — link (avoids Ctrl+K which is Monaco's chord starter for Ctrl+K Ctrl+C etc.)

Register shortcuts only when a markdown file is in Edit mode using a Monaco context key. Do not use global keyboard handlers.

## Acceptance Criteria

### Functional Requirements

- [ ] Opening a `.md` file shows rendered HTML by default (headings, bold, lists, links, images, code blocks, tables)
- [ ] Toggle button in toolbar switches between Read and Edit mode
- [ ] Keyboard shortcut `Ctrl+Shift+M` toggles mode
- [ ] Toggle button only appears when active tab is a `.md` file
- [ ] Edit mode shows Monaco editor with markdown syntax highlighting
- [ ] Formatting toolbar (8 buttons) appears only in Edit mode for `.md` files
- [ ] Formatting buttons work with and without text selection
- [ ] Relative image paths in preview resolve from the file's directory via `local-image://` protocol
- [ ] External images (http/https) load in preview
- [ ] Preview matches app theme (light/dark) and switches dynamically
- [ ] Links in preview open in system browser
- [ ] Saving from Edit mode works normally (Ctrl+S)
- [ ] Tab dirty indicator works in Edit mode
- [ ] Switching between tabs correctly shows/hides preview and formatting toolbar
- [ ] Closing a markdown tab calls `markdownPreview.destroy()` for cleanup
- [ ] Closing a markdown tab with unsaved changes shows save prompt
- [ ] HTML in markdown is sanitized via DOMPurify with explicit allowlist
- [ ] External file changes re-render preview when in Read mode
- [ ] Files saved as `.md` via Save As transition to markdown mode (stay in Edit)

### Edge Cases

- [ ] Unsaved new files (no filePath) show preview; images with relative paths show broken icon gracefully
- [ ] Tab dirty state preserved across Read/Edit toggles
- [ ] Monaco undo history preserved across Read/Edit toggles (model persists)
- [ ] Monaco viewState (cursor, scroll) restored when toggling back to Edit

## Dependencies & Risks

**Dependencies (2):**
- `markdown-it` (npm) — well-maintained, MIT license, ~100KB minified
- `dompurify` (npm) — industry standard sanitizer, ~50KB minified

**Risks:**
- **Custom protocol registration**: Requires `protocol.handle` in main process before app ready. If registration fails, images won't load — fail gracefully with broken image icons.
- **Monaco keyboard shortcut conflicts**: Ctrl+B/I registered via `editor.addAction` with precondition context key to avoid overriding shortcuts in non-markdown files. Ctrl+K avoided entirely (chord starter).
- **`path` module unavailable in renderer**: Image path resolution uses string manipulation (no `require('path')`) since `nodeIntegration` is false. Preload could expose a `resolvePath` utility if needed.

## File Summary

**New files (2):**
- `src/renderer/components/markdown-preview.js`
- `src/renderer/styles/markdown-preview.css`

**Modified files:**
- `src/main/main.js` — register `local-image://` protocol
- `src/renderer/index.html` — toggle button, formatting toolbar row, CSP update
- `src/renderer/index.js` — MarkdownPreview import, activation routing, toggle logic, formatting handlers, close/save-as/watcher handlers
- `package.json` — add `markdown-it`, `dompurify`

**Not modified:**
- `src/renderer/editor/editor-manager.js` — no guard needed; routing prevents calls

## References

### Internal References
- Custom tab type pattern: `docs/solutions/integration-issues/adding-custom-tab-types-to-editor-system.md`
- Tab activation routing: `src/renderer/index.js:298-366`
- Editor manager activation: `src/renderer/editor/editor-manager.js:51-119`
- Toolbar button pattern: `src/renderer/index.html:12-76`
- Toolbar click handler: `src/renderer/index.js:720-745`
- Theme switching: `src/renderer/index.js:264-294`
- Git History Panel (custom tab reference): `src/renderer/components/git-history-panel.js`
- CSS theme variables: `src/renderer/styles/main.css:1-70`
- CSP header: `src/renderer/index.html:6`

### Brainstorm
- `docs/brainstorms/2026-02-06-markdown-preview-brainstorm.md`

### Review Notes
- Reviewed by DHH, Kieran, and Simplicity reviewers (2026-02-06)
- Key changes from review: single source of truth for state, custom protocol instead of `file:` CSP, explicit DOMPurify allowlist, merged Phase 1+2, reduced toolbar to 8 buttons, data-driven action map, no separate toolbar class, Ctrl+Shift+K for links (not Ctrl+K)
