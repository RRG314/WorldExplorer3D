const LIVING_WORLD_DEMAND_BY_TIER = Object.freeze({
  low: Object.freeze({ pedestrians: 10, vehicles: 6, pedestrianRadius: 250, vehicleRadius: 420 }),
  performance: Object.freeze({ pedestrians: 22, vehicles: 13, pedestrianRadius: 310, vehicleRadius: 520 }),
  balanced: Object.freeze({ pedestrians: 38, vehicles: 24, pedestrianRadius: 390, vehicleRadius: 640 }),
  quality: Object.freeze({ pedestrians: 56, vehicles: 36, pedestrianRadius: 470, vehicleRadius: 760 })
});

const TIME_DEMAND = Object.freeze({
  sunrise: Object.freeze({ pedestrians: .76, vehicles: .94, label: 'morning-travel' }),
  day: Object.freeze({ pedestrians: 1, vehicles: 1, label: 'daytime-activity' }),
  sunset: Object.freeze({ pedestrians: .9, vehicles: 1, label: 'evening-travel' }),
  night: Object.freeze({ pedestrians: .52, vehicles: .58, label: 'overnight-activity' })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}

function normalizeTrafficFlowSnapshot(snapshot = null, options = {}) {
  if (!snapshot || typeof snapshot !== 'object') return Object.freeze({ available: false, reason: 'unavailable' });
  const currentSpeed = finite(snapshot.currentSpeed ?? snapshot.speed, NaN);
  const freeFlowSpeed = finite(snapshot.freeFlowSpeed ?? snapshot.freeFlow, NaN);
  const updatedAt = Date.parse(snapshot.updatedAt || snapshot.sourceUpdated || '') || finite(snapshot.updatedAtMs, 0);
  const now = finite(options.now, Date.now());
  const maximumAgeMs = Math.max(60_000, finite(options.maximumAgeMs, 15 * 60_000));
  if (!(currentSpeed >= 0) || !(freeFlowSpeed > 0)) return Object.freeze({ available: false, reason: 'invalid-speeds' });
  if (!(updatedAt > 0) || now - updatedAt > maximumAgeMs || updatedAt - now > 60_000) {
    return Object.freeze({ available: false, reason: 'stale' });
  }
  const speedRatio = clamp(currentSpeed / freeFlowSpeed, .08, 1.15);
  const confidence = clamp(snapshot.confidence ?? 1, 0, 1);
  return Object.freeze({
    available: true,
    source: String(snapshot.source || 'normalized-provider'),
    updatedAt,
    ageMs: Math.max(0, now - updatedAt),
    currentSpeed,
    freeFlowSpeed,
    speedRatio,
    confidence,
    speedScale: 1 - (1 - speedRatio) * confidence,
    demandScale: 1 + clamp(1 - speedRatio, 0, .75) * .32 * confidence
  });
}

function resolveLivingWorldDemand(options = {}) {
  const tier = String(options.tier || 'balanced').toLowerCase();
  const base = LIVING_WORLD_DEMAND_BY_TIER[tier] || LIVING_WORLD_DEMAND_BY_TIER.balanced;
  const phase = String(options.timePhase || 'day').toLowerCase();
  const time = TIME_DEMAND[phase] || TIME_DEMAND.day;
  const flow = normalizeTrafficFlowSnapshot(options.liveFlow, options);
  const vehicleDemandScale = flow.available ? flow.demandScale : 1;
  const vehicleSpeedScale = flow.available ? flow.speedScale : 1;
  return Object.freeze({
    tier: LIVING_WORLD_DEMAND_BY_TIER[tier] ? tier : 'balanced',
    phase: TIME_DEMAND[phase] ? phase : 'day',
    activityBand: time.label,
    pedestrians: base.pedestrians,
    vehicles: base.vehicles,
    pedestrianActiveRatio: clamp(time.pedestrians, .35, 1),
    vehicleActiveRatio: clamp(time.vehicles * vehicleDemandScale, .4, 1),
    pedestrianRadius: base.pedestrianRadius,
    vehicleRadius: base.vehicleRadius,
    pedestrianExitRadius: base.pedestrianRadius * 1.42,
    vehicleExitRadius: base.vehicleRadius * 1.32,
    vehicleSpeedScale: clamp(vehicleSpeedScale, .12, 1.08),
    liveFlow: flow
  });
}

function populationEdgeWeight(edge = {}, kind = 'pedestrian') {
  const activity = clamp(edge.activityScore, 0, 8);
  if (kind === 'pedestrian') {
    if (edge.role === 'entrance') return (edge.commercial ? 7 : 3.4) + activity;
    if (edge.provenance === 'mapped_path') return 2.8 + activity * .8;
    if (edge.role === 'crossing') return .45 + activity * .25;
    return 1 + activity * .7;
  }
  const roadClass = String(edge.roadClass || '').toLowerCase();
  const roadWeight = /motorway|trunk|primary/.test(roadClass) ? 3.2
    : /secondary|tertiary/.test(roadClass) ? 2.1
      : /service|track/.test(roadClass) ? .38 : 1;
  return roadWeight + activity * .18;
}

function activityLabelForEdge(edge = {}, kind = 'pedestrian') {
  if (kind === 'vehicle') {
    return /motorway|trunk|primary/i.test(String(edge.roadClass || '')) ? 'through-traffic' : 'local-traffic';
  }
  if (edge.role === 'entrance' && edge.commercial) return 'visiting shops';
  if (edge.role === 'entrance') return 'entering a building';
  if (edge.provenance === 'mapped_path') return 'walking a mapped path';
  if (Number(edge.activityScore || 0) >= 3) return 'walking near local places';
  return 'walking locally';
}

export {
  LIVING_WORLD_DEMAND_BY_TIER,
  TIME_DEMAND,
  activityLabelForEdge,
  normalizeTrafficFlowSnapshot,
  populationEdgeWeight,
  resolveLivingWorldDemand
};
