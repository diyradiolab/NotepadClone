---
title: "macOS key repeat not working (accent picker shown instead)"
category: ui-bugs
tags: [macos, keyboard, electron, key-repeat]
module: main-process
symptoms:
  - Holding a key shows accent character picker instead of repeating
  - Keys do not repeat when held down on macOS
root_cause: macOS ApplePressAndHoldEnabled default
date_solved: 2026-02-05
severity: medium
---

# macOS Key Repeat Not Working

## Symptom

Holding down a letter key shows the macOS accent character picker (e.g., à á â ã) instead of repeating the character. This is the default macOS behavior but wrong for a code editor.

## Root Cause

macOS has a system-wide setting `ApplePressAndHoldEnabled` that defaults to `true`. When enabled, holding a key shows accent options instead of repeating. Code editors like VS Code disable this per-app.

## Solution

In `src/main/main.js`, disable the press-and-hold behavior at app startup using `defaults write`:

```js
const { execSync } = require('child_process');

if (process.platform === 'darwin') {
  try {
    execSync('defaults write com.notepadclone.app ApplePressAndHoldEnabled -bool false');
    if (!app.isPackaged) {
      execSync('defaults write com.github.Electron ApplePressAndHoldEnabled -bool false');
    }
  } catch (_) { /* ignore */ }
}
```

Two domains are needed:
- `com.notepadclone.app` — for the packaged/distributed app
- `com.github.Electron` — for development mode (`npx electron .`)

## Prevention

Any Electron-based text/code editor on macOS should disable this at startup. Add this to the project checklist for new Electron editor apps.

## References

- [VS Code key repeat docs](https://code.visualstudio.com/docs/setup/mac#_key-repeating)
- macOS `defaults` man page
