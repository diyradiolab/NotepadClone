import '../../src/renderer/styles/snippets-dialog.css';
import { SnippetsDialog } from '../../src/renderer/components/snippets-dialog';
import { detectLanguage } from '../../src/renderer/editor/monaco-setup';

export function activate(api) {
  const dialog = new SnippetsDialog();

  dialog.onInsert((text) => {
    const editor = api.editor.getActiveEditor();
    if (!editor) return;
    const selection = editor.getSelection();
    editor.executeEdits('snippets', [{ range: selection, text }]);
    editor.focus();
  });

  api.registerCommand({
    id: 'snippets.show',
    title: 'Code Snippets',
    handler: () => dialog.show(),
  });

  api.registerCommand({
    id: 'snippets.saveSelection',
    title: 'Save Selection as Snippet',
    handler: () => {
      const editor = api.editor.getActiveEditor();
      if (!editor) return;
      const selection = editor.getSelection();
      const text = editor.getModel().getValueInRange(selection);
      if (!text) return;

      // Auto-detect language from current file
      const tabManager = api._services.tabManager;
      const activeTabId = tabManager.getActiveTabId();
      const tab = tabManager.getTab(activeTabId);
      const filename = tab ? tab.filePath || tab.title : '';
      const monacoLang = detectLanguage(filename);
      const langMap = {
        sql: 'SQL', powershell: 'PowerShell', csharp: 'C#', javascript: 'JavaScript',
        typescript: 'TypeScript', python: 'Python', html: 'HTML', css: 'CSS',
        json: 'JSON', xml: 'XML', yaml: 'YAML', shell: 'Shell', bat: 'Batch',
        ruby: 'Ruby', go: 'Go', rust: 'Rust', java: 'Java', c: 'C', cpp: 'C++',
        php: 'PHP', markdown: 'Markdown', plaintext: 'Plain Text',
      };
      const detectedLang = langMap[monacoLang] || 'Plain Text';

      dialog.show({ prefillCode: text, prefillLanguage: detectedLang });
    },
  });

  return {
    getDialog: () => dialog,
    deactivate() {},
  };
}
