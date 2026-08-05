const SURFACE_PROFILES = Object.freeze({
  asphalt: Object.freeze({ kind: 'asphalt', label: 'ROAD', grip: 1, rolling: 1, accel: 1, topSpeed: 1, drift: 1 }),
  gravel: Object.freeze({ kind: 'gravel', label: 'GRAVEL', grip: 0.74, rolling: 1.34, accel: 0.84, topSpeed: 0.76, drift: 0.96 }),
  rock: Object.freeze({ kind: 'rock', label: 'ROCK', grip: 0.72, rolling: 1.4, accel: 0.78, topSpeed: 0.72, drift: 0.76 })
});

export function resolveVehicleSurface(appCtx) {
  if (appCtx.onMars) return SURFACE_PROFILES.rock;
  if (appCtx.onMoon) return SURFACE_PROFILES.gravel;
  // Earth driving has one neutral handling profile. Road proximity still
  // selects the correct physical deck, but surface tags, land use, and terrain
  // never branch vehicle physics.
  return SURFACE_PROFILES.asphalt;
}

export function updateVehicleSurface(appCtx, dt) {
  const car = appCtx.car;
  const target = resolveVehicleSurface(appCtx);
  if (!car.surfaceDynamics) {
    car.surfaceDynamics = { ...target };
  } else {
    const blend = 1 - Math.exp(-Math.max(0, dt) * 2.4);
    for (const key of ['grip', 'rolling', 'accel', 'topSpeed', 'drift']) {
      car.surfaceDynamics[key] += (target[key] - car.surfaceDynamics[key]) * blend;
    }
    car.surfaceDynamics.kind = target.kind;
    car.surfaceDynamics.label = target.label;
  }
  car.surfaceKind = target.kind;
  return car.surfaceDynamics;
}

export function sampleEarthVehicleGroundContact(appCtx, options = {}) {
  const x = Number(options.x) || 0;
  const z = Number(options.z) || 0;
  const angle = Number(options.angle) || 0;
  const currentY = Number.isFinite(Number(options.currentY)) ? Number(options.currentY) : NaN;
  const preferRoad = options.preferRoad !== false;
  const halfWheelBase = Math.max(0.5, Number(options.halfWheelBase) || 1.45);
  const halfTrack = Math.max(0.35, Number(options.halfTrack) || 0.85);
  const forwardX = Math.sin(angle);
  const forwardZ = Math.cos(angle);
  const rightX = Math.cos(angle);
  const rightZ = -Math.sin(angle);
  const points = [
    { id: 'center', x, z },
    { id: 'front', x: x + forwardX * halfWheelBase, z: z + forwardZ * halfWheelBase },
    { id: 'rear', x: x - forwardX * halfWheelBase, z: z - forwardZ * halfWheelBase },
    { id: 'right', x: x + rightX * halfTrack, z: z + rightZ * halfTrack },
    { id: 'left', x: x - rightX * halfTrack, z: z - rightZ * halfTrack }
  ];
  const samples = points.map((point) => {
    const sample = appCtx.SurfaceQuery?.driveAt?.(point.x, point.z, {
      preferRoad,
      currentY,
      sampleRenderedMesh: false,
      nearestRoad: point.id === 'center' ? options.nearestRoad : null,
      preferredRoadOnly: point.id !== 'center' && preferRoad
    });
    return {
      ...point,
      y: Number(sample?.position?.y),
      kind: String(sample?.kind || ''),
      feature: sample?.feature || null
    };
  }).filter((sample) => Number.isFinite(sample.y));
  if (samples.length === 0) return null;
  const rawById = Object.fromEntries(samples.map((sample) => [sample.id, sample]));
  const center = rawById.center || samples[0];
  const centerY = center.y;
  // A narrow mountain road can put the left/right footprint probes just
  // outside the asphalt. Those probes belong to the adjacent hillside, not
  // the vehicle's suspension. Once the center owns a road deck, accept only
  // road samples on the same vertically continuous deck.
  const roadCentered = center.kind === 'road';
  const supportSamples = roadCentered
    ? samples.filter((sample) =>
        sample.kind === 'road' &&
        (
          sample.feature === center.feature ||
          Math.abs(sample.y - centerY) <= 2.5
        )
      )
    : samples;
  const byId = Object.fromEntries(supportSamples.map((sample) => [sample.id, sample]));
  const frontY = Number.isFinite(byId.front?.y) ? byId.front.y : centerY;
  const rearY = Number.isFinite(byId.rear?.y) ? byId.rear.y : centerY;
  const rightY = Number.isFinite(byId.right?.y) ? byId.right.y : centerY;
  const leftY = Number.isFinite(byId.left?.y) ? byId.left.y : centerY;
  return Object.freeze({
    centerY,
    supportY: Math.max(centerY, ...supportSamples.map((sample) => sample.y)),
    pitch: Math.max(-0.55, Math.min(0.55, -Math.atan2(frontY - rearY, halfWheelBase * 2))),
    roll: Math.max(-0.45, Math.min(0.45, Math.atan2(rightY - leftY, halfTrack * 2))),
    sampleCount: samples.length,
    supportSampleCount: supportSamples.length,
    roadCentered
  });
}

export function createEarthVehicleGroundContactSampler(appCtx, options = {}) {
  const refreshInterval = Math.max(1 / 60, Number(options.refreshInterval) || 1 / 30);
  const movementThreshold = Math.max(0.5, Number(options.movementThreshold) || 3.5);
  const turnThreshold = Math.max(0.02, Number(options.turnThreshold) || 0.14);
  let cachedContact = null;
  let hasSample = false;
  let elapsed = Infinity;
  let lastX = NaN;
  let lastZ = NaN;
  let lastAngle = NaN;
  let lastFrameToken;

  function reset() {
    cachedContact = null;
    hasSample = false;
    elapsed = Infinity;
    lastX = NaN;
    lastZ = NaN;
    lastAngle = NaN;
    lastFrameToken = undefined;
  }

  function sample(sampleOptions = {}, dt = 0, frameToken) {
    elapsed += Math.max(0, Number(dt) || 0);
    const sameRenderedFrame = frameToken !== undefined && frameToken === lastFrameToken;
    if (hasSample && sameRenderedFrame) return cachedContact;

    const x = Number(sampleOptions.x) || 0;
    const z = Number(sampleOptions.z) || 0;
    const angle = Number(sampleOptions.angle) || 0;
    const moved = Number.isFinite(lastX) && Math.hypot(x - lastX, z - lastZ) >= movementThreshold;
    const turned = Number.isFinite(lastAngle) &&
      Math.abs(Math.atan2(Math.sin(angle - lastAngle), Math.cos(angle - lastAngle))) >= turnThreshold;
    const shouldRefresh = !hasSample || elapsed >= refreshInterval || moved || turned;

    lastFrameToken = frameToken;
    if (!shouldRefresh) return cachedContact;

    cachedContact = sampleEarthVehicleGroundContact(appCtx, sampleOptions);
    hasSample = true;
    elapsed = 0;
    lastX = x;
    lastZ = z;
    lastAngle = angle;
    return cachedContact;
  }

  return Object.freeze({ reset, sample });
}

export function stabilizeEarthVehicleSurfaceY(rawSurfaceY, previousSurfaceY, dt, speed = 0) {
  const raw = Number(rawSurfaceY);
  const previous = Number(previousSurfaceY);
  if (!Number.isFinite(raw)) return Number.isFinite(previous) ? previous : 0;
  if (!Number.isFinite(previous)) return raw;
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  const maximumDownwardStep = Math.max(0.35, step * (8 + Math.abs(Number(speed) || 0) * 0.45));
  return Math.max(raw, previous - maximumDownwardStep);
}

export { SURFACE_PROFILES };
