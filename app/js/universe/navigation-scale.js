const LIGHT_YEAR_KM = 9.460730472e12;
const LIGHT_SPEED_KM_S = 299792.458;
const BASE_MAX_SCENE_SPEED = 4.5;

const FRAME_PROFILES = Object.freeze({
  planetary_system: Object.freeze({ sceneRadius: 420, maxVelocityC: 0.08 }),
  nebula: Object.freeze({ sceneRadius: 9000, maxVelocityC: 0.25 }),
  stellar_region: Object.freeze({ sceneRadius: 15000, maxVelocityC: 0.25 }),
  galaxy: Object.freeze({ sceneRadius: 900, maxVelocityC: 0.5 }),
  galaxy_cluster: Object.freeze({ sceneRadius: 1100, maxVelocityC: 0.5 }),
  black_hole: Object.freeze({ sceneRadius: 900, maxVelocityC: 0.02 })
});

function profileFor(entity) {
  const base = FRAME_PROFILES[entity?.objectClass] || FRAME_PROFILES.planetary_system;
  return {
    ...base,
    sceneRadius: Number(entity?.visualProfile?.navigationRadiusScene || base.sceneRadius)
  };
}

function physicalRadiusLy(entity) {
  const radius = Number(entity?.physical?.radiusLy);
  if (Number.isFinite(radius) && radius > 0) return radius;
  if (entity?.objectClass === 'planetary_system') {
    const maxAxisAu = Math.max(1, ...(entity.children || []).map((body) => Number(body.semiMajorAxisAu || 0)));
    return maxAxisAu / 63241.077;
  }
  return 1;
}

function getUniverseNavigationMetrics(entity, rocket, canonicalOffset, speed = 0) {
  const profile = profileFor(entity);
  const radiusLy = physicalRadiusLy(entity);
  const sceneOffsetVector = canonicalOffset?.clone?.() || new THREE.Vector3();
  if (rocket?.position) sceneOffsetVector.add(rocket.position);
  const sceneOffset = sceneOffsetVector.length();
  const offsetLy = sceneOffset / profile.sceneRadius * radiusLy;
  const speedFraction = Math.max(0, Math.min(1, Number(speed || 0) / BASE_MAX_SCENE_SPEED));
  const velocityC = speedFraction * profile.maxVelocityC;
  const velocityKmS = velocityC * LIGHT_SPEED_KM_S;
  const coordinateRateLyS = Number(speed || 0) * 60 * radiusLy / profile.sceneRadius;
  const physicalRateLyS = velocityKmS / LIGHT_YEAR_KM;
  const timeAcceleration = velocityKmS > 0
    ? Math.max(1, coordinateRateLyS / physicalRateLyS)
    : 1;

  return {
    frameRadiusLy: radiusLy,
    frameSpanLy: radiusLy * 2,
    offsetLy,
    sceneRadius: profile.sceneRadius,
    timeAcceleration,
    velocityC,
    velocityKmS
  };
}

export { LIGHT_SPEED_KM_S, getUniverseNavigationMetrics, profileFor };
