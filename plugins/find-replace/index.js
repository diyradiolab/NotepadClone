import '../../src/renderer/styles/find-in-files.css';
import { FindInFiles } from '../../src/renderer/components/find-in-files';

export function activate(api) {
  const { editorManager, tabManager } = api._services;
  const findInFiles = new FindInFiles(
    document.getElementById('find-in-files'), editorManager, tabManager
  );

  findInFiles.onResultClick((filePath, line) => {
    if (filePath === null) {
      const tabId = api.tabs.getActiveId();
      if (tabId) api.editor.revealLine(tabId, line);
    } else {
      api.events.emit('file:openByPath', { filePath, lineNumber: line });
    }
  });

  // Listen for folder changes to set search dir
  api.events.on('folder:opened', ({ path }) => {
    findInFiles.setSearchDir(path);
  });

  api.registerCommand({
    id: 'findReplace.find',
    title: 'Find in Document',
    handler: () => findInFiles.show('document'),
  });

  api.registerCommand({
    id: 'findReplace.findInFiles',
    title: 'Find in Files',
    handler: () => findInFiles.show('directory'),
  });

  return {
    getFindInFiles: () => findInFiles,
    deactivate() {},
  };
}
