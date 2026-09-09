import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverDirectory = fileURLToPath(new URL('../', import.meta.url));
const defaultDataDirectory = fileURLToPath(new URL('../../../.sploot-local/library', import.meta.url));
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();

if (args.includes('--down') || args.includes('--session') || args.includes('--doctor')) {
  console.error('The disposable QA launcher is retired. Ctrl-C stops the application without deleting data. Use pnpm --filter server run doctor for readiness, or pnpm --filter server smoke for the isolated acceptance gauntlet.');
  process.exit(2);
}

const child = spawn('go', ['run', './cmd/sploot', 'serve', ...args], {
  cwd: serverDirectory,
  stdio: 'inherit',
  detached: process.platform !== 'win32',
  env: {
    ...process.env,
    SPLOOT_DATA_DIR: process.env.SPLOOT_DATA_DIR || defaultDataDirectory,
  },
});
let stopping = false;
function stop(signal: NodeJS.Signals) {
  if (stopping || !child.pid) return;
  stopping = true;
  try {
    // This process group was created by this launcher. It contains go run and
    // its application child, never another session or an inferred global PID.
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
child.once('error', error => {
  console.error(`Cannot launch Go: ${error.message}. Install the Go version declared in apps/server/go.mod.`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = stopping ? 0 : code ?? (signal ? 1 : 0);
});
