// Portable selected-cell facts. Typed buffers retain their original precision;
// the explicit JSON codec is used only for interchange, never every frame.
const buffers = Object.freeze({ Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array });
export const WORLD_CELL_SIZE = 1024;

export function canonicalFact(value) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (ArrayBuffer.isView(value) && buffers[value.constructor.name]) {
    if (!value.every(Number.isFinite)) throw new TypeError('World facts require finite buffers.');
    return value.slice();
  }
  if (Array.isArray(value)) return Object.freeze(value.map(canonicalFact));
  if (!value || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new TypeError('World facts require finite canonical data, without runtime objects.');
  }
  return Object.freeze(Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)
    .map(([key, entry]) => [key, canonicalFact(entry)])));
}

export function worldCellBounds(key) {
  if (!/^-?\d+:-?\d+$/.test(String(key))) throw new TypeError('Invalid world cell key.');
  const [x, z] = key.split(':').map(Number);
  if (![x, z].every(Number.isSafeInteger)) throw new TypeError('Invalid world cell coordinates.');
  return Object.freeze({ minX: x * WORLD_CELL_SIZE, maxX: (x + 1) * WORLD_CELL_SIZE,
    minZ: z * WORLD_CELL_SIZE, maxZ: (z + 1) * WORLD_CELL_SIZE });
}

export function createWorldCellFacts({ requestId, key, frame, layers, coverage = {} }) {
  if (!requestId || !frame || !layers) throw new TypeError('World cell requires request, frame and layers.');
  return canonicalFact({ type: 'WorldCellFacts', schemaVersion: 1, requestId, key,
    bounds: worldCellBounds(key), frame, coverage, layers });
}

export function encodeWorldCellFacts(facts) {
  if (facts?.type !== 'WorldCellFacts' || facts.schemaVersion !== 1) throw new TypeError('Unsupported world cell facts.');
  return JSON.stringify(facts, (_key, value) => {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new TypeError('World facts require finite numbers.');
      if (Object.is(value, -0)) return { worldFactNumber: '-0' };
    }
    return ArrayBuffer.isView(value) ? { bufferType: value.constructor.name, values: Array.from(value) } : value;
  });
}

export function decodeWorldCellFacts(text) {
  const value = JSON.parse(text, (_key, entry) => {
    if (entry?.worldFactNumber === '-0') return -0;
    if (!entry?.bufferType) return entry;
    const Type = buffers[entry.bufferType];
    if (!Type || !Array.isArray(entry.values) || !entry.values.every(Number.isFinite)) throw new TypeError('Invalid world fact buffer.');
    // Reject narrowing/corruption rather than silently changing collision data.
    const result = new Type(entry.values);
    if (!result.every((n, i) => Object.is(n, entry.values[i]))) throw new TypeError('World fact buffer loses precision.');
    return result;
  });
  if (value?.type !== 'WorldCellFacts' || value.schemaVersion !== 1) throw new TypeError('Unsupported world cell facts.');
  return createWorldCellFacts(value);
}

export function createTransportCellFacts(packet, { requestId, frame, roads = [] }) {
  return createWorldCellFacts({ requestId, key: packet.key, frame,
    coverage: { source: 'finite-selected-area', detail: 'accepted-at-grade-mesh' },
    layers: { transport: { key: packet.key, bounds: packet.bounds, keys: packet.keys,
      roadIndices: packet.roadIndices, batches: packet.batches,
      sourceIds: packet.roadIndices.map(index => {
        const road = roads[index]?.road || roads[index];
        return String(road?.sourceFeatureId || road?.id || '');
      }) } } });
}

export function transportFromCellFacts(facts) {
  if (facts?.type !== 'WorldCellFacts' || facts.schemaVersion !== 1 || !facts.layers?.transport?.batches) {
    throw new TypeError('Transport publication requires versioned cell geometry.');
  }
  return facts.layers.transport;
}
