/**
 * Keyboard shortcuts for the web version.
 * Replaces native Electron menus by wiring global keydown handlers
 * that trigger the same callbacks registered via onMenu* in web-api.js.
 */

const mc = () => window._npcMenuCallbacks || {};

// Detect Mac for Cmd vs Ctrl
const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

function modKey(e) {
  return isMac ? e.metaKey : e.ctrlKey;
}

document.addEventListener('keydown', (e) => {
  const mod = modKey(e);
  const shift = e.shiftKey;
  const key = e.key.toLowerCase();

  // Ctrl/Cmd + key
  if (mod && !shift && !e.altKey) {
    switch (key) {
      case 'n': e.preventDefault(); mc().newFile?.(); return;
      case 'o': e.preventDefault(); mc().openFile?.(); return;
      case 's': e.preventDefault(); mc().save?.(); return;
      case 'w': e.preventDefault(); mc().closeTab?.(); return;
      case 'z': /* let Monaco handle undo */ return;
      case 'y': /* let Monaco handle redo */ return;
      case 'f': /* let Monaco/find-replace handle */ return;
      case 'h': /* let Monaco/find-replace handle */ return;
      case 'g': e.preventDefault(); mc().goToLine?.(); return;
      case 'p': e.preventDefault(); mc().commandPalette?.(); return;
      case '=': case '+': e.preventDefault(); mc().zoomIn?.(); return;
      case '-': e.preventDefault(); mc().zoomOut?.(); return;
      case '0': e.preventDefault(); mc().resetZoom?.(); return;
    }
  }

  // Ctrl/Cmd + Shift + key
  if (mod && shift && !e.altKey) {
    switch (key) {
      case 's': e.preventDefault(); mc().saveAs?.(); return;
      case 'f': e.preventDefault(); mc().findInFiles?.(); return;
      case 'n': e.preventDefault(); mc().toggleNotes?.(); return;
      case 'q': e.preventDefault(); mc().sqlQuery?.(); return;
      case 'h': e.preventDefault(); mc().clipboardHistory?.(); return;
      case 'p': e.preventDefault(); mc().pluginManager?.(); return;
      case 'r': e.preventDefault(); mc().showRecentFiles?.(); return;
      case 'm': e.preventDefault(); /* markdown toggle handled by plugin shortcut */ return;
    }
  }

  // Ctrl/Cmd + , (Options)
  if (mod && e.key === ',') {
    e.preventDefault();
    mc().options?.();
    return;
  }
});

// Prevent browser default for Ctrl+S, Ctrl+O in all cases
window.addEventListener('beforeunload', (e) => {
  // Check for dirty tabs by looking at tab indicators
  const dirtyDots = document.querySelectorAll('.tab-dirty-dot');
  if (dirtyDots.length > 0) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes.';
  }
});
