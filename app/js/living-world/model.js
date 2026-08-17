import { hashGeoToInt, seededRandom } from '../rdt.js?v=7';

const LIVING_WORLD_SCHEMA_VERSION = 1;
const WORLD_IDENTITY_COORDINATE_SCALE = 1e7;

function finiteCoordinate(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    throw new TypeError(`Living World ${label} must be between ${minimum} and ${maximum}.`);
  }
  return number;
}

function stableLocationKey(value) {
  const key = String(value || 'custom').trim().toLowerCase();
  return key || 'custom';
}

function immutablePlainValue(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutablePlainValue));
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Living World publications require plain canonical data.');
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, immutablePlainValue(nested)])
  ));
}

function createStableWorldIdentity(request, options = {}) {
  if (!request?.location || !request?.id) {
    throw new TypeError('Living World identity requires a WorldLoadRequest.');
  }
  const latitude = finiteCoordinate(request.location.lat, -90, 90, 'latitude');
  const longitude = finiteCoordinate(request.location.lon, -180, 180, 'longitude');
  const latitudeE7 = Math.round(latitude * WORLD_IDENTITY_COORDINATE_SCALE);
  const longitudeE7 = Math.round(longitude * WORLD_IDENTITY_COORDINATE_SCALE);
  const worldKind = String(options.worldKind || 'earth').trim().toLowerCase() || 'earth';
  const locationKey = stableLocationKey(options.locationKey || request.selection?.key);
  const dataProfile = String(options.dataProfile || 'fixed-earth-v1').trim().toLowerCase() || 'fixed-earth-v1';
  const deterministicSeed = hashGeoToInt(
    latitude,
    longitude,
    LIVING_WORLD_SCHEMA_VERSION
  );

  return Object.freeze({
    type: 'WorldIdentity',
    schemaVersion: LIVING_WORLD_SCHEMA_VERSION,
    id: [
      'world-identity',
      `v${LIVING_WORLD_SCHEMA_VERSION}`,
      encodeURIComponent(worldKind),
      latitudeE7,
      longitudeE7,
      encodeURIComponent(locationKey),
      encodeURIComponent(dataProfile)
    ].join(':'),
    worldKind,
    locationKey,
    latitudeE7,
    longitudeE7,
    location: Object.freeze({ lat: latitude, lon: longitude }),
    dataProfile,
    deterministicSeed
  });
}

function createWorldRandom(worldIdentity, discriminator = 0) {
  if (worldIdentity?.type !== 'WorldIdentity') {
    throw new TypeError('Deterministic Living World random requires a WorldIdentity.');
  }
  const numericDiscriminator = Number.isFinite(Number(discriminator))
    ? Math.floor(Number(discriminator))
    : 0;
  return seededRandom((worldIdentity.deterministicSeed ^ numericDiscriminator) >>> 0);
}

function canonicalGraph(name, graph = {}) {
  return immutablePlainValue({
    type: String(graph.type || name),
    schemaVersion: Number.isSafeInteger(graph.schemaVersion) ? graph.schemaVersion : 1,
    nodes: Array.isArray(graph.nodes) ? graph.nodes : [],
    edges: Array.isArray(graph.edges) ? graph.edges : [],
    provenance: graph.provenance || {},
    diagnostics: graph.diagnostics || {}
  });
}

function createLivingWorldPublication(options = {}) {
  const snapshot = options.snapshot;
  const worldIdentity = options.worldIdentity;
  if (snapshot?.type !== 'WorldSnapshot' || !Object.isFrozen(snapshot)) {
    throw new TypeError('Living World publication requires an immutable WorldSnapshot.');
  }
  if (worldIdentity?.type !== 'WorldIdentity' || !Object.isFrozen(worldIdentity)) {
    throw new TypeError('Living World publication requires an immutable WorldIdentity.');
  }
  if (
    snapshot.location?.lat !== worldIdentity.location.lat ||
    snapshot.location?.lon !== worldIdentity.location.lon
  ) {
    throw new TypeError('Living World publication identity does not match the WorldSnapshot location.');
  }

  return Object.freeze({
    type: 'LivingWorldPublication',
    schemaVersion: LIVING_WORLD_SCHEMA_VERSION,
    id: `living-world:${snapshot.requestId}`,
    requestId: snapshot.requestId,
    sequence: snapshot.sequence,
    worldIdentity,
    entrances: immutablePlainValue(Array.isArray(options.entrances) ? options.entrances : []),
    pedestrianGraph: canonicalGraph('PedestrianGraph', options.pedestrianGraph),
    trafficGraph: canonicalGraph('TrafficGraph', options.trafficGraph),
    semanticDensity: immutablePlainValue(options.semanticDensity || {}),
    provenance: immutablePlainValue(options.provenance || {}),
    diagnostics: immutablePlainValue(options.diagnostics || {})
  });
}

function createLivingWorldPublicationStore(options = {}) {
  const dispose = typeof options.dispose === 'function' ? options.dispose : () => {};
  let current = null;
  let revision = 0;

  function publish(publication, publishOptions = {}) {
    if (publication?.type !== 'LivingWorldPublication' || !Object.isFrozen(publication)) {
      throw new TypeError('Only an immutable LivingWorldPublication can be published.');
    }
    const expectedRequestId = String(publishOptions.expectedRequestId || publication.requestId);
    if (publication.requestId !== expectedRequestId) {
      return Object.freeze({ published: false, reason: 'request-mismatch', revision, current });
    }
    if (current === publication) {
      return Object.freeze({ published: true, reason: 'already-current', revision, current, previous: current });
    }
    const previous = current;
    current = publication;
    revision += 1;
    let disposeError = null;
    if (previous) {
      try {
        dispose(previous);
      } catch (error) {
        disposeError = String(error?.message || error);
      }
    }
    return Object.freeze({ published: true, reason: null, revision, current, previous, disposeError });
  }

  function clear(reason = 'cleared') {
    const previous = current;
    current = null;
    let disposeError = null;
    if (previous) {
      try {
        dispose(previous);
      } catch (error) {
        disposeError = String(error?.message || error);
      }
    }
    return Object.freeze({
      cleared: !!previous,
      reason: String(reason || 'cleared'),
      revision,
      previous,
      disposeError
    });
  }

  return Object.freeze({
    clear,
    publish,
    snapshot: () => Object.freeze({ current, revision })
  });
}

function isLivingWorldPublicationActive(publication, state = {}) {
  if (publication?.type !== 'LivingWorldPublication') return false;
  if (state.suppressed === true) return false;
  if (String(state.activeRequestId || '') !== publication.requestId) return false;
  return Number(state.activeSequence) === publication.sequence;
}

export {
  LIVING_WORLD_SCHEMA_VERSION,
  WORLD_IDENTITY_COORDINATE_SCALE,
  createLivingWorldPublication,
  createLivingWorldPublicationStore,
  createStableWorldIdentity,
  createWorldRandom,
  isLivingWorldPublicationActive
};
