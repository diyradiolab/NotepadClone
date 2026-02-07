---
title: "CSV/JSON/XML table viewer with read/edit toggle"
category: integration-issues
tags: [table-viewer, csv, json, xml, tab-system, read-edit-toggle, monaco-editor, custom-tabs]
module: renderer
symptoms:
  - Structured data files (CSV, JSON, XML) only viewable as raw text
  - No way to sort or visually inspect tabular data without external tools
root_cause: no table rendering existed — structured data formats treated identically to plain text
date_solved: 2026-02-06
severity: low
---

# CSV/JSON/XML Table Viewer

## Context

NotepadClone had a markdown preview that toggles between read mode (rendered HTML) and edit mode (Monaco editor). CSV, TSV, JSON, and XML files with tabular structure opened as raw text with no visual table representation.

## Approach

Mirror the markdown preview pattern exactly — the same deactivate-previous / render-in-container / toggle-via-toolbar flow that `MarkdownPreview` uses. No external dependencies needed: CSV parsing is a state machine (~50 lines), JSON uses native `JSON.parse`, XML uses the browser's `DOMParser`.

## Architecture

### File detection (three tiers)

```js
// Always table mode:
if (isTableExtension(filename))        // .csv, .tsv

// Table mode if content qualifies:
if (filename.endsWith('.json'))
  if (isTableJSON(file.content))       // Array.isArray + objects

if (filename.endsWith('.xml'))
  if (isTableXML(file.content))        // Repeating child elements
```

### Tab metadata

```js
tab.isTableFile = true;     // boolean — this tab supports table view
tab.tableMode = 'table';    // 'table' | 'edit'
```

### CSV parser

State-machine handles quoted fields with escaped quotes (`""`). Auto-detects delimiter from first line:
- `.tsv` → tab
- Otherwise: tab > semicolon > pipe > comma (whichever appears and the others don't)

### Source line mapping

Each format builds a `sourceLineMap` array mapping row index → source line number. This enables clicking a table row to jump to that line in the editor.

- **CSV**: Walks character-by-character tracking newlines inside/outside quotes
- **JSON**: Tracks `{` at depth 1 inside the top-level array
- **XML**: Regex search for opening tags of the repeating element

## Key Integration Points in index.js

### 1. Tab activation branch (onActivate)

Added as the **first** branch (before markdown read mode):

```js
if (tab && tab.isTableFile && tab.tableMode === 'table') {
  // Deactivate previous tab (same pattern as markdown)
  editorManager.container.innerHTML = '';
  editorManager.activeTabId = tabId;
  tableViewer.render(content, tab.title);
  updateTableToolbar(true, 'table');
  updateMarkdownToolbar(false);
}
```

### 2. All other branches get `updateTableToolbar(false)`

Every existing branch (markdown, large file, history, diff, default) now calls `updateTableToolbar(false)` to hide the table toggle button.

### 3. Toggle function mirrors markdown toggle

```js
function toggleTableMode() {
  if (tab.tableMode === 'table') {
    tableViewer.destroy();
    editorManager.activateTab(tabId);  // restores editor
  } else {
    editor.saveViewState(); editor.dispose();
    tableViewer.render(content, tab.title);
  }
}
```

### 4. File detection in both open paths

Detection code added to both `openFileByPath()` and `openFile()` — the two entry points for opening files.

### 5. Toolbar button + keyboard shortcut

- Toolbar: `data-action="table-toggle"` button, hidden by default
- Keyboard: `Ctrl+Shift+T` (or `Cmd+Shift+T` on macOS)

## Files Created

| File | Purpose |
|------|---------|
| `src/renderer/components/table-viewer.js` | `TableViewer` class + `isTableFile`, `isTableJSON`, `isTableXML` helpers |
| `src/renderer/styles/table-viewer.css` | `tv-` prefixed styles: sticky headers, row numbers, sort indicators |

## Files Modified

| File | Changes |
|------|---------|
| `src/renderer/index.html` | Added table toggle toolbar button after markdown toggle |
| `src/renderer/index.js` | Import, instantiate, file detection, tab activation, toggle, cleanup, watcher, toolbar handler, keyboard shortcut |

## Relationship to Existing Patterns

This follows the custom tab type pattern documented in [adding-custom-tab-types-to-editor-system.md](./adding-custom-tab-types-to-editor-system.md), but with one difference: table viewer tabs **do** have a Monaco model (the raw file content). They just hide the editor and render a table instead. This means:

- `editorManager.closeTab(tabId)` works normally (model exists)
- No need for manual `editors.delete()` in close handler
- Content edits in editor mode are reflected when toggling back to table

## Key Gotchas

1. **Two open paths**: File detection must be added to both `openFileByPath()` (explorer, recent files, find-in-files) and `openFile()` (File > Open menu). Missing one means those files won't get table mode.

2. **Sort stability with source line map**: When sorting, rows must be paired with their original indices before sorting, then the `sourceLineMap` rebuilt from the paired data. Otherwise row-click jumps to wrong lines after sort.

3. **Toolbar visibility cascade**: Every branch in `onActivate` must call both `updateMarkdownToolbar()` and `updateTableToolbar()`. Missing one leaves stale toolbar buttons visible when switching between tab types.

4. **JSON detection is conservative**: Only `[{...}, ...]` (array of objects) triggers table mode. Nested objects, arrays of primitives, or single objects open as normal JSON. This avoids false positives.

## Prevention

When adding future read/edit toggle views (e.g., hex editor, image preview):
- Follow this same pattern: detect file type → set tab flags → branch in `onActivate` → toggle function → toolbar button
- Always hide other toggle toolbars (`updateMarkdownToolbar(false)`, `updateTableToolbar(false)`) in every activation branch
- Add detection to **both** `openFileByPath()` and `openFile()`
