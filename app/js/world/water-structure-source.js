const METERS_PER_LATITUDE_DEGREE = 110540;

function isMappedVessel(tags = {}) {
  return String(tags.building || '').toLowerCase() === 'ship' ||
    String(tags.historic || '').toLowerCase() === 'ship' ||
    String(tags.building || '').toLowerCase() === 'houseboat';
}

function mappedWaterStructurePriority(tags = {}) {
  // Vessel footprints are sparse, semantically important features. They must
  // survive dense-city building tile budgets instead of competing as ordinary
  // untagged building massing.
  return isMappedVessel(tags) ? 1000 : 0;
}

function wayCenterAndRadius(way, nodes, originLat) {
  const points = (way?.nodes || []).map((id) => nodes.get(id)).filter(Boolean);
  if (points.length < 3) return null;
  const longitudeScale = Math.max(0.2, Math.cos(originLat * Math.PI / 180)) * 111320;
  let lat = 0;
  let lon = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  points.forEach((point) => {
    lat += Number(point.lat);
    lon += Number(point.lon);
  });
  lat /= points.length;
  lon /= points.length;
  points.forEach((point) => {
    const x = (Number(point.lon) - lon) * longitudeScale;
    const z = (Number(point.lat) - lat) * METERS_PER_LATITUDE_DEGREE;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  });
  return {
    lat,
    lon,
    radiusMeters: Math.max(5, Math.min(90, Math.hypot(maxX - minX, maxZ - minZ) * 0.58 + 4))
  };
}

function mergeMappedWaterStructures(footprintData, semanticData, options = {}) {
  if (!footprintData?.elements || !semanticData?.elements) {
    return { semanticVessels: 0, suppressedGenericFootprints: 0, appendedWays: 0 };
  }
  const originLat = Number(options.lat || 0);
  const semanticNodes = new Map();
  semanticData.elements.forEach((element) => {
    if (element?.type === 'node') semanticNodes.set(element.id, element);
  });
  const vesselWays = semanticData.elements.filter((element) =>
    element?.type === 'way' && isMappedVessel(element.tags)
  );
  const vesselRecords = vesselWays
    .map((way) => ({ way, record: wayCenterAndRadius(way, semanticNodes, originLat) }))
    .filter((entry) => entry.record);
  if (!vesselRecords.length) {
    return { semanticVessels: 0, suppressedGenericFootprints: 0, appendedWays: 0 };
  }

  const footprintNodes = new Map();
  footprintData.elements.forEach((element) => {
    if (element?.type === 'node') footprintNodes.set(element.id, element);
  });
  const longitudeScale = Math.max(0.2, Math.cos(originLat * Math.PI / 180)) * 111320;
  let suppressedGenericFootprints = 0;
  footprintData.elements = footprintData.elements.filter((element) => {
    if (element?.type !== 'way' || isMappedVessel(element.tags)) return true;
    const footprint = wayCenterAndRadius(element, footprintNodes, originLat);
    if (!footprint) return true;
    const duplicatesVessel = vesselRecords.some(({ record }) => {
      const dx = (footprint.lon - record.lon) * longitudeScale;
      const dz = (footprint.lat - record.lat) * METERS_PER_LATITUDE_DEGREE;
      return Math.hypot(dx, dz) <= Math.max(record.radiusMeters, footprint.radiusMeters * 0.72);
    });
    if (duplicatesVessel) suppressedGenericFootprints += 1;
    return !duplicatesVessel;
  });

  const existingIds = new Set(footprintData.elements.map((element) => `${element.type}:${element.id}`));
  const referencedNodeIds = new Set(vesselWays.flatMap((way) => way.nodes || []));
  let appendedWays = 0;
  semanticData.elements.forEach((element) => {
    const include =
      (element?.type === 'node' && referencedNodeIds.has(element.id)) ||
      (element?.type === 'way' && isMappedVessel(element.tags));
    if (!include || existingIds.has(`${element.type}:${element.id}`)) return;
    footprintData.elements.push(element);
    existingIds.add(`${element.type}:${element.id}`);
    if (element.type === 'way') appendedWays += 1;
  });
  footprintData._waterStructureSemantics = {
    source: semanticData._overpassSource || 'overpass',
    semanticVessels: vesselRecords.length,
    suppressedGenericFootprints,
    appendedWays
  };
  return footprintData._waterStructureSemantics;
}

export { isMappedVessel, mappedWaterStructurePriority, mergeMappedWaterStructures };
