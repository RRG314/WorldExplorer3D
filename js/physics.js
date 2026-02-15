import { ctx as appCtx } from "./shared-context.js?v=54"; // ============================================================================
// physics.js - Car physics, building collision, drone movement
// ============================================================================

// RDT-based adaptive throttling state
// At high complexity, skip findNearestRoad on some frames (reuse cached result)
let _rdtPhysFrame = 0;
let _rdtRoadSkipInterval = 1; // 1 = check every frame, 2 = every other, etc.
let _cachedNearRoad = null;

// Invalidate road cache - must be called on road reload, mode change, teleport
function invalidateRoadCache() {
  _cachedNearRoad = null;
  _rdtPhysFrame = 0;
}

// Reusable raycaster and vectors (avoid GC pressure from per-frame allocations)
let _physRaycaster = null;
const _physRayStart = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
const _physRayDir = typeof THREE !== 'undefined' ? new THREE.Vector3(0, -1, 0) : null;
const MOON_FLOAT_GRAVITY = -1.62; // m/s^2 feel target for hill/crater airtime
function _getPhysRaycaster() {
  if (!_physRaycaster && typeof THREE !== 'undefined') {
    _physRaycaster = new THREE.Raycaster();
  }
  return _physRaycaster;
}

// Throttled nearest-road helper (single place to control road querying)
function getNearestRoadThrottled(x, z, forceCheck = false) {
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
  !_cachedNearRoad;

  if (shouldCheck) {
    nr = appCtx.findNearestRoad(x, z);
    // Normalize cache shape so later code can treat it consistently
    _cachedNearRoad = {
      road: nr.road || null,
      dist: typeof nr.dist === 'number' ? nr.dist : Infinity,
      pt: nr.pt ? { x: nr.pt.x, z: nr.pt.z } : { x, z }
    };
  } else {
    nr = _cachedNearRoad;
  }

  // Guarantee pt exists
  if (!nr.pt) nr.pt = { x, z };
  return nr;
}

function checkBuildingCollision(x, z, carRadius = 2) {
  // Early exit if no buildings loaded
  if (appCtx.buildings.length === 0) return { collision: false };

  const candidateBuildings = typeof appCtx.getNearbyBuildings === 'function' ?
  appCtx.getNearbyBuildings(x, z, carRadius + 8) : appCtx.buildings;

  if (!candidateBuildings || candidateBuildings.length === 0) return { collision: false };

  for (let i = 0; i < candidateBuildings.length; i++) {
    const building = candidateBuildings[i];

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
  if (appCtx.paused || !appCtx.gameStarted) return;

  if (appCtx.droneMode) {
    updateDrone(dt);
    if (!appCtx.onMoon && !appCtx.worldLoading) appCtx.updateTerrainAround(appCtx.drone.x, appCtx.drone.z);
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

      appCtx.police.forEach((p) => {
        const dx = appCtx.Walk.state.walker.x - p.x,dz = appCtx.Walk.state.walker.z - p.z,d = Math.hypot(dx, dz);
        if (d < 15 && !p.caught) {
          p.caught = true;appCtx.policeHits++;
          document.getElementById('police').textContent = '💔 ' + appCtx.policeHits + '/3';
          document.getElementById('police').classList.add('warn');
          if (appCtx.policeHits >= 3) {
            appCtx.paused = true;
            document.getElementById('caughtScreen').classList.add('show');
          }
        }
      });

      return;
    }
  }

  const left = appCtx.keys.KeyA || appCtx.keys.ArrowLeft,right = appCtx.keys.KeyD || appCtx.keys.ArrowRight;
  const gas = appCtx.keys.KeyW || appCtx.keys.ArrowUp,reverse = appCtx.keys.KeyS || appCtx.keys.ArrowDown;
  const braking = appCtx.keys.Space,offMode = appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight;
  const boostKey = appCtx.keys.ControlLeft || appCtx.keys.ControlRight;

  // Ensure new handling state exists (safe even if car object persisted)
  if (appCtx.car.yawRate === undefined) appCtx.car.yawRate = 0;
  if (appCtx.car.vFwd === undefined) appCtx.car.vFwd = 0;
  if (appCtx.car.vLat === undefined) appCtx.car.vLat = 0;
  if (appCtx.car.steerSm === undefined) appCtx.car.steerSm = 0;
  if (appCtx.car.throttleSm === undefined) appCtx.car.throttleSm = 0;
  if (appCtx.car.vy === undefined) appCtx.car.vy = 0;
  if (appCtx.car._lastSurfaceY === undefined) appCtx.car._lastSurfaceY = null;
  if (appCtx.car._terrainAirTimer === undefined) appCtx.car._terrainAirTimer = 0;

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

  // We'll keep a single road query result for this frame (and optional precision check later)
  let nr = null;

  if (appCtx.onMoon) {
    appCtx.car.onRoad = false;
    appCtx.car.road = null;

    // Moon driving is slower — capped at 20 mph (40 internal units).
    // Only gravity differs (handled in the airborne section below).
    const moonMaxSpeed = 40;
    const moonBoostSpeed = 40;

    maxSpd = appCtx.car.boost ? moonBoostSpeed : moonMaxSpeed;
    friction = appCtx.CFG.friction; // same as Earth road
    accel = appCtx.car.boost ? appCtx.CFG.boostAccel : appCtx.CFG.accel;
  } else {
    const isSteering = left || right;
    const isHighSpeed = Math.abs(appCtx.car.speed) > 40;
    const wasOffRoad = !appCtx.car.onRoad;
    const forceCheck = isHighSpeed || isSteering || wasOffRoad || !_cachedNearRoad;

    nr = getNearestRoadThrottled(appCtx.car.x, appCtx.car.z, forceCheck);

    const edge = nr.road ? nr.road.width / 2 + 10 : 20;
    appCtx.car.onRoad = nr.dist < edge;
    appCtx.car.road = nr.road;

    const baseMax = appCtx.car.onRoad ? appCtx.CFG.maxSpd : appCtx.CFG.offMax;
    maxSpd = appCtx.car.boost ? appCtx.CFG.boostMax : baseMax;
    friction = appCtx.car.onRoad ? appCtx.CFG.friction : appCtx.CFG.offFriction;
    accel = appCtx.car.boost ? appCtx.CFG.boostAccel : appCtx.CFG.accel;
  }

  const spd = Math.abs(appCtx.car.speed);
  const canAccelerate = !appCtx.car.isAirborne;

  if (gas && !braking && canAccelerate) {
    appCtx.car.speed += accel * (1 - spd / maxSpd * 0.7) * dt;
  }

  if (braking && spd > 0.5 && canAccelerate) {
    appCtx.car.speed *= 1 - appCtx.CFG.brakeForce * dt;
    if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
  }

  if (reverse && !braking && canAccelerate) {
    if (appCtx.car.speed > 10) {
      appCtx.car.speed -= appCtx.CFG.brake * dt;
      if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
    } else {
      appCtx.car.speed -= accel * 0.5 * dt;
    }
  }

  // Natural friction when coasting
  if (!gas && !reverse && !braking) {
    appCtx.car.speed *= 1 - friction * dt * 0.01;
    if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
  }

  appCtx.car.speed = Math.max(-maxSpd * 0.3, Math.min(maxSpd, appCtx.car.speed));

  if (boostDecayFactor > 0 && !appCtx.car.boost) {
    const normalMaxSpd = appCtx.onMoon ? 40 : appCtx.car.onRoad ? appCtx.CFG.maxSpd : appCtx.CFG.offMax;
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
  const brakeInput = braking ? 1 : 0;

  const steerSmooth = 1 - Math.exp(-dt * 10);
  const throttleSmooth = 1 - Math.exp(-dt * 6);
  appCtx.car.steerSm += (steerInput - appCtx.car.steerSm) * steerSmooth;
  appCtx.car.throttleSm += (throttleInput - appCtx.car.throttleSm) * throttleSmooth;

  const spdAbs = Math.abs(appCtx.car.speed);

  const maxSteerLow = 0.65;
  const maxSteerHigh = 0.16;
  const steerFadeMin = 5;
  const steerFadeMax = 80;

  let steerAlpha = 0;
  if (spdAbs > steerFadeMin) {
    steerAlpha = Math.min(1, (spdAbs - steerFadeMin) / (steerFadeMax - steerFadeMin));
  }
  const maxSteer = maxSteerLow + (maxSteerHigh - maxSteerLow) * steerAlpha;

  // FIXED: Remove reverseDir inversion for more intuitive reverse steering
  // In reverse, steering works the same direction (arcade-style, more realistic feel)
  const steerAngle = appCtx.car.steerSm * maxSteer;

  // Surface grip baseline
  let gripBase = appCtx.car.onRoad ? 1.0 : 0.65;
  if (offMode) gripBase *= 0.75;

  // Moon: full grip — driving should feel the same as Earth
  if (appCtx.onMoon) gripBase = 1.0;

  // Drift mechanic removed — spacebar is pure brake only
  let isDrifting = false;

  const latDamp = (appCtx.car.onRoad ? 10.5 : 6.5) * gripBase;
  const yawDamp = (appCtx.car.onRoad ? 7.5 : 5.0) * gripBase;
  const yawResponse = (appCtx.car.onRoad ? 3.5 : 2.2) * gripBase;

  const wheelBase = 2.6;
  const v = appCtx.car.speed;
  const yawRateTarget = v / Math.max(1e-3, wheelBase) * Math.tan(steerAngle);

  appCtx.car.yawRate += (yawRateTarget - appCtx.car.yawRate) * (1 - Math.exp(-dt * yawResponse));
  appCtx.car.yawRate *= Math.exp(-dt * yawDamp);

  if (canAccelerate) {
    appCtx.car.angle += appCtx.car.yawRate * dt;
  } else {
    appCtx.car.yawRate *= Math.exp(-dt * 2.0);
    appCtx.car.angle += appCtx.car.yawRate * dt;
  }

  appCtx.car.vFwd += (appCtx.car.speed - appCtx.car.vFwd) * (1 - Math.exp(-dt * 8));
  appCtx.car.vLat *= Math.exp(-dt * latDamp);

  // Lateral slip injection from turning (more slip when less grip)
  let slipGain = 0.12 * (1.0 - gripBase);

  appCtx.car.vLat += appCtx.car.yawRate * spdAbs * slipGain;

  const sinA = Math.sin(appCtx.car.angle),cosA = Math.cos(appCtx.car.angle);
  appCtx.car.vx = sinA * appCtx.car.vFwd + cosA * appCtx.car.vLat;
  appCtx.car.vz = cosA * appCtx.car.vFwd - sinA * appCtx.car.vLat;

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

  let nx = appCtx.car.x + appCtx.car.vx * dt;
  let nz = appCtx.car.z + appCtx.car.vz * dt;

  // Street boundaries removed — car can drive freely off-road.
  // Building collisions are still enforced below.

  if (!appCtx.onMoon) {
    const buildingCheck = checkBuildingCollision(nx, nz, 2.5);
    if (buildingCheck.collision) {
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
      const prevSurfaceY = Number.isFinite(appCtx.car._lastSurfaceY) ? appCtx.car._lastSurfaceY : targetY;
      const surfaceDelta = targetY - prevSurfaceY;
      const surfaceVel = dt > 1e-4 ? surfaceDelta / dt : 0;
      const currentY = Number.isFinite(appCtx.car.y) ? appCtx.car.y : targetY;
      const clearanceAboveGround = currentY - targetY;

      // Detect crest/drop transitions ahead of the car so launches work with keyboard or touch.
      const fwdStep = Math.min(12, Math.max(3, speedAbs * 0.14 + 2.5));
      const dirX = Math.sin(appCtx.car.angle || 0);
      const dirZ = Math.cos(appCtx.car.angle || 0);
      const aheadY = sampleMoonSurfaceY(appCtx.car.x + dirX * fwdStep, appCtx.car.z + dirZ * fwdStep);
      const forwardSlope = aheadY === null ? 0 : (aheadY - targetY) / fwdStep;
      const dropAhead = aheadY === null ? 0 : targetY - aheadY;

      const alreadyAirborne = !!appCtx.car.isAirborne;
      const crestLaunch =
      speedAbs > 1.6 &&
      surfaceVel > 0.06 &&
      forwardSlope < -0.012;
      const craterDropLaunch =
      speedAbs > 1.5 &&
      dropAhead > 0.05;
      const separationLaunch = clearanceAboveGround > 0.14;

      if (!alreadyAirborne && (crestLaunch || craterDropLaunch || separationLaunch)) {
        const launchFromRise = Math.max(0, surfaceVel * 0.5);
        const launchFromSpeed = Math.max(0, (speedAbs - 1.5) * 0.09);
        appCtx.car.vy = Math.max(appCtx.car.vy, launchFromRise + launchFromSpeed);
        appCtx.car.isAirborne = true;
        appCtx.car._terrainAirTimer = 0;
      }

      if (appCtx.car.isAirborne) {
        appCtx.car._terrainAirTimer += dt;
        appCtx.car.vy += MOON_FLOAT_GRAVITY * dt;
        appCtx.car.y = currentY + appCtx.car.vy * dt;

        const canLand = appCtx.car._terrainAirTimer > 0.05;
        if (canLand && appCtx.car.y <= targetY) {
          appCtx.car.y = targetY;
          appCtx.car.vy = 0;
          appCtx.car.isAirborne = false;
          appCtx.car._terrainAirTimer = 0;
        }
        carY = appCtx.car.y;
      } else {
        const diff = targetY - currentY;
        if (Math.abs(diff) > 20 || Math.abs(diff) < 0.01) {
          carY = targetY;
        } else {
          const baseLerp = 10;
          const speedBoost = Math.min(10, speedAbs * 0.11);
          const lerpRate = Math.min(1.0, dt * (baseLerp + speedBoost));
          carY = currentY + diff * lerpRate;
        }
        appCtx.car.y = carY;
        appCtx.car.vy = 0;
        appCtx.car.isAirborne = false;
        appCtx.car._terrainAirTimer = 0;
      }

      appCtx.car._lastSurfaceY = targetY;
    } else {
      appCtx.car.isAirborne = false;
      appCtx.car._terrainAirTimer = 0;
      appCtx.car._lastSurfaceY = null;
      if (!Number.isFinite(appCtx.car.y)) appCtx.car.y = (appCtx.moonSurface.position?.y || -100) + 1.2;
      carY = appCtx.car.y;
    }
  } else if (appCtx.terrainEnabled) {
    const surfaceY = typeof appCtx.GroundHeight !== 'undefined' && appCtx.GroundHeight && typeof appCtx.GroundHeight.driveSurfaceY === 'function' ?
    appCtx.GroundHeight.driveSurfaceY(appCtx.car.x, appCtx.car.z, !!appCtx.car.onRoad) :
    (typeof appCtx.terrainMeshHeightAt === 'function' ?
    appCtx.terrainMeshHeightAt(appCtx.car.x, appCtx.car.z) :
    appCtx.elevationWorldYAtWorldXZ(appCtx.car.x, appCtx.car.z)) + (appCtx.car.onRoad ? 0.2 : 0);

    const targetY = surfaceY + 1.2;
    const speedAbs = Math.abs(appCtx.car.speed || 0);
    if (appCtx.car.y === undefined || appCtx.car.y === 0) {
      carY = targetY;
    } else {
      const diff = targetY - appCtx.car.y;
      if (Math.abs(diff) > 20 || Math.abs(diff) < 0.01) {
        carY = targetY;
      } else {
        const baseLerp = appCtx.car.onRoad ? 16 : 10;
        const speedBoost = Math.min(8, speedAbs * 0.08);
        const lerpRate = Math.min(1.0, dt * (baseLerp + speedBoost));
        carY = appCtx.car.y + diff * lerpRate;
      }
    }
    appCtx.car.y = carY;
    appCtx.car.vy = 0;
    appCtx.car.isAirborne = false;
    appCtx.car._terrainAirTimer = 0;
    appCtx.car._lastSurfaceY = null;
  }

  appCtx.carMesh.position.set(appCtx.car.x, carY, appCtx.car.z);
  appCtx.carMesh.rotation.y = appCtx.car.angle;

  const wheelRot = appCtx.car.speed * dt * 0.5;
  appCtx.wheelMeshes.forEach((w) => w.rotation.x += wheelRot);

  appCtx.updateTrack();
  appCtx.updatePolice(dt);
  appCtx.updateMode(dt);
  appCtx.updateNearbyPOI();
  appCtx.updateNavigationRoute();

  if (!appCtx.onMoon && !appCtx.worldLoading) {
    appCtx.updateTerrainAround(appCtx.car.x, appCtx.car.z);

    const now = performance.now();
    const rebuildInterval = appCtx.lastRoadRebuildCheck === 0 ? 500 : 2000;
    if (appCtx.roadsNeedRebuild && now - appCtx.lastRoadRebuildCheck > rebuildInterval) {
      appCtx.lastRoadRebuildCheck = now;
      appCtx.rebuildRoadsWithTerrain();
      appCtx.repositionBuildingsWithTerrain();
    }
  }
}

// Check for nearby POIs and display info

Object.assign(appCtx, {
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
  _getPhysRaycaster,
  _physRayDir,
  _physRayStart,
  checkBuildingCollision,
  getNearestRoadThrottled,
  invalidateRoadCache,
  update,
  updateDrone };
