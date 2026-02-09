import '../../src/renderer/styles/notes-panel.css';
import { NotesPanel } from '../../src/renderer/components/notes-panel';

export function activate(api) {
  const container = document.getElementById('notes-panel');
  const notesPanel = new NotesPanel(container);

  api.registerCommand({
    id: 'notes.toggle',
    title: 'Toggle Notes Panel',
    shortcut: 'Ctrl+Shift+N',
    handler: () => notesPanel.toggle(),
  });

  // Flush on window close
  window.addEventListener('beforeunload', () => {
    notesPanel.flushSave();
  });

  return {
    getPanel: () => notesPanel,
    deactivate() {
      notesPanel.flushSave();
    },
  };
}
