import '../../src/renderer/styles/file-explorer.css';
import { FileExplorer } from '../../src/renderer/components/file-explorer';

export function activate(api) {
  const container = document.getElementById('file-explorer');
  const fileExplorer = new FileExplorer(container);

  let currentFolderPath = null;

  fileExplorer.onFileOpen((filePath) => {
    api.events.emit('file:openByPath', { filePath });
  });

  fileExplorer.onFileHistory((filePath) => {
    api.events.emit('git:showFileHistory', { filePath });
  });

  api.registerCommand({
    id: 'fileExplorer.toggle',
    title: 'Toggle File Explorer',
    handler: () => fileExplorer.toggle(),
  });

  api.registerCommand({
    id: 'fileExplorer.openFolder',
    title: 'Open Folder',
    handler: async () => {
      fileExplorer.show();
      await fileExplorer.openFolder();
      currentFolderPath = fileExplorer.rootPath;
      api.events.emit('folder:opened', { path: currentFolderPath });
    },
  });

  return {
    getExplorer: () => fileExplorer,
    getCurrentFolder: () => currentFolderPath,
    setCurrentFolder: (path) => { currentFolderPath = path; },
    deactivate() {},
  };
}
