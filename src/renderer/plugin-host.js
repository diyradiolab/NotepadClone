import { createPluginAPI } from './plugin-api';

/**
 * PluginHost discovers, loads, activates, and deactivates plugins.
 * Built-in plugins are statically imported. External plugins will be loaded
 * from user directories in a later phase.
 */
export class PluginHost {
  constructor(services) {
    this.services = services;
    this._plugins = new Map(); // pluginId → { manifest, module, api, deactivate? }
  }

  /**
   * Register a plugin module with its manifest.
   * Does not activate it yet.
   */
  register(manifest, module) {
    const id = manifest.name;
    if (this._plugins.has(id)) {
      console.warn(`[PluginHost] Plugin "${id}" already registered`);
      return;
    }
    this._plugins.set(id, {
      manifest,
      module,
      api: null,
      deactivateFn: null,
      active: false,
    });
  }

  /**
   * Activate a single plugin by id.
   */
  async activatePlugin(id) {
    const plugin = this._plugins.get(id);
    if (!plugin) {
      console.warn(`[PluginHost] Plugin "${id}" not found`);
      return;
    }
    if (plugin.active) return;

    const api = createPluginAPI(id, this.services);
    plugin.api = api;

    try {
      const result = await plugin.module.activate(api);
      if (result) {
        plugin._exports = result;
        if (typeof result.deactivate === 'function') {
          plugin.deactivateFn = result.deactivate;
        }
      }
      plugin.active = true;
    } catch (err) {
      console.error(`[PluginHost] Failed to activate plugin "${id}":`, err);
    }
  }

  /**
   * Deactivate a single plugin by id.
   */
  async deactivatePlugin(id) {
    const plugin = this._plugins.get(id);
    if (!plugin || !plugin.active) return;

    try {
      if (plugin.deactivateFn) {
        await plugin.deactivateFn();
      }
      if (plugin.api && plugin.api._dispose) {
        plugin.api._dispose();
      }
    } catch (err) {
      console.error(`[PluginHost] Failed to deactivate plugin "${id}":`, err);
    }

    plugin.active = false;
    plugin.api = null;
    plugin.deactivateFn = null;
    plugin._exports = null;
  }

  /**
   * Activate all registered plugins.
   */
  async activateAll() {
    for (const id of this._plugins.keys()) {
      await this.activatePlugin(id);
    }
  }

  /**
   * Get a list of all registered plugin ids.
   */
  getPluginIds() {
    return [...this._plugins.keys()];
  }

  /**
   * Check if a plugin is active.
   */
  isActive(id) {
    const plugin = this._plugins.get(id);
    return plugin ? plugin.active : false;
  }
}
