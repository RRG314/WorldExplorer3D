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
  Object.freeze({ id: 'column', label: 'Column' })
]);

const BLOCK_SHAPE_IDS = new Set(BLOCK_SHAPES.map((shape) => shape.id));

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
  createBlockShapeGeometry,
  getBlockShapeSurface,
  normalizeBlockMaterial,
  normalizeBlockRotation,
  normalizeBlockShape
};
