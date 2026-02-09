import '../../src/renderer/styles/recent-files-dialog.css';
import { RecentFilesDialog } from '../../src/renderer/components/recent-files-dialog';

export function activate(api) {
  const dialog = new RecentFilesDialog();

  dialog.onFileOpen((filePath) => {
    api.events.emit('file:openByPath', { filePath });
  });

  api.registerCommand({
    id: 'recentFiles.show',
    title: 'Show Recent Files',
    handler: () => dialog.show(),
  });

  return {
    getDialog: () => dialog,
    deactivate() {},
  };
}
