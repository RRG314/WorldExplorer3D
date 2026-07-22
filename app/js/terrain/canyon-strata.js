const CANYON_BANDS = [
  0x8f4f32,
  0xb96b43,
  0xd09463,
  0x9f5c3c,
  0xc77c50,
  0xe0aa78
];

function applyCanyonStrata(mesh, enabled = true) {
  const geometry = mesh?.geometry;
  const material = mesh?.material;
  const positions = geometry?.attributes?.position;
  if (!geometry || !material || Array.isArray(material) || !positions) return;
  if (!enabled) {
    if (geometry.getAttribute('color')) geometry.deleteAttribute('color');
    material.vertexColors = false;
    material.needsUpdate = true;
    return;
  }

  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const elevation = positions.getY(i);
    const broadBand = Math.floor((elevation + 800) / 11);
    const fineBand = Math.sin(elevation * 0.72) * 0.08;
    color.setHex(CANYON_BANDS[Math.abs(broadBand) % CANYON_BANDS.length]);
    color.offsetHSL(0, fineBand, fineBand * 0.35);
    const offset = i * 3;
    colors[offset] = color.r;
    colors[offset + 1] = color.g;
    colors[offset + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  material.vertexColors = true;
  material.needsUpdate = true;
}

export { applyCanyonStrata };
