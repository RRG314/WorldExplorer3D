const NO_BUILDING_COLLISION = Object.freeze({ collision: false });

function buildingVerticalRangeOverlap(building, actorBaseY, actorHeight, tolerance = 0.45) {
  if (!Number.isFinite(actorBaseY)) return true;
  const actorTopY = actorBaseY + (Number.isFinite(actorHeight) ? Math.max(0.5, actorHeight) : 1.8);
  const minY = Number.isFinite(building?.minY) ? building.minY : Number.isFinite(building?.baseY) ? building.baseY : NaN;
  const maxY = Number.isFinite(building?.maxY) ? building.maxY : Number.isFinite(minY) && Number.isFinite(building?.height) ? minY + building.height : NaN;
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return true;
  return !(actorTopY < minY - tolerance || actorBaseY > maxY + tolerance);
}

function createBuildingCollisionQuery(appCtx) {
  const candidateBuffer = [];
  const candidateDedupe = new Set();
  return function checkBuildingCollision(x, z, carRadius = 2, options = {}) {
    if (!Array.isArray(appCtx.buildings) || appCtx.buildings.length === 0) return NO_BUILDING_COLLISION;
    const actorBaseY = Number.isFinite(options?.actorBaseY) ? Number(options.actorBaseY) : NaN;
    const actorHeight = Number.isFinite(options?.actorHeight) ? Number(options.actorHeight) : 1.9;
    const candidates = typeof appCtx.getNearbyBuildings === 'function'
      ? appCtx.getNearbyBuildings(x, z, carRadius + 8, candidateBuffer, candidateDedupe)
      : appCtx.buildings;
    if (!candidates?.length) return NO_BUILDING_COLLISION;

    for (let i = 0; i < candidates.length; i += 1) {
      const building = candidates[i];
      if (!building || building.collisionDisabled) continue;
      const collisionRadius = building.collisionKind === 'barrier' ? Math.min(carRadius, 0.95) : carRadius;
      if (!buildingVerticalRangeOverlap(building, actorBaseY, actorHeight)) continue;
      if (x < building.minX - collisionRadius || x > building.maxX + collisionRadius ||
        z < building.minZ - collisionRadius || z > building.maxZ + collisionRadius) continue;

      const hasPolygon = Array.isArray(building.pts) && building.pts.length >= 3;
      const isInside = hasPolygon
        ? appCtx.pointInPolygon(x, z, building.pts)
        : x >= building.minX && x <= building.maxX && z >= building.minZ && z <= building.maxZ;
      let nearestEdgeDist = Infinity;
      let nearestEdgeInfo = null;

      if (hasPolygon) {
        for (let j = 0; j < building.pts.length; j += 1) {
          const p1 = building.pts[j];
          const p2 = building.pts[(j + 1) % building.pts.length];
          const dx = p2.x - p1.x;
          const dz = p2.z - p1.z;
          const len2 = dx * dx + dz * dz;
          if (len2 === 0) continue;

          const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (z - p1.z) * dz) / len2));
          const nearestX = p1.x + t * dx;
          const nearestZ = p1.z + t * dz;
          const dist = Math.hypot(x - nearestX, z - nearestZ);
          if (dist >= nearestEdgeDist) continue;
          nearestEdgeDist = dist;

          let pushX = -dz;
          let pushZ = dx;
          const pushLength = Math.hypot(pushX, pushZ);
          if (pushLength <= 0) continue;
          pushX /= pushLength;
          pushZ /= pushLength;
          if ((x - nearestX) * pushX + (z - nearestZ) * pushZ < 0) {
            pushX = -pushX;
            pushZ = -pushZ;
          }
          nearestEdgeInfo = { nearestX, nearestZ, pushX, pushZ, dist };
        }
      } else {
        const nearestX = Math.max(building.minX, Math.min(x, building.maxX));
        const nearestZ = Math.max(building.minZ, Math.min(z, building.maxZ));
        if (isInside) {
          const edges = [
            { dist: Math.max(0, x - building.minX), nearestX: building.minX, nearestZ: z, pushX: -1, pushZ: 0 },
            { dist: Math.max(0, building.maxX - x), nearestX: building.maxX, nearestZ: z, pushX: 1, pushZ: 0 },
            { dist: Math.max(0, z - building.minZ), nearestX: x, nearestZ: building.minZ, pushX: 0, pushZ: -1 },
            { dist: Math.max(0, building.maxZ - z), nearestX: x, nearestZ: building.maxZ, pushX: 0, pushZ: 1 }
          ];
          nearestEdgeInfo = edges.reduce((best, edge) => edge.dist < best.dist ? edge : best, edges[0]);
          nearestEdgeDist = nearestEdgeInfo.dist;
        } else {
          const diffX = x - nearestX;
          const diffZ = z - nearestZ;
          const dist = Math.hypot(diffX, diffZ);
          const inv = dist > 1e-6 ? 1 / dist : 0;
          nearestEdgeDist = dist;
          nearestEdgeInfo = { nearestX, nearestZ, pushX: diffX * inv, pushZ: diffZ * inv, dist };
        }
      }

      if ((isInside || nearestEdgeDist < collisionRadius) && nearestEdgeInfo) {
        return {
          collision: true,
          building,
          actorBaseY,
          inside: isInside,
          nearestPoint: { x: nearestEdgeInfo.nearestX, z: nearestEdgeInfo.nearestZ },
          pushX: nearestEdgeInfo.pushX,
          pushZ: nearestEdgeInfo.pushZ,
          penetration: collisionRadius - nearestEdgeDist
        };
      }
    }
    return NO_BUILDING_COLLISION;
  };
}

export { createBuildingCollisionQuery };
