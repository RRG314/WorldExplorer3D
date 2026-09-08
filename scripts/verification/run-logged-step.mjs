import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

export function runLoggedStep(command, options = {}) {
  const [executable, ...args] = command;
  const log = createWriteStream(options.logPath, { encoding: 'utf8' });
  const startedAt = Date.now();
  const timeoutMs = Math.max(1_000, Number(options.timeoutMs) || 10 * 60_000);

  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32'
    });
    let spawnError = null;
    let timedOut = false;
    let killTimer = null;

    const terminateTree = (signal) => {
      try {
        if (process.platform === 'win32') child.kill(signal);
        else if (child.pid) process.kill(-child.pid, signal);
      } catch {
        // The process may have exited between the timeout and signal delivery.
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      log.write(`\n[runner] timed out after ${timeoutMs} ms\n`);
      terminateTree('SIGTERM');
      killTimer = setTimeout(() => terminateTree('SIGKILL'), 2_000);
    }, timeoutMs);

    const forward = (stream, destination) => {
      stream?.on('data', (chunk) => {
        log.write(chunk);
        destination.write(chunk);
      });
    };
    forward(child.stdout, process.stdout);
    forward(child.stderr, process.stderr);
    child.on('error', (error) => {
      spawnError = error;
      log.write(`\n[runner] ${error.stack || error}\n`);
    });
    child.on('close', (status, signal) => {
      clearTimeout(timeout);
      clearTimeout(killTimer);
      log.end(() => resolve({
        durationMs: Date.now() - startedAt,
        error: spawnError ? String(spawnError.stack || spawnError) : (timedOut ? `timed out after ${timeoutMs} ms` : ''),
        ok: status === 0 && !spawnError && !timedOut,
        signal: signal || '',
        status,
        timedOut
      }));
    });
  });
}
