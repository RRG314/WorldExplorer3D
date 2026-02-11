// ============================================================================
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
    if (!roads || roads.length === 0 || typeof findNearestRoad !== 'function') {
        return { road: null, dist: Infinity, pt: { x, z } };
    }

    _rdtPhysFrame++;
    _rdtRoadSkipInterval = (typeof rdtComplexity === 'number')
        ? (rdtComplexity >= 6 ? 3 : (rdtComplexity >= 4 ? 2 : 1))
        : 1;

    let nr;
    const shouldCheck = forceCheck ||
        _rdtRoadSkipInterval <= 1 ||
        (_rdtPhysFrame % _rdtRoadSkipInterval === 0) ||
        !_cachedNearRoad;

    if (shouldCheck) {
        nr = findNearestRoad(x, z);
        // Normalize cache shape so later code can treat it consistently
        _cachedNearRoad = {
            road: nr.road || null,
            dist: (typeof nr.dist === 'number') ? nr.dist : Infinity,
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
    if (buildings.length === 0) return { collision: false };

    for (let i = 0; i < buildings.length; i++) {
        const building = buildings[i];

        // Use pre-computed bounding box for fast rejection
        if (x < building.minX - carRadius || x > building.maxX + carRadius ||
            z < building.minZ - carRadius || z > building.maxZ + carRadius) {
            continue; // Car is far from this building
        }

        // Check if car center is inside building
        const isInside = pointInPolygon(x, z, building.pts);

        // Find nearest edge and distance
        let nearestEdgeDist = Infinity;
        let nearestEdgeInfo = null;

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

        if (isInside || (nearestEdgeDist < carRadius && nearestEdgeInfo)) {
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
    const moveSpeed = drone.speed * dt;
    const turnSpeed = 2.0 * dt;

    if (keys.ArrowUp) drone.pitch += turnSpeed;
    if (keys.ArrowDown) drone.pitch -= turnSpeed;
    if (keys.ArrowLeft) drone.yaw += turnSpeed;
    if (keys.ArrowRight) drone.yaw -= turnSpeed;

    drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, drone.pitch));
    drone.roll = 0;

    const forward = keys.KeyW ? 1 : 0;
    const backward = keys.KeyS ? 1 : 0;
    const left = keys.KeyA ? 1 : 0;
    const right = keys.KeyD ? 1 : 0;
    const up = keys.Space ? 1 : 0;
    const down = (keys.ControlLeft || keys.ControlRight || keys.ShiftLeft || keys.ShiftRight) ? 1 : 0;

    const yaw = drone.yaw;

    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);

    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    drone.x += (fwdX * (forward - backward) + rightX * (right - left)) * moveSpeed;
    drone.y += (up - down) * moveSpeed;
    drone.z += (fwdZ * (forward - backward) + rightZ * (right - left)) * moveSpeed;

    let groundY = 0;
    if (onMoon && moonSurface) {
        const raycaster = _getPhysRaycaster();
        _physRayStart.set(drone.x, 2000, drone.z);
        raycaster.set(_physRayStart, _physRayDir);
        const hits = raycaster.intersectObject(moonSurface, false);
        if (hits.length > 0) groundY = hits[0].point.y;
    } else if (terrainEnabled) {
        groundY = elevationWorldYAtWorldXZ(drone.x, drone.z);
    }

    const minAltitude = groundY + 5;
    const maxAltitudeFromGround = onMoon ? groundY + 2000 : groundY + 400;
    const sunAltitude = onMoon ? groundY + 3000 : groundY + 800 - 20;
    const maxAltitude = Math.min(maxAltitudeFromGround, sunAltitude);

    drone.y = Math.max(minAltitude, Math.min(maxAltitude, drone.y));

    const WORLD_LIMIT = onMoon ? 4800 : 5000;
    drone.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, drone.x));
    drone.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, drone.z));
}

function update(dt) {
    if (paused || !gameStarted) return;

    if (droneMode) {
        updateDrone(dt);
        if (!onMoon) updateTerrainAround(drone.x, drone.z);
        return;
    }

    if (Walk) {
        Walk.update(dt);
        if (Walk.state.mode === 'walk') {
            if (isRecording && customTrack.length > 0) {
                const lp = customTrack[customTrack.length - 1];
                const d = Math.hypot(Walk.state.walker.x - lp.x, Walk.state.walker.z - lp.z);
                if (d > 5) customTrack.push({ x: Walk.state.walker.x, z: Walk.state.walker.z });
            } else if (isRecording) {
                customTrack.push({ x: Walk.state.walker.x, z: Walk.state.walker.z });
            }

            police.forEach(p => {
                const dx = Walk.state.walker.x - p.x, dz = Walk.state.walker.z - p.z, d = Math.hypot(dx, dz);
                if (d < 15 && !p.caught) {
                    p.caught = true; policeHits++;
                    document.getElementById('police').textContent = '💔 ' + policeHits + '/3';
                    document.getElementById('police').classList.add('warn');
                    if (policeHits >= 3) {
                        paused = true;
                        document.getElementById('caughtScreen').classList.add('show');
                    }
                }
            });

            // Load terrain around walker (must happen in walk mode too!)
            if (!onMoon) {
                updateTerrainAround(Walk.state.walker.x, Walk.state.walker.z);

                const now = performance.now();
                const rebuildInterval = lastRoadRebuildCheck === 0 ? 500 : 2000;
                if (roadsNeedRebuild && now - lastRoadRebuildCheck > rebuildInterval) {
                    lastRoadRebuildCheck = now;
                    rebuildRoadsWithTerrain();
                    repositionBuildingsWithTerrain();
                }
            }

            return;
        }
    }

    const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
    const gas = keys.KeyW || keys.ArrowUp, reverse = keys.KeyS || keys.ArrowDown;
    const braking = keys.Space, offMode = keys.ShiftLeft || keys.ShiftRight;
    const boostKey = keys.ControlLeft || keys.ControlRight;

    // Ensure new handling state exists (safe even if car object persisted)
    if (car.yawRate === undefined) car.yawRate = 0;
    if (car.vFwd === undefined) car.vFwd = 0;
    if (car.vLat === undefined) car.vLat = 0;
    if (car.steerSm === undefined) car.steerSm = 0;
    if (car.throttleSm === undefined) car.throttleSm = 0;

    if (boostKey && car.boostReady && !car.boost) {
        car.boost = true;
        car.boostTime = CFG.boostDur;
        car.boostReady = false;
        car.boostDecayTime = 0;
    }
    if (car.boost) {
        car.boostTime -= dt;
        if (car.boostTime <= 0) {
            car.boost = false;
            car.boostTime = 0;
            car.boostDecayTime = 1.5;
        }
    }
    if (!boostKey && !car.boost) car.boostReady = true;

    let boostDecayFactor = 0;
    if (car.boostDecayTime > 0) {
        car.boostDecayTime -= dt;
        boostDecayFactor = Math.max(0, car.boostDecayTime / 1.5);
    }

    let maxSpd, friction, accel;

    // We'll keep a single road query result for this frame (and optional precision check later)
    let nr = null;

    if (onMoon) {
        car.onRoad = false;
        car.road = null;

        // Moon driving is slower — capped at 20 mph (40 internal units).
        // Only gravity differs (handled in the airborne section below).
        const moonMaxSpeed = 40;
        const moonBoostSpeed = 40;

        maxSpd = car.boost ? moonBoostSpeed : moonMaxSpeed;
        friction = CFG.friction;          // same as Earth road
        accel = car.boost ? CFG.boostAccel : CFG.accel;
    } else {
        const isSteering = (left || right);
        const isHighSpeed = Math.abs(car.speed) > 40;
        const wasOffRoad = !car.onRoad;
        const forceCheck = isHighSpeed || isSteering || wasOffRoad || !_cachedNearRoad;

        nr = getNearestRoadThrottled(car.x, car.z, forceCheck);

        const edge = nr.road ? nr.road.width / 2 + 10 : 20;
        car.onRoad = nr.dist < edge;
        car.road = nr.road;

        const baseMax = car.onRoad ? CFG.maxSpd : CFG.offMax;
        maxSpd = car.boost ? CFG.boostMax : baseMax;
        friction = car.onRoad ? CFG.friction : CFG.offFriction;
        accel = car.boost ? CFG.boostAccel : CFG.accel;
    }

    const spd = Math.abs(car.speed);
    const canAccelerate = !car.isAirborne;

    if (gas && !braking && canAccelerate) {
        car.speed += accel * (1 - (spd / maxSpd) * 0.7) * dt;
    }

    if (braking && spd > 0.5 && canAccelerate) {
        car.speed *= (1 - CFG.brakeForce * dt);
        if (Math.abs(car.speed) < 0.5) car.speed = 0;
    }

    if (reverse && !braking && canAccelerate) {
        if (car.speed > 10) {
            car.speed -= CFG.brake * dt;
            if (Math.abs(car.speed) < 0.5) car.speed = 0;
        } else {
            car.speed -= accel * 0.5 * dt;
        }
    }

    // Natural friction when coasting
    if (!gas && !reverse && !braking) {
        car.speed *= (1 - friction * dt * 0.01);
        if (Math.abs(car.speed) < 0.5) car.speed = 0;
    }

    car.speed = Math.max(-maxSpd * 0.3, Math.min(maxSpd, car.speed));

    if (boostDecayFactor > 0 && !car.boost) {
        const normalMaxSpd = onMoon ? 40 : (car.onRoad ? CFG.maxSpd : CFG.offMax);
        if (Math.abs(car.speed) > normalMaxSpd) {
            const targetSpeed = normalMaxSpd + (Math.abs(car.speed) - normalMaxSpd) * boostDecayFactor;
            const sign = car.speed >= 0 ? 1 : -1;
            car.speed = sign * Math.max(normalMaxSpd, targetSpeed);
        }
    }

    // =========================================================================
    // Slowroads-like handling core (yaw inertia + slip)
    // =========================================================================

    const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
    const throttleInput = (gas && !reverse) ? 1 : 0;
    const brakeInput = braking ? 1 : 0;

    const steerSmooth = 1 - Math.exp(-dt * 10);
    const throttleSmooth = 1 - Math.exp(-dt * 6);
    car.steerSm += (steerInput - car.steerSm) * steerSmooth;
    car.throttleSm += (throttleInput - car.throttleSm) * throttleSmooth;

    const spdAbs = Math.abs(car.speed);

    const maxSteerLow = 0.65;
    const maxSteerHigh = 0.16;
    const steerFadeMin = 5;
    const steerFadeMax = 80;

    let steerAlpha = 0;
    if (spdAbs > steerFadeMin) {
        steerAlpha = Math.min(1, (spdAbs - steerFadeMin) / (steerFadeMax - steerFadeMin));
    }
    const maxSteer = maxSteerLow + (maxSteerHigh - maxSteerLow) * steerAlpha;

    const reverseDir = car.speed >= 0 ? 1 : -1;
    const steerAngle = car.steerSm * maxSteer * reverseDir;

    // Surface grip baseline
    let gripBase = car.onRoad ? 1.0 : 0.65;
    if (offMode) gripBase *= 0.75;

    // Moon: full grip — driving should feel the same as Earth
    if (onMoon) gripBase = 1.0;

    // Drift behavior when braking + turning
    if (brakeInput > 0 && Math.abs(car.steerSm) > 0.2 && spdAbs > 18) gripBase *= 0.65;

    const latDamp = (car.onRoad ? 10.5 : 6.5) * gripBase;
    const yawDamp = (car.onRoad ? 7.5 : 5.0) * gripBase;
    const yawResponse = (car.onRoad ? 3.5 : 2.2) * gripBase;

    const wheelBase = 2.6;
    const v = car.speed;
    const yawRateTarget = (v / Math.max(1e-3, wheelBase)) * Math.tan(steerAngle);

    car.yawRate += (yawRateTarget - car.yawRate) * (1 - Math.exp(-dt * yawResponse));
    car.yawRate *= Math.exp(-dt * yawDamp);

    if (canAccelerate) {
        car.angle += car.yawRate * dt;
    } else {
        car.yawRate *= Math.exp(-dt * 2.0);
        car.angle += car.yawRate * dt;
    }

    car.vFwd += (car.speed - car.vFwd) * (1 - Math.exp(-dt * 8));
    car.vLat *= Math.exp(-dt * latDamp);

    // Lateral slip injection from turning (more slip when less grip)
    let slipGain = 0.12 * (1.0 - gripBase);

    car.vLat += car.yawRate * spdAbs * slipGain;

    const sinA = Math.sin(car.angle), cosA = Math.cos(car.angle);
    car.vx = sinA * car.vFwd + cosA * car.vLat;
    car.vz = cosA * car.vFwd - sinA * car.vLat;

    const velMag = Math.hypot(car.vx, car.vz);
    if (velMag > 5) {
        const velAngle = Math.atan2(car.vx, car.vz);
        let da = car.angle - velAngle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        car.driftAngle = da;
    } else {
        car.driftAngle = 0;
    }

    let nx = car.x + car.vx * dt;
    let nz = car.z + car.vz * dt;

    // Street boundaries removed — car can drive freely off-road.
    // Building collisions are still enforced below.

    if (!onMoon) {
        const buildingCheck = checkBuildingCollision(nx, nz, 2.5);
        if (buildingCheck.collision) {
            if (buildingCheck.inside) {
                if (buildingCheck.nearestPoint) {
                    const pushDist = 3.0;
                    nx = buildingCheck.nearestPoint.x + buildingCheck.pushX * pushDist;
                    nz = buildingCheck.nearestPoint.z + buildingCheck.pushZ * pushDist;

                    car.speed = 0;
                    car.vFwd = 0;
                    car.vLat = 0;
                    car.vx = 0;
                    car.vz = 0;
                } else {
                    nx = car.x;
                    nz = car.z;
                    car.speed *= 0.1;
                    car.vFwd *= 0.1;
                    car.vLat *= 0.1;
                    car.vx *= 0.1;
                    car.vz *= 0.1;
                }
            } else {
                const pushDist = buildingCheck.penetration + 1.0;
                nx += buildingCheck.pushX * pushDist;
                nz += buildingCheck.pushZ * pushDist;

                const hitAngle = Math.atan2(car.vz, car.vx);
                const wallAngle = Math.atan2(buildingCheck.pushZ, buildingCheck.pushX);
                let angleDiff = Math.abs(hitAngle - wallAngle);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

                const headOnFactor = Math.abs(Math.cos(angleDiff));
                const speedReduction = 0.1 + (1 - headOnFactor) * 0.3;

                car.speed *= speedReduction;
                car.vFwd *= speedReduction;
                car.vLat *= speedReduction;
                car.vx *= speedReduction;
                car.vz *= speedReduction;
            }
        }
    }

    car.x = nx;
    car.z = nz;

    let carY = 1.2;

    if (onMoon && moonSurface) {
        const raycaster = _getPhysRaycaster();
        _physRayStart.set(car.x, 200, car.z);
        raycaster.set(_physRayStart, _physRayDir || new THREE.Vector3(0, -1, 0));

        const hits = raycaster.intersectObject(moonSurface, false);

        if (hits.length > 0) {
            const groundY = hits[0].point.y + 1.2;
            const groundNormal = hits[0].face.normal;

            const isAirborne = car.y > groundY + 0.3;
            car.isAirborne = isAirborne;

            if (isAirborne) {
                const REAL_MOON_GRAVITY = -1.62;
                car.vy += REAL_MOON_GRAVITY * dt;
                car.y += car.vy * dt;

                if (car.y <= groundY) {
                    car.y = groundY;
                    car.vy = 0;
                }
                carY = car.y;
            } else {
                const slopeAngle = Math.acos(groundNormal.y);
                const isRamp = slopeAngle > 0.15;

                const carDirX = Math.sin(car.angle);
                const carDirZ = Math.cos(car.angle);

                const movingUp = (groundNormal.x * carDirX + groundNormal.z * carDirZ) < -0.15;
                const fastEnough = Math.abs(car.speed) > 15;

                if (isRamp && movingUp && fastEnough) {
                    const launchSpeed = Math.abs(car.speed) * 0.2;
                    car.vy = launchSpeed * (1 + slopeAngle * 3);
                    car.y = groundY + 0.2;
                } else {
                    car.y = groundY;
                    car.vy = 0;
                }

                carY = car.y;
            }
        }
    } else if (terrainEnabled) {
        const groundH = typeof terrainMeshHeightAt === 'function'
            ? terrainMeshHeightAt(car.x, car.z)
            : elevationWorldYAtWorldXZ(car.x, car.z);

        const roadOffset = car.onRoad ? 0.2 : 0;
        const targetY = groundH + roadOffset + 1.2;

        if (car.y === undefined || car.y === 0) {
            carY = targetY;
        } else {
            const diff = targetY - car.y;
            if (Math.abs(diff) > 20 || Math.abs(diff) < 0.01) {
                carY = targetY;
            } else {
                const lerpRate = Math.min(1.0, dt * 15);
                carY = car.y + diff * lerpRate;
            }
        }

        car.y = carY;
        car.vy = 0;
        car.isAirborne = false;
    }

    carMesh.position.set(car.x, carY, car.z);
    carMesh.rotation.y = car.angle;

    const wheelRot = car.speed * dt * 0.5;
    wheelMeshes.forEach(w => w.rotation.x += wheelRot);

    updateTrack();
    updatePolice(dt);
    updateMode(dt);
    updateNearbyPOI();
    updateNavigationRoute();

    if (!onMoon) {
        updateTerrainAround(car.x, car.z);

        const now = performance.now();
        const rebuildInterval = lastRoadRebuildCheck === 0 ? 500 : 2000;
        if (roadsNeedRebuild && now - lastRoadRebuildCheck > rebuildInterval) {
            lastRoadRebuildCheck = now;
            rebuildRoadsWithTerrain();
            repositionBuildingsWithTerrain();
        }
    }
}

// Check for nearby POIs and display info
