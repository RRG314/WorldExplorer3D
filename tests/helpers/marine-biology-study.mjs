import { prepareSurfaceVoyage } from '../../app/js/ocean/voyage.js';
import { earthCoordinateFrame } from '../../app/js/earth-core/coordinate-frame.js?v=1';
import { createMarineObservationRecorder } from '../../app/js/campaign/marine-observation-recorder.js';
import {
  normalizeMarineBiologyCareer,
  transitionMarineBiologyCareer,
  MARINE_BIOLOGY_STUDIES,
  marineBehaviorOptions,
  marineHabitatComparison,
} from '../../app/js/campaign/marine-biology-career.js';
export function marineBiologyHarness(
  initial,
  variantId = 'campaign',
  runId = 'marine-biology-case-0001'
) {
  let state = normalizeMarineBiologyCareer(initial),
    now = Math.max(1000000, (state.active?.completedAt || 0) + 1000),
    p = { x: 0, y: -1, z: 0 };
  const study = MARINE_BIOLOGY_STUDIES[variantId],
    events = [],
    frame = earthCoordinateFrame(study.site, 111000),
    voyage = prepareSurfaceVoyage(
      study.site,
      { x: 0, z: 0 },
      { model: 'geographic-metres-v1', entryDepthMeters: 500, origin: study.site }
    );
  voyage.savedAt = now;
  function evidence(underwater = true, stationId = null) {
    return {
      voyage: {
        ...voyage,
        stage: underwater ? 'underwater' : 'aboard',
        sub: { ...voyage.sub, ...p },
      },
      at: now,
      shared: false,
      liveGps: false,
      paused: false,
      position: frame.toGeographic(p.x, p.z),
      localPosition: { ...p },
      environment: underwater ? 'OCEAN' : 'EARTH',
      mode: underwater ? 'submarine' : 'research-deck',
      stationId,
      stationDistanceMeters: 1,
      moored: true,
      speedMetersPerSecond: 0,
    };
  }
  function step(type, fields = {}, e = evidence()) {
    const result = transitionMarineBiologyCareer(
      state,
      { type, revision: state.revision, evidence: e, ...fields },
      now
    );
    state = result.state;
    if (result.event) events.push(result.event);
    now += 100;
    return result;
  }
  function accept() {
    return step('accept', { variantId, runId }, evidence(false));
  }
  function window(kind, overrides = {}) {
    const index = state.active.habitats.length,
      baseX = kind === 'habitat' ? index * 40 : 0;
    p = {
      x: baseX,
      y: kind === 'surface' ? -1 : kind === 'habitat' ? -study.actorDepths[index] : -8,
      z: 0,
    };
    let clock = 0;
    const recorder = createMarineObservationRecorder({ clock: () => clock, wallClock: () => now }),
      method =
        kind === 'surface'
          ? 'surface-watch-v1'
          : kind === 'follow'
            ? 'individual-follow-v1'
            : study.method,
      dolphin = study.followKind === 'dolphin',
      id = dolphin ? 'dolphin-1' : 'fish-1',
      habitatId = study.habitats[index],
      target = { x: baseX + 7.5, y: p.y, z: 10 },
      config = {
        runId: state.active.runId,
        voyageId: voyage.id,
        subId: voyage.subId,
        kind,
        method,
        sceneId: 'controlled-model-scene',
        viewProtocol: 'licensed-mesh-camera-150ms-v1',
        seconds: 8,
        metersPerUnit: 1,
        ...(kind === 'habitat' ? { habitatId } : {}),
        ...(kind === 'follow' ? { individualId: id } : {}),
        ...(method === 'habitat-transect-v1' ? { gates: [{ ...p }, { ...p, x: baseX + 15 }] } : {}),
      };
    function sample(i) {
      const animal = {
        truthType: 'simulated-licensed-animal',
        visible: true,
        lineClear: true,
        individualId: id,
        speciesId: dolphin ? 'short_beaked_common_dolphin' : 'giant_trevally',
        kind: dolphin ? 'dolphin' : 'fish',
        assetId: dolphin ? 'marine-common-dolphin' : 'fixture-licensed-trevally',
        position: {
          x: baseX + i * 0.1,
          y:
            kind === 'habitat'
              ? -(study.depthBands[index][0] + study.depthBands[index][1]) / 2
              : -8,
          z: dolphin ? 70 : 8,
        },
        distanceMeters: Math.hypot(
          i * 0.1 + (method === 'habitat-transect-v1' ? -15 * Math.min(1, i / 80) : 0),
          (kind === 'habitat'
            ? -(study.depthBands[index][0] + study.depthBands[index][1]) / 2
            : -8) - p.y,
          dolphin ? 70 : 8
        ),
        minimumDistanceMeters: dolphin ? 50 : 5,
        observerPosition: { ...p },
        waterSurfaceY: 0,
        depthMeters:
          kind === 'habitat' ? (study.depthBands[index][0] + study.depthBands[index][1]) / 2 : 8,
        observedAt: now,
      };
      return {
        supported: true,
        sceneId: 'controlled-model-scene',
        voyageId: voyage.id,
        subId: voyage.subId,
        position: { ...p },
        speedMetersPerSecond: 0,
        observations:
          kind === 'surface' || (kind === 'habitat' && study.depthBands[index][0] >= 20)
            ? []
            : [animal],
        context: {
          observerPosition: { ...p },
          waterSurfaceY: 0,
          depthMeters: -p.y,
          depthTruth: 'measured-game-depth',
          depthSourceId: 'water-surface-observer-position-v1',
          light: {
            truthType: 'scene-lighting',
            sourceId: 'rendered-ocean-light-v1',
            relative: 0.7,
          },
          current: { truthType: 'unavailable' },
          ...(kind === 'habitat'
            ? {
                habitat: {
                  id: habitatId,
                  truthType: 'virtual-habitat-view',
                  ready: true,
                  visible: true,
                  lineClear: true,
                  licensedInvertebrates: false,
                  position: target,
                  coordinate: frame.toGeographic(target.x, target.z),
                  distanceMeters: Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z),
                },
              }
            : {}),
        },
      };
    }
    recorder.start(config, sample(0));
    for (let i = 1; i <= 85 && !recorder.snapshot().ready; i++) {
      clock += 100;
      now += 100;
      if (method === 'habitat-transect-v1') p.x = baseX + 15 * Math.min(1, i / 80);
      recorder.tick(0.1, sample(i));
    }
    const result = recorder.result();
    recorder.dispose();
    return { ...result, ...overrides };
  }
  function file(kind, value = window(kind), fields = {}) {
    return step(
      kind === 'surface' ? 'surface-watch' : kind === 'habitat' ? 'habitat-watch' : 'follow',
      {
        window: value,
        confidence: value.observations.length ? 'virtual-label-supported' : 'not-observed',
        ...(kind === 'follow'
          ? {
              behavior: marineBehaviorOptions(value)[0],
              interpretation: 'observed-motion-not-feeding-or-intent',
            }
          : {}),
        ...fields,
      }
    );
  }
  function compare(fields = {}) {
    return step(
      'compare',
      {
        result: marineHabitatComparison(state.active).result,
        limitation: 'individual-records-not-population-or-cause',
        currentLimit: 'no-local-current-measurement',
        ...fields,
      },
      evidence(false, 'lab')
    );
  }
  function report(fields = {}) {
    return step(
      'report',
      {
        followUp: study.habitats[0],
        followUpMethod: 'repeat-matched-effort-other-time',
        ...fields,
      },
      evidence(false, 'lab')
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
    voyage,
    evidence,
    step,
    accept,
    window,
    file,
    compare,
    report,
  };
}
