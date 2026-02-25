import { ctx as appCtx } from "./shared-context.js?v=54"; // ============================================================================
// walking.js - First-person walking/exploration module
// ============================================================================

// ============================================================================
// Walking Module (inline version)
// ============================================================================
function createWalkingModule(opts) {
  const {
    THREE,
    scene,
    camera,
    keys,
    car,
    carMesh = null,
    getBuildingsArray = null, // Function that returns current buildings array
    getNearbyBuildings = null, // Optional spatial query for nearby buildings
    isPointInPolygon = null
  } = opts;

  if (!THREE || !scene || !camera || !keys || !car) {
    throw new Error("WalkingModule missing required inputs");
  }

  const state = {
    enabled: true,
    mode: "drive",
    view: "third",
    walker: { x: 0, z: 0, y: 0, angle: 0, yaw: 0, pitch: 0, speedMph: 0, vy: 0, onGround: true, wallJumpTimer: 0, onBuilding: false },
    characterMesh: null
  };

  const CFG = {
    walkSpeed: 6.0,
    runSpeed: 12.0,
    turnSpeed: 2.6,
    strafeFactor: 0.85,
    eyeHeight: 1.7,
    thirdPersonDist: 4.5,
    thirdPersonHeight: 2.2,
    thirdPersonLookAhead: 6.0,
    collisionPushBack: 2.0,
    wallJumpVelocity: 6.5, // Upward velocity when wall jumping
    wallJumpOutward: 2.0, // Outward push when wall jumping
    wallDetectRadius: 1.5, // Distance to detect walls for wall jumping
    wallJumpCooldown: 0.3, // Seconds between wall jumps
    blockStepHeight: 0.65 // Max step-up without jumping
  };

  // Walk mode terrain stream/rebuild throttle so low-power devices keep up.
  let lastWalkTerrainUpdateAt = 0;
  let lastWalkTerrainRebuildAt = 0;
  let lastWalkTerrainX = NaN;
  let lastWalkTerrainZ = NaN;

  function createCharacterMesh() {
    const grp = new THREE.Group();
    // Brighter, more visible colors
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2288ff, // Brighter blue
      roughness: 0.7,
      emissive: 0x1144aa, // Slight glow
      emissiveIntensity: 0.2
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffdd99, // Brighter skin tone
      roughness: 0.6
    });
    const legMat = new THREE.MeshStandardMaterial({
      color: 0x444444, // Lighter grey
      roughness: 0.8
    });

    // Make character 50% bigger for better visibility
    const scale = 1.5;

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scale, 0.62 * scale, 0.28 * scale), bodyMat);
    body.position.y = 1.0 * scale;
    body.castShadow = true;
    body.receiveShadow = true;
    grp.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 16, 16), headMat);
    head.position.y = 1.55 * scale;
    head.castShadow = true;
    head.receiveShadow = true;
    grp.add(head);

    // Create legs with pivot at the top (hip)
    const leg1Group = new THREE.Group();
    const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.62 * scale, 0.16 * scale), legMat);
    leg1.position.y = -0.31 * scale; // Half the leg height, so pivot is at top
    leg1.castShadow = true;
    leg1.receiveShadow = true;
    leg1Group.add(leg1);
    leg1Group.position.set(-0.11 * scale, 0.71 * scale, 0); // Hip position
    grp.add(leg1Group);

    const leg2Group = new THREE.Group();
    const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.16 * scale, 0.62 * scale, 0.16 * scale), legMat);
    leg2.position.y = -0.31 * scale; // Half the leg height, so pivot is at top
    leg2.castShadow = true;
    leg2.receiveShadow = true;
    leg2Group.add(leg2);
    leg2Group.position.set(0.11 * scale, 0.71 * scale, 0); // Hip position
    grp.add(leg2Group);

    const armMat = bodyMat;

    // Create arms with pivot at the top (shoulder)
    const arm1Group = new THREE.Group();
    const arm1 = new THREE.Mesh(new THREE.BoxGeometry(0.10 * scale, 0.52 * scale, 0.10 * scale), armMat);
    arm1.position.y = -0.26 * scale; // Half the arm height, so pivot is at top
    arm1.castShadow = true;
    arm1.receiveShadow = true;
    arm1Group.add(arm1);
    arm1Group.position.set(-0.26 * scale, 1.21 * scale, 0); // Shoulder position
    grp.add(arm1Group);

    const arm2Group = new THREE.Group();
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.10 * scale, 0.52 * scale, 0.10 * scale), armMat);
    arm2.position.y = -0.26 * scale; // Half the arm height, so pivot is at top
    arm2.castShadow = true;
    arm2.receiveShadow = true;
    arm2Group.add(arm2);
    arm2Group.position.set(0.26 * scale, 1.21 * scale, 0); // Shoulder position
    grp.add(arm2Group);

    // Enable shadows on the entire group
    grp.castShadow = true;
    grp.receiveShadow = true;

    // Store references to limbs for animation
    grp.userData.limbs = {
      leg1: leg1Group,
      leg2: leg2Group,
      arm1: arm1Group,
      arm2: arm2Group,
      body: body,
      scale: scale
    };
    grp.userData.walkTime = 0; // Animation timer

    grp.visible = false;
    scene.add(grp);
    // Debug log removed
    return grp;
  }

  function animateCharacterWalk(characterMesh, isMoving, deltaTime) {
    if (!characterMesh || !characterMesh.userData.limbs) return;

    const limbs = characterMesh.userData.limbs;
    const scale = limbs.scale;

    if (isMoving) {
      // Increment walk time for animation
      characterMesh.userData.walkTime += deltaTime * 8; // Speed of animation
      const t = characterMesh.userData.walkTime;

      // Walking animation using sine waves
      const legSwing = Math.sin(t) * 0.5; // Legs swing forward/back
      const armSwing = Math.sin(t) * 0.4; // Arms swing opposite to legs

      // Animate legs (swing forward/back)
      limbs.leg1.rotation.x = legSwing;
      limbs.leg2.rotation.x = -legSwing; // Opposite leg

      // Animate arms (swing opposite to legs)
      limbs.arm1.rotation.x = -armSwing;
      limbs.arm2.rotation.x = armSwing; // Opposite arm

      // Slight body bob while walking
      const bodyBob = Math.abs(Math.sin(t * 2)) * 0.05 * scale;
      limbs.body.position.y = 1.0 * scale + bodyBob;
    } else {
      // Reset to neutral pose when not moving
      const resetSpeed = deltaTime * 5;
      limbs.leg1.rotation.x *= 1 - resetSpeed;
      limbs.leg2.rotation.x *= 1 - resetSpeed;
      limbs.arm1.rotation.x *= 1 - resetSpeed;
      limbs.arm2.rotation.x *= 1 - resetSpeed;

      // Reset body position
      limbs.body.position.y = 1.0 * scale;
    }
  }

  function syncWalkerFromCar() {
    state.walker.x = car.x;
    state.walker.z = car.z;
    state.walker.y = car.y; // Sync Y so walker starts at car's height (critical for moon)
    state.walker.vy = 0;
    state.walker.angle = car.angle;
    state.walker.yaw = car.angle;
    state.walker.pitch = 0;
    state.walker.speedMph = 0;
  }

  function syncCarFromWalker() {
    car.x = state.walker.x;
    car.z = state.walker.z;
    car.angle = state.walker.angle;
    car.y = (state.walker.y || 1.7) - CFG.eyeHeight + 1.2;
    car.vy = 0;
    car.speed = 0;
    if (typeof appCtx.invalidateRoadCache === 'function') appCtx.invalidateRoadCache();
  }

  function finiteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function getSafeDriveY(x, z, fallbackY) {
    let y = fallbackY;
    if (appCtx.onMoon && appCtx.moonSurface) {
      const raycaster = appCtx._getPhysRaycaster();
      appCtx._physRayStart.set(x, 400, z);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = raycaster.intersectObject(appCtx.moonSurface, false);
      if (hits.length > 0 && Number.isFinite(hits[0].point.y)) y = hits[0].point.y + 1.2;
    } else if (typeof appCtx.GroundHeight !== 'undefined' && appCtx.GroundHeight && typeof appCtx.GroundHeight.carCenterY === 'function') {
      y = appCtx.GroundHeight.carCenterY(x, z, true, 1.2);
    } else if (typeof appCtx.terrainMeshHeightAt === 'function') {
      const terrainY = appCtx.terrainMeshHeightAt(x, z);
      if (Number.isFinite(terrainY)) y = terrainY + 1.2;
    } else if (typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
      const elevY = appCtx.elevationWorldYAtWorldXZ(x, z);
      if (Number.isFinite(elevY)) y = elevY + 1.2;
    }
    return finiteOr(y, 1.2);
  }

  function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ?
    performance.now() :
    Date.now();
  }

  function syncWalkTerrain(force = false) {
    if (appCtx.onMoon) return;
    if (typeof appCtx.terrainEnabled !== 'undefined' && !appCtx.terrainEnabled) return;
    if (typeof appCtx.worldLoading !== 'undefined' && appCtx.worldLoading) return;
    if (typeof appCtx.updateTerrainAround !== 'function') return;

    const x = state.walker.x;
    const z = state.walker.z;
    const t = nowMs();

    const moved = Number.isFinite(lastWalkTerrainX) && Number.isFinite(lastWalkTerrainZ) ?
    Math.hypot(x - lastWalkTerrainX, z - lastWalkTerrainZ) :
    Infinity;

    // Update terrain tiles at most ~6 Hz unless we moved far enough.
    if (!force && moved < 3.5 && t - lastWalkTerrainUpdateAt < 160) return;

    appCtx.updateTerrainAround(x, z);
    lastWalkTerrainUpdateAt = t;
    lastWalkTerrainX = x;
    lastWalkTerrainZ = z;

    // Mirror driving-mode terrain rebuild cadence so buildings/roads stay matched.
    if (typeof appCtx.roadsNeedRebuild !== 'undefined' && appCtx.roadsNeedRebuild) {
      const firstRebuild = lastWalkTerrainRebuildAt === 0;
      const rebuildInterval = firstRebuild ? 500 : 2000;
      if (t - lastWalkTerrainRebuildAt >= rebuildInterval) {
        if (typeof appCtx.rebuildRoadsWithTerrain === 'function') appCtx.rebuildRoadsWithTerrain();
        if (typeof appCtx.repositionBuildingsWithTerrain === 'function') appCtx.repositionBuildingsWithTerrain();
        lastWalkTerrainRebuildAt = t;
      }
    }
  }

  function setModeWalk() {
    // Debug log removed
    // Debug log removed
    state.mode = "walk";
    // Debug log removed

    // Debug log removed
    syncWalkerFromCar();
    syncWalkTerrain(true);
    if (typeof appCtx.repositionBuildingsWithTerrain === 'function') appCtx.repositionBuildingsWithTerrain();
    // Debug log removed

    // Debug log removed
    if (carMesh) {
      carMesh.visible = false;
      // Debug log removed
    } else {


      // Debug log removed
    } // Debug log removed
    if (!state.characterMesh) {
      // Debug log removed
      state.characterMesh = createCharacterMesh();
    }
    // Debug log removed

    if (state.characterMesh) {
      // Get terrain height at walker position (check moon first!)
      let terrainY;
      if (appCtx.onMoon && appCtx.moonSurface) {
        // Ensure world matrix is current for raycasting
        appCtx.moonSurface.updateMatrixWorld(true);
        // Raycast against moon surface from well above
        const raycaster = appCtx._getPhysRaycaster();
        appCtx._physRayStart.set(state.walker.x, 1000, state.walker.z);
        raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
        const hits = raycaster.intersectObject(appCtx.moonSurface, false);
        terrainY = hits.length > 0 ? hits[0].point.y : car.y - 1.7;
      } else {
        terrainY = typeof appCtx.terrainMeshHeightAt === 'function' ?
        appCtx.terrainMeshHeightAt(state.walker.x, state.walker.z) :
        appCtx.elevationWorldYAtWorldXZ(state.walker.x, state.walker.z);
      }

      // Set walker Y position to ground + eye height
      state.walker.y = terrainY + 1.7;
      state.walker.vy = 0;

      // Character should be visible in third person (default view)
      state.characterMesh.visible = state.view !== "first";
      state.characterMesh.position.set(state.walker.x, terrainY, state.walker.z);
      state.characterMesh.rotation.y = state.walker.angle;
      // Debug log removed
      // Debug log removed
      // Debug log removed
      // Debug log removed
      // Debug log removed
      // Debug log removed
      syncWalkTerrain(true);
      if (typeof appCtx.repositionBuildingsWithTerrain === 'function') appCtx.repositionBuildingsWithTerrain();
    } else {
      console.error('ERROR: Character mesh is still null after creation!');
    }

    // Debug log removed
    // Debug log removed
  }

  function setModeDrive() {
    const wasWalk = state.mode === "walk";
    state.mode = "drive";
    // If coming from walk, walker position is authoritative.
    // If already in drive, keep walker synced from current car to avoid stale snaps.
    if (wasWalk) syncCarFromWalker();else
    syncWalkerFromCar();
    car.x = finiteOr(car.x, finiteOr(state.walker.x, 0));
    car.z = finiteOr(car.z, finiteOr(state.walker.z, 0));
    car.angle = finiteOr(car.angle, finiteOr(state.walker.angle, 0));
    const fallbackY = finiteOr(car.y, 1.2);
    const carY = getSafeDriveY(car.x, car.z, fallbackY);
    car.y = carY;
    if (carMesh) {
      carMesh.visible = true;
      if (scene && carMesh.parent !== scene) scene.add(carMesh);
      carMesh.position.set(car.x, carY, car.z);
      carMesh.rotation.y = car.angle;
      carMesh.updateMatrixWorld(true);
    }
    // Always return to visible third-person driving camera when switching to drive.
    if (typeof appCtx.camMode !== 'undefined') appCtx.camMode = 0;
    if (state.characterMesh) state.characterMesh.visible = false;
    // Deactivate mouse look when leaving walking mode
    window.walkMouseLookActive = false;
  }

  function toggleWalk() {
    if (!state.enabled) return;
    // Debug log removed
    if (state.mode === "walk") setModeDrive();else
    setModeWalk();
    // Debug log removed
  }

  function toggleView() {
    // Cycle through: third -> first -> overhead
    if (state.view === "third") {
      state.view = "first";
    } else if (state.view === "first") {
      state.view = "overhead";
    } else {
      state.view = "third";
    }

    // Control character visibility based on view
    if (state.characterMesh) {
      // Hide character in first person (you're looking through their eyes)
      // Show character in third person and overhead (you can see yourself)
      state.characterMesh.visible = state.view !== "first";
    }

    // Debug log removed
  }

  function getRunKeyDown() {
    return !!(keys.ShiftLeft || keys.ShiftRight);
  }

  function isInsideBuilding(x, z, b) {
    // Bounding box check
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;

    // Detailed polygon check if available
    if (isPointInPolygon && b.pts && b.pts.length > 0) {
      return isPointInPolygon(x, z, b.pts);
    }

    // Fallback: inside bounding box = collision
    return true;
  }

  function queryBuildings(x, z, radius = 100) {
    if (typeof getNearbyBuildings === 'function') {
      const nearby = getNearbyBuildings(x, z, radius);
      if (nearby && nearby.length > 0) return nearby;
    }
    if (!getBuildingsArray) return null;
    return getBuildingsArray();
  }

  // Find nearest building wall and return info for wall jumping
  function findNearestWall(x, z) {
    const allBuildings = queryBuildings(x, z, CFG.wallDetectRadius + 12);
    if (!allBuildings || allBuildings.length === 0) return null;

    let nearestDist = Infinity;
    let nearestWall = null;

    for (let i = 0; i < allBuildings.length; i++) {
      const b = allBuildings[i];
      // Broad phase: skip buildings far away
      if (x < b.minX - CFG.wallDetectRadius || x > b.maxX + CFG.wallDetectRadius ||
      z < b.minZ - CFG.wallDetectRadius || z > b.maxZ + CFG.wallDetectRadius) continue;

      const pts = b.pts;
      if (!pts || pts.length < 3) continue;

      for (let j = 0; j < pts.length; j++) {
        const p1 = pts[j];
        const p2 = pts[(j + 1) % pts.length];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const len2 = dx * dx + dz * dz;
        if (len2 === 0) continue;

        let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const nearX = p1.x + t * dx;
        const nearZ = p1.z + t * dz;
        const dist = Math.hypot(x - nearX, z - nearZ);

        if (dist < nearestDist) {
          nearestDist = dist;
          // Wall normal pointing away from building
          let nx = -(p2.z - p1.z);
          let nz = p2.x - p1.x;
          const nLen = Math.hypot(nx, nz);
          if (nLen > 0) {nx /= nLen;nz /= nLen;}
          // Make sure normal points toward walker
          const toWalker = (x - nearX) * nx + (z - nearZ) * nz;
          if (toWalker < 0) {nx = -nx;nz = -nz;}

          nearestWall = { dist, nx, nz, building: b, pointX: nearX, pointZ: nearZ };
        }
      }
    }

    return nearestDist < CFG.wallDetectRadius ? nearestWall : null;
  }

  // Get the roof height at walker position (if standing on/above a building)
  function getBuildingRoofHeight(x, z, walkerY) {
    const allBuildings = queryBuildings(x, z, 24);
    if (!allBuildings || allBuildings.length === 0) return null;

    let bestRoof = null;

    for (let i = 0; i < allBuildings.length; i++) {
      const b = allBuildings[i];
      // Broad phase
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;

      // Get terrain height at building position for absolute roof height
      let terrainY = 0;
      if (typeof appCtx.terrainMeshHeightAt === 'function') {
        terrainY = appCtx.terrainMeshHeightAt(x, z);
      } else if (typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
        terrainY = appCtx.elevationWorldYAtWorldXZ(x, z);
      }
      const roofY = terrainY + b.height;

      // Check if walker is above this roof or close to it (within 2 units below to allow landing)
      if (walkerY - CFG.eyeHeight >= roofY - 0.5) {
        // Check if inside building polygon
        const inside = isPointInPolygon && b.pts && b.pts.length > 0 ?
        isPointInPolygon(x, z, b.pts) :
        isInsideBuilding(x, z, b);
        if (inside) {
          if (!bestRoof || roofY > bestRoof.roofY) {
            bestRoof = { roofY, building: b };
          }
        }
      }
    }

    return bestRoof;
  }

  function updateWalkPhysics(dt) {
    syncWalkTerrain(false);

    // Arrow keys for MOVEMENT (forward/back/strafe)
    const moveForward = keys.ArrowUp ? 1 : 0;
    const moveBack = keys.ArrowDown ? 1 : 0;
    const strafeLeft = keys.ArrowLeft ? 1 : 0;
    const strafeRight = keys.ArrowRight ? 1 : 0;

    // WASD for LOOKING (camera rotation)
    const lookLeft = keys.KeyA ? 1 : 0;
    const lookRight = keys.KeyD ? 1 : 0;
    const lookUp = keys.KeyW ? 1 : 0;
    const lookDown = keys.KeyS ? 1 : 0;

    // Movement speed
    const speed = keys.ShiftLeft || keys.ShiftRight ? CFG.runSpeed : CFG.walkSpeed;

    // Look rotation speed
    const lookSpeed = 2.5 * dt; // Increased speed

    // Update look angle from WASD (keyboard look)
    if (lookLeft) state.walker.yaw += lookSpeed;
    if (lookRight) state.walker.yaw -= lookSpeed;
    if (lookUp) {
      state.walker.pitch += lookSpeed;
      // Debug log removed
    }
    if (lookDown) {
      state.walker.pitch -= lookSpeed;
      // Debug log removed
    }

    // Clamp pitch to reasonable limits
    state.walker.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.walker.pitch));

    // Sync angle with yaw for movement direction
    state.walker.angle = state.walker.yaw;

    // Calculate movement direction based on current look angle
    const forward = moveForward - moveBack;
    const strafe = strafeLeft - strafeRight; // FIXED: was strafeRight - strafeLeft (reversed)

    // MOON ASTRONAUT PHYSICS - Gravity and Jumping
    const MOON_GRAVITY = appCtx.onMoon ? -1.62 : -9.8; // Real moon gravity: 1.62 m/s²
    const JUMP_VELOCITY = appCtx.onMoon ? 3.0 : 5.0; // Higher jump on moon!

    // Get ground height (moon surface or Earth terrain)
    let groundY;
    if (appCtx.onMoon && appCtx.moonSurface) {
      // Raycast against moon surface
      const raycaster = appCtx._getPhysRaycaster();
      appCtx._physRayStart.set(state.walker.x, 200, state.walker.z);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = raycaster.intersectObject(appCtx.moonSurface, false);
      groundY = hits.length > 0 ? hits[0].point.y : -100;
    } else {
      groundY = typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(state.walker.x, state.walker.z) :
      appCtx.elevationWorldYAtWorldXZ(state.walker.x, state.walker.z);
    }

    // Initialize walker.y if not set
    if (state.walker.y === undefined || state.walker.y === 0) {
      state.walker.y = groundY + 1.7; // Start at ground + eye height
    }

    // Check building roof under walker (can stand on roofs)
    let effectiveGroundY = groundY;
    state.walker.onBuilding = false;

    if (!appCtx.onMoon) {
      const roofInfo = getBuildingRoofHeight(state.walker.x, state.walker.z, state.walker.y);
      if (roofInfo && roofInfo.roofY > groundY) {
        effectiveGroundY = roofInfo.roofY;
        state.walker.onBuilding = true;
      }
    }

    // Stand on top of placed build blocks (persistent brick builder).
    if (typeof appCtx.getBuildTopSurfaceAtWorldXZ === 'function') {
      const feetY = state.walker.y - CFG.eyeHeight;
      const topY = appCtx.getBuildTopSurfaceAtWorldXZ(
        state.walker.x,
        state.walker.z,
        feetY + CFG.blockStepHeight
      );
      if (Number.isFinite(topY) && topY > effectiveGroundY) {
        effectiveGroundY = topY;
      }
    }

    // Check if on ground (with small tolerance)
    state.walker.onGround = Math.abs(state.walker.y - (effectiveGroundY + CFG.eyeHeight)) < 0.3;

    // Decrement wall jump cooldown
    if (state.walker.wallJumpTimer > 0) {
      state.walker.wallJumpTimer -= dt;
    }

    // JUMP with SPACE BAR
    if (keys.Space && state.walker.onGround) {
      state.walker.vy = JUMP_VELOCITY;
      state.walker.onGround = false;
    }

    // WALL JUMP: press space while in the air and near a building wall
    if (keys.Space && !state.walker.onGround && state.walker.wallJumpTimer <= 0 && !appCtx.onMoon) {
      const wall = findNearestWall(state.walker.x, state.walker.z);
      if (wall && state.walker.y - CFG.eyeHeight < wall.building.height + effectiveGroundY) {
        // Wall kick: launch upward and slightly outward from wall
        state.walker.vy = CFG.wallJumpVelocity;
        state.walker.x += wall.nx * CFG.wallJumpOutward;
        state.walker.z += wall.nz * CFG.wallJumpOutward;
        state.walker.wallJumpTimer = CFG.wallJumpCooldown;
      }
    }

    // Apply gravity
    state.walker.vy += MOON_GRAVITY * dt;

    // Update vertical position
    state.walker.y += state.walker.vy * dt;

    // Land on ground or building roof
    if (state.walker.y <= effectiveGroundY + CFG.eyeHeight) {
      state.walker.y = effectiveGroundY + CFG.eyeHeight;
      state.walker.vy = 0;
      state.walker.onGround = true;
    }

    // Adjust speeds for moon (slower, floatier movement)
    const speedMultiplier = appCtx.onMoon ? 0.6 : 1.0; // 60% speed on moon
    const adjustedSpeed = speed * speedMultiplier;

    if (forward !== 0 || strafe !== 0) {
      // Forward/back movement
      const moveX = Math.sin(state.walker.angle) * forward * adjustedSpeed * dt;
      const moveZ = Math.cos(state.walker.angle) * forward * adjustedSpeed * dt;

      // Strafe movement (perpendicular to look direction)
      const strafeX = Math.cos(state.walker.angle) * strafe * adjustedSpeed * dt * CFG.strafeFactor;
      const strafeZ = -Math.sin(state.walker.angle) * strafe * adjustedSpeed * dt * CFG.strafeFactor;

      // Calculate new position
      let newX = state.walker.x + moveX + strafeX;
      let newZ = state.walker.z + moveZ + strafeZ;

      // Collision against buildings and user-placed build blocks.
      const checkBuildings = !appCtx.onMoon && (getBuildingsArray || getNearbyBuildings);
      const checkBuildBlocks = typeof appCtx.getBuildCollisionAtWorldXZ === 'function';
      if (checkBuildings || checkBuildBlocks) {
        const allBuildings = checkBuildings ? queryBuildings(newX, newZ, 32) || [] : [];
        const walkerFeetY = state.walker.y - CFG.eyeHeight;
        const sampleRadius = 0.28;
        const collisionSamples = [
          [0, 0],
          [sampleRadius, 0],
          [-sampleRadius, 0],
          [0, sampleRadius],
          [0, -sampleRadius]
        ];

        function isBlockedByWorld(px, pz) {
          for (let s = 0; s < collisionSamples.length; s++) {
            const sample = collisionSamples[s];
            const sx = px + sample[0];
            const sz = pz + sample[1];

            if (checkBuildings) {
              for (let i = 0; i < allBuildings.length; i++) {
                const b = allBuildings[i];
                if (sx < b.minX || sx > b.maxX || sz < b.minZ || sz > b.maxZ) continue;

                let bTerrainY = 0;
                if (typeof appCtx.terrainMeshHeightAt === 'function') {
                  bTerrainY = appCtx.terrainMeshHeightAt(sx, sz);
                } else if (typeof appCtx.elevationWorldYAtWorldXZ === 'function') {
                  bTerrainY = appCtx.elevationWorldYAtWorldXZ(sx, sz);
                }
                const roofY = bTerrainY + b.height;

                // Allow if walker is at or above roof level (can walk on roof or land on it)
                if (walkerFeetY >= roofY - 1.0) continue;

                const inside = isPointInPolygon && b.pts && b.pts.length > 0 ?
                isPointInPolygon(sx, sz, b.pts) :
                isInsideBuilding(sx, sz, b);
                if (inside) return true;
              }
            }

            if (checkBuildBlocks) {
              const blockCollision = appCtx.getBuildCollisionAtWorldXZ(
                sx,
                sz,
                walkerFeetY,
                CFG.blockStepHeight,
                CFG.eyeHeight * 0.95
              );
              if (blockCollision && blockCollision.blocked) return true;
            }
          }

          return false;
        }

        // Try full move first
        if (isBlockedByWorld(newX, newZ)) {
          // Try sliding along X only
          const slideX = isBlockedByWorld(newX, state.walker.z);
          // Try sliding along Z only
          const slideZ = isBlockedByWorld(state.walker.x, newZ);

          if (!slideX) {
            newZ = state.walker.z; // Block Z, allow X
          } else if (!slideZ) {
            newX = state.walker.x; // Block X, allow Z
          } else {
            // Both blocked, don't move
            newX = state.walker.x;
            newZ = state.walker.z;
          }
        }
      }

      // Apply movement
      state.walker.x = newX;
      state.walker.z = newZ;

      // Update speed display
      state.walker.speedMph = adjustedSpeed * 0.68; // Rough conversion to mph for display
    } else {
      state.walker.speedMph = 0;
    }

    // Update character mesh position and rotation (mesh is at feet, walker.y is at eye height)
    if (state.characterMesh && state.characterMesh.visible) {
      state.characterMesh.position.set(state.walker.x, state.walker.y - CFG.eyeHeight, state.walker.z);
      state.characterMesh.rotation.y = state.walker.angle;

      // Animate walking when moving
      const isMoving = state.walker.speedMph > 0;
      animateCharacterWalk(state.characterMesh, isMoving, dt);
    }

    syncWalkTerrain(false);
  }

  function updateWalkCamera() {
    if (state.mode !== "walk") {
      return false;
    }

    if (state.view === "first") {
      // Use actual walker Y position (includes jumps!)
      const y = state.walker.y;
      camera.position.set(state.walker.x, y, state.walker.z);

      // Look direction based on yaw and pitch (for mouse look support)
      const lookDistance = 10;
      const lookX = state.walker.x + Math.sin(state.walker.yaw) * Math.cos(state.walker.pitch) * lookDistance;
      const lookY = y + Math.sin(state.walker.pitch) * lookDistance;
      const lookZ = state.walker.z + Math.cos(state.walker.yaw) * Math.cos(state.walker.pitch) * lookDistance;

      camera.lookAt(lookX, lookY, lookZ);
      return true;
    }

    if (state.view === "overhead") {
      // Overhead view like car mode - high up, looking down
      const terrainY = typeof appCtx.terrainMeshHeightAt === 'function' ?
      appCtx.terrainMeshHeightAt(state.walker.x, state.walker.z) :
      appCtx.elevationWorldYAtWorldXZ(state.walker.x, state.walker.z);
      const height = 45;
      const offsetBack = 8;

      camera.position.set(
        state.walker.x - Math.sin(state.walker.yaw) * offsetBack,
        terrainY + height,
        state.walker.z - Math.cos(state.walker.yaw) * offsetBack
      );

      // Look at a point slightly ahead of the walker
      const lookAhead = 15;
      camera.lookAt(
        state.walker.x + Math.sin(state.walker.yaw) * lookAhead,
        terrainY,
        state.walker.z + Math.cos(state.walker.yaw) * lookAhead
      );
      return true;
    }

    // Third person view - NOW WITH PITCH SUPPORT AND JUMP TRACKING
    const baseY = state.walker.y; // Use actual walker Y (includes jumps)
    const back = CFG.thirdPersonDist;
    const up = CFG.thirdPersonHeight;

    // Position camera behind and above the character, accounting for pitch
    const camX = state.walker.x - Math.sin(state.walker.yaw) * Math.cos(state.walker.pitch) * back;
    const camZ = state.walker.z - Math.cos(state.walker.yaw) * Math.cos(state.walker.pitch) * back;
    const camY = baseY + up - Math.sin(state.walker.pitch) * back * 0.5; // Adjust height based on pitch

    camera.position.set(camX, camY, camZ);

    // Look at point ahead of character, accounting for pitch
    const lookAhead = CFG.thirdPersonLookAhead;
    const lookX = state.walker.x + Math.sin(state.walker.yaw) * Math.cos(state.walker.pitch) * lookAhead;
    const lookY = baseY - CFG.eyeHeight + 1.2 + Math.sin(state.walker.pitch) * lookAhead * 0.5; // Adjust look height based on pitch
    const lookZ = state.walker.z + Math.cos(state.walker.yaw) * Math.cos(state.walker.pitch) * lookAhead;

    camera.lookAt(lookX, lookY, lookZ);
    return true;
  }

  function getMapRefPosition(droneMode, drone) {
    if (droneMode) return { x: drone.x, z: drone.z };
    if (state.mode === "walk") return { x: state.walker.x, z: state.walker.z };
    return { x: car.x, z: car.z };
  }

  state.characterMesh = createCharacterMesh();
  syncWalkerFromCar();

  return {
    state,
    CFG,
    toggleWalk,
    setModeWalk,
    setModeDrive,
    toggleView,
    update(dt) {
      if (!state.enabled) return;
      if (state.mode === "walk") updateWalkPhysics(dt);
    },
    applyCameraIfWalking() {
      return updateWalkCamera();
    },
    getMapRefPosition
  };
}

Object.assign(appCtx, { createWalkingModule });

export { createWalkingModule };
