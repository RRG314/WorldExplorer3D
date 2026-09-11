const ROOM_CODE_LENGTH = 6;

function normalizeSeedRoomCode(input) {
  return String(input || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

function normalizeSeedWorld(world = {}) {
  const lat = Number(world.lat);
  const lon = Number(world.lon);
  const kindRaw = String(world.kind || '').toLowerCase();
  const kind = kindRaw === 'moon' || kindRaw === 'space' ? kindRaw : 'earth';
  const normalizedLat = Number.isFinite(lat) ? lat : 0;
  const normalizedLon = Number.isFinite(lon) ? lon : 0;
  return {
    kind,
    seed: String(world.seed || '').trim() || `latlon:${normalizedLat.toFixed(5)},${normalizedLon.toFixed(5)}`,
    lat: normalizedLat,
    lon: normalizedLon
  };
}

function hashStringToUint32(input) {
  const text = String(input || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function deriveRoomDeterministicSeed(roomLike = {}) {
  const roomId = normalizeSeedRoomCode(roomLike.code || roomLike.id || '');
  const world = normalizeSeedWorld(roomLike.world || {});
  const rawSeed = String(world.seed || '').trim();
  const numericSeed = Number(rawSeed);
  if (Number.isFinite(numericSeed)) return (Math.floor(numericSeed) | 0) >>> 0;
  const baseSeed = rawSeed || `${world.kind}:${world.lat.toFixed(6)},${world.lon.toFixed(6)}`;
  return hashStringToUint32(`${baseSeed}|${world.kind}|${world.lat.toFixed(6)}|${world.lon.toFixed(6)}|${roomId}`) >>> 0;
}

export { deriveRoomDeterministicSeed, hashStringToUint32 };
