import {
  WILDLIFE_OFFSETS,
  WILDLIFE_STUDIES,
  WILDLIFE_METHODS,
  normalizeWildlifeCareer,
  transitionWildlifeCareer,
  wildlifeTarget,
  wildlifeEffortComparison
} from '../../app/js/campaign/wildlife-career.js';
import { researchPhotoId } from '../../app/js/campaign/research-media.js';
export function wildlifeSite() {
  const location = { lat: 39.3189, lon: -76.6363 };
  return {
    id: 'virtual-wildlife:test',
    name: 'Virtual habitat pair',
    truthType: 'virtual-training-site',
    location,
    locationContext: { ...location, name: 'Druid Hill Park' },
    points: Object.fromEntries(
      Object.entries(WILDLIFE_OFFSETS).map(([id, p]) => [
        id,
        {
          lat: location.lat - p.z / 111000,
          lon: location.lon + p.x / (111000 * Math.cos((location.lat * Math.PI) / 180))
        }
      ])
    )
  };
}
export function wildlifeHarness(
  initial,
  variantId = 'campaign',
  runId = 'wildlife-case-0001',
  chosenMethod
) {
  let state = normalizeWildlifeCareer(initial),
    now = 1000;
  const events = [],
    items = [],
    study = WILDLIFE_STUDIES[variantId];
  const command = (type, fields = {}) => ({
    type,
    revision: state.revision,
    ...fields,
    ...(['accept', 'relocate'].includes(type)
      ? {}
      : {
          evidence: {
            environment: 'EARTH',
            travelMode: 'walk',
            liveGps: false,
            supported: true,
            verticalDistance: 1.7,
            siteId: state.active.site.id,
            position: state.active.site.points[wildlifeTarget(state.active)],
            at: now
          }
        })
  });
  function step(type, fields = {}) {
    const result = transitionWildlifeCareer(state, command(type, fields), now);
    state = result.state;
    if (result.event) events.push(result.event);
    return result;
  }
  function lead() {
    step('inspect', {
      lead: {
        id: `research-wildlife:${state.active.runId}:a:lead`,
        kind: study.lead,
        visible: true,
        truthType: 'virtual-training-observation',
        at: now
      }
    });
    step('method', { method: chosenMethod || study.methods[0] });
  }
  function survey(habitat, { empty = false, seconds = 10, distance, instrumentVersion } = {}) {
    const method = state.active.method,
      protocol = WILDLIFE_METHODS[method],
      startedAt = now;
    now += seconds * 1000;
    if (method === 'track-photo') {
      const slot = `habitat-${habitat}`;
      step('photograph', {
        slot,
        capture: {
          id: researchPhotoId('wildlife', state.active.runId, slot),
          runId: state.active.runId,
          slot,
          at: now,
          width: 64,
          height: 64,
          fingerprint: (habitat === 'a' ? '1' : '2').repeat(64),
          view: {
            subjectId: `${state.active.site.id}:sign:${habitat}`,
            visible: true,
            environment: 'EARTH',
            travelMode: 'walk',
            liveGps: false,
            range: 2
          }
        }
      });
    }
    const taxon =
      method === 'track-photo'
        ? habitat === 'a'
          ? 'hoofed-mammal-sign'
          : 'canid-sign'
        : habitat === 'a'
          ? 'white-tailed-deer'
          : 'woodland-fox';
    return step('survey', {
      effort: {
        runId: state.active.runId,
        habitatId: habitat,
        method,
        ...(instrumentVersion !== undefined ? { instrumentVersion } : {}),
        startedAt,
        endedAt: now,
        activeSeconds: seconds,
        distanceMeters: distance ?? (protocol.minimumDistance ? 5.5 : 0),
        routeGates: protocol.minimumDistance ? ['start', 'finish'] : [],
        supported: true,
        liveGps: false,
        interrupted: false,
        sensor: { aligned: method === 'trail-camera' },
        observations: empty
          ? []
          : [
              {
                id: `research-wildlife:${state.active.runId}:${habitat}:subject`,
                taxon,
                source: protocol.source,
                behavior:
                  method === 'track-photo'
                    ? 'persistent-sign'
                    : method === 'trail-camera'
                      ? 'moving-through-cone'
                      : 'walking',
                truthType: 'virtual-training-observation',
                visible: method !== 'trail-camera',
                firstAt: startedAt,
                lastAt: now,
                detections: method === 'trail-camera' ? 4 : 1
              }
            ]
      }
    });
  }
  function identify(overrides = {}) {
    return step('identify', {
      effortComparison: wildlifeEffortComparison(state.active).status,
      identifications: {
        ...Object.fromEntries(
          ['a', 'b'].map((id) => [
            id,
            {
              taxon: state.active.surveys[id].observations[0]?.taxon || 'unresolved',
              confidence: !state.active.surveys[id].observations.length
                ? 'not-observed'
                : state.active.method === 'track-photo'
                  ? 'tentative'
                  : 'confident'
            }
          ])
        ),
        ...overrides
      }
    });
  }
  function report(fields = {}) {
    return step('report', {
      coverContrast: 'wooded-versus-open',
      interpretation: 'paired-observations-only',
      limitation: study.limitation,
      followUp: study.followUp,
      ...fields
    });
  }
  step('accept', { runId, variantId, site: wildlifeSite() });
  return {
    get state() {
      return state;
    },
    study,
    events,
    items,
    command,
    step,
    lead,
    survey,
    identify,
    report
  };
}
