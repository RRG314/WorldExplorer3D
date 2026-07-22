const EARTH_CELL_ZOOM = 16;
const PLANETARY_CELL_METERS = 256;
const SPACE_SECTOR_METERS = 1e9;
const EARTH_RADIUS_METERS = 6378137;
const WORLD_KINDS = Object.freeze([
  'earth',
  'moon',
  'mars',
  'space',
  'custom_space',
  'custom_planet',
  'custom_world'
]);

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapLongitude(value) {
  let lon = finiteNumber(value, 0);
  while (lon < -180) lon += 360;
  while (lon >= 180) lon -= 360;
  return lon;
}

function normalizeWorldRef(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const requestedKind = String(source.kind || '').trim().toLowerCase();
  const kind = WORLD_KINDS.includes(requestedKind) ? requestedKind : 'earth';
  const bodyFallback = kind === 'custom_planet' || kind === 'custom_world' ? 'creator-world' : kind;
  const bodyId = String(source.bodyId || bodyFallback).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-').slice(0, 80) || bodyFallback;
  return Object.freeze({
    kind,
    bodyId,
    lat: clamp(finiteNumber(source.lat, 0), -90, 90),
    lon: wrapLongitude(source.lon),
    x: finiteNumber(source.x, 0),
    y: finiteNumber(source.y, 0),
    z: finiteNumber(source.z, 0)
  });
}

function earthCellCoordinates(lat, lon, zoom = EARTH_CELL_ZOOM) {
  const safeZoom = Math.max(0, Math.min(22, Math.floor(finiteNumber(zoom, EARTH_CELL_ZOOM))));
  const size = 2 ** safeZoom;
  const safeLat = clamp(finiteNumber(lat, 0), -85.05112878, 85.05112878);
  const safeLon = wrapLongitude(lon);
  const latRad = safeLat * Math.PI / 180;
  const x = Math.floor(((safeLon + 180) / 360) * size);
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * size);
  return { zoom: safeZoom, x: clamp(x, 0, size - 1), y: clamp(y, 0, size - 1) };
}

function metricCellCoordinates(x, z, cellSize = PLANETARY_CELL_METERS) {
  const size = Math.max(1, finiteNumber(cellSize, PLANETARY_CELL_METERS));
  return { x: Math.floor(finiteNumber(x, 0) / size), z: Math.floor(finiteNumber(z, 0) / size), size };
}

function worldCellKey(worldInput = {}) {
  const world = normalizeWorldRef(worldInput);
  if (world.kind === 'earth') {
    const cell = earthCellCoordinates(world.lat, world.lon);
    return `earth:${cell.zoom}:${cell.x}:${cell.y}`;
  }
  const cellSize = world.kind === 'space' || world.kind === 'custom_space'
    ? SPACE_SECTOR_METERS
    : PLANETARY_CELL_METERS;
  const cell = metricCellCoordinates(world.x, world.z, cellSize);
  return `${world.kind}:${world.bodyId}:${cell.x}:${cell.z}`;
}

function worldAtLocalOffset(worldInput = {}, localX = 0, localZ = 0) {
  const world = normalizeWorldRef(worldInput);
  const x = finiteNumber(localX, 0);
  const z = finiteNumber(localZ, 0);
  if (world.kind !== 'earth') {
    return normalizeWorldRef({ ...world, x: world.x + x, z: world.z + z });
  }
  const latRadians = world.lat * Math.PI / 180;
  const latitude = world.lat + (z / EARTH_RADIUS_METERS) * 180 / Math.PI;
  const longitudeScale = Math.max(0.01, Math.cos(latRadians));
  const longitude = world.lon + (x / (EARTH_RADIUS_METERS * longitudeScale)) * 180 / Math.PI;
  return normalizeWorldRef({ ...world, lat: latitude, lon: longitude });
}

function worldCellNeighborhood(worldInput = {}, radiusInput = 1) {
  const world = normalizeWorldRef(worldInput);
  const radius = clamp(Math.floor(finiteNumber(radiusInput, 1)), 0, 4);
  const keys = [];
  if (world.kind === 'earth') {
    const center = earthCellCoordinates(world.lat, world.lon);
    const size = 2 ** center.zoom;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = clamp(center.y + dy, 0, size - 1);
      for (let dx = -radius; dx <= radius; dx++) {
        const x = ((center.x + dx) % size + size) % size;
        keys.push(`earth:${center.zoom}:${x}:${y}`);
      }
    }
    return keys;
  }
  const cellSize = world.kind === 'space' || world.kind === 'custom_space'
    ? SPACE_SECTOR_METERS
    : PLANETARY_CELL_METERS;
  const center = metricCellCoordinates(world.x, world.z, cellSize);
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      keys.push(`${world.kind}:${world.bodyId}:${center.x + dx}:${center.z + dz}`);
    }
  }
  return keys;
}

export {
  EARTH_CELL_ZOOM,
  EARTH_RADIUS_METERS,
  PLANETARY_CELL_METERS,
  SPACE_SECTOR_METERS,
  WORLD_KINDS,
  earthCellCoordinates,
  metricCellCoordinates,
  normalizeWorldRef,
  worldAtLocalOffset,
  worldCellKey,
  worldCellNeighborhood,
  wrapLongitude
};
