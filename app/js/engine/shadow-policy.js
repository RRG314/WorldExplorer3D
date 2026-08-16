const SHADOW_RADIUS_WORLD_UNITS = 150;

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
    radiusWorldUnits: SHADOW_RADIUS_WORLD_UNITS
  };
  return sun.userData.shadowPolicy;
}

export function updateStableDirectionalShadow(appCtx, direction, observer) {
  const sun = appCtx?.sun;
  if (!sun || !observer) return false;
  const policy = sun.userData?.shadowPolicy;
  const resolution = Math.max(1, Number(policy?.resolution) || 1);
  const span = Math.max(1, Number(policy?.radiusWorldUnits || SHADOW_RADIUS_WORLD_UNITS) * 2);
  const texelWorldSize = span / resolution;
  const snap = (value) => Math.round(Number(value || 0) / texelWorldSize) * texelWorldSize;
  const targetX = snap(observer.x);
  const targetY = snap(observer.y);
  const targetZ = snap(observer.z);
  const dirX = Number.isFinite(direction?.x) ? direction.x : 0.52;
  const dirY = Number.isFinite(direction?.y) ? direction.y : 0.82;
  const dirZ = Number.isFinite(direction?.z) ? direction.z : 0.22;

  sun.position.set(targetX + dirX * 260, targetY + dirY * 260, targetZ + dirZ * 260);
  sun.target?.position.set(targetX, targetY, targetZ);
  sun.target?.updateMatrixWorld?.();
  return true;
}
