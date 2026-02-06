# NotepadClone

Cross-platform Notepad++ alternative. Electron + Monaco Editor.

## Quick Start

```bash
git clone https://github.com/diyradiolab/NotepadClone.git
cd NotepadClone
npm install
npm run dev
```

## Features

- Multi-tab editor with syntax highlighting (50+ languages)
- File explorer, file watching, encoding detection
- Large file viewer (10 MB+ files, streaming)
- Find/Replace, Find in Files, SQL Query panel (`Ctrl+Shift+Q`)
- Git integration — stage, commit, push, pull from the toolbar
- Clipboard ring, tab diff, column selection
- Light / Dark / System themes

## SQL Query Panel

Query any open text file with SQL. Lines become rows, columns split by delimiter.

```sql
SELECT * FROM data WHERE _line LIKE '%ERROR%' ORDER BY _num DESC LIMIT 50
```

## Build for Distribution

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

## License

MIT
