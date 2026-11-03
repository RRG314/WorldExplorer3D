import { earthCoordinateFrame } from '../../app/js/earth-core/coordinate-frame.js?v=1';
import {
  normalizeOceanographyCareer,
  transitionOceanographyCareer,
  OCEANOGRAPHY_PROTOCOL as P,
  OCEANOGRAPHY_STUDIES,
  virtualWaterColumnReading
} from '../../app/js/campaign/oceanography-career.js';
import { COASTAL_SITES } from '../../app/js/campaign/coastal-departure.js';
export function oceanographyHarness(
  initial,
  variantId = 'campaign',
  runId = 'oceanography-case-0001'
) {
  let state = normalizeOceanographyCareer(initial),
    now = 1000000,
    local = { x: 0, y: -8, z: 0 },
    position = { ...COASTAL_SITES[0] };
  const events = [],
    study = OCEANOGRAPHY_STUDIES[variantId];
  const voyage = (underwater) => ({
    version: 1,
    id: 'voyage-ocean-study-1',
    subId: 'sub:research:study-1',
    stage: underwater ? 'underwater' : 'aboard',
    revision: 1,
    savedAt: now,
    site: { lat: position.lat, lon: position.lon, name: 'Authored training station' },
    waveOffset: { x: 0, z: 0 },
    ship: {
      transportEntityId: 'research:study-1',
      transportCatalogId: 'ocean-research-vessel',
      condition: 1,
      yaw: 0,
      anchor: { lat: position.lat, lon: position.lon }
    },
    sub: { ...local, yaw: 0, condition: 1 }
  });
  function evidence(stationId, underwater = false) {
    return {
      voyage: voyage(underwater),
      shared: false,
      liveGps: false,
      paused: false,
      at: now,
      position: underwater
        ? earthCoordinateFrame(position, 111000).toGeographic(local.x, local.z)
        : { lat: position.lat, lon: position.lon },
      localPosition: { ...local },
      environment: underwater ? 'OCEAN' : 'EARTH',
      mode: underwater ? 'submarine' : 'research-deck',
      stationId,
      stationDistanceMeters: 1,
      moored: true,
      speedMetersPerSecond: 0
    };
  }
  function step(type, fields = {}, e = evidence('chart')) {
    const result = transitionOceanographyCareer(
      state,
      { type, revision: state.revision, evidence: e, ...fields },
      now
    );
    state = result.state;
    if (result.event) events.push(result.event);
    now += 10000;
    return result;
  }
  function accept() {
    return step('accept', {
      runId,
      variantId,
      protocolId: P.id,
      stationOrder: COASTAL_SITES.map((s) => s.id),
      stationDepths: COASTAL_SITES.map((s) => ({
        ...s,
        stationId: s.id,
        truthType: 'modeled',
        depthMeters: 30,
        sourceId: 'fixture-archived-chart',
        fetchedAt: '2026-01-01',
        navigationSafe: false
      }))
    });
  }
  function castData() {
    const station = COASTAL_SITES[state.active.stationIndex];
    position = { ...station };
    return {
      protocolId: P.id,
      stationId: station.id,
      runId: state.active.runId,
      voyageId: state.active.voyage.id,
      truthType: 'authored-water-column-simulation',
      sourceId: `${P.sourceId}:${variantId}:${station.id}`,
      method: 'virtual-ctd-downcast',
      units: { depth: 'm', temperature: 'degC', practicalSalinity: 'unitless' },
      position: { lat: position.lat, lon: position.lon },
      startedAt: now - 8000,
      completedAt: now - 100,
      activeSeconds: 7.8,
      maximumDriftMeters: 0.1,
      samples: P.depths.map((depthMeters, i) => ({
        depthMeters,
        ...virtualWaterColumnReading(variantId, station.id, depthMeters),
        at: now - 6000 + i * 2000
      }))
    };
  }
  function cast(overrides = {}) {
    const c = { ...castData(), ...overrides };
    return step('cast', { cast: c }, evidence('sub'));
  }
  function pingData(id) {
    const i = ['habitat', 'rock', 'case'].indexOf(id);
    local = { x: i * 8, y: -8, z: 0 };
    const target = { id, x: local.x + 8, y: -12, z: 12, radius: 2 };
    return {
      truthType: 'authored-geometry',
      method: 'geometry-sonar',
      voyageId: state.active.voyage.id,
      target,
      distanceMeters: Math.hypot(8, 4, 12),
      lineClear: true,
      inCone: true,
      speedMetersPerSecond: 0,
      uncertaintyMeters: 5,
      sampledBottomY: -20,
      at: now,
      position: evidence(null, true).position,
      studyPosition: { ...local },
      samplePosition: { ...local },
      metersPerUnit: 1
    };
  }
  function ping(id, overrides = {}) {
    const r = { ...pingData(id), ...overrides };
    return step('ping', { return: r }, evidence(null, true));
  }
  function mapping() {
    for (const id of ['habitat', 'rock', 'case']) ping(id);
    step(
      'select-target',
      { targetId: study.target, uncertainty: 'return-shape-not-identification' },
      evidence(null, true)
    );
  }
  function inspect(fields = {}) {
    return step(
      'inspect',
      {
        observation: {
          targetId: study.target,
          method: 'direct-submersible-view',
          truthType: 'authored-geometry',
          visible: true,
          lineClear: true,
          distanceMeters: 3,
          at: now,
          position: evidence(null, true).position,
          studyPosition: { ...local },
          form: {
            habitat: 'branching-colonies-on-rock',
            rock: 'unbroken-mineral-surface',
            case: 'straight-edges-and-latches'
          }[study.target],
          ...fields
        }
      },
      evidence(null, true)
    );
  }
  function returned(fields = {}) {
    return step(
      'return-approach',
      {
        return: {
          shipId: 'research:study-1',
          subId: 'sub:research:study-1',
          distanceMeters: 3,
          depthMeters: 8,
          at: now,
          ...fields
        }
      },
      evidence(null, true)
    );
  }
  function report(fields = {}) {
    return step(
      'report',
      {
        result: study.result,
        limitation: study.limit,
        geometryContext: 'virtual-feature-not-a-regional-cause',
        followUp: 'repeat-matched-profiles-other-time',
        ...fields
      },
      evidence('lab')
    );
  }
  return {
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    events,
    study,
    evidence,
    step,
    accept,
    castData,
    cast,
    pingData,
    ping,
    mapping,
    inspect,
    returned,
    report
  };
}
