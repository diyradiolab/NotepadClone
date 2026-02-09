import '../../src/renderer/styles/tree-viewer.css';
import { TreeViewer } from '../../src/renderer/components/tree-viewer';

const TREE_ICON_TREE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="6" r="1.5"/><circle cx="9" cy="10" r="1.5"/><circle cx="13" cy="13" r="1.5"/><line x1="4.2" y1="3.7" x2="7.8" y2="5.5"/><line x1="4.2" y1="3.7" x2="7.8" y2="9.5"/><line x1="10.2" y1="10.7" x2="11.8" y2="12.5"/></svg>';
const TREE_ICON_PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';

export function activate(api) {
  let treeViewer = null;

  function getViewer() {
    if (!treeViewer) {
      treeViewer = new TreeViewer(api.editor.container);
    }
    return treeViewer;
  }

  function initNodeClickHandler() {
    const viewer = getViewer();
    viewer.onNodeClick((lineNumber) => {
      const tabId = api.tabs.getActiveId();
      const tab = api.tabs.getTab(tabId);
      if (!tab || !tab.isTreeFile) return;
      tab.treeMode = 'edit';
      viewer.destroy();
      api.editor.activateTab(tabId);
      updateToolbar(true, 'edit');
      const langInfo = api.editor.getLanguageInfo(tabId);
      api.statusBar.updateLanguage(langInfo.displayName);
      api.editor.revealLine(tabId, lineNumber);
    });
  }

  function isTreeFile(filename) {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    return lower.endsWith('.json') || lower.endsWith('.xml');
  }

  function updateToolbar(isTree, mode) {
    const btn = document.getElementById('btn-tree-toggle');
    const sep = document.getElementById('tree-separator');
    const icon = document.getElementById('tree-toggle-icon');
    if (!btn) return;

    if (!isTree) {
      btn.style.display = 'none';
      sep.style.display = 'none';
      return;
    }
    btn.style.display = '';
    sep.style.display = '';
    if (mode === 'tree') {
      icon.innerHTML = TREE_ICON_PENCIL;
      btn.title = 'Switch to Editor (Ctrl+Shift+R)';
    } else {
      icon.innerHTML = TREE_ICON_TREE;
      btn.title = 'Switch to Tree View (Ctrl+Shift+R)';
    }
  }

  api.registerViewer({
    id: 'tree-view',
    displayName: 'Tree View',

    canHandle(tab) {
      return tab.isTreeFile === true;
    },

    isDefault(tab) {
      return tab.isTreeFile && tab.treeMode === 'tree';
    },

    activate(container, tab, entry) {
      const viewer = getViewer();
      container.innerHTML = '';
      const content = entry.model.getValue();
      viewer.render(content, tab.title);
      initNodeClickHandler();
      api.statusBar.updateLanguage('Tree View');
      updateToolbar(true, 'tree');
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
      if (tab.isTreeFile) {
        updateToolbar(true, tab.treeMode || 'edit');
      } else {
        updateToolbar(false);
      }
    },
  });

  function toggleTreeMode() {
    const tabId = api.tabs.getActiveId();
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.isTreeFile) return;

    const entry = api.editor.getEditorEntry(tabId);
    const viewer = getViewer();

    if (tab.treeMode === 'tree') {
      tab.treeMode = 'edit';
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
      tab.treeMode = 'tree';
      api.editor.container.innerHTML = '';
      const content = entry.model.getValue();
      viewer.render(content, tab.title);
      initNodeClickHandler();
      updateToolbar(true, 'tree');
      api.statusBar.updateLanguage('Tree View');
    }
  }

  api.registerCommand({
    id: 'tree.toggleMode',
    title: 'Toggle Tree/Editor View',
    shortcut: 'Ctrl+Shift+R',
    handler: toggleTreeMode,
    when: () => {
      const tab = api.tabs.getActive();
      return tab && tab.isTreeFile;
    },
  });

  return {
    toggleTreeMode,
    isTreeFile,
    updateToolbar,
    getViewer,
    deactivate() {
      if (treeViewer) {
        treeViewer.destroy();
        treeViewer = null;
      }
    },
  };
}
