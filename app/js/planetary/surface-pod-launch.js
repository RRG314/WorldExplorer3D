import { createExpeditionPodMesh } from '../space/expedition-pod-mesh.js?v=1';

const ASCENT_HANDOFF_ALTITUDE = 165;
const SURFACE_CAMERA_MODES = Object.freeze(['chase', 'side', 'cockpit']);
let activeLaunch = null;
let stagedEarthPod = null;
let stagedEarthContext = null;
let stagedEarthBoard = null;
let unregisterStagedEarthInteraction = null;

function smoothstep(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

function actorPosition(appCtx) {
  const walker = appCtx?.Walk?.state?.mode === 'walk' ? appCtx.Walk.state.walker : null;
  const actor = walker || appCtx?.car || { x: 0, y: 0, z: 0, angle: 0 };
  return {
    x: Number(actor.x || 0),
    y: Number(actor.y || 0),
    z: Number(actor.z || 0),
    angle: Number(actor.angle ?? actor.yaw ?? 0)
  };
}

function terrainHeightAt(appCtx, x, z, actorY = 0) {
  const samplers = [appCtx?.terrainMeshHeightAt, appCtx?.elevationWorldYAtWorldXZ];
  for (const sampler of samplers) {
    if (typeof sampler !== 'function') continue;
    const height = Number(sampler(x, z));
    if (Number.isFinite(height)) return height;
  }
  const eyeHeight = Number(appCtx?.Walk?.CFG?.eyeHeight) || 1.7;
  return appCtx?.Walk?.state?.mode === 'walk' ? actorY - eyeHeight : actorY;
}

function solidPodBounds(pod) {
  const bounds = new THREE.Box3();
  pod.traverse((child) => {
    if (!child.isMesh || /plume|exhaust|plasma|docking|touchdown/i.test(child.name || '')) return;
    child.geometry?.computeBoundingBox?.();
    if (!child.geometry?.boundingBox) return;
    bounds.union(child.geometry.boundingBox.clone().applyMatrix4(child.matrixWorld));
  });
  return bounds;
}

function groundPod(appCtx, pod, groundY) {
  pod.position.y = 0;
  pod.updateMatrixWorld(true);
  const bounds = solidPodBounds(pod);
  const bottom = Number.isFinite(bounds.min.y) ? bounds.min.y : -3.5;
  pod.position.y = groundY - bottom + 0.04;
  pod.userData.surfaceGroundY = groundY;
  pod.userData.surfaceBottomOffset = bottom;
  return pod;
}

function createEarthPod(appCtx) {
  const actor = actorPosition(appCtx);
  const pod = createExpeditionPodMesh();
  pod.name = 'expedition-surface-launch-pod:earth';
  pod.userData.authority = 'expedition-pod-journey';
  pod.userData.temporarySurfaceLaunchPod = true;
  pod.scale.setScalar(0.62);
  pod.rotation.y = actor.angle;
  const x = actor.x + Math.sin(actor.angle + 0.72) * 10;
  const z = actor.z + Math.cos(actor.angle + 0.72) * 10;
  pod.position.set(x, 0, z);
  if (typeof appCtx.addEarthWorldObject === 'function') appCtx.addEarthWorldObject(pod);
  else appCtx.scene.add(pod);
  groundPod(appCtx, pod, terrainHeightAt(appCtx, x, z, actor.y));
  return pod;
}

function stagedEarthPodDistance() {
  if (!stagedEarthPod || !stagedEarthContext) return Infinity;
  const actor = actorPosition(stagedEarthContext);
  return Math.hypot(actor.x - stagedEarthPod.position.x, actor.z - stagedEarthPod.position.z);
}

function releaseStagedEarthPod({ remove = true } = {}) {
  unregisterStagedEarthInteraction?.();
  unregisterStagedEarthInteraction = null;
  const pod = stagedEarthPod;
  stagedEarthPod = null;
  stagedEarthContext = null;
  stagedEarthBoard = null;
  if (remove && pod?.parent) pod.parent.remove(pod);
  if (remove) pod?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
  return pod;
}

function stageEarthPod(appCtx, options = {}) {
  if (!appCtx?.scene || appCtx.getEnv?.() !== appCtx.ENV?.EARTH || appCtx.spaceFlight?.active) return null;
  if (stagedEarthPod?.parent !== appCtx.earthSceneRoot) releaseStagedEarthPod();
  if (!stagedEarthPod) stagedEarthPod = createEarthPod(appCtx);
  stagedEarthContext = appCtx;
  stagedEarthBoard = typeof options.onBoard === 'function' ? options.onBoard : null;
  stagedEarthPod.userData.boardingRadius = 7.5;
  if (!unregisterStagedEarthInteraction && typeof appCtx.registerContextInteraction === 'function') {
    unregisterStagedEarthInteraction = appCtx.registerContextInteraction({
      id: 'expedition-earth-pathfinder',
      priority: 180,
      evaluate() {
        const distance = stagedEarthPodDistance();
        if (
          !stagedEarthPod ||
          stagedEarthContext?.getEnv?.() !== stagedEarthContext?.ENV?.EARTH ||
          stagedEarthPod.parent !== stagedEarthContext?.earthSceneRoot ||
          !Number.isFinite(distance) ||
          distance > Number(stagedEarthPod.userData.boardingRadius || 7.5)
        ) return null;
        return {
          available: true,
          action: 'board-earth-pathfinder',
          label: 'Board Pathfinder',
          detail: 'Launch to Solis Reach in Earth orbit',
          distance,
          data: { destination: 'surveyor' }
        };
      },
      perform() {
        return stagedEarthBoard?.(stagedEarthPod) ?? false;
      }
    });
  }
  return stagedEarthPod;
}

function createGroundEffects(appCtx, pod) {
  const effects = new THREE.Group();
  effects.name = 'surface-pod-launch-effects';
  effects.position.copy(pod.position);
  effects.position.y = Number.isFinite(Number(pod.userData?.surfaceGroundY))
    ? Number(pod.userData.surfaceGroundY) + 0.05
    : effects.position.y - 3.45 * Math.max(0.72, Number(pod.scale?.y || 1));
  for (let index = 0; index < 3; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.6 + index * 0.65, 1.85 + index * 0.78, 36),
      new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xd9fbff : 0x77d9ee,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.userData.launchRing = index;
    effects.add(ring);
  }
  appCtx.scene.add(effects);
  return effects;
}

function ensureSurfaceEngines(pod) {
  let hasEnginePresentation = false;
  pod.traverse((child) => {
    if (child.userData?.podExhaust || /engine-plume|exhaust-particle/i.test(child.name || '')) hasEnginePresentation = true;
  });
  if (hasEnginePresentation) return null;
  const engines = new THREE.Group();
  engines.name = 'surface-pod-engine-output';
  [-0.72, 0, 0.72].forEach((x, index) => {
    const plume = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 3.8, 16),
      new THREE.MeshBasicMaterial({ color: index === 1 ? 0xe8fdff : 0x58cfff, transparent: true, opacity: 0, depthWrite: false })
    );
    plume.name = `surface-engine-plume-${index + 1}`;
    plume.userData.podExhaust = true;
    plume.position.set(x, -2.1, 0);
    plume.rotation.z = Math.PI;
    engines.add(plume);
  });
  const glow = new THREE.PointLight(0x69dcf3, 0, 20, 2);
  glow.name = 'surface-engine-glow';
  glow.position.set(0, -0.5, 0);
  glow.userData.surfaceEngineGlow = true;
  engines.add(glow);
  pod.add(engines);
  return engines;
}

function setEngineOutput(pod, output) {
  const intensity = Math.max(0, Math.min(1, Number(output) || 0));
  pod.traverse((child) => {
    if (child.userData?.surfaceEngineGlow) child.intensity = intensity * 2.8;
    if (child.userData?.podExhaust || /engine-plume|exhaust-particle/i.test(child.name || '')) {
      if (child.material) child.material.opacity = Math.max(0.08, intensity * (child.userData?.podExhaust ? 0.82 : 0.58));
      child.visible = intensity > 0.015;
      const pulse = 0.88 + Math.sin(performance.now() * 0.024 + child.id) * 0.12;
      child.scale.y = Math.max(0.2, intensity * pulse);
    }
  });
}

function ensureStatus() {
  let status = document.getElementById('surfacePodLaunchStatus');
  if (!status) {
    status = document.createElement('div');
    status.id = 'surfacePodLaunchStatus';
    status.setAttribute('role', 'status');
    status.style.cssText = 'position:fixed;left:50%;top:24px;transform:translateX(-50%);z-index:12000;padding:10px 18px;border:1px solid rgba(111,232,255,.72);border-radius:999px;background:rgba(4,13,23,.88);color:#e9fbff;font:700 12px Inter,sans-serif;letter-spacing:.08em;text-align:center;pointer-events:none;box-shadow:0 8px 28px rgba(0,0,0,.42);';
    document.body.appendChild(status);
  }
  status.textContent = 'PATHFINDER READY · PRESS SPACE TO LAUNCH · C CHANGES CAMERA';
  status.hidden = false;
  return status;
}

function setLaunchStatus(message) {
  const status = ensureStatus();
  status.textContent = message;
}

function beginManualAscent(launch) {
  if (!launch || launch.launched || launch.committing) return false;
  launch.launched = true;
  launch.verticalVelocity = Math.max(4, launch.verticalVelocity);
  launch.controls?.querySelector('[data-surface-launch]')?.setAttribute('hidden', '');
  setLaunchStatus('PATHFINDER ASCENT · ARROWS STEER · SPACE BOOSTS · C CHANGES CAMERA');
  return true;
}

function cycleSurfaceCamera(launch) {
  const index = SURFACE_CAMERA_MODES.indexOf(launch.cameraMode);
  launch.cameraMode = SURFACE_CAMERA_MODES[(index + 1) % SURFACE_CAMERA_MODES.length];
  setLaunchStatus(`PATHFINDER ${launch.launched ? 'ASCENT' : 'READY'} · ${launch.cameraMode.toUpperCase()} CAMERA · ${launch.launched ? 'ARROWS STEER' : 'PRESS SPACE TO LAUNCH'}`);
  return launch.cameraMode;
}

function ensureLaunchControls(launch) {
  let controls = document.getElementById('surfacePodLaunchControls');
  if (controls) controls.remove();
  controls = document.createElement('div');
  controls.id = 'surfacePodLaunchControls';
  controls.style.cssText = 'position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(18px,calc(env(safe-area-inset-bottom) + 12px));z-index:12001;display:flex;align-items:flex-end;gap:10px;font-family:Inter,sans-serif;';
  controls.innerHTML = `<div data-surface-pad hidden style="grid-template-columns:repeat(3,48px);grid-template-rows:repeat(2,44px);gap:6px"><span></span><button data-surface-key="arrowup" aria-label="Pitch forward">▲</button><span></span><button data-surface-key="arrowleft" aria-label="Turn left">◀</button><button data-surface-key="arrowdown" aria-label="Pitch back">▼</button><button data-surface-key="arrowright" aria-label="Turn right">▶</button></div><div style="display:grid;gap:8px"><button data-surface-camera type="button" style="min-width:112px;min-height:42px;border:1px solid #6fe8ff;border-radius:22px;background:rgba(5,22,36,.9);color:#eafcff;font:700 10px Orbitron,sans-serif">CAMERA</button><button data-surface-launch type="button" style="min-width:112px;min-height:52px;border:1px solid #8ff3ff;border-radius:26px;background:#176987;color:#fff;font:700 11px Orbitron,sans-serif">LAUNCH</button></div>`;
  document.body.appendChild(controls);
  const touchClient = (navigator.maxTouchPoints || 0) > 0 || globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches === true;
  const pad = controls.querySelector('[data-surface-pad]');
  if (pad && touchClient) {
    pad.hidden = false;
    pad.style.display = 'grid';
  }
  controls.querySelector('[data-surface-launch]')?.addEventListener('click', () => beginManualAscent(launch));
  controls.querySelector('[data-surface-camera]')?.addEventListener('click', () => cycleSurfaceCamera(launch));
  controls.querySelectorAll('[data-surface-key]').forEach((button) => {
    const key = button.dataset.surfaceKey;
    const set = (active, event) => {
      event.preventDefault();
      launch.keys[key] = active;
    };
    button.addEventListener('pointerdown', (event) => set(true, event));
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((name) => button.addEventListener(name, (event) => set(false, event)));
  });
  launch.controls = controls;
  return controls;
}

function bindLaunchKeys(launch) {
  launch.keyDown = (event) => {
    if (activeLaunch !== launch) return;
    const key = event.code === 'Space' ? 'space' : String(event.key || '').toLowerCase();
    if (key === 'c') cycleSurfaceCamera(launch);
    else if (key === 'space') {
      launch.keys.space = true;
      beginManualAscent(launch);
    } else if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
      launch.keys[key] = true;
    } else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  launch.keyUp = (event) => {
    if (activeLaunch !== launch) return;
    const key = event.code === 'Space' ? 'space' : String(event.key || '').toLowerCase();
    if (['space', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
      launch.keys[key] = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener('keydown', launch.keyDown, true);
  window.addEventListener('keyup', launch.keyUp, true);
}

function updateSurfaceCamera(appCtx, launch) {
  const pod = launch.pod;
  const target = launch.lookTarget.copy(pod.position);
  target.y += 0.8;
  if (launch.cameraMode === 'cockpit') {
    const cameraLocal = launch.cameraOffset.set(0, 2.1, 1.05).applyQuaternion(pod.quaternion);
    const lookDirection = launch.lookDirection.set(0, 1, 0).applyQuaternion(pod.quaternion).normalize();
    appCtx.camera.position.copy(pod.position).add(cameraLocal);
    appCtx.camera.up.set(0, 0, -1).applyQuaternion(pod.quaternion).normalize();
    appCtx.camera.lookAt(launch.lookTarget.copy(appCtx.camera.position).addScaledVector(lookDirection, 40));
    return;
  }
  const yaw = launch.yaw;
  const localOffset = launch.cameraMode === 'side'
    ? launch.cameraOffset.set(22, 7, 2)
    : launch.cameraOffset.set(13, Math.min(28, 6 + launch.altitude * 0.22), 19);
  localOffset.applyAxisAngle(launch.worldUp, yaw);
  appCtx.camera.position.copy(pod.position).add(localOffset);
  appCtx.camera.up.set(0, 1, 0);
  appCtx.camera.lookAt(target);
}

function clearLaunch(appCtx, launch, { restore = false } = {}) {
  if (activeLaunch !== launch) return;
  activeLaunch = null;
  appCtx.surfacePodLaunchSnapshot = null;
  document.getElementById('surfacePodLaunchStatus')?.setAttribute('hidden', '');
  launch.controls?.remove?.();
  window.removeEventListener('keydown', launch.keyDown, true);
  window.removeEventListener('keyup', launch.keyUp, true);
  if (launch.effects?.parent) launch.effects.parent.remove(launch.effects);
  launch.effects?.traverse?.((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
  if (launch.engineEffects?.parent) launch.engineEffects.parent.remove(launch.engineEffects);
  launch.engineEffects?.traverse?.((child) => {
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  });
  if (launch.temporary && launch.pod?.parent) launch.pod.parent.remove(launch.pod);
  if (launch.temporary) launch.pod?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
  if (launch.pod && !launch.temporary) launch.pod.position.copy(launch.startPosition);
  if (restore && appCtx.camera) {
    appCtx.camera.position.copy(launch.cameraPosition);
    appCtx.camera.quaternion.copy(launch.cameraQuaternion);
    appCtx.camera.up.copy(launch.cameraUp);
  }
  if (restore && launch.returnButton) launch.returnButton.style.display = launch.returnButtonDisplay;
  appCtx.setPauseReason?.('surface_pod_launch', false);
}

function playSurfacePodLaunch(appCtx, options = {}) {
  if (activeLaunch || !appCtx?.scene || !appCtx?.camera || !appCtx?.renderer) return false;
  const pod = options.pod || createEarthPod(appCtx);
  if (!pod) return false;
  const temporary = pod.userData?.temporarySurfaceLaunchPod === true;
  const launch = {
    pod,
    temporary,
    bodyId: String(options.bodyId || 'earth'),
    startPosition: pod.position.clone(),
    cameraPosition: appCtx.camera.position.clone(),
    cameraQuaternion: appCtx.camera.quaternion.clone(),
    cameraUp: appCtx.camera.up.clone(),
    effects: createGroundEffects(appCtx, pod),
    engineEffects: ensureSurfaceEngines(pod),
    lastFrameAt: performance.now(),
    launched: false,
    committing: false,
    altitude: 0,
    verticalVelocity: 0,
    horizontalVelocity: new THREE.Vector3(),
    yaw: Number(pod.rotation.y) || 0,
    cameraMode: 'chase',
    keys: Object.create(null),
    worldUp: new THREE.Vector3(0, 1, 0),
    cameraOffset: new THREE.Vector3(),
    lookTarget: new THREE.Vector3(),
    lookDirection: new THREE.Vector3(),
    returnButton: document.getElementById('solidWorldReturnBtn'),
    returnButtonDisplay: document.getElementById('solidWorldReturnBtn')?.style.display || ''
  };
  activeLaunch = launch;
  ensureStatus();
  ensureLaunchControls(launch);
  bindLaunchKeys(launch);
  if (launch.returnButton) launch.returnButton.style.display = 'none';
  appCtx.setPauseReason?.('surface_pod_launch', true);
  appCtx.surfacePodLaunchSnapshot = Object.freeze({
    active: true,
    bodyId: launch.bodyId,
    phase: 'ready',
    progress: 0,
    altitude: 0,
    awaitingLaunchInput: true,
    controllable: true,
    cameraMode: launch.cameraMode,
    usesExistingPod: Boolean(options.pod)
  });

  const frame = (now) => {
    if (activeLaunch !== launch) return;
    const dt = Math.max(0.001, Math.min(0.05, (now - launch.lastFrameAt) / 1000));
    launch.lastFrameAt = now;
    const turnInput = (launch.keys.arrowleft ? 1 : 0) - (launch.keys.arrowright ? 1 : 0);
    const pitchInput = (launch.keys.arrowup ? 1 : 0) - (launch.keys.arrowdown ? 1 : 0);
    if (launch.launched) {
      launch.yaw += turnInput * dt * 1.15;
      const forwardX = Math.sin(launch.yaw);
      const forwardZ = Math.cos(launch.yaw);
      launch.horizontalVelocity.x += forwardX * pitchInput * dt * 7;
      launch.horizontalVelocity.z += forwardZ * pitchInput * dt * 7;
      launch.horizontalVelocity.multiplyScalar(Math.pow(0.987, dt * 60));
      const ascentAcceleration = launch.keys.shift ? 4 : launch.keys.space ? 30 : 14;
      launch.verticalVelocity = Math.min(72, launch.verticalVelocity + ascentAcceleration * dt);
      launch.altitude = Math.min(ASCENT_HANDOFF_ALTITUDE, launch.altitude + launch.verticalVelocity * dt);
      pod.position.x += launch.horizontalVelocity.x * dt;
      pod.position.z += launch.horizontalVelocity.z * dt;
      pod.position.y = launch.startPosition.y + launch.altitude;
      pod.rotation.set(pitchInput * 0.11, launch.yaw, turnInput * -0.12);
    } else {
      pod.position.copy(launch.startPosition);
      pod.rotation.set(0, launch.yaw, 0);
    }
    const progress = Math.max(0, Math.min(1, launch.altitude / ASCENT_HANDOFF_ALTITUDE));
    const ignition = launch.launched ? Math.max(0.35, smoothstep(Math.min(1, progress / 0.12))) : 0;
    setEngineOutput(pod, ignition);
    launch.effects.children.forEach((ring) => {
      const index = Number(ring.userData.launchRing || 0);
      const ringProgress = launch.launched ? Math.max(0, Math.min(1, progress * 2.8 - index * 0.16)) : 0;
      ring.scale.setScalar(1 + ringProgress * (3.2 + index * 0.7));
      ring.material.opacity = Math.max(0, (0.36 - index * 0.05) * ignition * (1 - ringProgress));
    });
    updateSurfaceCamera(appCtx, launch);
    appCtx.surfacePodLaunchSnapshot = Object.freeze({
      active: true,
      bodyId: launch.bodyId,
      phase: launch.launched ? (progress < 0.12 ? 'ignition' : progress < 0.82 ? 'liftoff' : 'ascent') : 'ready',
      progress: Number(progress.toFixed(3)),
      altitude: Number(launch.altitude.toFixed(2)),
      awaitingLaunchInput: !launch.launched,
      controllable: true,
      cameraMode: launch.cameraMode,
      headingDegrees: Number(((((launch.yaw * 180 / Math.PI) % 360) + 360) % 360).toFixed(1)),
      usesExistingPod: Boolean(options.pod)
    });
    appCtx.renderer.render(appCtx.scene, appCtx.camera);
    if (progress < 1 || !launch.launched) {
      requestAnimationFrame(frame);
      return;
    }
    if (launch.committing) return;
    launch.committing = true;
    Promise.resolve(options.onCommit?.()).then((accepted) => {
      if (accepted === false) {
        clearLaunch(appCtx, launch, { restore: true });
        options.onFailure?.();
        return;
      }
      clearLaunch(appCtx, launch);
    }).catch(() => {
      clearLaunch(appCtx, launch, { restore: true });
      options.onFailure?.();
    });
  };
  requestAnimationFrame(frame);
  return true;
}

function consumeStagedEarthPod(pod = stagedEarthPod) {
  if (!pod || pod !== stagedEarthPod) return pod || null;
  return releaseStagedEarthPod({ remove: false });
}

function getStagedEarthPodSnapshot() {
  let bottomY = null;
  let groundClearance = null;
  if (stagedEarthPod) {
    stagedEarthPod.updateMatrixWorld(true);
    const bounds = solidPodBounds(stagedEarthPod);
    if (Number.isFinite(bounds.min.y)) {
      bottomY = Number(bounds.min.y.toFixed(3));
      const groundY = Number(stagedEarthPod.userData?.surfaceGroundY);
      if (Number.isFinite(groundY)) groundClearance = Number((bounds.min.y - groundY).toFixed(3));
    }
  }
  return Object.freeze({
    active: !!stagedEarthPod?.parent,
    distance: Number.isFinite(stagedEarthPodDistance()) ? Number(stagedEarthPodDistance().toFixed(2)) : null,
    boardingRadius: Number(stagedEarthPod?.userData?.boardingRadius || 0),
    bottomY,
    groundY: Number.isFinite(Number(stagedEarthPod?.userData?.surfaceGroundY))
      ? Number(Number(stagedEarthPod.userData.surfaceGroundY).toFixed(3))
      : null,
    groundClearance,
    position: stagedEarthPod ? Object.freeze({
      x: Number(stagedEarthPod.position.x.toFixed(2)),
      y: Number(stagedEarthPod.position.y.toFixed(2)),
      z: Number(stagedEarthPod.position.z.toFixed(2))
    }) : null
  });
}

export { consumeStagedEarthPod, getStagedEarthPodSnapshot, playSurfacePodLaunch, releaseStagedEarthPod, stageEarthPod };
