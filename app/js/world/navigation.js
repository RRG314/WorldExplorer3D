import { ctx as appCtx } from "../shared-context.js?v=55";
import { queryNearbyRoads, roadSpatialIndexSnapshot } from "./road-spatial-index.js?v=2";

const runtime = {
  applySpawnTarget: () => null,
  areRoadsConnected: () => false,
  isSuppressedBaseRoad: () => false,
  sampleFeatureSurfaceY: () => NaN,
  tryAutoEnterBoatAt: () => null
};

const nearRoadResult = {
  road: null,
  dist: Infinity,
  pt: { x: 0, z: 0 },
  y: NaN,
  verticalDelta: Infinity,
  distanceAlong: NaN,
  distanceToEndpoint: Infinity,
  distanceToTransitionZone: Infinity
};

export function initWorldNavigation(deps = {}) {
  if (typeof deps.applySpawnTarget === 'function') runtime.applySpawnTarget = deps.applySpawnTarget;
  if (typeof deps.areRoadsConnected === 'function') runtime.areRoadsConnected = deps.areRoadsConnected;
  if (typeof deps.isSuppressedBaseRoad === 'function') runtime.isSuppressedBaseRoad = deps.isSuppressedBaseRoad;
  if (typeof deps.sampleFeatureSurfaceY === 'function') runtime.sampleFeatureSurfaceY = deps.sampleFeatureSurfaceY;
  if (typeof deps.tryAutoEnterBoatAt === 'function') runtime.tryAutoEnterBoatAt = deps.tryAutoEnterBoatAt;
}

function finiteNumberOr(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersect = zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function runtimeRoadFeatures() {
  const features = [];
  if (Array.isArray(appCtx.roads)) {
    for (let i = 0; i < appCtx.roads.length; i++) {
      const road = appCtx.roads[i];
      if (!runtime.isSuppressedBaseRoad(road)) features.push(road);
    }
  }
  if (Array.isArray(appCtx.overlayRuntimeRoads)) {
    for (let i = 0; i < appCtx.overlayRuntimeRoads.length; i++) {
      features.push(appCtx.overlayRuntimeRoads[i]);
    }
  }
  return features;
}

export function buildingContainingPoint(x, z, radius = 6, options = {}) {
  const candidateBuildings = typeof appCtx.getNearbyBuildings === 'function' ?
    appCtx.getNearbyBuildings(x, z, radius + 12) :
    appCtx.buildings;
  const actorBaseY = Number.isFinite(options?.y) ? Number(options.y) : NaN;
  const actorHeight = Number.isFinite(options?.actorHeight) ? Math.max(0.5, Number(options.actorHeight)) : NaN;
  const actorTopY = Number.isFinite(actorBaseY) && Number.isFinite(actorHeight) ? actorBaseY + actorHeight : NaN;
  const verticalTolerance = Number.isFinite(options?.tolerance) ? Math.max(0, Number(options.tolerance)) : 0.35;
  if (!Array.isArray(candidateBuildings) || candidateBuildings.length === 0) return null;

  for (let i = 0; i < candidateBuildings.length; i++) {
    const building = candidateBuildings[i];
    if (!building) continue;
    if (x < building.minX || x > building.maxX || z < building.minZ || z > building.maxZ) continue;
    if (Number.isFinite(actorBaseY) && Number.isFinite(actorTopY)) {
      const minY = Number.isFinite(building.minY) ? building.minY : Number.isFinite(building.baseY) ? building.baseY : NaN;
      const maxY = Number.isFinite(building.maxY) ? building.maxY : Number.isFinite(minY) && Number.isFinite(building.height) ? minY + building.height : NaN;
      if (Number.isFinite(minY) && Number.isFinite(maxY) &&
          (actorTopY < minY - verticalTolerance || actorBaseY > maxY + verticalTolerance)) {
        continue;
      }
    }

    const inside = Array.isArray(building.pts) && building.pts.length >= 3 ?
      pointInPolygon(x, z, building.pts) :
      true;
    if (inside) return building;
  }
  return null;
}

export function teleportToLocation(worldX, worldZ, options = {}) {
  const walkModeActive = !!(appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk');
  const mode = walkModeActive ? 'walk' : 'drive';
  const currentAngle = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.angle, appCtx.car?.angle) :
    finiteNumberOr(appCtx.car?.angle, 0);
  const currentFeetY = walkModeActive ?
    finiteNumberOr(appCtx.Walk?.state?.walker?.y, 0) - 1.7 :
    NaN;

  const boatSpawn = runtime.tryAutoEnterBoatAt(worldX, worldZ, {
    ...options,
    mode,
    source: options.source || 'teleport'
  });
  if (boatSpawn) {
    if (appCtx.droneMode) {
      appCtx.drone.x = boatSpawn.x;
      appCtx.drone.z = boatSpawn.z;
      appCtx.drone.yaw = boatSpawn.angle;
    }
    return boatSpawn;
  }

  const resolved = runtime.applySpawnTarget(worldX, worldZ, {
    ...options,
    mode,
    angle: currentAngle,
    feetY: currentFeetY,
    source: options.source || 'teleport'
  });

  if (appCtx.droneMode && resolved) {
    appCtx.drone.x = resolved.x;
    appCtx.drone.z = resolved.z;
    appCtx.drone.yaw = resolved.angle;
  }
  return resolved;
}

function mapScreenToWorld(screenX, screenY, options = {}) {
  const mapCenterX = Number.isFinite(options.centerX) ? Number(options.centerX) : 0;
  const mapCenterY = Number.isFinite(options.centerY) ? Number(options.centerY) : 0;
  const zoom = Number.isFinite(options.zoom) ? Number(options.zoom) : 15;
  const ref = appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
  const refLat = appCtx.LOC.lat - ref.z / appCtx.SCALE;
  const refLon = appCtx.LOC.lon + ref.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));

  const n = Math.pow(2, zoom);
  const xtileFloat = (refLon + 180) / 360 * n;
  const ytileFloat = (1 - Math.log(Math.tan(refLat * Math.PI / 180) + 1 / Math.cos(refLat * Math.PI / 180)) / Math.PI) / 2 * n;

  const centerTileX = Math.floor(xtileFloat);
  const centerTileY = Math.floor(ytileFloat);
  const pixelOffsetX = (xtileFloat - centerTileX) * 256;
  const pixelOffsetY = (ytileFloat - centerTileY) * 256;

  const px = screenX - mapCenterX;
  const py = screenY - mapCenterY;

  const xt = centerTileX + (px + pixelOffsetX) / 256;
  const yt = centerTileY + (py + pixelOffsetY) / 256;

  const lon = xt / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * yt / n)));
  const lat = latRad * 180 / Math.PI;

  return {
    x: (lon - appCtx.LOC.lon) * appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180),
    z: -(lat - appCtx.LOC.lat) * appCtx.SCALE
  };
}

export function minimapScreenToWorld(screenX, screenY) {
  return mapScreenToWorld(screenX, screenY, {
    centerX: 75,
    centerY: 75,
    zoom: Number.isFinite(appCtx.minimapZoom) ? appCtx.minimapZoom : 15
  });
}

export function largeMapScreenToWorld(screenX, screenY) {
  return mapScreenToWorld(screenX, screenY, {
    centerX: 400,
    centerY: 400,
    zoom: appCtx.largeMapZoom
  });
}

function roadContinuityCandidates(preferredRoad) {
  if (!preferredRoad) return [];
  const candidates = [preferredRoad];
  const seen = new Set([preferredRoad]);
  const endpoints = ['start', 'end'];
  for (let i = 0; i < endpoints.length; i++) {
    const linked = Array.isArray(preferredRoad?.connectedFeatures?.[endpoints[i]]) ? preferredRoad.connectedFeatures[endpoints[i]] : [];
    for (let j = 0; j < linked.length; j++) {
      const feature = linked[j]?.feature || null;
      if (!feature || seen.has(feature)) continue;
      seen.add(feature);
      candidates.push(feature);
    }
  }
  return candidates;
}

function evaluateNearestRoadCandidate(road, x, z, targetY, maxVerticalDelta, preferredRoad) {
  const pts = Array.isArray(road?.pts) ? road.pts : null;
  if (!pts || pts.length < 2) return null;
  const semantics = road?.structureSemantics || null;
  const profileDistances = road?.surfaceDistances instanceof Float32Array ? road.surfaceDistances : null;
  const profileHeights = road?.surfaceHeights instanceof Float32Array ? road.surfaceHeights : null;
  const transitionAnchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
  const sameRoad = road === preferredRoad;
  const connectedRoad = !!(
    preferredRoad &&
    !sameRoad &&
    (
      Array.isArray(preferredRoad?.connectedFeatures?.start) && preferredRoad.connectedFeatures.start.some((entry) => entry?.feature === road) ||
      Array.isArray(preferredRoad?.connectedFeatures?.end) && preferredRoad.connectedFeatures.end.some((entry) => entry?.feature === road)
    )
  );
  const sameVerticalGroup = !!(
    preferredRoad?.structureSemantics?.verticalGroup &&
    road?.structureSemantics?.verticalGroup === preferredRoad.structureSemantics.verticalGroup
  );
  const continuityAccess = !!preferredRoad && (
    sameRoad ||
    connectedRoad ||
    sameVerticalGroup ||
    runtime.areRoadsConnected(preferredRoad, road)
  );
  let totalDistance = Number.isFinite(profileDistances?.[profileDistances.length - 1]) ? Number(profileDistances[profileDistances.length - 1]) : NaN;
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) {
    totalDistance = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      totalDistance += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    }
  }
  let best = null;
  let cumulativeDistance = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const segLen = Math.sqrt(len2);
    let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const nx = p1.x + t * dx;
    const nz = p1.z + t * dz;
    const d = Math.hypot(x - nx, z - nz);
    // Navigation runs every simulation frame. Road surface profiles are
    // refreshed when terrain changes. Production roads use point-aligned typed
    // arrays, so interpolate them directly and retain the general sampler only
    // for irregular or legacy profiles.
    const fromY = profileHeights?.length === pts.length ? Number(profileHeights[i]) : NaN;
    const toY = profileHeights?.length === pts.length ? Number(profileHeights[i + 1]) : NaN;
    const roadY =
      Number.isFinite(fromY) && Number.isFinite(toY) ?
        fromY + (toY - fromY) * t :
        runtime.sampleFeatureSurfaceY(road, x, z, { x: nx, z: nz, dist: d, segIndex: i, t }, {
          preferStoredProfile: true
        });
    const verticalDelta = Number.isFinite(targetY) && Number.isFinite(roadY) ? Math.abs(roadY - targetY) : 0;
    const distanceAlong =
      profileDistances && profileDistances.length > i ?
        Number(profileDistances[i]) + segLen * t :
        cumulativeDistance + segLen * t;
    const distanceToEndpoint = Math.min(distanceAlong, Math.max(0, totalDistance - distanceAlong));
    let distanceToTransitionZone = Infinity;
    for (let j = 0; j < transitionAnchors.length; j++) {
      const anchor = transitionAnchors[j];
      const anchorDistance = Number(anchor?.distance);
      if (!Number.isFinite(anchorDistance)) continue;
      const span = Math.max(0, Number(anchor?.span) || 0);
      const zoneDistance = Math.max(0, Math.abs(distanceAlong - anchorDistance) - span);
      if (zoneDistance < distanceToTransitionZone) distanceToTransitionZone = zoneDistance;
    }
    if (verticalDelta > maxVerticalDelta) {
      cumulativeDistance += segLen;
      continue;
    }
    let verticalWeight =
      semantics?.terrainMode === 'elevated' ? 0.82 :
      semantics?.terrainMode === 'subgrade' ? 0.72 :
      0.38;
    let weightedDist = d + (Number.isFinite(targetY) && Number.isFinite(roadY) ? verticalDelta * verticalWeight : 0);
    if (preferredRoad) {
      if (sameRoad) {
        weightedDist = d + verticalDelta * 0.12;
      } else if (connectedRoad) {
        weightedDist = d + verticalDelta * 0.2;
      } else if (sameVerticalGroup) {
        weightedDist = d + verticalDelta * 0.32;
      }
      if (sameRoad) weightedDist -= 3.4;
      else if (connectedRoad) weightedDist -= 2.25;
      else if (sameVerticalGroup) weightedDist -= 0.7;
      if ((sameRoad || connectedRoad) && (t < 0.08 || t > 0.92)) weightedDist -= 0.55;
    }
    if (semantics?.gradeSeparated && !continuityAccess && Number.isFinite(verticalDelta)) {
      const directLockThreshold = semantics.terrainMode === 'elevated' ? 1.25 : 1.35;
      const transitionLockThreshold = semantics.terrainMode === 'elevated' ? 1.65 : 1.85;
      const nearTransition = Number.isFinite(distanceToTransitionZone) && distanceToTransitionZone <= 1.2;
      const attachable =
        verticalDelta <= directLockThreshold ||
        (nearTransition && verticalDelta <= transitionLockThreshold);
      if (!attachable) {
        weightedDist += 5.5 + Math.min(10, verticalDelta * 1.8);
      }
    }
    if (!best || weightedDist < best.weightedDist) {
      best = {
        road,
        dist: d,
        pt: { x: nx, z: nz },
        y: roadY,
        verticalDelta,
        weightedDist,
        distanceAlong,
        distanceToEndpoint,
        distanceToTransitionZone
      };
    }
    cumulativeDistance += segLen;
  }
  return best;
}

export function findNearestRoad(x, z, options = {}) {
  nearRoadResult.road = null;
  nearRoadResult.dist = Infinity;
  nearRoadResult.y = NaN;
  nearRoadResult.verticalDelta = Infinity;
  nearRoadResult.distanceAlong = NaN;
  nearRoadResult.distanceToEndpoint = Infinity;
  nearRoadResult.distanceToTransitionZone = Infinity;
  const targetY = Number.isFinite(options?.y) ? Number(options.y) : NaN;
  const maxVerticalDelta = Number.isFinite(options?.maxVerticalDelta) ? Math.max(0.5, Number(options.maxVerticalDelta)) : Infinity;
  let bestWeighted = Infinity;

  const baseRoads = Array.isArray(appCtx.roads) ? appCtx.roads : [];
  const overlayRoads = Array.isArray(appCtx.overlayRuntimeRoads) ? appCtx.overlayRuntimeRoads : [];
  let roads = queryNearbyRoads(baseRoads, overlayRoads, x, z, 260);
  if (roads.length === 0) roads = queryNearbyRoads(baseRoads, overlayRoads, x, z, 880);
  if (roads.length === 0) roads = queryNearbyRoads(baseRoads, overlayRoads, x, z, 2400);
  roads = roads.filter((road) => !runtime.isSuppressedBaseRoad(road));
  const requestedPreferredRoad = options?.preferredRoad || null;
  const preferredRoad = requestedPreferredRoad && roads.includes(requestedPreferredRoad) ? requestedPreferredRoad : null;
  if (preferredRoad) {
    const preferredCandidates = roadContinuityCandidates(preferredRoad);
    for (let i = 0; i < preferredCandidates.length; i++) {
      const preferredHit = evaluateNearestRoadCandidate(preferredCandidates[i], x, z, targetY, maxVerticalDelta, preferredRoad);
      if (!preferredHit) continue;
      if (preferredHit.weightedDist < bestWeighted) {
        bestWeighted = preferredHit.weightedDist;
        nearRoadResult.road = preferredHit.road;
        nearRoadResult.dist = preferredHit.dist;
        nearRoadResult.pt.x = preferredHit.pt.x;
        nearRoadResult.pt.z = preferredHit.pt.z;
        nearRoadResult.y = preferredHit.y;
        nearRoadResult.verticalDelta = preferredHit.verticalDelta;
        nearRoadResult.distanceAlong = preferredHit.distanceAlong;
        nearRoadResult.distanceToEndpoint = preferredHit.distanceToEndpoint;
        nearRoadResult.distanceToTransitionZone = preferredHit.distanceToTransitionZone;
      }
    }
    const continuityRadius = Math.max(12, Number(preferredRoad.width || 0) * 1.5);
    if (nearRoadResult.road && nearRoadResult.dist <= continuityRadius) return nearRoadResult;
  }

  for (let r = 0; r < roads.length; r++) {
    const road = roads[r];
    if (preferredRoad && road === preferredRoad) continue;
    const pts = road.pts;
    const fp = pts[0];
    const roughDist = Math.abs(x - fp.x) + Math.abs(z - fp.z);
    if (roughDist > nearRoadResult.dist + 500) continue;
    const hit = evaluateNearestRoadCandidate(road, x, z, targetY, maxVerticalDelta, preferredRoad);
    if (!hit || hit.weightedDist >= bestWeighted) continue;
    bestWeighted = hit.weightedDist;
    nearRoadResult.road = hit.road;
    nearRoadResult.dist = hit.dist;
    nearRoadResult.pt.x = hit.pt.x;
    nearRoadResult.pt.z = hit.pt.z;
    nearRoadResult.y = hit.y;
    nearRoadResult.verticalDelta = hit.verticalDelta;
    nearRoadResult.distanceAlong = hit.distanceAlong;
    nearRoadResult.distanceToEndpoint = hit.distanceToEndpoint;
    nearRoadResult.distanceToTransitionZone = hit.distanceToTransitionZone;
  }
  return nearRoadResult;
}

export { evaluateNearestRoadCandidate, roadSpatialIndexSnapshot };
