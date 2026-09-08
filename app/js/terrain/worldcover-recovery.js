export function scheduleWorldCoverRecovery(mesh, retry, timers = globalThis) {
  const state = mesh?.userData;
  if (!state || state.terrainDisposed || state.worldCoverRetryTimer || state.worldCoverRetryCount >= 2) return false;
  state.worldCoverRetryCount = (state.worldCoverRetryCount || 0) + 1;
  // Allow the shared provider circuit to cool down. At most two retries for
  // this mesh, and no per-frame polling or duplicate provider authority.
  state.worldCoverRetryTimer = timers.setTimeout(() => {
    state.worldCoverRetryTimer = null;
    if (state.terrainDisposed || state.worldCoverResult) return;
    state.worldCoverStatus = 'retrying';
    retry();
  }, 65000 * state.worldCoverRetryCount);
  return true;
}

export function cancelWorldCoverRecovery(mesh, timers = globalThis) {
  const state = mesh?.userData;
  if (!state) return;
  if (state.worldCoverRetryTimer) timers.clearTimeout(state.worldCoverRetryTimer);
  state.worldCoverRetryTimer = null;
}
