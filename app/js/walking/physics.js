import { ctx as appCtx } from "../shared-context.js?v=55";

function wrapYaw(angle = 0) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function isPlanetarySurface() {
  return !!(appCtx.onMoon || appCtx.onMars);
}

function getPlanetarySurfaceMesh() {
  if (appCtx.onMars && appCtx.marsSurface) return appCtx.marsSurface;
  if (appCtx.onMoon && appCtx.moonSurface) return appCtx.moonSurface;
  return null;
}

function createWalkingPhysicsHelpers({
  CFG,
  animateCharacterWalk,
  getBuildingsArray,
  getNearbyBuildings,
  getWalkGroundY,
  isPointInPolygon,
  keys,
  state,
  syncWalkTerrain
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
      if (nearby && nearby.length > 0) return nearby;
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
    const planetarySurface = getPlanetarySurfaceMesh();
    if (planetarySurface) {
      const raycaster = appCtx._getPhysRaycaster();
      appCtx._physRayStart.set(x, 2200, z);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = raycaster.intersectObject(planetarySurface, false);
      groundY = hits.length > 0 ? hits[0].point.y : -100;
    } else {
      groundY = getWalkGroundY(x, z, -100);
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
    syncWalkTerrain(false);
    const startX = finiteOr(state.walker.x, 0);
    const startZ = finiteOr(state.walker.z, 0);
    const actions = appCtx.readControlActions?.('walk') || {};
    const speed = Number(actions.sprint) > 0.05 ? CFG.runSpeed : CFG.walkSpeed;
    const lookSpeed = 2.5 * dt;

    state.walker.yaw += (Number(actions.turn) || 0) * CFG.turnSpeed * dt;
    state.walker.lookYawOffset += (Number(actions.lookYaw) || 0) * lookSpeed;
    state.walker.pitch += (Number(actions.lookPitch) || 0) * lookSpeed;

    state.walker.lookYawOffset = wrapYaw(state.walker.lookYawOffset);
    state.walker.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, state.walker.pitch));
    state.walker.angle = state.walker.yaw;

    const forward = Number(actions.move) || 0;
    const gravity = appCtx.onMoon ? -1.62 : appCtx.onMars ? -3.71 : -9.80665;
    const jumpVelocity = appCtx.onMoon ? 3.0 : appCtx.onMars ? 4.0 : 5.0;

    const initialGroundState = resolveWalkGroundState(state.walker.x, state.walker.z, state.walker.y, finiteOr);
    let groundY = initialGroundState.groundY;

    if (state.walker.y === undefined || state.walker.y === 0) {
      state.walker.y = groundY + 1.7;
    }

    const groundState = resolveWalkGroundState(state.walker.x, state.walker.z, state.walker.y, finiteOr);
    groundY = groundState.groundY;
    let effectiveGroundY = groundState.effectiveGroundY;
    state.walker.onBuilding = groundState.onBuilding;
    state.walker.onGround = Math.abs(state.walker.y - (effectiveGroundY + CFG.eyeHeight)) < 0.3;

    if (state.walker.wallJumpTimer > 0) {
      state.walker.wallJumpTimer -= dt;
    }

    if (Number(actions.jump) > 0.05 && state.walker.onGround) {
      state.walker.vy = jumpVelocity;
      state.walker.onGround = false;
    }

    if (Number(actions.jump) > 0.05 && !state.walker.onGround && state.walker.wallJumpTimer <= 0 && !isPlanetarySurface()) {
      const wall = findNearestWall(state.walker.x, state.walker.z);
      if (wall && state.walker.y - CFG.eyeHeight < buildingRoofYAt(wall.building, wall.pointX, wall.pointZ) + 0.35) {
        state.walker.vy = CFG.wallJumpVelocity;
        state.walker.x += wall.nx * CFG.wallJumpOutward;
        state.walker.z += wall.nz * CFG.wallJumpOutward;
        state.walker.wallJumpTimer = CFG.wallJumpCooldown;
      }
    }

    state.walker.vy += gravity * dt;
    state.walker.y += state.walker.vy * dt;

    if (state.walker.y <= effectiveGroundY + CFG.eyeHeight) {
      state.walker.y = effectiveGroundY + CFG.eyeHeight;
      state.walker.vy = 0;
      state.walker.onGround = true;
    }

    const speedMultiplier = appCtx.onMoon ? 0.6 : appCtx.onMars ? 0.72 : 1.0;
    const adjustedSpeed = speed * speedMultiplier;

    if (forward !== 0) {
      const moveX = Math.sin(state.walker.angle) * forward * adjustedSpeed * dt;
      const moveZ = Math.cos(state.walker.angle) * forward * adjustedSpeed * dt;

      let newX = state.walker.x + moveX;
      let newZ = state.walker.z + moveZ;

      const checkBuildings = !isPlanetarySurface() && (getBuildingsArray || getNearbyBuildings);
      const checkBuildBlocks = typeof appCtx.getBuildCollisionAtWorldXZ === "function";
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
          for (let s = 0; s < collisionSamples.length; s += 1) {
            const sample = collisionSamples[s];
            const sx = px + sample[0];
            const sz = pz + sample[1];

            if (checkBuildings) {
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

      state.walker.x = newX;
      state.walker.z = newZ;

      const postGroundState = resolveWalkGroundState(state.walker.x, state.walker.z, state.walker.y, finiteOr);
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
        } else if (riseToGround >= 0 && riseToGround <= snapUpDistance) {
          state.walker.y = targetEyeY;
          state.walker.vy = 0;
          state.walker.onGround = true;
        }
      }
      state.walker.onBuilding = postGroundState.onBuilding;
      state.walker.speedMph = adjustedSpeed * 0.68;
    } else {
      state.walker.speedMph = 0;
    }
    const elapsed = Math.max(0.001, dt);
    state.walker.vx = (state.walker.x - startX) / elapsed;
    state.walker.vz = (state.walker.z - startZ) / elapsed;

    if (state.characterMesh && state.characterMesh.visible) {
      const meshGroundState = resolveWalkGroundState(state.walker.x, state.walker.z, state.walker.y, finiteOr);
      const meshFeetY = state.walker.onGround
        ? meshGroundState.effectiveGroundY + 0.04
        : Math.max(state.walker.y - CFG.eyeHeight, meshGroundState.effectiveGroundY + 0.02);
      state.characterMesh.position.set(state.walker.x, meshFeetY, state.walker.z);
      state.characterMesh.rotation.y = state.walker.angle;
      animateCharacterWalk(state.characterMesh, state.walker.speedMph > 0, dt);
    }

    syncWalkTerrain(false);
  }

  return {
    resolveWalkGroundState,
    updateWalkPhysics
  };
}

export { createWalkingPhysicsHelpers };
