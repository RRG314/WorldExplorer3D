import { sampleFeatureSurfaceY } from "../structure-semantics.js?v=12";

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
  if (!Array.isArray(structurePts) || structurePts.length < 2) return { portals, walls, roofs, lights };

  const width = Math.max(3.4, Number(feature?.width) || 6);
  const clearance = Math.max(3.2, Math.min(4.8, Number(feature?.structureSemantics?.cutDepth || 4.6) - 0.35));
  const wallThickness = Math.max(0.22, Math.min(0.42, width * 0.035));
  const roofThickness = 0.32;
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
    const nx = -dz / length;
    const nz = dx / length;
    const rotationY = Math.atan2(dx, dz);
    const sideOffset = interiorHalfWidth + wallThickness * 0.5;
    walls.push(beam(x + nx * sideOffset, roadY + clearance * 0.5, z + nz * sideOffset, wallThickness, clearance, length + 0.2, rotationY));
    walls.push(beam(x - nx * sideOffset, roadY + clearance * 0.5, z - nz * sideOffset, wallThickness, clearance, length + 0.2, rotationY));
    roofs.push(beam(x, roadY + clearance + roofThickness * 0.5, z, interiorHalfWidth * 2 + wallThickness * 2, roofThickness, length + 0.25, rotationY));
    const lightStation = Math.floor((traveled + length * 0.5) / 24);
    if (lightStation !== lastLightStation) {
      lights.push(beam(x, roadY + clearance - 0.08, z, Math.min(3.2, width * 0.48), 0.08, 1.4, rotationY));
      lastLightStation = lightStation;
    }
    traveled += length;
  }

  if (typeof samplePoint !== "function" || typeof sampleTerrain !== "function") return { portals, walls, roofs, lights };
  const portalInset = Math.min(4, Math.max(2, total * 0.08));
  for (const distance of [portalInset, Math.max(0, total - portalInset)]) {
    const point = samplePoint(feature.pts, distance);
    if (!point) continue;
    const terrainY = sampleTerrain(point.x, point.z);
    const roadY = sampleFeatureSurfaceY(feature, point.x, point.z);
    const openingHeight = Math.max(clearance, terrainY - roadY - 0.15);
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
  return { portals, walls, roofs, lights };
}
