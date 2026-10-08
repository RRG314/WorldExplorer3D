export const FAR_CONTEXT_MAX_BUILDINGS = 9000;
export const FAR_CONTEXT_BUILDING_COVERAGE_TARGET = 0.95;
export const FAR_CONTEXT_MAX_BUILDING_INSTANCES = 1200000;

function ringBounds(ring) {
  const bounds = { minLat: Infinity, maxLat: -Infinity, minLon: Infinity, maxLon: -Infinity };
  for (const coordinate of ring || []) {
    const lon = Number(coordinate?.[0]);
    const lat = Number(coordinate?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
  }
  return bounds;
}


function farBuildingBoxDescriptor(ring, properties, identity) {
  const bounds = ringBounds(ring);
  const centerLat = (bounds.minLat + bounds.maxLat) * 0.5;
  const centerLon = (bounds.minLon + bounds.maxLon) * 0.5;
  if (![centerLat, centerLon].every(Number.isFinite)) return null;
  const eastMetersPerDegree = Math.max(1000, 111320 * Math.cos(centerLat * Math.PI / 180));
  const points = (ring || []).map((coordinate) => ({
    x: (Number(coordinate?.[0]) - centerLon) * eastMetersPerDegree,
    z: -(Number(coordinate?.[1]) - centerLat) * 110540
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.z));
  if (points.length < 3) return null;
  let meanX = 0;
  let meanZ = 0;
  for (const point of points) {
    meanX += point.x / points.length;
    meanZ += point.z / points.length;
  }
  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (const point of points) {
    const dx = point.x - meanX;
    const dz = point.z - meanZ;
    xx += dx * dx;
    xz += dx * dz;
    zz += dz * dz;
  }
  const axisAngle = 0.5 * Math.atan2(2 * xz, xx - zz);
  const axisX = Math.cos(axisAngle);
  const axisZ = Math.sin(axisAngle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  let signedArea = 0;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const point = points[index];
    const u = point.x * axisX + point.z * axisZ;
    const v = -point.x * axisZ + point.z * axisX;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
    signedArea += points[previous].x * point.z - point.x * points[previous].z;
  }
  const areaMeters = Math.abs(signedArea) * 0.5;
  const widthMeters = maxU - minU;
  const depthMeters = maxV - minV;
  if (![areaMeters, widthMeters, depthMeters].every(Number.isFinite) ||
      areaMeters < 14 || areaMeters > 350000 || widthMeters <= 0.5 || depthMeters <= 0.5) return null;
  const centerU = (minU + maxU) * 0.5;
  const centerV = (minV + maxV) * 0.5;
  const eastOffset = centerU * axisX - centerV * axisZ;
  const southOffset = centerU * axisZ + centerV * axisX;
  return {
    ring,
    properties,
    priority: farBuildingPriority(properties, areaMeters),
    centerLat: centerLat - southOffset / 110540,
    centerLon: centerLon + eastOffset / eastMetersPerDegree,
    widthMeters,
    depthMeters,
    areaMeters,
    rotationY: -axisAngle,
    identity
  };
}

// Important mapped buildings survive a density cap even when they occur last
// in a vector tile. An inferred height is not evidence of a landmark.
function farBuildingPriority(properties = {}, areaMeters = 0) {
  const height = Number.parseFloat(properties.height ?? properties.render_height ?? properties['building:height']);
  const levels = Number.parseFloat(properties['building:levels'] ?? properties.levels ?? properties.num_floors);
  const major = height >= 60 || levels >= 18 || areaMeters >= 4000 ||
    /^(tower|cathedral|stadium|hospital|university|terminal|castle|civic)$/.test(String(properties.building || properties.kind || '')) ||
    Boolean(properties.wikidata || properties.wikipedia || properties.historic);
  return (major ? 1000000 : 0) + Math.min(350000, areaMeters) + (Number.isFinite(height) ? height : 0);
}

function selectFarBuildingCoverage(buckets, options = {}) {
  const available = buckets.reduce((count, bucket) => count + bucket.length, 0);
  const limit = Math.max(0, Math.min(FAR_CONTEXT_MAX_BUILDING_INSTANCES,
    Math.floor(options.maxInstances ?? FAR_CONTEXT_MAX_BUILDING_INSTANCES)));
  const major = [], ordinary = [];
  for (const bucket of buckets) {
    const remaining = [];
    for (const building of bucket) {
      if (building.priority >= 1000000) major.push(building);
      else remaining.push(building);
    }
    ordinary.push(remaining);
  }
  // Never hide a major feature behind a spatial sampling stride. Exceeding the
  // resource ceiling is reported as incomplete coverage, not a successful load.
  major.sort((a,b) => b.priority - a.priority || a.identity.localeCompare(b.identity));
  const target = Math.min(limit, Math.max(major.length, Math.ceil(available * FAR_CONTEXT_BUILDING_COVERAGE_TARGET)));
  const buildings = major.slice(0, target);
  for (const building of roundRobinSelect(ordinary, Math.max(0, target - buildings.length))) buildings.push(building);
  return { buildings, availableBuildings: available, selectedBuildingTarget: target,
    majorBuildingsAvailable: major.length, majorBuildingsSelected: Math.min(major.length, target),
    buildingBudgetExceeded: Math.ceil(available * FAR_CONTEXT_BUILDING_COVERAGE_TARGET) > limit };
}


function roundRobinSelect(buckets, maxCount) {
  const active = buckets
    .filter((bucket) => Array.isArray(bucket) && bucket.length > 0)
    .map((bucket) => ({ bucket, index: 0 }));
  const selected = [];
  let index = 0;
  while (active.length > 0 && selected.length < maxCount) {
    const cursor = active[index];
    selected.push(cursor.bucket[cursor.index]);
    cursor.index += 1;
    if (cursor.index >= cursor.bucket.length) {
      active.splice(index, 1);
      if (active.length === 0) break;
      index %= active.length;
    } else {
      index = (index + 1) % active.length;
    }
  }
  return selected;
}

function distributedFeatureIndices(featureCount, selectedCount) {
  const count = Math.max(0, Math.floor(Number(featureCount) || 0));
  const target = Math.max(0, Math.min(count, Math.floor(Number(selectedCount) || 0)));
  if (target === count) return Array.from({ length: count }, (_, index) => index);
  const indices = [];
  for (let sample = 0; sample < target; sample += 1) {
    indices.push(Math.min(count - 1, Math.floor((sample + 0.5) * count / target)));
  }
  return indices;
}

function selectSpatiallyDistributedBuildings(buildings, maxCount) {
  if (buildings.length <= maxCount) return buildings;
  const finite = buildings.filter((building) => (
    Number.isFinite(building.centerLat) && Number.isFinite(building.centerLon)
  ));
  if (finite.length <= maxCount) return finite;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const building of finite) {
    minLat = Math.min(minLat, building.centerLat);
    maxLat = Math.max(maxLat, building.centerLat);
    minLon = Math.min(minLon, building.centerLon);
    maxLon = Math.max(maxLon, building.centerLon);
  }
  const gridSize = 12;
  const buckets = new Map();
  for (const building of finite) {
    const row = Math.min(gridSize - 1, Math.floor(
      (building.centerLat - minLat) / Math.max(1e-9, maxLat - minLat) * gridSize
    ));
    const column = Math.min(gridSize - 1, Math.floor(
      (building.centerLon - minLon) / Math.max(1e-9, maxLon - minLon) * gridSize
    ));
    const key = row * gridSize + column;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(building);
  }
  const orderedBuckets = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) => bucket.sort((a, b) => (
      b.priority - a.priority || String(a.identity).localeCompare(String(b.identity))
    )));
  return roundRobinSelect(orderedBuckets, maxCount);
}


export {ringBounds,farBuildingBoxDescriptor,farBuildingPriority,selectFarBuildingCoverage,
roundRobinSelect,distributedFeatureIndices,selectSpatiallyDistributedBuildings};
