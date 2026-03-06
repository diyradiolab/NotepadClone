---
title: "feat: Dashboard local application shortcuts"
type: feat
date: 2026-03-06
---

# Dashboard Local Application Shortcuts

## Overview

Extend the web dashboard to support **local application shortcuts** alongside web links. Users add apps via a Browse button in the add form, and clicking an app tile launches it externally. Cross-platform: macOS `.app` bundles, Windows `.exe`/`.lnk`, Linux executables.

Drag-and-drop from OS file managers is deferred to v2.

## Problem Statement

The dashboard currently only supports web link tiles that open in an embedded browser. Users who want quick access to local tools (terminals, database GUIs, design apps) must leave NotepadClone entirely. Adding app shortcuts turns the dashboard into a unified launchpad for both web services and local tools.

## Proposed Solution

### Data Model Evolution

Extend the existing `dashboardLinks` schema to support two tile types:

```javascript
// Existing (web link)
{ id: 1709000001, type: 'link', name: 'GitHub', url: 'https://github.com' }

// New (app shortcut)
{ id: 1709000002, type: 'app', name: 'VS Code', path: '/Applications/Visual Studio Code.app' }
```

**Migration:** Runs in the main process inside `renderer:get-dashboard-links` handler (not the renderer). On read, any entry without a `type` field gets `type: 'link'` added and the list is re-saved. This ensures all reads return migrated data and avoids race conditions with multiple dashboard tabs.

**Validation update (main.js):** Explicit conditional validation:

```javascript
const valid = links.every(l => {
  if (!l || typeof l.id !== 'number' || typeof l.name !== 'string' || l.name.length > 200) return false;
  if (!l.type) return false;
  if (l.type === 'link') return typeof l.url === 'string' && l.url.length <= 2000;
  if (l.type === 'app') return typeof l.path === 'string' && l.path.length <= 4096;
  return false; // unknown type rejected
});
```

**IDs stay numeric** (`Date.now()`). No type change — existing validation requires `typeof l.id === 'number'`.

### Adding App Shortcuts: Browse Form

Extend the existing "Add Link" form with a type toggle:

- Two small buttons above the form: **Link** | **App** (default: Link)
- When "App" is selected: Name + Path fields, with a **Browse** button that opens `dialog.showOpenDialog` filtered to applications
- Browse filter per platform:
  - macOS: `{ filters: [{ name: 'Applications', extensions: ['app'] }] }`
  - Windows: `{ filters: [{ name: 'Applications', extensions: ['exe', 'lnk'] }] }`
  - Linux: no filter (show all files)
- Browse returns just `{ cancelled, filePath }` — renderer extracts display name from basename (stripping `.app`/`.exe`/`.lnk` extension)
- User can edit the auto-filled name before saving

**Platform-specific name extraction (renderer):**

| Platform | Name Extraction |
|----------|-----------------|
| macOS | Strip `.app` extension from basename |
| Windows `.exe` | Strip `.exe` from basename |
| Windows `.lnk` | Strip `.lnk` from basename |
| Linux | Use basename as-is |

### Launching Apps

**API:** `shell.openPath(path)` in main process via new IPC channel `renderer:launch-app`.

Why `shell.openPath`:
- Cross-platform: handles `.app` bundles (directories), `.exe`, `.lnk` resolution natively
- No platform branching needed in the launch code
- Returns error string on failure (empty string = success)

**Re-validation at launch time:** Before calling `shell.openPath`, the main process checks that the path still exists and matches a recognized app pattern (`.app`/`.exe`/`.lnk` extension, or executable bit on Linux). This prevents launching arbitrary paths if stored data is tampered with or the file at the path has changed.

**Click handler:** In `_renderGrid()`, app tiles call `this._launchApp(link.path, link.name)` instead of `this._navigateTo(link.url)`. Dashboard stays on grid view.

**Error handling:** If launch fails, show an inline toast on the dashboard: "Could not launch [name]: [error]". No tile state change (app may be temporarily unavailable).

**Known platform quirks:**
- Windows `.lnk` whose target is uninstalled may show a Windows "missing shortcut" dialog rather than returning a clean error string
- macOS symlinked `.app` bundles that point to deleted targets may have undefined behavior
- These are accepted limitations — `shell.openPath` delegates to the OS

### Visual Differentiation

App tiles get a `wd-tile--app` CSS modifier class:

- **Badge:** Small monospace `APP` label in top-left corner, styled with muted background (`wd-tile-badge`)
- **Subtitle:** Shows truncated file path instead of URL (styled with `wd-tile-path`), HTML-escaped via `escapeHtml()`

```
┌──────────────────┐    ┌──────────────────┐
│ APP              │    │                  │
│                  │    │                  │
│   VS Code        │    │   GitHub          │
│   /Applications/… │    │   github.com      │
│              [x] │    │              [x] │
└──────────────────┘    └──────────────────┘
  App tile (badge)       Web link tile
```

### Duplicate Detection

When saving a new app shortcut, check if `this._links` already contains an entry with the same `path`. If so, show a toast: "[name] is already on your dashboard" and do not add a duplicate.

### New IPC Channels

| Channel | Direction | Input | Output |
|---------|-----------|-------|--------|
| `renderer:launch-app` | Renderer -> Main | `{ appPath: string }` | `{ success: boolean, error: string }` |
| `renderer:browse-for-app` | Renderer -> Main | -- | `{ cancelled: boolean, filePath: string }` |

Two new IPC channels. `browse-for-app` returns only the file path — name extraction and validation happen in the renderer (simple extension check) and main process (launch-time re-validation).

## Technical Considerations

**Security:** `shell.openPath` has the same trust model as double-clicking an app in the OS file manager. The user explicitly adds shortcuts via a native file picker that filters to application types. Path is re-validated at launch time. OS-level protections (Gatekeeper, SmartScreen) still apply.

**Toast implementation:** The dashboard will use its own inline toast (absolute-positioned div that fades out after 3s), similar to the pattern in `terminal-file-opener.js`. No shared toast utility exists yet — this is a self-contained implementation within the dashboard viewer.

**File paths in HTML:** All `path` values must go through `escapeHtml()` before rendering in tile innerHTML. Windows paths can contain `&` in directory names (e.g., `C:\Program Files\AT&T\...`).

## Acceptance Criteria

### Data Model
- [x] Existing dashboard links gain `type: 'link'` on first load (migration in main process)
- [x] Main process validation accepts both `{type:'link', url}` and `{type:'app', path}` entries
- [x] Unknown types are rejected by validation
- [x] `path` field capped at 4096 characters
- [x] Combined 100-item limit applies to both types

### Browse Form
- [x] Add form has Link/App type toggle buttons
- [x] App mode shows Name + Path fields with Browse button
- [x] Browse button opens native file picker filtered to applications per platform
- [x] Display name auto-fills from filename (stripping `.app`/`.exe`/`.lnk`)
- [x] User can edit auto-filled name before saving
- [x] Adding a duplicate path shows toast and does not create a second tile

### Launching
- [x] Clicking an app tile launches the app externally via `shell.openPath`
- [x] Path is re-validated in main process before launching
- [x] Dashboard stays on grid view after launch (no browser mode)
- [x] If app path no longer exists, toast shows error message
- [x] `.lnk` files on Windows resolve to their target app at launch time

### Visual
- [x] App tiles show `APP` badge in top-left corner
- [x] App tiles show file path as subtitle (truncated with ellipsis, HTML-escaped)
- [x] App tile delete button works identically to web link tiles

## Files Changed

| File | Changes |
|------|---------|
| `src/renderer/components/web-dashboard-viewer.js` | App tile rendering, `_launchApp()`, type toggle in add form, duplicate detection |
| `src/renderer/styles/web-dashboard.css` | Add `.wd-tile--app`, `.wd-tile-badge`, `.wd-tile-path` styles |
| `src/main/main.js` | Migration in `get-dashboard-links`; update `save-dashboard-links` validation; add `renderer:launch-app` (with re-validation), `renderer:browse-for-app` IPC handlers |
| `src/main/preload.js` | Expose `launchApp`, `browseForApp` via contextBridge |

No new plugins needed — this extends the existing `web-dashboard` plugin.

## Implementation Order

1. **Data model + migration + validation** — migration in `get-dashboard-links` handler, updated validation in `save-dashboard-links` (30 min)
2. **IPC channels** — `launch-app` with re-validation, `browse-for-app` with `dialog.showOpenDialog`, expose in preload (45 min)
3. **App tile rendering + launch** — visual differentiation, click-to-launch, inline toast, CSS (45 min)
4. **Add form with type toggle** — Link/App toggle, Browse button, name extraction, duplicate detection (45 min)

Total: ~2.75 hours

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| `.lnk` display name is ugly ("chrome.lnk") | Strip extension for display; `shell.openPath` handles target resolution |
| macOS Gatekeeper blocks unsigned apps | OS-level prompt appears naturally; no NotepadClone intervention needed |
| Windows `.lnk` target uninstalled | OS may show "missing shortcut" dialog; accepted limitation |
| Linux has no standard app extension | No filter on file picker; let user select any file; re-validate at launch |

## Future (v2)

- Drag-and-drop from OS file managers (Finder, Explorer, Nautilus)
- Linux `.desktop` file parsing for better name extraction
- App icon extraction (platform-specific)
- Tile reorder via drag within the grid

## References

- Dashboard viewer: `src/renderer/components/web-dashboard-viewer.js`
- Dashboard CSS: `src/renderer/styles/web-dashboard.css`
- Dashboard IPC: `src/main/preload.js:171-184`, `src/main/main.js:920-1023`
- Inline toast pattern: `src/renderer/components/terminal-file-opener.js`
- Viewer plugin pattern: `docs/solutions/integration-issues/adding-viewer-plugin-http-client.md`
- Custom tab gotchas: `docs/solutions/integration-issues/adding-custom-tab-types-to-editor-system.md`
