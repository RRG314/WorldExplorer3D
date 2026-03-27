import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import {
  isRoadSurfaceReachable
} from "./structure-semantics.js?v=26";
// physics.js - Car physics, building collision, drone movement
// ============================================================================

// RDT-based adaptive throttling state
// At high complexity, skip findNearestRoad on some frames (reuse cached result)
let _rdtPhysFrame = 0;
let _rdtRoadSkipInterval = 1; // 1 = check every frame, 2 = every other, etc.
let _cachedNearRoad = null;
let _poiUpdateTimer = 0;
let _navigationUpdateTimer = 0;
let _modeUpdateTimer = 0;
let _policeUpdateTimer = 0;
let _terrainUpdateTimer = 0;
let _interiorUpdateTimer = 0;
let _flowerChallengeTimer = 0;
let _trackUpdateTimer = 0;
let _walkPoliceCheckTimer = 0;
let _pendingTerrainAround = null;
const _terrainUpdateState = {
  drive: { x: NaN, z: NaN },
  drone: { x: NaN, z: NaN }
};

// Invalidate road cache - must be called on road reload, mode change, teleport
function invalidateRoadCache() {
  _cachedNearRoad = null;
  _rdtPhysFrame = 0;
}

// Reusable raycaster and vectors (avoid GC pressure from per-frame allocations)
let _physRaycaster = null;
const _physRayStart = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
const _physRayDir = typeof THREE !== 'undefined' ? new THREE.Vector3(0, -1, 0) : null;
const MOON_CAR_GRAVITY = -4.2; // tuned: less floaty than lunar free-fall for grounded driving feel
function _getPhysRaycaster() {
  if (!_physRaycaster && typeof THREE !== 'undefined') {
    _physRaycaster = new THREE.Raycaster();
  }
  return _physRaycaster;
}

function clampPhysValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function expPhysBlend(dt, rate, min = 0.04, max = 1) {
  return clampPhysValue(1 - Math.exp(-Math.max(0, dt) * rate), min, max);
}

function normalizePhysAngle(angle = 0) {
  let value = Number(angle) || 0;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function lerpPhysAngle(from = 0, to = 0, alpha = 1) {
  const safeAlpha = clampPhysValue(Number(alpha) || 0, 0, 1);
  const delta = normalizePhysAngle((Number(to) || 0) - (Number(from) || 0));
  return normalizePhysAngle((Number(from) || 0) + delta * safeAlpha);
}

function queuePendingTerrainAround(x, z, mode = 'drive') {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return;
  _pendingTerrainAround = {
    x,
    z,
    mode: String(mode || 'drive'),
    requestedAt: performance.now()
  };
}

function flushPendingTerrainAround() {
  if (appCtx.onMoon || appCtx.worldLoading || typeof appCtx.updateTerrainAround !== 'function') return false;
  if (!_pendingTerrainAround) return false;
  const pending = _pendingTerrainAround;
  _pendingTerrainAround = null;
  appCtx.updateTerrainAround(pending.x, pending.z);
  return true;
}

function getDriveRenderPose() {
  const pose =
    appCtx.car?._renderPose ||
    appCtx.car?._currSimPose ||
    null;
  if (pose) return pose;
  return {
    x: Number(appCtx.car?.x || 0),
    y:
      Number.isFinite(appCtx.car?.y) ?
        appCtx.car.y :
      Number.isFinite(appCtx.carMesh?.position?.y) ?
        appCtx.carMesh.position.y :
        1.2,
    z: Number(appCtx.car?.z || 0),
    angle: Number(appCtx.car?.angle || 0)
  };
}

function applyInterpolatedVehicleRenderState(alpha = 1) {
  if (!appCtx.carMesh || appCtx.onMoon) return false;
  if (appCtx.droneMode || appCtx.boatMode?.active || appCtx.Walk?.state?.mode === 'walk') return false;
  const prevPose = appCtx.car?._prevSimPose || null;
  const currPose = appCtx.car?._currSimPose || null;
  if (!currPose) return false;
  const safeAlpha = clampPhysValue(Number(alpha) || 0, 0, 1);
  const pose =
    prevPose ?
      {
        x: prevPose.x + (currPose.x - prevPose.x) * safeAlpha,
        y: prevPose.y + (currPose.y - prevPose.y) * safeAlpha,
        z: prevPose.z + (currPose.z - prevPose.z) * safeAlpha,
        angle: lerpPhysAngle(prevPose.angle, currPose.angle, safeAlpha)
      } :
      currPose;
  appCtx.car._renderPose = pose;
  appCtx.carMesh.position.set(pose.x, pose.y, pose.z);
  appCtx.carMesh.rotation.y = pose.angle;
  return true;
}

function runModeUpdate(dt, interval = 1 / 30) {
  if (typeof appCtx.updateMode !== 'function') return;
  _modeUpdateTimer += Math.max(0, Number(dt) || 0);
  if (_modeUpdateTimer < interval) return;
  const elapsed = _modeUpdateTimer;
  _modeUpdateTimer = 0;
  appCtx.updateMode(elapsed);
}

function runPoliceUpdate(dt, interval = 1 / 20) {
  if (typeof appCtx.updatePolice !== 'function') return;
  _policeUpdateTimer += Math.max(0, Number(dt) || 0);
  if (_policeUpdateTimer < interval) return;
  const elapsed = _policeUpdateTimer;
  _policeUpdateTimer = 0;
  appCtx.updatePolice(elapsed);
}

function runFlowerChallengeUpdate(dt, interval = 1 / 20) {
  if (typeof appCtx.updateFlowerChallenge !== 'function') return;
  _flowerChallengeTimer += Math.max(0, Number(dt) || 0);
  if (_flowerChallengeTimer < interval) return;
  const elapsed = _flowerChallengeTimer;
  _flowerChallengeTimer = 0;
  appCtx.updateFlowerChallenge(elapsed);
}

function getInteriorInteractionInterval() {
  if (appCtx.activeInterior) return 1 / 15;
  if (appCtx.Walk?.state?.mode === 'walk') return 0.08;
  if (appCtx.droneMode) return 0.2;
  if (appCtx.boatMode?.active) return 0.25;
  return 0.3;
}

function runInteriorInteractionUpdate(dt, force = false) {
  if (typeof appCtx.updateInteriorInteraction !== 'function') return;
  if (force) {
    _interiorUpdateTimer = 0;
    appCtx.updateInteriorInteraction();
    return;
  }
  _interiorUpdateTimer += Math.max(0, Number(dt) || 0);
  const interval = getInteriorInteractionInterval();
  if (_interiorUpdateTimer < interval) return;
  _interiorUpdateTimer = 0;
  appCtx.updateInteriorInteraction();
}

function runTrackUpdate(dt, interval = 0.14) {
  if (typeof appCtx.updateTrack !== 'function' || !appCtx.isRecording) return;
  _trackUpdateTimer += Math.max(0, Number(dt) || 0);
  if (_trackUpdateTimer < interval) return;
  _trackUpdateTimer = 0;
  appCtx.updateTrack();
}

function runWalkPoliceProximityCheck(dt, interval = 0.1) {
  if (!Array.isArray(appCtx.police) || appCtx.police.length === 0) return;
  const walker = appCtx.Walk?.state?.walker;
  if (!walker) return;
  _walkPoliceCheckTimer += Math.max(0, Number(dt) || 0);
  if (_walkPoliceCheckTimer < interval) return;
  _walkPoliceCheckTimer = 0;

  for (let i = 0; i < appCtx.police.length; i++) {
    const p = appCtx.police[i];
    const dx = walker.x - p.x;
    const dz = walker.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 15 && !p.caught) {
      p.caught = true;
      appCtx.policeHits++;
      const policeEl = document.getElementById('police');
      if (policeEl) {
        policeEl.textContent = '💔 ' + appCtx.policeHits + '/3';
        policeEl.classList.add('warn');
      }
      if (appCtx.policeHits >= 3) {
        appCtx.paused = true;
        document.getElementById('caughtScreen')?.classList.add('show');
      }
      break;
    }
  }
}

function maybeUpdateTerrainAround(dt, x, z, mode = 'drive') {
  if (appCtx.onMoon || appCtx.worldLoading || typeof appCtx.updateTerrainAround !== 'function') return;
  const safeDt = Math.max(0, Number(dt) || 0);
  _terrainUpdateTimer += safeDt;

  const state = _terrainUpdateState[mode] || _terrainUpdateState.drive;
  const lastX = Number(state.x);
  const lastZ = Number(state.z);
  const moved = Number.isFinite(lastX) && Number.isFinite(lastZ) ? Math.hypot(x - lastX, z - lastZ) : Infinity;

  let speed = 0;
  if (mode === 'drone') speed = Math.abs(Number(appCtx.drone?.speed || 0));
  else speed = Math.abs(Number(appCtx.car?.speed || 0));

  const interval =
    mode === 'drone' ?
      speed > 24 ? 0.16 : speed > 10 ? 0.12 : 0.1 :
      speed > 26 ? 0.14 : speed > 14 ? 0.1 : 0.08;
  const moveThreshold =
    mode === 'drone' ?
      speed > 24 ? 16 : speed > 10 ? 10 : 6 :
      speed > 26 ? 12 : speed > 14 ? 8 : 4;
  const catchupInterval = interval * 2.5;

  if (_terrainUpdateTimer < interval) return;
  if (moved < moveThreshold && _terrainUpdateTimer < catchupInterval) return;

  _terrainUpdateTimer = 0;
  state.x = x;
  state.z = z;
  queuePendingTerrainAround(x, z, mode);
}

// Throttled nearest-road helper (single place to control road querying)
function getNearestRoadThrottled(x, z, forceCheck = false, currentY = NaN) {
  // If roads aren't available, return a safe null shape
  if (!appCtx.roads || appCtx.roads.length === 0 || typeof appCtx.findNearestRoad !== 'function') {
    return { road: null, dist: Infinity, pt: { x, z } };
  }

  _rdtPhysFrame++;
  _rdtRoadSkipInterval = typeof appCtx.rdtComplexity === 'number' ?
  appCtx.rdtComplexity >= 6 ? 3 : appCtx.rdtComplexity >= 4 ? 2 : 1 :
  1;

  let nr;
  const shouldCheck = forceCheck ||
  _rdtRoadSkipInterval <= 1 ||
  _rdtPhysFrame % _rdtRoadSkipInterval === 0 ||
  !_cachedNearRoad ||
  (Number.isFinite(currentY) && Number.isFinite(_cachedNearRoad?.y) && Math.abs(_cachedNearRoad.y - currentY) > 6);

  if (shouldCheck) {
    const preferredRoad = appCtx.car?.road || appCtx.car?._lastStableRoad || null;
    nr = appCtx.findNearestRoad(x, z, {
      y: Number.isFinite(currentY) ? currentY : NaN,
      maxVerticalDelta: 18,
      preferredRoad
    });
    // Normalize cache shape so later code can treat it consistently
    _cachedNearRoad = {
      road: nr.road || null,
      dist: typeof nr.dist === 'number' ? nr.dist : Infinity,
      pt: nr.pt ? { x: nr.pt.x, z: nr.pt.z } : { x, z },
      y: Number.isFinite(nr?.y) ? nr.y : NaN,
      verticalDelta: Number.isFinite(nr?.verticalDelta) ? nr.verticalDelta : Infinity,
      distanceAlong: Number.isFinite(nr?.distanceAlong) ? nr.distanceAlong : NaN,
      distanceToEndpoint: Number.isFinite(nr?.distanceToEndpoint) ? nr.distanceToEndpoint : Infinity,
      distanceToTransitionZone: Number.isFinite(nr?.distanceToTransitionZone) ? nr.distanceToTransitionZone : Infinity
    };
  } else {
    nr = _cachedNearRoad;
  }

  // Guarantee pt exists
  if (!nr.pt) nr.pt = { x, z };
  return nr;
}

function buildingVerticalRangeOverlap(building, actorBaseY, actorHeight, tolerance = 0.45) {
  if (!Number.isFinite(actorBaseY)) return true;
  const actorTopY = actorBaseY + (Number.isFinite(actorHeight) ? Math.max(0.5, actorHeight) : 1.8);
  const minY = Number.isFinite(building?.minY) ? building.minY : Number.isFinite(building?.baseY) ? building.baseY : NaN;
  const maxY = Number.isFinite(building?.maxY) ? building.maxY : Number.isFinite(minY) && Number.isFinite(building?.height) ? minY + building.height : NaN;
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return true;
  return !(actorTopY < minY - tolerance || actorBaseY > maxY + tolerance);
}

function checkBuildingCollision(x, z, carRadius = 2, options = {}) {
  // Early exit if no buildings loaded
  if (appCtx.buildings.length === 0) return { collision: false };
  const actorBaseY = Number.isFinite(options?.actorBaseY) ? Number(options.actorBaseY) : NaN;
  const actorHeight = Number.isFinite(options?.actorHeight) ? Number(options.actorHeight) : 1.9;

  const candidateBuildings = typeof appCtx.getNearbyBuildings === 'function' ?
  appCtx.getNearbyBuildings(x, z, carRadius + 8) : appCtx.buildings;

  if (!candidateBuildings || candidateBuildings.length === 0) return { collision: false };

  for (let i = 0; i < candidateBuildings.length; i++) {
    const building = candidateBuildings[i];
    if (!building || building.collisionDisabled) continue;
    if (!buildingVerticalRangeOverlap(building, actorBaseY, actorHeight)) continue;

    // Use pre-computed bounding box for fast rejection
    if (x < building.minX - carRadius || x > building.maxX + carRadius ||
    z < building.minZ - carRadius || z > building.maxZ + carRadius) {
      continue; // Car is far from this building
    }

    const hasPolygon = Array.isArray(building.pts) && building.pts.length >= 3;
    const isInside = hasPolygon ?
    appCtx.pointInPolygon(x, z, building.pts) :
    x >= building.minX && x <= building.maxX && z >= building.minZ && z <= building.maxZ;

    // Find nearest edge and distance
    let nearestEdgeDist = Infinity;
    let nearestEdgeInfo = null;

    if (hasPolygon) {
      const ptsLen = building.pts.length;
      for (let j = 0; j < ptsLen; j++) {
        const p1 = building.pts[j];
        const p2 = building.pts[(j + 1) % ptsLen];

        // Distance from point to line segment
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len2 = dx * dx + dz * dz;

        if (len2 === 0) continue;

        let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));

        const nearestX = p1.x + t * dx;
        const nearestZ = p1.z + t * dz;
        const distSq = (x - nearestX) * (x - nearestX) + (z - nearestZ) * (z - nearestZ);

        // Use squared distance for comparison (avoid sqrt until needed)
        if (distSq < nearestEdgeDist * nearestEdgeDist) {
          const dist = Math.sqrt(distSq);
          nearestEdgeDist = dist;

          // Calculate perpendicular direction from edge
          let perpX = -dz;
          let perpZ = dx;
          const perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ);

          if (perpLen > 0) {
            perpX /= perpLen;
            perpZ /= perpLen;

            const toCarX = x - nearestX;
            const toCarZ = z - nearestZ;
            const dotProduct = toCarX * perpX + toCarZ * perpZ;

            if (dotProduct < 0) {
              perpX = -perpX;
              perpZ = -perpZ;
            }

            nearestEdgeInfo = {
              nearestX,
              nearestZ,
              pushX: perpX,
              pushZ: perpZ,
              dist
            };
          }
        }
      }
    } else {
      const nearestX = Math.max(building.minX, Math.min(x, building.maxX));
      const nearestZ = Math.max(building.minZ, Math.min(z, building.maxZ));
      if (isInside) {
        const distLeft = Math.max(0, x - building.minX);
        const distRight = Math.max(0, building.maxX - x);
        const distBottom = Math.max(0, z - building.minZ);
        const distTop = Math.max(0, building.maxZ - z);
        const minDist = Math.min(distLeft, distRight, distBottom, distTop);
        nearestEdgeDist = minDist;
        if (minDist === distLeft) {
          nearestEdgeInfo = { nearestX: building.minX, nearestZ: z, pushX: -1, pushZ: 0, dist: minDist };
        } else if (minDist === distRight) {
          nearestEdgeInfo = { nearestX: building.maxX, nearestZ: z, pushX: 1, pushZ: 0, dist: minDist };
        } else if (minDist === distBottom) {
          nearestEdgeInfo = { nearestX: x, nearestZ: building.minZ, pushX: 0, pushZ: -1, dist: minDist };
        } else {
          nearestEdgeInfo = { nearestX: x, nearestZ: building.maxZ, pushX: 0, pushZ: 1, dist: minDist };
        }
      } else {
        const diffX = x - nearestX;
        const diffZ = z - nearestZ;
        const dist = Math.hypot(diffX, diffZ);
        nearestEdgeDist = dist;
        const inv = dist > 1e-6 ? 1 / dist : 0;
        nearestEdgeInfo = {
          nearestX,
          nearestZ,
          pushX: diffX * inv,
          pushZ: diffZ * inv,
          dist
        };
      }
    }

    if (isInside || nearestEdgeDist < carRadius && nearestEdgeInfo) {
      return {
        collision: true,
        building,
        actorBaseY,
        inside: isInside,
        nearestPoint: nearestEdgeInfo ? { x: nearestEdgeInfo.nearestX, z: nearestEdgeInfo.nearestZ } : null,
        pushX: nearestEdgeInfo ? nearestEdgeInfo.pushX : 0,
        pushZ: nearestEdgeInfo ? nearestEdgeInfo.pushZ : 0,
        penetration: carRadius - nearestEdgeDist
      };
    }
  }
  return { collision: false };
}

function updateDrone(dt) {
  const moveSpeed = appCtx.drone.speed * dt;
  const turnSpeed = 2.0 * dt;

  // Keep drone controls consistent with walking mode:
  // WASD moves, arrow keys steer/look.
  if (appCtx.keys.ArrowUp) appCtx.drone.pitch += turnSpeed;
  if (appCtx.keys.ArrowDown) appCtx.drone.pitch -= turnSpeed;
  if (appCtx.keys.ArrowLeft) appCtx.drone.yaw += turnSpeed;
  if (appCtx.keys.ArrowRight) appCtx.drone.yaw -= turnSpeed;

  appCtx.drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.drone.pitch));
  appCtx.drone.roll = 0;

  const forward = appCtx.keys.KeyW ? 1 : 0;
  const backward = appCtx.keys.KeyS ? 1 : 0;
  const left = appCtx.keys.KeyA ? 1 : 0;
  const right = appCtx.keys.KeyD ? 1 : 0;
  const up = appCtx.keys.Space ? 1 : 0;
  const down = appCtx.keys.ControlLeft || appCtx.keys.ControlRight || appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight ? 1 : 0;

  const yaw = appCtx.drone.yaw;

  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);

  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  appCtx.drone.x += (fwdX * (forward - backward) + rightX * (right - left)) * moveSpeed;
  appCtx.drone.y += (up - down) * moveSpeed;
  appCtx.drone.z += (fwdZ * (forward - backward) + rightZ * (right - left)) * moveSpeed;

  let groundY = 0;
  if (appCtx.onMoon && appCtx.moonSurface) {
    const raycaster = _getPhysRaycaster();
    _physRayStart.set(appCtx.drone.x, 2000, appCtx.drone.z);
    raycaster.set(_physRayStart, _physRayDir);
    const hits = raycaster.intersectObject(appCtx.moonSurface, false);
    if (hits.length > 0) groundY = hits[0].point.y;
  } else if (appCtx.terrainEnabled) {
    groundY = appCtx.elevationWorldYAtWorldXZ(appCtx.drone.x, appCtx.drone.z);
  }

  const minAltitude = groundY + 5;
  const maxAltitudeFromGround = appCtx.onMoon ? groundY + 2000 : groundY + 400;
  const sunAltitude = appCtx.onMoon ? groundY + 3000 : groundY + 800 - 20;
  const maxAltitude = Math.min(maxAltitudeFromGround, sunAltitude);

  appCtx.drone.y = Math.max(minAltitude, Math.min(maxAltitude, appCtx.drone.y));

  const WORLD_LIMIT = appCtx.onMoon ? 4800 : 5000;
  appCtx.drone.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, appCtx.drone.x));
  appCtx.drone.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, appCtx.drone.z));
}

function update(dt) {
  if (appCtx.paused || !appCtx.gameStarted) {
    if (!appCtx.boatMode?.active) runInteriorInteractionUpdate(dt, true);
    return;
  }
  runFlowerChallengeUpdate(dt);

  if (appCtx.boatMode?.active) {
    if (typeof appCtx.updateBoatMode === 'function') {
      appCtx.updateBoatMode(dt);
    }
    runModeUpdate(dt, 1 / 30);
    return;
  }

  if (appCtx.droneMode) {
    updateDrone(dt);
    runModeUpdate(dt, 1 / 30);
    runInteriorInteractionUpdate(dt);
    maybeUpdateTerrainAround(dt, appCtx.drone.x, appCtx.drone.z, 'drone');
    return;
  }

  if (appCtx.Walk) {
    appCtx.Walk.update(dt);
    if (appCtx.Walk.state.mode === 'walk') {
      if (appCtx.isRecording && appCtx.customTrack.length > 0) {
        const lp = appCtx.customTrack[appCtx.customTrack.length - 1];
        const d = Math.hypot(appCtx.Walk.state.walker.x - lp.x, appCtx.Walk.state.walker.z - lp.z);
        if (d > 5) appCtx.customTrack.push({ x: appCtx.Walk.state.walker.x, z: appCtx.Walk.state.walker.z });
      } else if (appCtx.isRecording) {
        appCtx.customTrack.push({ x: appCtx.Walk.state.walker.x, z: appCtx.Walk.state.walker.z });
      }

      runWalkPoliceProximityCheck(dt);

      runModeUpdate(dt, 1 / 30);
      runInteriorInteractionUpdate(dt);
      return;
    }
  }

  runInteriorInteractionUpdate(dt);

  const left = appCtx.keys.KeyA || appCtx.keys.ArrowLeft,right = appCtx.keys.KeyD || appCtx.keys.ArrowRight;
  const gas = appCtx.keys.KeyW || appCtx.keys.ArrowUp,reverse = appCtx.keys.KeyS || appCtx.keys.ArrowDown;
  const braking = appCtx.keys.Space,offMode = appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight;
  const boostKey = appCtx.keys.ControlLeft || appCtx.keys.ControlRight;

  // Ensure new handling state exists (safe even if car object persisted)
  if (appCtx.car.yawRate === undefined) appCtx.car.yawRate = 0;
  if (appCtx.car.vFwd === undefined) appCtx.car.vFwd = 0;
  if (appCtx.car.vLat === undefined) appCtx.car.vLat = 0;
  if (appCtx.car.rearSlip === undefined) appCtx.car.rearSlip = 0;
  if (appCtx.car.steerSm === undefined) appCtx.car.steerSm = 0;
  if (appCtx.car.throttleSm === undefined) appCtx.car.throttleSm = 0;
  if (appCtx.car.isDrifting === undefined) appCtx.car.isDrifting = false;
  if (appCtx.car._driftHoldTimer === undefined) appCtx.car._driftHoldTimer = 0;
  if (appCtx.car._roadContactGraceTimer === undefined) appCtx.car._roadContactGraceTimer = 0;
  if (appCtx.car.vy === undefined) appCtx.car.vy = 0;
  if (appCtx.car._lastSurfaceY === undefined) appCtx.car._lastSurfaceY = null;
  if (appCtx.car._surfaceDeltaY === undefined) appCtx.car._surfaceDeltaY = 0;
  if (appCtx.car._surfaceTargetY === undefined) appCtx.car._surfaceTargetY = null;
  if (appCtx.car._terrainAirTimer === undefined) appCtx.car._terrainAirTimer = 0;
  const prevDrivePose = {
    x: Number(appCtx.car.x || 0),
    y:
      Number.isFinite(appCtx.car.y) ?
        appCtx.car.y :
      Number.isFinite(appCtx.carMesh?.position?.y) ?
        appCtx.carMesh.position.y :
        1.2,
    z: Number(appCtx.car.z || 0),
    angle: Number(appCtx.car.angle || 0)
  };

  if (boostKey && appCtx.car.boostReady && !appCtx.car.boost) {
    appCtx.car.boost = true;
    appCtx.car.boostTime = appCtx.CFG.boostDur;
    appCtx.car.boostReady = false;
    appCtx.car.boostDecayTime = 0;
  }
  if (appCtx.car.boost) {
    appCtx.car.boostTime -= dt;
    if (appCtx.car.boostTime <= 0) {
      appCtx.car.boost = false;
      appCtx.car.boostTime = 0;
      appCtx.car.boostDecayTime = 1.5;
    }
  }
  if (!boostKey && !appCtx.car.boost) appCtx.car.boostReady = true;

  let boostDecayFactor = 0;
  if (appCtx.car.boostDecayTime > 0) {
    appCtx.car.boostDecayTime -= dt;
    boostDecayFactor = Math.max(0, appCtx.car.boostDecayTime / 1.5);
  }

  let maxSpd, friction, accel;
  let moonNormalMaxSpd = 46;

  // We'll keep a single road query result for this frame (and optional precision check later)
  let nr = null;
  let driveRoadState = null;

  if (appCtx.onMoon) {
    appCtx.car.onRoad = false;
    appCtx.car.road = null;

    const moonMaxSpeed = 46;
    const moonBoostSpeed = 52;
    const moonBaseAccel = appCtx.CFG.accel * 1.35;
    const moonBoostAccel = appCtx.CFG.boostAccel * 1.2;

    maxSpd = appCtx.car.boost ? moonBoostSpeed : moonMaxSpeed;
    moonNormalMaxSpd = moonMaxSpeed;
    friction = appCtx.CFG.friction; // same as Earth road
    accel = appCtx.car.boost ? moonBoostAccel : moonBaseAccel;
  } else {
    const isSteering = left || right;
    const isHighSpeed = Math.abs(appCtx.car.speed) > 40;
    const wasOffRoad = !appCtx.car.onRoad;
    const previousOnRoad = !!appCtx.car.onRoad;
    const forceCheck = isHighSpeed || isSteering || wasOffRoad || !_cachedNearRoad;
    const previousRoad = appCtx.car.road || appCtx.car._lastStableRoad || null;
    const currentSurfaceY = Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : NaN;
    const nearestRoad = getNearestRoadThrottled(
      appCtx.car.x,
      appCtx.car.z,
      forceCheck,
      currentSurfaceY
    );
    driveRoadState =
      typeof appCtx.GroundHeight?.resolveDriveRoadContact === 'function' ?
        appCtx.GroundHeight.resolveDriveRoadContact(appCtx.car.x, appCtx.car.z, currentSurfaceY, {
          preferredRoad: previousRoad,
          nearestRoad
        }) :
        null;

    nr = driveRoadState?.resolved || nearestRoad;
    let resolvedOnRoad =
      typeof driveRoadState?.onRoad === 'boolean' ?
        driveRoadState.onRoad :
        isRoadSurfaceReachable(nr, {
          currentRoad: previousRoad,
          extraVerticalAllowance: 0.7
        });
    let resolvedRoad = resolvedOnRoad ? (driveRoadState?.road || nr?.road || null) : null;
    const roadHalfWidth = Number.isFinite(nr?.road?.width) ? Number(nr.road.width) * 0.5 : 0;
    const nearPreviousRoad =
      !!previousRoad &&
      (
        !!driveRoadState?.retained ||
        (
          nr?.road === previousRoad &&
          Number.isFinite(nr?.dist) &&
          nr.dist <= Math.max(5.2, roadHalfWidth + 1.9)
        )
      );
    if (!resolvedOnRoad && previousOnRoad && previousRoad && nearPreviousRoad && Math.abs(Number(appCtx.car.speed || 0)) >= 6) {
      appCtx.car._roadContactGraceTimer = Math.max(Number(appCtx.car._roadContactGraceTimer || 0), 0.32);
    }
    if (!resolvedOnRoad && previousRoad && nearPreviousRoad && Number(appCtx.car._roadContactGraceTimer || 0) > 0) {
      resolvedOnRoad = true;
      resolvedRoad = previousRoad;
      appCtx.car._roadContactGraceTimer = Math.max(0, Number(appCtx.car._roadContactGraceTimer || 0) - dt);
    } else if (resolvedOnRoad) {
      appCtx.car._roadContactGraceTimer = 0.32;
    } else {
      appCtx.car._roadContactGraceTimer = 0;
    }
    appCtx.car.onRoad = resolvedOnRoad;
    appCtx.car.road = appCtx.car.onRoad ? resolvedRoad : null;
    if (appCtx.car.onRoad) {
      appCtx.car._lastStableRoad = appCtx.car.road || previousRoad || null;
    }

    const baseMax = appCtx.car.onRoad ? appCtx.CFG.maxSpd : appCtx.CFG.offMax;
    maxSpd = appCtx.car.boost ? appCtx.CFG.boostMax : baseMax;
    friction = appCtx.car.onRoad ? appCtx.CFG.friction : appCtx.CFG.offFriction;
    accel = appCtx.car.boost ? appCtx.CFG.boostAccel : appCtx.CFG.accel;
  }

  const spd = Math.abs(appCtx.car.speed);
  const canAccelerate = !appCtx.car.isAirborne;
  const driftBrakeSpeed = appCtx.car.onRoad ? 10 : 12;
  const earthDriftBrakeIntent = !appCtx.onMoon && braking && (left || right) && spd > driftBrakeSpeed;

  if (gas && !braking && canAccelerate) {
    let throttleAccel = accel;
    const throttleDemand = Math.max(0, Math.min(1, Number(appCtx.car.throttleSm || 0)));
    if (appCtx.onMoon) {
      const lowSpeedBoost = Math.max(0, 1 - spd / 14);
      throttleAccel *= 1 + lowSpeedBoost * 0.75;
    } else {
      const launchBoost = appCtx.car.onRoad ? Math.max(0, 1 - spd / 15) : Math.max(0, 1 - spd / 10);
      throttleAccel *= 1 + launchBoost * (appCtx.car.onRoad ? 0.38 : 0.22);
    }
    const normalizedSpeed = Math.min(1, spd / Math.max(1, maxSpd));
    const accelFloor = appCtx.onMoon ? 0.16 : appCtx.car.onRoad ? 0.06 : 0.1;
    const accelCurve = appCtx.car.onRoad ? 1.95 : 1.5;
    const accelFade = accelFloor + (1 - accelFloor) * Math.pow(1 - normalizedSpeed, accelCurve);
    appCtx.car.speed += throttleAccel * throttleDemand * accelFade * dt;
  }

  if (braking && spd > 0.5 && canAccelerate) {
    if (earthDriftBrakeIntent) {
      // Handbrake-like brake response: keep momentum so brake+steer can initiate drift.
      const driftBrakeRate = appCtx.car.onRoad ? 0.72 : 1.1;
      appCtx.car.speed *= Math.exp(-driftBrakeRate * dt);
    } else {
      appCtx.car.speed *= 1 - appCtx.CFG.brakeForce * dt;
    }
    if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
  }

  if (reverse && !braking && canAccelerate) {
    if (appCtx.car.speed > 10) {
      appCtx.car.speed -= appCtx.CFG.brake * dt;
      if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
    } else {
      const reverseAccelScale = appCtx.onMoon ? 0.65 : 0.5;
      appCtx.car.speed -= accel * reverseAccelScale * dt;
    }
  }

  // Natural friction when coasting
  if (!gas && !reverse && !braking) {
    appCtx.car.speed *= 1 - friction * dt * 0.01;
    if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
  }

  appCtx.car.speed = Math.max(-maxSpd * 0.3, Math.min(maxSpd, appCtx.car.speed));

  if (boostDecayFactor > 0 && !appCtx.car.boost) {
    const normalMaxSpd = appCtx.onMoon ? moonNormalMaxSpd : appCtx.car.onRoad ? appCtx.CFG.maxSpd : appCtx.CFG.offMax;
    if (Math.abs(appCtx.car.speed) > normalMaxSpd) {
      const targetSpeed = normalMaxSpd + (Math.abs(appCtx.car.speed) - normalMaxSpd) * boostDecayFactor;
      const sign = appCtx.car.speed >= 0 ? 1 : -1;
      appCtx.car.speed = sign * Math.max(normalMaxSpd, targetSpeed);
    }
  }

  // =========================================================================
  // Slowroads-like handling core (yaw inertia + slip)
  // =========================================================================

  const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
  const throttleInput = gas && !reverse ? 1 : 0;

  const steerSmooth = 1 - Math.exp(-dt * 14);
  const throttleSmooth = 1 - Math.exp(-dt * 9.6);
  appCtx.car.steerSm += (steerInput - appCtx.car.steerSm) * steerSmooth;
  appCtx.car.throttleSm += (throttleInput - appCtx.car.throttleSm) * throttleSmooth;

  const spdAbs = Math.abs(appCtx.car.speed);

  const maxSteerLow = 0.66;
  const maxSteerHigh = 0.12;
  const steerFadeMin = 5;
  const steerFadeMax = 62;

  let steerAlpha = 0;
  if (spdAbs > steerFadeMin) {
    steerAlpha = Math.min(1, (spdAbs - steerFadeMin) / (steerFadeMax - steerFadeMin));
  }
  const maxSteer = maxSteerLow + (maxSteerHigh - maxSteerLow) * steerAlpha;

  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const steerMag = Math.abs(appCtx.car.steerSm);
  const speedNorm = clamp01((spdAbs - 8) / 70);
  const highSpeedTurnBlend = clamp01((spdAbs - 18) / 28);
  const parkingTurnBlend = clamp01(1 - spdAbs / 14);
  const reverseTurnBlend = appCtx.car.speed < -1 ? clamp01((Math.abs(appCtx.car.speed) - 1) / 12) : 0;
  const lowSpeedTurnBoost = Math.max(parkingTurnBlend, reverseTurnBlend);
  const handbrakeTurnIntent = !appCtx.onMoon && braking && steerMag >= 0.1 && spdAbs >= 16;
  const handbrakeSteerBoost = handbrakeTurnIntent ? 1 + (0.20 + 0.35 * speedNorm) : 1;
  // Reverse steering keeps the same direction (arcade style).
  const steerAngle = appCtx.car.steerSm * Math.min(
    1.08,
    maxSteer * handbrakeSteerBoost * (1 + lowSpeedTurnBoost * (appCtx.car.onRoad ? 0.12 : 0.08))
  );
  const driftStartSteer = 0.12;
  const driftHoldSteer = 0.05;
  const driftStartSpeed = appCtx.car.onRoad ? 8.5 : 11;
  const driftHoldSpeed = appCtx.car.onRoad ? 5.5 : 7.5;
  const driftStartIntent = !appCtx.onMoon && braking && steerMag >= driftStartSteer && spdAbs >= driftStartSpeed;

  if (appCtx.onMoon) {
    appCtx.car._driftHoldTimer = 0;
  } else if (driftStartIntent) {
    appCtx.car._driftHoldTimer = 0.34;
  } else {
    appCtx.car._driftHoldTimer = Math.max(0, appCtx.car._driftHoldTimer - dt);
  }

  const driftCanSustain = !appCtx.onMoon &&
  (braking || appCtx.car._driftHoldTimer > 0) &&
  steerMag >= driftHoldSteer &&
  spdAbs >= driftHoldSpeed;
  const isDrifting = driftStartIntent || !!appCtx.car.isDrifting && driftCanSustain;

  // Surface grip baseline using existing runtime config values.
  let gripBase = appCtx.car.onRoad ?
  Number(appCtx.CFG.gripRoad || 0.88) :
  Number(appCtx.CFG.gripOff || 0.70);
  if (offMode) gripBase *= 0.82;

  // Moon handling remains unchanged by drift tuning.
  if (appCtx.onMoon) gripBase = 1.0;

  let driftGrip = gripBase;
  if (isDrifting) {
    const brakeGrip = Number(appCtx.CFG.gripBrake || 0.60);
    const driftGripFloor = Number(appCtx.CFG.gripDrift || 0.36);
    const blend = appCtx.car.onRoad ? 0.72 + 0.28 * speedNorm : 0.62 + 0.30 * speedNorm;
    driftGrip = Math.max(driftGripFloor, gripBase * (1 - blend) + brakeGrip * blend);
  }
  const grip = Math.max(0.2, Math.min(1.2, driftGrip));

  let latDamp, yawDamp, yawResponse;
  if (appCtx.onMoon) {
    // Preserve moon handling behavior exactly as before.
    latDamp = (appCtx.car.onRoad ? 13.0 : 11.0) * (0.75 + grip * 0.55);
    yawDamp = (appCtx.car.onRoad ? 8.3 : 8.8) * (0.7 + grip * 0.6);
    yawResponse = (appCtx.car.onRoad ? 4.6 : 2.4) * (0.65 + grip * 0.45);
  } else {
    // Earth-only: stronger off-road lateral damping unless drift is explicitly requested.
    latDamp = (appCtx.car.onRoad ? 15.5 : 19.0) * (0.72 + grip * 0.58);
    yawDamp = (appCtx.car.onRoad ? 9.2 : 11.6) * (0.7 + grip * 0.6);
    yawResponse = (appCtx.car.onRoad ? 4.4 : 2.55) * (0.64 + grip * 0.42);
    if (appCtx.car.onRoad && !isDrifting) {
      latDamp *= 1.14;
      yawDamp *= 1.08;
      yawResponse *= 0.92;
    }
    if (lowSpeedTurnBoost > 0) {
      yawResponse += lowSpeedTurnBoost * (appCtx.car.onRoad ? 0.9 : 0.5);
      yawDamp *= 1 - lowSpeedTurnBoost * (appCtx.car.onRoad ? 0.08 : 0.05);
    }

    if (isDrifting) {
      latDamp *= 0.28;
      yawDamp *= 0.58;
      yawResponse *= 1.78;
    } else {
      const driftRecovery = Math.max(0, Number(appCtx.CFG.driftRec || 6));
      latDamp += driftRecovery * (appCtx.car.onRoad ? 0.55 : 0.85);
      yawDamp += driftRecovery * 0.32;
    }
    if (appCtx.car.onRoad && highSpeedTurnBlend > 0) {
      yawDamp *= 1 + highSpeedTurnBlend * 0.34;
      yawResponse *= 1 - highSpeedTurnBlend * 0.24;
    }
  }

  const wheelBase = 2.6;
  const v = appCtx.car.speed;
  let steerAuthority = appCtx.car.onRoad ? 1.02 : 0.94;
  if (!appCtx.onMoon && lowSpeedTurnBoost > 0) {
    steerAuthority *= 1 + lowSpeedTurnBoost * (appCtx.car.onRoad ? 0.14 : 0.08);
  }
  if (!appCtx.onMoon && (isDrifting || handbrakeTurnIntent)) {
    steerAuthority *= appCtx.car.onRoad ? 1.22 : 1.1;
  }
  if (!appCtx.onMoon && appCtx.car.onRoad && highSpeedTurnBlend > 0) {
    steerAuthority *= 1 - highSpeedTurnBlend * 0.24;
  }
  const yawRateTarget = v / Math.max(1e-3, wheelBase) * Math.tan(steerAngle * steerAuthority);

  appCtx.car.yawRate += (yawRateTarget - appCtx.car.yawRate) * (1 - Math.exp(-dt * yawResponse));
  appCtx.car.yawRate *= Math.exp(-dt * yawDamp);
  const parkingPivotIntent = !appCtx.onMoon &&
  steerMag >= 0.12 &&
  spdAbs < (appCtx.car.onRoad ? 5.5 : 8.5) &&
  (braking || reverse);
  if (parkingPivotIntent) {
    const pivotBlend = clamp01(1 - spdAbs / (appCtx.car.onRoad ? 9.5 : 14));
    appCtx.car.yawRate += appCtx.car.steerSm * (appCtx.car.onRoad ? 1.3 : 1.45) * pivotBlend * dt * 2.2;
  }

  if (canAccelerate) {
    appCtx.car.angle += appCtx.car.yawRate * dt;
  } else {
    appCtx.car.yawRate *= Math.exp(-dt * 2.0);
    appCtx.car.angle += appCtx.car.yawRate * dt;
  }

  appCtx.car.vFwd += (appCtx.car.speed - appCtx.car.vFwd) * (1 - Math.exp(-dt * 4.1));
  appCtx.car.vLat *= Math.exp(-dt * latDamp);

  // Rear-biased slip model:
  // front axle keeps more grip while handbrake drifting, rear axle breaks loose.
  const halfWheelBase = wheelBase * 0.5;
  let frontLat = appCtx.car.vLat + appCtx.car.yawRate * halfWheelBase;
  let rearLat = appCtx.car.vLat - appCtx.car.yawRate * halfWheelBase;

  let frontGripDamp = (appCtx.car.onRoad ? 22 : 26) * (0.7 + grip * 0.55);
  let rearGripDamp = (appCtx.car.onRoad ? 18 : 24) * (0.72 + grip * 0.52);
  if (!appCtx.onMoon) {
    if (isDrifting) {
      frontGripDamp *= 0.90;
      rearGripDamp *= 0.12;
      rearLat += appCtx.car.steerSm * (appCtx.car.onRoad ? 2.35 : 1.45) * (0.5 + 0.5 * speedNorm);
    } else if (appCtx.car.onRoad) {
      frontGripDamp *= 1.08;
      rearGripDamp *= 1.16;
    } else if (!appCtx.car.onRoad) {
      // Off-road should feel planted unless drift is explicitly initiated.
      frontGripDamp *= 1.18;
      rearGripDamp *= 1.28;
    }
  }

  frontLat *= Math.exp(-dt * frontGripDamp);
  rearLat *= Math.exp(-dt * rearGripDamp);
  appCtx.car.vLat = (frontLat + rearLat) * 0.5;

  let slipGain = 0.005 * steerMag * speedNorm;
  if (!appCtx.onMoon) {
    if (isDrifting) {
      const driftSlip = appCtx.car.onRoad ? 0.064 : 0.042;
      slipGain = driftSlip * steerMag * (0.45 + 0.55 * speedNorm);
    } else if (appCtx.car.onRoad) {
      slipGain = 0.00065 * steerMag * speedNorm;
    } else {
      slipGain = 0.00022 * steerMag * speedNorm;
    }
  }
  appCtx.car.vLat += appCtx.car.yawRate * spdAbs * slipGain;

  if (!appCtx.onMoon && isDrifting) {
    const rearStep = rearLat - frontLat;
    const rearSlipGain = appCtx.car.onRoad ? 1.38 : 0.88;
    const steerSlipGain = appCtx.car.onRoad ? 1.05 : 0.62;
    appCtx.car.rearSlip += rearStep * dt * rearSlipGain;
    appCtx.car.rearSlip += appCtx.car.steerSm * dt * steerSlipGain;
    const rearSlipLimit = appCtx.car.onRoad ? 1.75 : 1.15;
    appCtx.car.rearSlip = Math.max(-rearSlipLimit, Math.min(rearSlipLimit, appCtx.car.rearSlip));
    appCtx.car.rearSlip *= Math.exp(-dt * (appCtx.car.onRoad ? 3.1 : 4.0));
    appCtx.car.yawRate += appCtx.car.rearSlip * (0.86 + 0.34 * speedNorm);
    // Keep front axle planted so drift pivots from the rear instead of full-body slide.
    appCtx.car.vLat *= Math.exp(-dt * (appCtx.car.onRoad ? 4.3 : 5.2));
  } else {
    appCtx.car.rearSlip *= Math.exp(-dt * 9.5);
    if (!appCtx.onMoon && !appCtx.car.onRoad) {
      // Kill residual drift when off-road and not braking into a drift.
      appCtx.car.vLat *= Math.exp(-dt * 8.2);
    }
  }

  if (isDrifting) {
    const yawKick = appCtx.car.steerSm * (appCtx.car.onRoad ? 1.28 : 0.82) * (0.35 + 0.65 * speedNorm);
    appCtx.car.yawRate += yawKick * dt * 4.6;
  }
  appCtx.car.isDrifting = isDrifting;

  const sinA = Math.sin(appCtx.car.angle),cosA = Math.cos(appCtx.car.angle);
  const lateralVelForPosition = !appCtx.onMoon && isDrifting ?
  appCtx.car.vLat * 0.34 :
  !appCtx.onMoon && !appCtx.car.onRoad ?
  appCtx.car.vLat * 0.72 :
  appCtx.car.vLat;
  appCtx.car.vx = sinA * appCtx.car.vFwd + cosA * lateralVelForPosition;
  appCtx.car.vz = cosA * appCtx.car.vFwd - sinA * lateralVelForPosition;

  const velMag = Math.hypot(appCtx.car.vx, appCtx.car.vz);
  if (velMag > 5) {
    const velAngle = Math.atan2(appCtx.car.vx, appCtx.car.vz);
    let da = appCtx.car.angle - velAngle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    appCtx.car.driftAngle = da;
  } else {
    appCtx.car.driftAngle = 0;
  }

  let nx;
  let nz;
  if (!appCtx.onMoon && isDrifting && spdAbs > 6) {
    const frontPivotDist = wheelBase * 0.42;
    const frontX = appCtx.car.x + sinA * frontPivotDist;
    const frontZ = appCtx.car.z + cosA * frontPivotDist;
    const frontVx = sinA * appCtx.car.vFwd + cosA * (lateralVelForPosition * 0.35);
    const frontVz = cosA * appCtx.car.vFwd - sinA * (lateralVelForPosition * 0.35);
    const nextFrontX = frontX + frontVx * dt;
    const nextFrontZ = frontZ + frontVz * dt;
    nx = nextFrontX - Math.sin(appCtx.car.angle) * frontPivotDist;
    nz = nextFrontZ - Math.cos(appCtx.car.angle) * frontPivotDist;
  } else {
    nx = appCtx.car.x + appCtx.car.vx * dt;
    nz = appCtx.car.z + appCtx.car.vz * dt;
  }

  appCtx.car._roadCenterError = 0;
  appCtx.car._roadCenterAssist = 0;

  // Street boundaries removed — car can drive freely off-road.
  // Building collisions are still enforced below.

  if (!appCtx.onMoon) {
    const carFeetY = Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : NaN;
    const buildingCheck = checkBuildingCollision(nx, nz, 2.0, {
      actorBaseY: carFeetY,
      actorHeight: 1.9
    });
    const motionDelta = Math.hypot(nx - appCtx.car.x, nz - appCtx.car.z);
    const nearestRoadForCollision =
      motionDelta <= 3.5 && driveRoadState?.resolved ?
        driveRoadState.resolved :
      getNearestRoadThrottled(nx, nz, false, Number.isFinite(carFeetY) ? carFeetY + 1.2 : NaN);
    const roadDist = Number.isFinite(nearestRoadForCollision?.dist) ? nearestRoadForCollision.dist : Infinity;
    const roadHalfWidth = nearestRoadForCollision?.road?.width ? nearestRoadForCollision.road.width * 0.5 : 0;
    const onRoadCenter = roadHalfWidth > 0 &&
    roadDist <= Math.max(2.2, roadHalfWidth - 0.35);
    const onRoadCore = roadHalfWidth > 0 &&
    roadDist <= Math.max(1.6, roadHalfWidth - 0.95);
    const colliderDetail = buildingCheck?.building?.colliderDetail === 'bbox' ? 'bbox' : 'full';
    const buildingType = String(buildingCheck?.building?.buildingType || '').toLowerCase();
    const isApproxCollider = colliderDetail !== 'full';
  const partKind = String(buildingCheck?.building?.buildingPartKind || '').toLowerCase();
  const roofLikeCollider =
    buildingType === 'roof' ||
    buildingType === 'canopy' ||
    buildingType === 'carport' ||
    partKind === 'roof' ||
    partKind === 'balcony' ||
    partKind === 'canopy' ||
    buildingCheck?.building?.collisionKind === 'thin_part' ||
    buildingCheck?.building?.allowsPassageBelow === true;
    const shallowRoadsideCollision = !!buildingCheck.collision &&
    onRoadCenter &&
    !buildingCheck.inside &&
    Number.isFinite(buildingCheck.penetration) &&
    buildingCheck.penetration < 1.25;
    const likelyRoadGhostCollision =
      typeof appCtx.shouldIgnoreDriveCollision === 'function' ?
        appCtx.shouldIgnoreDriveCollision(buildingCheck, nx, nz, nearestRoadForCollision) :
        (!!buildingCheck.collision &&
          ((onRoadCenter && isApproxCollider) ||
          (onRoadCore && buildingCheck.inside) ||
          (onRoadCenter && roofLikeCollider)));

    if (buildingCheck.collision && !(shallowRoadsideCollision || likelyRoadGhostCollision)) {
      if (buildingCheck.inside) {
        if (buildingCheck.nearestPoint) {
          const pushDist = 3.0;
          nx = buildingCheck.nearestPoint.x + buildingCheck.pushX * pushDist;
          nz = buildingCheck.nearestPoint.z + buildingCheck.pushZ * pushDist;

          appCtx.car.speed = 0;
          appCtx.car.vFwd = 0;
          appCtx.car.vLat = 0;
          appCtx.car.vx = 0;
          appCtx.car.vz = 0;
        } else {
          nx = appCtx.car.x;
          nz = appCtx.car.z;
          appCtx.car.speed *= 0.1;
          appCtx.car.vFwd *= 0.1;
          appCtx.car.vLat *= 0.1;
          appCtx.car.vx *= 0.1;
          appCtx.car.vz *= 0.1;
        }
      } else {
        const pushDist = buildingCheck.penetration + 1.0;
        nx += buildingCheck.pushX * pushDist;
        nz += buildingCheck.pushZ * pushDist;

        const hitAngle = Math.atan2(appCtx.car.vz, appCtx.car.vx);
        const wallAngle = Math.atan2(buildingCheck.pushZ, buildingCheck.pushX);
        let angleDiff = Math.abs(hitAngle - wallAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        const headOnFactor = Math.abs(Math.cos(angleDiff));
        const speedReduction = 0.1 + (1 - headOnFactor) * 0.3;

        appCtx.car.speed *= speedReduction;
        appCtx.car.vFwd *= speedReduction;
        appCtx.car.vLat *= speedReduction;
        appCtx.car.vx *= speedReduction;
        appCtx.car.vz *= speedReduction;
      }
    }
  }

  if (typeof appCtx.getBuildCollisionAtWorldXZ === 'function') {
    const carFeetY = (Number.isFinite(appCtx.car.y) ? appCtx.car.y : 1.2) - 1.2;
    const blockedByBuildBlock =
      typeof appCtx.driveBuildBlockCollision === 'function' ?
        !!appCtx.driveBuildBlockCollision(nx, nz, carFeetY) :
        false;

    if (blockedByBuildBlock) {
      nx = appCtx.car.x;
      nz = appCtx.car.z;
      appCtx.car.speed *= 0.08;
      appCtx.car.vFwd *= 0.08;
      appCtx.car.vLat *= 0.08;
      appCtx.car.vx *= 0.08;
      appCtx.car.vz *= 0.08;
    }
  }

  appCtx.car.x = nx;
  appCtx.car.z = nz;

  let carY = 1.2;

  if (appCtx.onMoon && appCtx.moonSurface) {
    appCtx.moonSurface.updateMatrixWorld(true);
    const raycaster = _getPhysRaycaster();
    const sampleMoonSurfaceY = (sx, sz) => {
      _physRayStart.set(sx, 1200, sz);
      raycaster.set(_physRayStart, _physRayDir || new THREE.Vector3(0, -1, 0));
      const sampleHits = raycaster.intersectObject(appCtx.moonSurface, false);
      return sampleHits.length > 0 ? sampleHits[0].point.y + 1.2 : null;
    };

    const targetY = sampleMoonSurfaceY(appCtx.car.x, appCtx.car.z);

    if (targetY !== null) {
      const speedAbs = Math.abs(appCtx.car.speed || 0);
      const smoothedTargetY = Number.isFinite(appCtx.car._lastSurfaceY) ?
      appCtx.car._lastSurfaceY * 0.35 + targetY * 0.65 :
      targetY;
      const prevSurfaceY = Number.isFinite(appCtx.car._lastSurfaceY) ? appCtx.car._lastSurfaceY : smoothedTargetY;
      const surfaceDelta = smoothedTargetY - prevSurfaceY;
      const surfaceVel = dt > 1e-4 ? surfaceDelta / dt : 0;
      const currentY = Number.isFinite(appCtx.car.y) ? appCtx.car.y : smoothedTargetY;
      const clearanceAboveGround = currentY - smoothedTargetY;

      // Detect crest/drop transitions ahead of the car so launches work with keyboard or touch.
      const fwdStep = Math.min(12, Math.max(3, speedAbs * 0.14 + 2.5));
      const dirX = Math.sin(appCtx.car.angle || 0);
      const dirZ = Math.cos(appCtx.car.angle || 0);
      const aheadY = sampleMoonSurfaceY(appCtx.car.x + dirX * fwdStep, appCtx.car.z + dirZ * fwdStep);
      const forwardSlope = aheadY === null ? 0 : (aheadY - smoothedTargetY) / fwdStep;
      const dropAhead = aheadY === null ? 0 : smoothedTargetY - aheadY;

      const alreadyAirborne = !!appCtx.car.isAirborne;
      const crestLaunch =
      speedAbs > 11 &&
      surfaceVel > 0.9 &&
      forwardSlope < -0.08;
      const craterDropLaunch =
      speedAbs > 10 &&
      dropAhead > 0.9;
      const separationLaunch = clearanceAboveGround > 0.85 && speedAbs > 8;

      if (!alreadyAirborne && (crestLaunch || craterDropLaunch || separationLaunch)) {
        const launchFromRise = Math.max(0, surfaceVel * 0.16);
        const launchFromSpeed = Math.max(0, (speedAbs - 8) * 0.03);
        appCtx.car.vy = Math.max(appCtx.car.vy, launchFromRise + launchFromSpeed);
        appCtx.car.isAirborne = true;
        appCtx.car._terrainAirTimer = 0;
      }

      if (appCtx.car.isAirborne) {
        appCtx.car._terrainAirTimer += dt;
        appCtx.car.vy += MOON_CAR_GRAVITY * dt;
        appCtx.car.y = currentY + appCtx.car.vy * dt;

        const canLand = appCtx.car._terrainAirTimer > 0.02;
        if (canLand && appCtx.car.y <= smoothedTargetY) {
          appCtx.car.y = smoothedTargetY;
          appCtx.car.vy = 0;
          appCtx.car.isAirborne = false;
          appCtx.car._terrainAirTimer = 0;
        }
        carY = appCtx.car.y;
      } else {
        const diff = smoothedTargetY - currentY;
        if (Math.abs(diff) > 20 || Math.abs(diff) < 0.005) {
          carY = smoothedTargetY;
        } else {
          const baseLerp = 18;
          const speedBoost = Math.min(12, speedAbs * 0.09);
          const lerpRate = Math.min(1.0, dt * (baseLerp + speedBoost));
          carY = currentY + diff * lerpRate;
        }
        if (Math.abs(carY - smoothedTargetY) < 0.04) carY = smoothedTargetY;
        appCtx.car.y = carY;
        appCtx.car.vy = 0;
        appCtx.car.isAirborne = false;
        appCtx.car._terrainAirTimer = 0;
      }

      appCtx.car._lastSurfaceY = smoothedTargetY;
    } else {
      appCtx.car.isAirborne = false;
      appCtx.car._terrainAirTimer = 0;
      appCtx.car._lastSurfaceY = null;
      if (!Number.isFinite(appCtx.car.y)) appCtx.car.y = (appCtx.moonSurface.position?.y || -100) + 1.2;
      carY = appCtx.car.y;
    }
  } else if (appCtx.terrainEnabled) {
    const preferRoadSurface = !!appCtx.car.onRoad || !!appCtx.car.road || !!appCtx.car._lastStableRoad;
    const currentSurfaceY = Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : NaN;
    const surfaceY = typeof appCtx.GroundHeight !== 'undefined' && appCtx.GroundHeight && typeof appCtx.GroundHeight.driveSurfaceY === 'function' ?
    appCtx.GroundHeight.driveSurfaceY(appCtx.car.x, appCtx.car.z, preferRoadSurface, currentSurfaceY, {
      roadState: driveRoadState
    }) :
    (typeof appCtx.terrainMeshHeightAt === 'function' ?
    appCtx.terrainMeshHeightAt(appCtx.car.x, appCtx.car.z) :
    appCtx.elevationWorldYAtWorldXZ(appCtx.car.x, appCtx.car.z)) + (appCtx.car.onRoad ? 0.2 : 0);

    const targetY = surfaceY + 1.2;
    const speedAbs = Math.abs(appCtx.car.speed || 0);
    const prevSurfaceY = Number.isFinite(appCtx.car._lastSurfaceY) ? appCtx.car._lastSurfaceY : targetY;
    const rawSurfaceDelta = targetY - prevSurfaceY;
    const currentY = Number.isFinite(appCtx.car.y) ? appCtx.car.y : targetY;
    const diff = targetY - currentY;
    appCtx.car._surfaceTargetY = targetY;
    appCtx.car._surfaceDeltaY = rawSurfaceDelta;
    if (!Number.isFinite(currentY) || Math.abs(diff) > 20) {
      carY = targetY;
    } else if (speedAbs < 0.5 && Math.abs(diff) < 0.03) {
      carY = targetY;
    } else if (Math.abs(diff) < 0.008) {
      carY = targetY;
    } else {
      let followRate = appCtx.car.onRoad ? 18 : 11;
      followRate += Math.min(appCtx.car.onRoad ? 4.5 : 3, speedAbs * (appCtx.car.onRoad ? 0.05 : 0.035));
      if (Math.abs(diff) <= (appCtx.car.onRoad ? 0.16 : 0.08)) {
        followRate += appCtx.car.onRoad ? 11 : 4;
      }
      if (Math.abs(rawSurfaceDelta) > 0.08) {
        followRate += Math.min(appCtx.car.onRoad ? 5 : 3, Math.abs(rawSurfaceDelta) * (appCtx.car.onRoad ? 6 : 3.5));
      }
      if (Math.abs(diff) > 1.25) followRate += appCtx.car.onRoad ? 3.5 : 2.5;
      const followBlend = expPhysBlend(dt, followRate, appCtx.car.onRoad ? 0.12 : 0.07, appCtx.car.onRoad ? 0.92 : 0.78);
      carY = currentY + diff * followBlend;
    }
    if (appCtx.car.onRoad && Number.isFinite(targetY) && Math.abs(diff) <= 0.12) {
      carY = targetY;
    } else if (appCtx.car.onRoad && Number.isFinite(targetY) && carY < targetY - 0.03) {
      carY = targetY - 0.03;
    }
    if (Math.abs(carY - targetY) < 0.015) carY = targetY;
    appCtx.car.y = carY;
    appCtx.car.vy = 0;
    appCtx.car.isAirborne = false;
    appCtx.car._terrainAirTimer = 0;
    appCtx.car._lastSurfaceY = targetY;
  } else {
    appCtx.car._surfaceTargetY = null;
    appCtx.car._surfaceDeltaY = 0;
  }

  appCtx.carMesh.position.set(appCtx.car.x, carY, appCtx.car.z);
  appCtx.carMesh.rotation.y = appCtx.car.angle;
  appCtx.car._prevSimPose = prevDrivePose;
  appCtx.car._currSimPose = {
    x: Number(appCtx.car.x || 0),
    y: Number(carY || 0),
    z: Number(appCtx.car.z || 0),
    angle: Number(appCtx.car.angle || 0)
  };
  appCtx.car._renderPose = appCtx.car._currSimPose;

  const wheelRot = appCtx.car.speed * dt * 0.5;
  appCtx.wheelMeshes.forEach((w) => w.rotation.x += wheelRot);

  runTrackUpdate(dt);
  runPoliceUpdate(dt, 1 / 20);
  runModeUpdate(dt, 1 / 30);
  _poiUpdateTimer += dt;
  _navigationUpdateTimer += dt;
  const driveSpeedAbs = Math.abs(Number(appCtx.car?.speed) || 0);
  const perfFrameMs = Number(appCtx.perfStats?.live?.frameMs) || 0;
  const perfPressureMultiplier = perfFrameMs >= 45 ? 1.6 : perfFrameMs >= 35 ? 1.25 : 1;
  const poiInterval =
    appCtx.poiMode ?
      (driveSpeedAbs >= 12 ? 0.24 : driveSpeedAbs >= 5 ? 0.18 : 0.12) * perfPressureMultiplier :
      0.25;
  const navigationInterval =
    appCtx.showNavigation ?
      (driveSpeedAbs >= 12 ? 0.18 : driveSpeedAbs >= 5 ? 0.14 : 0.1) * perfPressureMultiplier :
      0.25;
  if (_poiUpdateTimer >= poiInterval) {
    _poiUpdateTimer = 0;
    appCtx.updateNearbyPOI();
  }
  if (_navigationUpdateTimer >= navigationInterval) {
    _navigationUpdateTimer = 0;
    appCtx.updateNavigationRoute();
  }
  maybeUpdateTerrainAround(dt, appCtx.car.x, appCtx.car.z, 'drive');
}

// Check for nearby POIs and display info

Object.assign(appCtx, {
  applyInterpolatedVehicleRenderState,
  flushPendingTerrainAround,
  getDriveRenderPose,
  _getPhysRaycaster,
  _physRayDir,
  _physRayStart,
  checkBuildingCollision,
  getNearestRoadThrottled,
  invalidateRoadCache,
  update,
  updateDrone
});

export {
  applyInterpolatedVehicleRenderState,
  flushPendingTerrainAround,
  getDriveRenderPose,
  _getPhysRaycaster,
  _physRayDir,
  _physRayStart,
  checkBuildingCollision,
  getNearestRoadThrottled,
  invalidateRoadCache,
  update,
  updateDrone };
