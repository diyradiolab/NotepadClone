/**
 * Factory that creates scoped API objects for each plugin.
 * Each plugin gets its own API instance with registration methods and services.
 */
export function createPluginAPI(pluginId, services) {
  const {
    eventBus,
    commandRegistry,
    viewerRegistry,
    toolbarManager,
    tabManager,
    editorManager,
    statusBar,
  } = services;

  // Track registrations for cleanup on deactivate
  const registeredCommands = [];
  const registeredViewers = [];
  const registeredToolbarButtons = [];
  const eventSubscriptions = [];

  return {
    pluginId,

    // ── Registration Methods (contribution points) ──

    registerViewer(viewer) {
      viewerRegistry.register(viewer);
      registeredViewers.push(viewer.id);
    },

    registerCommand({ id, title, shortcut, handler, when }) {
      const fullId = id.includes('.') ? id : `${pluginId}.${id}`;
      commandRegistry.register(fullId, { title, handler, shortcut, when });
      registeredCommands.push(fullId);
    },

    registerToolbarButton(button) {
      toolbarManager.register(button);
      registeredToolbarButtons.push(button.id);
    },

    // ── Services ──

    tabs: {
      getActive() {
        const id = tabManager.getActiveTabId();
        return id ? { id, ...tabManager.getTab(id) } : null;
      },
      getActiveId() {
        return tabManager.getActiveTabId();
      },
      getAll() {
        return tabManager.getAllTabs();
      },
      getTab(tabId) {
        return tabManager.getTab(tabId);
      },
      create(title, filePath, encoding) {
        return tabManager.createTab(title, filePath, encoding);
      },
      activate(tabId) {
        tabManager.activate(tabId);
      },
      setDirty(tabId, dirty) {
        tabManager.setDirty(tabId, dirty);
      },
      setTitle(tabId, title) {
        tabManager.setTitle(tabId, title);
      },
      setFilePath(tabId, filePath) {
        tabManager.setFilePath(tabId, filePath);
      },
      close(tabId) {
        return tabManager.closeTab(tabId);
      },
      findByPath(filePath) {
        return tabManager.findTabByPath(filePath);
      },
      getCount() {
        return tabManager.getTabCount();
      },
    },

    editor: {
      getContent(tabId) {
        return editorManager.getContent(tabId);
      },
      setContent(tabId, content) {
        editorManager.setContent(tabId, content);
      },
      getActiveEditor() {
        return editorManager.getActiveEditor();
      },
      getEditorEntry(tabId) {
        return editorManager.editors.get(tabId);
      },
      createForTab(tabId, content, filename) {
        return editorManager.createEditorForTab(tabId, content, filename);
      },
      activateTab(tabId) {
        editorManager.activateTab(tabId);
      },
      revealLine(tabId, lineNumber) {
        editorManager.revealLine(tabId, lineNumber);
      },
      getLanguageInfo(tabId) {
        return editorManager.getLanguageInfo(tabId);
      },
      get container() {
        return editorManager.container;
      },
      get activeTabId() {
        return editorManager.activeTabId;
      },
      set activeTabId(val) {
        editorManager.activeTabId = val;
      },
    },

    statusBar: {
      updateLanguage(lang) {
        statusBar.updateLanguage(lang);
      },
      showMessage(msg, duration) {
        statusBar.showMessage(msg, duration);
      },
      updateEncoding(enc) {
        statusBar.updateEncoding(enc);
      },
      updateLineEnding(ending) {
        statusBar.updateLineEnding(ending);
      },
      updatePosition(line, col) {
        statusBar.updatePosition(line, col);
      },
      updateGit(branch, count) {
        statusBar.updateGit(branch, count);
      },
      clearGit() {
        statusBar.clearGit();
      },
    },

    events: {
      on(event, handler) {
        const unsub = eventBus.on(event, handler);
        eventSubscriptions.push(unsub);
        return unsub;
      },
      once(event, handler) {
        return eventBus.once(event, handler);
      },
      emit(event, data) {
        eventBus.emit(event, data);
      },
    },

    commands: {
      execute(id) {
        return commandRegistry.execute(id);
      },
      has(id) {
        return commandRegistry.has(id);
      },
    },

    ui: {
      get editorContainer() {
        return editorManager.container;
      },
    },

    ipc: {
      invoke(channel, ...args) {
        return window.api[channel] ? window.api[channel](...args) : Promise.reject(new Error(`Unknown IPC: ${channel}`));
      },
    },

    // Raw services access for built-in plugins that need direct component references
    _services: services,

    // ── Cleanup ──

    _dispose() {
      for (const id of registeredCommands) {
        commandRegistry.unregister(id);
      }
      for (const id of registeredViewers) {
        viewerRegistry.unregister(id);
      }
      for (const id of registeredToolbarButtons) {
        toolbarManager.unregister(id);
      }
      for (const unsub of eventSubscriptions) {
        unsub();
      }
      registeredCommands.length = 0;
      registeredViewers.length = 0;
      registeredToolbarButtons.length = 0;
      eventSubscriptions.length = 0;
    },
  };
}
