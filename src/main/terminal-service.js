const pty = require('node-pty');
const os = require('os');

let terminal = null;

function getShell() {
  if (process.platform === 'win32') return 'powershell.exe';
  return process.env.SHELL || '/bin/bash';
}

function getShellArgs() {
  if (process.platform === 'win32') return [];
  return ['-l']; // login shell — loads .zshrc/.bashrc/.profile
}

function buildShellEnv(shell) {
  const env = { ...process.env };
  const shellName = require('path').basename(shell);

  // OSC 7 CWD reporting hook — appended, never replaced
  const osc7 = 'printf "\\e]7;file://%s%s\\a" "$(hostname)" "$(pwd)"';

  // edit() shell function — emits OSC 9999 for each file argument
  const editFunc = 'edit() { if [ $# -eq 0 ]; then echo "Usage: edit <file> [file2 ...]"; return 1; fi; for f in "$@"; do printf "\\e]9999;%s\\a" "$f"; done; }';

  if (shellName === 'zsh') {
    // For zsh: use precmd_functions and define edit in .zshenv-equivalent
    const existing = env.PROMPT_COMMAND || '';
    env.PROMPT_COMMAND = existing;
    // Zsh doesn't use PROMPT_COMMAND; inject via precmd
    // We set an env var that gets eval'd by a small init script
    env.NPC_SHELL_INIT = `${editFunc}; _npc_precmd() { ${osc7}; }; precmd_functions+=(_npc_precmd)`;
  } else if (shellName === 'bash') {
    // For bash: append to PROMPT_COMMAND
    const existing = env.PROMPT_COMMAND || '';
    const separator = existing ? '; ' : '';
    env.PROMPT_COMMAND = `${existing}${separator}${osc7}`;
    env.NPC_SHELL_INIT = editFunc;
  } else {
    // Unknown shell — just try PROMPT_COMMAND approach
    const existing = env.PROMPT_COMMAND || '';
    const separator = existing ? '; ' : '';
    env.PROMPT_COMMAND = `${existing}${separator}${osc7}`;
    env.NPC_SHELL_INIT = editFunc;
  }

  return env;
}

function create(cwd, onData, onExit) {
  // Kill existing session if any
  if (terminal) {
    try { terminal.kill(); } catch (_) { /* ignore */ }
    terminal = null;
  }

  const shell = getShell();
  const args = getShellArgs();
  const env = buildShellEnv(shell);

  terminal = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || os.homedir(),
    env,
  });

  // Inject the shell init (edit function + zsh precmd) after a short delay
  // to let the shell finish loading its rc files
  const shellName = require('path').basename(shell);
  setTimeout(() => {
    if (terminal) {
      if (shellName === 'zsh' || shellName === 'bash') {
        terminal.write('eval "$NPC_SHELL_INIT" 2>/dev/null\r');
        // Clear the line so the user doesn't see it (send Ctrl+L to redraw)
        setTimeout(() => {
          if (terminal) terminal.write('clear\r');
        }, 100);
      }
    }
  }, 500);

  terminal.onData((data) => onData(data));
  terminal.onExit(({ exitCode }) => {
    terminal = null;
    onExit(exitCode);
  });

  return { pid: terminal.pid };
}

function write(data) {
  if (terminal) terminal.write(data);
}

function resize(cols, rows) {
  if (terminal && cols > 0 && rows > 0) {
    terminal.resize(cols, rows);
  }
}

function kill() {
  if (terminal) {
    try { terminal.kill(); } catch (_) { /* ignore */ }
    terminal = null;
  }
}

function isRunning() {
  return terminal !== null;
}

module.exports = { create, write, resize, kill, isRunning };
