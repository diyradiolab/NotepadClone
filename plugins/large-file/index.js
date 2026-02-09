import '../../src/renderer/styles/large-file-viewer.css';
import { LargeFileViewer } from '../../src/renderer/editor/large-file-viewer';

export function activate(api) {
  // Track large file viewers per tab
  const largeFileViewers = new Map(); // tabId → LargeFileViewer

  api.registerViewer({
    id: 'large-file-view',
    displayName: 'Large File',

    canHandle(tab) {
      return tab.isLargeFile === true;
    },

    isDefault(tab) {
      return tab.isLargeFile === true;
    },

    activate(container, tab, entry, tabId) {
      container.innerHTML = '';
      const viewer = largeFileViewers.get(tabId);
      if (viewer) {
        container.appendChild(viewer.container);
      }
      api.statusBar.updateLanguage('Large File');
    },

    deactivate() {
      // Large file viewer stays in memory — just hidden
    },

    destroy() {
      // Cleanup handled per-tab in onClose
    },

    updateToolbar() {
      // No toolbar buttons for large file viewer
    },
  });

  async function openLargeFile(filePath, fileSize) {
    const existingTabId = api.tabs.findByPath(filePath);
    if (existingTabId) {
      api.tabs.activate(existingTabId);
      return;
    }

    const filename = filePath.split(/[/\\]/).pop();
    const tabId = api.tabs.create(filename, filePath);
    api.tabs.setFilePath(tabId, filePath);

    const tab = api.tabs.getTab(tabId);
    tab.isLargeFile = true;

    const viewerContainer = document.createElement('div');
    viewerContainer.style.width = '100%';
    viewerContainer.style.height = '100%';
    viewerContainer.style.position = 'relative';

    const viewer = new LargeFileViewer(viewerContainer);
    largeFileViewers.set(tabId, viewer);

    viewer.onCursorChange((line, col) => {
      if (tabId === api.tabs.getActiveId()) {
        api.statusBar.updatePosition
          ? api.statusBar.updatePosition(line, col)
          : null;
      }
    });

    const editorContainer = api.editor.container;
    editorContainer.innerHTML = '';
    editorContainer.appendChild(viewerContainer);
    viewerContainer.innerHTML = `
      <div class="lfv-loading">
        <div>Indexing large file...</div>
        <div class="lfv-progress-bar"><div class="lfv-progress-fill" id="lfv-progress-fill"></div></div>
        <div class="lfv-progress-text" id="lfv-progress-text">0%</div>
      </div>
    `;

    let result;
    try {
      result = await window.api.openLargeFile(filePath);
    } catch (err) {
      viewerContainer.innerHTML = `<div class="lfv-loading"><div>Error: ${err.message}</div></div>`;
      return;
    }

    if (result.error) {
      viewerContainer.innerHTML = `<div class="lfv-loading"><div>Error: ${result.error}</div></div>`;
      return;
    }

    try {
      await viewer.init(filePath, result.totalLines, result.fileSize);
    } catch (err) {
      viewerContainer.innerHTML = `<div class="lfv-loading"><div>Error initializing viewer: ${err.message}</div></div>`;
      return;
    }

    viewer.onOpenInEditor(async () => {
      const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
      const confirmed = await window.api.showConfirmDialog(
        `This file is ${sizeMB} MB. Loading it into the editor may use significant memory and could slow down the application.\n\nContinue?`
      );
      if (!confirmed) return;

      viewer.destroy();
      largeFileViewers.delete(tabId);

      const file = await window.api.readFileFull(filePath);
      if (!file) {
        api.statusBar.showMessage('Failed to read file');
        return;
      }

      const tab2 = api.tabs.getTab(tabId);
      tab2.isLargeFile = false;
      tab2.encoding = file.encoding || 'UTF-8';

      const filename2 = filePath.split(/[/\\]/).pop();
      const langInfo = api.editor.createForTab(tabId, file.content, filename2);
      api.editor.activateTab(tabId);

      api.statusBar.updateEncoding(file.encoding || 'UTF-8');
      api.statusBar.updateLineEnding(file.lineEnding || 'LF');
      api.statusBar.updateLanguage(langInfo.displayName);
    });

    const sizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    api.statusBar.updateEncoding('UTF-8');
    api.statusBar.updateLineEnding('LF');
    api.statusBar.updateLanguage(`Large File (${sizeMB} MB)`);
  }

  function cleanupTab(tabId) {
    const viewer = largeFileViewers.get(tabId);
    if (viewer) {
      viewer.destroy();
      largeFileViewers.delete(tabId);
    }
    const tab = api.tabs.getTab(tabId);
    if (tab && tab.filePath) {
      window.api.closeLargeFile(tab.filePath);
    }
  }

  function getViewerForTab(tabId) {
    return largeFileViewers.get(tabId);
  }

  return {
    openLargeFile,
    cleanupTab,
    getViewerForTab,
    deactivate() {
      for (const [tabId, viewer] of largeFileViewers) {
        viewer.destroy();
      }
      largeFileViewers.clear();
    },
  };
}
