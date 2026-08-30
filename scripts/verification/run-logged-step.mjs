import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';

export function runLoggedStep(command, options = {}) {
  const [executable, ...args] = command;
  const log = createWriteStream(options.logPath, { encoding: 'utf8' });
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let spawnError = null;

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
      log.end(() => resolve({
        durationMs: Date.now() - startedAt,
        error: spawnError ? String(spawnError.stack || spawnError) : '',
        ok: status === 0 && !spawnError,
        signal: signal || '',
        status
      }));
    });
  });
}
