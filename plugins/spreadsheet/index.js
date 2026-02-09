import '../../src/renderer/styles/spreadsheet-viewer.css';
import { SpreadsheetViewer } from '../../src/renderer/components/spreadsheet-viewer';

const SS_ICON_FX = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><text x="2" y="12" font-size="11" fill="currentColor" stroke="none" font-family="serif" font-style="italic">fx</text></svg>';
const SS_ICON_PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';

let sheetCounter = 1;

export function activate(api) {
  let spreadsheetViewer = null;

  function getViewer() {
    if (!spreadsheetViewer) {
      spreadsheetViewer = new SpreadsheetViewer(api.editor.container);
    }
    return spreadsheetViewer;
  }

  function updateToolbar(show, mode) {
    const btn = document.getElementById('btn-spreadsheet-toggle');
    const sep = document.getElementById('ss-separator');
    const icon = document.getElementById('ss-toggle-icon');
    if (!btn) return;

    if (!show) {
      btn.style.display = 'none';
      sep.style.display = 'none';
      return;
    }
    btn.style.display = '';
    sep.style.display = '';
    if (mode === 'spreadsheet') {
      icon.innerHTML = SS_ICON_PENCIL;
      btn.title = 'Switch to Editor';
    } else {
      icon.innerHTML = SS_ICON_FX;
      btn.title = 'Switch to Spreadsheet View';
    }
  }

  api.registerViewer({
    id: 'spreadsheet-view',
    displayName: 'Spreadsheet',

    canHandle(tab) {
      return tab.isSpreadsheet === true;
    },

    isDefault(tab) {
      return tab.isSpreadsheet && tab.spreadsheetMode === 'spreadsheet';
    },

    activate(container, tab, entry, tabId) {
      const viewer = getViewer();
      container.innerHTML = '';
      api.editor.activeTabId = tabId;
      const content = entry ? entry.model.getValue() : '';
      viewer.render(content);
      viewer.onChange((csv) => {
        if (entry) entry.model.setValue(csv);
      });
      api.statusBar.updateLanguage('Spreadsheet');
      updateToolbar(true, 'spreadsheet');
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
      if (tab.isSpreadsheet) {
        updateToolbar(true, tab.spreadsheetMode || 'edit');
      } else {
        updateToolbar(false);
      }
    },
  });

  function toggleSpreadsheetMode() {
    const tabId = api.tabs.getActiveId();
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.isSpreadsheet) return;

    const entry = api.editor.getEditorEntry(tabId);
    const viewer = getViewer();

    if (tab.spreadsheetMode === 'spreadsheet') {
      tab.spreadsheetMode = 'edit';
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
      tab.spreadsheetMode = 'spreadsheet';
      if (tab.isTableFile) tab.tableMode = 'edit';
      api.editor.container.innerHTML = '';
      api.editor.activeTabId = tabId;
      const content = entry ? entry.model.getValue() : '';
      viewer.render(content);
      viewer.onChange((csv) => {
        if (entry) entry.model.setValue(csv);
      });
      updateToolbar(true, 'spreadsheet');
      api.statusBar.updateLanguage('Spreadsheet');
    }
  }

  api.registerCommand({
    id: 'spreadsheet.toggleMode',
    title: 'Toggle Spreadsheet View',
    handler: toggleSpreadsheetMode,
    when: () => {
      const tab = api.tabs.getActive();
      return tab && tab.isSpreadsheet;
    },
  });

  function newSpreadsheet() {
    const title = `Sheet ${sheetCounter++}`;
    const tabId = api.tabs.create(title);
    api.editor.createForTab(tabId, '', title);
    const tab = api.tabs.getTab(tabId);
    tab.isSpreadsheet = true;
    tab.spreadsheetMode = 'spreadsheet';
    api.tabs.activate(tabId);
  }

  api.registerCommand({
    id: 'spreadsheet.new',
    title: 'New Spreadsheet',
    handler: newSpreadsheet,
  });

  return {
    toggleSpreadsheetMode,
    newSpreadsheet,
    updateToolbar,
    getViewer,
    deactivate() {
      if (spreadsheetViewer) {
        spreadsheetViewer.destroy();
        spreadsheetViewer = null;
      }
    },
  };
}
