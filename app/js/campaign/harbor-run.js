// Personal, optional career state. The world runtime supplies physical-road
// evidence; this model owns the durable cargo/route transitions, never money.
export const HARBOR_RUN = Object.freeze({ id: 'harbor-run', receiptId: 'event:campaign-completed:harbor-run:v1', schemaVersion: 1 });
const copy = value => structuredClone(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function normalizeHarborRun(value = {}) {
  if (value?.schemaVersion > 1) return copy(value);
  if (!value?.route) return { schemaVersion: 1, phase: 'available', revision: 0 };
  return { ...copy(value), schemaVersion: 1, revision: Math.max(0, Number(value.revision) || 0) };
}
export function validateDeliveryRoute(route) {
  if (!route || !route.id || !route.regionId || route.environment !== 'EARTH' || !Array.isArray(route.points)
      || route.points.length < 2 || route.points.length > 160) throw Error('This delivery route is not ready. Choose another route.');
  for (const point of [...route.points, route.pickup, route.dropoff, route.pickupCase, route.dropoffCase]) {
    if (!point || ![point.lat, point.lon, point.y].every(finite) || Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) throw Error('This delivery has an invalid stop.');
  }
  for (const key of ['id', 'regionId', 'regionLabel', 'destinationLabel']) {
    if (typeof route[key] !== 'string' || !route[key].trim() || route[key].length > 160) throw Error('This delivery needs a valid destination label.');
  }
  if (!finite(route.distance) || route.distance < 100 || route.distance > 2500 || !Number.isInteger(route.turns) || route.turns < 0) throw Error('This delivery is outside the supported local route size.');
  return route;
}
export function deliveryDistance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.lat-b.lat)*111000, (a.lon-b.lon)*111000*Math.cos(a.lat*Math.PI/180));
}
function stoppedAt(state, evidence, target) {
  return evidence?.environment === 'EARTH' && evidence?.regionId === state.route.regionId && evidence?.mode === 'drive'
    && evidence.road === true && finite(evidence.speed) && Math.abs(evidence.speed) < 0.6
    && finite(evidence.y) && Math.abs(evidence.y-target.y) < 2.5 && deliveryDistance(evidence, target) <= 8;
}
export function transitionHarborRun(input, command, now = Date.now()) {
  const state = normalizeHarborRun(input);
  if (state.schemaVersion !== 1) throw Error('This delivery needs a newer version of World Explorer.');
  if (command.revision !== state.revision) throw Error('Delivery progress changed in another window. Reopen the Journal to continue.');
  if (state.phase === 'complete') return state;
  const next = { ...state, revision: state.revision + 1 };
  if (command.type === 'accept') {
    if (state.phase !== 'available') throw Error('Your delivery is already saved. Continue it first.');
    const route = validateDeliveryRoute(command.route);
    return { ...next, route: copy(route), phase: 'pickup', acceptedAt: now, nextPoint: 0, cargo: 'at-pickup', loadedAt: 0, completedAt: 0 };
  }
  if (!state.route) throw Error('Choose a delivery route first.');
  const evidence = command.evidence;
  if (command.type === 'load') {
    if (state.phase !== 'pickup' || !stoppedAt(state, evidence, state.route.pickup)) throw Error('Stop your car beside the case to load it.');
    return { ...next, phase: 'driving', cargo: 'in-vehicle', loadedAt: now };
  }
  if (command.type === 'reach') {
    if (state.phase !== 'driving' || command.pointIndex !== state.nextPoint || evidence?.continuous !== true
        || evidence?.environment !== 'EARTH' || evidence?.regionId !== state.route.regionId || evidence?.mode !== 'drive' || evidence?.road !== true
        || !finite(evidence.y) || Math.abs(evidence.y-state.route.points[state.nextPoint].y) >= 2.5
        || deliveryDistance(evidence, state.route.points[state.nextPoint]) > 14) throw Error('Follow the marked road to the next route point.');
    const nextPoint = state.nextPoint + 1;
    return { ...next, nextPoint, phase: nextPoint === state.route.points.length ? 'unload' : 'driving' };
  }
  if (command.type === 'unload') {
    if (state.phase !== 'unload' || !stoppedAt(state, evidence, state.route.dropoff)) throw Error('Stop at the delivery marker before unloading.');
    return { ...next, phase: 'complete', cargo: 'delivered', completedAt: now };
  }
  throw Error('Unknown delivery action.');
}
export function harborRunBadge(state) {
  return state?.schemaVersion === 1 && state.phase === 'complete' ? { id: 'harbor-driver', label: 'Harbor Driver', detail: 'Loaded, drove and delivered a case along a checked road route.', earnedAt: state.completedAt } : null;
}
export function harborRunReceipt(state) {
  return {
    eventId: HARBOR_RUN.receiptId, eventType: 'campaign-completed', sourceSystem: 'explorer-campaign', sourceId: HARBOR_RUN.id,
    name: 'Harbor Run complete', detail: `Delivered the field case to ${state.route.destinationLabel}. Harbor Driver badge earned.`,
    pathId: 'travel', occurredAt: state.completedAt, regionId: state.route.regionId, regionLabel: state.route.regionLabel,
    environment: 'EARTH', locationKey: state.route.locationKey, locationSnapshot: state.route.locationSnapshot,
    projections: { profile: false, place: false },
    metadata: { chapterId: HARBOR_RUN.id, routeId: state.route.id, distanceMeters: state.route.distance, cargo: 'delivered', reward: 'harbor-driver' }
  };
}
