const MARKDOWN_ACTIONS = {
  bold:   { wrap: '**', placeholder: 'text' },
  italic: { wrap: '*',  placeholder: 'text' },
  code:   { wrap: '`',  placeholder: 'code' },
  h1:     { linePrefix: '# ',  placeholder: 'Heading' },
  h2:     { linePrefix: '## ', placeholder: 'Heading' },
  ul:     { linePrefix: '- ',  placeholder: 'Item' },
  ol:     { linePrefix: '1. ', placeholder: 'Item' },
  link:   { before: '[', after: '](url)', placeholder: 'text', cursorTarget: 'url' },
};

function wrapSelection(editor, selection, selectedText, wrap, placeholder) {
  const text = selectedText || placeholder;
  const newText = wrap + text + wrap;
  editor.executeEdits('markdown-format', [{
    range: selection,
    text: newText,
  }]);
  if (!selectedText) {
    const startCol = selection.startColumn + wrap.length;
    editor.setSelection({
      startLineNumber: selection.startLineNumber,
      startColumn: startCol,
      endLineNumber: selection.startLineNumber,
      endColumn: startCol + placeholder.length,
    });
  }
}

function prefixLines(editor, selection, selectedText, prefix, placeholder) {
  if (!selectedText) {
    editor.executeEdits('markdown-format', [{
      range: selection,
      text: prefix + placeholder,
    }]);
    return;
  }
  const lines = selectedText.split('\n');
  const prefixed = lines.map(line => prefix + line).join('\n');
  editor.executeEdits('markdown-format', [{
    range: selection,
    text: prefixed,
  }]);
}

function insertAround(editor, selection, selectedText, spec) {
  const text = selectedText || spec.placeholder;
  const newText = spec.before + text + spec.after;
  editor.executeEdits('markdown-format', [{
    range: selection,
    text: newText,
  }]);
  if (spec.cursorTarget) {
    const fullText = spec.before + text + spec.after;
    const targetStart = fullText.indexOf(spec.cursorTarget);
    if (targetStart >= 0) {
      const col = selection.startColumn + targetStart;
      editor.setSelection({
        startLineNumber: selection.startLineNumber,
        startColumn: col,
        endLineNumber: selection.startLineNumber,
        endColumn: col + spec.cursorTarget.length,
      });
    }
  }
}

export function formatMarkdown(action, editor) {
  const spec = MARKDOWN_ACTIONS[action];
  if (!spec || !editor) return;

  const selection = editor.getSelection();
  const selectedText = editor.getModel().getValueInRange(selection);

  if (spec.wrap) {
    wrapSelection(editor, selection, selectedText, spec.wrap, spec.placeholder);
  } else if (spec.linePrefix) {
    prefixLines(editor, selection, selectedText, spec.linePrefix, spec.placeholder);
  } else if (spec.before) {
    insertAround(editor, selection, selectedText, spec);
  }

  editor.focus();
}
