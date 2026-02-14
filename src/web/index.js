/**
 * Web entry point for NotepadClone.
 * Sets up browser shim for window.api, then boots the existing renderer.
 */

// 1. Install browser shim for window.api (must run before renderer)
import './web-api';

// 2. Wire keyboard shortcuts (replaces native Electron menus)
import './web-toolbar';

// 3. Boot the existing renderer app (unchanged)
import '../renderer/index';
