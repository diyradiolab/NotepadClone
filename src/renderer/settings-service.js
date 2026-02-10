/**
 * SettingsService — schema-driven settings with IPC persistence and change events.
 * Core infrastructure (not a plugin). Flat dot-notation keys: editor.fontSize, appearance.theme, etc.
 */

const SCHEMA = {
  editor: {
    label: 'Editor',
    settings: {
      fontSize:           { type: 'number', default: 14, min: 8, max: 72, label: 'Font Size' },
      fontFamily:         { type: 'string', default: "'Courier New', Consolas, 'Liberation Mono', monospace", label: 'Font Family' },
      tabSize:            { type: 'number', default: 4, min: 1, max: 8, label: 'Tab Size' },
      insertSpaces:       { type: 'boolean', default: false, label: 'Insert Spaces' },
      minimap:            { type: 'boolean', default: false, label: 'Show Minimap' },
      lineNumbers:        { type: 'select', default: 'on', options: ['on', 'off', 'relative'], label: 'Line Numbers' },
      wordWrap:           { type: 'select', default: 'off', options: ['off', 'on'], label: 'Word Wrap' },
      cursorStyle:        { type: 'select', default: 'line', options: ['line', 'block', 'underline'], label: 'Cursor Style' },
      renderWhitespace:   { type: 'select', default: 'none', options: ['none', 'boundary', 'selection', 'all'], label: 'Render Whitespace' },
      smoothScrolling:    { type: 'boolean', default: true, label: 'Smooth Scrolling' },
      cursorBlinking:     { type: 'select', default: 'blink', options: ['blink', 'smooth', 'phase', 'expand', 'solid'], label: 'Cursor Blinking' },
      folding:            { type: 'boolean', default: true, label: 'Code Folding' },
      renderLineHighlight:{ type: 'select', default: 'all', options: ['none', 'gutter', 'line', 'all'], label: 'Line Highlight' },
    },
  },
  appearance: {
    label: 'Appearance',
    settings: {
      theme: { type: 'select', default: 'system', options: ['system', 'light', 'dark'], label: 'Theme' },
    },
  },
  files: {
    label: 'Files',
    settings: {
      defaultEncoding:    { type: 'select', default: 'UTF-8', options: ['UTF-8', 'ASCII', 'ISO-8859-1', 'Windows-1252', 'UTF-16LE', 'UTF-16BE'], label: 'Default Encoding' },
      defaultLineEnding:  { type: 'select', default: 'LF', options: ['LF', 'CRLF'], label: 'Default Line Ending' },
      autoSave:           { type: 'select', default: 'off', options: ['off', 'afterDelay', 'onFocusChange'], label: 'Auto Save' },
      autoSaveDelay:      { type: 'number', default: 1000, min: 200, max: 60000, label: 'Auto Save Delay (ms)' },
      largeFileThreshold: { type: 'number', default: 5, min: 1, max: 100, label: 'Large File Threshold (MB)' },
    },
  },
};

export class SettingsService {
  constructor() {
    this._schema = SCHEMA;
    this._pluginSettings = {};  // pluginId → { category, settings }
    this._values = {};          // flat: { 'editor.fontSize': 14, ... }
    this._listeners = {};       // key → Set<callback>
    this._initialized = false;
  }

  async init() {
    this._stored = await window.api.getOptions();
    // Build flat values from schema defaults, then overlay stored values
    this._values = {};
    for (const [section, def] of Object.entries(this._schema)) {
      for (const [key, setting] of Object.entries(def.settings)) {
        const flatKey = `${section}.${key}`;
        this._values[flatKey] = (this._stored && this._stored[section] && this._stored[section][key] !== undefined)
          ? this._stored[section][key]
          : setting.default;
      }
    }
    this._initialized = true;
  }

  get(key) {
    return this._values[key];
  }

  async set(key, value) {
    if (this._values[key] === value) return;
    this._values[key] = value;
    await window.api.setOption(key, value);
    this._notify(key, value);
  }

  onChange(key, callback) {
    if (!this._listeners[key]) this._listeners[key] = new Set();
    this._listeners[key].add(callback);
    return () => this._listeners[key].delete(callback);
  }

  _notify(key, value) {
    const listeners = this._listeners[key];
    if (listeners) {
      for (const cb of listeners) cb(value, key);
    }
  }

  getSchema() {
    return this._schema;
  }

  getPluginSettings() {
    return this._pluginSettings;
  }

  registerSettings({ pluginId, category, label, settings }) {
    this._pluginSettings[pluginId] = { category, label, settings };
    // Initialize from stored values, falling back to defaults
    for (const [key, setting] of Object.entries(settings)) {
      const flatKey = `${category}.${key}`;
      if (this._values[flatKey] === undefined) {
        // Try to restore persisted value by navigating the nested store object
        let val;
        if (this._stored) {
          val = this._stored;
          for (const part of flatKey.split('.')) {
            if (val && typeof val === 'object') val = val[part];
            else { val = undefined; break; }
          }
        }
        this._values[flatKey] = val !== undefined ? val : setting.default;
      }
    }
  }

  async resetSection(sectionKey) {
    // Check built-in schema first
    const schemaDef = this._schema[sectionKey];
    if (schemaDef) {
      const newValues = await window.api.resetOptionsSection(sectionKey);
      for (const [key, setting] of Object.entries(schemaDef.settings)) {
        const flatKey = `${sectionKey}.${key}`;
        const val = (newValues && newValues[key] !== undefined) ? newValues[key] : setting.default;
        this._values[flatKey] = val;
        this._notify(flatKey, val);
      }
      return;
    }
    // Check plugin settings
    for (const [, pluginDef] of Object.entries(this._pluginSettings)) {
      if (pluginDef.category === sectionKey) {
        for (const [key, setting] of Object.entries(pluginDef.settings)) {
          const flatKey = `${sectionKey}.${key}`;
          this._values[flatKey] = setting.default;
          await window.api.setOption(flatKey, setting.default);
          this._notify(flatKey, setting.default);
        }
        return;
      }
    }
  }

  getDefaults() {
    const defaults = {};
    for (const [section, def] of Object.entries(this._schema)) {
      for (const [key, setting] of Object.entries(def.settings)) {
        defaults[`${section}.${key}`] = setting.default;
      }
    }
    return defaults;
  }

  getAllValues() {
    return { ...this._values };
  }
}
