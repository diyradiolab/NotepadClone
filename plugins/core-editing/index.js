import { applyTransform } from '../../src/renderer/editor/text-transforms';
import { formatMarkdown } from '../../src/renderer/editor/markdown-format';

export function activate(api) {
  // ── Text Transforms ──
  // Registered as a single command that accepts the transform type
  api.registerCommand({
    id: 'core-editing.textTransform',
    title: 'Text Transform',
    handler: (type) => {
      const editor = api.editor.getActiveEditor();
      if (editor) applyTransform(editor, type, api.statusBar);
    },
  });

  // ── Markdown Formatting ──
  api.registerCommand({
    id: 'core-editing.markdownFormat',
    title: 'Markdown Format',
    handler: (action) => {
      const editor = api.editor.getActiveEditor();
      if (editor) formatMarkdown(action, editor);
    },
  });

  // ── Word Wrap ──
  api.registerCommand({
    id: 'core-editing.toggleWordWrap',
    title: 'Toggle Word Wrap',
    handler: () => {
      const editor = api.editor.getActiveEditor();
      if (!editor) return;
      const monaco = window.monaco || (require && require('monaco-editor'));
      const current = editor.getOption(monaco.editor.EditorOption.wordWrap);
      editor.updateOptions({ wordWrap: current === 'off' ? 'on' : 'off' });
    },
  });

  // ── Zoom ──
  api.registerCommand({
    id: 'core-editing.zoomIn',
    title: 'Zoom In',
    handler: () => {
      const editor = api.editor.getActiveEditor();
      if (editor) editor.trigger('keyboard', 'editor.action.fontZoomIn', null);
    },
  });

  api.registerCommand({
    id: 'core-editing.zoomOut',
    title: 'Zoom Out',
    handler: () => {
      const editor = api.editor.getActiveEditor();
      if (editor) editor.trigger('keyboard', 'editor.action.fontZoomOut', null);
    },
  });

  api.registerCommand({
    id: 'core-editing.resetZoom',
    title: 'Reset Zoom',
    handler: () => {
      const editor = api.editor.getActiveEditor();
      if (editor) editor.trigger('keyboard', 'editor.action.fontZoomReset', null);
    },
  });

  return {
    deactivate() {
      // cleanup handled by api._dispose()
    },
  };
}
