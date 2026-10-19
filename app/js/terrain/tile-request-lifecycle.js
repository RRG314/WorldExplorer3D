const TIMED_OUT = Symbol('terrain-wait-timeout');
const ABORTED = Symbol('terrain-wait-aborted');

// The cache owns the shared image request and its deadline. A consumer owns
// only this subscription, including its timer and abort listener.
function waitForSettlement(ready, timeoutMs, signal) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      resolve(result);
    };
    const abort = () => finish(ABORTED);
    if (signal?.aborted) { finish(ABORTED); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(TIMED_OUT), Math.max(0, timeoutMs));
    ready?.then(finish, () => finish(false));
  });
}

export async function waitForTerrainTileRequest(options = {}) {
  const {
    z, x, y, deadline, deps, signal, isActive = () => true,
    getOrLoadTerrainTile, terrainNow, maxAttempts
  } = options;
  while (terrainNow() < deadline) {
    if (!isActive() || signal?.aborted) return false;
    const tile = getOrLoadTerrainTile(z, x, y, deps);
    if (tile.loaded) return isActive();
    if (tile.failed) {
      if (tile.attempts >= maxAttempts) return false;
      const delay = Math.min(Math.max(0, tile.nextRetryAt - terrainNow()), deadline - terrainNow());
      if (await waitForSettlement(null, delay, signal) === ABORTED) return false;
      continue;
    }
    if (!(tile.ready instanceof Promise)) return false;
    const result = await waitForSettlement(tile.ready, deadline - terrainNow(), signal);
    if (!isActive() || signal?.aborted) return false;
    if (result === true) return true;
    if (result === ABORTED || result === TIMED_OUT) return false;
    // Only a source failure can consume an attempt. getOrLoadTerrainTile owns
    // retry admission/backoff; all consumers observe that same bounded state.
  }
  return false;
}
