import '../../src/renderer/styles/markdown-preview.css';
import { MarkdownPreview } from '../../src/renderer/components/markdown-preview';

// SVG icons
const MD_ICON_EYE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>';
const MD_ICON_PENCIL = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 1.5l3 3L5 14H2v-3L11.5 1.5z"/></svg>';

export function activate(api) {
  let markdownPreview = null;

  function getPreview() {
    if (!markdownPreview) {
      markdownPreview = new MarkdownPreview(api.editor.container);
    }
    return markdownPreview;
  }

  // ── File type detection ──
  function isMarkdownFile(filename) {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    return lower.endsWith('.md') || lower.endsWith('.markdown');
  }

  // ── Viewer registration ──
  api.registerViewer({
    id: 'markdown-read',
    displayName: 'Markdown Preview',

    canHandle(tab) {
      return tab.isMarkdown === true;
    },

    isDefault(tab) {
      return tab.isMarkdown && tab.markdownMode === 'read';
    },

    activate(container, tab, entry) {
      const preview = getPreview();
      container.innerHTML = '';
      const content = entry.model.getValue();
      preview.render(content, tab.filePath);
      api.statusBar.updateLanguage('Markdown (Read)');
    },

    deactivate() {
      const preview = getPreview();
      preview.destroy();
    },

    destroy() {
      const preview = getPreview();
      preview.destroy();
    },

    updateToolbar(isActive, tab) {
      const btn = document.getElementById('btn-markdown-toggle');
      const sep = document.getElementById('md-separator');
      const icon = document.getElementById('md-toggle-icon');
      const formatBar = document.getElementById('markdown-format-toolbar');
      if (!btn) return;

      if (!tab || !tab.isMarkdown) {
        btn.style.display = 'none';
        sep.style.display = 'none';
        formatBar.style.display = 'none';
        return;
      }

      btn.style.display = '';
      sep.style.display = '';
      if (tab.markdownMode === 'read') {
        icon.innerHTML = MD_ICON_PENCIL;
        btn.title = 'Switch to Edit Mode (Ctrl+Shift+M)';
        formatBar.style.display = 'none';
      } else {
        icon.innerHTML = MD_ICON_EYE;
        btn.title = 'Switch to Read Mode (Ctrl+Shift+M)';
        formatBar.style.display = '';
      }
    },
  });

  // ── Toggle command ──
  function toggleMarkdownMode() {
    const tabId = api.tabs.getActiveId();
    const tab = api.tabs.getTab(tabId);
    if (!tab || !tab.isMarkdown) return;

    const entry = api.editor.getEditorEntry(tabId);

    if (tab.markdownMode === 'read') {
      tab.markdownMode = 'edit';
      getPreview().destroy();
      api.editor.activateTab(tabId);
      api.statusBar.updateLanguage('Markdown (Edit)');
    } else {
      const editor = api.editor.getActiveEditor();
      if (editor && entry) {
        entry.viewState = editor.saveViewState();
        editor.dispose();
        entry.editor = null;
      }
      tab.markdownMode = 'read';
      api.editor.container.innerHTML = '';
      const content = entry.model.getValue();
      getPreview().render(content, tab.filePath);
      api.statusBar.updateLanguage('Markdown (Read)');
    }
    api.events.emit('markdown:modeChanged', { tabId, mode: tab.markdownMode });
  }

  api.registerCommand({
    id: 'markdown.toggleMode',
    title: 'Toggle Markdown Read/Edit Mode',
    shortcut: 'Ctrl+Shift+M',
    handler: toggleMarkdownMode,
    when: () => {
      const tab = api.tabs.getActive();
      return tab && tab.isMarkdown;
    },
  });

  // ── Expose for index.js to call directly during transition ──
  return {
    toggleMarkdownMode,
    isMarkdownFile,
    getPreview,
    deactivate() {
      if (markdownPreview) {
        markdownPreview.destroy();
        markdownPreview = null;
      }
    },
  };
}
