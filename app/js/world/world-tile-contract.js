const WORLD_TILE_SCHEMA_VERSION = 1;
const WORLD_TILE_RECORD_KINDS = Object.freeze([
  'transport',
  'buildings',
  'structures',
  'water',
  'landCover',
  'vegetation',
  'pois'
]);

function invariant(condition, message) {
  if (!condition) throw new TypeError(message);
}

function finiteNumber(value, label) {
  const number = Number(value);
  invariant(Number.isFinite(number), `${label} must be a finite number.`);
  return number;
}

function nonNegativeInteger(value, label) {
  const number = Number(value);
  invariant(Number.isSafeInteger(number) && number >= 0, `${label} must be a non-negative integer.`);
  return number;
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value) || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function createTileAddress(address = {}) {
  const z = nonNegativeInteger(address.z, 'Tile zoom');
  invariant(z <= 24, 'Tile zoom must not exceed 24.');
  const tileCount = 2 ** z;
  const x = nonNegativeInteger(address.x, 'Tile x');
  const y = nonNegativeInteger(address.y, 'Tile y');
  invariant(x < tileCount && y < tileCount, `Tile coordinates must be inside zoom ${z}.`);
  return Object.freeze({ z, x, y, key: `${z}/${x}/${y}` });
}

function createGeographicBounds(address) {
  const tileCount = 2 ** address.z;
  const longitude = (x) => x / tileCount * 360 - 180;
  const latitude = (y) => {
    const mercatorY = Math.PI * (1 - 2 * y / tileCount);
    return Math.atan(Math.sinh(mercatorY)) * 180 / Math.PI;
  };
  return Object.freeze({
    west: longitude(address.x),
    south: latitude(address.y + 1),
    east: longitude(address.x + 1),
    north: latitude(address.y)
  });
}

function normalizeOrigin(origin = {}) {
  const lat = finiteNumber(origin.lat, 'Tile origin latitude');
  const lon = finiteNumber(origin.lon, 'Tile origin longitude');
  invariant(lat >= -90 && lat <= 90, 'Tile origin latitude is out of range.');
  invariant(lon >= -180 && lon <= 180, 'Tile origin longitude is out of range.');
  return Object.freeze({ lat, lon });
}

function normalizeSource(source = {}) {
  invariant(source.authority === 'openstreetmap', 'WorldTile source authority must be openstreetmap.');
  invariant(source.adapter === 'shortbread-v1', 'WorldTile source adapter must be shortbread-v1.');
  const revision = String(source.revision || 'live').trim();
  invariant(revision.length > 0, 'WorldTile source revision is required.');
  return Object.freeze({
    authority: 'openstreetmap',
    adapter: 'shortbread-v1',
    revision
  });
}

function normalizeRecords(records = {}) {
  const normalized = {};
  const identities = new Set();
  for (const kind of WORLD_TILE_RECORD_KINDS) {
    const values = records[kind] ?? [];
    invariant(Array.isArray(values), `WorldTile ${kind} records must be an array.`);
    normalized[kind] = values.map((record, index) => {
      invariant(record && typeof record === 'object', `WorldTile ${kind}[${index}] must be an object.`);
      const id = String(record.id || '').trim();
      invariant(id.length > 0, `WorldTile ${kind}[${index}] requires an id.`);
      invariant(!identities.has(id), `WorldTile record id "${id}" is duplicated.`);
      identities.add(id);
      return record;
    });
  }
  return normalized;
}

function createWorldTile(options = {}) {
  const address = createTileAddress(options.address);
  const generation = nonNegativeInteger(options.generation ?? 0, 'WorldTile generation');
  const records = normalizeRecords(options.records);
  const counts = {};
  let recordCount = 0;
  for (const kind of WORLD_TILE_RECORD_KINDS) {
    counts[kind] = records[kind].length;
    recordCount += counts[kind];
  }

  return deepFreeze({
    schemaVersion: WORLD_TILE_SCHEMA_VERSION,
    id: `${address.key}@${generation}`,
    address,
    generation,
    bounds: createGeographicBounds(address),
    origin: normalizeOrigin(options.origin),
    source: normalizeSource(options.source),
    records,
    summary: {
      recordCount,
      counts
    }
  });
}

export {
  WORLD_TILE_RECORD_KINDS,
  WORLD_TILE_SCHEMA_VERSION,
  createTileAddress,
  createWorldTile,
  deepFreeze
};
