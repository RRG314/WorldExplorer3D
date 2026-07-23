import { ctx as appCtx } from "../shared-context.js?v=55";

const queryCaches = new Map();
const candidateTargets = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: 0 }
];

function buildingVerticalOverlap(building, y, radius) {
  const minY = Number.isFinite(building?.minY) ? building.minY : building?.baseY;
  const maxY = Number.isFinite(building?.maxY)
    ? building.maxY
    : Number.isFinite(minY) && Number.isFinite(building?.height)
      ? minY + building.height
      : NaN;
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return true;
  return y + radius >= minY && y - radius <= maxY;
}

function buildingContainsCamera(building, x, y, z, radius) {
  if (!building || building.collisionDisabled || building.allowsPassageBelow === true) return false;
  if (!buildingVerticalOverlap(building, y, radius)) return false;
  return x >= Number(building.minX) - radius && x <= Number(building.maxX) + radius &&
    z >= Number(building.minZ) - radius && z <= Number(building.maxZ) + radius;
}

function nearbyBuildings(x, z, radius, cacheKey) {
  const now = performance.now();
  const cached = queryCaches.get(cacheKey);
  if (cached && now - cached.updatedAt < 500 && radius <= cached.radius &&
      Math.hypot(x - cached.x, z - cached.z) < 12) {
    return cached.buildings;
  }
  const buildings = appCtx.getNearbyBuildings?.(x, z, radius) || [];
  queryCaches.set(cacheKey, { x, z, radius, updatedAt: now, buildings });
  return buildings;
}

function clearDistanceAlong(origin, target, buildings, radius) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  const steps = Math.max(8, Math.min(18, Math.ceil(distance / 1.25)));
  const startedInside = new Array(buildings.length);
  const exitedInitialOverlap = new Array(buildings.length).fill(false);
  for (let i = 0; i < buildings.length; i += 1) {
    startedInside[i] = buildingContainsCamera(buildings[i], origin.x, origin.y, origin.z, radius);
  }
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const x = origin.x + dx * t;
    const y = origin.y + dy * t;
    const z = origin.z + dz * t;
    for (let i = 0; i < buildings.length; i += 1) {
      const inside = buildingContainsCamera(buildings[i], x, y, z, radius);
      if (startedInside[i] && !exitedInitialOverlap[i]) {
        if (inside) continue;
        exitedInitialOverlap[i] = true;
        continue;
      }
      if (!inside) continue;
      return Math.max(0.35, distance * (step - 1) / steps - radius);
    }
  }
  if (startedInside.some((inside, index) => inside && !exitedInitialOverlap[index])) {
    return 0.35;
  }
  return distance;
}

export function resolveChaseCameraPosition(origin, target, options = {}) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const dz = target.z - origin.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 0.1) return target;

  const radius = Math.max(0.2, Number(options.radius) || 0.55);
  const midpointX = origin.x + dx * 0.5;
  const midpointZ = origin.z + dz * 0.5;
  const buildings = nearbyBuildings(
    midpointX,
    midpointZ,
    distance * 0.55 + radius + 4,
    String(options.cacheKey || "default")
  );
  let selectedTarget = target;
  let clearDistance = clearDistanceAlong(origin, target, buildings, radius);

  if (clearDistance < distance - Math.max(0.18, radius * 0.5)) {
    const horizontalDistance = Math.hypot(dx, dz) || 1;
    const sideX = -dz / horizontalDistance;
    const sideZ = dx / horizontalDistance;
    const alternateDistance = Math.max(2.4, horizontalDistance * 0.82);
    candidateTargets[0].x = origin.x + sideX * alternateDistance;
    candidateTargets[0].y = target.y;
    candidateTargets[0].z = origin.z + sideZ * alternateDistance;
    candidateTargets[1].x = origin.x - sideX * alternateDistance;
    candidateTargets[1].y = target.y;
    candidateTargets[1].z = origin.z - sideZ * alternateDistance;
    candidateTargets[2].x = origin.x + dx * 0.3;
    candidateTargets[2].y = origin.y + Math.max(3.2, distance * 0.7);
    candidateTargets[2].z = origin.z + dz * 0.3;

    let bestRatio = clearDistance / distance;
    for (let i = 0; i < candidateTargets.length; i += 1) {
      const candidate = candidateTargets[i];
      const candidateDistance = Math.hypot(
        candidate.x - origin.x,
        candidate.y - origin.y,
        candidate.z - origin.z
      );
      const candidateClear = clearDistanceAlong(origin, candidate, buildings, radius);
      const ratio = candidateClear / candidateDistance;
      if (ratio <= bestRatio) continue;
      bestRatio = ratio;
      selectedTarget = candidate;
      clearDistance = candidateClear;
      if (ratio >= 0.999) break;
    }
  }

  const selectedDx = selectedTarget.x - origin.x;
  const selectedDy = selectedTarget.y - origin.y;
  const selectedDz = selectedTarget.z - origin.z;
  const selectedDistance = Math.hypot(selectedDx, selectedDy, selectedDz) || 1;
  const resolvedScale = clearDistance / selectedDistance;
  target.x = origin.x + selectedDx * resolvedScale;
  target.y = origin.y + selectedDy * resolvedScale;
  target.z = origin.z + selectedDz * resolvedScale;

  const terrainY = appCtx.SurfaceQuery?.terrainAt?.(target.x, target.z)?.position?.y;
  if (Number.isFinite(terrainY)) target.y = Math.max(target.y, terrainY + radius + 0.25);
  return target;
}
