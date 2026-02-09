import '../../src/renderer/styles/sql-query-panel.css';
import { SqlQueryPanel } from '../../src/renderer/components/sql-query-panel';
import { SQL_QUERY_HELP } from '../../src/renderer/help/sql-query-help';

export function activate(api) {
  const { editorManager, tabManager } = api._services;
  const sqlQueryPanel = new SqlQueryPanel(
    document.getElementById('sql-query'), editorManager, tabManager
  );
  const { viewerRegistry } = api._services;

  sqlQueryPanel.onRowClick((lineNumber) => {
    const tabId = api.tabs.getActiveId();
    if (!tabId) return;
    const tab = api.tabs.getTab(tabId);

    // Switch any non-editor viewer to edit mode first
    if (tab && tab.isSpreadsheet && tab.spreadsheetMode === 'spreadsheet') {
      tab.spreadsheetMode = 'edit';
      viewerRegistry.deactivateActive();
      api.editor.activateTab(tabId);
      viewerRegistry.updateToolbars(tab);
      const langInfo = api.editor.getLanguageInfo(tabId);
      api.statusBar.updateLanguage(langInfo.displayName);
    } else if (tab && tab.isTableFile && tab.tableMode === 'table') {
      tab.tableMode = 'edit';
      viewerRegistry.deactivateActive();
      api.editor.activateTab(tabId);
      viewerRegistry.updateToolbars(tab);
      const langInfo = api.editor.getLanguageInfo(tabId);
      api.statusBar.updateLanguage(langInfo.displayName);
    } else if (tab && tab.isTreeFile && tab.treeMode === 'tree') {
      tab.treeMode = 'edit';
      viewerRegistry.deactivateActive();
      api.editor.activateTab(tabId);
      viewerRegistry.updateToolbars(tab);
      const langInfo = api.editor.getLanguageInfo(tabId);
      api.statusBar.updateLanguage(langInfo.displayName);
    } else if (tab && tab.isMarkdown && tab.markdownMode === 'read') {
      tab.markdownMode = 'edit';
      api.editor.activateTab(tabId);
      viewerRegistry.updateToolbars(tab);
      const langInfo = api.editor.getLanguageInfo(tabId);
      api.statusBar.updateLanguage(langInfo.displayName);
    }

    api.editor.revealLine(tabId, lineNumber);
  });

  api.registerCommand({
    id: 'sqlQuery.toggle',
    title: 'Toggle SQL Query Panel',
    handler: () => sqlQueryPanel.toggle(),
  });

  api.registerCommand({
    id: 'sqlQuery.help',
    title: 'SQL Query Help',
    handler: () => api.events.emit('help:open', { title: 'SQL Query Builder Guide.md', content: SQL_QUERY_HELP }),
  });

  return {
    getPanel: () => sqlQueryPanel,
    deactivate() {},
  };
}
