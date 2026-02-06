# NotepadClone

A cross-platform Notepad++ alternative built with Electron and Monaco Editor. Classic Notepad++ look, modern internals.

![Electron](https://img.shields.io/badge/Electron-35-blue) ![Monaco](https://img.shields.io/badge/Monaco_Editor-latest-green) ![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

## Features

**Editor**
- Monaco Editor with Notepad++ dark/light themes
- Syntax highlighting for 50+ languages (auto-detected)
- Multi-tab editing with unsaved change tracking
- Column/block selection mode
- Word wrap toggle
- Zoom in/out/reset
- Go to line

**File Management**
- File explorer side panel with folder tree
- File watching — auto-reloads when files change on disk
- Large file viewer for files over 10 MB (streaming, no memory blowup)
- Encoding detection and preservation (UTF-8, UTF-16 LE/BE, Latin-1, etc.)
- Recent files list with quick access

**Search**
- Find and Replace (regex, match case, whole word)
- Find in Files across an entire folder
- SQL Query panel — query any text file with SQL (powered by AlaSQL)

**SQL Query Panel**
- Open with `Ctrl+Shift+Q` or toolbar button
- Each line becomes a row; columns split by delimiter (auto-detected)
- Built-in columns: `_num` (line number), `_line` (full text), `c1`, `c2`...
- "First line as header" option for CSV files
- Click a result row to jump to that line in the editor
- Export results to a new tab as TSV

```sql
-- Filter log errors
SELECT * FROM data WHERE _line LIKE '%ERROR%' ORDER BY _num DESC LIMIT 50

-- Aggregate CSV columns
SELECT c1, COUNT(*) AS cnt FROM data GROUP BY c1 ORDER BY cnt DESC
```

**Git Integration**
- Git status indicator in toolbar (green when in a repo)
- Hover indicator to see branch, changed files list
- Stage All / Stage Current File / Commit / Push / Pull buttons
- Commit auto-stages when nothing is manually staged
- Branch and dirty count in status bar

**Other**
- Clipboard ring (Ctrl+Shift+V) — paste from history
- Compare/diff two open tabs side by side
- Light, Dark, and System theme modes
- Native menus with keyboard shortcuts

## Install

```bash
git clone https://github.com/diyradiolab/NotepadClone.git
cd NotepadClone
npm install
```

## Run

```bash
npm run dev
```

Or separately:

```bash
npx webpack --mode development
npx electron .
```

## Build for Distribution

```bash
npm run dist          # current platform
npm run dist:mac      # macOS
npm run dist:win      # Windows
npm run dist:linux    # Linux
```

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| New file | `Ctrl+N` |
| Open file | `Ctrl+O` |
| Open folder | `Ctrl+Shift+O` |
| Save | `Ctrl+S` |
| Save As | `Ctrl+Shift+S` |
| Close tab | `Ctrl+W` |
| Find | `Ctrl+F` |
| Replace | `Ctrl+H` |
| Find in Files | `Ctrl+Shift+F` |
| SQL Query | `Ctrl+Shift+Q` |
| Go to Line | `Ctrl+G` |
| Recent Files | `Ctrl+E` |
| Clipboard History | `Ctrl+Shift+V` |
| File Explorer | `Ctrl+B` |
| Column Selection | `Alt+Shift+C` |
| Word Wrap | `Alt+W` |
| Zoom In/Out | `Ctrl+=` / `Ctrl+-` |
| Reset Zoom | `Ctrl+0` |

## Tech Stack

- **Electron** — desktop shell
- **Monaco Editor** — code editor engine (same as VS Code)
- **AlaSQL** — in-memory SQL engine for query panel
- **Webpack** — bundles the renderer process
- **chokidar** — file watching
- **chardet** — encoding detection

## License

MIT
