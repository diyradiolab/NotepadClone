import '../../src/renderer/styles/compare-dialog.css';
import { CompareTabDialog } from '../../src/renderer/components/compare-tab-dialog';

export function activate(api) {
  const dialog = new CompareTabDialog();

  dialog.onSelect((otherTabId) => {
    const activeTabId = api.tabs.getActiveId();
    if (!activeTabId) return;
    const activeTab = api.tabs.getTab(activeTabId);
    const otherTab = api.tabs.getTab(otherTabId);
    if (!activeTab || !otherTab) return;

    const activeContent = api.editor.getContent(activeTabId);
    const otherContent = api.editor.getContent(otherTabId);

    const diffTitle = `${activeTab.title} \u2194 ${otherTab.title}`;
    const diffTabId = api.tabs.create(diffTitle);
    const diffTab = api.tabs.getTab(diffTabId);
    diffTab.isDiffTab = true;

    api.events.emit('diff:create', {
      diffTabId, otherContent, activeContent,
      otherTitle: otherTab.title, activeTitle: activeTab.title,
    });
  });

  api.registerCommand({
    id: 'compareTabs.show',
    title: 'Compare Tabs',
    handler: () => dialog.show(api.tabs.getAll(), api.tabs.getActiveId()),
  });

  return {
    getDialog: () => dialog,
    deactivate() {},
  };
}
