import '../../src/renderer/styles/plugin-manager-dialog.css';
import { PluginManagerDialog } from '../../src/renderer/components/plugin-manager-dialog';

export function activate(api) {
  const pluginHost = api._services.pluginHost;
  const dialog = new PluginManagerDialog(pluginHost);

  api.registerCommand({
    id: 'pluginManager.show',
    title: 'Plugin Manager',
    shortcut: 'Ctrl+Shift+P',
    handler: () => dialog.show(),
  });

  return {
    deactivate() {},
  };
}
