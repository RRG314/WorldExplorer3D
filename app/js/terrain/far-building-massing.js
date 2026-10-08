import { resolveMappedRoof } from '../world/mapped-roof-geometry.js?v=6';
import { selectBuildingExteriorProfile } from '../world/building-exterior-catalog.js?v=1';
import { isImplausibleTallBuildingFootprint } from '../world/building-geometry-quality.js?v=1';
import {
  buildingSeedFromIdentity,
  inferFallbackBuildingHeightMeters,
  interpretBuildingSemantics
} from '../building-semantics.js?v=5';

function mappedBuildingTags(properties = {}) {
  const buildingType = String(
    properties.building || properties.kind || properties.type || 'yes'
  ).trim() || 'yes';
  const tags = { ...properties, building: buildingType };
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
  for (const point of footprint || []) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  // Instances already carry metre dimensions. Reconstructing four temporary
  // footprint points per house creates millions of objects during a city load.
  const footprintWidth = footprint ? (maxX - minX) / unitsPerMeter : Number(building?.widthMeters);
  const footprintDepth = footprint ? (maxZ - minZ) / unitsPerMeter : Number(building?.depthMeters);
  const footprintArea = areaWorld / (unitsPerMeter * unitsPerMeter);
  const seed = buildingSeedFromIdentity(building?.identity);
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
  const profile = selectBuildingExteriorProfile({ tags, buildingType: kind, buildingSeed: seed,
    buildingIdentity: building?.identity, heightMeters, footprintArea, footprintWidth, footprintDepth,
    geographicCenter: { lat: building?.centerLat, lon: building?.centerLon },
    location: { lat: building?.centerLat, lon: building?.centerLon }, qualityTier: 'low' });
  const roof = heightMeters <= 24 && (/house|detached|bungalow|cabin|farmhouse|semi/.test(kind) || tags['roof:shape'])
    ? resolveMappedRoof(tags, heightMeters, semantics,
      [{x:0,z:0},{x:footprintWidth,z:0},{x:footprintWidth,z:footprintDepth},{x:0,z:footprintDepth}],
      {location:{lat:building?.centerLat,lon:building?.centerLon}}) : null;
  // Regional box LOD supports a gabled silhouette without adding one mesh per
  // roof. Other observed shapes keep their existing flat coarse representation.
  const roofFraction = roof?.shape === 'gabled' && heightMeters > 0
    ? Math.min(.4, Math.max(.1, Math.round(roof.roofHeight / heightMeters * 20) / 20)) : 0;
  const tint = profile.material.color;
  const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  return {
    heightMeters,
    roofFraction,
    heightSource: semantics.heightSource,
    identity: String(building?.identity || ''),
    color: [linear(((tint >> 16) & 255) / 255), linear(((tint >> 8) & 255) / 255), linear((tint & 255) / 255)]
  };
}

export { mappedBuildingTags, resolveFarBuildingMassing };

// Geometry detail may simplify a valid source polygon, but may not determine
// whether the building exists. Return null for a degenerate LOD so the caller
// uses the already validated compact footprint. Height remains source-based.
export function farBuildingRenderFootprint(building, geoToWorld, unitsPerMeter) {
  const ring = building?.ring;
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const closed = ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1];
  const length = ring.length - (closed ? 1 : 0);
  const stride = Math.max(1, Math.ceil(length / 18));
  const footprint = [];
  for (let i = 0; i < length; i += stride) {
    const [lon, lat] = ring[i] || [];
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    const point = geoToWorld(lat, lon);
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.z)) return null;
    footprint.push(point);
  }
  if (footprint.length < 3) return null;
  let area = 0;
  for (let i = 0, j = footprint.length - 1; i < footprint.length; j = i++) {
    area += footprint[j].x * footprint[i].z - footprint[i].x * footprint[j].z;
  }
  const areaMeters = Math.abs(area) / (2 * unitsPerMeter * unitsPerMeter);
  if (!Number.isFinite(areaMeters) || areaMeters < 14 || areaMeters > 350000) return null;
  return footprint;
}
