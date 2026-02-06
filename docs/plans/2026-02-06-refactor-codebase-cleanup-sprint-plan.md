---
title: "refactor: Codebase Cleanup Sprint"
type: refactor
date: 2026-02-06
---

# Codebase Cleanup Sprint

## Overview

Fix 13 critical + moderate issues before Phase 2 features. These cause data loss (no unsaved-changes prompt), UI freezes (sync I/O), resource leaks (file watchers, Monaco disposables), and silent bugs (UTF-16 BE garbled, encoding lost on save).

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Unsaved-changes dialog | Renderer drives tab close (via `renderer:show-save-dialog`), main drives window close (via `BrowserWindow.on('close')`) | Renderer knows tab state; main can prevent window close |
| Async I/O | `fs.promises` (no worker threads) | Unblocks event loop, minimal code change |
| Find-in-files | Sequential `for...of` with async/await | Simplest, no EMFILE risk, still non-blocking |
| UTF-16 BE | `Buffer.swap16()` before decoding as utf16le | Correct rendering, small code change |
| IPC cleanup | Return unsubscribe functions from the 3-4 `on*` methods that actually risk leaking | Only `onFileChanged`, `onLargeFileProgress`, `onLargeFileSearchProgress` are per-operation |

## Fixes (ordered smallest-first, one real dependency: #1 before #13)

### 1. Fix `closeTab` callback ordering (Issue 11)

**File:** `src/renderer/components/tab-manager.js:49-50`

Swap these two lines so callbacks fire **before** the tab is deleted from the Map:

```javascript
// BEFORE
this.tabs.delete(tabId);
this.onCloseCallbacks.forEach(cb => cb(tabId));

// AFTER
this.onCloseCallbacks.forEach(cb => cb(tabId));
this.tabs.delete(tabId);
```

This fixes the bug where `index.js:92` calls `tabManager.getTab(tabId)` in the close callback but the tab is already gone, causing file watchers to leak on every tab close.

**Invariant:** Close callbacks must not call back into `tabManager.closeTab()`.

---

### 2. Remove duplicate `_render`/`_bindEvents` + duplicate `onCursorChange` (Issues 4, 5)

**File:** `src/renderer/index.js` — `openLargeFile` function

- Delete the external `viewer._render()` and `viewer._bindEvents()` calls at lines 180-181 (constructor already calls both)
- Delete the first `viewer.onCursorChange(...)` registration at lines 154-158 (duplicate of lines 182-186)

The constructor at `large-file-viewer.js:20-21` handles init. The loading overlay at `index.js:163` overwrites the constructor's DOM, so restructure: create the viewer **after** indexing completes (not before), or defer `_render()` out of the constructor into `init()`.

---

### 3. Remove stale `theme` from DEFAULT_OPTIONS (Issue 13)

**File:** `src/renderer/editor/monaco-setup.js:79`

Delete `theme: currentTheme` from the `DEFAULT_OPTIONS` object. It's captured at module load time but already overridden in `createEditor` (line 106) with the live value. Harmless but misleading — just remove it.

---

### 4. Move `nativeTheme` listener outside `createWindow` (Issue 9)

**File:** `src/main/main.js:71-75`

Move the `nativeTheme.on('updated')` listener to module level, outside `createWindow()`. Currently it stacks a new listener on every macOS activate→createWindow cycle. The existing `mainWindow !== null` guard already handles the no-window case.

---

### 5. Delete dead `EventEmitter` import

**File:** `src/main/large-file-service.js:3`

Delete `const { EventEmitter } = require('events');` — imported but never used.

---

### 6. Fix Monaco model disposable leak (Issue 10)

**File:** `src/renderer/editor/editor-manager.js:63`

Only `model.onDidChangeContent` leaks — the model survives tab switches while the editor is disposed (which cleans up `editor.onDidChangeCursorPosition` automatically).

Store one disposable reference on the entry. Dispose it before re-registering on each `activateTab`:

```javascript
// In activateTab, before registering:
if (entry.contentDisposable) {
  entry.contentDisposable.dispose();
}
entry.contentDisposable = entry.model.onDidChangeContent(() => {
  this.onChangeCallbacks.forEach(cb => cb(tabId));
});
```

Also dispose in `closeTab`:

```javascript
if (entry.contentDisposable) entry.contentDisposable.dispose();
```

---

### 7. Fix UTF-16 BE byte-swap (Issue 7)

**File:** `src/main/file-service.js` — `readFile` function

Replace the broken `'UTF-16 BE': 'utf16le'` mapping with actual byte-swapping:

```javascript
if (encoding === 'UTF-16 BE') {
  if (buffer.length % 2 !== 0) {
    // Odd byte count — treat as binary/corrupted, fall through to UTF-8
  } else {
    const swapped = Buffer.from(buffer);
    swapped.swap16();
    const content = swapped.toString('utf16le');
    return { content: content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content, encoding };
  }
}
```

Handle odd-length buffers gracefully (reviewer catch).

---

### 8. Store encoding per tab + preserve on save (Issue 12)

Three files need changes:

**`src/renderer/components/tab-manager.js`** — Add `encoding` to tab state in `createTab`.

**`src/renderer/index.js`** — Store `result.encoding` when opening a file. Pass `tab.encoding` when saving.

**`src/main/preload.js`** — Update `saveFile` and `saveFileAs` signatures to accept and forward `encoding`:

```javascript
saveFile: (filePath, content, encoding) => ipcRenderer.invoke('renderer:save-file', { filePath, content, encoding }),
saveFileAs: (content, defaultPath, encoding) => ipcRenderer.invoke('renderer:save-file-as', { content, defaultPath, encoding }),
```

**`src/main/file-service.js`** — In `writeFile`, convert display encoding name back to Node encoding via `ENCODING_MAP` before passing to `fs.promises.writeFile`. For UTF-16 BE, byte-swap the content buffer before writing. For UTF-16 LE, prepend BOM if the original had one.

**Reviewer catch:** The display name (`'UTF-16 LE'`) is not a valid Node.js encoding string. `writeFile` must map it back through `ENCODING_MAP` on the write path.

---

### 9. Convert `file-service.js` sync calls to async (Issue 2)

**File:** `src/main/file-service.js`

| Function | Change |
|----------|--------|
| `readFile` (line 37-38) | `readFileSync` → `await fs.promises.readFile`, `statSync` → `await fs.promises.stat` |
| `writeFile` (line 57) | `writeFileSync` → `await fs.promises.writeFile` |
| `readDirectory` (line 61) | `readdirSync` → `await fs.promises.readdir` |

All functions are already declared `async`, so callers don't change.

**File:** `src/main/main.js` — Convert `fs.statSync` calls in IPC handlers:

| Handler | Line | Change |
|---------|------|--------|
| `renderer:open-file` | 148 | `fs.statSync` → `await fs.promises.stat` |
| `renderer:get-file-stats` | 194 | `fs.statSync` → `await fs.promises.stat` |
| `renderer:read-file-by-path` | 222 | `fs.statSync` → `await fs.promises.stat` |

**Note:** `isLargeFile()` at `large-file-service.js:252` also uses `statSync`. Convert it to async and add `await` at call sites (`main.js:147`, `main.js:221`). Consider returning the stats object from `isLargeFile` to avoid double-stat (reviewer catch).

**Deferred:** `large-file-service.js` internal sync calls (`readLines`, `writeEdits`) — these are small targeted reads/writes with negligible blocking. Not worth the async conversion complexity in this sprint.

---

### 10. Convert `searchDir` to async (Issue 3)

**File:** `src/main/main.js:319-373`

Rewrite as async with sequential `for...of`. Keep the existing 2MB size threshold (not 5MB — reviewer caught the undocumented change):

```javascript
async function searchDir(dir) {
  if (results.length >= maxResults) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch { return; }

  for (const entry of entries) {
    if (results.length >= maxResults) return;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) {
        await searchDir(fullPath);
      }
    } else if (entry.isFile()) {
      try {
        const stat = await fs.promises.stat(fullPath);
        if (stat.size > 2 * 1024 * 1024) continue;
        const content = await fs.promises.readFile(fullPath, 'utf-8');
        // ... match logic unchanged ...
      } catch { continue; }
    }
  }
}
```

**Tradeoff:** Sequential reads are slower than sync for many small files, but the UI stays responsive. Acceptable.

---

### 11. Add try/catch to save handler (Issue 6)

**File:** `src/main/main.js:167-173`

```javascript
ipcMain.handle('renderer:save-file', async (_event, { filePath, content, encoding }) => {
  unwatchFile(filePath);
  try {
    await writeFile(filePath, content, encoding);
    watchFile(filePath);
    return { success: true };
  } catch (err) {
    try { watchFile(filePath); } catch {} // restore watcher safely (reviewer catch)
    return { success: false, error: err.message };
  }
});
```

**File:** `src/renderer/index.js:298` — Check result and keep tab dirty on failure:

```javascript
const result = await window.api.saveFile(tab.filePath, content, tab.encoding);
if (result.success) {
  tabManager.setDirty(tabId, false);
} else {
  // Main process already showed the error via IPC result; display in status bar
  statusBar.showMessage(`Save failed: ${result.error}`);
}
```

---

### 12. Add IPC cleanup to the 3 listeners that actually leak (Issue 1)

**File:** `src/main/preload.js` — Update only these methods to return unsubscribe functions:

- `onFileChanged` (line 21)
- `onLargeFileProgress` (line 38)
- `onLargeFileSearchProgress` (line 40)

```javascript
onFileChanged: (callback) => {
  const handler = (_event, filePath) => callback(filePath);
  ipcRenderer.on('main:file-changed', handler);
  return () => ipcRenderer.removeListener('main:file-changed', handler);
},
```

**File:** `src/renderer/index.js` — Store and call cleanup functions when done (e.g., on tab close for `onFileChanged`, on indexing complete for `onLargeFileProgress`).

The other 20 `on*` methods (menu handlers, theme) are registered once at module load and never need cleanup. Leave them as-is.

---

### 13. Add unsaved-changes dialog (Issue 8)

The largest fix. Two paths: tab close (renderer-driven) and window close (main-process-driven).

#### Tab close: renderer-driven

**File:** `src/main/preload.js` — Add:

```javascript
showSaveDialog: (fileName) => ipcRenderer.invoke('renderer:show-save-dialog', fileName),
```

**File:** `src/main/main.js` — Add handler:

```javascript
ipcMain.handle('renderer:show-save-dialog', async (_event, fileName) => {
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Save Changes',
    message: `Save changes to ${fileName}?`,
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  return ['save', 'discard', 'cancel'][response];
});
```

**File:** `src/renderer/components/tab-manager.js` — Make `closeTab` async:

```javascript
async closeTab(tabId) {
  const tab = this.tabs.get(tabId);
  if (!tab) return false;

  if (tab.dirty) {
    const result = await window.api.showSaveDialog(tab.title);
    if (result === 'cancel') return false;
    if (result === 'save') {
      // Trigger save via the existing save flow in index.js
      const saved = await this.saveCallback?.(tabId);
      if (!saved) return false;
    }
  }

  this.onCloseCallbacks.forEach(cb => cb(tabId));
  const el = this.tabBar.querySelector(`[data-tab-id="${tabId}"]`);
  if (el) el.remove();
  this.tabs.delete(tabId);

  if (this.activeTabId === tabId) {
    const remaining = [...this.tabs.keys()];
    if (remaining.length > 0) {
      this.activateTab(remaining[remaining.length - 1]);
    } else {
      this.activeTabId = null;
      this.onActivateCallbacks.forEach(cb => cb(null));
    }
  }
  return true;
}
```

Add a `setSaveCallback(fn)` method so `index.js` can provide the save logic.

**Update batch methods** to use `for...of` with `await` and early-exit on Cancel:

```javascript
async closeAllTabs() {
  for (const tabId of Array.from(this.tabs.keys())) {
    if (!(await this.closeTab(tabId))) return;
  }
}
// Same pattern for closeOtherTabs, closeTabsToRight
```

#### Window close: main-process-driven

**File:** `src/main/main.js` — Add `close` event handler with re-entrancy guard (reviewer catch):

```javascript
let isClosing = false;

mainWindow.on('close', async (event) => {
  if (isClosing) return;
  event.preventDefault(); // MUST be synchronous, before any await

  isClosing = true;
  try {
    const dirtyTabs = await invokeRenderer('main:get-dirty-tabs');
    if (!dirtyTabs || dirtyTabs.length === 0) {
      mainWindow.destroy();
      return;
    }

    for (const tab of dirtyTabs) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Save Changes',
        message: `Save changes to ${tab.title}?`,
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
      });
      if (response === 0) { // Save
        const saved = await invokeRenderer('main:save-tab', tab.tabId);
        if (!saved) return; // save failed, abort close
      } else if (response === 2) { // Cancel
        return;
      }
    }
    mainWindow.destroy();
  } finally {
    isClosing = false;
  }
});
```

**`invokeRenderer` helper** — inline, single-purpose, with timeout (reviewer catch):

```javascript
function invokeRenderer(channel, ...args) {
  return new Promise((resolve) => {
    const responseChannel = `${channel}-response`;
    const timeout = setTimeout(() => {
      ipcMain.removeListener(responseChannel, handler);
      resolve(null);
    }, 5000);
    const handler = (_event, result) => {
      clearTimeout(timeout);
      resolve(result);
    };
    ipcMain.once(responseChannel, handler);
    mainWindow.webContents.send(channel, ...args);
  });
}
```

**File:** `src/renderer/index.js` — Register handlers for main's requests:

```javascript
window.api.onGetDirtyTabs(() => {
  const dirtyTabs = [];
  for (const [tabId, tab] of tabManager.getAllTabs()) {
    if (tab.dirty) dirtyTabs.push({ tabId, title: tab.title, filePath: tab.filePath });
  }
  window.api.sendDirtyTabsResponse(dirtyTabs);
});

window.api.onSaveTab(async (tabId) => {
  const saved = await saveTab(tabId); // existing save logic
  window.api.sendSaveTabResponse(saved);
});
```

**New IPC channels needed:**
- `renderer:show-save-dialog` (renderer→main, handle/invoke)
- `main:get-dirty-tabs` + `main:get-dirty-tabs-response` (main→renderer, send/once)
- `main:save-tab` + `main:save-tab-response` (main→renderer, send/once)

---

## Acceptance Criteria

- [x] Closing a dirty tab shows Save / Don't Save / Cancel dialog
- [x] "Cancel" aborts the close; "Save" saves then closes; "Don't Save" discards
- [x] Closing the window with dirty tabs shows per-tab dialogs; Cancel aborts
- [x] Batch close (Close All/Others/Right) shows dialog per dirty tab, stops on Cancel
- [x] Save failures show error in status bar and keep tab dirty
- [x] File watchers are cleaned up when tabs close
- [x] UTF-16 BE files render correctly (handle odd-length gracefully)
- [x] File encoding is preserved on save (including write-path ENCODING_MAP)
- [x] Find-in-files does not freeze the UI
- [x] Tab switching does not accumulate Monaco model listeners
- [x] Large file open does not register duplicate handlers
- [x] `nativeTheme` listener registered exactly once

## Risks

- Making `closeTab` async changes 6+ call sites — test each
- Async conversion may surface previously-hidden errors
- The `invokeRenderer` send/once pattern needs the timeout to handle unresponsive renderer

## References

- Brainstorm: `docs/brainstorms/2026-02-06-codebase-cleanup-sprint-brainstorm.md`
- Existing dialog patterns: `src/main/main.js:133-140`, `src/main/menu.js:216-226`
- IPC convention: CLAUDE.md (renderer:* / main:* channels)
