import { fieldCoordinate } from './field-study-contract.js';
import { validateOceanVoyage } from '../ocean/voyage-store.js';
export const marinePoint = (p) => p && ['x', 'y', 'z'].every((key) => Number.isFinite(p[key]));

export function requireMarineVoyage(value) {
  const v = validateOceanVoyage(value);
  if (!v || v.ship.transportCatalogId !== 'ocean-research-vessel')
    throw Error('Use a supported research vessel and its own submarine.');
  return v;
}
export function requireMarinePresence(active, e, now, { station = null, underwater = false } = {}) {
  const v = requireMarineVoyage(e?.voyage);
  if (
    v.id !== active.voyage.id ||
    v.ship.transportEntityId !== active.voyage.ship.transportEntityId ||
    v.subId !== active.voyage.subId ||
    e.shared === true ||
    e.liveGps === true ||
    e.paused !== false ||
    !Number.isFinite(e.at) ||
    e.at <= 0 ||
    Math.abs(e.at - now) > 2000 ||
    !fieldCoordinate(e.position) ||
    !marinePoint(e.localPosition) ||
    e.environment !== (underwater ? 'OCEAN' : 'EARTH') ||
    e.mode !== (underwater ? 'submarine' : 'research-deck') ||
    v.stage !== (underwater ? 'underwater' : 'aboard')
  )
    throw Error('Continue this survey on its original active vessel and submarine.');
  if (
    station &&
    (e.stationId !== station ||
      !Number.isFinite(e.stationDistanceMeters) ||
      e.stationDistanceMeters > 2.4 ||
      e.stationDistanceMeters < 0 ||
      e.moored !== true ||
      !Number.isFinite(e.speedMetersPerSecond) ||
      Math.abs(e.speedMetersPerSecond) > 0.5)
  )
    throw Error('Stop and moor the vessel, then walk to the named research station.');
  return v;
}
