const POLAR_SURFACE_HALF_EXTENT_WORLD = 17000;
const POLAR_SURFACE_SEGMENTS = 192;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function polarCryosphereWorldYAt(x, z, options = {}) {
  const latitude = Number(options.latitude ?? 90);
  const worldUnitsPerMeter = Number(options.worldUnitsPerMeter) || (1 / 1.11);
  const south = latitude < 0;
  const broad =
    Math.sin(x * 0.00031 + z * 0.00017) *
    Math.cos(z * 0.00023 - x * 0.00011);
  const medium =
    Math.sin(x * 0.0017 + 1.3) * Math.cos(z * 0.0013 - 0.7);
  const fractured = Math.pow(Math.abs(
    Math.sin(x * 0.0031 + z * 0.0027) *
    Math.cos(z * 0.0022 - x * 0.0019)
  ), 7);
  const meters = south
    ? 2835 + broad * 180 + medium * 52 + fractured * 14
    : 2.5 + broad * 7.5 + medium * 3.2 + fractured * 6;
  return meters * worldUnitsPerMeter;
}

function createIceDetailTexture() {
  if (typeof document === 'undefined' || typeof THREE === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const gradient = context.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#b9d3df');
  gradient.addColorStop(0.5, '#e5f1f4');
  gradient.addColorStop(1, '#9fc2d2');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  let seed = 0x6d2b79f5;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    seed ^= seed + Math.imul(seed ^ (seed >>> 7), seed | 61);
    return ((seed ^ (seed >>> 14)) >>> 0) / 4294967296;
  };
  context.lineCap = 'round';
  for (let i = 0; i < 120; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 6 + random() * 28;
    context.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = point * Math.PI / 4;
      const wobble = radius * (0.72 + random() * 0.46);
      const px = x + Math.cos(angle) * wobble;
      const py = y + Math.sin(angle) * wobble;
      if (point === 0) context.moveTo(px, py);
      else context.lineTo(px, py);
    }
    context.closePath();
    context.fillStyle = random() > 0.5 ? 'rgba(238,248,250,0.22)' : 'rgba(92,145,168,0.12)';
    context.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(12, 12);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

function buildPolarCryosphereSurface(options = {}) {
  if (typeof THREE === 'undefined') return null;
  const latitude = Number(options.latitude ?? 90);
  const worldUnitsPerMeter = Number(options.worldUnitsPerMeter) || (1 / 1.11);
  const segments = Math.max(64, Number(options.segments) || POLAR_SURFACE_SEGMENTS);
  const halfExtent = Math.max(13000, Number(options.halfExtentWorld) || POLAR_SURFACE_HALF_EXTENT_WORLD);
  const vertexCount = (segments + 1) * (segments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(segments * segments * 6);
  const iceDark = new THREE.Color(latitude < 0 ? 0xb8ceda : 0xb6d8e8);
  const iceLight = new THREE.Color(latitude < 0 ? 0xf2f5f3 : 0xf0f8fb);
  const color = new THREE.Color();

  let vertexOffset = 0;
  let uvOffset = 0;
  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const z = -halfExtent + v * halfExtent * 2;
    for (let col = 0; col <= segments; col += 1) {
      const u = col / segments;
      const x = -halfExtent + u * halfExtent * 2;
      const y = polarCryosphereWorldYAt(x, z, { latitude, worldUnitsPerMeter });
      positions[vertexOffset] = x;
      positions[vertexOffset + 1] = y;
      positions[vertexOffset + 2] = z;
      const relief = clamp((y / worldUnitsPerMeter - (latitude < 0 ? 2720 : -2.5)) / (latitude < 0 ? 220 : 8.5), 0, 1);
      color.copy(iceDark).lerp(iceLight, 0.28 + relief * 0.72);
      const patch = 0.5 + 0.5 * Math.sin(x * 0.00043 + 0.8) * Math.cos(z * 0.00037 - 1.1);
      color.multiplyScalar(0.86 + patch * 0.14);
      colors[vertexOffset] = color.r;
      colors[vertexOffset + 1] = color.g;
      colors[vertexOffset + 2] = color.b;
      uvs[uvOffset] = u;
      uvs[uvOffset + 1] = v;
      vertexOffset += 3;
      uvOffset += 2;
    }
  }

  let indexOffset = 0;
  const rowSize = segments + 1;
  for (let row = 0; row < segments; row += 1) {
    for (let col = 0; col < segments; col += 1) {
      const a = row * rowSize + col;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices[indexOffset++] = a;
      indices[indexOffset++] = c;
      indices[indexOffset++] = b;
      indices[indexOffset++] = b;
      indices[indexOffset++] = c;
      indices[indexOffset++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute('terrainSurfaceMixA', new THREE.Float32BufferAttribute(new Float32Array(vertexCount * 4), 4));
  const snowMix = new Float32Array(vertexCount * 2);
  for (let index = 0; index < vertexCount; index += 1) snowMix[index * 2 + 1] = 1;
  geometry.setAttribute('terrainSurfaceMixB', new THREE.Float32BufferAttribute(snowMix, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const detailTexture = createIceDetailTexture();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: detailTexture,
    bumpMap: detailTexture,
    bumpScale: latitude < 0 ? 0.8 : 0.52,
    vertexColors: true,
    roughness: 0.91,
    metalness: 0.02
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = latitude < 0 ? 'AntarcticIceSheetTerrain' : 'ArcticSeaIceTerrain';
  mesh.receiveShadow = true;
  // The very large terrain mesh receives lighting but must not cast into its
  // own shadow map; doing so produces long precision-acne stripes at altitude.
  mesh.castShadow = false;
  mesh.userData.isTerrainMesh = true;
  mesh.userData.pendingTerrainTile = false;
  mesh.userData.polarCryosphereSurface = true;
  mesh.userData.terrainPresentationOwner = 'polar-cryosphere-local';
  mesh.userData.terrainSurfaceMaterialBlend = Object.freeze({
    authority: 'single-terrain-semantic-pbr-material',
    source: 'polar-cryosphere-domain',
    primaryClass: 'snow'
  });
  mesh.userData.surfaceDomain = latitude < 0 ? 'antarctic-ice-sheet' : 'arctic-sea-ice';
  mesh.userData.heightSampler = (x, z) => polarCryosphereWorldYAt(x, z, { latitude, worldUnitsPerMeter });
  mesh.userData.terrainTextureSet = detailTexture ? { map: detailTexture, bumpMap: detailTexture } : {};
  return mesh;
}

export {
  POLAR_SURFACE_HALF_EXTENT_WORLD,
  POLAR_SURFACE_SEGMENTS,
  buildPolarCryosphereSurface,
  polarCryosphereWorldYAt
};
