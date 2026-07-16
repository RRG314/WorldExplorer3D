import { ctx as appCtx } from "../shared-context.js?v=55";

function createWalkingRuntimeHelpers({
  CFG,
  camera,
  car,
  carMesh,
  clampPointInsideFootprint,
  createCharacterMesh,
  finiteOr,
  getSafeDriveY,
  getWalkGroundY,
  pointInPolygonSafe,
  resolveWalkGroundState,
  scene,
  state,
  syncCarFromWalker,
  syncWalkTerrain,
  syncWalkerFromCar
}) {
  function setModeWalk(options = {}) {
    if (appCtx.boatMode?.active && !appCtx.boatMode?.manualExitPending) {
      if (typeof appCtx.setTravelMode === "function") {
        appCtx.setTravelMode("walk", { source: "walk_mode_direct" });
      }
      return;
    }

    state.mode = "walk";
    state.walker.lookYawOffset = 0;
    let appliedSafeWalkSpawn = options.preserveResolvedSpawn === true;
    if (!appliedSafeWalkSpawn && typeof appCtx.resolveSafeWorldSpawn === "function" && typeof appCtx.applyResolvedWorldSpawn === "function") {
      const safeWalkSpawn = appCtx.resolveSafeWorldSpawn(
        finiteOr(car.x, state.walker.x),
        finiteOr(car.z, state.walker.z),
        {
          mode: "walk",
          angle: finiteOr(car.angle, state.walker.angle),
          feetY: finiteOr(car.y, 1.2) - 1.2,
          source: "walk_mode_switch"
        }
      );
      appCtx.applyResolvedWorldSpawn(safeWalkSpawn, {
        mode: "walk",
        syncCar: true,
        syncWalker: true
      });
      appliedSafeWalkSpawn = true;
    }
    if (!appliedSafeWalkSpawn) syncWalkerFromCar();
    if (options.deferWorldSync !== true) {
      syncWalkTerrain(true);
      if (typeof appCtx.requestWorldSurfaceSync === "function") {
        appCtx.requestWorldSurfaceSync({ force: true, source: "set_mode_walk" });
      } else if (typeof appCtx.repositionBuildingsWithTerrain === "function") {
        appCtx.repositionBuildingsWithTerrain();
      }
    }

    if (carMesh) {
      carMesh.visible = false;
    }
    if (!state.characterMesh) {
      state.characterMesh = createCharacterMesh();
    }

    if (state.characterMesh) {
      const terrainY = options.preserveResolvedSurface === true ?
        state.walker.y - CFG.eyeHeight :
        getWalkGroundY(state.walker.x, state.walker.z, car.y - 1.7);
      state.walker.y = terrainY + 1.7;
      state.walker.vy = 0;
      state.characterMesh.visible = state.view !== "first";
      state.characterMesh.position.set(state.walker.x, terrainY, state.walker.z);
      state.characterMesh.rotation.y = state.walker.angle;
      if (options.deferWorldSync !== true) {
        syncWalkTerrain(true);
        if (typeof appCtx.requestWorldSurfaceSync === "function") {
          appCtx.requestWorldSurfaceSync({ force: true, source: "set_mode_walk_character" });
        } else if (typeof appCtx.repositionBuildingsWithTerrain === "function") {
          appCtx.repositionBuildingsWithTerrain();
        }
      }
    } else {
      console.error("ERROR: Character mesh is still null after creation!");
    }
  }

  function setModeDrive() {
    if (appCtx.boatMode?.active && !appCtx.boatMode?.manualExitPending) {
      if (typeof appCtx.setTravelMode === "function") {
        appCtx.setTravelMode("drive", { source: "drive_mode_direct" });
      }
      return;
    }

    const wasWalk = state.mode === "walk";
    state.mode = "drive";
    let resolvedDriveSpawn = null;
    if (typeof appCtx.resolveSafeWorldSpawn === "function" && typeof appCtx.applyResolvedWorldSpawn === "function") {
      const targetX = wasWalk ? finiteOr(state.walker.x, car.x) : finiteOr(car.x, state.walker.x);
      const targetZ = wasWalk ? finiteOr(state.walker.z, car.z) : finiteOr(car.z, state.walker.z);
      const targetAngle = wasWalk ? finiteOr(state.walker.angle, car.angle) : finiteOr(car.angle, state.walker.angle);
      const walkerFeetY = finiteOr(state.walker.y, 0) - CFG.eyeHeight;
      resolvedDriveSpawn = appCtx.resolveSafeWorldSpawn(targetX, targetZ, {
        mode: "drive",
        angle: targetAngle,
        feetY: wasWalk ? walkerFeetY : finiteOr(car.y, 1.2) - 1.2,
        source: "drive_mode_switch"
      });
      appCtx.applyResolvedWorldSpawn(resolvedDriveSpawn, {
        mode: "drive",
        syncCar: true,
        syncWalker: true
      });
    } else if (wasWalk) {
      syncCarFromWalker();
    } else {
      syncWalkerFromCar();
    }

    car.x = finiteOr(car.x, finiteOr(state.walker.x, 0));
    car.z = finiteOr(car.z, finiteOr(state.walker.z, 0));
    car.angle = finiteOr(car.angle, finiteOr(state.walker.angle, 0));
    const fallbackY = finiteOr(car.y, 1.2);
    car.y = resolvedDriveSpawn && Number.isFinite(resolvedDriveSpawn.carY)
      ? resolvedDriveSpawn.carY
      : getSafeDriveY(car.x, car.z, fallbackY);
    if (carMesh) {
      carMesh.visible = true;
      if (scene && carMesh.parent !== scene) scene.add(carMesh);
      carMesh.position.set(car.x, car.y, car.z);
      carMesh.rotation.y = car.angle;
      carMesh.updateMatrixWorld(true);
    }
    appCtx.setCameraMode(0);
    if (state.characterMesh) state.characterMesh.visible = false;
    window.walkMouseLookActive = false;
  }

  function toggleWalk() {
    if (!state.enabled) return;
    if (state.mode === "walk") setModeDrive();
    else setModeWalk();
  }

  function toggleView() {
    if (state.view === "third") {
      state.view = "first";
    } else if (state.view === "first") {
      state.view = "overhead";
    } else {
      state.view = "third";
    }

    if (state.characterMesh) {
      state.characterMesh.visible = state.view !== "first";
    }
  }

  function updateWalkCamera() {
    if (state.mode !== "walk") {
      return false;
    }

    const cameraYaw = state.walker.yaw + (Number(state.walker.lookYawOffset) || 0);

    if (state.view === "first") {
      const y = state.walker.y;
      camera.position.set(state.walker.x, y, state.walker.z);

      const lookDistance = 10;
      const lookX = state.walker.x + Math.sin(cameraYaw) * Math.cos(state.walker.pitch) * lookDistance;
      const lookY = y + Math.sin(state.walker.pitch) * lookDistance;
      const lookZ = state.walker.z + Math.cos(cameraYaw) * Math.cos(state.walker.pitch) * lookDistance;

      camera.lookAt(lookX, lookY, lookZ);
      return true;
    }

    if (state.view === "overhead") {
      const terrainY = getWalkGroundY(state.walker.x, state.walker.z, 0);
      const height = 45;
      const offsetBack = 8;

      camera.position.set(
        state.walker.x - Math.sin(cameraYaw) * offsetBack,
        terrainY + height,
        state.walker.z - Math.cos(cameraYaw) * offsetBack
      );

      const lookAhead = 15;
      camera.lookAt(
        state.walker.x + Math.sin(cameraYaw) * lookAhead,
        terrainY,
        state.walker.z + Math.cos(cameraYaw) * lookAhead
      );
      return true;
    }

    const activeInterior = appCtx.activeInterior || null;
    const interiorFootprint = Array.isArray(activeInterior?.usableFootprint) ? activeInterior.usableFootprint : null;
    const interiorCamera = !!(activeInterior && interiorFootprint && interiorFootprint.length >= 3);
    const baseY = state.walker.y;
    const back = interiorCamera ? Math.min(1.05, CFG.thirdPersonDist * 0.24) : CFG.thirdPersonDist;
    const up = interiorCamera ? Math.min(0.78, CFG.thirdPersonHeight * 0.34) : CFG.thirdPersonHeight;
    const pitchBackScale = Math.max(0.46, Math.cos(state.walker.pitch));
    const camX = state.walker.x - Math.sin(cameraYaw) * pitchBackScale * back;
    const camZ = state.walker.z - Math.cos(cameraYaw) * pitchBackScale * back;
    const camY = baseY + up - Math.sin(state.walker.pitch) * back * 0.42;

    let resolvedCamX = camX;
    let resolvedCamZ = camZ;
    if (interiorCamera && !pointInPolygonSafe(camX, camZ, interiorFootprint)) {
      const clamped = clampPointInsideFootprint(camX, camZ, interiorFootprint, 0.42);
      resolvedCamX = clamped.x;
      resolvedCamZ = clamped.z;
    }

    camera.position.set(resolvedCamX, camY, resolvedCamZ);

    if (state.characterMesh && state.view === "third") {
      state.characterMesh.visible = state.walker.pitch < 0.98;
    }

    const lookAhead = interiorCamera ? Math.min(1.45, CFG.thirdPersonLookAhead * 0.24) : CFG.thirdPersonLookAhead;
    const lookX = state.walker.x + Math.sin(cameraYaw) * Math.cos(state.walker.pitch) * lookAhead;
    const lookY = baseY - CFG.eyeHeight + 1.2 + Math.sin(state.walker.pitch) * lookAhead * 0.5;
    const lookZ = state.walker.z + Math.cos(cameraYaw) * Math.cos(state.walker.pitch) * lookAhead;

    camera.lookAt(lookX, lookY, lookZ);
    return true;
  }

  function getMapRefPosition(droneMode, drone) {
    if (appCtx.planeMode?.active) return { x: appCtx.planeMode.x, z: appCtx.planeMode.z };
    if (droneMode) return { x: drone.x, z: drone.z };
    if (state.mode === "walk") return { x: state.walker.x, z: state.walker.z };
    return { x: car.x, z: car.z };
  }

  return {
    getMapRefPosition,
    setModeDrive,
    setModeWalk,
    toggleView,
    toggleWalk,
    updateWalkCamera
  };
}

export { createWalkingRuntimeHelpers };
