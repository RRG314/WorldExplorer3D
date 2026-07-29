import { sampleFeatureSurfaceY } from "../structure-semantics.js?v=28";

function beam(x, y, z, scaleX, scaleY, scaleZ, rotationY) {
  return { x, y, z, scaleX, scaleY, scaleZ, rotationY };
}

export function collectCoveredVisualInstances(feature, structurePts, deps = {}) {
  const samplePoint = deps.samplePointAlongPolyline;
  const portals = [];
  const walls = [];
  const roofs = [];
  const lights = [];
  const shells = [];
  const semantics = feature?.structureSemantics || {};
  if (
    semantics.structureKind !== 'covered' ||
    !Array.isArray(structurePts) ||
    structurePts.length < 2
  ) {
    return { portals, walls, roofs, lights, shells };
  }
  const width = Math.max(3.4, Number(feature?.width) || 6);
  const clearance = Math.max(
    3,
    Math.min(5.2, Number(feature?.transportRecord?.maxHeightMeters) || 4.4)
  );
  const enclosedSides = semantics.buildingPassage || semantics.indoor;
  for (let index = 0; index < structurePts.length - 1; index += 1) {
    const p1 = structurePts[index];
    const p2 = structurePts[index + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.2)) continue;
    const x = (p1.x + p2.x) * 0.5;
    const z = (p1.z + p2.z) * 0.5;
    const roadY = sampleFeatureSurfaceY(feature, x, z);
    if (!Number.isFinite(roadY)) continue;
    const rotationY = Math.atan2(dx, dz);
    roofs.push(beam(x, roadY + clearance + 0.16, z, width + 1.1, 0.32, length, rotationY));
    if (enclosedSides) {
      const nx = -dz / length;
      const nz = dx / length;
      const offset = width * 0.5 + 0.54;
      for (const side of [-1, 1]) {
        walls.push(beam(
          x + nx * offset * side,
          roadY + clearance * 0.5,
          z + nz * offset * side,
          0.28,
          clearance,
          length,
          rotationY
        ));
      }
    }
  }
  if (semantics.buildingPassage && typeof samplePoint === 'function') {
    const total = structurePts.slice(1).reduce((distance, point, index) =>
      distance + Math.hypot(
        point.x - structurePts[index].x,
        point.z - structurePts[index].z
      ), 0);
    for (const distance of [0, total]) {
      const point = samplePoint(structurePts, distance);
      if (!point) continue;
      const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
      if (!Number.isFinite(roadY)) continue;
      const nx = -point.tangentZ;
      const nz = point.tangentX;
      const rotationY = Math.atan2(point.tangentX, point.tangentZ);
      const pillarWidth = Math.max(0.65, width * 0.13);
      const sideOffset = width * 0.5 + 0.54 + pillarWidth * 0.5;
      portals.push(beam(point.x + nx * sideOffset, roadY + clearance * 0.5, point.z + nz * sideOffset, pillarWidth, clearance, Math.max(0.8, width * 0.3), rotationY));
      portals.push(beam(point.x - nx * sideOffset, roadY + clearance * 0.5, point.z - nz * sideOffset, pillarWidth, clearance, Math.max(0.8, width * 0.3), rotationY));
      portals.push(beam(point.x, roadY + clearance + 0.24, point.z, width + pillarWidth * 2.2, 0.48, Math.max(0.8, width * 0.28), rotationY));
    }
  }
  return { portals, walls, roofs, lights, shells };
}

export function collectTunnelVisualInstances(feature, structurePts, total, deps = {}) {
  const samplePoint = deps.samplePointAlongPolyline;
  const sampleTerrain = deps.sampleTerrainHeight;
  const portals = [];
  const walls = [];
  const roofs = [];
  const lights = [];
  const shells = [];
  if (!Array.isArray(structurePts) || structurePts.length < 2) return { portals, walls, roofs, lights, shells };

  const model = feature?.tunnelSystemModel || null;
  if (!['tunnel', 'underpass'].includes(model?.visualKind)) return { portals, walls, roofs, lights, shells };
  const width = Math.max(3.4, Number(feature?.width) || 6);
  const clearance = Number(model.clearance) || Math.max(3.2, Math.min(4.8, Number(feature?.structureSemantics?.cutDepth || 4.6) - 0.35));
  const roofThickness = Number(model.roofThickness) || 0.32;
  const interiorHalfWidth = width * 0.5 + 0.72;
  const shellRanges = Array.isArray(model.shellRanges)
    ? model.shellRanges.filter((range) =>
        Number.isFinite(range?.start) &&
        Number.isFinite(range?.end) &&
        range.end - range.start > 1.2
      )
    : Number.isFinite(model.shellStart) && Number.isFinite(model.shellEnd)
      ? [{ start: model.shellStart, end: model.shellEnd }]
      : [];
  if (shellRanges.length === 0) return { portals, walls, roofs, lights, shells };

  let traveled = 0;
  let lastLightStation = -1;
  for (let i = 0; i < structurePts.length - 1; i++) {
    const p1 = structurePts[i];
    const p2 = structurePts[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.2)) continue;
    const x = (p1.x + p2.x) * 0.5;
    const z = (p1.z + p2.z) * 0.5;
    const roadY = sampleFeatureSurfaceY(feature, x, z);
    if (!Number.isFinite(roadY)) continue;
    const segmentStation = traveled + length * 0.5;
    const insideShell = shellRanges.some((range) =>
      segmentStation >= range.start && segmentStation <= range.end
    );
    if (!insideShell) {
      traveled += length;
      continue;
    }
    const rotationY = Math.atan2(dx, dz);
    const lightStation = Math.floor((traveled + length * 0.5) / 24);
    if (model.visualKind === 'tunnel' && lightStation !== lastLightStation) {
      lights.push(beam(x, roadY + clearance - 0.08, z, Math.min(3.2, width * 0.48), 0.08, 1.4, rotationY));
      lastLightStation = lightStation;
    }
    traveled += length;
  }

  if (typeof samplePoint !== "function" || typeof sampleTerrain !== "function") return { portals, walls, roofs, lights, shells };
  const pointRing = (distance, includeTerrain = false) => {
    const point = samplePoint(structurePts, distance);
    if (!point) return null;
    const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
    const terrainY = includeTerrain ? Number(sampleTerrain(point.x, point.z)) : NaN;
    if (!Number.isFinite(roadY) || (includeTerrain && !Number.isFinite(terrainY))) return null;
    return {
      x: point.x,
      y: roadY,
      ...(includeTerrain ? { terrainY: Math.max(roadY + 0.65, terrainY + 0.08) } : {}),
      z: point.z,
      tangentX: point.tangentX,
      tangentZ: point.tangentZ
    };
  };
  const distancesWithin = (startDistance, endDistance) => {
    const distances = [startDistance];
    let cumulative = 0;
    for (let index = 0; index < structurePts.length - 1; index += 1) {
      cumulative += Math.hypot(
        structurePts[index + 1].x - structurePts[index].x,
        structurePts[index + 1].z - structurePts[index].z
      );
      if (cumulative > startDistance + 0.15 && cumulative < endDistance - 0.15) {
        distances.push(cumulative);
      }
    }
    distances.push(endDistance);
    return distances;
  };
  for (let rangeIndex = 0; rangeIndex < shellRanges.length; rangeIndex += 1) {
    const range = shellRanges[rangeIndex];
    const rings = distancesWithin(range.start, range.end)
      .map((distance) => pointRing(distance))
      .filter(Boolean);
    if (rings.length < 2) continue;
    const approaches = [];
    if (model.visualKind === 'tunnel' && rangeIndex === 0 && range.start > 1.2) {
      const approach = distancesWithin(0, range.start)
        .map((distance) => pointRing(distance, true))
        .filter(Boolean);
      if (approach.length >= 2) approaches.push({ rings: approach });
    }
    if (
      model.visualKind === 'tunnel' &&
      rangeIndex === shellRanges.length - 1 &&
      total - range.end > 1.2
    ) {
      const approach = distancesWithin(range.end, total)
        .map((distance) => pointRing(distance, true))
        .filter(Boolean);
      if (approach.length >= 2) approaches.push({ rings: approach });
    }
    shells.push({
      rings,
      approaches,
      halfWidth: interiorHalfWidth,
      clearance,
      roofThickness,
      visualKind: model.visualKind
    });
  }

  const portalDistances = Array.isArray(model.portalDistances)
    ? model.portalDistances
    : [model.portalStart, model.portalEnd];
  for (const distance of portalDistances) {
    if (!Number.isFinite(distance)) continue;
    const point = samplePoint(feature.pts, distance);
    if (!point) continue;
    const terrainY = sampleTerrain(point.x, point.z);
    const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
    const openingHeight = clearance;
    if (!Number.isFinite(roadY) || !(openingHeight > 2.6)) continue;
    const nx = -point.tangentZ;
    const nz = point.tangentX;
    const rotationY = Math.atan2(point.tangentX, point.tangentZ);
    const pillarWidth = Math.max(0.75, width * 0.16);
    const sideOffset = interiorHalfWidth + pillarWidth * 0.5;
    portals.push(beam(point.x + nx * sideOffset, roadY + openingHeight * 0.5, point.z + nz * sideOffset, pillarWidth, openingHeight, Math.max(1.2, width * 0.55), rotationY));
    portals.push(beam(point.x - nx * sideOffset, roadY + openingHeight * 0.5, point.z - nz * sideOffset, pillarWidth, openingHeight, Math.max(1.2, width * 0.55), rotationY));
    portals.push(beam(point.x, roadY + openingHeight + 0.3, point.z, width + pillarWidth * 2.2, 0.6, Math.max(0.9, width * 0.34), rotationY));
  }
  return { portals, walls, roofs, lights, shells };
}
