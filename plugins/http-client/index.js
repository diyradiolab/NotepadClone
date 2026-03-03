import '../../src/renderer/styles/http-client-panel.css';
import { HttpClientPanel } from '../../src/renderer/components/http-client-panel';

let tabCounter = 1;

export function activate(api) {
  const viewers = new Map(); // tabId → HttpClientPanel

  function getOrCreateViewer(tabId) {
    if (!viewers.has(tabId)) {
      const editorWrapper = api.editor.container.parentElement;
      viewers.set(tabId, new HttpClientPanel(editorWrapper));
    }
    return viewers.get(tabId);
  }

  api.registerViewer({
    id: 'http-client-view',
    displayName: 'HTTP Client',

    canHandle(tab) {
      return tab.isHttpClient === true;
    },

    isDefault(tab) {
      return tab.isHttpClient === true;
    },

    activate(container, tab, entry, tabId) {
      const viewer = getOrCreateViewer(tabId);
      api.editor.activeTabId = tabId;
      container.style.display = 'none';
      viewer.show(tabId);
      api.statusBar.updateLanguage('HTTP Client');
    },

    deactivate() {
      api.editor.container.style.display = '';
      for (const viewer of viewers.values()) {
        viewer.hide();
      }
    },

    destroy() {
      const tabId = api.tabs.getActiveId();
      const viewer = viewers.get(tabId);
      if (viewer) {
        viewer.destroy();
        viewers.delete(tabId);
      }
      api.editor.container.style.display = '';
    },

    updateToolbar() {},
  });

  function openHttpClient() {
    const title = `HTTP Client${tabCounter > 1 ? ` ${tabCounter}` : ''}`;
    tabCounter++;
    const tabId = api.tabs.create(title);
    api.editor.createForTab(tabId, '', title);
    const tab = api.tabs.getTab(tabId);
    tab.isHttpClient = true;
    tab.viewerMode = 'http-client-view';
    api.tabs.activate(tabId);
  }

  api.registerCommand({
    id: 'httpClient.open',
    title: 'HTTP Client',
    handler: openHttpClient,
  });

  return {
    openHttpClient,
    deactivate() {
      for (const viewer of viewers.values()) {
        viewer.destroy();
      }
      viewers.clear();
    },
  };
}
