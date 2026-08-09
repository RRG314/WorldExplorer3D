export function cancelTerrainTileRequest(cache, z, x, y) {
  const key = `${z}/${x}/${y}`;
  const tile = cache?.get?.(key);
  if (!tile || !tile.loading) return false;
  cache.delete(key);
  tile.evicted = true;
  tile.loading = false;
  if (tile.img) {
    tile.img.onload = null;
    tile.img.onerror = null;
    tile.img.src = '';
  }
  tile.img = null;
  tile.resolveReady?.(false);
  tile.resolveReady = null;
  return true;
}

function delayUntil(ms, signal) {
  if (ms <= 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener?.('abort', abort);
      resolve(true);
    }, ms);
    const abort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener?.('abort', abort);
      resolve(false);
    };
    signal?.addEventListener?.('abort', abort, { once: true });
  });
}

export async function waitForTerrainTileRequest(options = {}) {
  const {
    z, x, y, deadline, deps, signal,
    getOrLoadTerrainTile, failTerrainTileAttempt, terrainNow,
    cancelTile, maxAttempts, attemptTimeoutMs
  } = options;
  while (terrainNow() < deadline) {
    if (signal?.aborted) {
      cancelTile(z, x, y);
      return false;
    }
    const tile = getOrLoadTerrainTile(z, x, y, deps);
    if (tile.loaded) return true;
    if (tile.failed) {
      if (tile.attempts >= maxAttempts) return false;
      const delay = Math.min(Math.max(0, tile.nextRetryAt - terrainNow()), deadline - terrainNow());
      if (!await delayUntil(delay, signal)) {
        cancelTile(z, x, y);
        return false;
      }
      continue;
    }
    if (!(tile.ready instanceof Promise)) return false;
    const remaining = Math.max(0, deadline - terrainNow());
    const attemptTimeout = Math.min(attemptTimeoutMs, remaining);
    const timedOut = Symbol('terrain-timeout');
    const aborted = Symbol('terrain-aborted');
    let abortListener = null;
    const abortPromise = signal
      ? new Promise((resolve) => {
          abortListener = () => resolve(aborted);
          signal.addEventListener('abort', abortListener, { once: true });
        })
      : new Promise(() => {});
    const result = await Promise.race([
      tile.ready,
      delayUntil(attemptTimeout).then(() => timedOut),
      abortPromise
    ]);
    if (abortListener) signal.removeEventListener('abort', abortListener);
    if (result === true) return true;
    if (result === aborted) {
      cancelTile(z, x, y);
      return false;
    }
    if (result === timedOut) {
      if (tile.img) {
        tile.img.onload = null;
        tile.img.onerror = null;
        tile.img.src = '';
      }
      failTerrainTileAttempt(tile, `terrain tile request timed out after ${Math.round(attemptTimeout)}ms`);
    }
  }
  return false;
}
