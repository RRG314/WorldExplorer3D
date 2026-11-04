import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute = promisify(execFile);
const GiB = 1024 ** 3;

export async function readHostResources(rootDir) {
  const disk = await fs.statfs(rootDir, {bigint: true});
  let swapBytes = null;
  if (process.platform === 'darwin') {
    const {stdout} = await execute('/usr/sbin/sysctl', ['vm.swapusage'], {timeout: 3000});
    const match = stdout.match(/used\s*=\s*([\d.]+)([KMG])/);
    if (!match) throw new Error('The host swap measurement is unavailable.');
    swapBytes = Number(match[1]) * {K: 1024, M: 1024 ** 2, G: GiB}[match[2]];
  } else if (process.platform === 'linux') {
    const memory = await fs.readFile('/proc/meminfo', 'utf8');
    const total = Number(memory.match(/^SwapTotal:\s*(\d+)/m)?.[1]);
    const free = Number(memory.match(/^SwapFree:\s*(\d+)/m)?.[1]);
    if (Number.isFinite(total) && Number.isFinite(free)) swapBytes = (total - free) * 1024;
  }
  return {at: Date.now(), freeBytes: Number(disk.bavail * disk.bsize), swapBytes};
}

// Verification owns the supplied stop callback. It must close only the browser
// or worker launched by that verification, never a browser found by name.
export function createHostResourceGuard({
  rootDir,
  stopOwnedTask,
  readState = () => readHostResources(rootDir),
  record = async () => {},
  minimumStartFreeBytes = 3 * GiB,
  minimumFreeBytes = 2 * GiB,
  maximumSwapGrowthBytes = 4 * GiB,
  maximumDurationMs = 8 * 60 * 1000,
  pollMs = 5000
}) {
  if (typeof stopOwnedTask !== 'function') throw new TypeError('An owned-task stop callback is required.');
  let baseline = null;
  let timer = null;
  let deadline = null;
  let polling = false;
  let disposed = false;
  let stopped = null;

  function clearTimers() {
    clearInterval(timer);
    clearTimeout(deadline);
    timer = deadline = null;
  }

  async function stop(reason, state = null) {
    if (stopped || disposed) return stopped;
    stopped = {reason, state, at: Date.now()};
    clearTimers();
    // Release the owned process before disk I/O or browser-protocol snapshots.
    // Either can stall when the host is already under memory pressure.
    try { await stopOwnedTask(stopped); }
    catch (error) { stopped.stopError = String(error?.message || error); }
    try { await record({type: 'resource-stop', ...stopped}); }
    catch (error) { stopped.recordError = String(error?.message || error); }
    return stopped;
  }

  async function poll() {
    if (!baseline || disposed || stopped || polling) return stopped;
    polling = true;
    try {
      const state = await readState();
      if (!Number.isFinite(state.freeBytes)) throw new Error('The free-space measurement is unavailable.');
      if (state.freeBytes < minimumFreeBytes) return await stop('disk-headroom', state);
      if (Number.isFinite(state.swapBytes) && Number.isFinite(baseline.swapBytes) &&
          state.swapBytes - baseline.swapBytes > maximumSwapGrowthBytes) {
        return await stop('swap-growth', state);
      }
      await record({type: 'resource-sample', ...state});
      return null;
    } catch (error) {
      return await stop('resource-monitor-failed', {error: String(error?.message || error)});
    } finally { polling = false; }
  }

  return {
    async start() {
      if (baseline || disposed) throw new Error('This resource guard has already been used.');
      baseline = await readState();
      if (!Number.isFinite(baseline.freeBytes) || baseline.freeBytes < minimumStartFreeBytes) {
        throw new Error('The verification needs at least 3 GiB of free disk before launching.');
      }
      await record({type: 'resource-baseline', ...baseline});
      timer = setInterval(() => { void poll(); }, pollMs);
      deadline = setTimeout(() => { void stop('verification-deadline'); }, maximumDurationMs);
      timer.unref?.();
      deadline.unref?.();
      return {...baseline};
    },
    poll,
    snapshot: () => ({baseline: baseline && {...baseline}, stopped: stopped && {...stopped}, disposed}),
    dispose() { disposed = true; clearTimers(); }
  };
}
