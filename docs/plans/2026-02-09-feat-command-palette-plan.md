---
title: Command Palette
type: feat
date: 2026-02-09
---

# Command Palette

## Overview

A fuzzy-search command palette (Ctrl+Shift+P) that lists all registered commands from the existing CommandRegistry. Type to filter with fuzzy matching, arrow keys to navigate, Enter to execute. Each command shows its title and keyboard shortcut badge. Implemented as a plugin following existing dialog patterns.

## Proposed Solution

Build a lightweight overlay dialog (same pattern as ClipboardHistoryDialog, RecentFilesDialog) that reads from `CommandRegistry.getAll()`. Simple fuzzy substring matching on command titles. No new dependencies — pure vanilla JS.

Reassign Plugin Manager from Ctrl+Shift+P to no accelerator (accessible via the palette itself).

## Data Source

The `CommandRegistry` already stores everything needed:

```js
// command-registry.js:7
this._commands = new Map(); // id → { title, handler, shortcut?, when?() }
```

`getAll()` returns the full Map. Each entry has `title` (display name) and optional `shortcut` (e.g. `"Ctrl+Shift+H"`). The palette just needs to iterate this, filter, and display.

## Files to Create

### 1. `plugins/command-palette/package.json`

```json
{
  "name": "notepadclone-command-palette",
  "displayName": "Command Palette",
  "version": "1.0.0",
  "notepadclone": {
    "activationEvents": ["onStartup"],
    "contributes": {
      "commands": ["commandPalette.show"]
    }
  }
}
```

### 2. `plugins/command-palette/index.js` — Plugin Entry

```js
import '../../src/renderer/styles/command-palette.css';
import { CommandPaletteDialog } from '../../src/renderer/components/command-palette-dialog';

export function activate(api) {
  const commandRegistry = api._services.commandRegistry;
  const dialog = new CommandPaletteDialog(commandRegistry);

  api.registerCommand({
    id: 'commandPalette.show',
    title: 'Command Palette',
    shortcut: 'Ctrl+Shift+P',
    handler: () => dialog.show(),
  });

  return { deactivate() {} };
}
```

### 3. `src/renderer/components/command-palette-dialog.js` — Dialog Component

Follows ClipboardHistoryDialog / RecentFilesDialog pattern. Uses `escapeHtml` from `src/renderer/utils/escape-html.js`.

**Dialog layout (500px wide, positioned in top third of screen):**
```
┌──────────────────────────────────────────────────────┐
│  > Search commands...                                │
├──────────────────────────────────────────────────────┤
│  Toggle Terminal                           Ctrl+`    │
│  Code Snippets                           Ctrl+Alt+S  │
│  Toggle Word Wrap                           Alt+W    │
│  Git File History                      Ctrl+Shift+H  │
│  Save Selection as Snippet                           │
│  ...                                                 │
└──────────────────────────────────────────────────────┘
```

**Class structure:**

```js
export class CommandPaletteDialog {
  constructor(commandRegistry) { ... }

  show() { ... }          // Build overlay, render command list, focus input
  close() { ... }         // Remove overlay, clean up listeners

  _getCommands() { ... }  // Read from registry, filter out palette's own command, sort alphabetically
  _filterCommands(query) { ... }  // Fuzzy substring match on title
  _renderList(commands) { ... }    // Generate HTML for command rows
  _executeSelected() { ... }       // Close dialog, run command handler
  _formatShortcut(shortcut) { ... } // Convert "Ctrl+Shift+H" to display format
}
```

**Key behaviors:**

- **Open**: Builds overlay with search input + scrollable list. Input auto-focused. Shows all commands initially.
- **Search**: On every keystroke, filters commands by fuzzy substring match on title (case-insensitive). Typing "tog term" matches "Toggle Terminal" — split query into words, each word must appear as a substring.
- **Selection**: First item is auto-selected. Arrow Up/Down to navigate. Selected item highlighted.
- **Execute**: Enter executes selected command and closes palette. Click on item also executes.
- **Close**: Escape, click outside, or after executing a command.
- **Shortcut badges**: Right-aligned, styled as muted text. Only shown for commands that have a `shortcut` property.
- **Filtering out self**: The palette's own "Command Palette" command is excluded from the list (opening it while it's open makes no sense).
- **Commands with `when` guard**: Include all commands in the list regardless of `when()` — the guard runs at execution time.

### 4. `src/renderer/styles/command-palette.css`

```css
.cmd-palette-overlay — full-screen overlay (same dialog-overlay pattern)
.cmd-palette-dialog — 500px wide, positioned top: 20vh, no max-height (list scrolls)
.cmd-palette-input — full-width search input with ">" prefix indicator
.cmd-palette-list — scrollable command list, max-height ~50vh
.cmd-palette-item — row with title (left) + shortcut badge (right)
.cmd-palette-item.selected — highlighted background
.cmd-palette-shortcut — right-aligned, muted color, monospace-ish
.cmd-palette-empty — "No matching commands" message
```

Position the dialog in the top third of the screen (VS Code style) rather than vertically centered (unlike other dialogs). This feels more like a launcher.

## Files to Modify

### 5. `src/main/menu.js`

**Remove** `Ctrl+Shift+P` accelerator from Plugin Manager:

```js
// Before:
{ label: 'Plugin Manager', accelerator: 'CmdOrCtrl+Shift+P', ... }

// After:
{ label: 'Plugin Manager', ... }  // no accelerator
```

**Add** Command Palette to Edit menu (or keep it shortcut-only via the CommandRegistry keyboard handler — the menu entry is optional since the shortcut is registered in the CommandRegistry, not in the Electron menu). Since the CommandRegistry already has `setupKeyboardShortcuts()`, the `Ctrl+Shift+P` shortcut registered by the plugin will work automatically.

Actually, add it to the View menu for discoverability:

```js
{
  label: 'Command Palette...',
  accelerator: 'CmdOrCtrl+Shift+P',
  click: () => mainWindow.webContents.send('main:command-palette'),
},
```

### 6. `src/main/preload.js`

```js
onMenuCommandPalette: (callback) => ipcRenderer.on('main:command-palette', callback),
```

### 7. `src/renderer/index.js`

Import + register plugin:
```js
import * as commandPalettePlugin from '../../plugins/command-palette/index';
import commandPaletteManifest from '../../plugins/command-palette/package.json';

pluginHost.register(commandPaletteManifest, commandPalettePlugin);
```

Menu handler:
```js
window.api.onMenuCommandPalette(() => commandRegistry.execute('commandPalette.show'));
```

## Reusable Patterns

- **Dialog overlay**: `ClipboardHistoryDialog` (`src/renderer/components/clipboard-history-dialog.js`) — overlay, search, list, keyboard nav
- **HTML escaping**: `escapeHtml` from `src/renderer/utils/escape-html.js`
- **CSS classes**: `dialog-overlay`, `dialog-box` from `src/renderer/styles/main.css`
- **Command data**: `CommandRegistry.getAll()` (`src/renderer/command-registry.js:39`)

## Acceptance Criteria

- [ ] Ctrl+Shift+P opens command palette overlay
- [ ] View > Command Palette menu item works
- [ ] All registered commands appear in the list (except the palette command itself)
- [ ] Commands with shortcuts show shortcut badge (right-aligned)
- [ ] Typing filters commands with fuzzy word matching ("tog term" → "Toggle Terminal")
- [ ] Arrow keys navigate the list, selected item is highlighted
- [ ] Enter executes the selected command and closes palette
- [ ] Click on a command executes it
- [ ] Escape closes the palette
- [ ] Click outside closes the palette
- [ ] Plugin Manager no longer has Ctrl+Shift+P accelerator
- [ ] Empty state shows "No matching commands"

## Verification

1. `npx webpack --mode development` — builds without errors
2. `npx electron .` — app launches
3. Ctrl+Shift+P — palette opens with all commands listed
4. Type "terminal" — filters to "Toggle Terminal"
5. Type "tog term" — same result (fuzzy multi-word match)
6. Arrow down, Enter — executes selected command
7. Click a command — executes it
8. Escape — closes palette
9. Commands with shortcuts show badge (e.g. "Ctrl+`" next to Terminal)
10. Plugin Manager accessible via palette search (no longer has Ctrl+Shift+P)

## References

- Brainstorm: `docs/brainstorms/2026-02-09-command-palette-brainstorm.md`
- CommandRegistry: `src/renderer/command-registry.js`
- ClipboardHistoryDialog (pattern): `src/renderer/components/clipboard-history-dialog.js`
- Plugin API registerCommand: `src/renderer/plugin-api.js:34`
