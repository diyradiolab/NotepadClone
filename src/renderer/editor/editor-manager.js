import { createEditor, detectLanguage, getLanguageDisplayName, monaco } from './monaco-setup';

/**
 * Manages multiple Monaco editor instances, one per tab.
 * Only the active tab's editor is visible; others have their state preserved.
 */
export class EditorManager {
  constructor(container) {
    this.container = container;
    this.editors = new Map(); // tabId → { editor, model, viewState }
    this.activeTabId = null;
    this.onChangeCallbacks = [];
    this.onCursorCallbacks = [];
    this.columnSelectionMode = false;
  }

  createEditorForTab(tabId, content = '', filename = '') {
    const language = detectLanguage(filename);
    const model = monaco.editor.createModel(content, language);

    // Lazy: only create the visual editor when this tab is activated
    this.editors.set(tabId, {
      editor: null,
      model,
      viewState: null,
      language,
      filename,
    });

    return { language, displayName: getLanguageDisplayName(language) };
  }

  activateTab(tabId) {
    // Save current editor state
    if (this.activeTabId && this.editors.has(this.activeTabId)) {
      const current = this.editors.get(this.activeTabId);
      if (current.editor) {
        current.viewState = current.editor.saveViewState();
        current.editor.dispose();
        current.editor = null;
      }
    }

    // Clear the container
    this.container.innerHTML = '';

    const entry = this.editors.get(tabId);
    if (!entry) return;

    // Create editor for the new active tab
    const editor = createEditor(this.container, {
      model: entry.model,
    });

    if (entry.viewState) {
      editor.restoreViewState(entry.viewState);
    }

    entry.editor = editor;
    this.activeTabId = tabId;

    // Wire up change listeners
    entry.model.onDidChangeContent(() => {
      this.onChangeCallbacks.forEach(cb => cb(tabId));
    });

    editor.onDidChangeCursorPosition((e) => {
      const position = e.position;
      const selection = editor.getSelection();
      this.onCursorCallbacks.forEach(cb => cb(tabId, position, selection));
    });

    editor.focus();
  }

  getContent(tabId) {
    const entry = this.editors.get(tabId);
    return entry ? entry.model.getValue() : '';
  }

  setContent(tabId, content) {
    const entry = this.editors.get(tabId);
    if (entry) {
      entry.model.setValue(content);
    }
  }

  getLanguageInfo(tabId) {
    const entry = this.editors.get(tabId);
    if (!entry) return { language: 'plaintext', displayName: 'Plain Text' };
    return {
      language: entry.language,
      displayName: getLanguageDisplayName(entry.language),
    };
  }

  closeTab(tabId) {
    const entry = this.editors.get(tabId);
    if (!entry) return;
    if (entry.editor) {
      entry.editor.dispose();
    }
    entry.model.dispose();
    this.editors.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  getActiveEditor() {
    if (!this.activeTabId) return null;
    const entry = this.editors.get(this.activeTabId);
    return entry ? entry.editor : null;
  }

  onChange(callback) {
    this.onChangeCallbacks.push(callback);
  }

  onCursorChange(callback) {
    this.onCursorCallbacks.push(callback);
  }

  toggleWordWrap() {
    const editor = this.getActiveEditor();
    if (!editor) return;
    const current = editor.getOption(monaco.editor.EditorOption.wordWrap);
    editor.updateOptions({ wordWrap: current === 'off' ? 'on' : 'off' });
  }

  undo() {
    const editor = this.getActiveEditor();
    if (editor) editor.trigger('keyboard', 'undo', null);
  }

  redo() {
    const editor = this.getActiveEditor();
    if (editor) editor.trigger('keyboard', 'redo', null);
  }

  find() {
    const editor = this.getActiveEditor();
    if (editor) editor.trigger('keyboard', 'actions.find', null);
  }

  replace() {
    const editor = this.getActiveEditor();
    if (editor) editor.trigger('keyboard', 'editor.action.startFindReplaceAction', null);
  }

  zoomIn() {
    const editor = this.getActiveEditor();
    if (editor) editor.trigger('keyboard', 'editor.action.fontZoomIn', null);
  }

  zoomOut() {
    const editor = this.getActiveEditor();
    if (editor) editor.trigger('keyboard', 'editor.action.fontZoomOut', null);
  }

  resetZoom() {
    const editor = this.getActiveEditor();
    if (editor) editor.trigger('keyboard', 'editor.action.fontZoomReset', null);
  }

  toggleColumnSelection() {
    this.columnSelectionMode = !this.columnSelectionMode;
    const editor = this.getActiveEditor();
    if (editor) {
      editor.updateOptions({ columnSelection: this.columnSelectionMode });
    }
    return this.columnSelectionMode;
  }

  revealLine(tabId, lineNumber) {
    if (this.activeTabId !== tabId) {
      this.activateTab(tabId);
    }
    const editor = this.getActiveEditor();
    if (editor) {
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: 1 });
      editor.focus();
    }
  }
}
