// ============================================================================
// physics.js - Car physics, building collision, drone movement
// ============================================================================

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
                // Perpendicular to edge (two possible directions)
                let perpX = -dz;
                let perpZ = dx;
                const perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ);

                if (perpLen > 0) {
                    perpX /= perpLen;
                    perpZ /= perpLen;

                    // Determine which direction points away from building
                    // Check which side of the edge the car is on
                    const toCarX = x - nearestX;
                    const toCarZ = z - nearestZ;
                    const dotProduct = toCarX * perpX + toCarZ * perpZ;

                    // If dot product is negative, flip the perpendicular
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

        // If inside building OR too close to edge, return collision immediately
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
    // Drone movement controls
    const moveSpeed = drone.speed * dt;
    const turnSpeed = 2.0 * dt;

    // Rotation controls (arrow keys only - no roll)
    if (keys.ArrowUp) drone.pitch += turnSpeed;
    if (keys.ArrowDown) drone.pitch -= turnSpeed;
    if (keys.ArrowLeft) drone.yaw += turnSpeed;
    if (keys.ArrowRight) drone.yaw -= turnSpeed;

    // Clamp pitch to prevent flipping upside down (leave margin)
    drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, drone.pitch));

    // Keep roll at 0 (no rolling)
    drone.roll = 0;

    // Movement in drone's local space
    const forward = keys.KeyW ? 1 : 0;
    const backward = keys.KeyS ? 1 : 0;
    const left = keys.KeyA ? 1 : 0;
    const right = keys.KeyD ? 1 : 0;
    const up = keys.Space ? 1 : 0;
    const down = (keys.ControlLeft || keys.ControlRight || keys.ShiftLeft || keys.ShiftRight) ? 1 : 0;

    // Calculate movement direction based on drone orientation (YAW ONLY - no pitch)
    const yaw = drone.yaw;

    // Forward/backward (horizontal movement only - ignoring pitch)
    // Negated to fix: W should go forward, S should go backward
    const fwdX = -Math.sin(yaw);
    const fwdZ = -Math.cos(yaw);

    // Strafe left/right (perpendicular to forward, on horizontal plane)
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);

    // Apply movement (vertical is ONLY from Space/Shift, not from W/S)
    drone.x += (fwdX * (forward - backward) + rightX * (right - left)) * moveSpeed;
    drone.y += (up - down) * moveSpeed;  // Only Space/Shift control height
    drone.z += (fwdZ * (forward - backward) + rightZ * (right - left)) * moveSpeed;

    // Get ground elevation at current position
    let groundY = 0;
    if (onMoon && moonSurface) {
        const raycaster = _getPhysRaycaster();
        _physRayStart.set(drone.x, 2000, drone.z);
        raycaster.set(_physRayStart, _physRayDir);
        const hits = raycaster.intersectObject(moonSurface, false);
        if (hits.length > 0) {
            groundY = hits[0].point.y;
        }
    } else if (terrainEnabled) {
        groundY = elevationWorldYAtWorldXZ(drone.x, drone.z);
    }

    // Altitude limits:
    // Minimum: 5m above ground
    // On moon: much higher max (2000) since the surface is 10km x 10km
    // On Earth: 400m above ground, capped below sun
    const minAltitude = groundY + 5;
    const maxAltitudeFromGround = onMoon ? groundY + 2000 : groundY + 400;
    const sunAltitude = onMoon ? groundY + 3000 : groundY + 800 - 20;
    const maxAltitude = Math.min(maxAltitudeFromGround, sunAltitude);
    
    drone.y = Math.max(minAltitude, Math.min(maxAltitude, drone.y));

    // Keep drone within world boundaries
    // Moon surface is 10000x10000, Earth ground plane is 12000x12000
    const WORLD_LIMIT = onMoon ? 4800 : 5000;
    drone.x = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, drone.x));
    drone.z = Math.max(-WORLD_LIMIT, Math.min(WORLD_LIMIT, drone.z));
}

function update(dt) {
    if (paused || !gameStarted) return;

    // Drone mode - completely different controls
    if (droneMode) {
        updateDrone(dt);

        // Update terrain tiles around drone (skip on moon - no Earth terrain!)
        if (!onMoon) {
            updateTerrainAround(drone.x, drone.z);
        }
        return;
    }

    // Walking module handles all walking physics
    if (Walk) {
        Walk.update(dt);
        if (Walk.state.mode === 'walk') {
            // Track recording in walking mode
            if (isRecording && customTrack.length > 0) {
                const lp = customTrack[customTrack.length - 1];
                const d = Math.hypot(Walk.state.walker.x - lp.x, Walk.state.walker.z - lp.z);
                if (d > 5) customTrack.push({ x: Walk.state.walker.x, z: Walk.state.walker.z });
            } else if (isRecording) {
                customTrack.push({ x: Walk.state.walker.x, z: Walk.state.walker.z });
            }

            // Update police in walking mode
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

            return; // Skip car physics when walking
        }
    }

    // NORMAL CAR MODE - Only runs if NOT in walking mode
    const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
    const gas = keys.KeyW || keys.ArrowUp, reverse = keys.KeyS || keys.ArrowDown;
    const braking = keys.Space, offMode = keys.ShiftLeft || keys.ShiftRight;
    const boostKey = keys.ControlLeft || keys.ControlRight;

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
            // Start boost decay when boost ends
            car.boostDecayTime = 1.5; // 1.5 second decay period
        }
    }
    if (!boostKey && !car.boost) car.boostReady = true;

    // Handle boost decay (gradually reduce speed after boost ends)
    let boostDecayFactor = 0;
    if (car.boostDecayTime > 0) {
        car.boostDecayTime -= dt;
        // Linear decay from 1.0 to 0.0 over decay period
        boostDecayFactor = Math.max(0, car.boostDecayTime / 1.5);
    }

    // MOON ROVER MODE - No road restrictions, all terrain is drivable!
    let maxSpd, friction, accel;

    if (onMoon) {
        // On moon - NO ROADS exist! Skip all road detection
        car.onRoad = false;
        car.road = null;

        // Moon physics
        const moonMaxSpeed = 30;  // Normal max: 30mph on the moon
        const moonBoostSpeed = 50; // Boost max: 50mph on the moon (not full boost!)
        const moonAccel = CFG.accel * 1.2;      // 120% acceleration - powerful rover!
        const moonFriction = CFG.friction * 0.3; // Low friction - slippery moon dust

        // Allow higher speed during boost, but still limited
        maxSpd = car.boost ? moonBoostSpeed : moonMaxSpeed;
        friction = moonFriction;
        accel = car.boost ? CFG.boostAccel : moonAccel;
    } else {
        // Earth physics - detect roads normally
        const nr = findNearestRoad(car.x, car.z);
        const edge = nr.road ? nr.road.width / 2 + 10 : 20;
        car.onRoad = nr.dist < edge;
        car.road = nr.road;

        // Normal Earth physics
        const baseMax = car.onRoad ? CFG.maxSpd : CFG.offMax;
        maxSpd = car.boost ? CFG.boostMax : baseMax;
        friction = car.onRoad ? CFG.friction : CFG.offFriction;
        accel = car.boost ? CFG.boostAccel : CFG.accel;
    }

    const spd = Math.abs(car.speed);

    // NO ACCELERATION IN AIR - this isn't a rocket!
    // Only allow gas/brake/reverse when on the ground
    const canAccelerate = !car.isAirborne;

    // Acceleration
    if (gas && !braking && canAccelerate) {
        car.speed += accel * (1 - (spd / maxSpd) * 0.7) * dt;
    }

    // Braking (Space) - slows down, enables drift
    if (braking && spd > 0.5 && canAccelerate) {
        car.speed *= (1 - CFG.brakeForce * dt);
        // Stop completely when very slow
        if (Math.abs(car.speed) < 0.5) {
            car.speed = 0;
        }
    }

    // Reverse (S) - only when slow or stopped
    if (reverse && !braking && canAccelerate) {
        if (car.speed > 10) {
            // If moving forward fast, brake first
            car.speed -= CFG.brake * dt;
            // Stop completely when very slow
            if (Math.abs(car.speed) < 0.5) {
                car.speed = 0;
            }
        } else {
            // Reverse
            car.speed -= accel * 0.5 * dt;
        }
    }

    // Natural friction when coasting
    if (!gas && !reverse && !braking) {
        car.speed *= (1 - friction * dt * 0.01);
        // Stop completely when very slow
        if (Math.abs(car.speed) < 0.5) {
            car.speed = 0;
        }
    }

    // Clamp speed
    car.speed = Math.max(-maxSpd * 0.3, Math.min(maxSpd, car.speed));

    // Apply boost decay - gradually reduce speed after boost ends
    if (boostDecayFactor > 0 && !car.boost) {
        // Calculate the normal max speed (what we should decay to)
        const normalMaxSpd = onMoon ? 30 : (car.onRoad ? CFG.maxSpd : CFG.offMax);

        // If current speed is above normal max (from boost), gradually reduce it
        if (Math.abs(car.speed) > normalMaxSpd) {
            // Decay speed toward normal max speed
            // boostDecayFactor goes from 1.0 to 0.0 over 1.5 seconds
            const targetSpeed = normalMaxSpd + (Math.abs(car.speed) - normalMaxSpd) * boostDecayFactor;
            const sign = car.speed >= 0 ? 1 : -1;
            car.speed = sign * Math.max(normalMaxSpd, targetSpeed);
        }
    }

    // Steering - speed sensitive (NO STEERING IN AIR!)
    if (canAccelerate) {
        let tr = CFG.turnLow;
        if (spd > CFG.turnMin) {
            const t = Math.min(1, (spd - CFG.turnMin) / (CFG.maxSpd - CFG.turnMin));
            tr = CFG.turnHigh + (CFG.turnLow - CFG.turnHigh) * (1 - t);
        }

        // Reverse steering direction when going backwards
        const steerDir = car.speed >= 0 ? 1 : -1;
        if (left) car.angle += tr * dt * steerDir;
        if (right) car.angle -= tr * dt * steerDir;
    }

    // Grip calculation
    let grip = car.onRoad ? CFG.gripRoad : CFG.gripOff;

    // Braking while turning = drift!
    if (braking && (left || right) && spd > 20) {
        grip = CFG.gripDrift;
    }
    // Just braking hard also reduces grip
    else if (braking && spd > 40) {
        grip = CFG.gripBrake;
    }

    // Hard cornering at high speed = natural drift
    if ((left || right) && spd > 80) {
        const cornerFactor = Math.min(0.35, (spd - 80) / 200);
        grip -= cornerFactor;
    }

    grip = Math.max(0.25, grip);

    // Apply velocity based on grip
    const fx = Math.sin(car.angle) * car.speed;
    const fz = Math.cos(car.angle) * car.speed;

    // Lower grip = velocity maintains momentum (drift)
    const rc = CFG.driftRec * grip * dt;
    car.vx += (fx - car.vx) * Math.min(1, rc);
    car.vz += (fz - car.vz) * Math.min(1, rc);

    // Calculate drift angle
    const velMag = Math.hypot(car.vx, car.vz);
    if (velMag > 5) {
        const velAngle = Math.atan2(car.vx, car.vz);
        let da = car.angle - velAngle;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        car.driftAngle = da;
    } else car.driftAngle = 0;

    let nx = car.x + car.vx * dt, nz = car.z + car.vz * dt;

    // Road constraint: lateral spring force + boundary enforcement
    if (!onMoon && !offMode && roads.length > 0) {
        const chk = findNearestRoad(nx, nz);
        const hw = chk.road ? chk.road.width / 2 : 8;

        if (chk.pt) {
            const toCenterX = chk.pt.x - nx;
            const toCenterZ = chk.pt.z - nz;
            const toCenterDist = Math.hypot(toCenterX, toCenterZ);

            if (toCenterDist > 0.1) {
                const dirX = toCenterX / toCenterDist;
                const dirZ = toCenterZ / toCenterDist;

                // Gentle centering spring when within road width (keeps car on road)
                if (chk.dist < hw && chk.dist > 1) {
                    const edgeRatio = chk.dist / hw; // 0 at center, 1 at edge
                    const springForce = edgeRatio * edgeRatio * edgeRatio * 0.5 * dt;
                    nx += dirX * springForce;
                    nz += dirZ * springForce;
                }

                const softBoundary = hw + 4;
                const hardBoundary = hw + 10;

                // Soft boundary: past road edge, increasing pushback
                if (chk.dist > hw && chk.dist <= softBoundary) {
                    const overAmount = chk.dist - hw;
                    const pushStrength = 0.6 + (overAmount / (softBoundary - hw)) * 0.3;
                    nx += dirX * overAmount * pushStrength;
                    nz += dirZ * overAmount * pushStrength;
                    const slowdown = Math.pow(0.94, overAmount);
                    car.speed *= slowdown;
                    car.vx *= slowdown;
                    car.vz *= slowdown;
                }

                // Hard boundary: strong push and speed penalty
                if (chk.dist > softBoundary) {
                    const overAmount = chk.dist - softBoundary;
                    const overFactor = Math.min(1, overAmount / (hardBoundary - softBoundary));
                    const pushStrength = 0.7 + overFactor * 0.25;
                    nx += dirX * (overAmount + 1) * pushStrength;
                    nz += dirZ * (overAmount + 1) * pushStrength;
                    const penalty = 0.7 - overFactor * 0.3;
                    car.speed *= penalty;
                    car.vx *= penalty;
                    car.vz *= penalty;
                }

                // Absolute limit
                if (chk.dist > hardBoundary) {
                    const angle = Math.atan2(nz - chk.pt.z, nx - chk.pt.x);
                    nx = chk.pt.x + Math.cos(angle) * (hw + 2);
                    nz = chk.pt.z + Math.sin(angle) * (hw + 2);
                    car.speed *= 0.5;
                    car.vx *= 0.5;
                    car.vz *= 0.5;
                }
            }
        }
    }

    // Building collision detection - check BEFORE applying position (SKIP ON MOON - no buildings!)
    if (!onMoon) {
        const buildingCheck = checkBuildingCollision(nx, nz, 2.5);
        if (buildingCheck.collision) {
            if (buildingCheck.inside) {
                // Car is inside building - force push out to nearest edge
                if (buildingCheck.nearestPoint) {
                    // Push car completely outside the building
                    const pushDist = 3.0; // Push 3 meters away from edge
                    nx = buildingCheck.nearestPoint.x + buildingCheck.pushX * pushDist;
                    nz = buildingCheck.nearestPoint.z + buildingCheck.pushZ * pushDist;

                    // Kill all velocity
                    car.speed = 0;
                    car.vx = 0;
                    car.vz = 0;
                } else {
                    // Fallback: revert to previous position
                    nx = car.x;
                    nz = car.z;
                    car.speed *= 0.1;
                    car.vx *= 0.1;
                    car.vz *= 0.1;
                }
            } else {
                // Car is approaching/touching building edge
                // Push away from the building with extra margin
                const pushDist = buildingCheck.penetration + 1.0; // Push out plus 1m buffer
                nx += buildingCheck.pushX * pushDist;
                nz += buildingCheck.pushZ * pushDist;

                // Reduce speed significantly when hitting building
                const hitAngle = Math.atan2(car.vz, car.vx);
                const wallAngle = Math.atan2(buildingCheck.pushZ, buildingCheck.pushX);
                let angleDiff = Math.abs(hitAngle - wallAngle);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

                // Head-on collision = stop completely
                // Glancing blow = slide along
                const headOnFactor = Math.abs(Math.cos(angleDiff));
                const speedReduction = 0.1 + (1 - headOnFactor) * 0.3; // 0.1 to 0.4

                car.speed *= speedReduction;
                car.vx *= speedReduction;
                car.vz *= speedReduction;
            }
        }
    }

    car.x = nx; car.z = nz;

    // Find surface below car
    let carY = 1.2; // default height (car body is 1.2 above ground)

    // MOON SURFACE - raycast with JUMP PHYSICS!
    if (onMoon && moonSurface) {
        const raycaster = _getPhysRaycaster();
        _physRayStart.set(car.x, 200, car.z);
        raycaster.set(_physRayStart, _physRayDir || new THREE.Vector3(0, -1, 0));

        const hits = raycaster.intersectObject(moonSurface, false);

        if (hits.length > 0) {
            const groundY = hits[0].point.y + 1.2;
            const groundNormal = hits[0].face.normal;

            // JUMP PHYSICS - check if car is in the air or on ground
            const isAirborne = car.y > groundY + 0.3; // Car is more than 0.3 units above ground
            car.isAirborne = isAirborne; // Store in car object for acceleration logic

            if (isAirborne) {
                // CAR IS FLYING! Apply EXACT real moon gravity
                const REAL_MOON_GRAVITY = -1.62; // EXACT moon gravity: 1.62 m/s²
                car.vy += REAL_MOON_GRAVITY * dt;
                car.y += car.vy * dt;

                // Car continues forward motion while in air (parabolic trajectory)
                // Horizontal velocity not affected by gravity!

                // Check if car landed
                if (car.y <= groundY) {
                    car.y = groundY;
                    car.vy = 0;

                    // Debug log removed
                }

                carY = car.y;
            } else {
                // CAR IS ON GROUND - check for ramp launches

                // Detect upward slope (ramp for jumps!) - EASIER to trigger
                const slopeAngle = Math.acos(groundNormal.y); // Angle from vertical
                const isRamp = slopeAngle > 0.15; // More than ~8 degrees = ramp (VERY easy!)

                // Get car's movement direction
                const carDirX = Math.sin(car.angle);
                const carDirZ = Math.cos(car.angle);

                // Check if moving forward on ramp at good speed
                const movingUp = (groundNormal.x * carDirX + groundNormal.z * carDirZ) < -0.15;
                const fastEnough = Math.abs(car.speed) > 15; // Lower threshold - VERY easy to jump!

                if (isRamp && movingUp && fastEnough) {
                    // LAUNCH INTO THE AIR! 🚀
                    const launchSpeed = Math.abs(car.speed) * 0.2; // POWERFUL launch!
                    car.vy = launchSpeed * (1 + slopeAngle * 3); // Steeper ramp = MASSIVE launch
                    car.y = groundY + 0.2; // Higher initial launch

                    // Debug log removed
                } else {
                    // Normal ground contact
                    car.y = groundY;
                    car.vy = 0;
                }

                carY = car.y;
            }
        }
    }
    // EARTH SURFACE - use terrain mesh grid sampling (O(1) - no raycasting)
    else if (terrainEnabled) {
        const groundH = typeof terrainMeshHeightAt === 'function'
            ? terrainMeshHeightAt(car.x, car.z)
            : elevationWorldYAtWorldXZ(car.x, car.z);

        // Add road offset when on road (roads are 0.2 above terrain)
        carY = groundH + (car.onRoad ? 0.2 : 0) + 1.2;

        car.y = carY;
        car.vy = 0;
        car.isAirborne = false;
    }

    carMesh.position.set(car.x, carY, car.z);
    carMesh.rotation.y = car.angle;

    // Rotate wheels
    const wheelRot = car.speed * dt * 0.5;
    wheelMeshes.forEach(w => w.rotation.x += wheelRot);

    updateTrack();
    updatePolice(dt);
    updateMode(dt);
    updateNearbyPOI();
    updateNavigationRoute();

    // Update terrain tiles around the car (skip on moon)
    if (!onMoon) {
        updateTerrainAround(car.x, car.z);

        // Check if roads need rebuilding (throttled - 500ms first time, 2s after)
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
