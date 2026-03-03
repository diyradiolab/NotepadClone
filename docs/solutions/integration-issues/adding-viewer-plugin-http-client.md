---
title: "Adding a Viewer Plugin: HTTP Client (Postman-like)"
category: integration-issues
module: plugins/http-client
tags:
  - viewer_plugin
  - http_client
  - ipc_handlers
  - collections_management
  - electron_plugin_pattern
symptoms:
  - how to create a viewer plugin
  - HTTP client in Electron app
  - per-tab panel pattern
  - IPC handlers for Node HTTP requests
  - CORS bypass in Electron
  - plugin registration with isSpecialViewer
  - keyboard shortcut conflicts in menu
date_solved: 2026-03-03
---

# Adding a Viewer Plugin: HTTP Client

## Problem

Need to add a full-featured HTTP endpoint tester (Postman-like) as a tab viewer plugin, following the same pattern as Web Dashboard, Spreadsheet, and Diagram viewers.

## Solution Overview

Created 4 new files, modified 4 existing files. The plugin opens as a dedicated tab with a two-region layout: collections sidebar (left) + request/response area (right). HTTP requests execute in the main process via Node `http`/`https` to avoid CORS. Collections persist via electron-store with debounced saves.

## Implementation Checklist

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `plugins/http-client/package.json` | 15 | Plugin manifest: `onStartup` activation, `httpClient.open` command |
| `plugins/http-client/index.js` | 83 | Viewer registration, per-tab panel Map, tab creation |
| `src/renderer/components/http-client-panel.js` | ~700 | Full UI: sidebar tree, URL bar, request config tabs, response display |
| `src/renderer/styles/http-client-panel.css` | ~620 | All styles with `hcp-` prefix, themed via CSS custom properties |

### Modified Files (8 touch points across 4 files)

| File | Change |
|------|--------|
| `src/main/main.js` | Add `httpClientCollections` to store defaults + 5 IPC handlers |
| `src/main/preload.js` | Expose 6 `window.api` methods |
| `src/main/menu.js` | Add "HTTP Client" to Tools menu (`CmdOrCtrl+Alt+H`) |
| `src/renderer/index.js` | Import + register plugin, add `isHttpClient` to `isSpecialViewer`, wire menu event |

## Key Patterns

### 1. Viewer Registration Pattern

Follow the web-dashboard model exactly:

```js
// Plugin index.js
const viewers = new Map(); // tabId → panel instance

api.registerViewer({
  id: 'http-client-view',
  canHandle(tab) { return tab.isHttpClient === true; },
  isDefault(tab) { return tab.isHttpClient === true; },
  activate(container, tab, entry, tabId) {
    const viewer = getOrCreateViewer(tabId);
    container.style.display = 'none'; // hide Monaco
    viewer.show(tabId);
  },
  deactivate() { /* hide all, restore editor */ },
  destroy() { /* cleanup panel for active tab */ },
});
```

Tab creation sets two flags:
```js
tab.isHttpClient = true;
tab.viewerMode = 'http-client-view';
```

### 2. Main Process HTTP Execution (CORS bypass)

Requests run in main process using Node `http`/`https`:

```js
ipcMain.handle('renderer:http-client-send-request', async (_event, { method, url, headers, body }) => {
  const parsedUrl = new URL(url);
  const lib = parsedUrl.protocol === 'https:' ? require('https') : require('http');
  // ... execute request, collect chunks, measure time
  return { status, statusText, body, headers, time, size };
});
```

### 3. Debounced Persistence

```js
_scheduleSave() {
  if (this._saveTimer) clearTimeout(this._saveTimer);
  this._saveTimer = setTimeout(() => this._flushSave(), 800);
}
_flushSave() {
  clearTimeout(this._saveTimer);
  window.api.httpClientSaveCollections({ collections: this._collections, version: 1 });
}
```

Always call `_flushSave()` in `destroy()` to avoid data loss.

### 4. Inline Dialogs (No prompt())

`prompt()` silently returns `null` in Electron renderer. Build custom overlays:

```js
_showInlineDialog(title, placeholder, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'hcp-dialog-overlay'; // z-index: 100
  // ... input, OK/Cancel buttons, Enter/Escape handlers
  this._container.appendChild(overlay);
  input.focus();
}
```

### 5. isSpecialViewer Registration

In `src/renderer/index.js`, add to the special viewer check:

```js
const isSpecialViewer =
  (tab && tab.isDiagram && ...) ||
  (tab && tab.isSpreadsheet && ...) ||
  (tab && tab.isDashboard) ||
  (tab && tab.isHttpClient);  // ← add this
```

## Gotchas

### Keyboard Shortcut Conflicts
`CmdOrCtrl+Shift+H` was already used by Git File History. Always search `menu.js` for existing accelerators before adding a new one. Used `CmdOrCtrl+Alt+H` instead.

### electron-store Default Shape
Always return the full expected shape from `store.get()`:
```js
store.get('httpClientCollections', { collections: [], version: 1 });
```
The default is a full replacement, not a merge.

### GET/HEAD Requests Never Send Body
Even if the user enters a body, skip `req.write()` for GET and HEAD methods.

### URL Parsing
`new URL('example.com')` throws — requires protocol. Always wrap in try/catch and return a user-friendly error.

## Data Model

```js
{
  collections: [{
    id: "uuid", name: "My API",
    items: [
      { type: "folder", id: "uuid", name: "Auth", items: [...] },
      { type: "request", id: "uuid", name: "GET /users",
        method: "GET", url: "https://...",
        params: [{ key, value, enabled }],
        headers: [{ key, value, enabled }],
        body: { type: "none|json|form-data|raw", json: "", formData: [], raw: "" },
        auth: { type: "none|bearer|basic|apikey", bearer: {token}, basic: {username,password}, apikey: {key,value,in} }
      }
    ]
  }],
  version: 1
}
```

## Related Documentation

- [Adding Custom Tab Types to Editor System](adding-custom-tab-types-to-editor-system.md) — foundational viewer pattern
- [Adding Help Menu Markdown Documents](adding-help-menu-markdown-documents.md) — 4-file IPC checklist (menu → preload → index → component)
- [CSV/JSON/XML Table Viewer](csv-json-xml-table-viewer.md) — read/edit toggle viewer pattern

## Prevention / Best Practices

- **Shortcut audit**: Search `accelerator:` in `menu.js` before adding new shortcuts
- **Full-rebuild render**: `_render()` clears `innerHTML` — simpler than incremental DOM updates, fine for non-performance-critical UIs
- **Resize handle cleanup**: Always remove document-level `mousemove`/`mouseup` listeners in the `mouseup` handler
- **Auth injection**: Resolve auth into headers/query params *before* sending — keeps the IPC handler simple
