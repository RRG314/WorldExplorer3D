// Normals retain double precision until facade masks have consumed them. Other
// building attributes can use their final Float32 storage. Capacity is known.
export class GeometryBatchStorage {
  constructor(capacity, ArrayType = Float64Array) {
    this.values = new ArrayType(capacity);
    this.length = 0;
  }
  push(a, b, c, d) {
    const count = arguments.length;
    if (count > 4 || this.length + count > this.values.length) throw new RangeError('Geometry batch capacity exceeded');
    const offset = this.length;
    if (count > 0) this.values[offset] = a;
    if (count > 1) this.values[offset + 1] = b;
    if (count > 2) this.values[offset + 2] = c;
    if (count > 3) this.values[offset + 3] = d;
    this.length += count;
    return this.length;
  }
  view() { return this.values.subarray(0, this.length); }
}
export const isBatchStorage = value => Array.isArray(value) || value instanceof GeometryBatchStorage;
export const batchStorageView = value => value instanceof GeometryBatchStorage ? value.view() : value;

// The caller must exclusively own every supplied buffer. Keep published
// attribute buffers alive even when multiple scratch views alias them.
export function releaseOwnedConstructionBuffers(buffers, retained = new Set()) {
  let released = 0;
  for (const buffer of new Set(buffers)) {
    if (retained.has(buffer) || !buffer?.byteLength || typeof buffer.transfer !== 'function') continue;
    const bytes = buffer.byteLength;
    buffer.transfer(0);
    released += bytes;
  }
  return released;
}

export function geometryAttributeBuffers(geometry) {
  return new Set([
    ...Object.values(geometry?.attributes || {}).map(attribute => attribute.array?.buffer),
    geometry?.index?.array?.buffer
  ].filter(Boolean));
}

// A finished building batch no longer needs its double-precision normals,
// wide construction indices, or capacity abandoned after a source rollback.
// Float32 storage adopted by the final geometry remains owned by that geometry.
export function releaseGeometryBatchScratch(batch, geometry) {
  return releaseOwnedConstructionBuffers(
    Object.values(batch).filter(value => value instanceof GeometryBatchStorage).map(value => value.values.buffer),
    geometryAttributeBuffers(geometry)
  );
}
