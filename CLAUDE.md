# NotepadClone — Project Conventions

## What This Is
A cross-platform Notepad++ alternative built with Electron + Monaco Editor.
Classic Notepad++ aesthetics, modern internals.

## Architecture
- **Main process** (`src/main/`): Electron lifecycle, file I/O, native menus, IPC handlers
- **Renderer process** (`src/renderer/`): Monaco editor, tab manager, UI components
- **Preload** (`src/main/preload.js`): contextBridge — all IPC goes through `window.api`
- **Workers** (`src/workers/`): Background tasks (search, indexing)

## Code Style
- Vanilla JS (no framework in renderer — Monaco handles the editor)
- ES modules in renderer, CommonJS in main process
- No TypeScript (keeping it simple for v1)
- CSS: BEM-lite naming, separate files per component

## File Naming
- `kebab-case.js` for all source files
- Components in `src/renderer/components/`
- Editor logic in `src/renderer/editor/`

## IPC Convention
- Main→Renderer channels: `main:action-name`
- Renderer→Main channels: `renderer:action-name`
- All exposed via `window.api` from preload

## Key Dependencies
- `monaco-editor` — code editor engine
- `electron` — desktop shell
- Webpack bundles the renderer; main process runs raw Node.js

## Build Preferences
- Always use `npx webpack --mode development` (~17s) unless production build is explicitly requested
- Main process files (menu.js, preload.js, git-service.js) don't need webpack rebuild
- Renderer changes (index.js, components, CSS) require webpack rebuild before launch

## How I Want to Work
- **Front-load requirements**: describe the full desired behavior in one message rather than revealing it across multiple rounds. Include visual details (colors, layout), interaction behavior, and edge cases up front.
- **State behaviors, don't ask questions**: say "commit should auto-stage when nothing is staged" instead of "do I have to stage first?"
- **Say what right looks like**: when something is wrong, describe the desired outcome, not just the complaint. "Show staged files separately from unstaged with status codes" beats "the dialog is wrong."
- **Batch related changes**: if a feature needs an indicator, a tooltip, and a status bar entry, request all three together instead of one at a time.
