function finite(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function wrapAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngle(a, b, alpha) {
  return wrapAngle(a + wrapAngle(b - a) * alpha);
}

function capturePose(appCtx) {
  const walker = appCtx.Walk?.state?.walker || {};
  const character = appCtx.Walk?.state?.characterMesh;
  const drone = appCtx.drone || {};
  const plane = appCtx.planeMode || {};
  const mode = plane.active ? 'plane' : appCtx.droneMode ? 'drone' : appCtx.Walk?.state?.mode || 'drive';
  return {
    mode,
    car: {
      x: finite(appCtx.car?.x),
      y: finite(appCtx.carMesh?.position?.y, finite(appCtx.car?.y, 1.2)),
      z: finite(appCtx.car?.z),
      angle: finite(appCtx.car?.angle)
    },
    walk: {
      x: finite(walker.x),
      y: finite(walker.y, 1.7),
      feetY: finite(character?.position?.y, finite(walker.y, 1.7) - 1.7),
      z: finite(walker.z),
      angle: finite(walker.angle),
      yaw: finite(walker.yaw, finite(walker.angle)),
      pitch: finite(walker.pitch),
      lookYawOffset: finite(walker.lookYawOffset)
    },
    drone: {
      x: finite(drone.x),
      y: finite(drone.y),
      z: finite(drone.z),
      angle: finite(drone.yaw),
      pitch: finite(drone.pitch),
      roll: finite(drone.roll),
      cameraYawOffset: finite(drone.cameraYawOffset)
    },
    plane: {
      x: finite(plane.x),
      y: finite(plane.y),
      z: finite(plane.z),
      angle: finite(plane.yaw),
      pitch: finite(plane.pitch),
      roll: finite(plane.roll),
      cameraYaw: finite(plane.cameraYaw),
      cameraPitch: finite(plane.cameraPitch)
    }
  };
}

function interpolatePosition(previous, current, alpha, teleportDistance = 80) {
  const distance = Math.hypot(
    current.x - previous.x,
    current.y - previous.y,
    current.z - previous.z
  );
  const t = distance > teleportDistance ? 1 : alpha;
  return {
    x: previous.x + (current.x - previous.x) * t,
    y: previous.y + (current.y - previous.y) * t,
    z: previous.z + (current.z - previous.z) * t,
    angle: lerpAngle(previous.angle, current.angle, t)
  };
}

export function createRenderInterpolator(appCtx) {
  let previous = null;
  let current = null;
  let appliedFrames = 0;

  function reset() {
    previous = null;
    current = null;
    appCtx.presentationPose = null;
  }

  function beginFixedStep() {
    const pose = capturePose(appCtx);
    previous = current || pose;
  }

  function endFixedStep() {
    current = capturePose(appCtx);
    if (!previous || previous.mode !== current.mode) previous = current;
  }

  function apply(interpolation = 1) {
    if (!current) {
      current = capturePose(appCtx);
      previous = current;
    }
    if (!previous || previous.mode !== current.mode) previous = current;
    const alpha = Math.max(0, Math.min(1, finite(interpolation, 1)));
    const car = interpolatePosition(previous.car, current.car, alpha);
    const walkPosition = interpolatePosition(previous.walk, current.walk, alpha);
    const walk = {
      ...walkPosition,
      feetY: previous.walk.feetY + (current.walk.feetY - previous.walk.feetY) * alpha,
      yaw: lerpAngle(previous.walk.yaw, current.walk.yaw, alpha),
      pitch: previous.walk.pitch + (current.walk.pitch - previous.walk.pitch) * alpha,
      lookYawOffset: lerpAngle(previous.walk.lookYawOffset, current.walk.lookYawOffset, alpha)
    };
    const dronePosition = interpolatePosition(previous.drone, current.drone, alpha);
    const drone = {
      ...dronePosition,
      yaw: dronePosition.angle,
      pitch: previous.drone.pitch + (current.drone.pitch - previous.drone.pitch) * alpha,
      roll: previous.drone.roll + (current.drone.roll - previous.drone.roll) * alpha,
      cameraYawOffset: lerpAngle(previous.drone.cameraYawOffset, current.drone.cameraYawOffset, alpha)
    };
    const planePosition = interpolatePosition(previous.plane, current.plane, alpha);
    const plane = {
      ...planePosition,
      yaw: planePosition.angle,
      pitch: previous.plane.pitch + (current.plane.pitch - previous.plane.pitch) * alpha,
      roll: previous.plane.roll + (current.plane.roll - previous.plane.roll) * alpha,
      cameraYaw: lerpAngle(previous.plane.cameraYaw, current.plane.cameraYaw, alpha),
      cameraPitch: previous.plane.cameraPitch + (current.plane.cameraPitch - previous.plane.cameraPitch) * alpha
    };

    appCtx.presentationPose = { mode: current.mode, car, walk, drone, plane, interpolation: alpha };
    if (appCtx.carMesh && current.mode !== 'walk') {
      appCtx.carMesh.position.set(car.x, car.y, car.z);
      appCtx.carMesh.rotation.y = car.angle;
    }
    const character = appCtx.Walk?.state?.characterMesh;
    if (character && current.mode === 'walk') {
      character.position.set(walk.x, walk.feetY, walk.z);
      character.rotation.y = walk.angle;
    }
    const planeMesh = appCtx.planeMode?.mesh;
    if (planeMesh && current.mode === 'plane') {
      planeMesh.position.set(plane.x, plane.y, plane.z);
      planeMesh.rotation.order = 'YXZ';
      planeMesh.rotation.set(-plane.pitch, plane.yaw, -plane.roll);
    }
    appliedFrames += 1;
    return appCtx.presentationPose;
  }

  function snapshot() {
    return {
      owner: 'runtime/render-interpolation',
      active: !!current,
      appliedFrames,
      mode: current?.mode || null,
      interpolation: appCtx.presentationPose?.interpolation ?? null
    };
  }

  return { apply, beginFixedStep, endFixedStep, reset, snapshot };
}
