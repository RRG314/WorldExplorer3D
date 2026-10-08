// Exclusive, transferable construction data. No per-house JS objects cross
// from the compiler to the scene. Exact footprint rings have a separate budget.
export const DESCRIPTOR_STRIDE = 13;
export const HEIGHT_SOURCES = Object.freeze(['invalid', 'explicit_height', 'levels', 'inferred']);

export function writeBuildingDescriptor(data, index, building, massing) {
  const at = index * DESCRIPTOR_STRIDE;
  data.set([building.centerLat, building.centerLon, building.widthMeters,
    building.depthMeters, building.areaMeters, building.rotationY, building.priority,
    massing?.heightMeters || 0,
    massing ? Math.max(1, HEIGHT_SOURCES.indexOf(massing.heightSource)) : 0,
    ...(massing?.color || [0, 0, 0]), massing?.roofFraction || 0], at);
  // Unmapped semantic height sources all have the same inferred audit category.
  if (massing && !['explicit_height', 'levels'].includes(massing.heightSource)) data[at + 8] = 3;
}

export class RegionalBuildingDescriptors {
  constructor({ data, rings = [] }) {
    if (!(data instanceof Float64Array) || data.length % DESCRIPTOR_STRIDE !== 0 ||
        data.length / DESCRIPTOR_STRIDE > 1200000 || rings.length > 9000) {
      throw new RangeError('Invalid regional building descriptor packet');
    }
    this.data = data;
    this.length = data.length / DESCRIPTOR_STRIDE;
    this.rings = new Map(rings);
    this.disposed = false;
  }
  read(index, target) {
    if (this.disposed || !Number.isInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError('Invalid regional building descriptor index');
    }
    const at = index * DESCRIPTOR_STRIDE, a = this.data;
    target.centerLat = a[at]; target.centerLon = a[at + 1];
    target.widthMeters = a[at + 2]; target.depthMeters = a[at + 3];
    target.areaMeters = a[at + 4]; target.rotationY = a[at + 5]; target.priority = a[at + 6];
    target.ring = this.rings.get(index) || null;
    const massing = target.massing;
    massing.heightMeters = a[at + 7]; massing.heightSource = HEIGHT_SOURCES[a[at + 8]];
    massing.color[0] = a[at + 9]; massing.color[1] = a[at + 10]; massing.color[2] = a[at + 11];
    massing.roofFraction = a[at + 12];
    target.validMassing = a[at + 8] !== 0;
    return target;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof this.data.buffer.transfer === 'function') this.data.buffer.transfer(0);
    this.data = new Float64Array(0); this.rings.clear(); this.length = 0;
  }
}
