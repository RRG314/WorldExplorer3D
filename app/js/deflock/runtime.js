import { ctx as appCtx } from "../shared-context.js?v=55";
import { DEFLOCK_SOURCE_VERSION, loadSurveillanceFeatures } from "./source.js?v=2";
import { computeCameraPlacement } from "./placement.js?v=1";
import {
  applySharedDisabled,
  createDeFlockState,
  markDiscovered,
  markVirtuallyDisabled,
  progressSnapshot,
  readLocalProgress,
  writeLocalProgress
} from "./state.js?v=1";

const DISCOVERY_RADIUS = 55;
const INTERACTION_RADIUS = 10;
const DETECTION_RANGE = 70;
const DETECTION_HALF_ANGLE = 35;
const DETECTION_COOLDOWN_MS = 5000;
const STATE_COLORS = Object.freeze({
  undiscovered: 0xf43f5e,
  discovered: 0xfbbf24,
  disabled: 0x22d3ee
});

let activeSession = null;
let sessionGeneration = 0;
let multiplayerModulePromise = null;

function ensureMultiplayerModule() {
  if (!multiplayerModulePromise) {
    multiplayerModulePromise = import("./multiplayer.js?v=1").catch((error) => {
      multiplayerModulePromise = null;
      throw error;
    });
  }
  return multiplayerModulePromise;
}

function locationSnapshot() {
  const location = appCtx.LOC || appCtx.customLoc || {};
  return {
    lat: Number(location.lat) || 0,
    lon: Number(location.lon) || 0,
    name: String(
      appCtx.selLoc === "custom"
        ? appCtx.customLoc?.name || "Custom location"
        : appCtx.LOCS?.[appCtx.selLoc]?.name || location.name || "Earth location"
    ).slice(0, 80)
  };
}

function isEarthRuntime() {
  return !appCtx.onMoon && !appCtx.onMars && !appCtx.spaceFlight?.active && !appCtx.oceanMode?.active;
}

function roomCode() {
  return String(appCtx.multiplayerMapRooms?.currentRoomCode || "").trim().toUpperCase();
}

function ui() {
  return {
    hud: document.getElementById("deFlockHud"),
    counts: document.getElementById("deFlockCounts"),
    timer: document.getElementById("deFlockTimer"),
    status: document.getElementById("deFlockStatus"),
    prompt: document.getElementById("deFlockPrompt"),
    help: document.getElementById("deFlockHelp"),
    helpOpen: document.getElementById("deFlockHelpOpen"),
    helpClose: document.getElementById("deFlockHelpClose")
  };
}

function formatTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function setStatus(session, message, tone = "neutral") {
  if (!session) return;
  session.message = String(message || "");
  session.messageTone = tone;
  const refs = ui();
  if (refs.status) {
    refs.status.textContent = session.message;
    refs.status.dataset.tone = tone;
  }
}

function showHud(visible) {
  const refs = ui();
  refs.hud?.classList.toggle("show", visible);
  if (!visible) {
    refs.prompt?.classList.remove("show");
    refs.help?.classList.remove("show");
  }
}

function cameraState(state, sourceId) {
  if (state.disabled.has(sourceId)) return "disabled";
  if (state.discovered.has(sourceId)) return "discovered";
  return "undiscovered";
}

function readActorPosition() {
  const actor = appCtx.activeTransportActor?.();
  if (!actor || actor.mode === "ocean" || actor.mode === "rocket") return null;
  const { x, y, z } = actor.position || {};
  return [x, y, z].every(Number.isFinite) ? { x, y, z, mode: actor.mode } : null;
}

function disposeObject(object) {
  if (!object) return;
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
  object.parent?.remove?.(object);
}

function createCameraLayer(session) {
  if (!globalThis.THREE || !appCtx.scene || !session?.state?.features?.length) return null;
  const THREE = globalThis.THREE;
  const count = session.state.features.length;
  const group = new THREE.Group();
  group.name = "DeFlockCameraLayer";
  group.userData.deFlockLayer = true;

  const pole = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.09, 0.12, 3, 6),
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.72, metalness: 0.28 }),
    count
  );
  const camera = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.62, 0.38, 0.92),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    count
  );
  const lensGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12);
  lensGeometry.rotateX(Math.PI / 2);
  const lens = new THREE.InstancedMesh(
    lensGeometry,
    new THREE.MeshBasicMaterial({ color: 0x0f172a }),
    count
  );
  const target = new THREE.InstancedMesh(
    new THREE.TorusGeometry(0.75, 0.08, 6, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.78 }),
    count
  );
  target.geometry.rotateX(Math.PI / 2);

  const directed = session.state.features.filter((feature) => Number.isFinite(feature.direction));
  let zones = null;
  if (directed.length > 0) {
    const halfWidth = Math.tan(DETECTION_HALF_ANGLE * Math.PI / 180) * DETECTION_RANGE;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, 0,
      -halfWidth, 0, -DETECTION_RANGE,
      halfWidth, 0, -DETECTION_RANGE
    ], 3));
    geometry.computeVertexNormals();
    zones = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({
        color: 0xf43f5e,
        transparent: true,
        opacity: 0.085,
        side: THREE.DoubleSide,
        depthWrite: false
      }),
      directed.length
    );
    zones.renderOrder = 2;
    zones.userData.gameplayApproximation = true;
    group.add(zones);
  }

  pole.frustumCulled = false;
  camera.frustumCulled = false;
  lens.frustumCulled = false;
  target.frustumCulled = false;
  pole.name = "DeFlockPoles";
  camera.name = "DeFlockCameraBodies";
  lens.name = "DeFlockCameraLenses";
  target.name = "DeFlockTargets";
  group.add(pole, camera, lens, target);
  appCtx.scene.add(group);
  session.render = { group, pole, camera, lens, target, zones, directed };
  refreshPlacements(session, true);
  refreshInstanceColors(session);
  return group;
}

function refreshPlacements(session, force = false) {
  const render = session?.render;
  const state = session?.state;
  if (!render || !state || !globalThis.THREE) return false;
  const THREE = globalThis.THREE;
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  let changed = false;
  let directedIndex = 0;

  state.features.forEach((feature, index) => {
    const placement = computeCameraPlacement(feature, {
      geoToWorld: appCtx.geoToWorld,
      terrainAt: (x, z) => appCtx.SurfaceQuery?.terrainAt?.(x, z)
    });
    if (!placement) return;
    if (force || Math.hypot((feature.x ?? Infinity) - placement.x, (feature.z ?? Infinity) - placement.z) > 0.25 || Math.abs((feature.groundY ?? Infinity) - placement.groundY) > 0.25) {
      changed = true;
    }
    feature.x = placement.x;
    feature.z = placement.z;
    feature.groundY = placement.groundY;
    const bearing = placement.bearingRadians;
    // Earth compass bearings increase clockwise from north (-Z), while
    // Three.js positive Y rotations turn counter-clockwise when viewed above.
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -bearing);

    position.set(feature.x, feature.groundY + 1.5, feature.z);
    matrix.compose(position, new THREE.Quaternion(), scale);
    render.pole.setMatrixAt(index, matrix);

    position.set(feature.x, feature.groundY + 3.15, feature.z);
    matrix.compose(position, quaternion, scale);
    render.camera.setMatrixAt(index, matrix);

    position.set(
      feature.x + Math.sin(bearing) * 0.5,
      feature.groundY + 3.15,
      feature.z - Math.cos(bearing) * 0.5
    );
    matrix.compose(position, quaternion, scale);
    render.lens.setMatrixAt(index, matrix);

    position.set(feature.x, feature.groundY + 0.12, feature.z);
    matrix.compose(position, new THREE.Quaternion(), scale);
    render.target.setMatrixAt(index, matrix);

    if (Number.isFinite(feature.direction) && render.zones) {
      position.set(feature.x, feature.groundY + 0.16, feature.z);
      matrix.compose(position, quaternion, scale);
      render.zones.setMatrixAt(directedIndex++, matrix);
    }
  });
  [render.pole, render.camera, render.lens, render.target, render.zones].filter(Boolean).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.();
  });
  if (changed) publishMapMarkers(session);
  return changed;
}

function refreshInstanceColors(session) {
  const render = session?.render;
  const state = session?.state;
  if (!render || !state || !globalThis.THREE) return;
  const color = new globalThis.THREE.Color();
  state.features.forEach((feature, index) => {
    const value = STATE_COLORS[cameraState(state, feature.sourceId)];
    color.setHex(value);
    render.camera.setColorAt(index, color);
    render.target.setColorAt(index, color);
  });
  if (render.camera.instanceColor) render.camera.instanceColor.needsUpdate = true;
  if (render.target.instanceColor) render.target.instanceColor.needsUpdate = true;
}

function publishMapMarkers(session) {
  if (!session?.state) {
    appCtx.deFlockMapMarkers = [];
    return;
  }
  const state = session.state;
  let nearest = null;
  const actor = readActorPosition();
  state.features.forEach((feature) => {
    if (state.disabled.has(feature.sourceId)) return;
    const distance = actor ? Math.hypot(feature.x - actor.x, feature.z - actor.z) : Infinity;
    if (!nearest || distance < nearest.distance) nearest = { sourceId: feature.sourceId, distance };
  });
  appCtx.deFlockMapMarkers = state.features.map((feature) => ({
    sourceId: feature.sourceId,
    lat: feature.lat,
    lon: feature.lon,
    x: feature.x,
    z: feature.z,
    state: cameraState(state, feature.sourceId),
    objective: nearest?.sourceId === feature.sourceId,
    cameraType: feature.cameraType,
    surveillanceType: feature.surveillanceType,
    direction: feature.direction,
    operator: feature.operator,
    manufacturer: feature.manufacturer,
    sourceDataset: feature.sourceDataset,
    sourceTimestamp: feature.sourceTimestamp,
    license: feature.provenance?.license || "ODbL-1.0"
  }));
}

function renderHud(session) {
  if (!session?.state) return;
  const refs = ui();
  const snapshot = progressSnapshot(session.state);
  if (refs.counts) refs.counts.textContent = `${snapshot.disabled}/${snapshot.total} virtually disabled • ${snapshot.discovered} discovered • ${snapshot.score} pts`;
  if (refs.timer) refs.timer.textContent = formatTime(snapshot.elapsedMs);
  if (refs.status && refs.status.textContent !== session.message) {
    refs.status.textContent = session.message || "Explore the mapped area and approach a virtual camera.";
    refs.status.dataset.tone = session.messageTone || "neutral";
  }
  refs.hud?.classList.add("show");
}

function detectionContains(feature, actor) {
  if (!Number.isFinite(feature.direction)) return false;
  const dx = actor.x - feature.x;
  const dz = actor.z - feature.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= INTERACTION_RADIUS || distance > DETECTION_RANGE) return false;
  const bearingToActor = ((Math.atan2(dx, -dz) * 180 / Math.PI) + 360) % 360;
  const delta = Math.abs((((bearingToActor - feature.direction) + 540) % 360) - 180);
  return delta <= DETECTION_HALF_ANGLE;
}

function updateNearbyState(session, actor) {
  const state = session.state;
  let nearest = null;
  let visualChanged = false;
  for (const feature of state.features) {
    const distance = Math.hypot(feature.x - actor.x, feature.z - actor.z);
    if (distance <= DISCOVERY_RADIUS) visualChanged = markDiscovered(state, feature.sourceId) || visualChanged;
    if (distance <= INTERACTION_RADIUS && (!nearest || distance < nearest.distance)) nearest = { feature, distance };
    if (!state.disabled.has(feature.sourceId) && detectionContains(feature, actor) && Date.now() - state.lastDetectionAt > DETECTION_COOLDOWN_MS) {
      state.lastDetectionAt = Date.now();
      state.detections += 1;
      setStatus(session, "Virtual detection zone entered — gameplay penalty applied.", "alert");
    }
  }
  if (visualChanged) {
    refreshInstanceColors(session);
    publishMapMarkers(session);
    if (!session.roomCode) writeLocalProgress(state);
  }
  session.nearby = nearest;
  const prompt = ui().prompt;
  if (!prompt) return;
  if (!nearest) {
    prompt.classList.remove("show");
    return;
  }
  const status = cameraState(state, nearest.feature.sourceId);
  const operator = nearest.feature.operator ? ` • ${nearest.feature.operator}` : "";
  prompt.textContent = status === "disabled"
    ? `Virtual camera already disabled${operator}`
    : `Press E / Action to DeFlock virtual camera${operator}`;
  prompt.classList.add("show");
}

function updateTravelDistance(state, actor) {
  if (!state.lastActorPosition) {
    state.lastActorPosition = { x: actor.x, z: actor.z };
    return;
  }
  const distance = Math.hypot(actor.x - state.lastActorPosition.x, actor.z - state.lastActorPosition.z);
  if (distance < 250) state.distance += distance;
  state.lastActorPosition = { x: actor.x, z: actor.z };
}

function clearRoomListener(session) {
  if (typeof session?.unsubRoom === "function") session.unsubRoom();
  if (session) session.unsubRoom = null;
}

function resetProgressForAuthority(session, nextRoomCode) {
  const state = session.state;
  state.discovered.clear();
  state.disabled.clear();
  state.disabledBy.clear();
  state.completedAt = null;
  state.status = state.features.length ? "ready" : "empty";
  if (!nextRoomCode) {
    const local = readLocalProgress(state.location, state.sourceVersion);
    const restored = createDeFlockState(state.features, {
      sourceVersion: state.sourceVersion,
      location: state.location,
      persisted: local
    });
    session.state = restored;
  }
  refreshInstanceColors(session);
  publishMapMarkers(session);
}

function syncRoomAuthority(session) {
  const nextRoomCode = roomCode();
  if (session.roomCode === nextRoomCode) return;
  clearRoomListener(session);
  resetProgressForAuthority(session, nextRoomCode);
  session.roomCode = nextRoomCode;
  if (!nextRoomCode) {
    setStatus(session, "Single-player progress is saved on this device.");
    return;
  }
  setStatus(session, `Shared DeFlock progress is synchronized in room ${nextRoomCode}.`);
  const expectedRoomCode = nextRoomCode;
  void ensureMultiplayerModule().then(({ listenDeFlockRoomState }) => {
    if (activeSession !== session || session.roomCode !== expectedRoomCode) return;
    session.unsubRoom = listenDeFlockRoomState(expectedRoomCode, (entries) => {
      if (activeSession !== session || session.roomCode !== expectedRoomCode) return;
      if (applySharedDisabled(session.state, entries)) {
        refreshInstanceColors(session);
        publishMapMarkers(session);
      }
    }, {
      onError: () => setStatus(session, "Shared progress is reconnecting; visible state was kept.", "alert")
    });
  }).catch(() => setStatus(session, "Shared progress could not start. Single-player Earth play remains available.", "alert"));
}

function completeIfNeeded(session) {
  const state = session.state;
  if (state.features.length <= 0 || state.disabled.size < state.features.length || session.resultShown) return;
  session.resultShown = true;
  const snapshot = progressSnapshot(state);
  if (!session.roomCode) writeLocalProgress(state);
  if (!session.scoreSubmitted && typeof appCtx.submitDeFlockScore === "function") {
    session.scoreSubmitted = true;
    void appCtx.submitDeFlockScore({
      score: snapshot.score,
      timeMs: snapshot.elapsedMs,
      disabledCameras: snapshot.disabled,
      totalCameras: snapshot.total,
      detections: snapshot.detections,
      distance: snapshot.distance,
      location: snapshot.location.name,
      mode: appCtx.currentTransportMode?.() || "driving",
      completedAt: new Date().toISOString()
    });
  }
  appCtx.showResult?.(
    "Area DeFlocked",
    `${snapshot.disabled} virtual cameras • ${formatTime(snapshot.elapsedMs)} • ${snapshot.score} points • ${Math.round(snapshot.distance)}m traveled`
  );
}

async function interactWithNearbyCamera(session = activeSession) {
  if (!session?.state || appCtx.gameMode !== "deflock" || session.pendingInteraction) return false;
  const target = session.nearby?.feature;
  if (!target) {
    setStatus(session, "Move closer to a mapped virtual camera to interact.");
    return true;
  }
  if (session.state.disabled.has(target.sourceId)) {
    setStatus(session, "That virtual camera is already disabled.");
    return true;
  }

  session.pendingInteraction = true;
  setStatus(session, "Running fictional virtual disable action…");
  try {
    if (session.roomCode) {
      const { claimSharedVirtualDisable } = await ensureMultiplayerModule();
      const result = await claimSharedVirtualDisable(session.roomCode, target.sourceId);
      markVirtuallyDisabled(session.state, target.sourceId, {
        displayName: result.awarded === false ? "Another explorer" : "You"
      });
      setStatus(session, result.awarded === false
        ? "Another explorer already disabled this virtual camera."
        : "Virtual Camera Disabled — shared room progress updated.", "success");
    } else {
      markVirtuallyDisabled(session.state, target.sourceId, { displayName: "You" });
      writeLocalProgress(session.state);
      setStatus(session, "Virtual Camera Disabled — no physical equipment was affected.", "success");
    }
    refreshInstanceColors(session);
    publishMapMarkers(session);
    completeIfNeeded(session);
  } catch (error) {
    console.warn("[deflock] virtual disable failed.", error);
    setStatus(session, String(error?.message || "Shared virtual disable failed. Try again."), "alert");
  } finally {
    session.pendingInteraction = false;
  }
  return true;
}

function bindHelp(session) {
  const refs = ui();
  const open = () => refs.help?.classList.add("show");
  const close = () => refs.help?.classList.remove("show");
  refs.helpOpen?.addEventListener("click", open);
  refs.helpClose?.addEventListener("click", close);
  session.unbindHelp = () => {
    refs.helpOpen?.removeEventListener("click", open);
    refs.helpClose?.removeEventListener("click", close);
  };
}

async function initializeSession(session) {
  const generation = session.generation;
  try {
    const loaded = await loadSurveillanceFeatures(session.location, { signal: session.abortController.signal });
    if (activeSession !== session || generation !== sessionGeneration || session.abortController.signal.aborted) return;
    const localProgress = roomCode() ? null : readLocalProgress(session.location, loaded.sourceVersion);
    session.state = createDeFlockState(loaded.features, {
      sourceVersion: loaded.sourceVersion,
      location: session.location,
      persisted: localProgress
    });
    session.source = loaded;
    createCameraLayer(session);
    publishMapMarkers(session);
    syncRoomAuthority(session);
    if (loaded.features.length === 0) {
      setStatus(session, "No mapped surveillance cameras were found in this area. Continue exploring or choose another Earth location.", "empty");
    } else {
      setStatus(session, `${loaded.features.length} publicly mapped virtual cameras loaded from OpenStreetMap.`);
    }
    renderHud(session);
  } catch (error) {
    if (session.abortController.signal.aborted || activeSession !== session) return;
    session.state = createDeFlockState([], { sourceVersion: DEFLOCK_SOURCE_VERSION, location: session.location });
    session.state.status = "error";
    session.state.error = String(error?.message || error);
    setStatus(session, "Camera data could not be loaded. The Earth location remains available for normal exploration.", "alert");
    renderHud(session);
  }
}

function startDeFlockMode() {
  stopDeFlockMode({ reason: "restarted" });
  const generation = ++sessionGeneration;
  const session = {
    generation,
    location: locationSnapshot(),
    abortController: new AbortController(),
    state: createDeFlockState([], { sourceVersion: DEFLOCK_SOURCE_VERSION, location: locationSnapshot() }),
    source: null,
    render: null,
    nearby: null,
    pendingInteraction: false,
    mobileActionLatched: false,
    roomCode: "",
    unsubRoom: null,
    lastPlacementRefresh: 0,
    lastRoomSync: 0,
    resultShown: false,
    scoreSubmitted: false,
    message: "Loading publicly mapped virtual cameras…",
    messageTone: "neutral",
    unbindHelp: null
  };
  session.state.loading = true;
  activeSession = session;
  appCtx.deFlockRuntimeState = session.state;
  showHud(true);
  bindHelp(session);
  renderHud(session);
  void initializeSession(session);
  return session;
}

function updateDeFlockMode(dt) {
  const session = activeSession;
  if (!session || appCtx.gameMode !== "deflock") return;
  if (!isEarthRuntime()) {
    showHud(false);
    if (session.render?.group) session.render.group.visible = false;
    clearRoomListener(session);
    session.roomCode = "";
    return;
  }
  showHud(true);
  if (session.render?.group) session.render.group.visible = true;
  if (!session.source || session.state.loading) {
    renderHud(session);
    return;
  }
  appCtx.gameTimer += Number(dt) || 0;
  const actor = readActorPosition();
  if (actor) {
    updateTravelDistance(session.state, actor);
    updateNearbyState(session, actor);
  }
  const mobileActionPressed = appCtx.keys?.KeyE === true;
  if (mobileActionPressed && !session.mobileActionLatched) {
    session.mobileActionLatched = true;
    void interactWithNearbyCamera(session);
  } else if (!mobileActionPressed) {
    session.mobileActionLatched = false;
  }
  const now = performance.now();
  if (now - session.lastPlacementRefresh > 2000) {
    session.lastPlacementRefresh = now;
    refreshPlacements(session);
  }
  if (now - session.lastRoomSync > 800) {
    session.lastRoomSync = now;
    syncRoomAuthority(session);
  }
  renderHud(session);
  completeIfNeeded(session);
}

function stopDeFlockMode() {
  const session = activeSession;
  if (!session) return false;
  activeSession = null;
  sessionGeneration += 1;
  session.abortController?.abort?.(new DOMException("DeFlock mode stopped", "AbortError"));
  clearRoomListener(session);
  session.unbindHelp?.();
  if (!session.roomCode && session.state?.features?.length) writeLocalProgress(session.state);
  disposeObject(session.render?.group);
  appCtx.deFlockMapMarkers = [];
  appCtx.deFlockRuntimeState = null;
  showHud(false);
  return true;
}

function getDeFlockSnapshot() {
  if (!activeSession?.state) return { active: false };
  return {
    active: true,
    roomCode: activeSession.roomCode || null,
    loading: activeSession.state.loading === true,
    source: activeSession.source ? {
      name: activeSession.source.source,
      version: activeSession.source.sourceVersion,
      cacheSource: activeSession.source.cacheSource,
      radiusDegrees: activeSession.source.radiusDegrees,
      bounded: activeSession.source.bounded
    } : null,
    progress: progressSnapshot(activeSession.state),
    nearbySourceId: activeSession.nearby?.feature?.sourceId || null,
    renderInstances: activeSession.state.features.length,
    detectionParameters: {
      rangeWorldUnits: DETECTION_RANGE,
      halfAngleDegrees: DETECTION_HALF_ANGLE,
      classification: "gameplay approximation"
    }
  };
}

function handleDeFlockGameplayInteraction() {
  // Physical keyboard input is dispatched immediately by input.js while touch
  // actions flow through the held-key update path. Latch an active KeyE here so
  // the same keyboard press is not consumed again on the next animation frame.
  if (activeSession && appCtx.keys?.KeyE === true) activeSession.mobileActionLatched = true;
  return interactWithNearbyCamera();
}

Object.assign(appCtx, {
  getDeFlockSnapshot,
  handleGameplayInteraction: handleDeFlockGameplayInteraction,
  startDeFlockMode,
  stopDeFlockMode,
  updateDeFlockMode
});

export {
  DETECTION_HALF_ANGLE,
  DETECTION_RANGE,
  DISCOVERY_RADIUS,
  INTERACTION_RADIUS,
  getDeFlockSnapshot,
  interactWithNearbyCamera,
  startDeFlockMode,
  stopDeFlockMode,
  updateDeFlockMode
};
