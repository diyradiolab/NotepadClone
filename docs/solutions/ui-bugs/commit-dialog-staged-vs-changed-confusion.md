---
title: "Commit dialog showed misleading staged/changed file counts"
category: ui-bugs
tags: [git-integration, commit-dialog, ux, staged-files]
module: renderer
symptoms:
  - Commit dialog only showed total changed count, not what would actually be committed
  - No way to tell if files were staged or just modified
  - Users expected to see which files would be in the commit
root_cause: Dialog received a plain text summary string instead of structured git state
date_solved: 2026-02-06
severity: medium
---

# Commit Dialog Staged vs Changed Confusion

## Symptom

Clicking the commit button opened a dialog showing "main — 5 file(s) changed" with no distinction between staged and unstaged files. Users couldn't tell what would actually be committed.

## Root Cause

Two issues:

1. `git-service.js` only counted dirty files (`dirtyCount`) but didn't track which were staged vs unstaged. The `git status --porcelain` output has this info in columns 1-2 but it was being discarded.

2. `gitCommitOpen()` passed a plain string to the dialog:
```js
const summary = `${gitState.branch} — ${gitState.dirtyCount} file(s) changed`;
gitCommitDialog.show(summary);
```

## Solution

### 1. Parse staged status in git-service.js

```js
changedFiles = lines.map(line => {
  const idx = line[0];   // index (staged) status
  const wt = line[1];    // worktree status
  const file = line.substring(3);
  const staged = idx !== ' ' && idx !== '?';
  if (staged) stagedCount++;
  return { status: line.substring(0, 2).trim(), file, staged };
});
```

Column 1 of porcelain output is the index (staging area) status. `' '` means not staged, `'?'` means untracked. Anything else (`M`, `A`, `D`, `R`) means staged.

### 2. Pass full state to dialog

```js
function gitCommitOpen() {
  gitCommitDialog.show(gitState);
}
```

### 3. Dialog shows file breakdown

- **Nothing staged**: "No files staged — will stage all and commit:" + full file list
- **Some staged**: "Committing N staged files:" + staged list, then "M unstaged (won't be committed)"

Each file shows its git status code (`M`, `??`, `A`) next to the filename.

### 4. Auto-stage logic in commit

When nothing is staged, commit auto-runs `git add -A` first. When files ARE staged, it commits only those — respecting the user's manual staging.

## Prevention

- Git UIs must always distinguish staged vs unstaged — never show just a total count
- Pass structured data to UI components, not pre-formatted strings
- The `git status --porcelain` two-column format is the source of truth for staging state
