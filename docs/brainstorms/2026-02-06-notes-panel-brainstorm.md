---
topic: Notes Panel (Sidebar Scratchpad)
date: 2026-02-06
status: ready-for-plan
---

# Notes Panel Brainstorm

## What We're Building

A right-side vertical panel for quick note-taking without leaving the editor. Supports multiple named plain-text notes that persist across sessions. Toggled via toolbar button, View menu, and keyboard shortcut. Collapsible and resizable like the file explorer.

## Why This Feature

Developers constantly need to jot things down while coding — TODOs, debug observations, copy/paste snippets, meeting notes, command references. Currently they switch to another app or open a throwaway tab. A dedicated notes panel keeps everything in context.

## Key Decisions

- **Position**: Right side — doesn't compete with file explorer on the left
- **Format**: Plain text — simple, fast, no formatting overhead
- **Structure**: Multiple named notes with a list view — user can have one or many
- **Persistence**: Always persists — saved to disk automatically (e.g. `~/.notepadclone/notes.json` or similar)
- **Toggle**: Toolbar button + View menu item + keyboard shortcut
- **Collapsible**: Can collapse/expand the panel, resizable width via drag

## Features

### Core
- Create new note (with default name like "Note 1")
- Rename notes inline
- Delete notes (with confirmation)
- Switch between notes via list
- Auto-save on every edit (debounced)
- Plain text editing area

### Nice-to-Haves
- **Pin notes**: Pin important notes to the top of the list
- **Search**: Quick filter input to search across all note titles and content
- **Toolbar button**: Toggle panel visibility from the main toolbar

## Open Questions

- Keyboard shortcut — what key combo? (Suggest: `Ctrl+Shift+N` or `Ctrl+Alt+N`)
- Storage location — app-level (`~/.notepadclone/`) or per-project (`.notepadclone/notes.json` in project folder)?
  - Decision was "persist always" which suggests app-level, but per-project could also persist always
- Maximum note size — should we cap it or let it grow?
- Should deleting the last note leave an empty state or auto-create a new blank note?

## UI Sketch

```
┌─────────────────────────────────┬──────────────┐
│  [tabs]                         │ NOTES    [+] │
├─────────────────────────────────┤ [🔍 search ] │
│                                 │ 📌 TODO list │
│                                 │ Debug notes  │
│        Monaco Editor            │ API keys     │
│                                 │ > Scratch    │
│                                 ├──────────────┤
│                                 │              │
│                                 │ (note text)  │
│                                 │              │
├─────────────────────────────────┴──────────────┤
│ [status bar]                                   │
└────────────────────────────────────────────────┘
```

## References

- File explorer pattern: `src/renderer/components/file-explorer.js` (left panel toggle, resize)
- Toolbar button pattern: `src/renderer/index.html` (existing toolbar buttons)
- Persistence pattern: electron-store (already used for theme/recent files)
