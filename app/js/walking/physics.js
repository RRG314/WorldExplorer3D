import { ctx as appCtx } from "../shared-context.js?v=55";
import { resolveMobileCameraRecenter } from "../controls/mobile-touch-authority.js?v=5";
import { worldUnitsPerSecondToMph } from "../physics/vehicle-speed-units.js?v=2";
import { integrateSkydivingDynamics, parachuteHorizontalSpeed } from "../urban-sandbox/parachute-model.js?v=6";
import { planetarySurfaceYAtRenderXZ } from '../planetary/runtime/surface-query.js?v=3';
import { samplePhysicalEnvironment } from '../planetary/runtime/physical-environment.js?v=2';
import { getPlanetarySurfaceRegion } from '../planetary/runtime/surface-authority.js?v=4';
import { resolvePlanetarySurfaceBoundary } from '../planetary/runtime/surface-boundary.js?v=1';
import { queryPlanetaryObstacle } from '../planetary/runtime/obstacle-authority.js?v=1';
import { resolveInteriorCeiling } from '../interiors/vertical-boundary.js?v=1';

function wrapYaw(angle = 0) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function isPlanetarySurface() {
  return !!(appCtx.onMoon || appCtx.onMars || appCtx.activePlanetaryBodyId);
}

function activePlanetaryBodyId() {
  return appCtx.activePlanetaryBodyId || (appCtx.onMars ? 'mars' : appCtx.onMoon ? 'moon' : null);
}

function createWalkingPhysicsHelpers({
  CFG,
  animateCharacterWalk,
  getBuildingsArray,
  getNearbyBuildings,
  getWalkGroundY,
  isPointInPolygon,
  keys,
  state
}) {
  function isInsideBuilding(x, z, b) {
    if (!b || b.collisionDisabled) return false;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    if (isPointInPolygon && b.pts && b.pts.length > 0) {
      return isPointInPolygon(x, z, b.pts);
    }
    return true;
  }

  function buildingBlocksWalkerAtHeight(b, walkerFeetY, actorHeight = CFG.eyeHeight * 0.95, tolerance = 0.45) {
    if (!b || !Number.isFinite(walkerFeetY)) return true;
    const minY = Number.isFinite(b?.minY) ? b.minY : Number.isFinite(b?.baseY) ? b.baseY : NaN;
    const maxY = Number.isFinite(b?.maxY) ? b.maxY : Number.isFinite(minY) && Number.isFinite(b?.height) ? minY + b.height : NaN;
    if (!Number.isFinite(minY) || !Number.isFinite(maxY)) return true;
    const walkerTopY = walkerFeetY + Math.max(0.5, actorHeight);
    return !(walkerTopY < minY - tolerance || walkerFeetY > maxY + tolerance);
  }

  function queryBuildings(x, z, radius = 100) {
    if (typeof getNearbyBuildings === "function") {
      const nearby = getNearbyBuildings(x, z, radius);
      if (Array.isArray(nearby)) {
        return nearby.filter((building) => {
          if (
            !Number.isFinite(building?.minX) ||
            !Number.isFinite(building?.maxX) ||
            !Number.isFinite(building?.minZ) ||
            !Number.isFinite(building?.maxZ)
          ) return true;
          return !(
            x < building.minX - radius ||
            x > building.maxX + radius ||
            z < building.minZ - radius ||
            z > building.maxZ + radius
          );
        });
      }
    }
    if (!getBuildingsArray) return null;
    return getBuildingsArray();
  }

  function buildingBaseYAt(b, x, z) {
    if (Number.isFinite(b?.baseY)) return b.baseY;
    const terrainY = appCtx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y;
    if (Number.isFinite(terrainY)) return terrainY;
    return 0;
  }

  function buildingRoofYAt(b, x, z) {
    if (Number.isFinite(b?.maxY)) return b.maxY;
    return buildingBaseYAt(b, x, z) + Math.max(0, Number(b?.height) || 0);
  }

  function walkerIsAtOrAboveRoof(building, walkerFeetY, tolerance = 1) {
    if (!building || !Number.isFinite(walkerFeetY)) return false;
    const roofY = buildingRoofYAt(building, state.walker.x, state.walker.z);
    return Number.isFinite(roofY) && walkerFeetY >= roofY - Math.max(0.12, tolerance);
  }

  function findNearestWall(x, z) {
    const allBuildings = queryBuildings(x, z, CFG.wallDetectRadius + 12);
    if (!allBuildings || allBuildings.length === 0) return null;

    let nearestDist = Infinity;
    let nearestWall = null;

    for (let i = 0; i < allBuildings.length; i += 1) {
      const b = allBuildings[i];
      if (!b || b.collisionDisabled) continue;
      const walkerFeetY = state.walker.y - CFG.eyeHeight;
      if (!buildingBlocksWalkerAtHeight(b, walkerFeetY)) continue;
      if (x < b.minX - CFG.wallDetectRadius || x > b.maxX + CFG.wallDetectRadius || z < b.minZ - CFG.wallDetectRadius || z > b.maxZ + CFG.wallDetectRadius) continue;

      const pts = b.pts;
      if (!pts || pts.length < 3) continue;

      for (let j = 0; j < pts.length; j += 1) {
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
          let nx = -(p2.z - p1.z);
          let nz = p2.x - p1.x;
          const nLen = Math.hypot(nx, nz);
          if (nLen > 0) {
            nx /= nLen;
            nz /= nLen;
          }
          const toWalker = (x - nearX) * nx + (z - nearZ) * nz;
          if (toWalker < 0) {
            nx = -nx;
            nz = -nz;
          }
          nearestWall = { dist, nx, nz, building: b, pointX: nearX, pointZ: nearZ };
        }
      }
    }

    return nearestDist < CFG.wallDetectRadius ? nearestWall : null;
  }

  function getBuildingRoofHeight(x, z, walkerY) {
    const allBuildings = queryBuildings(x, z, 24);
    if (!allBuildings || allBuildings.length === 0) return null;

    let bestRoof = null;
    for (let i = 0; i < allBuildings.length; i += 1) {
      const b = allBuildings[i];
      if (!b || b.collisionDisabled || b.isInteriorCollider) continue;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;

      const roofY = buildingRoofYAt(b, x, z);
      const landingTolerance = Math.max(0.75, Math.abs(Number(state.walker.vy) || 0) * 0.14);
      if (walkerY - CFG.eyeHeight >= roofY - landingTolerance) {
        const inside = isPointInPolygon && b.pts && b.pts.length > 0
          ? isPointInPolygon(x, z, b.pts)
          : isInsideBuilding(x, z, b);
        if (inside && (!bestRoof || roofY > bestRoof.roofY)) {
          bestRoof = { roofY, building: b };
        }
      }
    }
    return bestRoof;
  }

  function resolveWalkGroundState(x, z, walkerY, finiteOr) {
    let groundY;
    if (isPlanetarySurface()) {
      groundY = planetarySurfaceYAtRenderXZ(appCtx, x, z);
      if (!Number.isFinite(groundY)) groundY = -100;
    } else {
      // Overlapping interior floors require a vertical reference. Preserve the
      // legacy outdoor query path, but choose the nearest published interior
      // surface to the actor's feet instead of always selecting the lowest one.
      const surfaceReferenceY = appCtx.activeInterior
        ? finiteOr(walkerY, 0) - CFG.eyeHeight
        : -100;
      groundY = getWalkGroundY(x, z, surfaceReferenceY);
    }

    let effectiveGroundY = groundY;
    let onBuilding = false;

    if (!isPlanetarySurface()) {
      const roofInfo = getBuildingRoofHeight(x, z, walkerY);
      if (roofInfo && roofInfo.roofY > groundY) {
        effectiveGroundY = roofInfo.roofY;
        onBuilding = true;
      }
    }

    if (typeof appCtx.getBuildTopSurfaceAtWorldXZ === "function") {
      const feetY = finiteOr(walkerY, 0) - CFG.eyeHeight;
      const topY = appCtx.getBuildTopSurfaceAtWorldXZ(x, z, feetY + CFG.blockStepHeight);
      if (Number.isFinite(topY) && topY > effectiveGroundY) {
        effectiveGroundY = topY;
      }
    }

    return { groundY, effectiveGroundY, onBuilding };
  }

  function updateWalkPhysics(dt, finiteOr) {
    const profileEnabled = appCtx.phase5WalkProfileEnabled === true;
    const profileStartedAt = profileEnabled ? performance.now() : 0;
    let profileAfterCollision = profileStartedAt;
    let profileAfterFinalSurface = profileStartedAt;
    const startX = finiteOr(state.walker.x, 0);
    const startZ = finiteOr(state.walker.z, 0);
    const actions = appCtx.readControlActions?.('walk') || {};
    const mobileTouch = actions.mobileTouch === true;
    const liveGpsOwnsTranslation = appCtx.liveGpsTranslationOwned?.() === true;
    const liveGpsTarget = liveGpsOwnsTranslation
      ? appCtx.resolveLiveGpsWalkerTarget?.(dt, { x: state.walker.x, z: state.walker.z }) || null
      : null;
    const skydiving = appCtx.urbanSandboxRuntime?.parachute?.skydiving === true;
    const parachuteDeployedAtFrameStart = appCtx.isUrbanParachuteDeployed?.() === true;
    const speed = skydiving
      ? parachuteHorizontalSpeed(parachuteDeployedAtFrameStart)
      : Number(actions.sprint) > 0.05 ? CFG.runSpeed : CFG.walkSpeed;
    const lookSpeed = 2.5 * dt;

    // Skydiving owns heading below. Applying the walking turn a second time
    // rotates the camera opposite the canopy and makes steering unreadable.
    if (!skydiving) {
      state.walker.yaw += (Number(actions.turn) || 0) * CFG.turnSpeed * dt;
    }
    state.walker.lookYawOffset += (Number(actions.lookYaw) || 0) * lookSpeed;
    state.walker.pitch += (Number(actions.lookPitch) || 0) * lookSpeed;

    state.walker.lookYawOffset = wrapYaw(state.walker.lookYawOffset);
    state.walker.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.walker.pitch));
    if (liveGpsOwnsTranslation && Number.isFinite(liveGpsTarget?.headingDegrees)) {
      state.walker.angle = Math.PI - liveGpsTarget.headingDegrees * Math.PI / 180;
    } else if (!liveGpsOwnsTranslation && !mobileTouch) {
      state.walker.angle = state.walker.yaw;
    }

    let forward = liveGpsOwnsTranslation ? 0 : Number(actions.move) || 0;
    let strafe = liveGpsOwnsTranslation ? 0 : Number(actions.strafe) || 0;
    if (mobileTouch && !liveGpsOwnsTranslation) {
      const mobileMoveActive = actions.mobileMoveActive === true;
      if (mobileMoveActive && state.walker.mobileMoveWasActive !== true) {
        // Lock this gesture to the camera direction that was visible when the
        // thumb went down. The chase camera may then move behind the explorer
        // without feeding its own rotation back into a held left/right input
        // and curling the player into a tight circle.
        state.walker.mobileMoveBasisYaw = wrapYaw(state.walker.yaw + state.walker.lookYawOffset);
      }
      state.walker.mobileMoveWasActive = mobileMoveActive;
      const dampingRate = actions.mobileMoveActive === true ? 14 : 22;
      const inputBlend = 1 - Math.exp(-Math.max(0, Math.min(0.1, dt)) * dampingRate);
      state.walker.mobileForward = finiteOr(state.walker.mobileForward, 0) +
        (forward - finiteOr(state.walker.mobileForward, 0)) * inputBlend;
      state.walker.mobileStrafe = finiteOr(state.walker.mobileStrafe, 0) +
        (strafe - finiteOr(state.walker.mobileStrafe, 0)) * inputBlend;
      if (Math.abs(state.walker.mobileForward) < 0.002) state.walker.mobileForward = 0;
      if (Math.abs(state.walker.mobileStrafe) < 0.002) state.walker.mobileStrafe = 0;
      if (!mobileMoveActive && state.walker.mobileForward === 0 && state.walker.mobileStrafe === 0) {
        state.walker.mobileMoveBasisYaw = null;
      }
      forward = state.walker.mobileForward;
      strafe = state.walker.mobileStrafe;
    } else {
      state.walker.mobileForward = 0;
      state.walker.mobileStrafe = 0;
      state.walker.mobileMoveBasisYaw = null;
      state.walker.mobileMoveWasActive = false;
    }
    let jumpAction = liveGpsOwnsTranslation ? 0 : Number(actions.jump) || 0;
    if (skydiving && appCtx.playerBackpackInventory?.equipped?.()?.id === 'parachute') jumpAction = 0;
    const planetaryBodyId = activePlanetaryBodyId();
    const activeEnvironment = appCtx.activePlanetaryEnvironment?.bodyId === planetaryBodyId
      ? appCtx.activePlanetaryEnvironment
      : null;
    const gravityMagnitude = planetaryBodyId
      ? Number(activeEnvironment?.gravityMagnitudeMps2) || samplePhysicalEnvironment(planetaryBodyId, { heightM: 0, timestampS: 0 }).gravityMagnitudeMps2
      : 9.80665;
    const gravity = -gravityMagnitude;
    const jumpVelocity = planetaryBodyId
      ? Math.max(2.8, Math.min(4.2, 5 * Math.sqrt(gravityMagnitude / 9.80665)))
      : 5.0;

    const groundState = state.walker._resolvedGroundState ||
      resolveWalkGroundState(state.walker.x, state.walker.z, state.walker.y, finiteOr);
    const profileAfterInitialSurface = profileEnabled ? performance.now() : 0;
    let groundY = groundState.groundY;
    if (state.walker.y === undefined || state.walker.y === 0) {
      state.walker.y = groundY + CFG.eyeHeight;
    }
    let effectiveGroundY = groundState.effectiveGroundY;
    let finalGroundState = groundState;
    state.walker.onBuilding = groundState.onBuilding;
    state.walker.onGround = Math.abs(state.walker.y - (effectiveGroundY + CFG.eyeHeight)) < 0.3;

    if (state.walker.wallJumpTimer > 0) {
      state.walker.wallJumpTimer -= dt;
    }

    if (jumpAction > 0.05 && state.walker.onGround) {
      state.walker.vy = jumpVelocity;
      state.walker.onGround = false;
    }

    if (jumpAction > 0.05 && !state.walker.onGround && state.walker.wallJumpTimer <= 0 && !isPlanetarySurface()) {
      const wall = findNearestWall(state.walker.x, state.walker.z);
      if (wall && state.walker.y - CFG.eyeHeight < buildingRoofYAt(wall.building, wall.pointX, wall.pointZ) + 0.35) {
        state.walker.vy = CFG.wallJumpVelocity;
        state.walker.x += wall.nx * CFG.wallJumpOutward;
        state.walker.z += wall.nz * CFG.wallJumpOutward;
        state.walker.wallJumpTimer = CFG.wallJumpCooldown;
      }
    }

    const parachuteDeployed = appCtx.isUrbanParachuteDeployed?.() === true &&
      !isPlanetarySurface() && !state.walker.onGround && state.walker.vy < 0;
    const parachuteFlare = parachuteDeployed && Number(actions.jump) > .05;
    let skydivingFlight = null;
    if (skydiving) {
      skydivingFlight = integrateSkydivingDynamics(state.walker.skydivingFlight, {
        deployed: parachuteDeployed,
        flare: parachuteFlare,
        forward,
        turn: Number(actions.turn) || -strafe,
        vx: state.walker.vx,
        vz: state.walker.vz,
        verticalVelocity: state.walker.vy
      }, dt);
      state.walker.skydivingFlight = skydivingFlight;
      state.walker.angle = skydivingFlight.heading;
      state.walker.vy = skydivingFlight.verticalSpeed;
      const activeLook = actions.mobileLookActive === true ||
        Math.abs(Number(actions.lookYaw) || 0) > .01;
      if (!activeLook) {
        const headingDelta = wrapYaw(skydivingFlight.heading - state.walker.yaw);
        const followBlend = 1 - Math.exp(-dt * 6.2);
        state.walker.yaw = wrapYaw(state.walker.yaw + headingDelta * followBlend);
        state.walker.lookYawOffset *= Math.exp(-dt * 4.6);
        if (Math.abs(state.walker.lookYawOffset) < .002) state.walker.lookYawOffset = 0;
      }
    } else {
      state.walker.skydivingFlight = null;
      state.walker.vy += gravity * dt;
    }
    state.walker.y += state.walker.vy * dt;

    if (appCtx.activeInterior) {
      const ceiling = resolveInteriorCeiling({
        activeInterior: appCtx.activeInterior,
        x: state.walker.x,
        z: state.walker.z,
        eyeY: state.walker.y,
        verticalVelocity: state.walker.vy
      });
      if (ceiling.collided) {
        state.walker.y = ceiling.eyeY;
        state.walker.vy = ceiling.verticalVelocity;
      }
    }

    if (state.walker.y <= effectiveGroundY + CFG.eyeHeight) {
      state.walker.y = effectiveGroundY + CFG.eyeHeight;
      state.walker.vy = 0;
      state.walker.onGround = true;
      appCtx.onUrbanParachuteLanded?.();
    }

    const speedMultiplier = planetaryBodyId === 'moon' ? 0.6 : planetaryBodyId ? 0.72 : 1.0;
    const adjustedSpeed = speed * speedMultiplier;

    const liveGpsMoved = !!liveGpsTarget && Math.hypot(
      liveGpsTarget.x - state.walker.x,
      liveGpsTarget.z - state.walker.z
    ) > 0.002;

    if (liveGpsMoved) {
      // GPS owns translation and heading while following. Camera look remains
      // temporarily available, then continuously settles behind the explorer
      // so looking aside cannot make movement direction ambiguous.
      const headingDelta = wrapYaw(state.walker.angle - state.walker.yaw);
      const followBlend = 1 - Math.exp(-dt * 4.8);
      state.walker.yaw = wrapYaw(state.walker.yaw + headingDelta * followBlend);
      state.walker.lookYawOffset *= Math.exp(-dt * 2.8);
      if (Math.abs(state.walker.lookYawOffset) < .002) state.walker.lookYawOffset = 0;
    } else if (mobileTouch && actions.mobileSettings?.cameraRecenter !== false && actions.mobileLookActive !== true) {
      // Movement is not a reason to suspend the chase camera. While the move
      // stick is held, keep settling behind the explorer so screen direction
      // and travel direction remain readable. Only active look input owns the
      // camera; after it is released the normal idle delay applies.
      const idleFor = actions.mobileMoveActive === true
        ? Number.POSITIVE_INFINITY
        : performance.now() - (Number(actions.mobileLastLookInputAt) || 0);
      const recenter = resolveMobileCameraRecenter({
        actorYaw: state.walker.angle,
        cameraYaw: state.walker.yaw + state.walker.lookYawOffset,
        dt,
        followRate: actions.mobileMoveActive === true ? 7.2 : 4.2,
        idleMs: idleFor,
        lookActive: actions.mobileLookActive,
        settings: actions.mobileSettings
      });
      if (recenter.active) {
        state.walker.yaw = recenter.yaw;
        state.walker.lookYawOffset = 0;
      }
    }

    if (forward !== 0 || strafe !== 0 || liveGpsMoved || skydivingFlight) {
      const cameraYaw = mobileTouch && Number.isFinite(state.walker.mobileMoveBasisYaw)
        ? state.walker.mobileMoveBasisYaw
        : wrapYaw(state.walker.yaw + state.walker.lookYawOffset);
      const moveX = skydivingFlight
        ? skydivingFlight.vx * dt
        : mobileTouch && !liveGpsMoved
        ? (Math.sin(cameraYaw) * forward - Math.cos(cameraYaw) * strafe) * adjustedSpeed * dt
        : Math.sin(state.walker.angle) * forward * adjustedSpeed * dt;
      const moveZ = skydivingFlight
        ? skydivingFlight.vz * dt
        : mobileTouch && !liveGpsMoved
        ? (Math.cos(cameraYaw) * forward + Math.sin(cameraYaw) * strafe) * adjustedSpeed * dt
        : Math.cos(state.walker.angle) * forward * adjustedSpeed * dt;
      if (mobileTouch && !liveGpsMoved && Math.hypot(moveX, moveZ) > 0.0001) {
        state.walker.angle = Math.atan2(moveX, moveZ);
      }

      let newX = liveGpsMoved ? liveGpsTarget.x : state.walker.x + moveX;
      let newZ = liveGpsMoved ? liveGpsTarget.z : state.walker.z + moveZ;
      if (planetaryBodyId) {
        const activeSurface = appCtx.planetarySurfaceAuthority?.snapshot?.()?.active;
        const manifest = activeSurface?.regionId
          ? getPlanetarySurfaceRegion(activeSurface.regionId)
          : null;
        if (manifest?.bodyId === planetaryBodyId) {
          const boundary = resolvePlanetarySurfaceBoundary(
            { x: newX, z: newZ },
            manifest,
            { inset: 40 }
          );
          if (boundary.clamped) {
            newX = boundary.x;
            newZ = boundary.z;
            appCtx.planetarySurfaceBoundary = Object.freeze({
              bodyId: activeSurface.bodyId,
              regionId: activeSurface.regionId,
              edge: boundary.edge,
              mode: 'walk',
              atMs: Date.now()
            });
          }
        }
      }
      const sharedBuildingCollision = !isPlanetarySurface() && typeof appCtx.checkBuildingCollision === "function"
        ? appCtx.checkBuildingCollision
        : null;
      const checkBuildingsFallback = !isPlanetarySurface() && !sharedBuildingCollision && (getBuildingsArray || getNearbyBuildings);
      const checkBuildBlocks = typeof appCtx.getBuildCollisionAtWorldXZ === "function";
      const checkPlanetaryObstacles = isPlanetarySurface();
      if (sharedBuildingCollision || checkBuildingsFallback || checkBuildBlocks || checkPlanetaryObstacles) {
        const allBuildings = checkBuildingsFallback ? queryBuildings(newX, newZ, 32) || [] : [];
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
          if (checkPlanetaryObstacles && queryPlanetaryObstacle(px, pz, sampleRadius, planetaryBodyId)?.collision) return true;
          if (sharedBuildingCollision) {
            const collision = sharedBuildingCollision(px, pz, sampleRadius, {
              actorBaseY: walkerFeetY,
              actorHeight: CFG.eyeHeight * 0.95,
              // The building collider owns walls, while the walking surface
              // query owns a roof beneath the actor's feet. Once the walker
              // has reached that roof, the same solid must not block every
              // horizontal step across it.
              acceptCollision: (candidate) => !walkerIsAtOrAboveRoof(
                candidate?.building,
                walkerFeetY
              )
            });
            if (collision?.collision) return true;
          }

          for (let s = 0; s < collisionSamples.length; s += 1) {
            const sample = collisionSamples[s];
            const sx = px + sample[0];
            const sz = pz + sample[1];

            if (checkBuildingsFallback) {
              for (let i = 0; i < allBuildings.length; i += 1) {
                const b = allBuildings[i];
                if (!b || b.collisionDisabled) continue;
                if (!buildingBlocksWalkerAtHeight(b, walkerFeetY)) continue;
                if (sx < b.minX || sx > b.maxX || sz < b.minZ || sz > b.maxZ) continue;

                const roofY = buildingRoofYAt(b, sx, sz);
                if (walkerFeetY >= roofY - 1.0) continue;

                const inside = isPointInPolygon && b.pts && b.pts.length > 0
                  ? isPointInPolygon(sx, sz, b.pts)
                  : isInsideBuilding(sx, sz, b);
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

        if (isBlockedByWorld(newX, newZ)) {
          const slideX = isBlockedByWorld(newX, state.walker.z);
          const slideZ = isBlockedByWorld(state.walker.x, newZ);

          if (!slideX) {
            newZ = state.walker.z;
          } else if (!slideZ) {
            newX = state.walker.x;
          } else {
            newX = state.walker.x;
            newZ = state.walker.z;
          }
        }
      }
      if (!isPlanetarySurface() && typeof appCtx.resolveUrbanActorCollision === 'function') {
        const urbanCollision = appCtx.resolveUrbanActorCollision(
          { x: state.walker.x, z: state.walker.z },
          { x: newX, z: newZ },
          { mode: 'walk', radius: .3 }
        );
        newX = urbanCollision.x;
        newZ = urbanCollision.z;
      }
      profileAfterCollision = profileEnabled ? performance.now() : 0;

      state.walker.x = newX;
      state.walker.z = newZ;

      const postGroundState = resolveWalkGroundState(state.walker.x, state.walker.z, state.walker.y, finiteOr);
      state.walker._resolvedGroundState = postGroundState;
      profileAfterFinalSurface = profileEnabled ? performance.now() : 0;
      finalGroundState = postGroundState;
      const targetEyeY = postGroundState.effectiveGroundY + CFG.eyeHeight;
      const snapDownDistance = Math.max(0.3, adjustedSpeed * dt * 0.95 + 0.22);
      const snapUpDistance = CFG.blockStepHeight + 0.12;
      const dropToGround = state.walker.y - targetEyeY;
      const riseToGround = targetEyeY - state.walker.y;

      if (state.walker.vy <= 0) {
        if (dropToGround >= 0 && dropToGround <= snapDownDistance) {
          state.walker.y = targetEyeY;
          state.walker.vy = 0;
          state.walker.onGround = true;
          appCtx.onUrbanParachuteLanded?.();
        } else if (riseToGround >= 0 && riseToGround <= snapUpDistance) {
          state.walker.y = targetEyeY;
          state.walker.vy = 0;
          state.walker.onGround = true;
          appCtx.onUrbanParachuteLanded?.();
        }
      }
      state.walker.onBuilding = postGroundState.onBuilding;
      state.walker.speedMph = worldUnitsPerSecondToMph(
        Math.hypot(state.walker.x - startX, state.walker.z - startZ) / Math.max(0.001, dt),
        appCtx.METERS_PER_WORLD_UNIT
      );
    } else {
      state.walker.speedMph = 0;
    }
    const elapsed = Math.max(0.001, dt);
    state.walker.vx = (state.walker.x - startX) / elapsed;
    state.walker.vz = (state.walker.z - startZ) / elapsed;

    if (state.characterMesh && state.characterMesh.visible) {
      const meshFeetY = state.walker.onGround
        ? finalGroundState.effectiveGroundY + 0.04
        : Math.max(state.walker.y - CFG.eyeHeight, finalGroundState.effectiveGroundY + 0.02);
      state.characterMesh.position.set(state.walker.x, meshFeetY, state.walker.z);
      state.characterMesh.rotation.order = 'YXZ';
      state.characterMesh.rotation.y = state.walker.angle;
      state.characterMesh.rotation.x = skydivingFlight?.bodyPitch || 0;
      state.characterMesh.rotation.z = skydivingFlight ? -skydivingFlight.bank : 0;
      animateCharacterWalk(state.characterMesh, !skydivingFlight && state.walker.speedMph > 0, dt);
    }

    if (profileEnabled) {
      const profile = appCtx.phase5WalkProfile || {
        samples: 0,
        initialSurfaceMs: 0,
        collisionMs: 0,
        finalSurfaceMs: 0,
        presentationMs: 0
      };
      const now = performance.now();
      profile.samples += 1;
      profile.initialSurfaceMs += profileAfterInitialSurface - profileStartedAt;
      profile.collisionMs += Math.max(0, profileAfterCollision - profileAfterInitialSurface);
      profile.finalSurfaceMs += Math.max(0, profileAfterFinalSurface - profileAfterCollision);
      profile.presentationMs += Math.max(0, now - profileAfterFinalSurface);
      appCtx.phase5WalkProfile = profile;
    }

  }

  return {
    resolveWalkGroundState,
    updateWalkPhysics
  };
}

export { createWalkingPhysicsHelpers };
