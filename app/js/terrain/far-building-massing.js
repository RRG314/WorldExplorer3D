import { isImplausibleTallBuildingFootprint } from '../world/building-geometry-quality.js?v=1';
import {
  buildingSeedFromIdentity,
  inferFallbackBuildingHeightMeters,
  interpretBuildingSemantics
} from '../building-semantics.js?v=4';

function mappedBuildingTags(properties = {}) {
  const buildingType = String(
    properties.building || properties.kind || properties.type || 'yes'
  ).trim() || 'yes';
  const tags = { building: buildingType };
  const height = properties.height ?? properties.render_height ?? properties['building:height'];
  const levels = properties['building:levels'] ?? properties.levels ?? properties.num_floors;
  if (height !== null && height !== undefined && String(height).trim()) tags.height = height;
  if (levels !== null && levels !== undefined && String(levels).trim()) {
    tags['building:levels'] = levels;
  }
  return tags;
}

function resolveFarBuildingMassing(building, footprint, areaWorld, unitsPerMeter, options = {}) {
  const properties = building?.properties || {};
  const tags = mappedBuildingTags(properties);
  const kind = String(tags.building || '').toLowerCase();
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of footprint) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const footprintWidth = (maxX - minX) / unitsPerMeter;
  const footprintDepth = (maxZ - minZ) / unitsPerMeter;
  const footprintArea = areaWorld / (unitsPerMeter * unitsPerMeter);
  const seed = buildingSeedFromIdentity(building?.identity, options.worldSeed);
  const random = (seed >>> 0) / 4294967295;
  const fallbackHeight = inferFallbackBuildingHeightMeters(
    kind,
    footprintArea,
    footprintWidth,
    footprintDepth,
    random
  );
  const semantics = interpretBuildingSemantics(tags, {
    buildingType: kind,
    fallbackHeight,
    footprintArea,
    footprintWidth,
    footprintDepth
  });
  const heightMeters = semantics.heightMeters;
  const intentionalVerticalStructure = /tower|spire|chimney|silo|lighthouse|mast|minaret/.test(kind);
  if (isImplausibleTallBuildingFootprint({
    heightMeters,
    widthMeters: footprintWidth,
    depthMeters: footprintDepth,
    footprintAreaMeters: footprintArea,
    intentionalVerticalStructure
  })) return null;
  const shade = 0.44 + random * 0.12;
  return {
    heightMeters,
    heightSource: semantics.heightSource,
    identity: String(building?.identity || ''),
    color: [shade * 1.02, shade, shade * 0.95]
  };
}

export { mappedBuildingTags, resolveFarBuildingMassing };
