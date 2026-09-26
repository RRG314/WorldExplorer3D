import { execFileSync } from 'node:child_process';

export async function withinDeadline(operation, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds);
      })
    ]);
  } finally { clearTimeout(timer); }
}

function processSnapshot() {
  if (process.platform === 'win32') return [];
  return execFileSync('ps', ['-axo', 'pid=,ppid=,lstart='], { encoding: 'utf8', timeout: 1000 })
    .trim().split('\n').map(line => {
      const [pid, parent, ...started] = line.trim().split(/\s+/);
      return { pid: Number(pid), parent: Number(parent), started: started.join(' ') };
    });
}

function captureOwnedDescendants(parent) {
  const snapshot = processSnapshot();
  const ids = new Set([parent]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of snapshot) if (ids.has(row.parent) && !ids.has(row.pid)) {
      ids.add(row.pid); changed = true;
    }
  }
  return snapshot.filter(row => row.pid !== parent && ids.has(row.pid));
}

async function reapOwnedDescendants(owned, timeoutMs) {
  if (!owned.length) return;
  const remaining = () => {
    const current = new Map(processSnapshot().map(row => [row.pid, row.started]));
    return owned.filter(row => current.get(row.pid) === row.started);
  };
  const signal = value => {
    for (const row of remaining()) {
      try { process.kill(row.pid, value); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  };
  const wait = async ms => {
    const deadline = Date.now() + ms;
    while (remaining().length) {
      if (Date.now() >= deadline) return false;
      await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now()))));
    }
    return true;
  };
  signal('SIGTERM');
  if (!await wait(timeoutMs)) {
    signal('SIGKILL');
    if (!await wait(2000)) throw new Error('Owned browser descendants did not terminate');
  }
}

// Capture ancestry before the browser exits and children are reparented. Match
// both PID and start time before signaling; never search by browser name or
// terminate the owner's ordinary Chrome. Successful parent exit alone is not
// evidence that a detached renderer/GPU child has gone away.
export async function closeOwnedBrowser(server, timeoutMs = 8000, terminateMs = 4000) {
  const child = server.process();
  const owned = child && child.exitCode === null && !child.signalCode
    ? captureOwnedDescendants(child.pid) : [];
  try {
    try {
      await withinDeadline(() => server.close(), timeoutMs, 'Owned browser close');
    } catch (error) {
      if (!child || child.exitCode !== null || child.signalCode) return;
      const waitForExit = (duration) => new Promise(resolve => {
        let timer;
        const exited = () => { clearTimeout(timer); resolve(true); };
        child.once('exit', exited);
        timer = setTimeout(() => { child.off('exit', exited); resolve(false); }, duration);
      });
      const terminated = waitForExit(terminateMs);
      child.kill('SIGTERM');
      if (!await terminated) {
        const killed = waitForExit(2000);
        child.kill('SIGKILL');
        if (!await killed) throw new Error('Owned browser process did not terminate', { cause: error });
      }
    }
  } finally {
    await reapOwnedDescendants(owned, terminateMs);
  }
}
