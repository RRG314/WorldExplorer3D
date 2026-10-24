import { createLifecycleScope } from '../runtime/lifecycle-scope.js?v=2';
import { encodeWorldCellFacts } from './world-cell-facts.js';

export const WORLD_SNAPSHOT_LAYERS = Object.freeze([
  'terrain',
  'hydrology',
  'transport',
  'buildings',
  'landuse',
  'places'
]);

const COMPLETENESS = new Set(['complete', 'partial', 'empty']);

function immutableValue(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutableValue));
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('WorldSnapshot values must be plain canonical data.');
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, immutableValue(nested)])
  ));
}

function frozenRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new TypeError('WorldSnapshot records must be objects.');
  }
  return immutableValue(record);
}

function canonicalLayer(name, input = {}) {
  const records = Object.freeze((input.records || []).map(frozenRecord));
  const authority = String(input.authority || '').trim();
  const completeness = String(input.completeness || (records.length ? 'partial' : 'empty'));
  if (!COMPLETENESS.has(completeness)) {
    throw new TypeError(`${name} completeness must be complete, partial, or empty.`);
  }
  if (records.length > 0 && !authority) {
    throw new TypeError(`${name} records require one explicit authority.`);
  }
  if (completeness === 'empty' && records.length > 0) {
    throw new TypeError(`${name} cannot be empty while containing records.`);
  }
  const identities = new Set();
  for (const record of records) {
    const id = String(record.id || '').trim();
    if (!id) throw new TypeError(`${name} records require stable ids.`);
    if (identities.has(id)) throw new TypeError(`${name} contains duplicate record id ${id}.`);
    identities.add(id);
  }
  return Object.freeze({
    name,
    authority: authority || null,
    completeness,
    source: input.source ? frozenRecord(input.source) : null,
    coverage: input.coverage ? frozenRecord(input.coverage) : null,
    records
  });
}

export function createWorldSnapshot({ request, layers = {}, counts = {}, createdAt = 0 } = {}) {
  if (!request || !Object.isFrozen(request) || !request.id || !request.location) {
    throw new TypeError('WorldSnapshot requires an immutable WorldLoadRequest.');
  }
  const normalizedLayers = Object.freeze(Object.fromEntries(
    WORLD_SNAPSHOT_LAYERS.map((name) => [name, canonicalLayer(name, layers[name])])
  ));
  const publishedAt = Number.isFinite(Number(createdAt)) ? Number(createdAt) : 0;
  return Object.freeze({
    type: 'WorldSnapshot',
    schemaVersion: 1,
    id: `world-snapshot:${request.id}`,
    request,
    requestId: request.id,
    sequence: request.sequence,
    location: request.location,
    createdAt: publishedAt,
    publishedAt,
    counts: immutableValue(counts),
    layers: normalizedLayers
  });
}

export function createWorldSnapshotStore(options = {}) {
  const dispose = typeof options.dispose === 'function' ? options.dispose : () => {};
  let current = null;
  let revision = 0;
  let requestId = null, lifetime = null, readCell = null;
  let initialized = false;
  const regions = new Map();

  // The snapshot authority also owns residency. Schedulers still choose when
  // to prepare work; these leases choose which accepted generation may live.
  function begin(request) {
    if (!Object.isFrozen(request) || !request?.id) throw new TypeError('Residency requires an immutable world request.');
    if (requestId === request.id && lifetime?.isActive()) return false;
    clear('world-replaced');
    initialized = true;
    requestId = request.id;
    lifetime = createLifecycleScope(`world-publication:${requestId}`);
    return true;
  }

  function ownRegion({ key, layers, bounds = null, facts = null, retire, expectedRequestId = requestId }) {
    if (!lifetime?.isActive() || expectedRequestId !== requestId) {
      retire?.();
      throw new DOMException('World region superseded', 'AbortError');
    }
    if (!key || !Array.isArray(layers) || !layers.length || typeof retire !== 'function') {
      throw new TypeError('Region publication requires a key, layers and resource retirement.');
    }
    const metadata = immutableValue({ key, layers, bounds });
    let active = true, release;
    const lease = Object.freeze({
      metadata, facts,
      dispose() {
        if (!active) return false;
        active = false;
        if (regions.get(key) === lease) regions.delete(key);
        // Release this exact registration before executing external cleanup.
        release?.();
        retire();
        return true;
      }
    });
    const previous = regions.get(key);
    regions.set(key, lease);
    release = lifetime.defer(() => lease.dispose(), 'geographic-region');
    previous?.dispose();
    return lease;
  }

  const publish = (snapshot, publishOptions = {}) => {
    if (snapshot?.type !== 'WorldSnapshot' || !Object.isFrozen(snapshot)) {
      throw new TypeError('Only an immutable WorldSnapshot can be published.');
    }
    const expectedRequestId = String(publishOptions.expectedRequestId || snapshot.requestId);
    if (initialized && !requestId) {
      return Object.freeze({ published: false, reason: 'world-inactive', revision, current });
    }
    if (snapshot.requestId !== expectedRequestId || (requestId && snapshot.requestId !== requestId)) {
      return Object.freeze({ published: false, reason: 'request-mismatch', revision, current });
    }
    if (current === snapshot) {
      return Object.freeze({ published: true, reason: 'already-current', revision, current, previous: current });
    }
    const previous = current;
    if (!requestId) begin(snapshot.request);
    current = snapshot;
    readCell = typeof publishOptions.readCell === 'function' ? publishOptions.readCell : null;
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
  };

  function clear(reason = 'cleared') {
    const previous = current;
    current = null;
    requestId = null;
    readCell = null;
    lifetime?.dispose(reason);
    lifetime = null;
    regions.clear();
    let disposeError = null;
    if (previous) {
      try {
        dispose(previous);
      } catch (error) {
        disposeError = String(error?.message || error);
      }
    }
    return Object.freeze({ cleared: !!previous, reason: String(reason), revision, previous, disposeError });
  }

  return Object.freeze({
    clear,
    begin,
    ownRegion,
    publish,
    readCell: (cell) => current && readCell ? readCell(cell) : null,
    exportCell: cell => {
      const facts = current && readCell ? readCell(cell) : null;
      return facts ? encodeWorldCellFacts(facts) : null;
    },
    regionFactsAt: bounds => [...regions.values()].filter(lease => lease.facts && (!lease.metadata.bounds ||
      lease.metadata.bounds.minX <= bounds.maxX && lease.metadata.bounds.maxX >= bounds.minX &&
      lease.metadata.bounds.minZ <= bounds.maxZ && lease.metadata.bounds.maxZ >= bounds.minZ)).map(lease => lease.facts),
    residency: () => Object.freeze({ requestId, regions: Object.freeze([...regions.values()].map(lease => lease.metadata)),
      resourceCount: lifetime?.snapshot().resourceCount || 0 }),
    snapshot: () => Object.freeze({ current, revision })
  });
}
