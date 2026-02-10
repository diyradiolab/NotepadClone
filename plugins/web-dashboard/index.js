import '../../src/renderer/styles/web-dashboard.css';
import { WebDashboardViewer } from '../../src/renderer/components/web-dashboard-viewer';

let dashboardCounter = 1;

export function activate(api) {
  // One viewer instance per dashboard tab (Map: tabId → viewer)
  const viewers = new Map();

  function getOrCreateViewer(tabId) {
    if (!viewers.has(tabId)) {
      const editorWrapper = api.editor.container.parentElement;
      viewers.set(tabId, new WebDashboardViewer(editorWrapper));
    }
    return viewers.get(tabId);
  }

  api.registerViewer({
    id: 'dashboard-view',
    displayName: 'Web Dashboard',

    canHandle(tab) {
      return tab.isDashboard === true;
    },

    isDefault(tab) {
      return tab.isDashboard === true;
    },

    activate(container, tab, entry, tabId) {
      const viewer = getOrCreateViewer(tabId);
      api.editor.activeTabId = tabId;
      // Hide the Monaco editor area since we render in our own container
      container.style.display = 'none';

      viewer.show(tabId, (title) => {
        api.tabs.setTitle(tabId, title);
      });

      api.statusBar.updateLanguage('Dashboard');
    },

    deactivate() {
      // Show the Monaco editor area back for other tabs
      api.editor.container.style.display = '';

      // Hide all dashboard viewers
      for (const viewer of viewers.values()) {
        viewer.hide();
      }
    },

    destroy() {
      // Find which viewer's tab is being destroyed
      const tabId = api.tabs.getActiveId();
      const viewer = viewers.get(tabId);
      if (viewer) {
        viewer.destroy();
        viewers.delete(tabId);
      }
      // Restore editor container visibility (deactivate() may not be called after close)
      api.editor.container.style.display = '';
    },

    updateToolbar(isActive) {
      // No custom toolbar buttons for dashboard — browser toolbar is inline
    },
  });

  function newDashboard() {
    const title = 'Dashboard';
    const tabId = api.tabs.create(title);
    api.editor.createForTab(tabId, '', title);
    const tab = api.tabs.getTab(tabId);
    tab.isDashboard = true;
    tab.viewerMode = 'dashboard-view';
    api.tabs.activate(tabId);
  }

  api.registerCommand({
    id: 'webDashboard.open',
    title: 'New Dashboard',
    handler: newDashboard,
  });

  return {
    newDashboard,
    deactivate() {
      for (const viewer of viewers.values()) {
        viewer.destroy();
      }
      viewers.clear();
    },
  };
}
