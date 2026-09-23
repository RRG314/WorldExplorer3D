import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';

function processSnapshot() {
  if (process.platform === 'win32') return [];
  return execFileSync('ps', ['-axo', 'pid=,ppid=,lstart='], { encoding: 'utf8', timeout: 1000 })
    .trim().split('\n').map(line => {
      const [pid, parent, ...started] = line.trim().split(/\s+/);
      return { pid: Number(pid), parent: Number(parent), started: started.join(' ') };
    });
}

function descendants(snapshot, parent) {
  const owned = new Set([parent]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of snapshot) if (owned.has(row.parent) && !owned.has(row.pid)) {
      owned.add(row.pid);
      changed = true;
    }
  }
  return snapshot.filter(row => owned.has(row.pid));
}

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
    let closed = null;
    let finished = false;
    let owned = [];

    const finish = (status, signal) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(killTimer);
      child.stdout?.destroy();
      child.stderr?.destroy();
      child.unref();
      log.end(() => resolve({
        durationMs: Date.now() - startedAt,
        error: spawnError ? String(spawnError.stack || spawnError) : (timedOut ? `timed out after ${timeoutMs} ms` : ''),
        ok: status === 0 && !spawnError && !timedOut,
        signal: signal || '', status, timedOut
      }));
    };

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
      // Browser children may create their own process groups. Capture their
      // identities before the root exits and they are reparented to init.
      try { owned = descendants(processSnapshot(), child.pid); }
      catch (error) { log.write(`[runner] process inventory failed: ${error.message}\n`); }
      for (const row of owned) {
        try { process.kill(row.pid, 'SIGTERM'); } catch {}
      }
      terminateTree('SIGTERM');
      killTimer = setTimeout(() => {
        try {
          const current = new Map(processSnapshot().map(row => [row.pid, row.started]));
          for (const row of owned) if (current.get(row.pid) === row.started) {
            try { process.kill(row.pid, 'SIGKILL'); } catch {}
          }
        } catch (error) { log.write(`[runner] cleanup inventory failed: ${error.message}\n`); }
        // Never signal a recycled root PID after its exit. Escaped descendants
        // above are matched by both PID and start time.
        if (child.exitCode === null && child.signalCode === null) terminateTree('SIGKILL');
        // A leaked pipe must not turn a failed bounded step into an infinite run.
        finish(closed?.status ?? child.exitCode, closed?.signal ?? child.signalCode);
      }, 2_000);
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
      closed = { status, signal };
      if (!timedOut) finish(status, signal);
    });
  });
}
