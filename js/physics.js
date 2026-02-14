import { ctx } from "./shared-context.js?v=52"; // ============================================================================
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
function _getPhysRaycaster() {
  if (!_physRaycaster && typeof THREE !== 'undefined') {
    _physRaycaster = new THREE.Raycaster();
  }
  return _physRaycaster;
}

// Throttled nearest-road helper (single place to control road querying)
function getNearestRoadThrottled(x, z, forceCheck = false) {
  // If roads aren't available, return a safe null shape
  if (!ctx.roads || ctx.roads.length === 0 || typeof ctx.findNearestRoad !== 'function') {
    return { road: null, dist: Infinity, pt: { x, z } };
  }

  _rdtPhysFrame++;
  _rdtRoadSkipInterval = typeof ctx.rdtComplexity === 'number' ?
  ctx.rdtComplexity >= 6 ? 3 : ctx.rdtComplexity >= 4 ? 2 : 1 :
  1;

  let nr;
  const shouldCheck = forceCheck ||
  _rdtRoadSkipInterval <= 1 ||
  _rdtPhysFrame % _rdtRoadSkipInterval === 0 ||
  !_cachedNearRoad;

  if (shouldCheck) {
    nr = ctx.findNearestRoad(x, z);
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
  if (ctx.buildings.length === 0) return { collision: false };

  const candidateBuildings = typeof ctx.getNearbyBuildings === 'function' ?
  ctx.getNearbyBuildings(x, z, carRadius + 8) : ctx.buildings;

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
    ctx.pointInPolygon(x, z, building.pts) :
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
  const moveSpeed = ctx.drone.speed * dt;
  const turnSpeed = 2.0 * dt;

  if (ctx.keys.ArrowUp) ctx.drone.pitch += turnSpeed;
  if (ctx.keys.ArrowDown) ctx.drone.pitch -= turnSpeed;
  if (ctx.keys.ArrowLeft) ctx.drone.yaw += turnSpeed;
  if (ctx.keys.ArrowRight) ctx.drone.yaw -= turnSpeed;

  ctx.drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, ctx.drone.pitch));
  ctx.drone.roll = 0;

  const forward = ctx.keys.KeyW ? 1 : 0;
  const backward = ctx.keys.KeyS ? 1 : 0;
  const left = ctx.keys.KeyA ? 1 : 0;
  const right = ctx.keys.KeyD ? 1 : 0;
  const up = ctx.keys.Space ? 1 : 0;
  const down = ctx.keys.ControlLeft || ctx.keys.ControlRight || ctx.keys.ShiftLeft || ctx.keys.ShiftRight ? 1 : 0;

  const yaw = ctx.drone.yaw;

  const fwdX = -Math.sin(yaw);
  const fwdZ = -Math.cos(yaw);

  const rightX = Math.cos(yaw);
  const rightZ = -Math.sin(yaw);

  ctx.drone.x += (fwdX * (forward - backward) + rightX * (right - left)) * moveSpeed;
  ctx.drone.y += (up - down) * moveSpeed;
  ctx.drone.z += (fwdZ * (forward - backward) + rightZ * (right - left)) * moveSpeed;

  let groundY = 0;
  if (ctx.onMoon && ctx.moonSurface) {
    const raycaster = _getPhysRaycaster();
    _physRayStart.set(ctx.drone.x, 2000, ctx.drone.z);
    raycaster.set(_physRayStart, _physRayDir);
    const hits = raycaster.intersectObject(ctx.moonSurface, false);
    if (hits.length > 0) groundY = hits[0].point.y;
  } else if (ctx.terrainEnabled) {
    groundY = ctx.elevationWorldYAtWorldXZ(ctx.drone.x, ctx.drone.z);
  }

  const minAltitude = groundY + 5;
  const maxAltitudeFromGround = ctx.onMoon ? groundY + 2000 : groundY + 400;
  const sunAltitude = ctx.onMoon ? groundY + 3000 : groundY + 800 - 20;
  const maxAltitude = Math.min(maxAltitudeFromGround, sunAltitude);

  ctx.drone.y = Math.max(minAltitude, Math.min(maxAltitude, ctx.drone.y));

  const WORLD_LIMIT = ctx.onMoon ? 4800 : 5000;
  ctx.drone.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, ctx.drone.x));
  ctx.drone.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, ctx.drone.z));
}

function update(dt) {
  if (ctx.paused || !ctx.gameStarted) return;

  if (ctx.droneMode) {
    updateDrone(dt);
    if (!ctx.onMoon && !ctx.worldLoading) ctx.updateTerrainAround(ctx.drone.x, ctx.drone.z);
    return;
  }

  if (ctx.Walk) {
    ctx.Walk.update(dt);
    if (ctx.Walk.state.mode === 'walk') {
      if (ctx.isRecording && ctx.customTrack.length > 0) {
        const lp = ctx.customTrack[ctx.customTrack.length - 1];
        const d = Math.hypot(ctx.Walk.state.walker.x - lp.x, ctx.Walk.state.walker.z - lp.z);
        if (d > 5) ctx.customTrack.push({ x: ctx.Walk.state.walker.x, z: ctx.Walk.state.walker.z });
      } else if (ctx.isRecording) {
        ctx.customTrack.push({ x: ctx.Walk.state.walker.x, z: ctx.Walk.state.walker.z });
      }

      ctx.police.forEach((p) => {
        const dx = ctx.Walk.state.walker.x - p.x,dz = ctx.Walk.state.walker.z - p.z,d = Math.hypot(dx, dz);
        if (d < 15 && !p.caught) {
          p.caught = true;ctx.policeHits++;
          document.getElementById('police').textContent = '💔 ' + ctx.policeHits + '/3';
          document.getElementById('police').classList.add('warn');
          if (ctx.policeHits >= 3) {
            ctx.paused = true;
            document.getElementById('caughtScreen').classList.add('show');
          }
        }
      });

      return;
    }
  }

  const left = ctx.keys.KeyA || ctx.keys.ArrowLeft,right = ctx.keys.KeyD || ctx.keys.ArrowRight;
  const gas = ctx.keys.KeyW || ctx.keys.ArrowUp,reverse = ctx.keys.KeyS || ctx.keys.ArrowDown;
  const braking = ctx.keys.Space,offMode = ctx.keys.ShiftLeft || ctx.keys.ShiftRight;
  const boostKey = ctx.keys.ControlLeft || ctx.keys.ControlRight;

  // Ensure new handling state exists (safe even if car object persisted)
  if (ctx.car.yawRate === undefined) ctx.car.yawRate = 0;
  if (ctx.car.vFwd === undefined) ctx.car.vFwd = 0;
  if (ctx.car.vLat === undefined) ctx.car.vLat = 0;
  if (ctx.car.steerSm === undefined) ctx.car.steerSm = 0;
  if (ctx.car.throttleSm === undefined) ctx.car.throttleSm = 0;

  if (boostKey && ctx.car.boostReady && !ctx.car.boost) {
    ctx.car.boost = true;
    ctx.car.boostTime = ctx.CFG.boostDur;
    ctx.car.boostReady = false;
    ctx.car.boostDecayTime = 0;
  }
  if (ctx.car.boost) {
    ctx.car.boostTime -= dt;
    if (ctx.car.boostTime <= 0) {
      ctx.car.boost = false;
      ctx.car.boostTime = 0;
      ctx.car.boostDecayTime = 1.5;
    }
  }
  if (!boostKey && !ctx.car.boost) ctx.car.boostReady = true;

  let boostDecayFactor = 0;
  if (ctx.car.boostDecayTime > 0) {
    ctx.car.boostDecayTime -= dt;
    boostDecayFactor = Math.max(0, ctx.car.boostDecayTime / 1.5);
  }

  let maxSpd, friction, accel;

  // We'll keep a single road query result for this frame (and optional precision check later)
  let nr = null;

  if (ctx.onMoon) {
    ctx.car.onRoad = false;
    ctx.car.road = null;

    // Moon driving is slower — capped at 20 mph (40 internal units).
    // Only gravity differs (handled in the airborne section below).
    const moonMaxSpeed = 40;
    const moonBoostSpeed = 40;

    maxSpd = ctx.car.boost ? moonBoostSpeed : moonMaxSpeed;
    friction = ctx.CFG.friction; // same as Earth road
    accel = ctx.car.boost ? ctx.CFG.boostAccel : ctx.CFG.accel;
  } else {
    const isSteering = left || right;
    const isHighSpeed = Math.abs(ctx.car.speed) > 40;
    const wasOffRoad = !ctx.car.onRoad;
    const forceCheck = isHighSpeed || isSteering || wasOffRoad || !_cachedNearRoad;

    nr = getNearestRoadThrottled(ctx.car.x, ctx.car.z, forceCheck);

    const edge = nr.road ? nr.road.width / 2 + 10 : 20;
    ctx.car.onRoad = nr.dist < edge;
    ctx.car.road = nr.road;

    const baseMax = ctx.car.onRoad ? ctx.CFG.maxSpd : ctx.CFG.offMax;
    maxSpd = ctx.car.boost ? ctx.CFG.boostMax : baseMax;
    friction = ctx.car.onRoad ? ctx.CFG.friction : ctx.CFG.offFriction;
    accel = ctx.car.boost ? ctx.CFG.boostAccel : ctx.CFG.accel;
  }

  const spd = Math.abs(ctx.car.speed);
  const canAccelerate = !ctx.car.isAirborne;

  if (gas && !braking && canAccelerate) {
    ctx.car.speed += accel * (1 - spd / maxSpd * 0.7) * dt;
  }

  if (braking && spd > 0.5 && canAccelerate) {
    ctx.car.speed *= 1 - ctx.CFG.brakeForce * dt;
    if (Math.abs(ctx.car.speed) < 0.5) ctx.car.speed = 0;
  }

  if (reverse && !braking && canAccelerate) {
    if (ctx.car.speed > 10) {
      ctx.car.speed -= ctx.CFG.brake * dt;
      if (Math.abs(ctx.car.speed) < 0.5) ctx.car.speed = 0;
    } else {
      ctx.car.speed -= accel * 0.5 * dt;
    }
  }

  // Natural friction when coasting
  if (!gas && !reverse && !braking) {
    ctx.car.speed *= 1 - friction * dt * 0.01;
    if (Math.abs(ctx.car.speed) < 0.5) ctx.car.speed = 0;
  }

  ctx.car.speed = Math.max(-maxSpd * 0.3, Math.min(maxSpd, ctx.car.speed));

  if (boostDecayFactor > 0 && !ctx.car.boost) {
    const normalMaxSpd = ctx.onMoon ? 40 : ctx.car.onRoad ? ctx.CFG.maxSpd : ctx.CFG.offMax;
    if (Math.abs(ctx.car.speed) > normalMaxSpd) {
      const targetSpeed = normalMaxSpd + (Math.abs(ctx.car.speed) - normalMaxSpd) * boostDecayFactor;
      const sign = ctx.car.speed >= 0 ? 1 : -1;
      ctx.car.speed = sign * Math.max(normalMaxSpd, targetSpeed);
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
  ctx.car.steerSm += (steerInput - ctx.car.steerSm) * steerSmooth;
  ctx.car.throttleSm += (throttleInput - ctx.car.throttleSm) * throttleSmooth;

  const spdAbs = Math.abs(ctx.car.speed);

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
  const steerAngle = ctx.car.steerSm * maxSteer;

  // Surface grip baseline
  let gripBase = ctx.car.onRoad ? 1.0 : 0.65;
  if (offMode) gripBase *= 0.75;

  // Moon: full grip — driving should feel the same as Earth
  if (ctx.onMoon) gripBase = 1.0;

  // Drift mechanic removed — spacebar is pure brake only
  let isDrifting = false;

  const latDamp = (ctx.car.onRoad ? 10.5 : 6.5) * gripBase;
  const yawDamp = (ctx.car.onRoad ? 7.5 : 5.0) * gripBase;
  const yawResponse = (ctx.car.onRoad ? 3.5 : 2.2) * gripBase;

  const wheelBase = 2.6;
  const v = ctx.car.speed;
  const yawRateTarget = v / Math.max(1e-3, wheelBase) * Math.tan(steerAngle);

  ctx.car.yawRate += (yawRateTarget - ctx.car.yawRate) * (1 - Math.exp(-dt * yawResponse));
  ctx.car.yawRate *= Math.exp(-dt * yawDamp);

  if (canAccelerate) {
    ctx.car.angle += ctx.car.yawRate * dt;
  } else {
    ctx.car.yawRate *= Math.exp(-dt * 2.0);
    ctx.car.angle += ctx.car.yawRate * dt;
  }

  ctx.car.vFwd += (ctx.car.speed - ctx.car.vFwd) * (1 - Math.exp(-dt * 8));
  ctx.car.vLat *= Math.exp(-dt * latDamp);

  // Lateral slip injection from turning (more slip when less grip)
  let slipGain = 0.12 * (1.0 - gripBase);

  ctx.car.vLat += ctx.car.yawRate * spdAbs * slipGain;

  const sinA = Math.sin(ctx.car.angle),cosA = Math.cos(ctx.car.angle);
  ctx.car.vx = sinA * ctx.car.vFwd + cosA * ctx.car.vLat;
  ctx.car.vz = cosA * ctx.car.vFwd - sinA * ctx.car.vLat;

  const velMag = Math.hypot(ctx.car.vx, ctx.car.vz);
  if (velMag > 5) {
    const velAngle = Math.atan2(ctx.car.vx, ctx.car.vz);
    let da = ctx.car.angle - velAngle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    ctx.car.driftAngle = da;
  } else {
    ctx.car.driftAngle = 0;
  }

  let nx = ctx.car.x + ctx.car.vx * dt;
  let nz = ctx.car.z + ctx.car.vz * dt;

  // Street boundaries removed — car can drive freely off-road.
  // Building collisions are still enforced below.

  if (!ctx.onMoon) {
    const buildingCheck = checkBuildingCollision(nx, nz, 2.5);
    if (buildingCheck.collision) {
      if (buildingCheck.inside) {
        if (buildingCheck.nearestPoint) {
          const pushDist = 3.0;
          nx = buildingCheck.nearestPoint.x + buildingCheck.pushX * pushDist;
          nz = buildingCheck.nearestPoint.z + buildingCheck.pushZ * pushDist;

          ctx.car.speed = 0;
          ctx.car.vFwd = 0;
          ctx.car.vLat = 0;
          ctx.car.vx = 0;
          ctx.car.vz = 0;
        } else {
          nx = ctx.car.x;
          nz = ctx.car.z;
          ctx.car.speed *= 0.1;
          ctx.car.vFwd *= 0.1;
          ctx.car.vLat *= 0.1;
          ctx.car.vx *= 0.1;
          ctx.car.vz *= 0.1;
        }
      } else {
        const pushDist = buildingCheck.penetration + 1.0;
        nx += buildingCheck.pushX * pushDist;
        nz += buildingCheck.pushZ * pushDist;

        const hitAngle = Math.atan2(ctx.car.vz, ctx.car.vx);
        const wallAngle = Math.atan2(buildingCheck.pushZ, buildingCheck.pushX);
        let angleDiff = Math.abs(hitAngle - wallAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        const headOnFactor = Math.abs(Math.cos(angleDiff));
        const speedReduction = 0.1 + (1 - headOnFactor) * 0.3;

        ctx.car.speed *= speedReduction;
        ctx.car.vFwd *= speedReduction;
        ctx.car.vLat *= speedReduction;
        ctx.car.vx *= speedReduction;
        ctx.car.vz *= speedReduction;
      }
    }
  }

  ctx.car.x = nx;
  ctx.car.z = nz;

  let carY = 1.2;

  if (ctx.onMoon && ctx.moonSurface) {
    const raycaster = _getPhysRaycaster();
    _physRayStart.set(ctx.car.x, 200, ctx.car.z);
    raycaster.set(_physRayStart, _physRayDir || new THREE.Vector3(0, -1, 0));

    const hits = raycaster.intersectObject(ctx.moonSurface, false);

    if (hits.length > 0) {
      const groundY = hits[0].point.y + 1.2;
      const groundNormal = hits[0].face.normal;

      const isAirborne = ctx.car.y > groundY + 0.3;
      ctx.car.isAirborne = isAirborne;

      if (isAirborne) {
        // Use realistic gravity based on location
        const GRAVITY = ctx.onMoon ? -1.62 : -9.8; // Moon: 1.62 m/s², Earth: 9.8 m/s²
        ctx.car.vy += GRAVITY * dt;
        ctx.car.y += ctx.car.vy * dt;

        if (ctx.car.y <= groundY) {
          ctx.car.y = groundY;
          ctx.car.vy = 0;
        }
        carY = ctx.car.y;
      } else {
        const slopeAngle = Math.acos(groundNormal.y);
        // Moon: much easier to launch off edges/hills (low gravity)
        const isRamp = slopeAngle > 0.05;

        const carDirX = Math.sin(ctx.car.angle);
        const carDirZ = Math.cos(ctx.car.angle);

        const movingUp = groundNormal.x * carDirX + groundNormal.z * carDirZ < -0.05;
        const fastEnough = Math.abs(ctx.car.speed) > 5;

        if (isRamp && movingUp && fastEnough) {
          // Stronger launch on moon due to low gravity
          const launchSpeed = Math.abs(ctx.car.speed) * 0.35;
          ctx.car.vy = launchSpeed * (1 + slopeAngle * 4);
          ctx.car.y = groundY + 0.2;
        } else {
          ctx.car.y = groundY;
          ctx.car.vy = 0;
        }

        carY = ctx.car.y;
      }
    }
  } else if (ctx.terrainEnabled) {
    const surfaceY = typeof ctx.GroundHeight !== 'undefined' && ctx.GroundHeight && typeof ctx.GroundHeight.driveSurfaceY === 'function' ?
    ctx.GroundHeight.driveSurfaceY(ctx.car.x, ctx.car.z, !!ctx.car.onRoad) :
    (typeof ctx.terrainMeshHeightAt === 'function' ?
    ctx.terrainMeshHeightAt(ctx.car.x, ctx.car.z) :
    ctx.elevationWorldYAtWorldXZ(ctx.car.x, ctx.car.z)) + (ctx.car.onRoad ? 0.2 : 0);

    const targetY = surfaceY + 1.2;

    if (ctx.car.y === undefined || ctx.car.y === 0) {
      carY = targetY;
    } else {
      const diff = targetY - ctx.car.y;
      if (Math.abs(diff) > 20 || Math.abs(diff) < 0.01) {
        carY = targetY;
      } else {
        const lerpRate = Math.min(1.0, dt * 15);
        carY = ctx.car.y + diff * lerpRate;
      }
    }

    ctx.car.y = carY;
    ctx.car.vy = 0;
    ctx.car.isAirborne = false;
  }

  ctx.carMesh.position.set(ctx.car.x, carY, ctx.car.z);
  ctx.carMesh.rotation.y = ctx.car.angle;

  const wheelRot = ctx.car.speed * dt * 0.5;
  ctx.wheelMeshes.forEach((w) => w.rotation.x += wheelRot);

  ctx.updateTrack();
  ctx.updatePolice(dt);
  ctx.updateMode(dt);
  ctx.updateNearbyPOI();
  ctx.updateNavigationRoute();

  if (!ctx.onMoon && !ctx.worldLoading) {
    ctx.updateTerrainAround(ctx.car.x, ctx.car.z);

    const now = performance.now();
    const rebuildInterval = ctx.lastRoadRebuildCheck === 0 ? 500 : 2000;
    if (ctx.roadsNeedRebuild && now - ctx.lastRoadRebuildCheck > rebuildInterval) {
      ctx.lastRoadRebuildCheck = now;
      ctx.rebuildRoadsWithTerrain();
      ctx.repositionBuildingsWithTerrain();
    }
  }
}

// Check for nearby POIs and display info

Object.assign(ctx, {
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