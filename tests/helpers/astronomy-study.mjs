// Controlled pure-domain shapes, never source gameplay or an exposure clock.
import { earthCoordinateFrame } from '../../app/js/earth-core/coordinate-frame.js?v=1';
import {
  normalizeAstronomyCareer,
  transitionAstronomyCareer,
  astronomyTarget,
  astronomyFrameRole,
  astronomyExposurePlan,
  astronomyAnalysis,
} from '../../app/js/campaign/astronomy-career.js';
import {
  astronomyAxis,
  syntheticDetectorFrame,
  encodeDetectorFrame,
} from '../../app/js/campaign/astronomy-instrument.js';
export function astronomyHarness(
  initial,
  variantId = 'campaign',
  runId = 'astronomy-controlled-case-0001'
) {
  let state = normalizeAstronomyCareer(initial),
    now = Math.max(Date.parse('2026-11-03T02:00:00Z'), (state.active?.completedAt || 0) + 1000);
  const frame = earthCoordinateFrame({ lat: 39.3173, lon: -76.64044 }, 111000),
    points = { a: { x: -6, z: 0 }, b: { x: 6, z: 0 }, bench: { x: 0, z: 8 } },
    site = {
      id: 'virtual-observatory-controlled',
      name: 'Controlled observatory',
      truthType: 'virtual-training-site',
      location: frame.toGeographic(0, 0),
      points: Object.fromEntries(
        Object.entries(points).map(([k, p]) => [k, frame.toGeographic(p.x, p.z)])
      ),
    },
    events = [];
  function command(action, options = {}) {
    now += 100;
    const a = state.active,
      id = a ? astronomyTarget(a) : 'a',
      p = points[id],
      evidence = {
        environment: 'EARTH',
        travelMode: 'walk',
        liveGps: false,
        supported: true,
        verticalDistance: 0,
        position: site.points[id],
        siteId: site.id,
        at: now,
        localPosition: { x: p.x, y: 0, z: p.z },
      };
    const result = transitionAstronomyCareer(
      state,
      { ...action, revision: state.revision, evidence, ...options },
      now
    );
    state = result.state;
    if (result.event) events.push(result.event);
    return result;
  }
  function capture() {
    const a = state.active,
      role = astronomyFrameRole(a),
      plan = astronomyExposurePlan(a, role),
      startedAt = now + 100,
      endedAt = startedAt + plan.seconds * 1000;
    now = endedAt;
    return {
      instrumentId: a.site.id,
      role,
      axis: astronomyAxis(plan.pointing.azimuth, plan.pointing.altitude),
      opticalState: plan.shutter === 'closed' ? 'covered-reference' : 'open-and-clear',
      image: encodeDetectorFrame(
        syntheticDetectorFrame({
          target: a.target,
          location: a.site.location,
          referenceTime: a.referenceTime,
          pointing: plan.pointing,
          seconds: plan.seconds,
          seed: 54321 + events.length,
          shutter: plan.shutter,
          hotPixel: plan.hotPixel,
        })
      ),
      effort: {
        runId: a.runId,
        habitatId: a.site.id + ':' + role,
        method: 'astronomy-exposure',
        complete: true,
        interrupted: false,
        liveGps: false,
        supported: true,
        sensor: { aligned: true },
        targetSeconds: plan.seconds,
        activeSeconds: plan.seconds,
        observerDistanceMeters: 0,
        startedAt,
        endedAt,
        excludedSeconds: 0,
      },
    };
  }
  function align() {
    const a = state.active,
      p = a.catalogDirection;
    return command({
      type: 'align',
      alignment: {
        instrumentId: a.site.id,
        clear: true,
        azimuth: p.azimuth,
        altitude: p.altitude,
        axis: astronomyAxis(p.azimuth, p.altitude),
      },
    });
  }
  function finish() {
    if (state.active.phase === 'align') align();
    if (state.active.phase === 'configure')
      command({ type: 'configure', seconds: variantId === 'exposure-bracket' ? 8 : 2 });
    while (['primary', 'controls'].includes(state.active.phase))
      command({ type: 'expose', exposure: capture() });
    if (state.active.phase === 'analyze')
      command({
        type: 'analyze',
        catalogHip: state.active.target.hip,
        outcome: astronomyAnalysis(state.active).outcome,
        limit: 'synthetic-not-calibrated-sky-discovery',
      });
    if (state.active.phase === 'publish') command({ type: 'publish' });
    return state;
  }
  command({ type: 'accept', variantId, runId, site });
  return {
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    events,
    site,
    command,
    capture,
    align,
    finish,
  };
}
