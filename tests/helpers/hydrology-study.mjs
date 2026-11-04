import {
  normalizeHydrologyCareer,
  transitionHydrologyCareer,
  HYDROLOGY_STUDIES,
  HYDROLOGY_PROTOCOL,
  hydrologyTarget,
  hydrologyFlowConclusion,
} from '../../app/js/campaign/hydrology-career.js';
import { HYDROLOGY_REFERENCE } from '../../app/js/campaign/hydrology-reference.js';
import { earthCoordinateFrame } from '../../app/js/earth-core/coordinate-frame.js?v=1';
export function hydrologyHarness(
  initial,
  variantId = 'campaign',
  runId = 'hydrology-study-case-0001',
  clockNow = 1000000
) {
  let state = normalizeHydrologyCareer(initial),
    now = Math.max(clockNow, (state.active?.completedAt || 0) + 1000);
  const events = [],
    study = HYDROLOGY_STUDIES[variantId],
    frame = earthCoordinateFrame({ lat: 39.3173, lon: -76.64044 }, 111000),
    site = {
      id: 'virtual-hydrology-fixture',
      name: 'Virtual stream course',
      truthType: 'virtual-training-site',
      location: frame.toGeographic(0, 0),
      locationContext: { ...frame.toGeographic(0, 0), name: 'Park' },
      points: Object.fromEntries(
        Object.entries({ a: { x: -5, z: 0 }, b: { x: 5, z: 0 }, bench: { x: 0, z: 8 } }).map(
          ([id, p]) => [id, frame.toGeographic(p.x, p.z)]
        )
      ),
    };
  const evidence = () => ({
    supported: true,
    verticalDistance: 0,
    environment: 'EARTH',
    travelMode: 'walk',
    liveGps: false,
    siteId: site.id,
    position: site.points[hydrologyTarget(state.active)],
    at: now,
    localPosition: { x: 0, y: 0, z: 0 },
  });
  function step(type, fields = {}) {
    const result = transitionHydrologyCareer(
      state,
      {
        type,
        revision: state.revision,
        ...fields,
        ...(type === 'accept' || type === 'relocate' ? {} : { evidence: evidence() }),
      },
      now
    );
    state = result.state;
    if (result.event) events.push(result.event);
    now += 100;
    return result;
  }
  function accept() {
    return step('accept', { variantId, runId, site });
  }
  function trace() {
    return step('trace', {
      flowDirection: 'upstream-to-downstream',
      stations: 'dry-bank-a-and-b',
      trace: {
        truthType: 'visible-virtual-stream',
        runId: state.active.runId,
        siteId: state.active.site.id,
        clearView: true,
        from: { x: 0, y: 1, z: 0 },
        to: { x: 0.4, y: 1, z: 0 },
        metersPerUnit: 1,
        activeSeconds: 2,
        startedAt: now - 2200,
        completedAt: now - 100,
        at: now - 100,
      },
    });
  }
  function reading() {
    const a = state.active,
      id = hydrologyTarget(a),
      phase = a.phase === 'revisit' ? 'return' : 'baseline',
      settings = study[phase === 'return' ? 'after' : 'before'],
      x = id === 'a' ? -5 : 5,
      seconds = Math.max(8, 1 / Math.min(...settings.speeds) + 0.1);
    return {
      protocol: HYDROLOGY_PROTOCOL,
      truthType: 'virtual-stream-instruments',
      runId: a.runId,
      siteId: site.id,
      stationId: id,
      visit: phase,
      condition: phase === 'baseline' ? 'baseline' : study.condition,
      metersPerUnit: 1,
      widthMeters: 0.9,
      depthMeters: 0.25,
      section: {
        left: { x, y: 0.9, z: -0.45 },
        right: { x, y: 0.9, z: 0.45 },
        surface: { x, y: 0.9, z: 0 },
        bed: { x, y: 0.65, z: 0 },
      },
      startedAt: now - (seconds + 0.3) * 1000,
      completedAt: now - 100,
      activeSeconds: seconds,
      excludedSeconds: 0.2,
      lanes: settings.speeds.map((v, i) => ({
        index: i,
        startPosition: { x, y: 0.9, z: (i - 1) * 0.2 },
        endPosition: { x: x + 1, y: 0.9, z: (i - 1) * 0.2 },
        startedAt: 0,
        finishedAt: 1 / v,
      })),
      optical: [0, 3, 6].map((t) => ({
        activeSeconds: t,
        paths: Array.from({ length: 9 }, (_, index) => ({
          index,
          from: { x: 0, y: 0.8, z: index * 0.02 },
          to: { x: 0.25, y: 0.8, z: index * 0.02 },
          blocked: index < settings.blocked[id === 'a' ? 0 : 1],
          ...(index < settings.blocked[id === 'a' ? 0 : 1] ? { hitMeters: 0.12 } : {}),
        })),
      })),
    };
  }
  function measure(value = reading(), fields = {}) {
    return step('measure', {
      reading: value,
      flowUnit: 'm3/s',
      clarityMeaning: 'virtual-obstruction-not-calibrated-ntu',
      ...fields,
    });
  }
  function context() {
    return step('context', {
      catchment: 'authored-margins-not-a-source-test',
      reference: HYDROLOGY_REFERENCE,
      publicLimit: 'different-river-and-dates',
    });
  }
  function declare() {
    return step('declare', { condition: study.condition, truthType: 'declared-virtual-return' });
  }
  function report(fields = {}) {
    return step('report', {
      flowResult: hydrologyFlowConclusion(state.active),
      cause: 'change-observed-source-unestablished',
      followUp: 'repeat-matched-stations-and-source-measurements',
      ...fields,
    });
  }
  return {
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    events,
    site,
    study,
    step,
    accept,
    trace,
    reading,
    measure,
    context,
    declare,
    report,
  };
}
