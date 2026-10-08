// A cell may reference the same long road from hundreds of segments, joins and
// visibility edges. JSON has no shared references: expanding each one makes a
// cache lookup allocate far more data than the cell it is meant to cache.
// Preserve every road field once, plus its identity at each use. Identity also
// matters to visibility tests, which exclude the source road's own edges.
export function serializeStreetPavementFingerprint(tile, metersPerWorldUnit) {
  const indexes = new Map(), roads = [], maskIndexes=new Map(), masks=[];
  const serializedTile = JSON.stringify(tile, (key, value) => {
    if(key==='sidewalkMasks'&&Array.isArray(value)){
      if(!maskIndexes.has(value)){maskIndexes.set(value,masks.length);masks.push(value);}
      return {maskIndex:maskIndexes.get(value)};
    }
    if (key !== 'road' || !value || typeof value !== 'object') return value;
    if (!indexes.has(value)) {
      indexes.set(value, roads.length);
      roads.push(value);
    }
    return { roadIndex: indexes.get(value) };
  });
  return `{"version":3,"metersPerWorldUnit":${JSON.stringify(metersPerWorldUnit)},"tile":${serializedTile},"roads":${JSON.stringify(roads)},"masks":${JSON.stringify(masks)}}`;
}
