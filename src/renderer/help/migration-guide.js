export const MIGRATION_GUIDE = `# Moving to a New Computer

All your NotepadClone data — notes, Captain's Log entries, snippets, options, theme, recent files, and panel sizes — is stored in a single file by electron-store.

---

## Where the Data Lives

| Platform | Path |
|----------|------|
| **macOS** | \`~/Library/Application Support/notepadclone/config.json\` |
| **Windows** | \`%APPDATA%/notepadclone/config.json\` |
| **Linux** | \`~/.config/notepadclone/config.json\` |

---

## Migration Steps

1. On the **old computer**, copy \`config.json\` from the path above
2. On the **new computer**, clone the repo and run \`npm install\`
3. Launch NotepadClone once (this creates the data directory)
4. Close NotepadClone
5. Replace the new \`config.json\` with the one from your old computer
6. Relaunch — all your data is restored

---

## What's Included

The \`config.json\` file contains:

- **Notes** — all notes, active note, panel width
- **Captain's Log** — all daily entries, panel width
- **Code Snippets** — all saved snippets
- **Options** — editor settings (font, tab size, minimap, etc.)
- **Theme** — light, dark, or system preference
- **Recent files** — your recent file history
- **Clipboard history** — saved clipboard ring entries

---

## What's NOT Included

- **Disabled plugins list** — stored in browser localStorage, resets to defaults (all enabled)
- **Open tabs** — NotepadClone doesn't persist open tabs across sessions
- **Git repositories** — these are separate from NotepadClone; clone them independently
`;
