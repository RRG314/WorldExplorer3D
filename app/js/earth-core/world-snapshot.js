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

  const publish = (snapshot, publishOptions = {}) => {
    if (snapshot?.type !== 'WorldSnapshot' || !Object.isFrozen(snapshot)) {
      throw new TypeError('Only an immutable WorldSnapshot can be published.');
    }
    const expectedRequestId = String(publishOptions.expectedRequestId || snapshot.requestId);
    if (snapshot.requestId !== expectedRequestId) {
      return Object.freeze({ published: false, reason: 'request-mismatch', revision, current });
    }
    if (current === snapshot) {
      return Object.freeze({ published: true, reason: 'already-current', revision, current, previous: current });
    }
    const previous = current;
    current = snapshot;
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

  const clear = (reason = 'cleared') => {
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
    return Object.freeze({ cleared: !!previous, reason: String(reason), revision, previous, disposeError });
  };

  return Object.freeze({
    clear,
    publish,
    snapshot: () => Object.freeze({ current, revision })
  });
}
