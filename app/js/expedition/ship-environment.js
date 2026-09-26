// A ship owns its indoor reflections; Earth sky maps must never tint the cabin.
// Bake once on boarding, reuse across decks, release on disembarkation.
export function createShipEnvironment(THREE, generator) {
  if (!generator) return null;
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = [];
  const panel = (color, size, position, side = THREE.FrontSide) => {
    const material = new THREE.MeshBasicMaterial({ color, side });
    materials.push(material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    scene.add(mesh);
  };
  panel(0x777976, [26, 7, 30], [0, 0, 0], THREE.BackSide);
  panel(0xffffff, [18, 0.1, 7], [0, 3.3, 0]);
  panel(0xc1c9cf, [0.1, 3, 22], [-12.5, 0.5, 0]);
  panel(0xcfc7ba, [0.1, 3, 22], [12.5, 0.5, 0]);
  panel(0x333638, [25, 0.1, 29], [0, -3.3, 0]);
  try {
    const target = generator.fromScene(scene, 0.04, 0.1, 100);
    target.texture.name = 'solis-reach-indoor-reflections';
    return target;
  } finally {
    geometry.dispose();
    materials.forEach(material => material.dispose());
  }
}

// BoxGeometry's default UVs stretch one image over each face. Use metres so
// bulkheads, door headers and deck plates share a coherent panel scale.
export function applyShipSurfaceUV(geometry, size, position, tileSize) {
  const p = geometry.attributes.position, n = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + position.x, y = p.getY(i) + position.y, z = p.getZ(i) + position.z;
    if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, x / tileSize, z / tileSize);
    else if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, z / tileSize, y / tileSize);
    else uv.setXY(i, x / tileSize, y / tileSize);
  }
  uv.needsUpdate = true;
}
