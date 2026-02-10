import '../../src/renderer/styles/captains-log-panel.css';
import { CaptainsLogPanel } from '../../src/renderer/components/captains-log-panel';

export function activate(api) {
  // Register configurable panel title
  api.registerSettings({
    category: 'general',
    label: "Captain's Log",
    settings: {
      panelTitle: { type: 'string', default: "Captain's Log", label: 'Panel Title' },
    },
  });

  const settingsKey = `plugin.notepadclone-captains-log.general.panelTitle`;
  const initialTitle = (api.settings && api.settings.get(settingsKey)) || "Captain's Log";

  const container = document.getElementById('captains-log-panel');
  const panel = new CaptainsLogPanel(container, initialTitle);

  // Update panel header live when the setting changes
  if (api.settings) {
    api.settings.onChange(settingsKey, (value) => {
      panel.setTitle(value || "Captain's Log");
    });
  }

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
