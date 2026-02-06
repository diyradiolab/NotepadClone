# Markdown Reading & Authoring

**Date:** 2026-02-06
**Status:** Ready for planning

## What We're Building

A markdown reading and authoring system for NotepadClone. When a `.md` file is opened, it renders as formatted text by default — headings, bold, links, images all display as they would in a browser. A toolbar toggle switches between "Read" (rendered) and "Edit" (Monaco source) modes. In edit mode, a full formatting toolbar provides buttons for inserting markdown syntax.

### Core Behaviors

- **Default to rendered view**: Opening any `.md` file shows it rendered, not as raw source
- **Toggle button in toolbar**: Single button switches between Read and Edit mode
- **Formatting toolbar**: Appears in Edit mode for `.md` files — bold, italic, headings (H1-H3), bullet/numbered lists, links, code blocks, tables, images, blockquotes, horizontal rules, checkboxes, strikethrough
- **Image resolution**: Relative image paths resolve from the file's directory
- **Theme-aware**: Preview matches app theme (light/dark)

## Why This Approach

**Inline toggle (Read/Edit in same tab area)** was chosen over split-view or separate tabs because:

- Primary use case is **reading** markdown from external sources — rendered view is the default
- Simple mental model: one tab, two modes — consistent with existing tab patterns (diff tabs, history tabs already swap content types)
- No layout changes needed — preview fills the same space Monaco uses
- Formatting toolbar only appears when relevant (edit mode on `.md` files)
- Avoids screen real estate loss from split view
- Avoids tab clutter from separate preview tabs

## Key Decisions

1. **Rendering library**: `markdown-it` — proven, extensible, good plugin ecosystem
2. **HTML sanitization**: `dompurify` — prevent XSS from untrusted markdown files
3. **Toolbar is custom-built**: Simple buttons that insert markdown syntax into Monaco at cursor position. No third-party editor replacement — keeps existing architecture intact.
4. **Preview replaces editor area**: When in Read mode, Monaco is hidden and a styled HTML container takes its place in the same tab area
5. **Mode state lives on the tab**: Each `.md` tab tracks whether it's in Read or Edit mode via tab metadata
6. **Formatting toolbar is contextual**: Only visible for `.md` files in Edit mode
7. **Images use file-relative paths**: A file at `/docs/readme.md` referencing `./img/logo.png` resolves to `/docs/img/logo.png`
8. **Theme integration**: Preview CSS uses the same `data-theme` attribute switching as the rest of the app

## Open Questions

- Should clicking links in preview open in system browser or navigate within app?
- Should the toggle button also have a keyboard shortcut (e.g., Ctrl+Shift+M)?
- Should the rendered view support syntax-highlighted code blocks (adds a dependency like highlight.js)?
- Should there be a "print/export to HTML" option from the rendered view?

## Scope Boundaries (YAGNI)

**In scope:**
- Rendered preview with full CommonMark support
- Edit/Read mode toggle
- Formatting toolbar (full set)
- Theme-aware preview
- Image support with file-relative paths

**Out of scope (for now):**
- Live preview while editing (split view)
- Mermaid/diagram rendering
- Math/LaTeX rendering
- PDF export
- Custom CSS for preview
- Table of contents generation
