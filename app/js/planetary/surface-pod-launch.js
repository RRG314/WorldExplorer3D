import { createExpeditionPodMesh } from '../space/expedition-pod-mesh.js?v=1';

const LAUNCH_DURATION_MS = 3200;
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

function createEarthPod(appCtx) {
  const actor = actorPosition(appCtx);
  const pod = createExpeditionPodMesh();
  pod.name = 'expedition-surface-launch-pod:earth';
  pod.userData.authority = 'expedition-pod-journey';
  pod.userData.temporarySurfaceLaunchPod = true;
  pod.scale.setScalar(0.78);
  pod.rotation.y = actor.angle;
  pod.position.set(
    actor.x + Math.sin(actor.angle + 0.72) * 10,
    actor.y + 4.15,
    actor.z + Math.cos(actor.angle + 0.72) * 10
  );
  if (typeof appCtx.addEarthWorldObject === 'function') appCtx.addEarthWorldObject(pod);
  else appCtx.scene.add(pod);
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
      priority: 98,
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
          detail: 'Launch to Surveyor in Earth orbit',
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
  effects.position.y -= 3.45 * Math.max(0.72, Number(pod.scale?.y || 1));
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
  status.textContent = 'PATHFINDER · SURFACE LAUNCH';
  status.hidden = false;
  return status;
}

function clearLaunch(appCtx, launch, { restore = false } = {}) {
  if (activeLaunch !== launch) return;
  activeLaunch = null;
  appCtx.surfacePodLaunchSnapshot = null;
  document.getElementById('surfacePodLaunchStatus')?.setAttribute('hidden', '');
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
    startedAt: performance.now(),
    returnButton: document.getElementById('solidWorldReturnBtn'),
    returnButtonDisplay: document.getElementById('solidWorldReturnBtn')?.style.display || ''
  };
  activeLaunch = launch;
  ensureStatus();
  if (launch.returnButton) launch.returnButton.style.display = 'none';
  appCtx.setPauseReason?.('surface_pod_launch', true);
  appCtx.surfacePodLaunchSnapshot = Object.freeze({
    active: true,
    bodyId: launch.bodyId,
    phase: 'ignition',
    progress: 0,
    altitude: 0,
    usesExistingPod: !temporary
  });

  const cameraOffset = new THREE.Vector3(13, 0, 18).applyAxisAngle(new THREE.Vector3(0, 1, 0), pod.rotation.y || 0);
  const desiredCamera = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  const frame = (now) => {
    if (activeLaunch !== launch) return;
    const progress = Math.max(0, Math.min(1, (now - launch.startedAt) / LAUNCH_DURATION_MS));
    const ignition = smoothstep(Math.min(1, progress / 0.18));
    const ascent = smoothstep(Math.max(0, (progress - 0.12) / 0.88));
    const altitude = 150 * ascent * ascent + 10 * ascent;
    pod.position.copy(launch.startPosition);
    pod.position.y += altitude;
    setEngineOutput(pod, ignition);
    launch.effects.children.forEach((ring) => {
      const index = Number(ring.userData.launchRing || 0);
      const ringProgress = Math.max(0, Math.min(1, progress * 2.4 - index * 0.16));
      ring.scale.setScalar(1 + ringProgress * (3.2 + index * 0.7));
      ring.material.opacity = Math.max(0, (0.36 - index * 0.05) * ignition * (1 - ringProgress));
    });
    desiredCamera.copy(launch.startPosition).add(cameraOffset);
    desiredCamera.y = launch.startPosition.y + Math.min(38, 5.5 + altitude * 0.65);
    appCtx.camera.position.copy(desiredCamera);
    appCtx.camera.up.set(0, 1, 0);
    lookTarget.copy(launch.startPosition);
    lookTarget.y += Math.max(1.8, altitude * (altitude < 48 ? 0.65 : 0.82));
    appCtx.camera.lookAt(lookTarget);
    appCtx.surfacePodLaunchSnapshot = Object.freeze({
      active: true,
      bodyId: launch.bodyId,
      phase: progress < 0.18 ? 'ignition' : progress < 0.82 ? 'liftoff' : 'ascent',
      progress: Number(progress.toFixed(3)),
      altitude: Number(altitude.toFixed(2)),
      usesExistingPod: !temporary
    });
    appCtx.renderer.render(appCtx.scene, appCtx.camera);
    if (progress < 1) {
      requestAnimationFrame(frame);
      return;
    }
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
  return Object.freeze({
    active: !!stagedEarthPod?.parent,
    distance: Number.isFinite(stagedEarthPodDistance()) ? Number(stagedEarthPodDistance().toFixed(2)) : null,
    boardingRadius: Number(stagedEarthPod?.userData?.boardingRadius || 0),
    position: stagedEarthPod ? Object.freeze({
      x: Number(stagedEarthPod.position.x.toFixed(2)),
      y: Number(stagedEarthPod.position.y.toFixed(2)),
      z: Number(stagedEarthPod.position.z.toFixed(2))
    }) : null
  });
}

export { consumeStagedEarthPod, getStagedEarthPodSnapshot, playSurfacePodLaunch, releaseStagedEarthPod, stageEarthPod };
