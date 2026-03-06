import '../../src/renderer/styles/log-analyzer.css';
import { LogAnalyzerPanel } from '../../src/renderer/components/log-analyzer-panel';

export function activate(api) {
  const viewers = new Map(); // tabId → LogAnalyzerPanel

  function getOrCreateViewer(tabId) {
    if (!viewers.has(tabId)) {
      const editorWrapper = api.editor.container.parentElement;
      viewers.set(tabId, new LogAnalyzerPanel(editorWrapper));
    }
    return viewers.get(tabId);
  }

  api.registerViewer({
    id: 'log-analyzer-view',
    displayName: 'Log Analyzer',

    canHandle(tab) {
      return tab.isLogFile === true && tab.logMode === 'analyze';
    },

    isDefault(tab) {
      return tab.isLogFile === true && tab.logMode === 'analyze';
    },

    activate(container, tab, entry, tabId) {
      const viewer = getOrCreateViewer(tabId);
      api.editor.activeTabId = tabId;
      container.style.display = 'none';
      const content = api.editor.getContent(tabId) || '';
      const filename = tab.title || '';
      viewer.show(tabId, content, filename);
      api.statusBar.updateLanguage('Log Analyzer');
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

    updateToolbar(tab) {
      const sep = document.getElementById('la-separator');
      const btn = document.getElementById('btn-log-analyzer-toggle');
      const show = !!(tab && tab.isLogFile);
      if (sep) sep.style.display = show ? '' : 'none';
      if (btn) {
        btn.style.display = show ? '' : 'none';
        btn.classList.toggle('toolbar-btn-active', !!(tab && tab.logMode === 'analyze'));
      }
    },
  });

  function toggleLogMode() {
    const tabId = api.tabs.getActiveId();
    if (!tabId) return;
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.isLogFile) return;

    if (tab.logMode === 'analyze') {
      tab.logMode = 'edit';
    } else {
      tab.logMode = 'analyze';
    }
    api.tabs.activate(tabId);
  }

  function openLogAnalyzer() {
    const tabId = api.tabs.getActiveId();
    if (!tabId) return;
    const tab = api.tabs.getTab(tabId);
    if (!tab) return;

    tab.isLogFile = true;
    tab.logMode = 'analyze';
    api.tabs.activate(tabId);
  }

  api.registerCommand({
    id: 'logAnalyzer.open',
    title: 'Log Analyzer',
    handler: () => openLogAnalyzer(),
  });

  api.registerCommand({
    id: 'logAnalyzer.toggleMode',
    title: 'Toggle Log Analyzer Mode',
    handler: () => toggleLogMode(),
  });

  return {
    toggleLogMode,
    openLogAnalyzer,
    deactivate() {
      for (const viewer of viewers.values()) {
        viewer.destroy();
      }
      viewers.clear();
    },
  };
}
