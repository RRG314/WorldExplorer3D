import { clamp } from "./dynamics.js?v=1";

export function createBoatRuntimeDynamics(deps = {}) {
  const {
    appCtx,
    applyBoatWavePose,
    findNearestBoatCandidate,
    getBoatWaveProfile,
    getSeaStateConfig,
    localizeBoatCandidate,
    measureBoatShorelineDistance,
    minimumBoatShorelineDistance,
    resolveBoatSpawnPoint,
    setBoatActorPose,
    syncBoatTerrainSuppression,
    updateBoatFoamFx,
    updateBoatLodBias,
    updateBoatMesh,
    updateBoatWaterPatch
  } = deps;

  return function updateBoatMode(dt) {
    if (!appCtx.boatMode?.active) return false;
    const cfg = getSeaStateConfig();
    const profile = getBoatWaveProfile(appCtx.boatMode.currentWater || null);
    const left = !!(appCtx.keys.KeyA || appCtx.keys.ArrowLeft);
    const right = !!(appCtx.keys.KeyD || appCtx.keys.ArrowRight);
    const throttle = !!(appCtx.keys.KeyW || appCtx.keys.ArrowUp);
    const reverse = !!(appCtx.keys.KeyS || appCtx.keys.ArrowDown);
    const brake = !!appCtx.keys.Space;

    if (!Number.isFinite(appCtx.boat.forwardSpeed)) appCtx.boat.forwardSpeed = Number(appCtx.boat.speed) || 0;
    if (!Number.isFinite(appCtx.boat.lateralSpeed)) appCtx.boat.lateralSpeed = 0;
    if (!Number.isFinite(appCtx.boat.throttle)) appCtx.boat.throttle = 0;

    const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
    const throttleTarget = throttle ? 1 : reverse ? -0.58 : 0;
    appCtx.boat.throttle += (throttleTarget - appCtx.boat.throttle) * clamp(dt * 3.6, 0.06, 0.24);

    const maxForwardSpeed = Math.max(1, cfg.speedMax || 1);
    const speedNorm = clamp(Math.abs(appCtx.boat.forwardSpeed) / maxForwardSpeed, 0, 1.4);
    const waveDirX = Number.isFinite(appCtx.boatMode.waveDirectionX) ? appCtx.boatMode.waveDirectionX : Math.sin(appCtx.boat.angle);
    const waveDirZ = Number.isFinite(appCtx.boatMode.waveDirectionZ) ? appCtx.boatMode.waveDirectionZ : Math.cos(appCtx.boat.angle);
    const forwardDotWave = Math.sin(appCtx.boat.angle) * waveDirX + Math.cos(appCtx.boat.angle) * waveDirZ;
    const headSea = clamp(-forwardDotWave, 0, 1);
    const followingSea = clamp(forwardDotWave, 0, 1);
    const driveAccel = appCtx.boat.throttle >= 0 ?
      appCtx.boat.throttle * cfg.accel * (1 - speedNorm * 0.14) :
      appCtx.boat.throttle * cfg.accel * 0.68;
    const hullDrag =
      (0.26 + profile.intensity * 0.22 + headSea * 0.12) *
      appCtx.boat.forwardSpeed * Math.abs(appCtx.boat.forwardSpeed) /
      Math.max(26, maxForwardSpeed * 0.9);
    const idleBrake = throttle || reverse ? 0 : Math.sign(appCtx.boat.forwardSpeed) * (1.4 + profile.intensity * 0.5);
    const slamDrag = Number(appCtx.boatMode.slamStrength || 0) * 1.2 + Math.abs(appCtx.boat.verticalVelocity || 0) * 0.08;
    appCtx.boat.forwardSpeed += (driveAccel - hullDrag - idleBrake - slamDrag) * dt;
    if (brake) appCtx.boat.forwardSpeed *= Math.exp(-4.4 * dt);
    else appCtx.boat.forwardSpeed *= Math.pow(cfg.drag, Math.max(1, dt * 60));
    appCtx.boat.forwardSpeed = clamp(appCtx.boat.forwardSpeed, -maxForwardSpeed * 0.28, maxForwardSpeed);

    const lateralDamper =
      profile.waterKind === 'harbor' || profile.waterKind === 'channel' ? 4.8 :
      profile.waterKind === 'open_ocean' ? 2.3 :
      3.2;
    const rudderSlide = steerInput * appCtx.boat.forwardSpeed * 0.018;
    appCtx.boat.lateralSpeed += (-appCtx.boat.lateralSpeed * lateralDamper + rudderSlide) * dt;
    if (brake) appCtx.boat.lateralSpeed *= Math.exp(-3.6 * dt);
    appCtx.boat.lateralSpeed = clamp(appCtx.boat.lateralSpeed, -maxForwardSpeed * 0.18, maxForwardSpeed * 0.18);

    const steerAuthority = clamp(0.12 + Math.abs(appCtx.boat.forwardSpeed) / maxForwardSpeed * 1.12, 0.12, 1.24);
    const desiredTurn = steerInput * (0.2 + steerAuthority * 1.12) * (1 - profile.intensity * 0.04);
    const turnBlend = clamp(dt * (2.2 + steerAuthority * 1.6 + Math.abs(appCtx.boat.lateralSpeed) * 0.08), 0.04, 0.26);
    appCtx.boat.turnRate += (desiredTurn - appCtx.boat.turnRate) * turnBlend;
    appCtx.boat.turnRate -= appCtx.boat.lateralSpeed * 0.008 * dt;
    appCtx.boat.angle += appCtx.boat.turnRate * dt * (0.42 + steerAuthority * 0.84);

    const forwardX = Math.sin(appCtx.boat.angle);
    const forwardZ = Math.cos(appCtx.boat.angle);
    const rightX = Math.cos(appCtx.boat.angle);
    const rightZ = -Math.sin(appCtx.boat.angle);
    const driftStrength = profile.driftSpeed * (0.28 + profile.intensity * 0.78) * (0.7 + followingSea * 0.22);
    const desiredVX = forwardX * appCtx.boat.forwardSpeed + rightX * appCtx.boat.lateralSpeed + waveDirX * driftStrength;
    const desiredVZ = forwardZ * appCtx.boat.forwardSpeed + rightZ * appCtx.boat.lateralSpeed + waveDirZ * driftStrength;
    const velocityBlend =
      profile.waterKind === 'harbor' || profile.waterKind === 'channel' ? clamp(dt * 6.2, 0.08, 0.26) :
      profile.waterKind === 'open_ocean' ? clamp(dt * 3.4, 0.05, 0.18) :
      clamp(dt * 4.4, 0.06, 0.2);
    appCtx.boat.vx += (desiredVX - appCtx.boat.vx) * velocityBlend;
    appCtx.boat.vz += (desiredVZ - appCtx.boat.vz) * velocityBlend;
    if (brake) {
      appCtx.boat.vx *= Math.exp(-2.4 * dt);
      appCtx.boat.vz *= Math.exp(-2.4 * dt);
    }
    appCtx.boat.speed = appCtx.boat.forwardSpeed;

    const nextX = appCtx.boat.x + appCtx.boat.vx * dt;
    const nextZ = appCtx.boat.z + appCtx.boat.vz * dt;
    const nextCandidate = findNearestBoatCandidate(nextX, nextZ, 24);
    if (!nextCandidate) {
      appCtx.boat.speed *= 0.45;
      appCtx.boat.forwardSpeed *= 0.45;
      appCtx.boat.lateralSpeed *= 0.42;
      appCtx.boat.vx *= 0.42;
      appCtx.boat.vz *= 0.42;
      applyBoatWavePose(appCtx.boat.x, appCtx.boat.z, appCtx.boat.angle, appCtx.boatMode.currentWater || null, dt, false);
    } else {
      const nextShorelineDistance = nextCandidate.inside ? measureBoatShorelineDistance(nextCandidate, nextX, nextZ) : 0;
      const desiredDepth = minimumBoatShorelineDistance(nextCandidate.waterKind);
      const shouldCorrectShallowArea =
        nextCandidate.type === 'area' &&
        nextCandidate.inside &&
        (nextCandidate.waterKind === 'open_ocean' || nextCandidate.waterKind === 'coastal') &&
        nextShorelineDistance < desiredDepth * 0.72;
      const spawnPoint = shouldCorrectShallowArea ?
        resolveBoatSpawnPoint(nextCandidate, nextX, nextZ) :
        nextCandidate.inside ? { x: nextX, z: nextZ, shorelineDistance: nextShorelineDistance } :
        resolveBoatSpawnPoint(nextCandidate, nextX, nextZ);
      const activeCandidate = localizeBoatCandidate(
        nextCandidate,
        Number(spawnPoint?.shorelineDistance || nextCandidate.shorelineDistance || nextShorelineDistance || 0)
      );
      appCtx.boatMode.currentWater = activeCandidate;
      appCtx.boatMode.waterKind = activeCandidate?.waterKind || nextCandidate.waterKind;
      appCtx.boatMode.shorelineDistance = Number(activeCandidate?.shorelineDistance || 0);
      appCtx.boatMode.offshoreDistance = Number(activeCandidate?.shorelineDistance || 0);
      setBoatActorPose(
        Number.isFinite(spawnPoint?.x) ? spawnPoint.x : nextCandidate.spawnX,
        Number.isFinite(spawnPoint?.z) ? spawnPoint.z : nextCandidate.spawnZ,
        appCtx.boat.angle,
        activeCandidate,
        { dt }
      );
    }

    updateBoatLodBias();
    syncBoatTerrainSuppression();
    updateBoatWaterPatch(appCtx.boatMode.currentWater || null);
    updateBoatMesh();
    updateBoatFoamFx(dt, profile);

    if (!Number.isFinite(appCtx.boatMode._terrainTimer)) appCtx.boatMode._terrainTimer = 0;
    appCtx.boatMode._terrainTimer += dt;
    const terrainInterval =
      appCtx.boatMode.detailBias <= 0.4 ? 1.6 :
      appCtx.boatMode.detailBias <= 0.58 ? 1.15 :
      appCtx.boatMode.detailBias <= 0.76 ? 0.9 : 0.65;
    if (appCtx.boatMode._terrainTimer > terrainInterval) {
      appCtx.boatMode._terrainTimer = 0;
      if (typeof appCtx.updateTerrainAround === 'function' && !appCtx.worldLoading) {
        appCtx.updateTerrainAround(appCtx.boat.x, appCtx.boat.z);
      }
      if (typeof appCtx.updateWorldLod === 'function') appCtx.updateWorldLod(false);
    }

    if (appCtx.isRecording) {
      const last = appCtx.customTrack[appCtx.customTrack.length - 1];
      if (!last || Math.hypot(appCtx.boat.x - last.x, appCtx.boat.z - last.z) > 10) {
        appCtx.customTrack.push({ x: appCtx.boat.x, z: appCtx.boat.z });
      }
    }
    return true;
  };
}
