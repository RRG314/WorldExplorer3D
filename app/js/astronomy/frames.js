import { getAstronomicalBody } from './body-catalog.js?v=1';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const FRAME_SCHEMA_VERSION = 1;

const FRAME_KIND = Object.freeze({
  SYSTEM_INERTIAL: 'system_inertial',
  BODY_CENTERED_INERTIAL: 'body_centered_inertial',
  BODY_FIXED: 'body_fixed',
  LOCAL_TANGENT: 'local_tangent',
  RENDER: 'render'
});

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function normalizeLatitudeDeg(value) {
  const latitude = finiteNumber(value, 'Latitude');
  if (latitude < -90 || latitude > 90) throw new RangeError('Latitude must be between -90 and 90 degrees.');
  return Object.is(latitude, -0) ? 0 : latitude;
}

function normalizePositiveEastLongitudeDeg(value) {
  const longitude = finiteNumber(value, 'Longitude');
  const normalized = ((longitude % 360) + 360) % 360;
  return Object.is(normalized, -0) || Math.abs(normalized - 360) < 1e-12 ? 0 : normalized;
}

function resolveSurfaceBody(bodyValue) {
  const body = getAstronomicalBody(bodyValue);
  if (!body) throw new RangeError(`Unknown astronomical body: ${bodyValue}`);
  if (!body.exploration.surfaceRegionEligible) {
    throw new RangeError(`${body.name} does not publish a solid surface region.`);
  }
  return body;
}

function bodyFixedFrameId(bodyValue) {
  const body = getAstronomicalBody(bodyValue);
  if (!body) throw new RangeError(`Unknown astronomical body: ${bodyValue}`);
  return `body-fixed:${body.id}:${body.frames.bodyFixed}`;
}

function planetocentricToBodyFixed(bodyValue, coordinates = {}) {
  const body = resolveSurfaceBody(bodyValue);
  const latitudeDeg = normalizeLatitudeDeg(coordinates.latitudeDeg);
  const longitudeDegPositiveEast = normalizePositiveEastLongitudeDeg(coordinates.longitudeDegPositiveEast);
  const heightM = finiteNumber(coordinates.heightM ?? 0, 'Height');
  const latitude = latitudeDeg * DEG_TO_RAD;
  const longitude = longitudeDegPositiveEast * DEG_TO_RAD;
  const radiusM = body.physical.meanRadiusM + heightM;
  if (radiusM <= 0) throw new RangeError('Height places the coordinate at or below the body center.');
  const cosLatitude = Math.cos(latitude);

  return Object.freeze({
    frameId: bodyFixedFrameId(body.id),
    bodyId: body.id,
    xM: radiusM * cosLatitude * Math.cos(longitude),
    yM: radiusM * cosLatitude * Math.sin(longitude),
    zM: radiusM * Math.sin(latitude)
  });
}

function bodyFixedToPlanetocentric(bodyValue, position = {}) {
  const body = resolveSurfaceBody(bodyValue);
  const xM = finiteNumber(position.xM, 'Body-fixed x');
  const yM = finiteNumber(position.yM, 'Body-fixed y');
  const zM = finiteNumber(position.zM, 'Body-fixed z');
  const radiusM = Math.hypot(xM, yM, zM);
  if (radiusM <= 0) throw new RangeError('Body-fixed position cannot be the body center.');
  return Object.freeze({
    bodyId: body.id,
    frameId: bodyFixedFrameId(body.id),
    latitudeDeg: Math.asin(zM / radiusM) * RAD_TO_DEG,
    longitudeDegPositiveEast: normalizePositiveEastLongitudeDeg(Math.atan2(yM, xM) * RAD_TO_DEG),
    heightM: radiusM - body.physical.meanRadiusM
  });
}

function createLocalTangentFrame(bodyValue, origin = {}) {
  const body = resolveSurfaceBody(bodyValue);
  const latitudeDeg = normalizeLatitudeDeg(origin.latitudeDeg);
  const longitudeDegPositiveEast = normalizePositiveEastLongitudeDeg(origin.longitudeDegPositiveEast);
  const heightM = finiteNumber(origin.heightM ?? 0, 'Origin height');
  const latitude = latitudeDeg * DEG_TO_RAD;
  const longitude = longitudeDegPositiveEast * DEG_TO_RAD;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinLongitude = Math.sin(longitude);
  const cosLongitude = Math.cos(longitude);
  const bodyFixedOrigin = planetocentricToBodyFixed(body.id, {
    latitudeDeg,
    longitudeDegPositiveEast,
    heightM
  });

  return Object.freeze({
    schemaVersion: FRAME_SCHEMA_VERSION,
    kind: FRAME_KIND.LOCAL_TANGENT,
    id: `local-tangent:${body.id}:${latitudeDeg.toFixed(7)}:${longitudeDegPositiveEast.toFixed(7)}:${heightM.toFixed(2)}`,
    bodyId: body.id,
    parentFrameId: bodyFixedFrameId(body.id),
    origin: Object.freeze({ latitudeDeg, longitudeDegPositiveEast, heightM }),
    bodyFixedOrigin,
    // Right-handed East/Up/North basis in the body's fixed Cartesian frame.
    basis: Object.freeze({
      east: Object.freeze({ x: -sinLongitude, y: cosLongitude, z: 0 }),
      up: Object.freeze({ x: cosLatitude * cosLongitude, y: cosLatitude * sinLongitude, z: sinLatitude }),
      north: Object.freeze({ x: -sinLatitude * cosLongitude, y: -sinLatitude * sinLongitude, z: cosLatitude })
    })
  });
}

function localTangentToBodyFixed(frame, local = {}) {
  if (frame?.kind !== FRAME_KIND.LOCAL_TANGENT) throw new TypeError('A local tangent frame is required.');
  const eastM = finiteNumber(local.eastM ?? 0, 'Local east');
  const upM = finiteNumber(local.upM ?? 0, 'Local up');
  const northM = finiteNumber(local.northM ?? 0, 'Local north');
  const origin = frame.bodyFixedOrigin;
  const basis = frame.basis;
  return Object.freeze({
    frameId: frame.parentFrameId,
    bodyId: frame.bodyId,
    xM: origin.xM + basis.east.x * eastM + basis.up.x * upM + basis.north.x * northM,
    yM: origin.yM + basis.east.y * eastM + basis.up.y * upM + basis.north.y * northM,
    zM: origin.zM + basis.east.z * eastM + basis.up.z * upM + basis.north.z * northM
  });
}

function bodyFixedToLocalTangent(frame, position = {}) {
  if (frame?.kind !== FRAME_KIND.LOCAL_TANGENT) throw new TypeError('A local tangent frame is required.');
  if (position.bodyId && position.bodyId !== frame.bodyId) throw new RangeError('Cannot convert a position from another body.');
  const dx = finiteNumber(position.xM, 'Body-fixed x') - frame.bodyFixedOrigin.xM;
  const dy = finiteNumber(position.yM, 'Body-fixed y') - frame.bodyFixedOrigin.yM;
  const dz = finiteNumber(position.zM, 'Body-fixed z') - frame.bodyFixedOrigin.zM;
  const dot = (basis) => dx * basis.x + dy * basis.y + dz * basis.z;
  return Object.freeze({
    frameId: frame.id,
    bodyId: frame.bodyId,
    eastM: dot(frame.basis.east),
    upM: dot(frame.basis.up),
    northM: dot(frame.basis.north)
  });
}

function createRenderFrame(options = {}) {
  const parentFrameId = String(options.parentFrameId || '').trim();
  if (!parentFrameId) throw new TypeError('Render frame requires a parent frame ID.');
  const metersPerUnit = finiteNumber(options.metersPerUnit, 'Meters per render unit');
  if (metersPerUnit <= 0) throw new RangeError('Meters per render unit must be positive.');
  const timestampS = finiteNumber(options.timestampS ?? 0, 'Render frame timestamp');
  const originM = Object.freeze({
    x: finiteNumber(options.originM?.x ?? 0, 'Render origin x'),
    y: finiteNumber(options.originM?.y ?? 0, 'Render origin y'),
    z: finiteNumber(options.originM?.z ?? 0, 'Render origin z')
  });
  return Object.freeze({
    schemaVersion: FRAME_SCHEMA_VERSION,
    kind: FRAME_KIND.RENDER,
    id: String(options.id || `render:${parentFrameId}:${timestampS}:${metersPerUnit}`),
    parentFrameId,
    timestampS,
    metersPerUnit,
    originM
  });
}

function physicalToRender(frame, positionM = {}) {
  if (frame?.kind !== FRAME_KIND.RENDER) throw new TypeError('A render frame is required.');
  return Object.freeze({
    frameId: frame.id,
    x: (finiteNumber(positionM.x, 'Physical x') - frame.originM.x) / frame.metersPerUnit,
    y: (finiteNumber(positionM.y, 'Physical y') - frame.originM.y) / frame.metersPerUnit,
    z: (finiteNumber(positionM.z, 'Physical z') - frame.originM.z) / frame.metersPerUnit
  });
}

function renderToPhysical(frame, position = {}) {
  if (frame?.kind !== FRAME_KIND.RENDER) throw new TypeError('A render frame is required.');
  return Object.freeze({
    frameId: frame.parentFrameId,
    x: frame.originM.x + finiteNumber(position.x, 'Render x') * frame.metersPerUnit,
    y: frame.originM.y + finiteNumber(position.y, 'Render y') * frame.metersPerUnit,
    z: frame.originM.z + finiteNumber(position.z, 'Render z') * frame.metersPerUnit
  });
}

export {
  bodyFixedFrameId,
  bodyFixedToLocalTangent,
  bodyFixedToPlanetocentric,
  createLocalTangentFrame,
  createRenderFrame,
  FRAME_KIND,
  FRAME_SCHEMA_VERSION,
  localTangentToBodyFixed,
  normalizeLatitudeDeg,
  normalizePositiveEastLongitudeDeg,
  physicalToRender,
  planetocentricToBodyFixed,
  renderToPhysical
};
