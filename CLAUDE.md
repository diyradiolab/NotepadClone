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
