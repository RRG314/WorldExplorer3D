import { ctx as appCtx } from "../shared-context.js?v=55";
import { DEFLOCK_SOURCE_VERSION, loadSurveillanceFeatures } from "./source.js?v=3";
import { computeCameraPlacement } from "./placement.js?v=2";
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
const DISABLE_FALL_DURATION_MS = 950;
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
  document.body?.classList.toggle("deflock-active", visible);
  const menuItem = document.getElementById('fDeFlock');
  menuItem?.classList.toggle('on', visible);
  if (menuItem) menuItem.textContent = visible ? '📷 DeFlock Hunt Active' : '📷 Start DeFlock Hunt';
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
    new THREE.CylinderGeometry(0.09, 0.12, 1, 6),
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.72, metalness: 0.28 }),
    count
  );
  const mountArm = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.68, metalness: 0.32 }),
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
    new THREE.TorusGeometry(1.2, 0.12, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, depthTest: false, depthWrite: false }),
    count
  );
  target.geometry.rotateX(Math.PI / 2);
  const beacon = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.36, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false }),
    count
  );
  const beam = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.055, 0.055, 1.4, 6),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false }),
    count
  );

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
    zones.frustumCulled = false;
    zones.userData.gameplayApproximation = true;
    group.add(zones);
  }

  pole.frustumCulled = false;
  mountArm.frustumCulled = false;
  camera.frustumCulled = false;
  lens.frustumCulled = false;
  target.frustumCulled = false;
  beacon.frustumCulled = false;
  beam.frustumCulled = false;
  pole.name = "DeFlockPoles";
  mountArm.name = "DeFlockMountArms";
  camera.name = "DeFlockCameraBodies";
  lens.name = "DeFlockCameraLenses";
  target.name = "DeFlockTargets";
  beacon.name = "DeFlockBeacons";
  beam.name = "DeFlockBeaconBeams";
  target.renderOrder = 20;
  beacon.renderOrder = 21;
  beam.renderOrder = 20;
  group.add(pole, mountArm, camera, lens, target, beam, beacon);
  appCtx.scene.add(group);
  session.render = { group, pole, mountArm, camera, lens, target, beacon, beam, zones, directed };
  refreshPlacements(session, true);
  refreshInstanceColors(session);
  return group;
}

function refreshPlacements(session, force = false, animationOnly = false) {
  const render = session?.render;
  const state = session?.state;
  if (!render || !state || !globalThis.THREE) return false;
  const THREE = globalThis.THREE;
  const matrix = new THREE.Matrix4();
  const identityQuaternion = new THREE.Quaternion();
  const yawQuaternion = new THREE.Quaternion();
  const fallQuaternion = new THREE.Quaternion();
  const cameraQuaternion = new THREE.Quaternion();
  const armQuaternion = new THREE.Quaternion();
  const fallAxis = new THREE.Vector3();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(1, 1, 1);
  const position = new THREE.Vector3();
  const local = new THREE.Vector3();
  let changed = false;
  let directedIndex = 0;
  const now = performance.now();
  const completedAnimations = [];

  state.features.forEach((feature, index) => {
    let placement = feature.deFlockPlacement || null;
    if (!placement) {
      placement = computeCameraPlacement(feature, {
        geoToWorld: appCtx.geoToWorld,
        terrainAt: (x, z) => appCtx.SurfaceQuery?.terrainAt?.(x, z),
        nearestRoadAt: (x, z) => appCtx.findNearestRoad?.(x, z)
      });
      if (placement) feature.deFlockPlacement = { ...placement };
    } else if (!animationOnly) {
      const terrainY = Number(appCtx.SurfaceQuery?.terrainAt?.(placement.x, placement.z)?.position?.y);
      const surfaceY = placement.overhead && Number.isFinite(placement.roadSurfaceY)
        ? placement.roadSurfaceY
        : terrainY;
      if (Number.isFinite(surfaceY)) {
        placement = { ...placement, groundY: surfaceY };
        feature.deFlockPlacement.groundY = surfaceY;
      }
    }
    if (!placement) return;
    if (force || Math.hypot((feature.x ?? Infinity) - placement.x, (feature.z ?? Infinity) - placement.z) > 0.25 || Math.abs((feature.groundY ?? Infinity) - placement.groundY) > 0.25) {
      changed = true;
    }
    feature.sourceX = placement.sourceX;
    feature.sourceZ = placement.sourceZ;
    feature.x = placement.x;
    feature.z = placement.z;
    feature.groundY = placement.groundY;
    feature.mountKind = placement.mountKind;
    feature.mountHeight = placement.mountHeight;
    feature.overhead = placement.overhead;
    feature.curbAdjusted = placement.curbAdjusted;
    feature.roadWidth = placement.roadWidth;
    const bearing = placement.bearingRadians;
    // Earth compass bearings increase clockwise from north (-Z), while
    // Three.js positive Y rotations turn counter-clockwise when viewed above.
    yawQuaternion.setFromAxisAngle(upAxis, -bearing);
    const fallStartedAt = session.fallStarts.get(feature.sourceId);
    const disabled = state.disabled.has(feature.sourceId);
    const linearFall = !disabled ? 0 : Number.isFinite(fallStartedAt)
      ? Math.max(0, Math.min(1, (now - fallStartedAt) / DISABLE_FALL_DURATION_MS))
      : 1;
    const fall = 1 - Math.pow(1 - linearFall, 3);
    if (linearFall >= 1 && Number.isFinite(fallStartedAt)) completedAnimations.push(feature.sourceId);
    const fallAngle = fall * Math.PI * 0.49;
    fallAxis.set(Math.cos(bearing), 0, Math.sin(bearing)).normalize();
    fallQuaternion.setFromAxisAngle(fallAxis, fallAngle);
    const mountHeight = Math.max(1.5, Number(placement.mountHeight) || 3.15);

    if (placement.overhead || placement.mountKind === 'wall' || placement.mountKind === 'ceiling') {
      scale.set(0.0001, 0.0001, 0.0001);
      position.set(feature.x, feature.groundY, feature.z);
      matrix.compose(position, identityQuaternion, scale);
    } else {
      scale.set(1, mountHeight, 1);
      local.set(0, mountHeight * 0.5, 0).applyQuaternion(fallQuaternion);
      position.set(feature.x + local.x, feature.groundY + local.y, feature.z + local.z);
      matrix.compose(position, fallQuaternion, scale);
    }
    render.pole.setMatrixAt(index, matrix);

    if (placement.overhead) {
      const tangentX = Number(placement.roadTangentX);
      const tangentZ = Number(placement.roadTangentZ);
      const normalX = Number.isFinite(tangentX) && Number.isFinite(tangentZ) ? -tangentZ : Math.cos(bearing);
      const normalZ = Number.isFinite(tangentX) && Number.isFinite(tangentZ) ? tangentX : -Math.sin(bearing);
      const armYaw = Math.atan2(-normalZ, normalX);
      armQuaternion.setFromAxisAngle(upAxis, armYaw);
      scale.set(Math.max(6, Math.min(24, Number(placement.roadWidth) + 3 || 8)), 1, 1);
      position.set(feature.sourceX, feature.groundY + mountHeight, feature.sourceZ);
      matrix.compose(position, armQuaternion, scale);
    } else {
      scale.set(0.0001, 0.0001, 0.0001);
      position.set(feature.x, feature.groundY, feature.z);
      matrix.compose(position, identityQuaternion, scale);
    }
    render.mountArm.setMatrixAt(index, matrix);

    let cameraX;
    let cameraY;
    let cameraZ;
    if (placement.overhead || placement.mountKind === 'wall' || placement.mountKind === 'ceiling') {
      cameraX = feature.x + Math.sin(fall * Math.PI) * 0.45;
      cameraY = feature.groundY + mountHeight + (feature.groundY + 0.32 - (feature.groundY + mountHeight)) * fall;
      cameraZ = feature.z + Math.sin(fall * Math.PI) * 0.28;
    } else {
      local.set(0, mountHeight, 0).applyQuaternion(fallQuaternion);
      cameraX = feature.x + local.x;
      cameraY = feature.groundY + local.y;
      cameraZ = feature.z + local.z;
    }
    cameraQuaternion.copy(fallQuaternion).multiply(yawQuaternion);
    scale.set(1, 1, 1);
    position.set(cameraX, cameraY, cameraZ);
    matrix.compose(position, cameraQuaternion, scale);
    render.camera.setMatrixAt(index, matrix);

    local.set(Math.sin(bearing) * 0.5, 0, -Math.cos(bearing) * 0.5).applyQuaternion(fallQuaternion);
    position.set(cameraX + local.x, cameraY + local.y, cameraZ + local.z);
    matrix.compose(position, cameraQuaternion, scale);
    render.lens.setMatrixAt(index, matrix);

    position.set(feature.x, feature.groundY + 0.12, feature.z);
    matrix.compose(position, identityQuaternion, scale);
    render.target.setMatrixAt(index, matrix);

    const beaconY = feature.groundY + Math.max(4.6, mountHeight + 1.15);
    position.set(feature.x, beaconY - 0.75, feature.z);
    matrix.compose(position, identityQuaternion, scale);
    render.beam.setMatrixAt(index, matrix);

    position.set(feature.x, beaconY, feature.z);
    matrix.compose(position, identityQuaternion, scale);
    render.beacon.setMatrixAt(index, matrix);

    if (Number.isFinite(feature.direction) && render.zones) {
      position.set(feature.x, feature.groundY + 0.16, feature.z);
      matrix.compose(position, yawQuaternion, scale);
      render.zones.setMatrixAt(directedIndex++, matrix);
    }
  });
  completedAnimations.forEach((sourceId) => session.fallStarts.delete(sourceId));
  [render.pole, render.mountArm, render.camera, render.lens, render.target, render.beam, render.beacon, render.zones].filter(Boolean).forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
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
    render.beam.setColorAt(index, color);
    render.beacon.setColorAt(index, color);
  });
  [render.camera, render.target, render.beam, render.beacon].forEach((mesh) => {
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });
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
    sourceX: feature.sourceX,
    sourceZ: feature.sourceZ,
    x: feature.x,
    z: feature.z,
    groundY: feature.groundY,
    state: cameraState(state, feature.sourceId),
    objective: nearest?.sourceId === feature.sourceId,
    cameraType: feature.cameraType,
    cameraMount: feature.cameraMount,
    mountKind: feature.mountKind,
    mountHeight: feature.mountHeight,
    curbAdjusted: feature.curbAdjusted === true,
    overhead: feature.overhead === true,
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
  const counts = `${snapshot.disabled}/${snapshot.total} disabled • ${snapshot.discovered} found • ${snapshot.score} pts`;
  const timer = formatTime(snapshot.elapsedMs);
  if (refs.counts && refs.counts.textContent !== counts) refs.counts.textContent = counts;
  if (refs.timer && refs.timer.textContent !== timer) refs.timer.textContent = timer;
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
  session.fallStarts.clear();
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
  refreshPlacements(session, true);
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
      const previouslyDisabled = new Set(session.state.disabled);
      if (applySharedDisabled(session.state, entries)) {
        entries.forEach((entry) => {
          const sourceId = String(entry?.sourceId || '');
          if (sourceId && !previouslyDisabled.has(sourceId) && session.state.disabled.has(sourceId)) {
            session.fallStarts.set(sourceId, performance.now());
          }
        });
        refreshInstanceColors(session);
        refreshPlacements(session);
        publishMapMarkers(session);
      }
    }, {
      onError: () => setStatus(session, "Shared progress is reconnecting; visible state was kept.", "alert")
    });
  }).catch(() => setStatus(session, "Shared progress could not start. Single-player Earth play remains available.", "alert"));
}

function completeIfNeeded(session) {
  const state = session.state;
  if (state.features.length <= 0 || state.disabled.size < state.features.length || session.resultShown || session.fallStarts.size > 0) return;
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
    let newlyDisabled = false;
    if (session.roomCode) {
      const { claimSharedVirtualDisable } = await ensureMultiplayerModule();
      const result = await claimSharedVirtualDisable(session.roomCode, target.sourceId);
      newlyDisabled = markVirtuallyDisabled(session.state, target.sourceId, {
        displayName: result.awarded === false ? "Another explorer" : "You"
      });
      setStatus(session, result.awarded === false
        ? "Another explorer already disabled this virtual camera."
        : "Virtual Camera Disabled — shared room progress updated.", "success");
    } else {
      newlyDisabled = markVirtuallyDisabled(session.state, target.sourceId, { displayName: "You" });
      writeLocalProgress(session.state);
      setStatus(session, "Virtual Camera Disabled — no physical equipment was affected.", "success");
    }
    if (newlyDisabled) session.fallStarts.set(target.sourceId, performance.now());
    refreshInstanceColors(session);
    refreshPlacements(session);
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
    } else if (/bundled|stale/i.test(String(loaded.cacheSource || ""))) {
      setStatus(session, `${loaded.features.length} virtual cameras loaded from a dated last-good OpenStreetMap snapshot.`, "empty");
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
    fallStarts: new Map(),
    mobileActionLatched: false,
    roomCode: "",
    unsubRoom: null,
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
  if (session.fallStarts.size > 0) refreshPlacements(session, false, true);
  const mobileActionPressed = appCtx.keys?.KeyE === true;
  if (mobileActionPressed && !session.mobileActionLatched) {
    session.mobileActionLatched = true;
    void interactWithNearbyCamera(session);
  } else if (!mobileActionPressed) {
    session.mobileActionLatched = false;
  }
  const now = performance.now();
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
      cacheAgeMs: activeSession.source.cacheAgeMs,
      fetchedAt: activeSession.source.fetchedAt,
      warnings: activeSession.source.warnings,
      radiusDegrees: activeSession.source.radiusDegrees,
      bounded: activeSession.source.bounded
    } : null,
    progress: progressSnapshot(activeSession.state),
    nearbySourceId: activeSession.nearby?.feature?.sourceId || null,
    renderInstances: activeSession.state.features.length,
    markerInstances: activeSession.render?.beacon?.count || 0,
    fallingInstances: activeSession.fallStarts.size,
    placement: {
      curbAdjusted: activeSession.state.features.filter((feature) => feature.curbAdjusted).length,
      overhead: activeSession.state.features.filter((feature) => feature.overhead).length,
      mounts: activeSession.state.features.reduce((counts, feature) => {
        const key = String(feature.mountKind || 'unknown');
        counts[key] = (counts[key] || 0) + 1;
        return counts;
      }, {})
    },
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
