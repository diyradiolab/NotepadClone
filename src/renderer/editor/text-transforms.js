// ── Text Transforms ──
// Pure string functions for text manipulation, triggered via Edit menu.

function titleCase(s) {
  return s.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function camelCase(s) {
  return s
    .replace(/[^a-zA-Z0-9]+(.)/g, (_m, ch) => ch.toUpperCase())
    .replace(/^[A-Z]/, ch => ch.toLowerCase());
}

function snakeCase(s) {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s\-]+/g, '_')
    .toLowerCase();
}

function kebabCase(s) {
  return s
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function sortLines(s, mode) {
  const lines = s.split('\n');
  if (mode === 'asc') {
    lines.sort((a, b) => a.localeCompare(b));
  } else if (mode === 'desc') {
    lines.sort((a, b) => b.localeCompare(a));
  } else if (mode === 'numeric') {
    lines.sort((a, b) => {
      const na = parseFloat(a) || 0;
      const nb = parseFloat(b) || 0;
      return na - nb;
    });
  }
  return lines.join('\n');
}

function removeDuplicateLines(s) {
  const seen = new Set();
  return s.split('\n').filter(line => {
    if (seen.has(line)) return false;
    seen.add(line);
    return true;
  }).join('\n');
}

function removeEmptyLines(s) {
  return s.split('\n').filter(line => line.trim() !== '').join('\n');
}

function trimTrailingWhitespace(s) {
  return s.split('\n').map(line => line.replace(/\s+$/, '')).join('\n');
}

function joinLines(s) {
  return s.split('\n').join(' ');
}

function reverseLines(s) {
  return s.split('\n').reverse().join('\n');
}

export const TRANSFORMS = {
  'uppercase':          s => s.toUpperCase(),
  'lowercase':          s => s.toLowerCase(),
  'title-case':         s => titleCase(s),
  'camel-case':         s => camelCase(s),
  'snake-case':         s => snakeCase(s),
  'kebab-case':         s => kebabCase(s),
  'sort-asc':           s => sortLines(s, 'asc'),
  'sort-desc':          s => sortLines(s, 'desc'),
  'sort-numeric':       s => sortLines(s, 'numeric'),
  'remove-duplicates':  s => removeDuplicateLines(s),
  'remove-empty-lines': s => removeEmptyLines(s),
  'trim-trailing':      s => trimTrailingWhitespace(s),
  'join-lines':         s => joinLines(s),
  'reverse-lines':      s => reverseLines(s),
  'base64-encode':      s => btoa(unescape(encodeURIComponent(s))),
  'base64-decode':      s => decodeURIComponent(escape(atob(s))),
  'url-encode':         s => encodeURIComponent(s),
  'url-decode':         s => decodeURIComponent(s),
  'json-escape':        s => JSON.stringify(s).slice(1, -1),
  'json-unescape':      s => JSON.parse('"' + s + '"'),
};

/**
 * Apply a named transform to the current selection (or entire file if no selection).
 * Uses editor.executeEdits so Ctrl+Z undoes the transform.
 */
export function applyTransform(editor, type, statusBar) {
  const fn = TRANSFORMS[type];
  if (!fn) return;

  const model = editor.getModel();
  if (!model) return;

  const selection = editor.getSelection();
  const hasSelection = selection && !selection.isEmpty();
  const range = hasSelection ? selection : model.getFullModelRange();
  const text = model.getValueInRange(range);

  let result;
  try {
    result = fn(text);
  } catch (err) {
    if (statusBar) statusBar.showMessage(`Transform error: ${err.message}`);
    return;
  }

  if (result === text) return; // no change

  editor.executeEdits('text-transform', [{ range, text: result }]);
  editor.focus();
}
