import { ctx as appCtx } from '../shared-context.js?v=55';

function wrapYaw(angle = 0) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function planetarySurface() {
  if (appCtx.onMars && appCtx.marsSurface) return appCtx.marsSurface;
  if (appCtx.onMoon && appCtx.moonSurface) return appCtx.moonSurface;
  return null;
}

export function updateDrone(dt) {
  const moveSpeed = appCtx.drone.speed * dt;
  const turnSpeed = 2 * dt;
  const forward = (appCtx.keys.KeyW ? 1 : 0) - (appCtx.keys.KeyS ? 1 : 0);
  const turn = (appCtx.keys.KeyA ? 1 : 0) - (appCtx.keys.KeyD ? 1 : 0);

  appCtx.drone.yaw += turn * turnSpeed;
  if (appCtx.keys.ArrowUp) appCtx.drone.pitch += turnSpeed;
  if (appCtx.keys.ArrowDown) appCtx.drone.pitch -= turnSpeed;
  appCtx.drone.cameraYawOffset = Number(appCtx.drone.cameraYawOffset) || 0;
  if (appCtx.keys.ArrowLeft) appCtx.drone.cameraYawOffset += turnSpeed;
  if (appCtx.keys.ArrowRight) appCtx.drone.cameraYawOffset -= turnSpeed;
  appCtx.drone.cameraYawOffset = wrapYaw(appCtx.drone.cameraYawOffset);

  appCtx.drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.drone.pitch));
  appCtx.drone.roll = 0;
  const vertical = (appCtx.keys.Space ? 1 : 0) -
    (appCtx.keys.ControlLeft || appCtx.keys.ControlRight || appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight ? 1 : 0);
  appCtx.drone.x += -Math.sin(appCtx.drone.yaw) * forward * moveSpeed;
  appCtx.drone.y += vertical * moveSpeed;
  appCtx.drone.z += -Math.cos(appCtx.drone.yaw) * forward * moveSpeed;

  let groundY = 0;
  const surface = planetarySurface();
  if (surface) {
    const raycaster = appCtx._getPhysRaycaster();
    appCtx._physRayStart.set(appCtx.drone.x, 2000, appCtx.drone.z);
    raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
    const hit = raycaster.intersectObject(surface, false)[0];
    if (Number.isFinite(hit?.point?.y)) groundY = hit.point.y;
  } else if (appCtx.terrainEnabled) {
    groundY = appCtx.elevationWorldYAtWorldXZ(appCtx.drone.x, appCtx.drone.z);
  }

  const planetary = !!surface;
  const minAltitude = groundY + 5;
  const maxAltitude = planetary ? groundY + 2000 : groundY + 400;
  appCtx.drone.y = Math.max(minAltitude, Math.min(maxAltitude, appCtx.drone.y));
  const worldLimit = planetary ? 4800 : 5000;
  appCtx.drone.x = Math.max(-worldLimit, Math.min(worldLimit, appCtx.drone.x));
  appCtx.drone.z = Math.max(-worldLimit, Math.min(worldLimit, appCtx.drone.z));
}
