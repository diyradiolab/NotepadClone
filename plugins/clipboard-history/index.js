import '../../src/renderer/styles/clipboard-history-dialog.css';
import { ClipboardHistoryDialog } from '../../src/renderer/components/clipboard-history-dialog';

export function activate(api) {
  const dialog = new ClipboardHistoryDialog();

  dialog.onPaste((text) => {
    const editor = api.editor.getActiveEditor();
    if (!editor) return;
    const selection = editor.getSelection();
    editor.executeEdits('clipboard-ring', [{ range: selection, text }]);
    editor.focus();
  });

  api.registerCommand({
    id: 'clipboardHistory.show',
    title: 'Show Clipboard History',
    handler: () => dialog.show(),
  });

  return {
    getDialog: () => dialog,
    deactivate() {},
  };
}
