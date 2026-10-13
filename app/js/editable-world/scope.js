// Creative records use the existing environment and room owners. A room's
// local coordinates are meaningful only in its declared world frame.
export function creativeEnvironment(appCtx) {
  const environment = appCtx?.getEnv?.();
  if (environment && environment !== 'EARTH') return String(environment).toLowerCase();
  if (appCtx?.onMoon) return 'moon';
  if (appCtx?.onMars) return 'mars';
  if (appCtx?.activePlanetaryBodyId) return 'planetary';
  return 'earth';
}

export function roomEditFrame(world) {
  if (!world || typeof world !== 'object') return null;
  const kind = String(world.kind || 'earth').toLowerCase();
  if (kind === 'moon') return Object.freeze({ kind });
  if (kind !== 'earth' || !Number.isFinite(world.lat) || !Number.isFinite(world.lon)
    || Math.abs(world.lat) > 90 || Math.abs(world.lon) > 180) return null;
  return Object.freeze({ kind, lat: world.lat, lon: world.lon });
}

export function isRoomEditFrameCurrent(appCtx, frame) {
  if (!frame || creativeEnvironment(appCtx) !== frame.kind) return false;
  if (frame.kind === 'moon') return true;
  const origin = appCtx?.LOC;
  if (!Number.isFinite(origin?.lat) || !Number.isFinite(origin?.lon)) return false;
  const longitudeDifference = ((origin.lon - frame.lon + 540) % 360) - 180;
  return Math.abs(origin.lat - frame.lat) < 1e-7 && Math.abs(longitudeDifference) < 1e-7;
}
