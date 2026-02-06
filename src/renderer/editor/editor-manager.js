import { createEditor, createDiffEditor, detectLanguage, getLanguageDisplayName, monaco } from './monaco-setup';

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
    this.onClipboardCopyCallbacks = [];
    this.onShowClipboardHistoryCallbacks = [];
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

  createDiffTab(tabId, originalContent, modifiedContent, originalName, modifiedName) {
    const origLang = detectLanguage(originalName);
    const modLang = detectLanguage(modifiedName);
    const originalModel = monaco.editor.createModel(originalContent, origLang);
    const modifiedModel = monaco.editor.createModel(modifiedContent, modLang);

    this.editors.set(tabId, {
      isDiffTab: true,
      originalModel,
      modifiedModel,
      diffEditor: null,
      language: 'diff',
      filename: `${originalName} ↔ ${modifiedName}`,
    });
  }

  activateTab(tabId) {
    // Save current editor state
    if (this.activeTabId && this.editors.has(this.activeTabId)) {
      const current = this.editors.get(this.activeTabId);
      if (current.isHistoryTab) {
        // Nothing to dispose — history panel manages its own diff editors
      } else if (current.isDiffTab) {
        if (current.diffEditor) {
          current.diffEditor.dispose();
          current.diffEditor = null;
        }
      } else if (current.editor) {
        current.viewState = current.editor.saveViewState();
        current.editor.dispose();
        current.editor = null;
      }
    }

    // Clear the container
    this.container.innerHTML = '';

    const entry = this.editors.get(tabId);
    if (!entry) return;

    this.activeTabId = tabId;

    // History tab: handled externally by GitHistoryPanel
    if (entry.isHistoryTab) return;

    // Branch: diff tab vs regular tab
    if (entry.isDiffTab) {
      const diffEditor = createDiffEditor(this.container);
      diffEditor.setModel({
        original: entry.originalModel,
        modified: entry.modifiedModel,
      });
      entry.diffEditor = diffEditor;
      return;
    }

    // Create editor for the new active tab
    const editor = createEditor(this.container, {
      model: entry.model,
    });

    if (entry.viewState) {
      editor.restoreViewState(entry.viewState);
    }

    entry.editor = editor;

    // Dispose previous model content listener to prevent accumulation
    if (entry.contentDisposable) {
      entry.contentDisposable.dispose();
    }
    entry.contentDisposable = entry.model.onDidChangeContent(() => {
      this.onChangeCallbacks.forEach(cb => cb(tabId));
    });

    editor.onDidChangeCursorPosition((e) => {
      const position = e.position;
      const selection = editor.getSelection();
      this.onCursorCallbacks.forEach(cb => cb(tabId, position, selection));
    });

    this._registerClipboardActions(editor, tabId);

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

    if (entry.isDiffTab) {
      if (entry.diffEditor) entry.diffEditor.dispose();
      entry.originalModel.dispose();
      entry.modifiedModel.dispose();
    } else {
      if (entry.contentDisposable) entry.contentDisposable.dispose();
      if (entry.editor) entry.editor.dispose();
      entry.model.dispose();
    }

    this.editors.delete(tabId);
    if (this.activeTabId === tabId) {
      this.activeTabId = null;
    }
  }

  getActiveEditor() {
    if (!this.activeTabId) return null;
    const entry = this.editors.get(this.activeTabId);
    if (!entry) return null;
    if (entry.isDiffTab) {
      return entry.diffEditor ? entry.diffEditor.getModifiedEditor() : null;
    }
    return entry.editor;
  }

  onChange(callback) {
    this.onChangeCallbacks.push(callback);
  }

  onCursorChange(callback) {
    this.onCursorCallbacks.push(callback);
  }

  onClipboardCopy(callback) {
    this.onClipboardCopyCallbacks.push(callback);
  }

  onShowClipboardHistory(callback) {
    this.onShowClipboardHistoryCallbacks.push(callback);
  }

  _registerClipboardActions(editor, tabId) {
    // Override Ctrl/Cmd+C — copy text and notify clipboard ring
    editor.addAction({
      id: 'clipboard-ring-copy',
      label: 'Copy to Clipboard Ring',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
      run: (ed) => {
        const selection = ed.getSelection();
        let text = ed.getModel().getValueInRange(selection);
        if (!text) {
          // No selection — copy entire line (Monaco default behavior)
          const lineNumber = ed.getPosition().lineNumber;
          text = ed.getModel().getLineContent(lineNumber);
        }
        // Trigger native copy
        ed.trigger('keyboard', 'editor.action.clipboardCopyAction', null);
        if (text) {
          this.onClipboardCopyCallbacks.forEach(cb => cb(text, tabId));
        }
      },
    });

    // Override Ctrl/Cmd+X — cut text and notify clipboard ring
    editor.addAction({
      id: 'clipboard-ring-cut',
      label: 'Cut to Clipboard Ring',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
      run: (ed) => {
        const selection = ed.getSelection();
        let text = ed.getModel().getValueInRange(selection);
        if (!text) {
          const lineNumber = ed.getPosition().lineNumber;
          text = ed.getModel().getLineContent(lineNumber);
        }
        ed.trigger('keyboard', 'editor.action.clipboardCutAction', null);
        if (text) {
          this.onClipboardCopyCallbacks.forEach(cb => cb(text, tabId));
        }
      },
    });

    // Ctrl/Cmd+Shift+V — open clipboard history
    editor.addAction({
      id: 'clipboard-ring-show',
      label: 'Show Clipboard History',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyV],
      run: () => {
        this.onShowClipboardHistoryCallbacks.forEach(cb => cb());
      },
    });
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
