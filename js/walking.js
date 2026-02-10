// ============================================================================
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
    getBuildingsArray = null,  // Function that returns current buildings array
    isPointInPolygon = null,
  } = opts;

  if (!THREE || !scene || !camera || !keys || !car) {
    throw new Error("WalkingModule missing required inputs");
  }

  const state = {
    enabled: true,
    mode: "drive",
    view: "third",
    walker: { x: 0, z: 0, y: 0, angle: 0, yaw: 0, pitch: 0, speedMph: 0, vy: 0, onGround: true, lastGroundY: 0 },
    characterMesh: null
  };

  const CFG = {
    walkSpeed: 6.0,
    runSpeed: 12.0,
    turnSpeed: 2.6,
    strafeFactor: 0.85,
    eyeHeight: 1.7,
    thirdPersonDist: 8.0,
    thirdPersonHeight: 3.5,
    thirdPersonLookAhead: 8.0,
    collisionPushBack: 2.0
  };

  function createCharacterMesh() {
    const grp = new THREE.Group();
    // Brighter, more visible colors
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x2288ff,  // Brighter blue
      roughness: 0.7,
      emissive: 0x1144aa,  // Slight glow
      emissiveIntensity: 0.2
    });
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffdd99,  // Brighter skin tone
      roughness: 0.6
    });
    const legMat  = new THREE.MeshStandardMaterial({
      color: 0x444444,  // Lighter grey
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
      limbs.leg1.rotation.x *= (1 - resetSpeed);
      limbs.leg2.rotation.x *= (1 - resetSpeed);
      limbs.arm1.rotation.x *= (1 - resetSpeed);
      limbs.arm2.rotation.x *= (1 - resetSpeed);
      
      // Reset body position
      limbs.body.position.y = 1.0 * scale;
    }
  }

  function syncWalkerFromCar() {
    state.walker.x = car.x;
    state.walker.z = car.z;
    state.walker.angle = car.angle;
    state.walker.yaw = car.angle;
    state.walker.pitch = 0;
    state.walker.speedMph = 0;
    state.walker.vy = 0;
    state.walker.onGround = true;
    state.walker.y = 0; // will be re-initialized on first physics tick
    state.walker.lastGroundY = 0;
  }

  function syncCarFromWalker() {
    car.x = state.walker.x;
    car.z = state.walker.z;
    car.angle = state.walker.angle;
    car.speed = 0;
    if (typeof invalidateRoadCache === 'function') invalidateRoadCache();
  }

  function setModeWalk() {
    state.mode = "walk";
    state.view = "third";  // Always start behind the character

    syncWalkerFromCar();

    if (carMesh) {
      carMesh.visible = false;
    }

    if (!state.characterMesh) {
      state.characterMesh = createCharacterMesh();
    }

    if (state.characterMesh) {
      const terrainY = typeof terrainMeshHeightAt === 'function'
          ? terrainMeshHeightAt(state.walker.x, state.walker.z)
          : elevationWorldYAtWorldXZ(state.walker.x, state.walker.z);
      state.characterMesh.visible = true;  // Third person = character visible
      state.characterMesh.position.set(state.walker.x, terrainY, state.walker.z);
      state.characterMesh.rotation.y = state.walker.angle;
    } else {
      console.error('ERROR: Character mesh is still null after creation!');
    }
  }

  function setModeDrive() {
    state.mode = "drive";
    syncCarFromWalker();
    if (carMesh) {
      carMesh.visible = true;
      carMesh.position.set(car.x, 0, car.z);
      carMesh.rotation.y = car.angle;
    }
    if (state.characterMesh) state.characterMesh.visible = false;
    // Deactivate mouse look when leaving walking mode
    window.walkMouseLookActive = false;
  }

  function toggleWalk() {
    if (!state.enabled) return;
    // Debug log removed
    if (state.mode === "walk") setModeDrive();
    else setModeWalk();
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
      state.characterMesh.visible = (state.view !== "first");
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

  function updateWalkPhysics(dt) {
    // Arrow keys for MOVEMENT (forward/back/strafe)
    const moveForward  = keys.ArrowUp ? 1 : 0;
    const moveBack     = keys.ArrowDown ? 1 : 0;
    const strafeLeft   = keys.ArrowLeft ? 1 : 0;
    const strafeRight  = keys.ArrowRight ? 1 : 0;

    // WASD for LOOKING (camera rotation)
    const lookLeft  = keys.KeyA ? 1 : 0;
    const lookRight = keys.KeyD ? 1 : 0;
    const lookUp    = keys.KeyW ? 1 : 0;
    const lookDown  = keys.KeyS ? 1 : 0;

    // Movement speed
    const speed = keys.ShiftLeft || keys.ShiftRight ? CFG.runSpeed : CFG.walkSpeed;

    // Look rotation speed
    const lookSpeed = 2.5 * dt; // Increased speed

    // Update look angle from WASD (keyboard look)
    if (lookLeft)  state.walker.yaw += lookSpeed;
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
    const MOON_GRAVITY = onMoon ? -1.62 : -9.8; // Real moon gravity: 1.62 m/s²
    const JUMP_VELOCITY = onMoon ? 3.0 : 5.0;   // Higher jump on moon!

    // Get ground height (moon surface or Earth terrain)
    let groundY;
    if (onMoon && moonSurface) {
        // Raycast against moon surface
        const raycaster = _getPhysRaycaster();
        _physRayStart.set(state.walker.x, 200, state.walker.z);
        raycaster.set(_physRayStart, _physRayDir);
        const hits = raycaster.intersectObject(moonSurface, false);
        groundY = hits.length > 0 ? hits[0].point.y : -100;
    } else {
        groundY = typeof terrainMeshHeightAt === 'function'
            ? terrainMeshHeightAt(state.walker.x, state.walker.z)
            : elevationWorldYAtWorldXZ(state.walker.x, state.walker.z);
    }

    const feetY = groundY + 1.7; // ground + eye height

    // Initialize walker.y if not set
    if (state.walker.y === undefined || state.walker.y === 0) {
        state.walker.y = feetY;
        state.walker.lastGroundY = groundY;
    }

    // --- Edge detection: launch off ledges ---
    // If we were on the ground last frame and the ground has dropped away
    // beneath us while we have horizontal speed, become airborne instead
    // of snapping down.
    const groundDrop = state.walker.lastGroundY - groundY;
    if (state.walker.onGround && groundDrop > 0.3) {
        // Ground fell away — we ran off an edge.  Keep current Y, let
        // gravity pull us down naturally (vy stays 0 = horizontal launch).
        state.walker.onGround = false;
    }

    // Check if on ground (with small tolerance) — only when not already airborne
    if (state.walker.onGround) {
        state.walker.onGround = Math.abs(state.walker.y - feetY) < 0.15;
    }

    // JUMP with SPACE BAR - Astronaut style!
    if (keys.Space && state.walker.onGround) {
        state.walker.vy = JUMP_VELOCITY;
        state.walker.onGround = false;
    }

    // Apply gravity (always, even on ground — landing clamp below handles it)
    state.walker.vy += MOON_GRAVITY * dt;

    // Update vertical position
    state.walker.y += state.walker.vy * dt;

    // Land on ground
    if (state.walker.y <= feetY) {
        state.walker.y = feetY;
        state.walker.vy = 0;
        state.walker.onGround = true;
    }

    // Remember this frame's ground height for next-frame edge detection
    state.walker.lastGroundY = groundY;

    // Adjust speeds for moon (slower, floatier movement)
    const speedMultiplier = onMoon ? 0.6 : 1.0; // 60% speed on moon
    const adjustedSpeed = speed * speedMultiplier;

    if (forward !== 0 || strafe !== 0) {
      // Forward/back movement
      const moveX = Math.sin(state.walker.angle) * forward * adjustedSpeed * dt;
      const moveZ = Math.cos(state.walker.angle) * forward * adjustedSpeed * dt;

      // Strafe movement (perpendicular to look direction)
      const strafeX = Math.cos(state.walker.angle) * strafe * adjustedSpeed * dt * CFG.strafeFactor;
      const strafeZ = -Math.sin(state.walker.angle) * strafe * adjustedSpeed * dt * CFG.strafeFactor;

      // Apply movement
      state.walker.x += moveX + strafeX;
      state.walker.z += moveZ + strafeZ;

      // Update speed display
      state.walker.speedMph = adjustedSpeed * 0.68; // Rough conversion to mph for display
    } else {
      state.walker.speedMph = 0;
    }

    // Update character mesh position and rotation
    if (state.characterMesh && state.characterMesh.visible) {
      state.characterMesh.position.set(state.walker.x, state.walker.y, state.walker.z);
      state.characterMesh.rotation.y = state.walker.angle;
      
      // Animate walking when moving
      const isMoving = state.walker.speedMph > 0;
      animateCharacterWalk(state.characterMesh, isMoving, dt);
    }
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
      const terrainY = typeof terrainMeshHeightAt === 'function'
          ? terrainMeshHeightAt(state.walker.x, state.walker.z)
          : elevationWorldYAtWorldXZ(state.walker.x, state.walker.z);
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
