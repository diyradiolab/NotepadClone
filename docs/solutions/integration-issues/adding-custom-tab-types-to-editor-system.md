---
title: "Adding custom tab types (non-editor) to the tab/editor system"
category: integration-issues
tags: [tab-system, editor-manager, custom-tabs, monaco-editor, ipc, git-integration, diff-editor]
module: renderer
symptoms:
  - New tab type crashes when activated because editor-manager tries to create a standard Monaco editor
  - Tab switching destroys custom tab content because activateTab disposes/recreates editors
  - Custom tab has no model property, causing undefined errors in closeTab
root_cause: editor-manager assumes every tab is either a regular editor or a diff editor — new tab types need explicit guards
date_solved: 2026-02-06
severity: medium
---

# Adding Custom Tab Types to the Editor System

## Context

NotepadClone uses a shared tab/editor architecture:
- **TabManager** owns tab DOM and metadata (title, filePath, dirty state)
- **EditorManager** owns Monaco editor instances, one visual editor shared across tabs via model swapping
- `activateTab(tabId)` disposes the current editor, creates a new one for the target tab
- Two tab types existed: regular editor tabs and diff tabs

## The Problem

Adding a third tab type (Git History — commit list + diff viewer) exposed that `EditorManager.activateTab()` has a rigid two-branch structure:

```js
// Before: only two paths
if (entry.isDiffTab) {
  // create diff editor
} else {
  // create regular editor ← crashes for custom tabs with no `model`
}
```

A custom tab that manages its own DOM (not a Monaco editor/model) falls through to the regular editor path and crashes on `entry.model` being undefined.

## Solution

### 1. Guard activateTab for custom tab types

Add early returns in `editor-manager.js` for custom tab types, both in the deactivation path (saving state of the outgoing tab) and the activation path (creating the incoming tab's UI):

```js
// Deactivation: skip for custom tabs
if (current.isHistoryTab) {
  // Nothing to dispose — history panel manages its own editors
} else if (current.isDiffTab) { ...

// Activation: skip for custom tabs
if (entry.isHistoryTab) return;
if (entry.isDiffTab) { ...
```

### 2. Store custom tab data in editors Map

The custom tab component stores its data in `editorManager.editors` so the tab system knows it exists, but marks it with a type flag:

```js
editorManager.editors.set(tabId, {
  isHistoryTab: true,
  filePath,
  commits,
  // no model, no editor — custom rendering
});
```

### 3. Handle activation in index.js

Since `editor-manager.js` returns early for custom tabs, the actual rendering happens in the `tabManager.onActivate` callback in `index.js`:

```js
if (tab && tab.isHistoryTab) {
  const entry = editorManager.editors.get(tabId);
  editorManager.activeTabId = tabId;
  editorManager.container.innerHTML = '';
  gitHistoryPanel._render(tabId, entry.filePath, entry.commits, ...);
  statusBar.updateLanguage('Git History');
}
```

### 4. Handle close cleanup in index.js

Custom tabs need manual cleanup before `editorManager.closeTab()` is called:

```js
if (tab && tab.isHistoryTab) {
  editorManager.editors.delete(tabId);
  if (editorManager.activeTabId === tabId) {
    editorManager.activeTabId = null;
  }
}
```

## Full IPC Chain Pattern

For features that need new main-process capabilities:

1. **git-service.js** — Add the business logic function (`fileLog`, `fileShow`)
2. **main.js** — Add `ipcMain.handle('renderer:channel-name', ...)` calling the service
3. **preload.js** — Expose via `contextBridge` in `window.api`
4. **Component** — Call `window.api.methodName()` from renderer

## Key Gotchas

1. **activateTab falls through**: Any new tab type MUST have a guard in `editor-manager.js` `activateTab()` — both in the deactivation section (lines ~53-64) and the activation section (lines ~76+). Without this, the tab will crash.

2. **Tab metadata lives on the tab object**: Set custom flags like `tab.isHistoryTab = true` on the tab from `tabManager.getTab(tabId)` so index.js activation handler can branch on it.

3. **editors Map is the source of truth for EditorManager**: Even custom tabs need an entry in `editorManager.editors` so that `activateTab` doesn't bail out at `if (!entry) return`.

4. **Context menus need dismissal lifecycle**: File explorer context menus need explicit dismiss-on-click-elsewhere and dismiss-on-Escape. Bind these once in the constructor, not per-show.

## Prevention

When adding future custom tab types (e.g., settings, preview, terminal):
- Follow this same pattern: flag in editors Map + guard in activateTab + render in onActivate callback
- Consider extracting a `registerTabType(name, { activate, deactivate, close })` plugin system if more than 3 custom types accumulate
