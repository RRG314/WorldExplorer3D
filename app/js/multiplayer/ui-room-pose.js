import { ctx as appCtx } from '../shared-context.js?v=55';
import { finiteNumber, isDroneModeActive, isWalkModeActive, sanitizeText } from './ui-room-support.js?v=2';

function readWorldContext() {
  const lat = finiteNumber(appCtx.LOC?.lat, finiteNumber(appCtx.customLoc?.lat, 0));
  const lon = finiteNumber(appCtx.LOC?.lon, finiteNumber(appCtx.customLoc?.lon, 0));
  const locName = appCtx.selLoc === 'custom'
    ? sanitizeText(appCtx.customLoc?.name || 'Custom', 80)
    : sanitizeText(appCtx.LOCS?.[appCtx.selLoc]?.name || appCtx.selLoc || 'Custom', 80);

  const kind = appCtx.spaceFlight?.active ? 'space' : appCtx.onMoon ? 'moon' : 'earth';
  return {
    kind,
    lat,
    lon,
    name: locName,
    seed: `latlon:${lat.toFixed(5)},${lon.toFixed(5)}`
  };
}

function createPoseSnapshotBase(world) {
  const activeInterior = appCtx.activeInterior || null;
  return {
    mode: world.kind === 'space' ? 'space' : 'drive',
    frame: {
      kind: world.kind,
      locLat: world.lat,
      locLon: world.lon,
      interiorKey: String(activeInterior?.key || '').trim(),
      buildingKey: String(activeInterior?.support?.key || activeInterior?.building?.sourceBuildingId || '').trim(),
      interiorLabel: String(activeInterior?.label || '').trim(),
      interiorFloorId: String(activeInterior?.floorId || '').trim(),
      interiorFloorLevel: Math.max(0, Math.floor(finiteNumber(activeInterior?.activeLevel, 0)))
    },
    pose: {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      vx: 0,
      vy: 0,
      vz: 0
    }
  };
}

function applyPose(base, values = {}) {
  if (!base || !base.pose || !values || typeof values !== 'object') return;
  const pose = base.pose;
  if (Object.prototype.hasOwnProperty.call(values, 'x')) pose.x = finiteNumber(values.x, pose.x);
  if (Object.prototype.hasOwnProperty.call(values, 'y')) pose.y = finiteNumber(values.y, pose.y);
  if (Object.prototype.hasOwnProperty.call(values, 'z')) pose.z = finiteNumber(values.z, pose.z);
  if (Object.prototype.hasOwnProperty.call(values, 'yaw')) pose.yaw = finiteNumber(values.yaw, pose.yaw);
  if (Object.prototype.hasOwnProperty.call(values, 'pitch')) pose.pitch = finiteNumber(values.pitch, pose.pitch);
  if (Object.prototype.hasOwnProperty.call(values, 'vx')) pose.vx = finiteNumber(values.vx, pose.vx);
  if (Object.prototype.hasOwnProperty.call(values, 'vy')) pose.vy = finiteNumber(values.vy, pose.vy);
  if (Object.prototype.hasOwnProperty.call(values, 'vz')) pose.vz = finiteNumber(values.vz, pose.vz);
}

function readSpacePose(base) {
  const rocket = appCtx.spaceFlight?.rocket;
  if (!rocket) return false;

  base.mode = 'space';
  applyPose(base, {
    x: rocket.position?.x,
    y: rocket.position?.y,
    z: rocket.position?.z,
    vx: appCtx.spaceFlight?.velocity?.x,
    vy: appCtx.spaceFlight?.velocity?.y,
    vz: appCtx.spaceFlight?.velocity?.z
  });

  if (globalThis.THREE && rocket.quaternion) {
    const euler = new globalThis.THREE.Euler().setFromQuaternion(rocket.quaternion, 'YXZ');
    applyPose(base, { yaw: euler.y, pitch: euler.x });
  }
  return true;
}

function readDronePose(base) {
  if (!isDroneModeActive()) return false;
  base.mode = 'drone';
  base.pose.x = finiteNumber(appCtx.drone?.x, finiteNumber(appCtx.car?.x, 0));
  base.pose.y = finiteNumber(appCtx.drone?.y, finiteNumber(appCtx.car?.y, 0));
  base.pose.z = finiteNumber(appCtx.drone?.z, finiteNumber(appCtx.car?.z, 0));
  base.pose.yaw = finiteNumber(appCtx.drone?.yaw, finiteNumber(appCtx.car?.angle, 0));
  base.pose.pitch = finiteNumber(appCtx.drone?.pitch, 0);
  return true;
}

function readWalkPose(base) {
  if (!isWalkModeActive()) return false;
  base.mode = 'walk';
  base.pose.x = finiteNumber(appCtx.Walk?.state?.walker?.x, finiteNumber(appCtx.car?.x, 0));
  base.pose.y = finiteNumber(appCtx.Walk?.state?.walker?.y, finiteNumber(appCtx.car?.y, 0));
  base.pose.z = finiteNumber(appCtx.Walk?.state?.walker?.z, finiteNumber(appCtx.car?.z, 0));
  base.pose.yaw = finiteNumber(appCtx.Walk?.state?.walker?.yaw, finiteNumber(appCtx.car?.angle, 0));
  base.pose.pitch = finiteNumber(appCtx.Walk?.state?.walker?.pitch, 0);
  base.pose.vy = finiteNumber(appCtx.Walk?.state?.walker?.vy, 0);
  return true;
}

function readPoseSnapshot() {
  const world = readWorldContext();
  const base = createPoseSnapshotBase(world);

  if (appCtx.spaceFlight?.active && readSpacePose(base)) return base;
  if (readDronePose(base)) return base;
  if (readWalkPose(base)) return base;

  base.mode = 'drive';
  applyPose(base, {
    x: appCtx.car?.x,
    y: appCtx.car?.y,
    z: appCtx.car?.z,
    yaw: appCtx.car?.angle,
    vx: appCtx.car?.vx,
    vy: appCtx.car?.vy,
    vz: appCtx.car?.vz
  });
  return base;
}


export { readPoseSnapshot, readWorldContext };
