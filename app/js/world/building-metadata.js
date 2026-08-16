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
  const footprintWays = footprintData.elements.filter((element) =>
    element?.type === 'way' && (element.tags?.building || element.tags?.['building:part'])
  );
  const metadataWays = metadataData.elements.filter((element) =>
    element?.type === 'way' && (element.tags?.building || element.tags?.['building:part'])
  );
  const metadataByStableId = new Map();
  metadataWays.forEach((way) => {
    const id = String(way.id ?? '').trim();
    if (id) metadataByStableId.set(`osm:way:${id}`, way);
    const sourceId = String(way.tags?._sourceFeatureId || '').trim();
    if (sourceId) metadataByStableId.set(sourceId, way);
  });

  let matched = 0;
  let mappedDimensions = 0;
  let mappedTypes = 0;
  let mappedRoofs = 0;
  let mappedNames = 0;
  let rejectedAmbiguous = 0;
  const usedMetadata = new Set();
  for (const footprint of footprintWays) {
    const geometryId = String(footprint.tags?._sourceFeatureId || '').trim();
    const explicitOsmId = String(
      footprint.tags?._osmFeatureId ||
      (geometryId.startsWith('osm:way:') ? geometryId : '')
    ).trim();
    if (!explicitOsmId) {
      rejectedAmbiguous += 1;
      continue;
    }
    const metadata = metadataByStableId.get(explicitOsmId);
    if (!metadata || usedMetadata.has(explicitOsmId)) continue;
    usedMetadata.add(explicitOsmId);
    const tags = metadata.tags || {};
    footprint.tags = {
      ...footprint.tags,
      ...tags,
      _sourceFeatureId: geometryId,
      _buildingMetadataSourceId: explicitOsmId,
      _buildingMetadataGeometryId: geometryId,
      _buildingMetadataMapping: 'explicit_stable_id'
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
    policy: 'explicit_stable_identity_only',
    requested: metadataWays.length,
    matched,
    unmatched: Math.max(0, metadataWays.length - matched),
    rejectedAmbiguous,
    footprintCount: footprintWays.length,
    mappedDimensions,
    mappedTypes,
    mappedRoofs,
    mappedNames
  };
  return footprintData;
}
