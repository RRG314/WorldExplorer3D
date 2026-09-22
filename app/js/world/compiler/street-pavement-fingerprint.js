// A cell may reference the same long road from hundreds of segments, joins and
// visibility edges. JSON has no shared references: expanding each one makes a
// cache lookup allocate far more data than the cell it is meant to cache.
// Preserve every road field once, plus its identity at each use. Identity also
// matters to visibility tests, which exclude the source road's own edges.
export function serializeStreetPavementFingerprint(tile, metersPerWorldUnit) {
  const indexes = new Map(), roads = [];
  const serializedTile = JSON.stringify(tile, (key, value) => {
    if (key !== 'road' || !value || typeof value !== 'object') return value;
    if (!indexes.has(value)) {
      indexes.set(value, roads.length);
      roads.push(value);
    }
    return { roadIndex: indexes.get(value) };
  });
  return `{"version":2,"metersPerWorldUnit":${JSON.stringify(metersPerWorldUnit)},"tile":${serializedTile},"roads":${JSON.stringify(roads)}}`;
}
