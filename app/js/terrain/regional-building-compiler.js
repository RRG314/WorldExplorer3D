import { farBuildingBoxDescriptor, ringBounds, FAR_CONTEXT_MAX_BUILDINGS,
  FAR_CONTEXT_MAX_BUILDING_INSTANCES, FAR_CONTEXT_BUILDING_COVERAGE_TARGET,
  selectSpatiallyDistributedBuildings } from './far-building-selection.js';
import { resolveFarBuildingMassing } from './far-building-massing.js?v=2';
import { DESCRIPTOR_STRIDE, writeBuildingDescriptor } from './regional-building-descriptors.js';
import { earthCoordinateFrame } from '../earth-core/coordinate-frame.js?v=1';

// One sequential tile job, with packed retained buckets. Temporary MVT features,
// tags and polygon graphs die in this worker before gameplay begins.
export function createRegionalBuildingCompiler(options) {
  const { bounds, excludedBounds, detailedFrame } = options;
  const frame = detailedFrame ? earthCoordinateFrame(detailedFrame.origin, detailedFrame.scale) : null;
  const point = {};
  const buckets = [], major = [];
  const stats = { sourceBuildings: 0, invalidBuildings: 0, outsideBuildings: 0,
    skippedNearBuildings: 0, availableBuildings: 0 };
  let packedBytes = 0, finished = false;
  const exactCandidates = Math.max(32, Math.ceil(FAR_CONTEXT_MAX_BUILDINGS / Math.max(1, options.tileCount)) * 2);
  function addTile(record) {
    if (finished || buckets.length >= 512) throw new Error('Regional compiler ownership/budget exceeded');
    const layer = record.tile.layers.buildings;
    const descriptors = [];
    let tileAvailableBuildings = 0;
    for (let index = 0; index < (layer?.length || 0); index++) {
      const feature = layer.feature(index);
      const geojson = feature.toGeoJSON(record.x, record.y, record.z);
      const geometry = geojson?.geometry;
      const rings = geometry?.type === 'Polygon' ? [geometry.coordinates[0]]
        : geometry?.type === 'MultiPolygon' ? geometry.coordinates.map(p => p[0]) : [];
      stats.sourceBuildings += rings.length; tileAvailableBuildings += rings.length;
      for (let r = 0; r < rings.length; r++) {
        const ring = rings[r];
        if (!ring || ring.length < 4) { stats.invalidBuildings++; continue; }
        const box = ringBounds(ring);
        const lat = (box.minLat + box.maxLat) * .5, lon = (box.minLon + box.maxLon) * .5;
        if (lat < bounds.latS || lat > bounds.latN || lon < bounds.lonW || lon > bounds.lonE) {
          stats.outsideBuildings++; continue;
        }
        if (excludedBounds && lat >= excludedBounds.latS && lat <= excludedBounds.latN &&
            lon >= excludedBounds.lonW && lon <= excludedBounds.lonE) {
          const radius = detailedFrame?.radius;
          if (frame) frame.toWorld(lat, lon, point);
          if (!frame || (Number.isFinite(radius) && radius > 0 && Math.hypot(point.x, point.z) <= radius)) {
            stats.skippedNearBuildings++; continue;
          }
        }
        const building = farBuildingBoxDescriptor(ring, geojson.properties || {}, `${record.x}/${record.y}/${feature.id ?? index}/${r}`);
        if (building) descriptors.push(building); else stats.invalidBuildings++;
      }
    }
    descriptors.sort((a,b) => b.priority - a.priority || a.identity.localeCompare(b.identity));
    packedBytes += descriptors.length * DESCRIPTOR_STRIDE * 8;
    if (packedBytes > 256 * 1024 * 1024) throw new RangeError('Regional descriptor memory budget exceeded');
    const data = new Float64Array(descriptors.length * DESCRIPTOR_STRIDE), exact = new Map();
    const bucketIndex = buckets.length;
    let majorCount = 0;
    for (let i = 0; i < descriptors.length; i++) {
      const b = descriptors[i], units = Number(options.unitsPerMeter) || 1;
      writeBuildingDescriptor(data, i, b, resolveFarBuildingMassing(b, null, b.areaMeters * units * units, units));
      if (i < exactCandidates) exact.set(i, { ring: b.ring, identity: b.identity,
        centerLat: b.centerLat, centerLon: b.centerLon, priority: b.priority });
      if (b.priority >= 1000000) {
        major.push({ bucketIndex, index: i, priority: b.priority, identity: b.identity }); majorCount++;
      }
    }
    stats.availableBuildings += descriptors.length;
    buckets.push({ data, exact, length: descriptors.length, cursor: majorCount });
    return { tileAvailableBuildings };
  }
  function finish() {
    if (finished) throw new Error('Regional compiler already finished');
    finished = true;
    const limit = Math.max(0, Math.min(FAR_CONTEXT_MAX_BUILDING_INSTANCES,
      Math.floor(options.maxInstances ?? FAR_CONTEXT_MAX_BUILDING_INSTANCES)));
    const target = Math.min(limit, Math.max(major.length, Math.ceil(stats.availableBuildings * FAR_CONTEXT_BUILDING_COVERAGE_TARGET)));
    const data = new Float64Array(target * DESCRIPTOR_STRIDE), candidates = [];
    let count = 0;
    function append(bucketIndex, index) {
      const bucket = buckets[bucketIndex], at = index * DESCRIPTOR_STRIDE;
      data.set(bucket.data.subarray(at, at + DESCRIPTOR_STRIDE), count * DESCRIPTOR_STRIDE);
      const exact = bucket.exact.get(index);
      if (exact) candidates.push({ ...exact, outputIndex: count });
      count++;
    }
    major.sort((a,b) => b.priority - a.priority || a.identity.localeCompare(b.identity));
    for (let i = 0; i < Math.min(major.length, target); i++) append(major[i].bucketIndex, major[i].index);
    const active = buckets.map((bucket,index) => index).filter(i => buckets[i].cursor < buckets[i].length);
    let cursor = 0;
    while (active.length && count < target) {
      const i = active[cursor], bucket = buckets[i];
      append(i, bucket.cursor++);
      if (bucket.cursor === bucket.length) active.splice(cursor, 1);
      else cursor++;
      cursor %= active.length || 1;
    }
    const rings = selectSpatiallyDistributedBuildings(candidates, FAR_CONTEXT_MAX_BUILDINGS)
      .map(b => [b.outputIndex, b.ring]);
    buckets.length = 0;
    return { data, rings, ...stats, selectedBuildingTarget: target,
      majorBuildingsAvailable: major.length, majorBuildingsSelected: Math.min(major.length, target),
      buildingBudgetExceeded: Math.ceil(stats.availableBuildings * FAR_CONTEXT_BUILDING_COVERAGE_TARGET) > limit,
      compiler: { mode: 'worker-packed', tiles: options.tileCount, packedSourceBytes: packedBytes,
        resultBytes: data.byteLength, exactFootprints: rings.length, maxActiveJobs: 1 } };
  }
  return { addTile, finish };
}
