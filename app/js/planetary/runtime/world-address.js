import { getAstronomicalBody, normalizeAstronomicalBodyId } from '../../astronomy/body-catalog.js?v=1';
import {
  bodyFixedFrameId,
  normalizeLatitudeDeg,
  normalizePositiveEastLongitudeDeg
} from '../../astronomy/frames.js?v=1';

const WORLD_ADDRESS_SCHEMA_VERSION = 1;
const WORLD_ADDRESS_COORDINATE_KIND = Object.freeze({
  PLANETOCENTRIC: 'planetocentric_lat_lon'
});
const WORLD_ADDRESS_SCOPE = Object.freeze({
  LOCAL: 'local',
  PLAYER: 'player',
  ROOM: 'room',
  WORLD: 'world'
});
const VALID_SCOPES = new Set(Object.values(WORLD_ADDRESS_SCOPE));

function cleanIdentity(value, label, maxLength = 120) {
  const clean = String(value || '').trim();
  if (!clean) throw new TypeError(`${label} is required.`);
  if (clean.length > maxLength) throw new RangeError(`${label} exceeds ${maxLength} characters.`);
  if (!/^[A-Za-z0-9._:-]+$/.test(clean)) throw new RangeError(`${label} contains unsupported characters.`);
  return clean;
}

function rounded(value, decimals) {
  const factor = 10 ** decimals;
  const result = Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function createWorldAddress(input = {}) {
  const bodyId = normalizeAstronomicalBodyId(input.bodyId);
  const body = bodyId ? getAstronomicalBody(bodyId) : null;
  if (!body) throw new RangeError(`Unknown world-address body: ${input.bodyId}`);
  if (!body.exploration.surfaceRegionEligible) {
    throw new RangeError(`${body.name} cannot own a solid-surface world address.`);
  }
  const coordinateKind = input.coordinateKind || WORLD_ADDRESS_COORDINATE_KIND.PLANETOCENTRIC;
  if (coordinateKind !== WORLD_ADDRESS_COORDINATE_KIND.PLANETOCENTRIC) {
    throw new RangeError(`Unsupported coordinate kind: ${coordinateKind}`);
  }
  const scopeType = String(input.scopeType || WORLD_ADDRESS_SCOPE.LOCAL).trim().toLowerCase();
  if (!VALID_SCOPES.has(scopeType)) throw new RangeError(`Unsupported world-address scope: ${scopeType}`);

  const address = {
    schemaVersion: WORLD_ADDRESS_SCHEMA_VERSION,
    systemId: cleanIdentity(input.systemId || 'sol', 'System ID'),
    bodyId: body.id,
    bodyFixedFrameId: bodyFixedFrameId(body.id),
    coordinateKind,
    latitudeDeg: rounded(normalizeLatitudeDeg(input.latitudeDeg), 7),
    longitudeDegPositiveEast: rounded(normalizePositiveEastLongitudeDeg(input.longitudeDegPositiveEast), 7),
    heightM: rounded(Number(input.heightM ?? 0), 2),
    regionId: cleanIdentity(input.regionId, 'Region ID'),
    scopeType,
    scopeId: cleanIdentity(input.scopeId || scopeType, 'Scope ID')
  };
  if (!Number.isFinite(address.heightM)) throw new TypeError('Height must be a finite number.');
  return Object.freeze(address);
}

function worldAddressKey(addressInput) {
  const address = addressInput?.schemaVersion === WORLD_ADDRESS_SCHEMA_VERSION
    ? createWorldAddress(addressInput)
    : createWorldAddress(addressInput);
  return [
    'we3d-world',
    `v${WORLD_ADDRESS_SCHEMA_VERSION}`,
    address.systemId,
    address.bodyId,
    address.bodyFixedFrameId,
    address.coordinateKind,
    address.latitudeDeg.toFixed(7),
    address.longitudeDegPositiveEast.toFixed(7),
    address.heightM.toFixed(2),
    address.regionId,
    address.scopeType,
    address.scopeId
  ].join(':');
}

function serializeWorldAddress(addressInput) {
  const address = createWorldAddress(addressInput);
  return JSON.stringify(address);
}

function parseWorldAddress(serialized) {
  let parsed;
  try {
    parsed = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  } catch (error) {
    throw new TypeError(`World address is not valid JSON: ${error?.message || String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object') throw new TypeError('World address must be an object.');
  if (Number(parsed.schemaVersion) !== WORLD_ADDRESS_SCHEMA_VERSION) {
    throw new RangeError(`Unsupported world-address schema version: ${parsed.schemaVersion}`);
  }
  return createWorldAddress(parsed);
}

function migrateLegacyEarthLocation(legacy = {}, options = {}) {
  const latitudeDeg = Number(legacy.lat ?? legacy.latitude);
  const longitudeDeg = Number(legacy.lon ?? legacy.lng ?? legacy.longitude);
  if (!Number.isFinite(latitudeDeg) || !Number.isFinite(longitudeDeg)) {
    throw new TypeError('Legacy Earth location requires finite latitude and longitude.');
  }
  return createWorldAddress({
    systemId: 'sol',
    bodyId: 'earth',
    latitudeDeg,
    longitudeDegPositiveEast: longitudeDeg,
    heightM: Number(options.heightM ?? legacy.heightM ?? 0),
    regionId: options.regionId || `earth-${latitudeDeg.toFixed(5)}-${longitudeDeg.toFixed(5)}`.replace(/\+/g, ''),
    scopeType: options.scopeType || WORLD_ADDRESS_SCOPE.LOCAL,
    scopeId: options.scopeId || WORLD_ADDRESS_SCOPE.LOCAL
  });
}

function worldAddressesShareRegion(aInput, bInput) {
  const a = parseWorldAddress(aInput);
  const b = parseWorldAddress(bInput);
  return a.systemId === b.systemId &&
    a.bodyId === b.bodyId &&
    a.regionId === b.regionId &&
    a.scopeType === b.scopeType &&
    a.scopeId === b.scopeId;
}

export {
  createWorldAddress,
  migrateLegacyEarthLocation,
  parseWorldAddress,
  serializeWorldAddress,
  WORLD_ADDRESS_COORDINATE_KIND,
  WORLD_ADDRESS_SCHEMA_VERSION,
  WORLD_ADDRESS_SCOPE,
  worldAddressKey,
  worldAddressesShareRegion
};
