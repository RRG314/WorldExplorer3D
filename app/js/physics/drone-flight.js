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
  const previousX = appCtx.drone.x;
  const previousY = appCtx.drone.y;
  const previousZ = appCtx.drone.z;
  const actions = appCtx.readControlActions?.('drone') || {};
  const moveSpeed = appCtx.drone.speed * dt;
  const turnSpeed = 2 * dt;
  const forward = Number(actions.move) || 0;
  const turn = Number(actions.turn) || 0;

  appCtx.drone.yaw += turn * turnSpeed;
  appCtx.drone.pitch += (Number(actions.lookPitch) || 0) * turnSpeed;
  appCtx.drone.cameraYawOffset = Number(appCtx.drone.cameraYawOffset) || 0;
  appCtx.drone.cameraYawOffset += (Number(actions.lookYaw) || 0) * turnSpeed;
  appCtx.drone.cameraYawOffset = wrapYaw(appCtx.drone.cameraYawOffset);

  appCtx.drone.pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, appCtx.drone.pitch));
  appCtx.drone.roll = 0;
  const vertical = Number(actions.vertical) || 0;
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
    groundY = appCtx.SurfaceQuery?.terrainAt?.(appCtx.drone.x, appCtx.drone.z)?.position?.y ?? 0;
  }

  const planetary = !!surface;
  const minAltitude = groundY + 5;
  const maxAltitude = planetary ? groundY + 2000 : groundY + 400;
  appCtx.drone.y = Math.max(minAltitude, Math.min(maxAltitude, appCtx.drone.y));
  const earthLimit = Number(appCtx.SurfaceQuery?.getTraversalBounds?.().horizontalRadius);
  const worldLimit = planetary ? 4800 : Number.isFinite(earthLimit) && earthLimit > 0 ? earthLimit : null;
  if (worldLimit !== null) {
    appCtx.drone.x = Math.max(-worldLimit, Math.min(worldLimit, appCtx.drone.x));
    appCtx.drone.z = Math.max(-worldLimit, Math.min(worldLimit, appCtx.drone.z));
  }
  const elapsed = Math.max(0.001, dt);
  appCtx.drone.vx = (appCtx.drone.x - previousX) / elapsed;
  appCtx.drone.vy = (appCtx.drone.y - previousY) / elapsed;
  appCtx.drone.vz = (appCtx.drone.z - previousZ) / elapsed;
}
