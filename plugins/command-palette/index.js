import '../../src/renderer/styles/command-palette.css';
import { CommandPaletteDialog } from '../../src/renderer/components/command-palette-dialog';

export function activate(api) {
  const commandRegistry = api._services.commandRegistry;
  const dialog = new CommandPaletteDialog(commandRegistry);

  api.registerCommand({
    id: 'commandPalette.show',
    title: 'Command Palette',
    shortcut: 'Ctrl+Shift+P',
    handler: () => dialog.show(),
  });

  return { deactivate() {} };
}
