const BLOCK_MATERIALS = Object.freeze([
  Object.freeze({ id: 'red', label: 'Red', color: 0xe53935, css: '#e53935' }),
  Object.freeze({ id: 'blue', label: 'Blue', color: 0x1e88e5, css: '#1e88e5' }),
  Object.freeze({ id: 'green', label: 'Green', color: 0x43a047, css: '#43a047' }),
  Object.freeze({ id: 'yellow', label: 'Yellow', color: 0xfdd835, css: '#fdd835' }),
  Object.freeze({ id: 'orange', label: 'Orange', color: 0xfb8c00, css: '#fb8c00' }),
  Object.freeze({ id: 'purple', label: 'Purple', color: 0x8e24aa, css: '#8e24aa' }),
  Object.freeze({ id: 'white', label: 'White', color: 0xeceff1, css: '#eceff1' }),
  Object.freeze({ id: 'charcoal', label: 'Charcoal', color: 0x37474f, css: '#37474f' })
]);
const BLOCK_LIMIT_PER_LOCATION = 200;

const BLOCK_SHAPES = Object.freeze([
  Object.freeze({ id: 'cube', label: 'Cube' }),
  Object.freeze({ id: 'slab', label: 'Slab' }),
  Object.freeze({ id: 'ramp', label: 'Ramp' }),
  Object.freeze({ id: 'column', label: 'Column' }),
  Object.freeze({ id: 'wall', label: 'Wall' }),
  Object.freeze({ id: 'floor', label: 'Floor' }),
  Object.freeze({ id: 'roof', label: 'Roof' }),
  Object.freeze({ id: 'window', label: 'Window' }),
  Object.freeze({ id: 'door', label: 'Door' }),
  Object.freeze({ id: 'storefront', label: 'Storefront' }),
  Object.freeze({ id: 'glass_wall', label: 'Glass Wall' }),
  Object.freeze({ id: 'stairs', label: 'Stairs' }),
  Object.freeze({ id: 'fence', label: 'Fence' }),
  Object.freeze({ id: 'sign', label: 'Sign' })
]);

const BLOCK_SHAPE_IDS = new Set(BLOCK_SHAPES.map((shape) => shape.id));

function normalizeBlockHorizontalGrid(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

function normalizeBlockVerticalGrid(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const normalized = Math.round(numeric * 2) / 2;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function blockDocumentIdFromCoords(gx, gy, gz) {
  return [
    normalizeBlockHorizontalGrid(gx),
    normalizeBlockVerticalGrid(gy),
    normalizeBlockHorizontalGrid(gz)
  ].join('_');
}

function normalizeBlockShape(value) {
  const shape = String(value || '').toLowerCase();
  return BLOCK_SHAPE_IDS.has(shape) ? shape : 'cube';
}

function normalizeBlockRotation(value) {
  const rotation = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return ((rotation % 4) + 4) % 4;
}

function normalizeBlockMaterial(value) {
  const index = Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
  return Math.max(0, Math.min(BLOCK_MATERIALS.length - 1, index));
}

function toLocalXZ(dx, dz, rotation) {
  const angle = normalizeBlockRotation(rotation) * Math.PI * 0.5;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  return {
    x: cos * dx - sin * dz,
    z: sin * dx + cos * dz
  };
}

function getBlockShapeSurface(shapeValue, rotation, centerX, centerY, centerZ, x, z) {
  const shape = normalizeBlockShape(shapeValue);
  const local = toLocalXZ(x - centerX, z - centerZ, rotation);
  const epsilon = 0.000001;

  if (shape === 'column') {
    if (Math.hypot(local.x, local.z) > 0.36 + epsilon) return null;
    return { shape, bottomY: centerY - 0.5, topY: centerY + 0.5 };
  }

  if (shape === 'wall' || shape === 'window' || shape === 'door' || shape === 'storefront' || shape === 'glass_wall' || shape === 'fence' || shape === 'sign') {
    if (Math.abs(local.x) > 0.5 + epsilon || Math.abs(local.z) > 0.12 + epsilon) return null;
    const height = shape === 'fence' ? 0.72 : shape === 'sign' ? 0.65 : 1;
    return { shape, bottomY: centerY - height * 0.5, topY: centerY + height * 0.5 };
  }

  if (shape === 'floor' || shape === 'roof') {
    if (Math.abs(local.x) > 0.5 + epsilon || Math.abs(local.z) > 0.5 + epsilon) return null;
    return { shape, bottomY: centerY - 0.09, topY: centerY + 0.09 };
  }

  if (Math.abs(local.x) > 0.5 + epsilon || Math.abs(local.z) > 0.5 + epsilon) return null;
  if (shape === 'slab') {
    return { shape, bottomY: centerY - 0.5, topY: centerY };
  }
  if (shape === 'ramp') {
    return { shape, bottomY: centerY - 0.5, topY: centerY + local.z };
  }
  return { shape, bottomY: centerY - 0.5, topY: centerY + 0.5 };
}

function createBlockShapeGeometry(THREE, shapeValue) {
  const shape = normalizeBlockShape(shapeValue);
  if (!THREE) return null;

  if (shape === 'slab') {
    return { geometry: new THREE.BoxGeometry(1, 0.5, 1), yOffset: -0.25 };
  }
  if (shape === 'column') {
    return { geometry: new THREE.CylinderGeometry(0.36, 0.36, 1, 12), yOffset: 0 };
  }
  if (shape === 'wall') return { geometry: new THREE.BoxGeometry(1, 1, 0.18), yOffset: 0 };
  if (shape === 'floor' || shape === 'roof') return { geometry: new THREE.BoxGeometry(1, 0.18, 1), yOffset: 0 };
  if (shape === 'window' || shape === 'storefront' || shape === 'glass_wall') return { geometry: new THREE.BoxGeometry(1, 1, 0.08), yOffset: 0 };
  if (shape === 'door') return { geometry: new THREE.BoxGeometry(0.78, 1, 0.1), yOffset: 0 };
  if (shape === 'fence') return { geometry: new THREE.BoxGeometry(1, 0.72, 0.12), yOffset: -0.14 };
  if (shape === 'sign') return { geometry: new THREE.BoxGeometry(1, 0.65, 0.1), yOffset: 0.18 };
  if (shape === 'stairs') {
    const group = new THREE.BoxGeometry(1, 1, 1);
    const positions = group.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const z = positions.getZ(i);
      const y = positions.getY(i);
      if (y > 0) positions.setY(i, Math.round((z + 0.5) * 4) / 4 - 0.5);
    }
    positions.needsUpdate = true;
    group.computeVertexNormals();
    return { geometry: group, yOffset: 0 };
  }
  if (shape === 'ramp') {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      positions.setY(i, positions.getY(i) > 0 ? positions.getZ(i) : -0.5);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return { geometry, yOffset: 0 };
  }
  return { geometry: new THREE.BoxGeometry(1, 1, 1), yOffset: 0 };
}

export {
  BLOCK_MATERIALS,
  BLOCK_LIMIT_PER_LOCATION,
  BLOCK_SHAPES,
  blockDocumentIdFromCoords,
  createBlockShapeGeometry,
  getBlockShapeSurface,
  normalizeBlockHorizontalGrid,
  normalizeBlockMaterial,
  normalizeBlockRotation,
  normalizeBlockShape,
  normalizeBlockVerticalGrid
};
