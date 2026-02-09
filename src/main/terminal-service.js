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

function create(cwd, onData, onExit) {
  // Kill existing session if any
  if (terminal) {
    try { terminal.kill(); } catch (_) { /* ignore */ }
    terminal = null;
  }

  const shell = getShell();
  const args = getShellArgs();

  terminal = pty.spawn(shell, args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || os.homedir(),
    env: process.env,
  });

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
