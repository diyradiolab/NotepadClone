import '../../src/renderer/styles/regex-tester.css';
import { RegexTesterPanel } from '../../src/renderer/components/regex-tester-panel';

let tabCounter = 1;

export function activate(api) {
  const viewers = new Map(); // tabId → RegexTesterPanel

  function getOrCreateViewer(tabId) {
    if (!viewers.has(tabId)) {
      const editorWrapper = api.editor.container.parentElement;
      viewers.set(tabId, new RegexTesterPanel(editorWrapper));
    }
    return viewers.get(tabId);
  }

  api.registerViewer({
    id: 'regex-tester-view',
    displayName: 'Regex Tester',

    canHandle(tab) {
      return tab.isRegexTester === true;
    },

    isDefault(tab) {
      return tab.isRegexTester === true;
    },

    activate(container, tab, entry, tabId) {
      const viewer = getOrCreateViewer(tabId);
      api.editor.activeTabId = tabId;
      container.style.display = 'none';
      viewer.show(tabId);
      api.statusBar.updateLanguage('Regex Tester');
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

  function openRegexTester(initialPattern, initialTestString) {
    const title = `Regex Tester${tabCounter > 1 ? ` ${tabCounter}` : ''}`;
    tabCounter++;
    const tabId = api.tabs.create(title);
    api.editor.createForTab(tabId, '', title);
    const tab = api.tabs.getTab(tabId);
    tab.isRegexTester = true;
    tab.viewerMode = 'regex-tester-view';
    api.tabs.activate(tabId);

    // Set initial values if provided
    if (initialPattern || initialTestString) {
      setTimeout(() => {
        const viewer = viewers.get(tabId);
        if (viewer) {
          if (initialPattern) viewer.setPattern(initialPattern);
          if (initialTestString) viewer.setTestString(initialTestString);
        }
      }, 50);
    }
  }

  api.registerCommand({
    id: 'regexTester.open',
    title: 'Regex Tester',
    handler: () => openRegexTester(),
  });

  // "Test in Regex Tester" — opens with current selection as test string
  api.registerCommand({
    id: 'regexTester.testSelection',
    title: 'Test Selection in Regex Tester',
    handler: () => {
      const editor = api.editor.getActiveEditor();
      const selection = editor ? editor.getModel()?.getValueInRange(editor.getSelection()) : '';
      openRegexTester('', selection || '');
    },
  });

  return {
    openRegexTester,
    deactivate() {
      for (const viewer of viewers.values()) {
        viewer.destroy();
      }
      viewers.clear();
    },
  };
}
