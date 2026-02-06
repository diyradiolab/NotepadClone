---
title: "Git status indicator not working — missing directory fallback"
category: logic-errors
tags: [git-integration, state-management, null-handling, fallback-logic, ui-feedback]
module: renderer
symptoms:
  - Git status indicator stays grey/inactive when file from git repo is open
  - Git operations (stage, commit, push, pull) fail silently
  - Git info missing from status bar despite file being in a repo
  - Opening a folder does not trigger git status refresh
root_cause: getActiveFileDirPath returned null for untitled tabs with no fallback
date_solved: 2026-02-06
severity: high
---

# Git Status Indicator Not Working

## Symptom

The git branch icon in the toolbar never turned green, even when a file from a git repository was open. Git operations (stage, commit) either failed silently or showed "Commit failed" in the status bar. The status bar git section stayed hidden.

## Investigation

The git status flow:
1. `refreshGitStatus()` calls `getActiveFileDirPath()` to get a directory
2. Passes that directory to `window.api.gitStatus(dirPath)` (IPC to main)
3. Main process runs `git rev-parse --is-inside-work-tree` in that directory
4. Result updates the indicator and status bar

The problem was in step 1.

## Root Cause

`getActiveFileDirPath()` extracted the directory from the active tab's `filePath`. But when the active tab was untitled (e.g., "new 1" on startup), `tab.filePath` was `null`, so the function returned `null`.

```js
// BEFORE — returns null for untitled tabs
function getActiveFileDirPath() {
  const tabId = tabManager.getActiveTabId();
  if (!tabId) return null;
  const tab = tabManager.getTab(tabId);
  if (!tab || !tab.filePath) return null;  // <-- null for untitled tabs
  const parts = tab.filePath.split(/[/\\]/);
  parts.pop();
  return parts.join('/') || null;
}
```

This caused three cascading failures:
1. `refreshGitStatus()` passed `null` to git service, which returned `{isRepo: false}`
2. All git operations (`gitStageAll`, `gitCommit`, etc.) had `if (!dirPath) return` guards that silently aborted
3. `currentFolderPath` was tracked when a folder was opened but never used as a fallback

## Solution

Modified `getActiveFileDirPath()` to fall back to `currentFolderPath` when the active tab has no file path. This fixed all callers at once since they all use the same function.

```js
// AFTER — falls back to open folder
function getActiveFileDirPath() {
  const tabId = tabManager.getActiveTabId();
  if (tabId) {
    const tab = tabManager.getTab(tabId);
    if (tab && tab.filePath) {
      const parts = tab.filePath.split(/[/\\]/);
      parts.pop();
      const dir = parts.join('/');
      if (dir) return dir;
    }
  }
  return currentFolderPath || null;
}
```

Also added `refreshGitStatus()` call after `openFolder()` so the indicator updates immediately when a repo folder is opened.

## Prevention

- When a function resolves context from "active state" (active tab, active file), always consider what happens when that state is empty/default
- State that is tracked (`currentFolderPath`) should be actively used in fallback chains
- Silent `return` on null guards should at minimum log or show a status message so failures are visible
- Test git features with both saved files and untitled tabs active
