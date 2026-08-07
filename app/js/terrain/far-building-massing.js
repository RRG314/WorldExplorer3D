import { isImplausibleTallBuildingFootprint } from '../world/building-geometry-quality.js?v=1';

function identityFraction(identity) {
  let hash = 2166136261;
  const text = String(identity || '');
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967295;
}

function resolveFarBuildingMassing(building, footprint, areaWorld, unitsPerMeter) {
  const properties = building?.properties || {};
  const mappedHeight = Number.parseFloat(
    properties.height ?? properties.render_height ?? properties['building:height']
  );
  const kind = String(properties.kind || properties.type || '').toLowerCase();
  const random = identityFraction(building?.identity);
  const inferredHeight = /commercial|office|apartments|hotel/.test(kind)
    ? 12 + random * 28
    : 5.5 + random * 11;
  const heightMeters = Math.max(3, Math.min(180, Number.isFinite(mappedHeight) ? mappedHeight : inferredHeight));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const point of footprint) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  const intentionalVerticalStructure = /tower|spire|chimney|silo|lighthouse|mast|minaret/.test(kind);
  if (isImplausibleTallBuildingFootprint({
    heightMeters,
    widthMeters: (maxX - minX) / unitsPerMeter,
    depthMeters: (maxZ - minZ) / unitsPerMeter,
    footprintAreaMeters: areaWorld / (unitsPerMeter * unitsPerMeter),
    intentionalVerticalStructure
  })) return null;
  const shade = 0.44 + random * 0.12;
  return { heightMeters, color: [shade * 1.02, shade, shade * 0.95] };
}

export { resolveFarBuildingMassing };
