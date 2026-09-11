export const RUNTIME_WORKLOAD_BUDGETS = Object.freeze({
  firstPlayTargetMs: 25000,
  frameTargetMs: 16.7,
  cooperativeChunkTargetMs: 8,
  backgroundIdleTimeoutMs: 1800,
  inactiveAuxiliaryRenderers: 0
});

const queued = new Map();
const completed = new Set();
let firstPlayReady = false;
let firstPlayDetail = null;

function runWhenIdle(task, timeout) {
  if (typeof globalThis.requestIdleCallback === 'function') {
    globalThis.requestIdleCallback(() => task(), { timeout });
    return;
  }
  globalThis.setTimeout(task, Math.min(250, Math.max(32, timeout)));
}
function dispatchQueuedWork() {
  if (!firstPlayReady) return;
  for (const [id, entry] of queued) {
    queued.delete(id);
    runWhenIdle(async () => {
      try {
        await entry.task(firstPlayDetail);
        completed.add(id);
      } catch (error) {
        console.warn(`[workload] Deferred task ${id} failed:`, error);
      }
    }, entry.timeout);
  }
}

export function scheduleAfterFirstPlay(id, task, options = {}) {
  if (!id || typeof task !== 'function' || completed.has(id) || queued.has(id)) return false;
  queued.set(id, {
    task,
    timeout: Math.max(100, Number(options.timeout) || RUNTIME_WORKLOAD_BUDGETS.backgroundIdleTimeoutMs)
  });
  dispatchQueuedWork();
  return true;
}

export function markFirstPlayReady(detail = {}) {
  if (firstPlayReady) return false;
  firstPlayReady = true;
  firstPlayDetail = Object.freeze({ ...detail });
  globalThis.dispatchEvent?.(new CustomEvent('we3d:first-play-ready', {
    detail: firstPlayDetail
  }));
  dispatchQueuedWork();
  return true;
}

export function getWorkloadPolicySnapshot() {
  return Object.freeze({
    budgets: RUNTIME_WORKLOAD_BUDGETS,
    firstPlayReady,
    firstPlayDetail,
    queued: Object.freeze([...queued.keys()]),
    completed: Object.freeze([...completed])
  });
}
