---
title: "feat: Add Whiteboard Canvas Plugin"
type: feat
date: 2026-03-12
---

# feat: Add Whiteboard Canvas Plugin

## Overview

Add an interactive whiteboard/canvas plugin to NotepadClone using **Fabric.js** (v6, pinned version). The whiteboard opens in tabs like existing viewer plugins (diagram, spreadsheet, hex-editor), registers for `.whiteboard` files, and supports freehand drawing, shapes, text, zoom/pan, undo/redo, and SVG export.

## Library Choice: Fabric.js

**Why Fabric.js over alternatives:**

| Criteria | Fabric.js | Konva.js | Paper.js | Excalidraw/tldraw |
|---|---|---|---|---|
| Vanilla JS | YES | YES | YES | NO (React required) |
| Freehand drawing | Built-in | DIY | Scriptable | N/A |
| Text editing | Built-in (inline) | DIY overlay | No | N/A |
| Select/move/resize | Built-in | Partial | DIY | N/A |
| SVG export | YES | NO | YES | N/A |
| JSON round-trip | YES | YES | YES | N/A |
| Bundle size | ~300KB min | ~150KB | ~220KB | N/A |

Fabric.js is the most whiteboard-ready vanilla JS library. It provides freehand drawing (`PencilBrush`), shape primitives, inline text editing, interactive selection with handles, and full JSON serialization — all built in. The 300KB bundle is negligible alongside Monaco (~4MB).

Install: `npm install fabric@^6` (pin major version to avoid breaking changes)

## Architecture

### Files to Create

| File | Purpose |
|---|---|
| `plugins/whiteboard/index.js` | Plugin entry — registers viewer, commands, toolbar buttons |
| `plugins/whiteboard/package.json` | Plugin manifest |
| `src/renderer/components/whiteboard-panel.js` | `WhiteboardPanel` class — Fabric.js canvas, toolbar, tools, undo stack |
| `src/renderer/styles/whiteboard.css` | Styles with `wb-` BEM prefix |

### Files to Modify

| File | Change |
|---|---|
| `src/renderer/index.js` | Import/register plugin, add `isWhiteboardFile()` detection, add to `isSpecialViewer` check |
| `src/main/menu.js` | Add "New Whiteboard" menu item under File |
| `src/main/preload.js` | Add `onMenuNewWhiteboard` IPC channel |

### Plugin Manifest

```json
// plugins/whiteboard/package.json
{
  "name": "notepadclone-whiteboard",
  "displayName": "Whiteboard Canvas",
  "version": "1.0.0",
  "notepadclone": {
    "activationEvents": ["onFileType:whiteboard", "onCommand"],
    "contributes": {
      "viewers": ["whiteboard-view"],
      "commands": ["whiteboard.new", "whiteboard.exportSvg"],
      "toolbarButtons": ["whiteboard-export-svg"]
    }
  }
}
```

## Critical Design Decisions

### 1. Save Synchronization (CRITICAL)

The save flow reads from `editorManager.getContent(tabId)` → `model.getValue()`. The whiteboard's truth lives in Fabric.js, not Monaco. Strategy:

- **Debounced sync**: On every canvas change (`object:modified`, `object:added`, `object:removed`, `path:created`), debounce 800ms, then call `model.setValue(JSON.stringify(canvas.toJSON()))`. Use **compact JSON** (no indentation) for model sync to avoid Monaco tokenization overhead.
- **Pre-save flush**: Hook the save command so `_flushSave()` is called synchronously *before* `editorManager.getContent()` reads the model. This prevents stale data when Ctrl+S fires during the debounce window.
- **Forced sync on deactivate**: In the viewer's `deactivate()`, cancel any pending debounce timer, then immediately flush canvas state to the model.
- **Forced sync on destroy**: In `destroy()`, cancel pending debounce timer, call `_flushSave()` to prevent data loss on tab close.

This follows the same debounced persistence pattern documented in `docs/solutions/integration-issues/adding-viewer-plugin-http-client.md`.

### 2. Tab Lifecycle: Hide, Don't Destroy

Use the **hex editor pattern** (`Map<tabId, Panel>`), NOT the diagram pattern (destroy/recreate):

- `activate(container, tab, entry, tabId)`: If panel exists in Map, show it and re-append to container. If not, create new panel. Store `tabId` internally for use in `destroy()`.
- `deactivate()`: Hide **ALL** panels in the Map (not just current — `deactivate()` receives no tabId), sync active panel state to model.
- `destroy()`: Full cleanup — use internally tracked tabId (do NOT rely on `api.tabs.getActiveId()`), dispose Fabric.js canvas, remove from Map, flush save.
- `updateToolbar(isActive, tab)`: Show/hide whiteboard-specific toolbar buttons based on `isActive`.

This preserves zoom/pan position, selection state, active tool, and undo history across tab switches.

### 3. Undo/Redo (via keydown listener)

Route undo/redo through the whiteboard wrapper's `keydown` listener with `stopPropagation()` — NOT through the command registry's `when` guards. This keeps all keyboard handling in one place and avoids dual-routing conflicts.

Implement **command-based undo** (deltas, not full snapshots):

- `{ type: 'add', objectId, json }` — undo removes the object
- `{ type: 'remove', objectId, json }` — undo re-adds the object
- `{ type: 'modify', objectId, before, after }` — undo applies `before` properties

Cap stack depth at 30 entries. Clear on file load.

This avoids the memory pressure of 50 full JSON snapshots (which could reach 25-50MB for complex whiteboards).

### 4. Keyboard Routing

Attach a `keydown` listener on the whiteboard wrapper element. When the whiteboard has focus, handle these keys and call `stopPropagation()`:

| Key | Action |
|---|---|
| Delete / Backspace | Delete selected object(s) |
| Escape | Deselect all |
| Arrow keys | Nudge selected object(s) by 1px (10px with Shift) |
| Ctrl+A | Select all objects |
| Ctrl+Z / Ctrl+Y | Undo / Redo |

Note: Verify that Ctrl+Z/A don't fire Electron menu accelerators that bypass `stopPropagation()`. If they do, the menu handler must defer to the active viewer.

### 5. Canvas Resize

Add a `ResizeObserver` on the whiteboard wrapper in Phase 1. On container resize, call `canvas.setDimensions({ width, height })` to keep the canvas filling its container. Without this, window resizing clips the canvas or leaves dead space.

### 6. Dark Mode

`canvas.backgroundColor` is programmatic, not CSS. Listen for theme changes and update `canvas.backgroundColor` accordingly (white for light theme, dark gray for dark theme).

## Deferred to v2

These features were evaluated and intentionally deferred:

| Feature | Reason |
|---|---|
| Sticky notes | Compound object (Rect+Textbox+palette); rect + text exist separately |
| Arrow tool | Custom arrowhead geometry; ship plain lines first |
| Snap-to-grid | Full sub-feature with toggle, overlay, snap handler |
| Right-click context menu | Keyboard shortcuts cover same actions |
| Group/Ungroup | Advanced feature, rarely needed |
| Copy/Paste clipboard | Plugin-level serialization; Alt+drag clone works in Fabric.js |
| PNG export | SVG covers it; avoids new IPC channel for v1 |
| Fit-to-content zoom | Convenience; manual zoom sufficient |
| Browser zoom compensation | Speculative fix for no known bug |

## Implementation Phases

### Phase 1: Core Whiteboard

Plugin scaffold, canvas, drawing tools, save/load.

- [ ] Install Fabric.js: `npm install fabric@^6`
- [ ] Create `plugins/whiteboard/package.json` manifest
- [ ] Create `plugins/whiteboard/index.js` — register viewer with `canHandle(tab)` checking `tab.isWhiteboard`
  - Implement `updateToolbar(isActive, tab)` to show/hide whiteboard toolbar buttons
  - Track last activated `tabId` internally for use in `destroy()`
- [ ] Create `src/renderer/components/whiteboard-panel.js` — `WhiteboardPanel` class:
  - Constructor takes container element and initializes Fabric.js canvas
  - `ResizeObserver` on wrapper to call `canvas.setDimensions()` on resize
  - `show()` / `hide()` methods for tab switching
  - `loadFromJSON(json)` / `toJSON()` for serialization
  - `dispose()` for cleanup (dispose canvas, disconnect ResizeObserver)
  - Dark mode: set `canvas.backgroundColor` based on current theme, listen for theme changes
- [ ] Create `src/renderer/styles/whiteboard.css` with `wb-` prefix:
  - `.wb-wrapper` — flex column, fills container
  - `.wb-toolbar` — horizontal toolbar above canvas
  - `.wb-canvas-container` — flex: 1, holds the `<canvas>` element
- [ ] Build whiteboard toolbar UI:
  - Tool buttons: Select, Pen, Line, Rectangle, Circle/Ellipse, Text
  - Active tool highlight state and cursor changes per tool
  - Stroke color, fill color, and stroke width controls
- [ ] Implement **Select tool** — default Fabric.js selection mode (click, marquee, Shift+click)
- [ ] Implement **Pen tool** — `canvas.isDrawingMode = true` with `PencilBrush`
- [ ] Implement **Line tool** — click-drag to create `fabric.Line`
- [ ] Implement **Rectangle tool** — click-drag to create `fabric.Rect`
- [ ] Implement **Circle/Ellipse tool** — click-drag to create `fabric.Ellipse`
- [ ] Implement **Text tool** — click to place `fabric.Textbox` with inline editing
- [ ] Implement debounced model sync (800ms, compact JSON) with pre-save flush
- [ ] Cancel pending debounce in `deactivate()` and `destroy()` before flushing
- [ ] `deactivate()` hides ALL panels in Map, not just current
- [ ] Add dirty state tracking via `api.tabs.setDirty(tabId, true)` on canvas changes
- [ ] New empty whiteboards NOT marked dirty until first user action
- [ ] Implement **keyboard routing** on wrapper with `stopPropagation()`:
  - Delete/Backspace → delete selected
  - Escape → deselect
  - Arrow keys → nudge (1px, 10px with Shift)
  - Ctrl+A → select all
  - Ctrl+Z / Ctrl+Y → undo/redo
- [ ] Modify `src/renderer/index.js`:
  - Import and register whiteboard plugin
  - Add `isWhiteboardFile(filename)` checking `.whiteboard` extension
  - Add `tab.isWhiteboard = true` in `createTabForFile()`
  - Add to `isSpecialViewer` check
  - Support `.whiteboard` in BOTH `openFile()` and `openFileByPath()`
- [ ] Add "New Whiteboard" to File menu in `src/main/menu.js`
- [ ] Add `onMenuNewWhiteboard` IPC channel in `src/main/preload.js`
- [ ] Wire `main:new-whiteboard` IPC to `commandRegistry.execute('whiteboard.new')`
- [ ] Verify webpack bundles Fabric.js v6 ES modules without extra config
- [ ] Test: create new whiteboard, draw shapes, switch tabs, save, reopen file, dark mode

### Phase 2: Navigation & Export

Zoom/pan, undo/redo, SVG export, error handling.

- [ ] Implement **command-based undo/redo**:
  - Track deltas: add/remove/modify with object JSON and property diffs
  - Max depth: 30
  - Clear stack on file load
- [ ] Implement **zoom**:
  - Mouse wheel zoom (centered on cursor position)
  - Toolbar zoom in/out buttons and percentage display
  - Ctrl+= / Ctrl+- keyboard zoom (add to keydown handler)
  - Min 10%, max 500%
- [ ] Implement **pan**:
  - Space+drag or middle-click drag
  - Two-finger scroll on trackpad
- [ ] Update status bar with zoom percentage when whiteboard is active
- [ ] Implement **SVG export** — `canvas.toSVG()` via existing `window.api.exportSvgFile()` IPC
- [ ] Register export command: `whiteboard.exportSvg`
- [ ] Add **file corruption handling**: wrap `canvas.loadFromJSON()` in try/catch, show inline error message on invalid JSON
- [ ] Test with session restore (saved whiteboards with filePath should reopen)

## Acceptance Criteria

### Functional

- [ ] User can create a new whiteboard via File menu or command palette
- [ ] User can draw with pen tool (freehand) with configurable color/width
- [ ] User can place shapes: rectangle, circle/ellipse, line
- [ ] User can place and edit text boxes with inline editing
- [ ] User can select, move, resize, rotate, and delete objects
- [ ] User can multi-select via Shift+click or marquee drag
- [ ] User can zoom (wheel, keyboard, toolbar) and pan (Space+drag)
- [ ] User can undo/redo with Ctrl+Z/Y
- [ ] Ctrl+S saves whiteboard as `.whiteboard` JSON file
- [ ] Ctrl+S during debounce window saves current (not stale) data
- [ ] User can export to SVG via toolbar button
- [ ] Opening a `.whiteboard` file renders the saved canvas
- [ ] Tab switching preserves full whiteboard state (zoom, selection, tools, undo history)
- [ ] Closing a dirty whiteboard tab prompts to save
- [ ] Keyboard shortcuts work correctly without conflicting with Monaco
- [ ] Canvas resizes properly when window is resized
- [ ] Dark mode renders correctly (canvas background, toolbar)

### Non-Functional

- [ ] Tab switch latency under 100ms (hide/show, not destroy/recreate)
- [ ] Follows existing plugin patterns (viewer registry, command registry, toolbar manager)
- [ ] CSS uses theme variables for light/dark mode support
- [ ] No `prompt()`, `confirm()`, or `alert()` — custom inline UI only
- [ ] Fabric.js version pinned in package.json

## References

### Internal Patterns

- Viewer registry: `src/renderer/viewer-registry.js`
- Plugin API: `src/renderer/plugin-api.js`
- Hex editor (hide/show pattern): `plugins/hex-editor/index.js`
- Diagram viewer (viewer lifecycle): `plugins/diagram/index.js`, `src/renderer/components/diagram-viewer.js`
- Spreadsheet (model sync pattern): `plugins/spreadsheet/index.js:59`
- File detection: `src/renderer/index.js:565-648`
- isSpecialViewer check: `src/renderer/index.js:403`
- Save flow: `src/renderer/index.js:801`
- Export SVG IPC: `src/main/preload.js` (`exportSvgFile`)

### Documented Learnings

- Custom tab types: `docs/solutions/integration-issues/adding-custom-tab-types-to-editor-system.md`
- Viewer plugin pattern: `docs/solutions/integration-issues/adding-viewer-plugin-http-client.md`
- Guard `editor-manager.js` `activateTab()` for non-Monaco tabs
- Debounced persistence with `_flushSave()` on destroy
- Add file detection to BOTH `openFile()` and `openFileByPath()`
- Never use `prompt()` in Electron renderer
- `destroy()` receives no tabId — track internally, don't use `getActiveId()`
- `deactivate()` receives no tabId — hide ALL panels in Map

### External

- Fabric.js docs: http://fabricjs.com/docs/
- Fabric.js GitHub: https://github.com/fabricjs/fabric.js
