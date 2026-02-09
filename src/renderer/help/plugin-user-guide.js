export const PLUGIN_USER_GUIDE = `# Using Plugins

NotepadClone includes 15 built-in plugins that provide viewers, editing tools, panels, and integrations. Everything beyond the core text editor is a plugin.

---

## Built-in Plugins

### Viewer Plugins

These plugins add specialized viewers for different file types. They activate automatically when you open a matching file.

| Plugin | File Types | Description |
|--------|-----------|-------------|
| **Markdown Preview** | \`.md\`, \`.markdown\` | Renders Markdown as formatted HTML with live preview |
| **Table Viewer** | \`.csv\`, \`.tsv\`, \`.json\`, \`.xml\` | Displays tabular data in a sortable, filterable grid |
| **Tree Viewer** | \`.json\`, \`.xml\` | Collapsible tree view for hierarchical data |
| **Spreadsheet** | \`.csv\`, \`.tsv\` | Full spreadsheet editor with formulas (Jspreadsheet CE) |
| **Mermaid Diagram** | \`.mmd\`, \`.mermaid\` | Split-pane Mermaid diagram editor with live preview |
| **Large File Viewer** | Files > 5 MB | Virtual-scrolling viewer for very large files |

### Panel & Dialog Plugins

These plugins add panels, dialogs, and tools accessible from the menu or toolbar.

| Plugin | Access | Description |
|--------|--------|-------------|
| **File Explorer** | View > File Explorer (Ctrl+B) | Sidebar file tree for browsing opened folders |
| **Find & Replace** | Search > Find (Ctrl+F) / Find in Files (Ctrl+Shift+F) | Find, replace, and search across files with regex support |
| **SQL Query Builder** | Tools > SQL Query (Ctrl+Shift+Q) | Query open CSV/JSON/XML files using SQL syntax |
| **Notes Panel** | View > Notes Panel (Ctrl+Shift+N) | Persistent sticky notes with categories and search |
| **Clipboard History** | Edit > Clipboard History (Ctrl+Shift+V) | Ring buffer of recent clipboard entries for quick paste |
| **Recent Files** | File > Recent Files > Show All (Ctrl+E) | Quick-access list of recently opened files |
| **Compare Tabs** | Tools > Compare Active Tab With... | Side-by-side diff of two open tabs |

### Integration Plugins

| Plugin | Access | Description |
|--------|--------|-------------|
| **Git** | Toolbar git buttons / Tools > Git File History (Ctrl+Shift+H) | Stage, commit, push, pull, and view file history |
| **Core Editing** | Edit menu (Convert Case, Line Operations, Encode/Decode) | Text transforms, sorting, encoding/decoding, and markdown formatting |

---

## How Viewers Work

When you open a file, NotepadClone checks if any viewer plugin handles that file type. If so, the file opens in the viewer's default mode.

**Switching modes:** Most viewer plugins have a toggle button in the toolbar:
- **Markdown:** Toggle between rendered preview and raw editor
- **Table/Tree:** Toggle between visual view and text editor
- **Spreadsheet:** Toggle between spreadsheet grid and text editor
- **Diagram:** Toggle split-pane (editor + preview) or full preview

The edit mode always shows the raw file content in the Monaco editor, so you can switch freely without losing data.

---

## Keyboard Shortcuts

### File Operations

| Shortcut | Action |
|----------|--------|
| Ctrl+N | New file |
| Ctrl+O | Open file |
| Ctrl+Shift+O | Open folder |
| Ctrl+S | Save |
| Ctrl+Shift+S | Save As |
| Ctrl+W | Close tab |
| Ctrl+E | Show all recent files |

### Editing

| Shortcut | Action |
|----------|--------|
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+Shift+V | Clipboard history |
| Alt+Shift+C | Toggle column selection mode |

### Search

| Shortcut | Action |
|----------|--------|
| Ctrl+F | Find |
| Ctrl+H | Replace |
| Ctrl+Shift+F | Find in files |
| Ctrl+G | Go to line |

### Views & Panels

| Shortcut | Action |
|----------|--------|
| Ctrl+B | Toggle file explorer |
| Ctrl+Shift+N | Toggle notes panel |
| Ctrl+Shift+R | Toggle tree view |
| Alt+W | Toggle word wrap |
| Ctrl+Shift+8 | Show all characters |

### Tools

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+Q | SQL Query panel |
| Ctrl+Shift+H | Git file history |

### Zoom

| Shortcut | Action |
|----------|--------|
| Ctrl+= | Zoom in |
| Ctrl+- | Zoom out |
| Ctrl+0 | Reset zoom |

---

## Plugin Details

### Markdown Preview

Opens \`.md\` and \`.markdown\` files in rendered HTML mode by default. Supports:
- GitHub-flavored Markdown (headings, lists, tables, code blocks)
- Syntax-highlighted code fences
- Clickable links (external links open in your browser)
- Toggle between preview and raw editor via the toolbar button

### Table Viewer

Automatically activates for \`.csv\` and \`.tsv\` files. For \`.json\` and \`.xml\`, it activates when the content looks tabular (arrays of objects for JSON, repeated child elements for XML).
- Sortable columns (click headers)
- Column resizing
- Row numbers with source line mapping
- Toggle to raw text editing via toolbar

### Tree Viewer

Shows \`.json\` and \`.xml\` files as a collapsible tree structure.
- Expand/collapse individual nodes or all
- Syntax-colored values (strings, numbers, booleans)
- Toggle between tree view and text editor

### Spreadsheet

Opens \`.csv\` and \`.tsv\` files in a spreadsheet grid.
- Cell editing, copy/paste
- Formula bar with cell reference display
- Column/row resize
- Export modified data back to CSV
- New blank spreadsheets via File > New Spreadsheet

### Mermaid Diagram

Opens \`.mmd\` and \`.mermaid\` files with a split-pane editor.
- Left: Mermaid syntax editor
- Right: Live-rendered diagram preview
- Toggle split/preview modes
- Export as SVG via File > Export Diagram as SVG

### Large File Viewer

Activates automatically for files over 5 MB. Uses virtual scrolling to handle files of any size without loading everything into memory.
- Line-number gutter
- Search within large files
- Progress indicator during indexing

### File Explorer

A sidebar file tree that appears when you open a folder.
- Expand/collapse directories
- Click to open files
- Right-click to reveal in Finder/Explorer
- Toggle with Ctrl+B

### Find & Replace

Full find and replace with:
- Regular expression support
- Case-sensitive matching
- Find in Files across an entire directory tree
- File type filters and depth limits

### SQL Query Builder

Query your open data files using SQL. Supports:
- Visual query builder (Basic and Advanced modes)
- Direct SQL editing
- JOINs across multiple open tabs
- Aggregate functions and GROUP BY
- HAVING filters
- Multi-table nested JSON support
- Export results as TSV

See **Help > SQL Query Builder Guide** for the full reference.

### Notes Panel

Persistent sticky notes attached to your workspace.
- Create, edit, and delete notes
- Categories and color coding
- Search across all notes
- Import/export notes as JSON

### Clipboard History

Keeps a ring buffer of your recent clipboard operations.
- View and search recent copies
- Click to paste any previous entry
- Clear history

### Recent Files

Quick access to recently opened files.
- Top 5 in the File menu
- Full list via Ctrl+E
- Clear history option

### Compare Tabs

Side-by-side diff comparison of any two open tabs.
- Select the second tab from a dialog
- Uses Monaco's built-in diff editor
- Highlights added, removed, and changed lines

### Git Integration

Git operations directly from the toolbar:
- **Init** — Initialize a git repo in the current folder
- **Stage** — Stage all changes or individual files
- **Commit** — Commit with a message (auto-stages if nothing is staged)
- **Push / Pull** — Sync with remote
- **File History** — View commit log for the active file with inline diffs

### Core Editing

Text manipulation commands available from the Edit menu:
- **Convert Case:** UPPERCASE, lowercase, Title Case, camelCase, snake_case, kebab-case
- **Line Operations:** Sort (A→Z, Z→A, numeric), remove duplicates, remove empty lines, trim whitespace, join lines, reverse order
- **Encode/Decode:** Base64, URL encoding, JSON escape/unescape
- **Markdown Formatting:** Bold, italic, code, links, headings (via formatting toolbar)
`;
