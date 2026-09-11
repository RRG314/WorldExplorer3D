export async function waitForInitialTerrain(appCtx, startLoadPhase, endLoadPhase) {
  if (!appCtx.terrainEnabled || appCtx.onMoon) return false;
  const waitForCoverage = appCtx.waitForTerrainCoverageAt;
  const waitForCenter = appCtx.waitForTerrainReadyAt;
  if (typeof waitForCoverage !== 'function' && typeof waitForCenter !== 'function') return false;
  startLoadPhase('waitForTerrainCoverage');
  try {
    const startedAt = performance.now();
    const centerReady = typeof waitForCenter === 'function' ? await waitForCenter(0, 0, 3000) : false;
    const coverage = typeof waitForCoverage === 'function'
      ? await waitForCoverage(0, 0, Math.max(800, 5000 - (performance.now() - startedAt)), 0.72)
      : null;
    const nearReady = centerReady || coverage?.ready === true;
    if (appCtx.worldLoadRuntimeState?.groundMode === 'polar-cryosphere-local') {
      return nearReady;
    }
    const waitForFarTerrain = appCtx.waitForFarTerrainClipmap;
    if (typeof waitForFarTerrain !== 'function') return nearReady;
    startLoadPhase('waitForFixedLocationBackground');
    try {
      return nearReady && await waitForFarTerrain(20000);
    } finally {
      endLoadPhase('waitForFixedLocationBackground');
    }
  } finally {
    endLoadPhase('waitForTerrainCoverage');
  }
}

export function terrainSurfaceMaterialSnapshot(appCtx, options = {}) {
  const radiusWorld = Math.max(0, Number(options.radiusWorld) || 1500);
  const meshes = (appCtx.terrainGroup?.children || []).filter((mesh) =>
    mesh?.userData?.isTerrainMesh &&
    mesh.visible !== false &&
    mesh.userData?.pendingTerrainTile !== true &&
    Math.hypot(Number(mesh.position?.x || 0), Number(mesh.position?.z || 0)) <= radiusWorld
  );
  const statuses = {};
  let pending = 0;
  meshes.forEach((mesh) => {
    const status = String(mesh.userData?.worldCoverStatus || 'not_requested');
    statuses[status] = Number(statuses[status] || 0) + 1;
    if (mesh.userData?.worldCoverPromise || status === 'loading') pending += 1;
  });
  return Object.freeze({
    ready: pending === 0,
    total: meshes.length,
    pending,
    statuses: Object.freeze(statuses),
    radiusWorld
  });
}

export async function waitForTerrainSurfaceMaterials(
  appCtx,
  startLoadPhase,
  endLoadPhase,
  options = {}
) {
  const timeoutMs = Math.max(0, Number(options.timeoutMs) || 7000);
  const startedAt = performance.now();
  startLoadPhase('waitForTerrainSurfaceMaterials');
  try {
    let snapshot = terrainSurfaceMaterialSnapshot(appCtx, options);
    while (!snapshot.ready && performance.now() - startedAt < timeoutMs) {
      const promises = (appCtx.terrainGroup?.children || [])
        .filter((mesh) =>
          mesh?.visible !== false &&
          Math.hypot(Number(mesh.position?.x || 0), Number(mesh.position?.z || 0)) <= snapshot.radiusWorld
        )
        .map((mesh) => mesh?.userData?.worldCoverPromise)
        .filter((promise) => promise && typeof promise.then === 'function');
      if (promises.length > 0) {
        const remainingMs = Math.max(0, timeoutMs - (performance.now() - startedAt));
        await Promise.race([
          Promise.allSettled(promises),
          new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(200, remainingMs)))
        ]);
      } else {
        await new Promise((resolve) => globalThis.setTimeout(resolve, 80));
      }
      snapshot = terrainSurfaceMaterialSnapshot(appCtx, options);
    }
    return Object.freeze({
      ...snapshot,
      timedOut: !snapshot.ready,
      waitMs: Math.round(performance.now() - startedAt)
    });
  } finally {
    endLoadPhase('waitForTerrainSurfaceMaterials');
  }
}

export function selectedRoadGeographicBounds(roadWays = [], nodes = {}) {
  let latN = -Infinity;
  let latS = Infinity;
  const longitudes = [];
  for (const way of roadWays) {
    for (const nodeId of way?.nodes || []) {
      const node = nodes[nodeId];
      const lat = Number(node?.lat);
      const lon = Number(node?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      latN = Math.max(latN, lat);
      latS = Math.min(latS, lat);
      longitudes.push(((lon % 360) + 360) % 360);
    }
  }
  if (!Number.isFinite(latN) || !Number.isFinite(latS) || longitudes.length === 0) return null;

  longitudes.sort((left, right) => left - right);
  let largestGap = -Infinity;
  let gapIndex = 0;
  for (let index = 0; index < longitudes.length; index += 1) {
    const next = index === longitudes.length - 1
      ? longitudes[0] + 360
      : longitudes[index + 1];
    const gap = next - longitudes[index];
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = index;
    }
  }
  const arcStart = longitudes[(gapIndex + 1) % longitudes.length];
  const arcEnd = longitudes[gapIndex];
  const toSignedLongitude = (value) => value > 180 ? value - 360 : value;
  const padding = 0.00002;
  return {
    latN: Math.min(85.05112878, latN + padding),
    latS: Math.max(-85.05112878, latS - padding),
    lonW: toSignedLongitude((arcStart - padding + 360) % 360),
    lonE: toSignedLongitude((arcEnd + padding) % 360)
  };
}

export async function waitForSelectedRoadTerrain(appCtx, roadWays, nodes, startLoadPhase, endLoadPhase) {
  if (!appCtx.terrainEnabled || appCtx.onMoon || typeof appCtx.waitForTerrainReadyBounds !== 'function') {
    return false;
  }
  const bounds = selectedRoadGeographicBounds(roadWays, nodes);
  if (!bounds) return false;
  startLoadPhase('waitForTransportGround');
  try {
    const hasFixedRegionalRoads = roadWays.some(
      (way) => way?.tags?._regionalContext === 'fixed-location'
    );
    if (hasFixedRegionalRoads && typeof appCtx.waitForFarTerrainClipmap === 'function') {
      return await appCtx.waitForFarTerrainClipmap(20000);
    }
    return await appCtx.waitForTerrainReadyBounds(bounds, 8000);
  } finally {
    endLoadPhase('waitForTransportGround');
  }
}
