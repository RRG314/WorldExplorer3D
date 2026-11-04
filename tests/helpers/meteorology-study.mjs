// Controlled pure-domain measurements only. Never a source-gameplay seed.
import {
  normalizeMeteorologyCareer,
  transitionMeteorologyCareer,
  meteorologyTarget,
  METEOROLOGY_STUDIES,
  METEOROLOGY_PROTOCOL,
  METEOROLOGY_CALIBRATION,
  meteorologyReading,
  meteorologyCloudCue,
  meteorologyVerification,
} from '../../app/js/campaign/meteorology-career.js';
import { meteorologySourceSnapshot } from '../../app/js/campaign/meteorology-source.js';
import { earthCoordinateFrame } from '../../app/js/earth-core/coordinate-frame.js?v=1';
export function meteorologyHarness(
  initial,
  variantId = 'campaign',
  runId = 'weather-study-case-0001',
  clockNow = 1000000
) {
  let state = normalizeMeteorologyCareer(initial),
    now = Math.max(clockNow, (state.active?.completedAt || 0) + 1000);
  const events = [],
    study = METEOROLOGY_STUDIES[variantId],
    frame = earthCoordinateFrame({ lat: 39.3173, lon: -76.64044 }, 111000),
    local = { a: { x: -6, z: 0 }, b: { x: 6, z: 0 }, bench: { x: 0, z: 8 } },
    site = {
      id: 'virtual-weather-fixture',
      name: 'Weather training course',
      truthType: 'virtual-training-site',
      location: frame.toGeographic(0, 0),
      locationContext: { ...frame.toGeographic(0, 0), name: 'Park' },
      points: Object.fromEntries(
        Object.entries(local).map(([id, p]) => [id, frame.toGeographic(p.x, p.z)])
      ),
    };
  function step(type, fields = {}) {
    const evidence = {
        supported: true,
        verticalDistance: 0,
        environment: 'EARTH',
        travelMode: 'walk',
        liveGps: false,
        siteId: site.id,
        position: site.points[meteorologyTarget(state.active || { phase: 'source' })],
        at: now,
        localPosition: { x: 0, y: 0, z: 0 },
      },
      result = transitionMeteorologyCareer(
        state,
        {
          type,
          revision: state.revision,
          ...fields,
          ...(['accept', 'relocate'].includes(type) ? {} : { evidence }),
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
  function source() {
    const snapshot = meteorologySourceSnapshot({}, now);
    return step('source-check', {
      source: snapshot,
      classification: snapshot.classification,
      ageBand: snapshot.ageBand,
      plan: 'explicit-simulated-replay',
    });
  }
  function reading() {
    const a = state.active,
      id = meteorologyTarget(a),
      visit = a.phase === 'verify' ? 'verification' : 'baseline',
      setting = study[visit === 'verification' ? 'after' : 'before'],
      sheltered = id === 'b' && setting.from > 225 && setting.from < 315,
      speed = setting.speed * (sheltered ? 0.35 : 1),
      theta = (setting.from * Math.PI) / 180,
      origin = local[id],
      wind = { x: Math.sin(theta), z: -Math.cos(theta) };
    return {
      protocol: METEOROLOGY_PROTOCOL,
      truthType: 'virtual-weather-instruments',
      runId: a.runId,
      siteId: site.id,
      stationId: id,
      visit,
      referenceTime: study.referenceTime + (visit === 'verification' ? 3600000 : 0),
      startedAt: now - 8200,
      completedAt: now - 100,
      activeSeconds: 8.01,
      excludedSeconds: 0.09,
      metersPerUnit: 1,
      calibration: METEOROLOGY_CALIBRATION,
      heightMeters: 2,
      sensorPosition: { x: origin.x, y: 2, z: origin.z },
      groundPosition: { x: origin.x, y: 0, z: origin.z },
      samples: [0, 4, 8].map((t) => ({
        activeSeconds: t,
        rotorAngle: (t * speed * 2 * Math.PI) / METEOROLOGY_CALIBRATION,
        vaneBase: { x: origin.x, y: 2, z: origin.z },
        vaneTip: { x: origin.x + wind.x * 0.4, y: 2, z: origin.z + wind.z * 0.4 },
        cloudPaths: Array.from({ length: 9 }, (_, i) => ({
          index: i,
          from: { x: origin.x + (i % 3) * 0.1, y: 1, z: origin.z + Math.floor(i / 3) * 0.1 },
          to: { x: origin.x + (i % 3) * 0.1, y: 1.5, z: origin.z + Math.floor(i / 3) * 0.1 },
          covered: i < setting.clouds,
        })),
        exposurePaths: Array.from({ length: 4 }, (_, i) => ({
          index: i,
          from: { x: origin.x, y: 2, z: origin.z },
          to: { x: origin.x + wind.x * 2, y: 2, z: origin.z + wind.z * 2 },
          blocked: sheltered,
        })),
      })),
    };
  }
  function measure(mutate, fields = {}) {
    now += 10000;
    const r = reading();
    mutate?.(r);
    return step('measure', {
      reading: r,
      windMeaning: 'from-true-north',
      speedUnit: 'm/s',
      cloudCue: meteorologyCloudCue(meteorologyReading(r)),
      ...fields,
    });
  }
  function forecast(fields = {}) {
    return step('forecast', {
      forecast: {
        truthType: 'virtual-replay-forecast',
        speedLow: 3,
        speedHigh: 5,
        directionFrom: study.before.from,
        directionHalfwidth: 45,
        cloudTrend: variantId === 'turning-north' ? 'less' : 'similar',
        ...fields,
      },
    });
  }
  function report(fields = {}) {
    const v = meteorologyVerification(state.active);
    return step('report', {
      outcome:
        v.speedInRange && v.directionInRange && v.cloudTrendMatched
          ? 'within-all-bounds'
          : 'one-or-more-missed',
      limit: 'replay-not-public-forecast-validation',
      followUp: 'repeat-matched-time-and-independent-observations',
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
    source,
    reading,
    measure,
    forecast,
    report,
  };
}
