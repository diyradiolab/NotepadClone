---
title: "feat: Add Notes Panel (Right-Side Sidebar Scratchpad)"
type: feat
date: 2026-02-06
---

# feat: Add Notes Panel (Right-Side Sidebar Scratchpad)

## Overview

A right-side vertical panel for quick note-taking without leaving the editor. Supports multiple named plain-text notes that persist across sessions via electron-store. Toggled via toolbar button, View menu item, and keyboard shortcut (`Ctrl+Shift+N`). Collapsible and resizable, mirroring the file explorer pattern on the left side.

## Problem Statement / Motivation

Developers constantly need to jot things down while coding — TODOs, debug observations, copy/paste snippets, meeting notes, command references. Currently they have to switch to another app or open a throwaway tab. A dedicated notes panel keeps everything in context and persists across sessions.

## Proposed Solution

Create a `NotesPanel` component (`src/renderer/components/notes-panel.js`) positioned on the right side of the editor container. The panel has a note list (top half) and a plain-text editing area (bottom half), with notes persisted to electron-store under a `notes` key. The panel follows the same toggle/show/hide/resize pattern as the file explorer.

## Technical Considerations

- **Persistence**: Use electron-store (already available via preload for theme/recent files/clipboard). Store notes as `{ notes: [{ id, title, content, pinned, createdAt }], activeNoteId, panelWidth }`.
- **No Monaco for notes**: Use a plain `<textarea>` — notes are quick scratch text, not code. Keeps it lightweight and avoids competing with the main editor for Monaco resources.
- **Debounced auto-save**: Save to electron-store on a 500ms debounce after each keystroke. No explicit save button.
- **Resize handle**: Left edge of the notes panel (mirrors the file explorer's right-edge resize handle). Constrain min-width 180px, max-width 400px.

## Files to Create

### 1. `src/renderer/components/notes-panel.js` (NEW)

The main component. Constructor takes a container element (the `#notes-panel` div).

```js
export class NotesPanel {
  constructor(container) {
    this.container = container;
    this.notes = [];        // { id, title, content, pinned, createdAt }
    this.activeNoteId = null;
    this.searchQuery = '';
    this._saveTimeout = null;
    this._render();
    this._loadNotes();
    this._initResize();
  }

  // ── Public API (same pattern as FileExplorer) ──
  toggle() { this.container.classList.toggle('hidden'); }
  show()   { this.container.classList.remove('hidden'); }
  hide()   { this.container.classList.add('hidden'); }
  isVisible() { return !this.container.classList.contains('hidden'); }

  // ── Internal ──
  _render()           // Build DOM: header, search, note list, textarea
  _loadNotes()        // Load from electron-store via window.api.getNotesData()
  _saveNotes()        // Debounced save to electron-store via window.api.saveNotesData()
  _createNote()       // Add new note with default title "Note N"
  _deleteNote(id)     // Delete with confirmation dialog
  _renameNote(id)     // Inline rename (contenteditable or input overlay)
  _selectNote(id)     // Switch active note, update textarea content
  _togglePin(id)      // Toggle pinned state, re-sort list
  _filterNotes()      // Filter note list by search query (title + content match)
  _renderNoteList()   // Re-render just the list portion
  _initResize()       // Drag handle on left edge to resize panel width
  _debounceSave()     // 500ms debounce wrapper around _saveNotes
}
```

**Key behaviors:**
- Notes sorted: pinned first (alphabetical), then unpinned (alphabetical)
- Active note highlighted in the list
- Textarea syncs to active note; changes debounce-save
- Empty state: "No notes yet. Click + to create one."
- Deleting active note: select the next note, or previous, or show empty state
- Deleting last note: show empty state (don't auto-create)

### 2. `src/renderer/styles/notes-panel.css` (NEW)

```css
/* ── Notes Panel (Right Side) ── */
.notes-panel {
  width: 250px;
  min-width: 180px;
  max-width: 400px;
  background: var(--bg-primary);
  border-left: 1px solid var(--border-secondary);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
}

.notes-panel.hidden { display: none; }

.notes-header { /* Same style as .explorer-header */ }
.notes-search { /* Small input below header */ }
.notes-list { /* Scrollable list of note items */ }
.notes-list-item { /* Row with title, pin icon, delete button */ }
.notes-list-item.active { /* Highlighted */ }
.notes-list-item.pinned { /* Pin indicator */ }
.notes-textarea { /* Bottom half: plain textarea, flex: 1 */ }
.notes-divider { /* Horizontal resize between list and textarea */ }
.notes-resize { /* Left-edge vertical resize handle */ }
.notes-empty { /* "No notes yet" empty state */ }
```

## Files to Modify

### 3. `src/renderer/index.html`

Add the notes panel container inside `#main-content`, after the editor container:

```html
<!-- Main content area -->
<div id="main-content" class="main-content">
  <!-- File Explorer (left) -->
  <div id="file-explorer" class="file-explorer hidden"></div>
  <!-- Editor container (center) -->
  <div id="editor-container" class="editor-container"></div>
  <!-- Notes Panel (right) -->
  <div id="notes-panel" class="notes-panel hidden"></div>
</div>
```

Add a toolbar button before the SQL query button separator:

```html
<span class="toolbar-separator"></span>
<button class="toolbar-btn" data-action="notes-toggle" id="btn-notes-toggle" title="Toggle Notes Panel (Ctrl+Shift+N)">
  <span class="toolbar-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="2" width="12" height="12" rx="1"/>
    <line x1="5" y1="5.5" x2="11" y2="5.5"/>
    <line x1="5" y1="8" x2="11" y2="8"/>
    <line x1="5" y1="10.5" x2="9" y2="10.5"/>
  </svg></span>
</button>
```

### 4. `src/renderer/index.js`

- [ ] Import `notes-panel.css`
- [ ] Import `NotesPanel` from `./components/notes-panel`
- [ ] Initialize: `const notesPanel = new NotesPanel(document.getElementById('notes-panel'));`
- [ ] Add toolbar action: `case 'notes-toggle': notesPanel.toggle(); break;`
- [ ] Wire menu event: `window.api.onMenuToggleNotes(() => notesPanel.toggle());`
- [ ] Add keyboard shortcut in the existing `keydown` listener:
  ```js
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
    e.preventDefault();
    notesPanel.toggle();
  }
  ```

### 5. `src/main/menu.js`

Add to View menu after "Show All Characters":

```js
{
  label: 'Notes Panel',
  accelerator: 'CmdOrCtrl+Shift+N',
  click: () => mainWindow.webContents.send('main:toggle-notes'),
},
```

### 6. `src/main/preload.js`

Add IPC bindings for notes persistence and menu toggle:

```js
// Notes panel
getNotesData: () => ipcRenderer.invoke('renderer:get-notes-data'),
saveNotesData: (data) => ipcRenderer.invoke('renderer:save-notes-data', data),
onMenuToggleNotes: (callback) => ipcRenderer.on('main:toggle-notes', callback),
```

### 7. `src/main/main.js`

Add IPC handlers for notes persistence using the existing `store` instance:

```js
ipcMain.handle('renderer:get-notes-data', () => {
  return store.get('notesPanel', { notes: [], activeNoteId: null, panelWidth: 250 });
});

ipcMain.handle('renderer:save-notes-data', (event, data) => {
  store.set('notesPanel', data);
});
```

## Acceptance Criteria

### Functional Requirements
- [ ] Notes panel appears on the right side of the editor when toggled
- [ ] Panel can be toggled via toolbar button, View menu, and `Ctrl+Shift+N`
- [ ] User can create a new note with default name "Note 1", "Note 2", etc.
- [ ] User can rename a note inline (double-click on title)
- [ ] User can delete a note with confirmation
- [ ] Switching notes updates the textarea with the selected note's content
- [ ] Edits auto-save with 500ms debounce to electron-store
- [ ] Notes persist across app restarts
- [ ] Panel width is resizable via drag handle on left edge
- [ ] Panel width persists across restarts
- [ ] Pinned notes appear at top of list with a pin indicator
- [ ] Search input filters notes by title and content
- [ ] Empty state shows helpful message when no notes exist

### Non-Functional Requirements
- [ ] Panel follows existing light/dark theme via CSS variables
- [ ] Panel resize feels smooth (no layout jank)
- [ ] Auto-save is debounced (doesn't hammer electron-store)

## Interaction Details

- **Rename trigger**: Double-click on note title in list to enter inline edit mode. Enter confirms, Escape cancels. Click outside also confirms.
- **Delete trigger**: Small `x` button appears on hover to the right of each note item (same pattern as tab close buttons).
- **Note list item display**: `[pin icon if pinned] Note Title [x on hover]` — just the title, no preview.
- **Focus on toggle open**: Focus moves to the active note's textarea so user can start typing immediately.
- **Focus on toggle close**: Focus returns to the main Monaco editor.
- **Note creation**: New note is auto-selected and textarea is focused.
- **Copy/paste with main editor**: Standard clipboard operations work between textarea and Monaco — no special handling needed.
- **Ctrl+F while notes panel focused**: Opens Monaco's find dialog (main editor). Notes panel uses native textarea find (browser default). No conflict.
- **App close during debounce**: Flush pending save synchronously in a `beforeunload` handler to prevent data loss.
- **Layout**: `#main-content` is flex row: `[file-explorer] [editor-container (flex:1)] [notes-panel]`. Notes panel and file explorer can both be visible simultaneously. Bottom panels (SQL, Find in Files) are outside `#main-content` and unaffected.

## Edge Cases

- **Ctrl+Shift+N conflict**: On macOS, `Cmd+Shift+N` may conflict with system shortcuts. Use `CmdOrCtrl+Shift+N` — Electron handles this.
- **Delete active note**: Select the next note in the filtered list, or previous if deleting the last item, or show empty state.
- **Delete last note**: Show empty state with "No notes yet" message. Don't auto-create.
- **Rename to empty string**: Revert to previous title.
- **Rename to duplicate title**: Allow it (notes are identified by ID, not title).
- **Very long note content**: Textarea handles scrolling natively. No cap on size.
- **Panel hidden on startup**: Remember visibility state in electron-store. Default to hidden.
- **Search with no matches**: Show "No matching notes" in the list area.
- **Rapid typing**: Debounce prevents excessive saves; last edit always wins.
- **Window too narrow**: Panel respects min-width 180px; editor container shrinks as needed with `flex: 1`.

## References

### Internal References
- File explorer panel pattern: `src/renderer/components/file-explorer.js` (toggle/show/hide)
- File explorer CSS: `src/renderer/styles/file-explorer.css` (layout, header, resize)
- Toolbar button wiring: `src/renderer/index.js:1128-1155` (switch statement)
- Menu construction: `src/main/menu.js:215-288` (View menu)
- Preload IPC: `src/main/preload.js` (existing `getTheme`/`setTheme` pattern for persistence)
- electron-store persistence: `src/main/main.js` (store.get/store.set pattern)
- CSS variables: `src/renderer/styles/main.css:1-70` (theme variables for light/dark)
- Brainstorm doc: `docs/brainstorms/2026-02-06-notes-panel-brainstorm.md`
