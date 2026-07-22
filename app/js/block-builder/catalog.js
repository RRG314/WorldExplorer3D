const BLOCK_MATERIALS = Object.freeze([
  Object.freeze({ id: 'red', label: 'Red', color: 0xe53935, css: '#e53935' }),
  Object.freeze({ id: 'blue', label: 'Blue', color: 0x1e88e5, css: '#1e88e5' }),
  Object.freeze({ id: 'green', label: 'Green', color: 0x43a047, css: '#43a047' }),
  Object.freeze({ id: 'yellow', label: 'Yellow', color: 0xfdd835, css: '#fdd835' }),
  Object.freeze({ id: 'orange', label: 'Orange', color: 0xfb8c00, css: '#fb8c00' }),
  Object.freeze({ id: 'purple', label: 'Purple', color: 0x8e24aa, css: '#8e24aa' }),
  Object.freeze({ id: 'white', label: 'White', color: 0xeceff1, css: '#eceff1' }),
  Object.freeze({ id: 'charcoal', label: 'Charcoal', color: 0x37474f, css: '#37474f' }),
  Object.freeze({ id: 'brick', label: 'Brick', color: 0x9b4a3c, css: '#9b4a3c', roughness: 0.94 }),
  Object.freeze({ id: 'stone', label: 'Stone', color: 0x7d8588, css: '#7d8588', roughness: 0.96 }),
  Object.freeze({ id: 'concrete', label: 'Concrete', color: 0xb0b4b5, css: '#b0b4b5', roughness: 0.9 }),
  Object.freeze({ id: 'wood', label: 'Wood', color: 0x8b5a32, css: '#8b5a32', roughness: 0.88 }),
  Object.freeze({ id: 'glass', label: 'Glass', color: 0x9ed9e8, css: '#9ed9e8', roughness: 0.18, metalness: 0.04, opacity: 0.54 }),
  Object.freeze({ id: 'metal', label: 'Metal', color: 0x8c969f, css: '#8c969f', roughness: 0.34, metalness: 0.72 }),
  Object.freeze({ id: 'grass', label: 'Grass', color: 0x4f8a3d, css: '#4f8a3d', roughness: 1 }),
  Object.freeze({ id: 'sand', label: 'Sand', color: 0xd4bc78, css: '#d4bc78', roughness: 1 })
]);
const BLOCK_LIMIT_PER_LOCATION = 200;

const BLOCK_SHAPES = Object.freeze([
  Object.freeze({ id: 'cube', label: 'Cube' }),
  Object.freeze({ id: 'slab', label: 'Slab' }),
  Object.freeze({ id: 'ramp', label: 'Ramp' }),
  Object.freeze({ id: 'column', label: 'Column' }),
  Object.freeze({ id: 'cylinder', label: 'Cylinder' }),
  Object.freeze({ id: 'wedge', label: 'Wedge' }),
  Object.freeze({ id: 'pyramid', label: 'Pyramid' }),
  Object.freeze({ id: 'stairs', label: 'Stairs' }),
  Object.freeze({ id: 'wall', label: 'Wall' }),
  Object.freeze({ id: 'beam', label: 'Beam' }),
  Object.freeze({ id: 'roof', label: 'Roof' }),
  Object.freeze({ id: 'panel', label: 'Panel' })
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

  if (shape === 'column' || shape === 'cylinder') {
    if (Math.hypot(local.x, local.z) > 0.36 + epsilon) return null;
    return { shape, bottomY: centerY - 0.5, topY: centerY + 0.5 };
  }
  if (shape === 'wall' || shape === 'panel') {
    if (Math.abs(local.x) > 0.5 + epsilon || Math.abs(local.z) > 0.125 + epsilon) return null;
    return { shape, bottomY: centerY - 0.5, topY: centerY + 0.5 };
  }
  if (shape === 'beam') {
    if (Math.abs(local.x) > 0.5 + epsilon || Math.abs(local.z) > 0.125 + epsilon) return null;
    return { shape, bottomY: centerY - 0.125, topY: centerY + 0.125 };
  }
  if (Math.abs(local.x) > 0.5 + epsilon || Math.abs(local.z) > 0.5 + epsilon) return null;
  if (shape === 'slab') {
    return { shape, bottomY: centerY - 0.5, topY: centerY };
  }
  if (shape === 'ramp' || shape === 'wedge') {
    return { shape, bottomY: centerY - 0.5, topY: centerY + local.z };
  }
  if (shape === 'stairs') {
    const step = Math.max(0, Math.min(2, Math.floor((local.z + 0.5 - epsilon) * 3)));
    return { shape, bottomY: centerY - 0.5, topY: centerY - 0.5 + (step + 1) / 3 };
  }
  if (shape === 'roof') {
    return { shape, bottomY: centerY - 0.5, topY: centerY + 0.5 - Math.abs(local.z) * 2 };
  }
  if (shape === 'pyramid') {
    const height = Math.max(0, 0.5 - Math.max(Math.abs(local.x), Math.abs(local.z)));
    return { shape, bottomY: centerY - 0.5, topY: centerY - 0.5 + height * 2 };
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
  if (shape === 'cylinder') {
    return { geometry: new THREE.CylinderGeometry(0.48, 0.48, 1, 20), yOffset: 0 };
  }
  if (shape === 'wall' || shape === 'panel') {
    return { geometry: new THREE.BoxGeometry(1, 1, 0.25), yOffset: 0 };
  }
  if (shape === 'beam') {
    return { geometry: new THREE.BoxGeometry(1, 0.25, 0.25), yOffset: 0 };
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
  if (shape === 'wedge') {
    const geometry = new THREE.CylinderGeometry(0.72, 0.72, 1, 3);
    geometry.rotateZ(Math.PI * 0.5);
    return { geometry, yOffset: 0 };
  }
  if (shape === 'pyramid') {
    const geometry = new THREE.ConeGeometry(0.72, 1, 4);
    geometry.rotateY(Math.PI * 0.25);
    return { geometry, yOffset: 0 };
  }
  if (shape === 'stairs' || shape === 'roof') {
    const profile = new THREE.Shape();
    if (shape === 'stairs') {
      profile.moveTo(-0.5, -0.5);
      profile.lineTo(0.5, -0.5);
      profile.lineTo(0.5, 0.5);
      profile.lineTo(0.1667, 0.5);
      profile.lineTo(0.1667, 0.1667);
      profile.lineTo(-0.1667, 0.1667);
      profile.lineTo(-0.1667, -0.1667);
      profile.lineTo(-0.5, -0.1667);
    } else {
      profile.moveTo(-0.5, -0.5);
      profile.lineTo(0.5, -0.5);
      profile.lineTo(0, 0.5);
    }
    profile.closePath();
    const geometry = new THREE.ExtrudeGeometry(profile, { depth: 1, bevelEnabled: false });
    geometry.rotateY(Math.PI * 0.5);
    geometry.translate(-0.5, 0, 0);
    geometry.computeVertexNormals();
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
