// Each invocation owns one POSIX process group. The IPC pipe is a parent-death
// lease: even SIGKILL of the launcher closes it and terminates every descendant.
import { spawn } from 'node:child_process';

let stopping = false;
let deadline;
function killGroup() {
  try { process.kill(-process.pid, 'SIGKILL'); } catch { process.exit(1); }
}
function stop() {
  if (stopping) return;
  stopping = true;
  try { process.kill(-process.pid, 'SIGTERM'); } catch { /* Group already gone. */ }
  deadline = setTimeout(killGroup, 20_000);
}

function finish() {
  stop();
  clearTimeout(deadline);
  // The command has exited; no remaining grandchild may outlive this group.
  deadline = setTimeout(killGroup, 250);
}

process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('SIGHUP', stop);
process.on('disconnect', stop);

const [command, ...args] = process.argv.slice(2);
if (!command || !process.send) process.exit(2);
const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
let reported = false;
function report(code, signal, error) {
  if (reported) return;
  reported = true;
  if (process.connected) {
    process.send({ code, signal, error }, finish);
  } else {
    finish();
  }
}
child.once('error', (error) => report(null, null, error.code ?? 'spawn failed'));
child.once('exit', (code, signal) => report(code, signal, null));
