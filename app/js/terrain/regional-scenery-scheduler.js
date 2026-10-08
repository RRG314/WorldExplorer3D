// One replaceable regional publication. The detailed starting district is owned
// separately; travel must never reset its buildings, roads, activities or saves.
export function createRegionalSceneryScheduler({ request, now = () => performance.now(), stepDistance = 6000, gridSize = 4000, retryMs = 15000 }) {
  let enabled = true, anchor = { x: 0, z: 0 }, pending = null, epoch = 0, retryAt = 0, error = '';
  function reset() { epoch++; anchor = { x: 0, z: 0 }; pending = null; retryAt = 0; error = ''; }
  function step(point, threshold = stepDistance) {
    if (pending || now() < retryAt || !Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return pending;
    threshold = Number.isFinite(threshold) && threshold > 0 ? threshold : stepDistance;
    const desired = enabled ? point : { x: 0, z: 0 };
    if (enabled ? Math.max(Math.abs(desired.x-anchor.x), Math.abs(desired.z-anchor.z)) < threshold
      : anchor.x === 0 && anchor.z === 0) return null;
    // High-latitude windows shrink to fit the tile budget. Their movement
    // threshold must also bound quantization, or the new anchor stays at zero
    // while the player crosses the smaller window's edge. Distances are world units.
    const grid = Math.min(gridSize, threshold);
    const next = enabled ? { x: Math.round(desired.x/grid)*grid, z: Math.round(desired.z/grid)*grid } : desired;
    const generation = epoch;
    const work = Promise.resolve().then(() => request(next)).then(() => {
      if (generation !== epoch) return;
      anchor = next; retryAt = 0; error = '';
    }, failure => {
      if (generation !== epoch) return;
      error = String(failure?.message || failure); retryAt = now() + retryMs;
    }).finally(() => { if (generation === epoch && pending === work) pending = null; });
    pending = work;
    return work;
  }
  return { step, reset, setEnabled(value) { enabled = value === true; retryAt = 0; },
    snapshot: () => ({ enabled, anchor: { ...anchor }, pending: !!pending, retryAt, error }) };
}


export function requireCompleteTravelScenery(context) {
  if (context?.sourceCoverageComplete !== true || context.buildingBudgetExceeded === true) {
    throw new Error('Regional building data is incomplete; retaining the current scenery');
  }
  if (context.waterTilesLoaded < context.waterTilesRequested) {
    throw new Error('Regional water data is incomplete; retaining the current scenery');
  }
}

// Settings are available before the Earth runtime is loaded. Keep this preference
// independent of that lazy runtime so a menu choice also governs the first region.
export function readRegionalSceneryPreference(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem('we3d.regionalScenery') !== 'off'; }
  catch { return true; }
}
export function writeRegionalSceneryPreference(enabled, storage) {
  try { (storage ?? globalThis.localStorage)?.setItem('we3d.regionalScenery', enabled ? 'on' : 'off'); }
  catch {}
}
