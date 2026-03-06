/**
 * Feature Guide Data — single source of truth for menu sublabels and Feature Guide dialog.
 * CommonJS so main process (require) and renderer (webpack) can both consume it.
 */

const SECTION_ORDER = ['File', 'Edit', 'Search', 'Dev', 'Ops', 'View'];

const FEATURE_GUIDE_ENTRIES = [
  // ── File ──
  { id: 'new-spreadsheet', name: 'New Spreadsheet', menuLabel: 'New &Spreadsheet', section: 'File', shortcut: '', description: 'Create a CSV/spreadsheet tab with grid editing', example: 'File > New Spreadsheet\nEdit cells in a grid, export as CSV.' },
  { id: 'new-diagram', name: 'New Diagram', menuLabel: 'New &Diagram', section: 'File', shortcut: '', description: 'Create a Mermaid diagram tab', example: 'File > New Diagram\nWrite Mermaid syntax on the left, see live preview on the right.' },
  { id: 'new-dashboard', name: 'New Dashboard', menuLabel: 'New Dashboard', section: 'File', shortcut: '', description: 'Open a web dashboard browser panel', example: 'File > New Dashboard\nAdd bookmarked URLs, browse sites in a panel inside the app.' },
  { id: 'open-folder', name: 'Open Folder', menuLabel: 'Open &Folder...', section: 'File', shortcut: 'Ctrl+Shift+O', description: 'Open a folder in the file explorer sidebar', example: 'File > Open Folder\nBrowse and open files from the tree sidebar.' },
  { id: 'export-svg', name: 'Export Diagram as SVG', menuLabel: 'Export Diagram as SVG...', section: 'File', shortcut: '', description: 'Export the active Mermaid diagram as an SVG file', example: 'Open a .mmd file, then File > Export Diagram as SVG.' },

  // ── Edit ──
  { id: 'clipboard-history', name: 'Clipboard History', menuLabel: 'Clipboard History...', section: 'Edit', shortcut: 'Ctrl+Shift+V', description: 'Browse and paste from recent clipboard entries', example: 'Copy several items, then Ctrl+Shift+V to pick from the list.' },
  { id: 'convert-case', name: 'Convert Case', menuLabel: 'Convert Case', section: 'Edit', shortcut: '', description: 'Change selection to UPPER, lower, Title, camel, snake, or kebab case', example: 'Select text, then Edit > Convert Case > snake_case.' },
  { id: 'line-operations', name: 'Line Operations', menuLabel: 'Line Operations', section: 'Edit', shortcut: '', description: 'Sort, deduplicate, trim, join, or reverse lines', example: 'Select lines, Edit > Line Operations > Sort Lines (A→Z).' },
  { id: 'encode-decode', name: 'Encode/Decode', menuLabel: 'Encode/Decode', section: 'Edit', shortcut: '', description: 'Base64, URL, or JSON encode/decode selected text', example: 'Select a URL, Edit > Encode/Decode > URL Encode.' },

  // ── Search ──
  { id: 'find-in-files', name: 'Find in Files', menuLabel: 'Find in &Files...', section: 'Search', shortcut: 'Ctrl+Shift+F', description: 'Search across all files in the open folder', example: 'Open a folder first, then Ctrl+Shift+F to search all files.' },
  { id: 'go-to-line', name: 'Go to Line', menuLabel: 'Go to &Line...', section: 'Search', shortcut: 'Ctrl+G', description: 'Jump to a specific line number', example: 'Ctrl+G, type 42, press Enter to jump to line 42.' },
  { id: 'column-selection', name: 'Column Selection Mode', menuLabel: 'Column Selection Mode', section: 'Search', shortcut: 'Alt+Shift+C', description: 'Toggle rectangular/column selection mode', example: 'Alt+Shift+C to toggle, then click-drag to select a column of text.' },

  // ── Dev ──
  { id: 'compare-tabs', name: 'Compare Tabs', menuLabel: 'Compare Active Tab With...', section: 'Dev', shortcut: '', description: 'Diff the current tab against another open tab', example: 'Open two files, then Dev > Compare Active Tab With... and pick the other tab.' },
  { id: 'git-history', name: 'Git File History', menuLabel: 'Git File History', section: 'Dev', shortcut: 'Ctrl+Shift+H', description: 'View git commit history for the active file', example: 'Open a tracked file, then Ctrl+Shift+H to see past commits and diffs.' },
  { id: 'sql-query', name: 'SQL Query', menuLabel: 'SQL Query...', section: 'Dev', shortcut: 'Ctrl+Shift+Q', description: 'Query CSV/JSON data with SQL using an in-app SQLite engine', example: 'Open a CSV, then Ctrl+Shift+Q. Try: SELECT * FROM data WHERE age > 30' },
  { id: 'snippets', name: 'Code Snippets', menuLabel: 'Code Snippets...', section: 'Dev', shortcut: 'Ctrl+Alt+S', description: 'Save and insert reusable code snippets', example: 'Ctrl+Alt+S to open, create a snippet, then insert it into any file.' },
  { id: 'http-client', name: 'HTTP Client', menuLabel: 'HTTP Client', section: 'Dev', shortcut: 'Ctrl+Alt+H', description: 'Send HTTP requests and inspect responses (like Postman)', example: 'Dev > HTTP Client. Set method to POST, enter URL, add JSON body, click Send.' },
  { id: 'regex-tester', name: 'Regex Tester', menuLabel: 'Regex Tester', section: 'Dev', shortcut: 'Ctrl+Alt+R', description: 'Test regular expressions with live match highlighting', example: 'Ctrl+Alt+R, enter a pattern like /\\d+/g and test text to see matches.' },
  { id: 'bookmarks', name: 'Bookmarks', menuLabel: 'Bookmarks', section: 'Dev', shortcut: 'Ctrl+Alt+B', description: 'Toggle and navigate line bookmarks in the editor', example: 'Click the gutter to bookmark a line. Ctrl+Alt+B to see all bookmarks.' },

  // ── Ops ──
  { id: 'tail-file', name: 'Tail File', menuLabel: 'Tail File (Auto-scroll)', section: 'Ops', shortcut: 'Ctrl+Shift+Y', description: 'Auto-follow a log file as it grows', example: 'Open a log file, then Ctrl+Shift+Y. New lines stream in automatically.' },
  { id: 'tail-filter', name: 'Tail Filter', menuLabel: 'Tail Filter', section: 'Ops', shortcut: 'Ctrl+Shift+F5', description: 'Filter tail output in real-time by keyword or regex', example: 'While tailing, Ctrl+Shift+F5 to open filter. Type "ERROR" to filter.' },
  { id: 'log-analyzer', name: 'Log Analyzer', menuLabel: 'Log Analyzer', section: 'Ops', shortcut: 'Ctrl+Alt+L', description: 'Parse, filter, and analyze log files with format detection and level coloring', example: 'Open a .log or .jsonl file — auto-detects format and shows a table.\nFilter by level (ERROR/WARN) or search text. Click a row for details.' },
  { id: 'hex-editor', name: 'Hex Editor', menuLabel: 'Hex Editor', section: 'Ops', shortcut: '', description: 'View binary files as hex + ASCII', example: 'Open a binary file, then Ops > Hex Editor to view hex dump.' },
  { id: 'checksums', name: 'Checksums', menuLabel: 'Checksums', section: 'Ops', shortcut: '', description: 'Calculate MD5, SHA-1, SHA-256 checksums for the active file', example: 'Open a file, then Ops > Checksums to see all hash values.' },

  // ── View ──
  { id: 'file-explorer', name: 'File Explorer', menuLabel: 'File Explorer', section: 'View', shortcut: 'Ctrl+B', description: 'Toggle the file explorer sidebar', example: 'Ctrl+B to show/hide. Open a folder first to populate the tree.' },
  { id: 'show-all-chars', name: 'Show All Characters', menuLabel: 'Show All Characters', section: 'View', shortcut: 'Ctrl+Shift+8', description: 'Show invisible characters (spaces, tabs, line endings)', example: 'Ctrl+Shift+8 to toggle. Useful for debugging whitespace issues.' },
  { id: 'notes-panel', name: 'Notes Panel', menuLabel: 'Notes Panel', section: 'View', shortcut: 'Ctrl+Shift+N', description: 'A scratchpad panel for quick notes', example: 'Ctrl+Shift+N to toggle. Notes persist across sessions.' },
  { id: 'captains-log', name: "Captain's Log", menuLabel: "Captain's Log", section: 'View', shortcut: 'Ctrl+Shift+L', description: 'A timestamped daily journal panel', example: "Ctrl+Shift+L to toggle. Each entry is auto-timestamped." },
  { id: 'tree-view', name: 'Toggle Tree View', menuLabel: 'Toggle Tree View', section: 'View', shortcut: 'Ctrl+Shift+R', description: 'View JSON/XML files as a collapsible tree', example: 'Open a JSON file, then Ctrl+Shift+R to switch to tree view.' },
  { id: 'terminal', name: 'Terminal', menuLabel: 'Terminal', section: 'View', shortcut: 'Ctrl+`', description: 'Toggle the integrated terminal panel', example: 'Ctrl+` to open. Runs your default shell. Supports color output.' },
  { id: 'command-palette', name: 'Command Palette', menuLabel: 'Command Palette...', section: 'View', shortcut: 'Ctrl+Shift+P', description: 'Quick-access searchable list of all commands', example: 'Ctrl+Shift+P, type "snippet" to find snippet commands.' },
  { id: 'plugin-manager', name: 'Plugin Manager', menuLabel: 'Plugin Manager', section: 'View', shortcut: '', description: 'Enable, disable, or configure installed plugins', example: 'View > Plugin Manager. Toggle plugins on/off and see their info.' },
];

// Build sublabel map: menuLabel → description (for menu.js)
const FEATURE_SUBLABELS = new Map();
for (const entry of FEATURE_GUIDE_ENTRIES) {
  FEATURE_SUBLABELS.set(entry.menuLabel, entry.description);
}

module.exports = { FEATURE_GUIDE_ENTRIES, FEATURE_SUBLABELS, SECTION_ORDER };
