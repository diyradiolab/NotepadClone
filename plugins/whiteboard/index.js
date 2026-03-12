import '../../src/renderer/styles/whiteboard.css';
import { WhiteboardPanel } from '../../src/renderer/components/whiteboard-panel';

let tabCounter = 1;

export function activate(api) {
  const panels = new Map(); // tabId → WhiteboardPanel
  let lastActiveTabId = null;

  function exportSvg() {
    if (!lastActiveTabId || !panels.has(lastActiveTabId)) return;
    const panel = panels.get(lastActiveTabId);
    const svg = panel.exportSvg();
    if (svg && window.api.exportSvgFile) {
      const tab = api.tabs.getTab(lastActiveTabId);
      const defaultName = (tab?.title || 'whiteboard').replace(/\.whiteboard$/, '') + '.svg';
      window.api.exportSvgFile(svg, defaultName);
    }
  }

  function getOrCreatePanel(tabId) {
    if (!panels.has(tabId)) {
      const editorWrapper = api.editor.container.parentElement;
      const panel = new WhiteboardPanel(editorWrapper, () => {
        api.tabs.setDirty(tabId, true);
      });

      // Debounced sync: write canvas JSON back to Monaco model
      panel.onSync((json) => {
        const entry = api.editor.editors.get(tabId);
        if (entry && entry.model) {
          entry.model.setValue(json);
        }
      });

      // Zoom change → status bar
      panel.onZoomChange((pct) => {
        api.statusBar.updateLanguage(`Whiteboard (${pct}%)`);
      });

      // SVG export from toolbar button
      panel.onExportSvg(() => exportSvg());

      editorWrapper.appendChild(panel.getElement());
      panels.set(tabId, panel);
    }
    return panels.get(tabId);
  }

  api.registerViewer({
    id: 'whiteboard-view',
    displayName: 'Whiteboard',

    canHandle(tab) {
      return tab.isWhiteboard === true;
    },

    isDefault(tab) {
      return tab.isWhiteboard === true;
    },

    activate(container, tab, entry, tabId) {
      lastActiveTabId = tabId;
      const panel = getOrCreatePanel(tabId);
      api.editor.activeTabId = tabId;
      container.style.display = 'none';

      // Load from model if this is the first activation with content
      if (entry && entry.model) {
        const content = entry.model.getValue();
        if (content && content.trim() && content !== '{}') {
          panel.loadFromJSON(content);
        }
      }

      // Apply current theme
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      panel.setTheme(isDark);

      // Hide all other panels, show this one
      for (const [id, p] of panels) {
        if (id === tabId) p.show();
        else p.hide();
      }

      const zoom = panel.getZoom();
      api.statusBar.updateLanguage(`Whiteboard (${zoom}%)`);
    },

    deactivate() {
      // Flush active panel's state to model before hiding
      if (lastActiveTabId && panels.has(lastActiveTabId)) {
        const panel = panels.get(lastActiveTabId);
        panel.flushSync();
      }

      api.editor.container.style.display = '';
      for (const panel of panels.values()) {
        panel.hide();
      }
    },

    destroy() {
      // Use tracked tabId, not getActiveId() which may be wrong for background closes
      const tabId = lastActiveTabId;
      const panel = panels.get(tabId);
      if (panel) {
        panel.flushSync();
        panel.dispose();
        panels.delete(tabId);
      }
      api.editor.container.style.display = '';
    },

    updateToolbar(isActive) {
      // Show/hide whiteboard-specific toolbar buttons
      const svgBtn = document.getElementById('btn-whiteboard-export-svg');
      if (svgBtn) svgBtn.style.display = isActive ? '' : 'none';
    },
  });

  // ── "New Whiteboard" command ──

  function newWhiteboard() {
    const title = `Whiteboard ${tabCounter++}.whiteboard`;
    const tabId = api.tabs.create(title);
    api.editor.createForTab(tabId, '', title);
    const tab = api.tabs.getTab(tabId);
    tab.isWhiteboard = true;
    tab.viewerMode = 'whiteboard-view';
    api.tabs.activate(tabId);
  }

  api.registerCommand({
    id: 'whiteboard.new',
    title: 'New Whiteboard',
    handler: newWhiteboard,
  });

  // ── SVG Export command ──

  api.registerCommand({
    id: 'whiteboard.exportSvg',
    title: 'Export Whiteboard as SVG',
    handler: () => exportSvg(),
  });

  // ── Listen for "New Whiteboard" from main menu ──

  if (window.api.onMenuNewWhiteboard) {
    window.api.onMenuNewWhiteboard(() => newWhiteboard());
  }

  // ── Pre-save hook: flush canvas state before Ctrl+S reads the model ──

  api.events.on('file:beforeSave', (tabId) => {
    const panel = panels.get(tabId);
    if (panel) panel.flushSync();
  });

  // ── Theme change listener ──

  const themeObserver = new MutationObserver(() => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    for (const panel of panels.values()) {
      panel.setTheme(isDark);
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  return {
    newWhiteboard,
    deactivate() {
      themeObserver.disconnect();
      for (const panel of panels.values()) {
        panel.dispose();
      }
      panels.clear();
    },
  };
}
