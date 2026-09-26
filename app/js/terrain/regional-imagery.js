// Broad geographic colour, shared by near terrain and the distant terrain mesh.
// This is dated aerial/satellite imagery, not live weather, geometry or a bare-earth albedo product.
const R = 6378137;
const entries = new Map();
export function imageryMercator(lat, lon) {
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, lat));
  return { x: R * lon * Math.PI / 180, y: R * Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) };
}
export function regionalImagerySpec(lat, lon, spanMeters = 40000) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 84 || Math.abs(lon) > 180 || !Number.isFinite(spanMeters) || spanMeters <= 0 || spanMeters > 80000) return null;
  const center = imageryMercator(lat, lon);
  const half = spanMeters / 2 / Math.cos(lat * Math.PI / 180);
  // Avoid wrapping exports at the date line; semantic materials remain available.
  if (Math.abs(center.x) + half > Math.PI * R) return null;
  const bounds = [center.x - half, center.y - half, center.x + half, center.y + half];
  return { key: `${lat}:${lon}:${spanMeters}`, bounds };
}
// Use the provider's existing tile cache at both scales. Dynamic imagery
// exports can exceed the world-load budget even while cached tiles are healthy.
export function regionalImageryTileLayout(spec) {
  const [west, south, east, north] = spec.bounds, circumference = 2 * Math.PI * R;
  const zoom = Math.max(0, Math.min(18, Math.floor(Math.log2(circumference * 2048 / ((east - west) * 256)))));
  const tileSpan = circumference / 2 ** zoom, origin = circumference / 2;
  const minX = Math.floor((west + origin) / tileSpan), maxX = Math.ceil((east + origin) / tileSpan) - 1;
  const minY = Math.floor((origin - north) / tileSpan), maxY = Math.ceil((origin - south) / tileSpan) - 1;
  const tiles = [];
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    tiles.push({ x, y, zoom, left: (x * tileSpan - origin - west) / (east - west) * 2048,
      top: (north - (origin - y * tileSpan)) / (north - south) * 2048,
      size: tileSpan / (east - west) * 2048 });
  }
  if (tiles.length > 81) throw Error('Imagery tile budget exceeded');
  return tiles;
}
async function loadCachedImage(spec, signal) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
  const context = canvas.getContext('2d');
  const tiles = regionalImageryTileLayout(spec); let next = 0;
  async function worker() {
    while (next < tiles.length) {
      signal.throwIfAborted();
      const tile = tiles[next++];
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${tile.zoom}/${tile.y}/${tile.x}`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw Error(`Imagery tile HTTP ${response.status}`);
      const blob = await response.blob();
      if (blob.size > 1024 * 1024 || !blob.type.startsWith('image/')) throw Error('Invalid imagery tile');
      const image = await createImageBitmap(blob);
      try {
        signal.throwIfAborted();
        if (image.width !== 256 || image.height !== 256) throw Error('Unexpected imagery tile dimensions');
        context.drawImage(image, tile.left, tile.top, tile.size, tile.size);
      } finally { image.close(); }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return canvas;
}
export function regionalImageryUv(spec, lat, lon) {
  const p = imageryMercator(lat, lon), [west, south, east, north] = spec.bounds;
  return [(p.x - west) / (east - west), (p.y - south) / (north - south)];
}
function loadEntry(spec) {
  const entry = { spec, users: new Set(), controller: new AbortController(), texture: null, status: 'loading' };
  entries.set(spec.key, entry);
  entry.promise = (async () => {
    for (let attempt = 0; attempt < 2 && !entry.controller.signal.aborted; attempt++) {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      entry.controller.signal.addEventListener('abort', cancel, { once: true });
      const timer = setTimeout(cancel, attempt ? 12000 : 8000);
      try {
        const image = await loadCachedImage(spec, controller.signal);
        if (controller.signal.aborted) throw Error('Imagery decode timed out');
        const texture = new THREE.Texture(image);
        texture.name = 'Esri World Imagery regional colour';
        texture.encoding = THREE.sRGBEncoding;
        texture.needsUpdate = true;
        entry.texture = texture; entry.status = 'available';
        for (const update of entry.users) update(entry);
        return;
      } catch (error) {
        controller.abort();
        entry.error = String(error?.message || error).slice(0, 180);
        entry.status = entry.controller.signal.aborted ? 'cancelled' : attempt === 0 ? 'retrying' : 'unavailable';
        for (const update of entry.users) update(entry);
      } finally {
        clearTimeout(timer); entry.controller.signal.removeEventListener('abort', cancel);
      }
    }
  })();
  return entry;
}
export function attachRegionalImagery(mesh, ctx, uniforms) {
  if (mesh.userData.regionalImagery || Number(ctx.renderer?.capabilities?.maxTextures || 0) < 16) return false;
  const spec = regionalImagerySpec(Number(ctx.LOC?.lat), Number(ctx.LOC?.lon));
  const positions = mesh.geometry?.attributes?.position;
  const toGeo = ctx.worldToGeo || ctx.worldToLatLon;
  if (!spec || !positions || typeof toGeo !== 'function') return false;
  mesh.updateMatrixWorld(true);
  const uv = new Float32Array(positions.count * 2), point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
    const geo = toGeo(point.x, point.z);
    uv.set(regionalImageryUv(spec, geo.lat, geo.lon), i * 2);
  }
  mesh.geometry.setAttribute('terrainGeographicUv', new THREE.BufferAttribute(uv, 2));
  const provenance = mesh.userData.regionalImagery = { status: 'loading', source: 'Esri World Imagery', attribution: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community', representation: 'dated imagery colour with procedural surface detail', bounds: spec.bounds };
  const localSpec = regionalImagerySpec(Number(ctx.LOC.lat), Number(ctx.LOC.lon), 6000);
  const subscriptions = [];
  for (const [layerSpec, map, ready, status] of [
    [spec, 'terrainRegionalMap', 'terrainRegionalReady', 'status'],
    [localSpec, 'terrainLocalMap', 'terrainLocalReady', 'localStatus']
  ]) {
    if (!layerSpec || !uniforms[map]) continue;
    const entry = entries.get(layerSpec.key) || loadEntry(layerSpec);
    const update = current => {
      provenance[status] = current.status;
      if (current.error && current.status === 'unavailable') provenance[`${status}Error`] = current.error;
      if (current.texture) {
        uniforms[map].value = current.texture; uniforms[ready].value = 1;
        const credit = globalThis.document?.getElementById?.('terrainImageryCredit');
        if (credit) credit.hidden = false;
      }
    };
    entry.users.add(update); update(entry); subscriptions.push({ entry, update });
  }
  const material = mesh.material;
  const release = () => {
    material.removeEventListener('dispose', release);
    for (const { entry, update } of subscriptions) {
      entry.users.delete(update);
      if (!entry.users.size) {
        entry.controller.abort(); entry.texture?.dispose();
        if (entries.get(entry.spec.key) === entry) entries.delete(entry.spec.key);
      }
    }
    const credit = globalThis.document?.getElementById?.('terrainImageryCredit');
    if (credit) credit.hidden = ![...entries.values()].some(entry => entry.texture && entry.users.size);
  };
  material.addEventListener('dispose', release);
  material.defines = { ...material.defines, WE3D_TERRAIN_REGIONAL_IMAGE: 1 };
  material.needsUpdate = true;
  return true;
}
