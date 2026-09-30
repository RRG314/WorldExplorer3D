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
