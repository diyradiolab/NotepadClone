import '../../src/renderer/styles/diagram-viewer.css';
import { DiagramViewer, isDiagramFile } from '../../src/renderer/components/diagram-viewer';

const DV_ICON_SPLIT = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2" width="13" height="12" rx="1"/><line x1="8" y1="2" x2="8" y2="14"/></svg>';
const DV_ICON_FULL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="2" width="13" height="12" rx="1"/></svg>';

let diagramCounter = 1;

export function activate(api) {
  let diagramViewer = null;

  function getViewer() {
    if (!diagramViewer) {
      diagramViewer = new DiagramViewer(api.editor.container);
    }
    return diagramViewer;
  }

  function updateToolbar(isDiagram, isSplit) {
    const btn = document.getElementById('btn-diagram-toggle');
    const exportBtn = document.getElementById('btn-diagram-export');
    const sep = document.getElementById('dv-separator');
    const icon = document.getElementById('dv-toggle-icon');
    if (!btn) return;

    if (!isDiagram) {
      btn.style.display = 'none';
      exportBtn.style.display = 'none';
      sep.style.display = 'none';
      return;
    }
    btn.style.display = '';
    exportBtn.style.display = '';
    sep.style.display = '';
    icon.innerHTML = isSplit ? DV_ICON_FULL : DV_ICON_SPLIT;
    btn.title = isSplit ? 'Switch to Full Editor' : 'Switch to Split View';
  }

  api.registerViewer({
    id: 'diagram-view',
    displayName: 'Mermaid Diagram',

    canHandle(tab) {
      return tab.isDiagram === true;
    },

    isDefault(tab) {
      return tab.isDiagram && tab.diagramMode === 'diagram';
    },

    activate(container, tab, entry, tabId) {
      const viewer = getViewer();
      container.innerHTML = '';
      api.editor.activeTabId = tabId;
      if (entry) {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        viewer.render(entry.model, currentTheme);
        viewer.onChange(() => {
          api.tabs.setDirty(tabId, true);
        });
      }
      api.statusBar.updateLanguage('Mermaid Diagram');
      updateToolbar(true, true);
    },

    deactivate() {
      getViewer().destroy();
    },

    destroy() {
      getViewer().destroy();
    },

    updateToolbar(isActive, tab) {
      if (!tab || !tab.isDiagram) {
        updateToolbar(false);
      } else {
        updateToolbar(true, tab.diagramMode === 'diagram');
      }
    },
  });

  function toggleDiagramSplit() {
    const tabId = api.tabs.getActiveId();
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.isDiagram) return;
    const isSplit = getViewer().toggleSplitView();
    updateToolbar(true, isSplit);
  }

  async function exportDiagramSvg() {
    const tabId = api.tabs.getActiveId();
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.isDiagram) return;

    const svg = getViewer().getSvg();
    if (!svg) {
      api.statusBar.showMessage('No valid diagram to export');
      return;
    }

    const defaultName = (tab.title || 'diagram').replace(/\.(mmd|mermaid)$/i, '') + '.svg';
    const result = await window.api.exportSvgFile(svg, defaultName);
    if (result && result.success) {
      api.statusBar.showMessage(`Exported: ${result.filePath}`);
    }
  }

  function newDiagram() {
    const title = `Diagram ${diagramCounter++}.mmd`;
    const tabId = api.tabs.create(title);
    const defaultContent = `graph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Action 1]\n    B -->|No| D[Action 2]\n    C --> E[End]\n    D --> E`;
    api.editor.createForTab(tabId, defaultContent, title);
    const tab = api.tabs.getTab(tabId);
    tab.isDiagram = true;
    tab.diagramMode = 'diagram';
    api.tabs.activate(tabId);
  }

  api.registerCommand({
    id: 'diagram.toggleSplit',
    title: 'Toggle Split/Full Editor View',
    handler: toggleDiagramSplit,
    when: () => {
      const tab = api.tabs.getActive();
      return tab && tab.isDiagram;
    },
  });

  api.registerCommand({
    id: 'diagram.exportSvg',
    title: 'Export Diagram as SVG',
    handler: exportDiagramSvg,
    when: () => {
      const tab = api.tabs.getActive();
      return tab && tab.isDiagram;
    },
  });

  api.registerCommand({
    id: 'diagram.new',
    title: 'New Diagram',
    handler: newDiagram,
  });

  return {
    toggleDiagramSplit,
    exportDiagramSvg,
    newDiagram,
    isDiagramFile,
    updateToolbar,
    getViewer,
    deactivate() {
      if (diagramViewer) {
        diagramViewer.destroy();
        diagramViewer = null;
      }
    },
  };
}
