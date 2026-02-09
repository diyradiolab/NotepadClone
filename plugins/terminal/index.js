import '../../src/renderer/styles/terminal-panel.css';
import { TerminalPanel } from '../../src/renderer/components/terminal-panel';

export function activate(api) {
  const container = document.getElementById('terminal-panel');
  const panel = new TerminalPanel(container, api);

  api.registerCommand({
    id: 'terminal.toggle',
    title: 'Toggle Terminal',
    handler: () => panel.toggle(),
  });

  return {
    getPanel: () => panel,
    deactivate() { panel.destroy(); },
  };
}
