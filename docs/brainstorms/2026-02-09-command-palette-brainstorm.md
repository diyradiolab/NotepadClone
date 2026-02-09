# Command Palette

**Date:** 2026-02-09
**Status:** Ready for planning

## What We're Building

A fuzzy-search command palette (Ctrl+Shift+P) that lists all registered commands from the CommandRegistry. User types to filter, arrow keys to navigate, Enter to execute. Each command shows its name and keyboard shortcut (if any). Follows the VS Code pattern — the universal "do anything" launcher.

## Why This Approach

- **Commands only** for v1 — keeps scope tight, ships fast, still hugely useful
- Builds directly on the existing `CommandRegistry` which already tracks all plugin commands
- Foundation piece: once the palette exists, every new feature is instantly discoverable through it
- Can be extended later to search files (Ctrl+P) and symbols (Ctrl+Shift+O) without redesign

## Key Decisions

| Decision | Choice | Reasoning |
|---|---|---|
| Shortcut | Ctrl+Shift+P | VS Code standard, muscle memory |
| Search scope | Commands only (v1) | YAGNI — files/symbols can come later |
| Fuzzy matching | Yes | Typing "tog term" should match "Toggle Terminal" |
| Show shortcuts | Yes, as right-aligned badge | Teaches users keyboard shortcuts |
| Plugin Manager shortcut | Reassign to different key | Ctrl+Shift+P is too valuable for a niche feature |
| Implementation | Dialog-style overlay (like Clipboard History) | Proven pattern in codebase |
| Data source | CommandRegistry.getAll() | Already has id, title; add optional shortcut field |

## Scope

**In scope:**
- Overlay dialog with search input + scrollable command list
- Fuzzy text matching on command titles
- Keyboard shortcut badges per command
- Arrow keys + Enter to navigate and execute
- Escape to close
- Plugin structure (like all other features)

**Out of scope (future):**
- File search mode (Ctrl+P)
- Symbol search mode (Ctrl+Shift+O)
- Recent commands / frecency sorting
- Custom keybinding editor

## Open Questions

- What shortcut should Plugin Manager move to? (Could be a command-palette-only action with no shortcut)
- Should the palette show a ">" prefix in the input (VS Code style) to hint at future modes?
- Should recently-used commands float to the top?
