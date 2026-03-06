import '../../src/renderer/styles/hex-editor.css';
import { HexEditorPanel } from '../../src/renderer/components/hex-editor-panel';

let tabCounter = 1;

export function activate(api) {
  const viewers = new Map(); // tabId → HexEditorPanel

  function getOrCreateViewer(tabId) {
    if (!viewers.has(tabId)) {
      const editorWrapper = api.editor.container.parentElement;
      viewers.set(tabId, new HexEditorPanel(editorWrapper));
    }
    return viewers.get(tabId);
  }

  api.registerViewer({
    id: 'hex-editor-view',
    displayName: 'Hex Editor',

    canHandle(tab) {
      return tab.isHexEditor === true;
    },

    isDefault(tab) {
      return tab.isHexEditor === true;
    },

    activate(container, tab, entry, tabId) {
      const viewer = getOrCreateViewer(tabId);
      api.editor.activeTabId = tabId;
      container.style.display = 'none';
      viewer.show(tabId);
      api.statusBar.updateLanguage('Hex Editor');

      // Load file if we have a path and haven't loaded yet
      if (tab.hexFilePath && !viewer._bytes) {
        viewer.loadFile(tab.hexFilePath);
      }
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

  function openHexEditor(filePath) {
    // If no file path, use the active tab's file
    if (!filePath) {
      const activeTabId = api.tabs.getActiveId();
      const activeTab = api.tabs.getTab(activeTabId);
      if (activeTab?.filePath) {
        filePath = activeTab.filePath;
      } else {
        alert('Save the file first to view in Hex Editor.');
        return;
      }
    }

    const fileName = filePath.split('/').pop().split('\\').pop();
    const title = `Hex: ${fileName}${tabCounter > 1 ? ` (${tabCounter})` : ''}`;
    tabCounter++;

    const tabId = api.tabs.create(title);
    api.editor.createForTab(tabId, '', title);
    const tab = api.tabs.getTab(tabId);
    tab.isHexEditor = true;
    tab.hexFilePath = filePath;
    tab.viewerMode = 'hex-editor-view';
    api.tabs.activate(tabId);
  }

  api.registerCommand({
    id: 'hexEditor.open',
    title: 'Hex Editor',
    handler: () => openHexEditor(),
  });

  return {
    openHexEditor,
    deactivate() {
      for (const viewer of viewers.values()) {
        viewer.destroy();
      }
      viewers.clear();
    },
  };
}
