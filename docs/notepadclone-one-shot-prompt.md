# One-Shot Prompt: Recreate NotepadClone

Copy everything below the line into a new Claude Code conversation.

---

Build a cross-platform Notepad++ clone called "NotepadClone" using Electron and Monaco Editor. Vanilla JS only, no frameworks. The app should look and feel like Notepad++ but with modern internals.

## Architecture

- **Main process** (`src/main/`): Electron lifecycle, file I/O, native menus, IPC handlers. CommonJS.
- **Renderer process** (`src/renderer/`): Monaco editor, tab manager, UI components. ES modules, bundled by webpack.
- **Preload** (`src/main/preload.js`): contextBridge — all IPC goes through `window.api`. No nodeIntegration.
- **IPC convention**: Main→Renderer channels `main:action-name`, Renderer→Main channels `renderer:action-name`.

## Step 1: Scaffold

Create `package.json` with these dependencies:
- devDependencies: electron, electron-builder, webpack, webpack-cli, css-loader, style-loader, html-webpack-plugin, monaco-editor-webpack-plugin
- dependencies: monaco-editor, chardet, chokidar, electron-store, alasql

Scripts: `dev` (webpack development + electron), `build` (webpack production), `start` (build + electron), `dist:mac/win/linux` (build + electron-builder).

Create `webpack.config.js`:
- Entry: `./src/renderer/index.js`, output to `dist/bundle.js`
- Target: `web` (not electron-renderer)
- CSS loader, TTF asset/resource, MonacoWebpackPlugin with common languages (js, ts, css, html, json, xml, markdown, python, java, cpp, csharp, go, rust, ruby, php, sql, yaml, shell)
- HtmlWebpackPlugin with template `./src/renderer/index.html`

Create `.gitignore`: node_modules, dist, release, .DS_Store.

## Step 2: Main Process

### `src/main/main.js`
- Create BrowserWindow loading `dist/index.html`, with preload script, contextIsolation: true, nodeIntegration: false
- Store window bounds, recent files (100 max), clipboard ring (100 max), theme preference using electron-store
- On macOS, disable ApplePressAndHoldEnabled for key repeat
- Window close handler: ask renderer for dirty tabs via `invokeRenderer()` (send message, wait for response on paired channel with 5s timeout). For each dirty tab, show Save/Don't Save/Cancel dialog. Only destroy window when all resolved.
- File watching with chokidar: watch opened files, send `main:file-changed` to renderer on change. Temporarily unwatch during saves to avoid self-triggered events.
- IPC handlers for: open-file (with dialog, multi-select), save-file, save-file-as, read-file-by-path, reload-file, read-directory, open-folder, unwatch-file, get/clear recent-files, clipboard-add/get/clear, get/set theme, show-save-dialog, search-in-files, large file operations, git operations
- Find in Files: recursively search directory, skip binary extensions and node_modules/.git, skip files >2MB, regex support, max 500 results
- Forward OS theme changes to renderer when in 'system' mode

### `src/main/file-service.js`
- Read files with encoding detection via chardet. Normalize encoding names (UTF-8, UTF-16 LE, UTF-16 BE, ISO-8859-1, Windows-1252).
- UTF-16 BE: byte-swap buffer then decode as utf16le, strip BOM.
- Write files: handle UTF-16 BE (encode as LE then swap, prepend BOM), UTF-16 LE (prepend BOM), others use node encoding.
- Detect line endings (CRLF/LF/CR).
- readDirectory: list entries, skip hidden files, sort directories first then alphabetical.

### `src/main/large-file-service.js`
- For files >10MB, index line offsets without loading into memory.
- Provide readLines(start, end) that reads specific byte ranges.
- Search with progress callbacks.
- Send indexing progress to renderer.

### `src/main/git-service.js`
- Shell out to `git` via `execFile` with 15s timeout.
- `getStatus(cwd)`: return `{ isRepo, branch, dirtyCount, stagedCount, changedFiles: [{status, file, staged}], hasRemote, repoRoot }`. Parse `git status --porcelain` — column 1 is index status, column 2 is worktree. `staged = idx !== ' ' && idx !== '?'`.
- `stageAll(cwd)`: `git add -A`
- `stageFile(cwd, filePath)`: `git add -- filePath`
- `commit(cwd, message)`: Check if anything is staged via `git diff --cached --quiet` (exit 1 = has staged). If nothing staged, auto `git add -A` first. Then `git commit -m message`.
- `push(cwd)`, `pull(cwd)`, `init(cwd)`
- `fileLog(cwd, filePath, maxCount=200)`: Run `git log --pretty=format:"%H|%an|%aI|%s" -n <max> -- <relPath>`. Compute relPath relative to repo root. Parse each line by splitting on `|` (limit 4 parts — subject may contain `|`). Return `[{ hash, author, date, subject }]`.
- `fileShow(cwd, hash, filePath)`: Run `git show <hash>:<relPath>` to get file content at a specific commit. Normalize path separators to forward slashes for git.

### `src/main/menu.js`
- Build native menu: File (New, Open, Open Folder, Recent Files submenu, Save, Save As, Close Tab), Edit (Undo, Redo, Cut, Copy, Paste, Select All, Clipboard History), Search (Find, Replace, Find in Files, Go to Line, Column Selection), Tools (Git File History Ctrl+Shift+H, Compare Active Tab With..., SQL Query), View (File Explorer, Word Wrap, Theme radio: Light/Dark/System, Zoom In/Out/Reset, DevTools, Fullscreen), Help (About).
- Recent Files submenu: top 5, then "Show All...", then "Clear". Rebuild menu when recent files change.
- macOS: app menu with standard roles. Share menu for current file.

### `src/main/preload.js`
- Expose all IPC via `window.api` using contextBridge. Each menu event gets an `onMenuX` listener. Git operations (including `gitFileLog`, `gitFileDiff`), file operations, clipboard, theme, file watching, large file operations all go through here.

## Step 3: Renderer — Styles

### CSS variable theming system in `src/renderer/styles/main.css`
- `:root` = light theme, `[data-theme="dark"]` = dark theme
- Variables: bg-primary/secondary/tertiary/surface, bg-toolbar (gradient), bg-toolbar-hover/active, text-primary/secondary/muted/accent, border-primary/secondary, tab-bg/hover/active/dirty, statusbar-bg/text, scrollbar colors, menu colors, input-border-focus
- Toolbar: horizontal flex, 26px icon buttons with SVG icons, hover borders, separators
- Git indicator: `.toolbar-git-indicator` default muted color, `.git-active` bright green (#3fb950) with stroke-width 2.5 and drop-shadow glow
- Tab bar: horizontal scroll, draggable tabs, close button (X) with red hover, dirty indicator dot, active tab style
- Status bar: fixed bottom, blue background, flex with spacer
- Scrollbar styling

### `src/renderer/styles/notepadpp-theme.css`
- Define Monaco editor themes: `notepadpp` (light) and `notepadpp-dark` matching Notepad++ colors

### Component CSS files (one per component, BEM-lite, `sqp-`/`fif-` prefixes):
- `file-explorer.css`: side panel, tree with indented items, expand/collapse arrows, right-click context menu (fixed position, shadow, hover highlight)
- `git-history-panel.css`: flex row layout — commit list (280px, scrollable, border-right) on left, diff editor (flex 1) on right. Commit rows with subject, hash (monospace, 7 chars), author, relative date. Active commit with left border accent. Empty state and select-prompt centered messages.
- `find-in-files.css`: bottom panel, 250px height, search bar, results grouped by file with sticky headers
- `sql-query-panel.css`: bottom panel, 300px height, options bar (delimiter dropdown, header checkbox), query textarea, run/export buttons, results table with sticky headers, clickable rows
- `large-file-viewer.css`: virtual scrolling viewer, progress bar
- `recent-files-dialog.css`: modal overlay, scrollable file list
- `clipboard-history-dialog.css`: modal overlay, entries with source/timestamp
- `compare-dialog.css`: modal overlay, tab selection list
- `git-commit-dialog.css`: modal overlay with file list showing staged vs unstaged, commit message textarea

All panels follow the pattern: `.hidden { display: none }`, header with close button (x), content area with flex column layout.

## Step 4: Renderer — Editor

### `src/renderer/editor/monaco-setup.js`
- Register `notepadpp` and `notepadpp-dark` themes with Monaco using defineTheme
- Export `setEditorTheme(themeName)` to switch themes globally

### `src/renderer/editor/editor-manager.js`
- One shared Monaco editor instance, multiple models (one per tab).
- `createEditorForTab(tabId, content, filename)`: create model, detect language from filename, set model on editor. Return language info.
- `activateTab(tabId)`: swap model on the shared editor. Handles three tab types: regular (create editor with model), diff (create diff editor), and custom/history (early return — rendered externally). Both the deactivation path (saving outgoing tab state) and activation path need guards for each type.
- `getContent(tabId)`: get model value.
- `setContent(tabId, content)`: set model value.
- `closeTab(tabId)`: dispose model.
- `revealLine(tabId, lineNumber)`: activate tab then scroll to line.
- `createDiffTab(tabId, original, modified, origTitle, modTitle)`: create inline diff editor.
- Track cursor position and selection changes, emit via `onCursorChange` callback.
- Track content changes, emit via `onChange` callback.
- Intercept copy events for clipboard ring via `onClipboardCopy`.
- `toggleColumnSelection()`: toggle `columnSelection` editor option.
- `toggleWordWrap()`: toggle between 'on' and 'off'.
- `zoomIn/zoomOut/resetZoom`: adjust editor font size.
- `find()/replace()`: trigger Monaco's built-in find/replace actions.
- `undo()/redo()`: trigger Monaco's undo/redo.

### `src/renderer/editor/large-file-viewer.js`
- Virtual scrolling viewer for files >10MB.
- Renders visible lines only, fetches chunks from main process.
- Search with progress indicator.
- `init(filePath, totalLines, fileSize)`: set up viewer.

## Step 5: Renderer — Components

### `src/renderer/components/tab-manager.js`
- Manages tab DOM and state (title, filePath, dirty, encoding).
- `createTab(title, filePath, encoding)`: create tab element with close button.
- `closeTab(tabId)`: if dirty, call save callback (which shows dialog), then remove.
- `activate(tabId)`: switch active tab, emit `onActivate`.
- `setDirty(tabId, dirty)`: toggle dirty indicator.
- `setFilePath/setTitle`: update tab state.
- `findTabByPath(filePath)`: find existing tab for a file.
- `setSaveCallback(fn)`: register async save function for close flow.
- `getAllTabs()`: return map of all tabs.
- Tab reordering via drag-and-drop.

### `src/renderer/components/status-bar.js`
- Updates: position (Ln/Col), selection info, encoding, line ending, language, git (branch + dirty count).
- `showMessage(text, duration)`: temporarily show a message.

### `src/renderer/components/file-explorer.js`
- Side panel with folder tree. Toggle with `show()/hide()/toggle()`.
- `openFolder()`: prompt user, set rootPath, render tree.
- Lazy-load subdirectories on expand.
- Click file → emit `onFileOpen(filePath)`.
- Right-click file → show context menu with "Git History" option → emit `onFileHistory(filePath)`.
- Context menu: fixed-position div appended to body, dismissed on click-elsewhere or Escape. Bind dismiss listeners once in constructor.

### `src/renderer/components/find-in-files.js`
- Bottom panel: search input, regex/case-sensitive options, search button.
- Results grouped by file, click to open at line.
- `setSearchDir(dirPath)`, `show()/hide()/toggle()`, `onResultClick(callback)`.

### `src/renderer/components/sql-query-panel.js`
- Bottom panel for querying text content with SQL via AlaSQL.
- Options bar: delimiter dropdown (auto-detect/comma/tab/pipe/semicolon/whitespace/custom regex), "first line as header" checkbox.
- Query textarea + Run button + Export button.
- Parsing: split content into lines, split each line by delimiter into columns. Built-in columns: `_num` (line number), `_line` (full text), `c1`, `c2`... (or header names if checkbox checked).
- Replace `FROM data` with `FROM ?` (AlaSQL placeholder syntax) before execution.
- Results: HTML table with sticky header, clickable rows (when `_num` present) that emit `onRowClick(lineNumber)`.
- Export: generate TSV content, open in new tab with auto-generated name: `{source}_{querySnippet}_{timestamp}.tsv`.
- Status line showing row count and timing.
- Keyboard: Ctrl+Enter runs, Escape hides.

### `src/renderer/components/recent-files-dialog.js`
- Modal overlay listing recent files from store. Click to open.

### `src/renderer/components/clipboard-history-dialog.js`
- Modal overlay listing clipboard ring entries with source and timestamp. Click to paste.

### `src/renderer/components/compare-tab-dialog.js`
- Modal overlay listing open tabs. Select one to diff against active tab.

### `src/renderer/components/git-history-panel.js`
- `GitHistoryPanel(tabManager, editorManager)`: opens a new tab showing per-file git commit history.
- `show(filePath)`: creates tab titled "History: filename", fetches commits via `window.api.gitFileLog()`, stores entry in `editorManager.editors` with `isHistoryTab: true`, then renders.
- `_render(tabId, filePath, commits, dirPath, filename)`: builds split-panel DOM — scrollable commit list on left (subject, hash short, author, relative date per row), diff viewer on right. Empty state when no commits.
- Click a commit → fetch file at that commit and previous commit via `window.api.gitFileDiff()`, create Monaco diff editor showing the change. First commit diffs against empty string.
- `_formatRelativeDate(isoDate)`: converts ISO date to "2 hours ago", "3 days ago", etc.
- Re-renders when tab is re-activated (history tabs manage their own DOM, not a Monaco model).

### `src/renderer/components/git-commit-dialog.js`
- Modal overlay receiving full `gitState` object.
- Shows "Commit to **branch**" header.
- If nothing staged: "No files staged — will stage all and commit:" + full file list.
- If some staged: "Committing N staged files:" + staged list, then "M unstaged (won't be committed)".
- Each file shows git status code (M, ??, A, D) and filename.
- Commit message textarea, Ctrl+Enter to submit.

## Step 6: Renderer — index.html

Single-page layout:
1. Toolbar: icon buttons (New, Open, Save | Undo, Redo | Find, Replace | Find in Files | Word Wrap, Column Select | Git indicator, Git Init, Stage All, Stage File, Commit, Push, Pull, History | SQL Query). Git History button: clock icon (circle + clock hands), hidden by default, shown when repo active and active tab has a file path. All buttons use inline SVG icons.
2. Tab bar
3. Main content: file explorer (hidden by default) + editor container (side by side)
4. Find in Files panel (hidden)
5. SQL Query panel (hidden)
6. Status bar (position, selection, git, encoding, line ending, selection mode, language)

## Step 7: Renderer — index.js (wiring)

Import all CSS files and components. Instantiate everything. Wire:
- Tab activate → switch editor, update status bar, refresh git status. For history tabs: re-render via `gitHistoryPanel._render()` and set status bar to "Git History".
- Tab close → clean up editor/viewer/watcher. For history tabs: delete entry from `editorManager.editors` and clear `activeTabId`.
- Editor change → mark tab dirty
- Editor cursor → update status bar
- Editor copy → clipboard ring
- File explorer file open → openFileByPath()
- File explorer file history → gitHistoryPanel.show(filePath)
- Find in Files result click → openFileByPath(path, line)
- SQL panel row click → revealLine()
- Toolbar clicks → switch on data-action attribute
- All menu events from preload → corresponding actions
- Window close flow → dirty tab negotiation
- File watching → auto-reload or mark as changed on disk
- Theme init + theme change listener + OS theme change listener
- Git state: `getActiveFileDirPath()` falls back to `currentFolderPath` when active tab has no file path. Refresh git status on tab activate, after git operations, and after opening a folder.
- Go to Line dialog (inline DOM creation)
- Start with one blank tab: `newFile()`

## Important Implementation Details

1. **One editor, many models**: Monaco creates one visual editor. Each tab gets a Monaco model. Switching tabs swaps the model on the editor. This is critical for performance.

2. **Encoding round-trip**: Detect encoding on read, preserve it on write. UTF-16 BE requires byte-swapping. Always pass encoding through tab state.

3. **Git dir fallback**: `getActiveFileDirPath()` must fall back to the open folder path when the active tab is untitled. Otherwise git operations silently fail.

4. **Commit auto-stage**: Only auto `git add -A` when nothing is staged (check via `git diff --cached --quiet`). If user manually staged files, commit only those.

5. **File watching lifecycle**: Watch after open, unwatch during save (to avoid self-trigger), re-watch after save, unwatch on tab close.

6. **Large files**: Route files >10MB to LargeFileViewer instead of Monaco. Virtual scrolling, chunk loading from main process.

7. **macOS key repeat**: Must disable ApplePressAndHoldEnabled or holding keys shows accent picker instead of repeating.

8. **Custom tab types**: Tabs that aren't standard Monaco editors (history, diff) need explicit guards in `editor-manager.js` `activateTab()` — both the deactivation path (don't try to save viewState on a tab with no editor) and the activation path (early return, let the component render itself). Store custom tab data in `editorManager.editors` with a type flag (e.g. `isHistoryTab: true`) so the entry exists but the regular editor creation is skipped.

Build with `npx webpack --mode development`, run with `npx electron .`.
