# Codebase Cleanup Sprint

**Date:** 2026-02-06
**Status:** Ready for planning

## What We're Building

A focused cleanup sprint to fix all critical and moderate issues in the existing codebase before continuing to Phase 2 features (file explorer, encoding detection, file watching, etc.). The goal is a solid foundation that won't create compounding bugs as features are added.

## Why This Approach

The codebase audit identified 13 critical + moderate issues that affect real usage today (data loss, UI freezes, resource leaks). Fixing these now prevents them from getting harder to fix as more code depends on the current patterns.

## Key Decisions

1. **Async fs over worker threads** — Replace all sync fs calls (`readFileSync`, `writeFileSync`, `readdirSync`, `statSync`) with `fs.promises` equivalents. Simpler change, unblocks the event loop. Worker threads are overkill for now.

2. **Notepad++ close behavior** — One dialog per dirty tab with Save / Don't Save / Cancel. Matches user expectations from Notepad++.

3. **IPC listeners return cleanup functions** — Each `on*` method in preload returns an unsubscribe function. Callers store and invoke it when done. Standard Electron pattern that scales as more channels are added.

## Issues to Address

### Critical (5)

| # | Issue | Fix |
|---|-------|-----|
| 1 | IPC listener leak — no removeListener support in preload | Return cleanup functions from all `on*` methods |
| 2 | Sync file I/O blocks main process (`readFileSync`, `writeFileSync`, `statSync`) | Convert to `fs.promises` throughout `file-service.js` and `main.js` |
| 3 | Find-in-files freezes main process (sync recursive `searchDir`) | Convert to async with `fs.promises.readdir`/`readFile` |
| 4 | Duplicate `onCursorChange` registration in `openLargeFile` | Remove the first registration at line 154 |
| 5 | Large file viewer double-init (`_render`/`_bindEvents` called in constructor AND externally) | Remove external calls; let constructor handle init |

### Moderate (8)

| # | Issue | Fix |
|---|-------|-----|
| 6 | No error handling in `renderer:save-file` | Add try/catch, restore watcher on failure, show error dialog |
| 7 | UTF-16 BE mapped to LE encoding | Map to manual byte-swap or warn user; don't silently garble |
| 8 | No unsaved changes prompt on tab/window close | Add per-dirty-tab dialog (Save/Don't Save/Cancel) + `beforeunload` |
| 9 | `nativeTheme.on('updated')` listener never removed | Store listener ref, remove in `window-all-closed` or guard with single registration |
| 10 | Monaco disposables ignored (listener accumulation on tab switch) | Store disposables per tab, dispose on tab switch/close |
| 11 | `closeTab` deletes tab before firing callbacks (watchers leaked) | Fire callbacks before `this.tabs.delete(tabId)` |
| 12 | Encoding not preserved on save | Store detected encoding per tab, pass it back on save |
| 13 | `DEFAULT_OPTIONS.theme` stale capture | Use getter or read `currentTheme` at call time |

### Minor (not in sprint scope, but noted)

- Duplicated `_escapeHtml` across 4 files — extract to shared utility
- Hardcoded progress bar IDs — scope to viewer instance
- `maxResults` not passed from preload — add parameter
- Dead `EventEmitter` import — remove
- Dual theme code paths (menu vs IPC) — consolidate
- No symlink loop protection — add visited set
- Platform-wrong tooltips (Ctrl vs Cmd) — detect platform

## Open Questions

- Should the minor issues be included if time allows, or strictly deferred to a separate pass?

## Next Steps

Run `/workflows:plan` to create the implementation plan for this sprint.
