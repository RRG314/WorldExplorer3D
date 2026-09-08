const SHADOW_RADIUS_WORLD_UNITS = 150;
const SHADOW_ANCHOR_TEXELS = 32;
const SHADOW_DIRECTION_QUANTUM = 0.002;

function normalizedDirection(direction) {
  const x = Number.isFinite(direction?.x) ? direction.x : 0.52;
  const y = Number.isFinite(direction?.y) ? direction.y : 0.82;
  const z = Number.isFinite(direction?.z) ? direction.z : 0.22;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
}

function quantizedDirection(direction) {
  const normalized = normalizedDirection(direction);
  return normalizedDirection({
    x: Math.round(normalized.x / SHADOW_DIRECTION_QUANTUM) * SHADOW_DIRECTION_QUANTUM,
    y: Math.round(normalized.y / SHADOW_DIRECTION_QUANTUM) * SHADOW_DIRECTION_QUANTUM,
    z: Math.round(normalized.z / SHADOW_DIRECTION_QUANTUM) * SHADOW_DIRECTION_QUANTUM
  });
}

export function computeDirectionalShadowPlacement(direction, observer, options = {}) {
  const radiusWorldUnits = Math.max(1, Number(options.radiusWorldUnits) || SHADOW_RADIUS_WORLD_UNITS);
  const resolution = Math.max(1, Number(options.resolution) || 1);
  const span = radiusWorldUnits * 2;
  const texelWorldSize = span / resolution;
  const anchorStep = texelWorldSize * SHADOW_ANCHOR_TEXELS;
  const depthStep = anchorStep * 2;
  const lightDirection = quantizedDirection(direction);
  const referenceUp = Math.abs(lightDirection.y) > 0.98
    ? { x: 0, y: 0, z: 1 }
    : { x: 0, y: 1, z: 0 };
  const rightRaw = {
    x: referenceUp.y * lightDirection.z - referenceUp.z * lightDirection.y,
    y: referenceUp.z * lightDirection.x - referenceUp.x * lightDirection.z,
    z: referenceUp.x * lightDirection.y - referenceUp.y * lightDirection.x
  };
  const rightLength = Math.hypot(rightRaw.x, rightRaw.y, rightRaw.z) || 1;
  const right = {
    x: rightRaw.x / rightLength,
    y: rightRaw.y / rightLength,
    z: rightRaw.z / rightLength
  };
  const up = {
    x: lightDirection.y * right.z - lightDirection.z * right.y,
    y: lightDirection.z * right.x - lightDirection.x * right.z,
    z: lightDirection.x * right.y - lightDirection.y * right.x
  };
  const point = {
    x: Number(observer?.x) || 0,
    y: Number(observer?.y) || 0,
    z: Number(observer?.z) || 0
  };
  const snap = (value, step) => Math.round(value / step) * step;
  const projectedRight = snap(point.x * right.x + point.y * right.y + point.z * right.z, anchorStep);
  const projectedUp = snap(point.x * up.x + point.y * up.y + point.z * up.z, anchorStep);
  const projectedDepth = snap(
    point.x * lightDirection.x + point.y * lightDirection.y + point.z * lightDirection.z,
    depthStep
  );
  const target = {
    x: right.x * projectedRight + up.x * projectedUp + lightDirection.x * projectedDepth,
    y: right.y * projectedRight + up.y * projectedUp + lightDirection.y * projectedDepth,
    z: right.z * projectedRight + up.z * projectedUp + lightDirection.z * projectedDepth
  };
  const signature = [
    projectedRight,
    projectedUp,
    projectedDepth,
    lightDirection.x,
    lightDirection.y,
    lightDirection.z
  ].map((value) => Number(value).toFixed(6)).join(':');
  return { anchorStep, lightDirection, signature, target, texelWorldSize };
}

function qualityResolution(gpuTier, quality) {
  if (quality === 'low') return 0;
  if (gpuTier === 'low') return quality === 'high' ? 512 : 256;
  if (gpuTier === 'mid') return quality === 'high' ? 1024 : 512;
  return quality === 'high' ? 2048 : 1024;
}

export function applyDirectionalShadowPolicy(appCtx, options = {}) {
  const sun = appCtx?.sun;
  const renderer = appCtx?.renderer;
  if (!sun || !renderer) return null;
  const quality = String(options.quality || appCtx.renderQualityLevel || 'med');
  const gpuTier = String(options.gpuTier || 'high');
  const resolution = qualityResolution(gpuTier, quality);
  const enabled = resolution > 0;

  renderer.shadowMap.enabled = enabled;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = enabled;
  renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  sun.castShadow = enabled;
  sun.shadow.mapSize.set(Math.max(1, resolution), Math.max(1, resolution));
  sun.shadow.camera.left = -SHADOW_RADIUS_WORLD_UNITS;
  sun.shadow.camera.right = SHADOW_RADIUS_WORLD_UNITS;
  sun.shadow.camera.top = SHADOW_RADIUS_WORLD_UNITS;
  sun.shadow.camera.bottom = -SHADOW_RADIUS_WORLD_UNITS;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 620;
  sun.shadow.bias = 0;
  sun.shadow.normalBias = quality === 'high' ? 0.045 : 0.06;
  sun.shadow.radius = quality === 'high' ? 2 : 1;
  sun.shadow.camera.updateProjectionMatrix?.();
  sun.shadow.needsUpdate = true;
  sun.userData.shadowPolicy = {
    owner: 'engine/shadow-policy',
    quality,
    gpuTier,
    resolution,
    radiusWorldUnits: SHADOW_RADIUS_WORLD_UNITS,
    refreshIntervalMs: quality === 'high' ? 50 : 84
  };
  sun.userData.shadowTracker = null;
  return sun.userData.shadowPolicy;
}

export function updateStableDirectionalShadow(appCtx, direction, observer, options = {}) {
  const sun = appCtx?.sun;
  if (!sun || !observer) return false;
  const policy = sun.userData?.shadowPolicy;
  if (!(Number(policy?.resolution) > 0)) return false;
  const previous = sun.userData.shadowTracker || null;
  const requestedDirection = normalizedDirection(direction);
  const previousDirection = previous?.lightDirection || null;
  const directionDot = previousDirection
    ? requestedDirection.x * previousDirection.x + requestedDirection.y * previousDirection.y + requestedDirection.z * previousDirection.z
    : -1;
  const stableDirection = previousDirection && directionDot >= Math.cos(SHADOW_DIRECTION_QUANTUM)
    ? previousDirection
    : requestedDirection;
  const placement = computeDirectionalShadowPlacement(stableDirection, observer, {
    radiusWorldUnits: policy.radiusWorldUnits,
    resolution: policy.resolution
  });
  const anchorChanged = previous?.signature !== placement.signature;
  if (anchorChanged) {
    const { target, lightDirection } = placement;
    sun.position.set(
      target.x + lightDirection.x * 260,
      target.y + lightDirection.y * 260,
      target.z + lightDirection.z * 260
    );
    sun.target?.position.set(target.x, target.y, target.z);
    sun.target?.updateMatrixWorld?.();
  }
  const nowMs = Number.isFinite(options.nowMs)
    ? Number(options.nowMs)
    : Number(globalThis.performance?.now?.() || Date.now());
  const refreshIntervalMs = Math.max(16, Number(policy.refreshIntervalMs) || 84);
  const refreshDue = !previous || nowMs - Number(previous.lastRefreshMs || 0) >= refreshIntervalMs;
  const refreshed = anchorChanged || refreshDue;
  if (refreshed && appCtx.renderer?.shadowMap) appCtx.renderer.shadowMap.needsUpdate = true;
  sun.userData.shadowTracker = {
    ...placement,
    lastRefreshMs: refreshed ? nowMs : Number(previous?.lastRefreshMs || nowMs)
  };
  return refreshed;
}
