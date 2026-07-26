const QUALITY_LOW = 'low';
const QUALITY_HIGH = 'high';

function normalizeTier(value) {
  const tier = String(value || '').toLowerCase();
  if (tier === 'low' || tier === 'mid' || tier === 'high') return tier;
  return 'mid';
}

function createShadowPolicy({ quality, gpuTier } = {}) {
  const level = String(quality || '').toLowerCase();
  const tier = normalizeTier(gpuTier);
  if (level === QUALITY_LOW) {
    return Object.freeze({
      enabled: false,
      mapType: 'disabled',
      resolution: 0,
      halfExtent: 0,
      near: 0.5,
      far: 500,
      radius: 0,
      bias: -0.00008,
      normalBias: 0.025
    });
  }

  const highQuality = level === QUALITY_HIGH;
  const resolution = tier === 'high'
    ? 2048
    : tier === 'mid'
      ? (highQuality ? 2048 : 1024)
      : (highQuality ? 1024 : 512);
  return Object.freeze({
    enabled: true,
    mapType: 'pcf-soft',
    resolution,
    halfExtent: highQuality ? 72 : 88,
    near: 0.5,
    far: 440,
    radius: highQuality ? 3 : 2,
    bias: -0.00008,
    normalBias: highQuality ? 0.018 : 0.025
  });
}

function applyShadowPolicy({ renderer, sun, three, policy }) {
  if (!policy) throw new TypeError('Shadow policy is required.');
  if (renderer?.shadowMap) {
    renderer.shadowMap.enabled = policy.enabled;
    if (policy.enabled && three?.PCFSoftShadowMap !== undefined) {
      renderer.shadowMap.type = three.PCFSoftShadowMap;
    }
  }
  if (!sun?.shadow) return policy;

  sun.castShadow = policy.enabled;
  const size = policy.enabled ? policy.resolution : 1;
  sun.shadow.mapSize.width = size;
  sun.shadow.mapSize.height = size;
  sun.shadow.radius = policy.radius;
  sun.shadow.bias = policy.bias;
  sun.shadow.normalBias = policy.normalBias;
  const camera = sun.shadow.camera;
  if (camera) {
    camera.left = -policy.halfExtent;
    camera.right = policy.halfExtent;
    camera.top = policy.halfExtent;
    camera.bottom = -policy.halfExtent;
    camera.near = policy.near;
    camera.far = policy.far;
    camera.updateProjectionMatrix?.();
  }
  sun.shadow.needsUpdate = true;
  sun.userData = sun.userData || {};
  sun.userData.shadowPolicy = policy;
  return policy;
}

function updateShadowAnchor({ sun, focus, policy }) {
  if (!policy?.enabled || !sun?.position || !sun?.target?.position || !focus) return false;
  const focusX = Number(focus.x);
  const focusY = Number(focus.y);
  const focusZ = Number(focus.z);
  if (![focusX, focusY, focusZ].every(Number.isFinite)) return false;

  const texelSize = (policy.halfExtent * 2) / Math.max(1, policy.resolution);
  const snappedX = Math.round(focusX / texelSize) * texelSize;
  const snappedY = Math.round(focusY / texelSize) * texelSize;
  const snappedZ = Math.round(focusZ / texelSize) * texelSize;
  const state = sun.userData?.shadowAnchor;
  if (state &&
      state.x === snappedX &&
      state.y === snappedY &&
      state.z === snappedZ) {
    return false;
  }

  const target = sun.target.position;
  const offsetX = sun.position.x - target.x;
  const offsetY = sun.position.y - target.y;
  const offsetZ = sun.position.z - target.z;
  target.set(snappedX, snappedY, snappedZ);
  sun.position.set(snappedX + offsetX, snappedY + offsetY, snappedZ + offsetZ);
  sun.target.updateMatrixWorld?.();
  sun.updateMatrixWorld?.();
  sun.userData = sun.userData || {};
  sun.userData.shadowAnchor = { x: snappedX, y: snappedY, z: snappedZ };
  return true;
}

export {
  applyShadowPolicy,
  createShadowPolicy,
  updateShadowAnchor
};
