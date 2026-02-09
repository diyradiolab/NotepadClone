import '../../src/renderer/styles/table-viewer.css';
import { TableViewer, isTableFile, isTableJSON, isTableXML } from '../../src/renderer/components/table-viewer';

const TV_ICON_GRID = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2" width="13" height="12" rx="1"/><line x1="1.5" y1="5.5" x2="14.5" y2="5.5"/><line x1="1.5" y1="9" x2="14.5" y2="9"/><line x1="5.5" y1="5.5" x2="5.5" y2="14"/><line x1="10.5" y1="5.5" x2="10.5" y2="14"/></svg>';
const TV_ICON_PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';

export function activate(api) {
  let tableViewer = null;

  function getViewer() {
    if (!tableViewer) {
      tableViewer = new TableViewer(api.editor.container);
    }
    return tableViewer;
  }

  // Row click: switch to editor and jump to line
  function initRowClickHandler() {
    const viewer = getViewer();
    viewer.onRowClick((lineNumber) => {
      const tabId = api.tabs.getActiveId();
      const tab = api.tabs.getTab(tabId);
      if (!tab || !tab.isTableFile) return;
      tab.tableMode = 'edit';
      viewer.destroy();
      api.editor.activateTab(tabId);
      updateToolbar(true, 'edit');
      const langInfo = api.editor.getLanguageInfo(tabId);
      api.statusBar.updateLanguage(langInfo.displayName);
      api.editor.revealLine(tabId, lineNumber);
    });
  }

  function updateToolbar(isTable, mode) {
    const btn = document.getElementById('btn-table-toggle');
    const sep = document.getElementById('tv-separator');
    const icon = document.getElementById('tv-toggle-icon');
    if (!btn) return;

    if (!isTable) {
      btn.style.display = 'none';
      sep.style.display = 'none';
      return;
    }
    btn.style.display = '';
    sep.style.display = '';
    if (mode === 'table') {
      icon.innerHTML = TV_ICON_PENCIL;
      btn.title = 'Switch to Editor (Ctrl+Shift+T)';
    } else {
      icon.innerHTML = TV_ICON_GRID;
      btn.title = 'Switch to Table View (Ctrl+Shift+T)';
    }
  }

  api.registerViewer({
    id: 'table-view',
    displayName: 'Table View',

    canHandle(tab) {
      return tab.isTableFile === true;
    },

    isDefault(tab) {
      return tab.isTableFile && tab.tableMode === 'table';
    },

    activate(container, tab, entry) {
      const viewer = getViewer();
      container.innerHTML = '';
      const content = entry.model.getValue();
      viewer.render(content, tab.title);
      initRowClickHandler();
      api.statusBar.updateLanguage('Table View');
      updateToolbar(true, 'table');
    },

    deactivate() {
      getViewer().destroy();
    },

    destroy() {
      getViewer().destroy();
    },

    updateToolbar(isActive, tab) {
      if (!tab) {
        updateToolbar(false);
        return;
      }
      if (tab.isTableFile) {
        updateToolbar(true, tab.tableMode || 'edit');
      } else {
        updateToolbar(false);
      }
    },
  });

  // Toggle command
  function toggleTableMode() {
    const tabId = api.tabs.getActiveId();
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.isTableFile) return;

    const entry = api.editor.getEditorEntry(tabId);
    const viewer = getViewer();

    if (tab.tableMode === 'table') {
      tab.tableMode = 'edit';
      viewer.destroy();
      api.editor.activateTab(tabId);
      updateToolbar(true, 'edit');
      const langInfo = api.editor.getLanguageInfo(tabId);
      api.statusBar.updateLanguage(langInfo.displayName);
    } else {
      const editor = api.editor.getActiveEditor();
      if (editor && entry) {
        entry.viewState = editor.saveViewState();
        editor.dispose();
        entry.editor = null;
      }
      tab.tableMode = 'table';
      api.editor.container.innerHTML = '';
      const content = entry.model.getValue();
      viewer.render(content, tab.title);
      initRowClickHandler();
      updateToolbar(true, 'table');
      api.statusBar.updateLanguage('Table View');
    }
  }

  api.registerCommand({
    id: 'table.toggleMode',
    title: 'Toggle Table/Editor View',
    shortcut: 'Ctrl+Shift+T',
    handler: toggleTableMode,
    when: () => {
      const tab = api.tabs.getActive();
      return tab && tab.isTableFile;
    },
  });

  return {
    toggleTableMode,
    isTableFile,
    isTableJSON,
    isTableXML,
    updateToolbar,
    getViewer,
    deactivate() {
      if (tableViewer) {
        tableViewer.destroy();
        tableViewer = null;
      }
    },
  };
}
