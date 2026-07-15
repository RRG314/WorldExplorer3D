import { ctx as appCtx } from "../../shared-context.js?v=55";
import {
  PAINTBALL_GRAVITY_MPS2,
  PAINTBALL_LIFETIME_SEC,
  PAINTBALL_MAX_ACTIVE,
  PAINTBALL_RADIUS_M,
  PAINTBALL_SHOT_COOLDOWN_MS,
  PAINTBALL_SPEED_MPS,
  PAINT_SPLAT_LIFETIME_SEC,
  PAINT_SPLAT_MAX_ACTIVE,
  PAINT_SPLAT_RADIUS_M,
  PAINT_TOWN_COLORS,
  PAINT_TOWN_DEFAULT_COLOR
} from "./constants.js?v=1";
import {
  ensurePaintTownState,
  getPaintTownActorState,
  getPaintTownPlayerUid,
  getPaintTownRules,
  normalizePaintColorHex,
  paintColorHexToInt,
  paintColorNameFromHex,
  paintTownAllowsGun,
  paintTownAllowsTouch,
  setPaintTownActiveTool,
  setPaintTownPlayerColor,
  updatePaintTownHud
} from "./core.js?v=1";
import { paintBuildingFromClaim, resolveBuildingKeyFromMesh } from "./claims.js?v=1";

function removePaintballProjectile(projectile) {
  if (!projectile) return;
  if (projectile.mesh?.parent) projectile.mesh.parent.remove(projectile.mesh);
  if (projectile.mesh?.geometry?.dispose) projectile.mesh.geometry.dispose();
  if (projectile.mesh?.material?.dispose) projectile.mesh.material.dispose();
}

export function clearPaintballs() {
  const state = ensurePaintTownState();
  if (!Array.isArray(state.paintballs) || state.paintballs.length === 0) return;
  state.paintballs.forEach((projectile) => removePaintballProjectile(projectile));
  state.paintballs = [];
}

function removePaintSplat(splat) {
  if (!splat) return;
  if (splat.mesh?.parent) splat.mesh.parent.remove(splat.mesh);
  if (splat.mesh?.geometry?.dispose) splat.mesh.geometry.dispose();
  if (splat.mesh?.material?.dispose) splat.mesh.material.dispose();
}

export function clearPaintSplats() {
  const state = ensurePaintTownState();
  if (!Array.isArray(state.paintSplats) || state.paintSplats.length === 0) return;
  state.paintSplats.forEach((splat) => removePaintSplat(splat));
  state.paintSplats = [];
}

function createPaintSplatMesh(colorHex) {
  if (typeof THREE === "undefined") return null;
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(PAINT_SPLAT_RADIUS_M, 12),
    new THREE.MeshBasicMaterial({
      color: paintColorHexToInt(colorHex),
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    })
  );
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.renderOrder = 12;
  mesh.frustumCulled = true;
  return mesh;
}

function spawnPaintSplatAt(point, colorHex) {
  const state = ensurePaintTownState();
  if (!appCtx.scene || !Array.isArray(state.paintSplats)) return;
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;

  const mesh = createPaintSplatMesh(colorHex);
  if (!mesh) return;
  const y = Number.isFinite(point.y) ? point.y : 0;
  mesh.position.set(point.x, y + 0.025, point.z);
  appCtx.scene.add(mesh);

  while (state.paintSplats.length >= PAINT_SPLAT_MAX_ACTIVE) {
    const oldest = state.paintSplats.shift();
    removePaintSplat(oldest);
  }
  state.paintSplats.push({
    mesh,
    lifeSec: PAINT_SPLAT_LIFETIME_SEC,
    maxLifeSec: PAINT_SPLAT_LIFETIME_SEC
  });
}

function updatePaintSplats(dt) {
  const state = ensurePaintTownState();
  if (!Array.isArray(state.paintSplats) || state.paintSplats.length === 0) return;
  for (let i = state.paintSplats.length - 1; i >= 0; i--) {
    const splat = state.paintSplats[i];
    if (!splat || !splat.mesh) {
      state.paintSplats.splice(i, 1);
      continue;
    }
    splat.lifeSec -= dt;
    const lifeRatio = splat.maxLifeSec > 0 ? Math.max(0, Math.min(1, splat.lifeSec / splat.maxLifeSec)) : 0;
    if (splat.mesh.material && typeof splat.mesh.material.opacity === "number") {
      splat.mesh.material.opacity = 0.18 + lifeRatio * 0.54;
    }
    const scale = 0.95 + (1 - lifeRatio) * 0.22;
    splat.mesh.scale.setScalar(scale);
    if (splat.lifeSec <= 0) {
      removePaintSplat(splat);
      state.paintSplats.splice(i, 1);
    }
  }
}

function getPaintTownRaycaster() {
  if (typeof appCtx._getPhysRaycaster === "function") return appCtx._getPhysRaycaster();
  if (typeof THREE !== "undefined") {
    if (!appCtx._paintTownRaycaster) appCtx._paintTownRaycaster = new THREE.Raycaster();
    return appCtx._paintTownRaycaster;
  }
  return null;
}

function getPaintTownRaycastMeshes() {
  if (!Array.isArray(appCtx.buildingMeshes)) return [];
  return appCtx.buildingMeshes.filter((mesh) => mesh && mesh.visible && !mesh.userData?.isBuildingBatch);
}

function projectPaintTownRay(clientX, clientY) {
  if (typeof THREE === "undefined" || !appCtx.camera || !appCtx.renderer) return null;
  const canvas = appCtx.renderer?.domElement;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;

  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = getPaintTownRaycaster();
  if (!raycaster) return null;
  if (typeof appCtx.camera.updateProjectionMatrix === "function") appCtx.camera.updateProjectionMatrix();
  if (typeof appCtx.camera.updateMatrixWorld === "function") appCtx.camera.updateMatrixWorld(true);
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), appCtx.camera);
  return raycaster;
}

function shouldIgnorePaintTownInput(eventTarget) {
  if (!(eventTarget instanceof Element)) return false;
  const blocker = eventTarget.closest(
    "#titleScreen, #roomPanelModal, #largeMap, #propertyPanel, #propertyModal, #historicPanel, #pauseScreen, #resultScreen, #caughtScreen, #flowerChallengePanel, #gameShareMenu, #controlsTab, #settings-menu, #memoryComposer, #memoryPanel, #paintTownHud"
  );
  if (!blocker) return false;
  if (blocker.classList.contains("hidden")) return false;
  if (blocker.hasAttribute("hidden")) return false;
  const style = globalThis.getComputedStyle ? globalThis.getComputedStyle(blocker) : null;
  if (style && (style.display === "none" || style.visibility === "hidden")) return false;
  return true;
}

export function ensurePaintTownInputBindings() {
  const state = ensurePaintTownState();
  if (state.inputBound) return;
  state.inputBound = true;

  const handlePointerDown = (event) => {
    const paintState = ensurePaintTownState();
    if (!paintState.active || appCtx.paused || !appCtx.gameStarted || appCtx.gameMode !== "painttown") return;
    if (appCtx.worldLoading || shouldIgnorePaintTownInput(event.target)) return;
    if (event instanceof MouseEvent && event.button !== 0) return;

    const canTouch = paintTownAllowsTouch();
    const canGun = paintTownAllowsGun();
    const pointerType = String(event.pointerType || "").toLowerCase();
    const isPrimaryTap = pointerType === "touch" || pointerType === "pen" || !(event instanceof MouseEvent) || event.button === 0;
    const useGun = paintState.activeTool === "gun";

    if (!useGun && canTouch && isPrimaryTap) {
      const touched = tryTouchPaintAt(event.clientX, event.clientY);
      if (touched) {
        event.preventDefault();
        return;
      }
    }

    if (canGun && (useGun || !canTouch)) {
      if (firePaintball(event.clientX, event.clientY)) event.preventDefault();
    }
  };

  const handleKeyDown = (event) => {
    const paintState = ensurePaintTownState();
    if (!paintState.active || appCtx.paused || !appCtx.gameStarted || appCtx.gameMode !== "painttown") return;
    if (shouldIgnorePaintTownInput(document.activeElement) || event.repeat) return;

    const key = String(event.key || "").toLowerCase();
    const code = String(event.code || "");
    const isCtrlFireKey = key === "control" || key === "ctrl" || code === "ControlLeft" || code === "ControlRight" || code === "Control";
    if (isCtrlFireKey || key === "g" || key === "p") {
      if (!paintTownAllowsGun()) return;
      const cx = window.innerWidth * 0.5;
      const cy = window.innerHeight * 0.5;
      if (firePaintball(cx, cy)) event.preventDefault();
      return;
    }

    if (key >= "1" && key <= String(Math.min(PAINT_TOWN_COLORS.length, 9))) {
      const choice = PAINT_TOWN_COLORS[Number(key) - 1];
      if (choice) {
        setPaintTownPlayerColor(choice.hex);
        updatePaintTownHud();
        event.preventDefault();
      }
      return;
    }

    if (key === "t") {
      const next = ensurePaintTownState().activeTool === "gun" ? "touch" : "gun";
      setPaintTownActiveTool(next);
      updatePaintTownHud();
      event.preventDefault();
    }
  };

  document.addEventListener("pointerdown", handlePointerDown, { capture: true });
  document.addEventListener("contextmenu", (event) => {
    const paintState = ensurePaintTownState();
    if (!paintState.active || appCtx.gameMode !== "painttown") return;
    if (!paintTownAllowsGun() || shouldIgnorePaintTownInput(event.target)) return;
    event.preventDefault();
  });
  window.addEventListener("keydown", handleKeyDown, { capture: true });
}

function getPaintTownShootOrigin() {
  const actor = getPaintTownActorState();
  if (!actor) return null;
  if (actor.mode === "drone") return { x: actor.x, y: actor.feetY, z: actor.z };
  if (actor.mode === "walking") {
    const eyeHeight = appCtx.Walk?.CFG?.eyeHeight || 1.7;
    return { x: actor.x, y: actor.feetY + eyeHeight * 0.92, z: actor.z };
  }
  return { x: actor.x, y: actor.feetY + 1.25, z: actor.z };
}

function createPaintballMesh(colorHex) {
  if (typeof THREE === "undefined") return null;
  const colorInt = paintColorHexToInt(colorHex);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(PAINTBALL_RADIUS_M, 8, 8),
    new THREE.MeshStandardMaterial({
      color: colorInt,
      emissive: colorInt,
      emissiveIntensity: 0.35,
      roughness: 0.5,
      metalness: 0.05
    })
  );
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

export function firePaintball(clientX, clientY) {
  const state = ensurePaintTownState();
  if (!paintTownAllowsGun()) return false;
  if (Date.now() - Number(state.lastShotAtMs || 0) < PAINTBALL_SHOT_COOLDOWN_MS) return false;

  const raycaster = projectPaintTownRay(clientX, clientY);
  if (!raycaster || !raycaster.ray) return false;
  const origin = getPaintTownShootOrigin();
  if (!origin) return false;

  const dir = raycaster.ray.direction.clone();
  if (dir.lengthSq() <= 0.000001) return false;
  dir.normalize();

  const colorHex = normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const mesh = createPaintballMesh(colorHex);
  if (!mesh || !appCtx.scene) return false;

  mesh.position.set(origin.x + dir.x * 1.8, origin.y + dir.y * 1.8, origin.z + dir.z * 1.8);
  appCtx.scene.add(mesh);

  while (state.paintballs.length >= PAINTBALL_MAX_ACTIVE) {
    const oldest = state.paintballs.shift();
    removePaintballProjectile(oldest);
  }

  state.paintballs.push({
    mesh,
    vel: dir.multiplyScalar(PAINTBALL_SPEED_MPS),
    lifeSec: PAINTBALL_LIFETIME_SEC,
    uid: String(state.multiplayerUid || getPaintTownPlayerUid()),
    colorHex,
    colorName: paintColorNameFromHex(colorHex),
    prev: mesh.position.clone()
  });
  state.lastShotAtMs = Date.now();
  state.lastHint = "Paintball launched.";
  return true;
}

export function tryTouchPaintAt(clientX, clientY) {
  const touchMode = getPaintTownRules().paintTouchMode;
  if (touchMode === "off") return false;
  const raycaster = projectPaintTownRay(clientX, clientY);
  if (!raycaster) return false;

  const meshes = getPaintTownRaycastMeshes();
  if (!meshes.length) return false;
  if (appCtx.scene && typeof appCtx.scene.updateMatrixWorld === "function") appCtx.scene.updateMatrixWorld(true);

  const hits = raycaster.intersectObjects(meshes, true);
  const hit = Array.isArray(hits) ? hits[0] : null;
  if (!hit || !hit.object) return false;

  if (touchMode === "roof" && hit.face && typeof hit.face.normal?.clone === "function") {
    const worldNormal = hit.face.normal.clone();
    if (hit.object.matrixWorld) worldNormal.transformDirection(hit.object.matrixWorld);
    if (Number(worldNormal.y) < 0.45) {
      const state = ensurePaintTownState();
      state.lastHint = "Roof-only mode: tap a rooftop surface.";
      updatePaintTownHud();
      return false;
    }
  }

  const key = resolveBuildingKeyFromMesh(hit.object, hit.point || null);
  if (!key) return false;
  const state = ensurePaintTownState();
  const colorHex = normalizePaintColorHex(state.playerColorHex, PAINT_TOWN_DEFAULT_COLOR.hex);
  const method = touchMode === "roof" ? "touch-roof" : "touch-any";
  const painted = paintBuildingFromClaim({
    key,
    colorHex,
    colorName: paintColorNameFromHex(colorHex),
    uid: String(state.multiplayerUid || getPaintTownPlayerUid()),
    method
  }, { publish: true });
  if (painted) {
    state.lastHint = `Painted ${state.paintedBuildings}/${state.totalBuildings}.`;
    updatePaintTownHud();
  }
  return painted;
}

export function updatePaintballProjectiles(dt) {
  const state = ensurePaintTownState();
  updatePaintSplats(dt);
  if (!Array.isArray(state.paintballs) || state.paintballs.length === 0) return;

  const meshes = getPaintTownRaycastMeshes();
  const raycaster = getPaintTownRaycaster();
  const gravityStep = PAINTBALL_GRAVITY_MPS2 * dt;
  if (appCtx.scene && typeof appCtx.scene.updateMatrixWorld === "function") appCtx.scene.updateMatrixWorld(true);

  for (let i = state.paintballs.length - 1; i >= 0; i--) {
    const shot = state.paintballs[i];
    if (!shot || !shot.mesh) {
      state.paintballs.splice(i, 1);
      continue;
    }

    const prev = shot.mesh.position.clone();
    shot.vel.y -= gravityStep;
    shot.mesh.position.x += shot.vel.x * dt;
    shot.mesh.position.y += shot.vel.y * dt;
    shot.mesh.position.z += shot.vel.z * dt;
    shot.lifeSec -= dt;

    let consumed = false;
    if (raycaster && meshes.length > 0) {
      const next = shot.mesh.position;
      const dir = next.clone().sub(prev);
      const dist = dir.length();
      if (dist > 0.0001) {
        dir.normalize();
        raycaster.set(prev, dir);
        const hits = raycaster.intersectObjects(meshes, true);
        const hit = Array.isArray(hits) ? hits.find((entry) => Number(entry.distance) <= dist + PAINTBALL_RADIUS_M) : null;
        if (hit && hit.object) {
          const key = resolveBuildingKeyFromMesh(hit.object, hit.point || next);
          if (key) {
            const painted = paintBuildingFromClaim({
              key,
              colorHex: shot.colorHex,
              colorName: shot.colorName,
              uid: String(shot.uid || state.multiplayerUid || getPaintTownPlayerUid()),
              method: "gun"
            }, { publish: true });
            if (painted) {
              state.lastHint = `Paintball hit! ${state.paintedBuildings}/${state.totalBuildings}.`;
              updatePaintTownHud();
            }
          }
          consumed = true;
        }
      }
    }

    if (!consumed) {
      let terrainY = -Infinity;
      if (typeof appCtx.terrainMeshHeightAt === "function") {
        const height = appCtx.terrainMeshHeightAt(shot.mesh.position.x, shot.mesh.position.z);
        if (Number.isFinite(height)) terrainY = height;
      }
      if (!Number.isFinite(terrainY) && typeof appCtx.elevationWorldYAtWorldXZ === "function") {
        const height = appCtx.elevationWorldYAtWorldXZ(shot.mesh.position.x, shot.mesh.position.z);
        if (Number.isFinite(height)) terrainY = height;
      }
      if (Number.isFinite(terrainY) && shot.mesh.position.y <= terrainY + 0.1) {
        spawnPaintSplatAt({ x: shot.mesh.position.x, y: terrainY, z: shot.mesh.position.z }, shot.colorHex);
        consumed = true;
      }
    }

    if (consumed || shot.lifeSec <= 0 || !Number.isFinite(shot.mesh.position.y) || shot.mesh.position.y < -1000) {
      removePaintballProjectile(shot);
      state.paintballs.splice(i, 1);
    }
  }
}
