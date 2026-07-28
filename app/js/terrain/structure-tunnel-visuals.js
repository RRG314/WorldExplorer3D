import { sampleFeatureSurfaceY } from "../structure-semantics.js?v=25";

function beam(x, y, z, scaleX, scaleY, scaleZ, rotationY) {
  return { x, y, z, scaleX, scaleY, scaleZ, rotationY };
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
  if (model?.visualKind !== 'tunnel') return { portals, walls, roofs, lights, shells };
  const width = Math.max(3.4, Number(feature?.width) || 6);
  const clearance = Number(model.clearance) || Math.max(3.2, Math.min(4.8, Number(feature?.structureSemantics?.cutDepth || 4.6) - 0.35));
  const roofThickness = Number(model.roofThickness) || 0.32;
  const interiorHalfWidth = width * 0.5 + 0.72;

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
    if (segmentStation < model.shellStart || segmentStation > model.shellEnd) {
      traveled += length;
      continue;
    }
    const rotationY = Math.atan2(dx, dz);
    const lightStation = Math.floor((traveled + length * 0.5) / 24);
    if (lightStation !== lastLightStation) {
      lights.push(beam(x, roadY + clearance - 0.08, z, Math.min(3.2, width * 0.48), 0.08, 1.4, rotationY));
      lastLightStation = lightStation;
    }
    traveled += length;
  }

  if (typeof samplePoint !== "function" || typeof sampleTerrain !== "function") return { portals, walls, roofs, lights, shells };
  const ringDistances = [model.shellStart];
  let stationDistance = 0;
  for (let index = 0; index < structurePts.length - 1; index += 1) {
    stationDistance += Math.hypot(
      structurePts[index + 1].x - structurePts[index].x,
      structurePts[index + 1].z - structurePts[index].z
    );
    if (stationDistance > model.shellStart + 0.15 && stationDistance < model.shellEnd - 0.15) {
      ringDistances.push(stationDistance);
    }
  }
  ringDistances.push(model.shellEnd);
  const rings = ringDistances
    .map((distance) => {
      const point = samplePoint(structurePts, distance);
      if (!point) return null;
      const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
      if (!Number.isFinite(roadY)) return null;
      return {
        x: point.x,
        y: roadY,
        z: point.z,
        tangentX: point.tangentX,
        tangentZ: point.tangentZ
      };
    })
    .filter(Boolean);
  if (rings.length >= 2) {
    const buildApproachRings = (startDistance, endDistance) => {
      if (!(endDistance - startDistance > 1.2)) return [];
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
      return distances.map((distance) => {
        const point = samplePoint(structurePts, distance);
        if (!point) return null;
        const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
        const terrainY = Number(sampleTerrain(point.x, point.z));
        if (!Number.isFinite(roadY) || !Number.isFinite(terrainY)) return null;
        return {
          x: point.x,
          y: roadY,
          terrainY: Math.max(roadY + 0.65, terrainY + 0.08),
          z: point.z,
          tangentX: point.tangentX,
          tangentZ: point.tangentZ
        };
      }).filter(Boolean);
    };
    const approaches = [];
    const startApproach = buildApproachRings(0, model.shellStart);
    const endApproach = buildApproachRings(model.shellEnd, total);
    if (startApproach.length >= 2) approaches.push({ rings: startApproach });
    if (endApproach.length >= 2) approaches.push({ rings: endApproach });
    shells.push({
      rings,
      approaches,
      halfWidth: interiorHalfWidth,
      clearance,
      roofThickness
    });
  }

  for (const distance of [model.portalStart, model.portalEnd]) {
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
