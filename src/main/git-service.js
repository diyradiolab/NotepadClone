const { execFile } = require('child_process');

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) {
        // Git not installed
        if (err.code === 'ENOENT') {
          reject(new Error('Git is not installed or not in PATH'));
          return;
        }
        reject(new Error(stderr.trim() || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function getStatus(cwd) {
  const empty = { isRepo: false, branch: '', dirtyCount: 0, hasRemote: false, repoRoot: null };
  if (!cwd) return empty;

  try {
    await runGit(['rev-parse', '--is-inside-work-tree'], cwd);
  } catch {
    return empty;
  }

  const repoRoot = await runGit(['rev-parse', '--show-toplevel'], cwd);

  let branch = '';
  try {
    branch = await runGit(['branch', '--show-current'], cwd);
  } catch {
    branch = 'HEAD';
  }

  let dirtyCount = 0;
  try {
    const porcelain = await runGit(['status', '--porcelain'], cwd);
    if (porcelain) {
      dirtyCount = porcelain.split('\n').length;
    }
  } catch { /* ignore */ }

  let hasRemote = false;
  try {
    const remotes = await runGit(['remote'], cwd);
    hasRemote = remotes.length > 0;
  } catch { /* ignore */ }

  return { isRepo: true, branch, dirtyCount, hasRemote, repoRoot };
}

async function init(cwd) {
  try {
    await runGit(['init'], cwd);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function stageAll(cwd) {
  try {
    await runGit(['add', '-A'], cwd);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function commit(cwd, message) {
  try {
    const stdout = await runGit(['commit', '-m', message], cwd);
    const summary = stdout.split('\n')[0];
    return { success: true, summary };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function push(cwd) {
  try {
    await runGit(['push'], cwd);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function pull(cwd) {
  try {
    await runGit(['pull'], cwd);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { getStatus, init, stageAll, commit, push, pull };
