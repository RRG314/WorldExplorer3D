import { latLonToLocalPoint } from './helpers.js?v=5';

const TILE_RADIUS = 1.004;
const PATCH_SEGMENTS = 10;

function clampMercatorLatitude(lat) {
  return Math.max(-85.05112878, Math.min(85.05112878, Number(lat) || 0));
}

function tileXAtLongitude(lon, zoom) {
  const count = 2 ** zoom;
  return Math.floor(((Number(lon) + 180) / 360) * count);
}

function tileYAtLatitude(lat, zoom) {
  const count = 2 ** zoom;
  const radians = clampMercatorLatitude(lat) * Math.PI / 180;
  return Math.floor((1 - Math.asinh(Math.tan(radians)) / Math.PI) * 0.5 * count);
}

function latitudeAtTileY(y, zoom) {
  const count = 2 ** zoom;
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / count))) * 180 / Math.PI;
}

function longitudeAtTileX(x, zoom) {
  return x / (2 ** zoom) * 360 - 180;
}

function detailZoomForDistance(distance) {
  if (distance > 1.72) return 0;
  if (distance > 1.42) return 4;
  if (distance > 1.22) return 6;
  if (distance > 1.09) return 8;
  return 9;
}

function patchRadiusForZoom(zoom) {
  if (zoom >= 8) return 2;
  return 1;
}

function buildTileGeometry(THREE, zoom, tileX, tileY) {
  const north = latitudeAtTileY(tileY, zoom);
  const south = latitudeAtTileY(tileY + 1, zoom);
  const west = longitudeAtTileX(tileX, zoom);
  const east = longitudeAtTileX(tileX + 1, zoom);
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= PATCH_SEGMENTS; row += 1) {
    const v = row / PATCH_SEGMENTS;
    const lat = north + (south - north) * v;
    for (let column = 0; column <= PATCH_SEGMENTS; column += 1) {
      const u = column / PATCH_SEGMENTS;
      const lon = west + (east - west) * u;
      const point = latLonToLocalPoint(lat, lon, TILE_RADIUS);
      positions.push(point.x, point.y, point.z);
      uvs.push(u, 1 - v);
    }
  }
  const rowSize = PATCH_SEGMENTS + 1;
  for (let row = 0; row < PATCH_SEGMENTS; row += 1) {
    for (let column = 0; column < PATCH_SEGMENTS; column += 1) {
      const a = row * rowSize + column;
      const b = a + 1;
      const c = a + rowSize;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createGlobeDetailTiles({ THREE, globeRoot, onInvalidate } = {}) {
  const group = new THREE.Group();
  group.name = 'globe-osm-detail-tiles';
  globeRoot.add(group);
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin?.('anonymous');
  let selection = null;
  let cameraDistance = 2.8;
  let publicationKey = '';
  let generation = 0;

  function clear() {
    generation += 1;
    while (group.children.length) {
      const child = group.children[group.children.length - 1];
      group.remove(child);
      child.geometry?.dispose?.();
      child.material?.map?.dispose?.();
      child.material?.dispose?.();
    }
    publicationKey = '';
  }

  function refresh() {
    const zoom = detailZoomForDistance(cameraDistance);
    group.visible = zoom > 0 && !!selection;
    if (!group.visible) return;
    const count = 2 ** zoom;
    const patchRadius = patchRadiusForZoom(zoom);
    const centerX = ((tileXAtLongitude(selection.lon, zoom) % count) + count) % count;
    const centerY = Math.max(0, Math.min(count - 1, tileYAtLatitude(selection.lat, zoom)));
    const nextKey = `${zoom}/${centerX}/${centerY}`;
    if (nextKey === publicationKey) return;
    clear();
    publicationKey = nextKey;
    const requestGeneration = generation;
    for (let dy = -patchRadius; dy <= patchRadius; dy += 1) {
      const tileY = centerY + dy;
      if (tileY < 0 || tileY >= count) continue;
      for (let dx = -patchRadius; dx <= patchRadius; dx += 1) {
        const tileX = ((centerX + dx) % count + count) % count;
        const geometry = buildTileGeometry(THREE, zoom, tileX, tileY);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        mesh.renderOrder = 2;
        group.add(mesh);
        loader.load(
          `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`,
          (texture) => {
            if (requestGeneration !== generation || !mesh.parent) {
              texture.dispose?.();
              return;
            }
            if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
              texture.colorSpace = THREE.SRGBColorSpace;
            }
            material.map = texture;
            material.needsUpdate = true;
            mesh.visible = true;
            onInvalidate?.();
          },
          undefined,
          () => {
            group.remove(mesh);
            geometry.dispose?.();
            material.dispose?.();
          }
        );
      }
    }
  }

  return {
    destroy() {
      clear();
      globeRoot.remove(group);
    },
    setCameraDistance(distance) {
      cameraDistance = Number(distance) || 2.8;
      refresh();
    },
    setSelection(next) {
      selection = next && Number.isFinite(Number(next.lat)) && Number.isFinite(Number(next.lon))
        ? { lat: Number(next.lat), lon: Number(next.lon) }
        : null;
      refresh();
    }
  };
}

export { detailZoomForDistance, patchRadiusForZoom };
