const METERS_PER_LAT_DEGREE = 110540;
const MATCH_GRID_METERS = 32;

function localMeters(lat, lon, originLat, originLon) {
  const lonScale = Math.max(0.2, Math.cos(originLat * Math.PI / 180)) * 111320;
  return {
    x: (lon - originLon) * lonScale,
    z: (lat - originLat) * METERS_PER_LAT_DEGREE
  };
}

function polygonRecord(way, nodes, originLat, originLon, index) {
  const points = (way?.nodes || []).map((id) => nodes.get(id)).filter(Boolean);
  if (points.length < 3) return null;

  let lat = 0;
  let lon = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const projected = points.map((point) => {
    lat += Number(point.lat);
    lon += Number(point.lon);
    const local = localMeters(Number(point.lat), Number(point.lon), originLat, originLon);
    minX = Math.min(minX, local.x);
    maxX = Math.max(maxX, local.x);
    minZ = Math.min(minZ, local.z);
    maxZ = Math.max(maxZ, local.z);
    return local;
  });

  let signedArea = 0;
  let centroidX = 0;
  let centroidZ = 0;
  for (let i = 0, j = projected.length - 1; i < projected.length; j = i++) {
    const cross = projected[j].x * projected[i].z - projected[i].x * projected[j].z;
    signedArea += cross;
    centroidX += (projected[j].x + projected[i].x) * cross;
    centroidZ += (projected[j].z + projected[i].z) * cross;
  }
  if (Math.abs(signedArea) > 0.01) {
    centroidX /= 3 * signedArea;
    centroidZ /= 3 * signedArea;
  } else {
    centroidX = localMeters(lat / points.length, lon / points.length, originLat, originLon).x;
    centroidZ = localMeters(lat / points.length, lon / points.length, originLat, originLon).z;
  }

  const diagonal = Math.hypot(maxX - minX, maxZ - minZ);
  return {
    index,
    way,
    x: centroidX,
    z: centroidZ,
    matchRadius: Math.max(5, Math.min(34, diagonal * 0.48 + 3))
  };
}

function gridKey(x, z) {
  return `${Math.floor(x / MATCH_GRID_METERS)},${Math.floor(z / MATCH_GRID_METERS)}`;
}

function nearbyRecords(grid, x, z) {
  const cellX = Math.floor(x / MATCH_GRID_METERS);
  const cellZ = Math.floor(z / MATCH_GRID_METERS);
  const records = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      const bucket = grid.get(`${cellX + dx},${cellZ + dz}`);
      if (bucket) records.push(...bucket);
    }
  }
  return records;
}

function hasMappedDimension(tags = {}) {
  return String(tags.height || '').trim() !== '' || String(tags['building:levels'] || '').trim() !== '';
}

export function mergeBuildingMetadata(footprintData, metadataData, options = {}) {
  if (!footprintData?.elements || !metadataData?.elements) return footprintData;
  const originLat = Number(options.lat);
  const originLon = Number(options.lon);
  if (!Number.isFinite(originLat) || !Number.isFinite(originLon)) return footprintData;

  const nodes = new Map();
  const footprintWays = [];
  footprintData.elements.forEach((element) => {
    if (element?.type === 'node') nodes.set(element.id, element);
    if (element?.type === 'way' && element.tags?.building) footprintWays.push(element);
  });

  const records = footprintWays
    .map((way, index) => polygonRecord(way, nodes, originLat, originLon, index))
    .filter(Boolean);
  const grid = new Map();
  records.forEach((record) => {
    const key = gridKey(record.x, record.z);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(record);
  });

  const candidates = [];
  metadataData.elements.forEach((element) => {
    if (element?.type !== 'way' || !element.tags?.building || !element.center) return;
    const lat = Number(element.center.lat);
    const lon = Number(element.center.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const center = localMeters(lat, lon, originLat, originLon);
    nearbyRecords(grid, center.x, center.z).forEach((record) => {
      const distance = Math.hypot(record.x - center.x, record.z - center.z);
      if (distance > record.matchRadius) return;
      candidates.push({
        distance,
        normalizedDistance: distance / record.matchRadius,
        metadata: element,
        record
      });
    });
  });
  candidates.sort((a, b) => a.normalizedDistance - b.normalizedDistance || a.distance - b.distance);

  const usedFootprints = new Set();
  const usedMetadata = new Set();
  let matched = 0;
  let mappedDimensions = 0;
  let mappedTypes = 0;
  let mappedRoofs = 0;
  let mappedNames = 0;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const metadataId = String(candidate.metadata.id);
    if (usedFootprints.has(candidate.record.index) || usedMetadata.has(metadataId)) continue;
    usedFootprints.add(candidate.record.index);
    usedMetadata.add(metadataId);

    const tags = candidate.metadata.tags || {};
    candidate.record.way.tags = {
      ...candidate.record.way.tags,
      ...tags,
      _sourceFeatureId: candidate.record.way.tags._sourceFeatureId,
      _buildingMetadataSourceId: `osm:way:${metadataId}`,
      _buildingMetadataMatchMeters: candidate.distance.toFixed(2)
    };
    matched += 1;
    if (hasMappedDimension(tags)) mappedDimensions += 1;
    if (String(tags.building || '').toLowerCase() !== 'yes') mappedTypes += 1;
    if (tags['roof:shape'] || tags['roof:height'] || tags['roof:levels']) mappedRoofs += 1;
    if (tags.name) mappedNames += 1;
  }

  footprintData._buildingMetadata = {
    source: metadataData._overpassSource || 'overpass',
    endpoint: metadataData._overpassEndpoint || null,
    requested: metadataData.elements.filter((element) => element?.type === 'way').length,
    matched,
    unmatched: Math.max(0, metadataData.elements.filter((element) => element?.type === 'way').length - matched),
    footprintCount: records.length,
    mappedDimensions,
    mappedTypes,
    mappedRoofs,
    mappedNames
  };
  return footprintData;
}
