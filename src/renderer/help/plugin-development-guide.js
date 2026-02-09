export const PLUGIN_DEVELOPMENT_GUIDE = `# Plugin Development Guide

NotepadClone has a built-in plugin system that lets you extend the editor with new commands, viewers, toolbar buttons, and panels. This guide covers everything you need to create your own plugin.

---

## Plugin Structure

Every plugin lives in its own directory under \`plugins/\` and needs two files:

\`\`\`
plugins/
  my-plugin/
    package.json    ← manifest (name, activation, contributions)
    index.js        ← entry point (activate function)
\`\`\`

---

## Package.json Manifest

The manifest declares your plugin's identity and what it contributes.

\`\`\`json
{
  "name": "notepadclone-my-plugin",
  "displayName": "My Plugin",
  "version": "1.0.0",
  "notepadclone": {
    "activationEvents": ["onCommand"],
    "contributes": {
      "commands": ["myPlugin.doSomething"],
      "viewers": ["my-viewer"],
      "toolbarButtons": ["my-button"],
      "fileTypes": ["markdown"]
    }
  }
}
\`\`\`

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| \`name\` | Yes | Unique plugin ID (convention: \`notepadclone-<name>\`) |
| \`displayName\` | Yes | Human-readable name shown in UI |
| \`version\` | Yes | Semver version string |
| \`notepadclone.activationEvents\` | Yes | When to activate: \`onStartup\`, \`onCommand\`, \`onFileType:<type>\` |
| \`notepadclone.contributes\` | No | What the plugin provides (commands, viewers, toolbarButtons, fileTypes) |

---

## Entry Point — activate(api)

Your \`index.js\` must export an \`activate\` function that receives the plugin API object.
Return an object with a \`deactivate()\` method for cleanup.

\`\`\`js
export function activate(api) {
  // Register commands, viewers, toolbar buttons...

  api.registerCommand({
    id: 'myPlugin.greet',
    title: 'Greet User',
    handler: () => {
      api.statusBar.showMessage('Hello from My Plugin!');
    },
  });

  return {
    // Optional: expose functions to other plugins
    getGreeting: () => 'Hello!',
    deactivate() {
      // Cleanup: remove DOM elements, close connections, etc.
      // Registered commands/viewers/buttons are auto-removed.
    },
  };
}
\`\`\`

The return value is stored as the plugin's exports — other plugins can access it via \`pluginHost._plugins.get('notepadclone-my-plugin')._exports\`.

---

## API Reference

The \`api\` object passed to \`activate()\` provides these methods and services:

### Registration Methods

#### api.registerCommand({ id, title, shortcut, handler, when })

Register a command that can be invoked by ID.

| Param | Type | Description |
|-------|------|-------------|
| \`id\` | string | Command ID (auto-prefixed with plugin ID if no dot) |
| \`title\` | string | Human-readable name |
| \`shortcut\` | string? | Keyboard shortcut, e.g. \`"Ctrl+Shift+M"\` |
| \`handler\` | function | Called when the command is executed |
| \`when\` | function? | Guard — command only runs if this returns true |

\`\`\`js
api.registerCommand({
  id: 'myPlugin.transform',
  title: 'Transform Selection',
  shortcut: 'Ctrl+Shift+T',
  handler: () => { /* ... */ },
  when: () => !!api.editor.getActiveEditor(),
});
\`\`\`

**Command ID namespacing:** If you pass \`id: 'doThing'\` (no dot), it becomes \`notepadclone-my-plugin.doThing\`. If you pass \`id: 'myPlugin.doThing'\`, it's used as-is.

#### api.registerViewer(viewer)

Register a custom tab viewer (for rendering non-text content).

\`\`\`js
api.registerViewer({
  id: 'my-viewer',
  displayName: 'My Viewer',
  canHandle(tab) { return tab.isMyType; },
  isDefault(tab) { return tab.isMyType; },
  activate(container, tab, entry, tabId) {
    container.innerHTML = '<div>Custom viewer content</div>';
  },
  deactivate() { /* cleanup DOM */ },
  destroy() { /* tab is closing */ },
  updateToolbar(isActive, tab) { /* show/hide toolbar buttons */ },
});
\`\`\`

| Method | Description |
|--------|-------------|
| \`canHandle(tab)\` | Return true if this viewer can display the tab |
| \`isDefault(tab)\` | Return true to be the default viewer for this tab |
| \`activate(container, tab, entry, tabId)\` | Render content into the container |
| \`deactivate()\` | Called when switching away from this viewer |
| \`destroy()\` | Called when the tab is closed |
| \`updateToolbar(isActive, tab)\` | Show/hide toolbar buttons based on state |

#### api.registerToolbarButton(button)

Register a button in the toolbar.

\`\`\`js
api.registerToolbarButton({
  id: 'my-button',
  icon: '🔧',
  title: 'My Action',
  section: 'tools',
  onClick: () => api.commands.execute('myPlugin.doThing'),
});
\`\`\`

### Services

#### api.tabs

| Method | Returns | Description |
|--------|---------|-------------|
| \`getActive()\` | object/null | Active tab with \`{ id, title, filePath, ... }\` |
| \`getActiveId()\` | string/null | Active tab ID |
| \`getAll()\` | Map | All tabs as \`Map<tabId, tab>\` |
| \`getTab(tabId)\` | object | Single tab by ID |
| \`create(title, filePath?, encoding?)\` | string | Create a new tab, returns tab ID |
| \`activate(tabId)\` | void | Switch to a tab |
| \`setDirty(tabId, dirty)\` | void | Mark tab as modified |
| \`setTitle(tabId, title)\` | void | Change tab title |
| \`setFilePath(tabId, path)\` | void | Set tab's file path |
| \`close(tabId)\` | void | Close a tab |
| \`findByPath(filePath)\` | string/null | Find tab ID by file path |
| \`getCount()\` | number | Number of open tabs |

#### api.editor

| Method | Returns | Description |
|--------|---------|-------------|
| \`getContent(tabId)\` | string | Get editor text content |
| \`setContent(tabId, content)\` | void | Replace editor content |
| \`getActiveEditor()\` | IStandaloneCodeEditor | Monaco editor instance |
| \`getEditorEntry(tabId)\` | object | Internal editor entry (model, viewState) |
| \`createForTab(tabId, content, filename)\` | object | Create Monaco model for a tab |
| \`activateTab(tabId)\` | void | Switch editor to a tab |
| \`revealLine(tabId, lineNumber)\` | void | Scroll to a line |
| \`getLanguageInfo(tabId)\` | object | Language detection info |
| \`container\` | HTMLElement | The editor DOM container |
| \`activeTabId\` | string | Currently active tab in editor |

#### api.statusBar

| Method | Description |
|--------|-------------|
| \`updateLanguage(lang)\` | Set the language indicator |
| \`showMessage(msg, duration?)\` | Show a temporary message |
| \`updateEncoding(enc)\` | Set the encoding indicator |
| \`updateLineEnding(ending)\` | Set the EOL indicator |
| \`updatePosition(line, col)\` | Set cursor position display |
| \`updateGit(branch, count)\` | Set git branch/changes |
| \`clearGit()\` | Hide git status |

#### api.events (EventBus)

| Method | Description |
|--------|-------------|
| \`on(event, handler)\` | Subscribe to an event (returns unsubscribe fn) |
| \`once(event, handler)\` | Subscribe once |
| \`emit(event, data)\` | Fire an event |

#### api.commands

| Method | Description |
|--------|-------------|
| \`execute(id, ...args)\` | Run a registered command by full ID |
| \`has(id)\` | Check if a command exists |

#### api.ui

| Property | Description |
|----------|-------------|
| \`editorContainer\` | The main editor DOM container element |

#### api.ipc

| Method | Description |
|--------|-------------|
| \`invoke(channel, ...args)\` | Call a \`window.api\` method by name |

#### api._services

Direct access to raw infrastructure objects — use when the scoped API is too limiting:

\`\`\`js
const { eventBus, commandRegistry, viewerRegistry, toolbarManager, tabManager, editorManager, statusBar } = api._services;
\`\`\`

---

## Event Bus Events

These events are emitted by core and built-in plugins. Subscribe with \`api.events.on()\`:

| Event | Data | Description |
|-------|------|-------------|
| \`file:openByPath\` | \`{ filePath, lineNumber }\` | Request to open a file |
| \`diff:create\` | \`{ diffTabId, otherContent, activeContent, otherTitle, activeTitle }\` | Create a diff tab |
| \`folder:opened\` | \`{ path }\` | A folder was opened in the explorer |
| \`help:open\` | \`{ title, content }\` | Open a help document as a Markdown tab |

---

## Example: Simple Command Plugin

A minimal plugin that adds an "Insert Date" command:

**plugins/insert-date/package.json**
\`\`\`json
{
  "name": "notepadclone-insert-date",
  "displayName": "Insert Date",
  "version": "1.0.0",
  "notepadclone": {
    "activationEvents": ["onStartup"],
    "contributes": {
      "commands": ["insertDate.now"]
    }
  }
}
\`\`\`

**plugins/insert-date/index.js**
\`\`\`js
export function activate(api) {
  api.registerCommand({
    id: 'insertDate.now',
    title: 'Insert Current Date',
    shortcut: 'Ctrl+Shift+D',
    handler: () => {
      const editor = api.editor.getActiveEditor();
      if (!editor) return;
      const date = new Date().toISOString().slice(0, 10);
      const selection = editor.getSelection();
      editor.executeEdits('insert-date', [{ range: selection, text: date }]);
      editor.focus();
    },
  });

  return { deactivate() {} };
}
\`\`\`

---

## Example: Viewer Plugin

A plugin that renders \`.chart\` files as a custom visualization:

**plugins/chart-viewer/package.json**
\`\`\`json
{
  "name": "notepadclone-chart-viewer",
  "displayName": "Chart Viewer",
  "version": "1.0.0",
  "notepadclone": {
    "activationEvents": ["onFileType:chart"],
    "contributes": {
      "viewers": ["chart-viewer"],
      "commands": ["chart.toggleMode"],
      "toolbarButtons": ["chart-toggle"],
      "fileTypes": ["chart"]
    }
  }
}
\`\`\`

**plugins/chart-viewer/index.js**
\`\`\`js
export function activate(api) {
  const toolbar = document.getElementById('chart-toggle-group');

  api.registerViewer({
    id: 'chart-viewer',
    displayName: 'Chart View',
    canHandle(tab) { return tab.isChartFile; },
    isDefault(tab) { return tab.isChartFile; },
    activate(container, tab, entry, tabId) {
      const content = api.editor.getContent(tabId);
      container.innerHTML = \\\`<div class="chart-container">\\\${renderChart(content)}</div>\\\`;
    },
    deactivate() {},
    destroy() {},
    updateToolbar(isActive, tab) {
      if (toolbar) toolbar.style.display = (tab && tab.isChartFile) ? '' : 'none';
    },
  });

  api.registerCommand({
    id: 'chart.toggleMode',
    title: 'Toggle Chart/Edit Mode',
    handler: () => {
      const tab = api.tabs.getActive();
      if (!tab || !tab.isChartFile) return;
      tab.chartMode = tab.chartMode === 'chart' ? 'edit' : 'chart';
      api.tabs.activate(tab.id);
    },
  });

  return { deactivate() {} };
}

function renderChart(content) {
  return '<p>Chart rendered here</p>';
}
\`\`\`

---

## Tips

- **Command ID namespacing:** Always use a dot-separated prefix (e.g. \`myPlugin.action\`) to avoid collisions.
- **Keyboard shortcuts:** Format is \`"Ctrl+Shift+K"\`. \`Ctrl\` and \`Cmd\` are equivalent (both match Ctrl on Windows/Linux and Cmd on macOS).
- **CSS imports:** Import CSS at the top of your \`index.js\`: \`import '../../src/renderer/styles/my-style.css';\`
- **Auto-cleanup:** Registered commands, viewers, and toolbar buttons are automatically removed when your plugin is deactivated.
- **Cross-plugin communication:** Use the EventBus (\`api.events\`) for loose coupling between plugins.
- **Access other plugins:** Use \`api._services\` to access the PluginHost, then \`pluginHost._plugins.get(id)._exports\`.
`;
