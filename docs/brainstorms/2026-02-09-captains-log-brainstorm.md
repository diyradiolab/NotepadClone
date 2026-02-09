# Captain's Log

**Date:** 2026-02-09
**Status:** Ready for planning

## What We're Building

A daily journal side panel — the "Captain's Log." One entry per day, auto-created when the panel opens. Right-side collapsible panel (same pattern as Notes panel) with a date list on top and a textarea below. Search across all entries. Dates displayed with stardate formatting alongside normal dates for thematic flair. Auto-saves with debounce, persisted via electron-store.

## Why This Approach

- **Side panel** — always accessible without taking over the editor, follows proven Notes panel pattern
- **One entry per day** — zero friction, no titles to manage, no creation UI. Just open and write.
- **Auto-create today** — opening the panel always lands on today. No empty state, no "new entry" button needed.
- **Stardates** — because it's a Captain's Log, not a boring diary

## Key Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| UI location | Right-side collapsible panel | Same as Notes panel, proven pattern |
| Entry model | One per day, keyed by date string | Simple, no naming needed, natural organization |
| Auto-create | On panel open | Zero friction — always land on today |
| Search | Yes, across all entries | Find what you wrote last week |
| Stardate display | Yes, alongside normal date | Thematic — "Stardate 79563.2 — Feb 9, 2026" |
| Export/Import | Not in v1 | YAGNI — can add later |
| Persistence | electron-store (same as Notes) | Proven pattern, immediate save |
| Auto-save | Debounced (500ms) | Same as Notes panel |

## Scope

**In scope:**
- Right-side collapsible panel with toggle command + keyboard shortcut
- Date list (newest first) with stardate + human date display
- Textarea for entry content, auto-saves on change
- Auto-create today's entry when panel opens
- Search bar to filter entries by content
- Debounced persistence via electron-store
- Panel width resizable + persisted
- Menu item in View menu

**Out of scope (future):**
- Export/import (JSON or Markdown)
- Tags or categories
- Markdown rendering in entries
- Calendar picker navigation
- Entry templates

## Stardate Format

Stardates follow a simplified formula based on the Star Trek TNG-era convention:

```
Stardate = (year - 2000) * 1000 + dayOfYear * (1000/365.25)
```

Example: February 9, 2026 = day 40 of the year
- Stardate = 26 * 1000 + 40 * 2.7379 = 26109.5
- Display: "Stardate 26109.5 — Feb 9, 2026"

Stardates shown in the date list and as a header above the textarea. Normal date always shown alongside for clarity.

## Open Questions

- What keyboard shortcut for toggling the panel? (Ctrl+Shift+L for "Log"?)
- Should the panel share the right side with the Notes panel (only one visible at a time), or can both be open?
- Should empty entries (auto-created but never typed in) be persisted or cleaned up?
