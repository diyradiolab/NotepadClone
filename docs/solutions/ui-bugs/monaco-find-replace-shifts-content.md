---
title: "Find/Replace widget shifts editor content down"
category: ui-bugs
tags: [monaco-editor, find-replace, layout]
module: renderer/editor
symptoms:
  - Opening Find or Find & Replace pushes file text downward
  - Editor content jumps when find widget appears
root_cause: Monaco addExtraSpaceOnTop default
date_solved: 2026-02-05
severity: low
---

# Find/Replace Widget Shifts Editor Content Down

## Symptom

When opening Find (Ctrl+F) or Find & Replace (Ctrl+H), the editor content shifts downward, creating a jarring visual jump.

## Root Cause

Monaco Editor's `find.addExtraSpaceOnTop` option defaults to `true`. This adds top padding to the editor when the find widget opens so it doesn't cover the first few lines. While well-intentioned, it causes a noticeable content shift that feels like a bug.

## Solution

In `src/renderer/editor/monaco-setup.js`, add to `DEFAULT_OPTIONS`:

```js
find: { addExtraSpaceOnTop: false },
```

This makes the find widget overlay the content (like Notepad++) instead of pushing it down.

## Prevention

When configuring Monaco Editor for a Notepad-style app, review the `find` options. The default VS Code behavior (extra space) may not match the expected UX for simpler editors.
