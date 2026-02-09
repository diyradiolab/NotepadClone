/**
 * ViewerRegistry manages tab viewers (markdown preview, table view, tree view, etc.).
 * Replaces the massive if/else chain in index.js onActivate.
 *
 * Each viewer registers with:
 *   { id, displayName, canHandle(tab), activate(container, tab, entry), deactivate(), destroy() }
 *
 * Only one viewer is active per tab at a time (determined by tab.viewerMode).
 * When viewerMode is null/undefined or 'edit', the default Monaco editor is used.
 */
export class ViewerRegistry {
  constructor() {
    this._viewers = new Map(); // id → viewer definition
    this._activeViewer = null; // currently active viewer id
    this._activeTabId = null;
  }

  register(viewer) {
    if (!viewer.id) throw new Error('Viewer must have an id');
    this._viewers.set(viewer.id, viewer);
  }

  unregister(id) {
    if (this._activeViewer === id) {
      this.deactivateActive();
    }
    this._viewers.delete(id);
  }

  /**
   * Get all viewers that can handle a tab.
   */
  getViewersForTab(tab) {
    const result = [];
    for (const viewer of this._viewers.values()) {
      if (viewer.canHandle(tab)) {
        result.push(viewer);
      }
    }
    return result;
  }

  /**
   * Activate the appropriate viewer for a tab.
   * Returns true if a viewer was activated, false if default editor should be used.
   */
  activateTab(tab, tabId, entry, container) {
    this._activeTabId = tabId;

    // If tab has a viewerMode, find the matching viewer
    if (tab.viewerMode && tab.viewerMode !== 'edit') {
      const viewer = this._viewers.get(tab.viewerMode);
      if (viewer && viewer.canHandle(tab)) {
        this._activeViewer = viewer.id;
        viewer.activate(container, tab, entry, tabId);
        return true;
      }
    }

    // Check if any viewer wants to handle this tab by default
    for (const viewer of this._viewers.values()) {
      if (viewer.canHandle(tab) && viewer.isDefault && viewer.isDefault(tab)) {
        this._activeViewer = viewer.id;
        tab.viewerMode = viewer.id;
        viewer.activate(container, tab, entry, tabId);
        return true;
      }
    }

    this._activeViewer = null;
    return false;
  }

  /**
   * Deactivate the currently active viewer.
   */
  deactivateActive() {
    if (!this._activeViewer) return;
    const viewer = this._viewers.get(this._activeViewer);
    if (viewer && viewer.deactivate) {
      viewer.deactivate();
    }
    this._activeViewer = null;
  }

  /**
   * Destroy the viewer for a closing tab.
   */
  destroyTab(tab) {
    if (tab.viewerMode && tab.viewerMode !== 'edit') {
      const viewer = this._viewers.get(tab.viewerMode);
      if (viewer && viewer.destroy) {
        viewer.destroy();
      }
    }
  }

  /**
   * Get the currently active viewer id.
   */
  getActiveViewerId() {
    return this._activeViewer;
  }

  /**
   * Get a viewer by id.
   */
  getViewer(id) {
    return this._viewers.get(id);
  }

  /**
   * Update toolbar visibility for all registered viewers.
   * Each viewer optionally provides updateToolbar(isActive, tab).
   */
  updateToolbars(activeTab) {
    for (const viewer of this._viewers.values()) {
      if (viewer.updateToolbar) {
        const isActive = activeTab && activeTab.viewerMode === viewer.id;
        viewer.updateToolbar(isActive, activeTab);
      }
    }
  }
}
