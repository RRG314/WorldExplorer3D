import { canonicalFieldRecord } from './field-study-contract.js';
const copy = (v) => structuredClone(v);
const sameStop = (a, b) =>
  a &&
  b &&
  Number.isFinite(a.y) &&
  Math.abs(a.y - b.y) < 2.5 &&
  Math.abs(a.lat - b.lat) < 1e-9 &&
  Math.abs(a.lon - b.lon) < 1e-9;
export const PILOT_ASSIGNMENTS = Object.freeze({
  campaign: {
    id: 'campaign',
    label: 'Harbor Run',
    question:
      'Choose a supported road route, load the field case, drive it carefully and stop to unload.',
  },
  'return-case': {
    id: 'return-case',
    label: 'Field Case Return',
    question:
      'Retrieve the delivered field case and bring it back on a freshly checked driving route.',
  },
});
export function pilotContinuations(value) {
  const p = value?.continuations;
  if (!p) return { schemaVersion: 1, jobs: {} };
  if (p.schemaVersion !== 1) return copy(p);
  if (
    !p.jobs ||
    typeof p.jobs !== 'object' ||
    Array.isArray(p.jobs) ||
    Object.keys(p.jobs).some((id) => id !== 'return-case')
  )
    throw Error(
      'This saved transport assignment cannot be read safely. Your original delivery is kept.'
    );
  return copy(p);
}
export function pilotAssignment(value, id = 'campaign') {
  if (!Object.hasOwn(PILOT_ASSIGNMENTS, id))
    throw Error('Choose an available transport assignment.');
  if (id === 'campaign') return copy(value);
  const p = pilotContinuations(value);
  if (p.schemaVersion !== 1)
    throw Error('This saved transport assignment needs a newer version of World Explorer.');
  return copy(p.jobs[id] || { schemaVersion: 1, phase: 'available', revision: 0 });
}
export function transitionPilotContinuation(base, command, now, transition) {
  if (base.schemaVersion !== 1)
    throw Error('This delivery needs a newer version of World Explorer.');
  if (command.assignmentId !== 'return-case' || base.phase !== 'complete' || !base.route)
    throw Error('Complete Harbor Run before returning its field case.');
  if (command.revision !== base.revision)
    throw Error('Delivery progress changed in another window. Reopen the Journal to continue.');
  const p = pilotContinuations(base);
  if (p.schemaVersion !== 1)
    throw Error('This saved transport assignment needs a newer version of World Explorer.');
  const previous = pilotAssignment(base, command.assignmentId);
  if (command.type === 'finish')
    throw Error('The earned BMW finish belongs to your original Harbor Run.');
  if (command.type === 'accept') {
    const route = command.route,
      original = base.route;
    if (
      !route ||
      route.distanceUnits !== 'm' ||
      route.continuationOf !== original.id ||
      route.caseId !== `field-case:${original.id}` ||
      route.regionId !== original.regionId ||
      !sameStop(route.pickup, original.dropoff) ||
      !sameStop(route.dropoff, original.pickup) ||
      !sameStop(route.pickupCase, original.dropoffCase) ||
      !sameStop(route.dropoffCase, original.pickupCase)
    )
      throw Error('Review the checked return route for the same delivered field case.');
  }
  const job = transition(previous, { ...command, revision: previous.revision }, now);
  delete job.finishId;
  if (canonicalFieldRecord(job) === canonicalFieldRecord(previous)) return copy(base);
  p.jobs[command.assignmentId] = job;
  return { ...copy(base), revision: base.revision + 1, continuations: p };
}
export function pilotReturnReceipt(base) {
  const job = pilotAssignment(base, 'return-case');
  if (job.phase !== 'complete')
    throw Error('Unload the returned field case before saving its report.');
  return {
    eventId: 'event:campaign:pilot-return-case:v1',
    eventType: 'campaign-completed',
    sourceSystem: 'explorer-campaign',
    sourceId: 'pilot-return-case',
    pathId: 'travel',
    name: 'Field Case Return',
    detail: `Returned the same field case on a checked ${job.route.distance} m driving route.${job.distinction === 'steady-cargo' ? ' Steady cargo distinction earned.' : ''}`,
    occurredAt: job.completedAt,
    regionId: job.route.regionId,
    regionLabel: job.route.regionLabel,
    environment: 'EARTH',
    locationKey: job.route.locationKey,
    locationSnapshot: job.route.locationSnapshot,
    points: 0,
    projections: { profile: false, place: false },
    metadata: {
      careerId: 'pilot',
      variantId: 'return-case',
      parentReceiptId: 'event:campaign-completed:harbor-run:v1',
      pilotDeliveryReport: {
        schemaVersion: 1,
        assignmentId: 'return-case',
        caseId: job.route.caseId,
        originalRouteId: base.route.id,
        delivery: copy(job),
      },
    },
  };
}
export function pilotSummary(base = {}, variantId = 'campaign') {
  const p = pilotContinuations(base);
  if (base.schemaVersion > 1 || p.schemaVersion !== 1)
    return {
      title: 'Update required',
      summary:
        'Your original delivery is kept. This saved transport assignment needs a newer version.',
      choices: [],
      stages: [],
    };
  const job = pilotAssignment(base, variantId),
    done = job.phase === 'complete';
  return {
    title: PILOT_ASSIGNMENTS[variantId]?.label || 'Harbor Run',
    summary: PILOT_ASSIGNMENTS[variantId]?.question || '',
    resume: ['pickup', 'driving', 'unload'].includes(job.phase),
    actionLabel: done ? 'Review saved delivery' : undefined,
    choices: Object.values(PILOT_ASSIGNMENTS)
      .filter((r) =>
        ['pickup', 'driving', 'unload'].includes(p.jobs['return-case']?.phase)
          ? r.id === 'return-case'
          : r.id === 'campaign' || base.phase === 'complete'
      )
      .map(({ id, label }) => ({ id, label })),
    stages: [
      ['Choose and review a physically supported driving route', !!job.route],
      ['Stop at the case and load it', !!job.loadedAt],
      ['Follow the road gates with the case aboard', ['unload', 'complete'].includes(job.phase)],
      ['Stop and unload at the receiving marker', done],
      ['Review the saved delivery and choose your next journey', done],
    ].map(([label, complete]) => ({ label, complete: !!complete })),
  };
}

export function latestPilotAssignment(base) {
  return pilotContinuations(base).jobs?.['return-case'] ? 'return-case' : 'campaign';
}
