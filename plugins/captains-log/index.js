import '../../src/renderer/styles/captains-log-panel.css';
import { CaptainsLogPanel } from '../../src/renderer/components/captains-log-panel';

export function activate(api) {
  const container = document.getElementById('captains-log-panel');
  const panel = new CaptainsLogPanel(container);

  // Coordinate with Notes panel — only one visible at a time
  const notesExports = api._services.pluginHost._plugins.get('notepadclone-notes');
  const getNotesPanel = () => {
    if (notesExports && notesExports.active && notesExports._exports) {
      return notesExports._exports.getPanel();
    }
    return null;
  };

  panel.onBeforeShow = () => {
    const notesPanel = getNotesPanel();
    if (notesPanel && notesPanel.isVisible()) {
      notesPanel.flushSave();
      notesPanel.hide();
    }
  };

  api.registerCommand({
    id: 'captainsLog.toggle',
    title: "Toggle Captain's Log",
    shortcut: 'Ctrl+Shift+L',
    handler: () => panel.toggle(),
  });

  // Flush on window close
  window.addEventListener('beforeunload', () => {
    panel.flushSave();
  });

  return {
    getPanel: () => panel,
    deactivate() {
      panel.flushSave();
    },
  };
}
