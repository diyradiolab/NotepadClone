---
title: "feat: Open files from terminal in editor"
type: feat
date: 2026-03-04
---

# Open Files from Terminal in Editor

## Overview

Add two mechanisms for opening files from the integrated terminal into the editor:

1. **`edit <file>` command** — Type `edit myfile.js` in the terminal to open it in the editor
2. **Ctrl+click on filenames** — Ctrl+click (Cmd+click on macOS) on file paths visible in terminal output to open them

Both depend on a new **CWD tracking** system so relative paths resolve correctly as the user navigates directories.

## Problem Statement

When working in the terminal, there's no way to quickly open a file in the editor without switching to the File Explorer or using File > Open. This breaks flow — especially when you see a filename in `ls` output, a compiler error, or `grep` results and want to jump to it immediately.

## Proposed Solution

### Architecture: Three Components

```
┌─────────────────────────────────────────────────┐
│  1. CWD Tracker (foundation)                    │
│     Shell hook emits OSC 7 → xterm.js parses it │
│     Fallback: initial spawn CWD                 │
├─────────────────────────────────────────────────┤
│  2. `edit` Command (shell alias)                │
│     Shell function injected at spawn → emits    │
│     OSC 9999 escape sequence → terminal parses  │
│     → emits file:openByPath                     │
├─────────────────────────────────────────────────┤
│  3. Ctrl+Click File Links (xterm link provider) │
│     registerLinkProvider with path regex →       │
│     resolve against tracked CWD →               │
│     validate via IPC → emit file:openByPath     │
└─────────────────────────────────────────────────┘
```

## Technical Approach

### Component 1: CWD Tracking via OSC 7

**Why OSC 7:** It's the standard mechanism used by modern shells (zsh, bash 4.4+, fish) to report the working directory to the terminal emulator. VS Code uses this same approach.

**How it works:**

1. At PTY spawn time (`terminal-service.js`), inject shell hooks via environment variables:
   - **bash**: Append to `PROMPT_COMMAND` (not replace — preserve existing value) to emit `\e]7;file://hostname/current/path\a` after each command
   - **zsh**: Append to `precmd_functions` array to emit the same sequence
   - Injected via env vars only — never modify shell config files

2. In `terminal-panel.js`, register a custom OSC 7 parser on the xterm.js instance:
   - `xterm.parser.registerOscHandler(7, (data) => { this._cwd = extractPath(data); })`
   - Extract the path from the `file://hostname/path` URI format

3. Store the tracked CWD as `this._cwd` on the TerminalPanel instance
4. Fall back to the initial spawn CWD if no OSC 7 has been received yet

**Limitations (accepted):**
- CWD tracking stops working inside SSH sessions, Docker containers, or tmux
- Non-standard shells may not support the injected hooks
- Fallback to initial CWD is always available

**Files to modify:**
- `src/main/terminal-service.js` — inject `PROMPT_COMMAND`/`precmd_functions` env vars at spawn
- `src/renderer/components/terminal-panel.js` — register OSC 7 parser, store `_cwd`

### Component 2: `edit` Command via Shell Function

**Why shell function (not input interception):** Intercepting keystrokes before the shell is fragile — it breaks with line editing, history search (Ctrl+R), tab completion, and readline features. A shell function is robust: it runs through the shell normally, emits a custom escape sequence that the terminal parses, and the shell prints a new prompt as usual.

**Escape sequence design:**
- CWD tracking uses standard OSC 7: `\e]7;file:///path\a`
- `edit` command uses a separate private OSC code (9999): `\e]9999;filepath\a`
- Two separate xterm.js handlers: `registerOscHandler(7, ...)` and `registerOscHandler(9999, ...)`

**How it works:**

1. At PTY spawn time, inject the `edit` shell function via environment variables:
   - Define `edit() { for f in "$@"; do printf '\e]9999;%s\a' "$f"; done }`
   - For **bash**: inject via `BASH_ENV` pointing to a temp file, or eval an env var in `PROMPT_COMMAND`
   - For **zsh**: inject via `precmd_functions` eval or `ZDOTDIR` env trick
   - The function handles quoted paths with spaces naturally (the shell does quoting/splitting)

2. In `terminal-panel.js`, register OSC 9999 handler:
   - Parse the received path string
   - Strip optional `:line` suffix, extract line number
   - If path is relative, resolve against `this._cwd`
   - Validate via IPC: `window.api.resolvePath({ path, cwd })` → `{ absolutePath, exists }`
   - If file exists: `this.api.events.emit('file:openByPath', { filePath: absolutePath, lineNumber })`
   - If file doesn't exist: show an error notification
   - Focus moves to the editor

**Files to modify:**
- `src/main/terminal-service.js` — inject shell function and CWD hook env vars
- `src/renderer/components/terminal-panel.js` — register OSC 9999 handler, resolve + open file
- `src/main/preload.js` — expose new `resolvePath` IPC method
- `src/main/main.js` — add `renderer:resolve-path` IPC handler

### Component 3: Ctrl+Click File Links

**How it works:**

1. Register a custom link provider on the xterm.js instance using `xterm.registerLinkProvider(provider)`
2. The provider scans each line for path-like patterns using a conservative regex:
   - Matches patterns containing `/` or starting with `./` or `../`: `./src/file.js`, `../path`, `/absolute/path`, `src/components/App.jsx`
   - Also matches `file.ext:42` (with line number suffix)
   - Ignores: URLs (already handled by WebLinksAddon), bare words without `/`
   - Start conservative — do NOT match bare `filename.ext` without a path separator on v1
3. On hover: underline the detected path, show tooltip with resolved absolute path
4. On click: resolve path against `this._cwd`, validate via IPC, emit `file:openByPath`
5. Focus stays in the terminal (user is browsing output)

**Modifier key:** Follow whatever convention WebLinksAddon already uses in the project.

**Line number parsing:** Parse `filepath:line` patterns. Pass `lineNumber` to `file:openByPath` event (already supported). No column support in v1.

**Files to modify:**
- `src/renderer/components/terminal-panel.js` — register link provider, path regex, click handler

### New Helper: TerminalFileOpener

Extract all file-opening logic into a `TerminalFileOpener` class to keep `TerminalPanel` focused on xterm lifecycle and container management. This helper owns:

- `_cwd` state and OSC 7 parsing
- OSC 9999 handler (edit command)
- Link provider registration (Ctrl+click)
- Shared path resolution: strip `:line`, resolve against CWD, call IPC, emit event

`TerminalPanel` instantiates it and passes `this.xterm` and `this.api`.

**New file:**
- `src/renderer/components/terminal-file-opener.js`

### New IPC: Path Resolution

**Channel:** `renderer:resolve-path`

**Input:** `{ path: string, cwd: string | null }`

**Output:** `{ absolutePath: string, exists: boolean }`

The renderer strips `:line` suffixes before calling this IPC — the IPC receives a clean path. The renderer owns all line number parsing.

Resolution logic in main process: if relative and CWD provided, `path.resolve(cwd, filePath)`. If relative and no CWD, `path.resolve(os.homedir(), filePath)`. Then `fs.stat` to check existence as a regular file.

**Files to modify:**
- `src/main/main.js` — add `ipcMain.handle('renderer:resolve-path', ...)`
- `src/main/preload.js` — expose `resolvePath` via contextBridge

## Acceptance Criteria

### CWD Tracking
- [x] Terminal tracks CWD via OSC 7 for bash and zsh shells
- [x] `_cwd` updates after every `cd` command when using bash or zsh
- [x] Falls back to initial spawn CWD when no OSC 7 received

### `edit` Command
- [x] `edit myfile.js` opens the file in a new editor tab (or activates existing tab)
- [x] `edit src/components/app.js` resolves relative path against current terminal CWD
- [x] `edit /absolute/path/file.js` works with absolute paths
- [x] `edit file.js:42` opens file at line 42
- [x] `edit "file with spaces.js"` works (shell handles quoting)
- [x] `edit nonexistent.js` shows an error notification
- [x] After `edit`, focus moves to the editor
- [x] Shell prompt reappears normally after `edit` (not intercepted — real shell function)

### Ctrl+Click
- [x] Ctrl+click (Cmd+click on macOS) on a file path in terminal output opens it in editor
- [x] Detected paths get underlined on hover
- [x] Tooltip shows the resolved absolute path on hover
- [x] `file.js:42` pattern opens file at line 42
- [x] Paths from `ls`, `grep -n`, compiler errors, and `find` output are detected
- [x] Clicking a non-existent path shows an error notification
- [x] Focus stays in the terminal after Ctrl+click
- [x] Does not interfere with WebLinksAddon (URLs still open in browser)

### Path Resolution IPC
- [x] New `renderer:resolve-path` IPC channel exposed via `window.api.resolvePath()`
- [x] Resolves relative paths against provided CWD
- [x] Returns `{ absolutePath, exists }`

## Files Changed

| File | Changes |
|------|---------|
| `src/main/terminal-service.js` | Inject OSC 7 shell hooks + `edit` function via env vars |
| `src/renderer/components/terminal-file-opener.js` | **New.** CWD tracking, OSC 9999 handler, link provider, shared open logic |
| `src/renderer/components/terminal-panel.js` | Instantiate `TerminalFileOpener`, pass xterm + api |
| `src/main/main.js` | Add `renderer:resolve-path` IPC handler |
| `src/main/preload.js` | Expose `resolvePath` via contextBridge |

## Dependencies & Risks

| Risk | Mitigation |
|------|------------|
| OSC 7 not emitted by user's shell | Fall back to initial spawn CWD; absolute paths always work |
| `edit` conflicts with system command | Rare on macOS/Linux; if reported, user can unalias. Name is conventional. |
| Ctrl+click false positives | Start conservative (require `/` in pattern); validate via IPC before opening |
| CWD stale after SSH/Docker | Accept limitation; local shell is the 95% case |
| Shell hook injection overwrites user's PROMPT_COMMAND | Append to existing value, never replace |

## References

- Existing file-open pattern: `src/renderer/index.js:648` (`openFileByPath`)
- EventBus file open: `api.events.emit('file:openByPath', { filePath, lineNumber })`
- Terminal panel: `src/renderer/components/terminal-panel.js`
- Terminal service: `src/main/terminal-service.js`
- Plugin API: `src/renderer/plugin-api.js`
- xterm.js link provider API: `registerLinkProvider({ provideLinks })`
- Brainstorm: `docs/brainstorms/2026-02-09-integrated-terminal-brainstorm.md`
