---
title: "feat: Add Captain's Log daily journal panel"
type: feat
date: 2026-02-09
---

# Captain's Log

## Context

NotepadClone has a Notes panel for quick scratchpad notes. The Captain's Log adds a daily journal — one entry per day, auto-created, always ready to write. Right-side collapsible panel following the exact same pattern as Notes.

Brainstorm: `docs/brainstorms/2026-02-09-captains-log-brainstorm.md`

## Architecture

- **Plugin** (`plugins/captains-log/`) — standard plugin structure like `plugins/notes/`
- **Panel component** (`src/renderer/components/captains-log-panel.js`) — follows `notes-panel.js` pattern
- **Persistence** — electron-store via IPC (same pattern as Notes)
- **Access** — View > Captain's Log (`Ctrl+Shift+L`), plus command registry

## Entry Data Model

```js
// electron-store key: 'captainsLog'
{
  entries: {
    '2026-02-09': 'Today I deployed the new feature...',
    '2026-02-08': 'Worked on the plugin system...',
    // keyed by YYYY-MM-DD, value is plain text string
  },
  panelWidth: 280,   // persisted panel width
  visible: false,    // panel open/closed state
}
```

Entries keyed by date string. No metadata, no IDs — just date → content. Empty string values get cleaned up on panel close (only today's auto-created entry).

## Stardate Formula

```js
function toStardate(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const stardate = (date.getFullYear() - 2000) * 1000 + dayOfYear * (1000 / 365.25);
  return stardate.toFixed(1);
}
// Feb 9, 2026 → "Stardate 26109.5"
```

## Files to Create

### 1. `plugins/captains-log/package.json`

Standard manifest: name `notepadclone-captains-log`, displayName "Captain's Log", activationEvents `["onStartup"]`, contributes command: `captainsLog.toggle`.

### 2. `plugins/captains-log/index.js` — Plugin Entry

Imports CSS + panel component. Registers one command:
- `captainsLog.toggle` — toggles panel visibility (same as `notes.toggle`)

When toggling open, if Notes panel is visible, hide it first. Flushes save on `beforeunload`.

### 3. `src/renderer/components/captains-log-panel.js` — Panel Component

Follows `NotesPanel` pattern exactly (`src/renderer/components/notes-panel.js`). Uses `escapeHtml` from `src/renderer/utils/escape-html.js`.

**Panel layout (280px default width):**
```
┌────────────────────────────────────────┐
│  CAPTAIN'S LOG                         │
├────────────────────────────────────────┤
│  [Search entries...]                   │
├────────────────────────────────────────┤
│  ★ Stardate 26109.5 — Feb 9, 2026  ← │  (selected, today)
│    Stardate 26106.8 — Feb 8, 2026     │
│    Stardate 26104.1 — Feb 7, 2026     │
│    ...                                 │
├────────────────────────────────────────┤
│  ┌──────────────────────────────────┐  │
│  │ Stardate 26109.5 — Feb 9, 2026  │  │  (header above textarea)
│  ├──────────────────────────────────┤  │
│  │                                  │  │
│  │  (textarea — entry content)      │  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
└────────────────────────────────────────┘
```

**Key behaviors:**
- **Constructor:** `_render()`, `_loadData()`, `_initResize()` — same as NotesPanel
- **toggle():** Toggle `hidden` class. On show: auto-create today if missing, select today. If Notes visible, hide Notes first.
- **Date list:** Reverse chronological (newest first). Each item shows "Stardate XXXXX.X — Mon D, YYYY". Today's entry gets a `★` prefix. Click to select.
- **Active entry header:** Above textarea, shows stardate + date of selected entry.
- **Textarea:** Bound to active entry. Input triggers `_debounceSave()` (500ms).
- **Auto-create today:** On `toggle()` show, if no entry for today's date, create one with empty string.
- **Search:** Case-insensitive substring match on entry content. Filters date list. Search input at top.
- **Empty entry cleanup:** On `_saveData()`, remove today's entry if content is empty string AND it was auto-created (i.e., user never typed). Past entries with content are never deleted.
- **Resize:** Left-edge handle, min 200px, max 500px, same drag logic as NotesPanel.
- **flushSave():** Immediately save pending debounced data (called on `beforeunload` and toggle-hide).
- **Always select today on open:** When panel becomes visible, always navigate to today's entry regardless of last-viewed entry.

**Methods (mirroring NotesPanel):**
- `toggle()`, `show()`, `hide()`, `isVisible()`, `flushSave()` — public API
- `_render()` — builds DOM
- `_loadData()` — loads from IPC, restores width/visibility
- `_saveData()` — persists to IPC (with empty entry cleanup)
- `_debounceSave()` — 500ms debounce wrapper
- `_ensureToday()` — creates today's entry if missing, returns date key
- `_selectEntry(dateKey)` — sets active entry, updates textarea + header
- `_renderDateList()` — renders filtered date list
- `_showActiveEntry()` — updates textarea content
- `_initResize()` — resize handle on left edge
- `_toStardate(date)` — stardate calculation
- `_formatDate(dateStr)` — "Stardate XXXXX.X — Mon D, YYYY"

### 4. `src/renderer/styles/captains-log-panel.css`

Follows `notes-panel.css` pattern. Key classes:
- `.captains-log-panel` — same dimensions/flex as `.notes-panel`
- `.captains-log-panel.hidden` — `display: none`
- `.captains-log-resize` — left-edge resize handle (4px)
- `.captains-log-search` — search input row
- `.captains-log-list` — scrollable date list, max-height 40%
- `.captains-log-item` / `.captains-log-item.active` — date row
- `.captains-log-item.today` — subtle highlight for today's entry
- `.captains-log-stardate` — stardate text styling
- `.captains-log-date` — human date (dimmer)
- `.captains-log-entry-header` — stardate header above textarea
- `.captains-log-textarea` — same styling as `.notes-textarea`
- `.captains-log-empty` — empty state ("No entries match your search")

## Files to Modify

### 5. `src/main/main.js`

Add after the Notes IPC handlers (~line 773):

```js
// ── Captain's Log ──

ipcMain.handle('renderer:get-captains-log', async () => {
  return store.get('captainsLog', { entries: {}, panelWidth: 280, visible: false });
});

ipcMain.handle('renderer:save-captains-log', async (_event, data) => {
  store.set('captainsLog', data);
});
```

### 6. `src/main/preload.js`

Add after Notes IPC section (~line 131):

```js
// Captain's Log
getCaptainsLog: () => ipcRenderer.invoke('renderer:get-captains-log'),
saveCaptainsLog: (data) => ipcRenderer.invoke('renderer:save-captains-log', data),
onMenuToggleCaptainsLog: (callback) => ipcRenderer.on('main:toggle-captains-log', callback),
```

### 7. `src/main/menu.js`

Add to View menu after Notes Panel item:

```js
{
  label: "Captain's Log",
  accelerator: 'CmdOrCtrl+Shift+L',
  click: () => mainWindow.webContents.send('main:toggle-captains-log'),
},
```

### 8. `src/renderer/index.html`

Add a sibling container next to the Notes panel div:

```html
<div id="captains-log-panel" class="captains-log-panel hidden"></div>
```

### 9. `src/renderer/index.js`

1. Import captains-log plugin + manifest (alongside other plugin imports)
2. Register plugin: `pluginHost.register(captainsLogManifest, captainsLogPlugin)`
3. Add menu handler: `window.api.onMenuToggleCaptainsLog(() => commandRegistry.execute('captainsLog.toggle'))`

## Panel Coordination (Notes ↔ Captain's Log)

When Captain's Log opens, if Notes panel is visible, flush Notes save and hide it. When Notes opens, if Captain's Log is visible, flush its save and hide it. Each panel only manages hiding the other — no shared state.

Implementation: The captains-log plugin gets the Notes panel reference via `pluginHost._plugins.get('notepadclone-notes')._exports.getPanel()` and calls `.flushSave()` + `.hide()` before showing itself. Same pattern in reverse for the Notes plugin (or handled in index.js wiring).

## Reusable Patterns

- **Panel structure:** `NotesPanel` (`src/renderer/components/notes-panel.js`) — constructor, render, load, save, debounce, resize, toggle
- **CSS:** `notes-panel.css` — panel dimensions, search input, list, textarea, resize handle
- **IPC persistence:** Notes get/save pattern (`renderer:get-notes-data` / `renderer:save-notes-data`)
- **Plugin entry:** `plugins/notes/index.js` — CSS import, component creation, command registration, beforeunload flush
- **HTML escaping:** `escapeHtml` from `src/renderer/utils/escape-html.js`
- **CSS variables:** Reuse `--bg-primary`, `--bg-surface`, `--text-primary`, `--text-muted`, `--border-secondary`, `--input-border-focus`

## Open Questions Resolved

| Question | Answer |
|---|---|
| Keyboard shortcut | `Ctrl+Shift+L` for "Log" |
| Notes panel conflict | Only one visible at a time — opening one hides the other |
| Empty entry cleanup | Only today's auto-created entry if content is empty string on close |
| Toggle behavior | Toggle open/closed (same as Notes) |
| Always select today on open | Yes — always navigate to today when panel opens |
| Past entries editable | Yes — fully editable |
| Search type | Case-insensitive plain text substring |
| Save on close | Flush pending debounce immediately |

## Verification

1. `npx webpack --mode development` — builds without errors
2. `npx electron .` — app launches normally
3. **View > Captain's Log** (or `Ctrl+Shift+L`) opens panel on right side
4. Today's entry auto-created with stardate header
5. Type content — auto-saves after 500ms
6. Close and reopen panel — content persisted
7. Close app and reopen — entries survive restart
8. Open panel on a new day — new entry auto-created, yesterday's entry in list
9. Click past entry — textarea shows that entry's content
10. Search — filters date list by content
11. Resize panel — width persists
12. Open Notes panel while Captain's Log is open — Log hides, Notes appears
13. Open Captain's Log while Notes is open — Notes hides, Log appears
14. Open panel, type nothing, close — empty today entry cleaned up
