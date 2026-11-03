import {
  PALAEONTOLOGY_OFFSETS,
  PALAEONTOLOGY_STUDIES,
  palaeontologyTarget,
  normalizePalaeontologyCareer,
  transitionPalaeontologyCareer
} from '../../app/js/campaign/palaeontology-career.js';
import { researchPhotoId } from '../../app/js/campaign/research-media.js';
export function fossilSite() {
  const location = { lat: 39.3189, lon: -76.6363 };
  return {
    id: 'virtual-palaeontology:test',
    name: 'Invented fossil training formation',
    truthType: 'virtual-training-site',
    location,
    locationContext: { ...location, name: 'Druid Hill Park' },
    points: Object.fromEntries(
      Object.entries(PALAEONTOLOGY_OFFSETS).map(([id, p]) => [
        id,
        {
          lat: location.lat - p.z / 111000,
          lon: location.lon + p.x / (111000 * Math.cos((location.lat * Math.PI) / 180))
        }
      ])
    )
  };
}
export function fossilHarness(
  initial,
  variantId = 'campaign',
  runId = 'fossil-case-0001',
  captures = {}
) {
  let state = normalizePalaeontologyCareer(initial);
  const now = 1000,
    events = [],
    items = [],
    study = PALAEONTOLOGY_STUDIES[variantId];
  function command(type, fields = {}) {
    return {
      type,
      revision: state.revision,
      ...fields,
      ...(type === 'accept'
        ? {}
        : {
            evidence: {
              environment: 'EARTH',
              travelMode: 'walk',
              liveGps: false,
              supported: true,
              verticalDistance: 1.7,
              siteId: state.active.site.id,
              position: state.active.site.points[palaeontologyTarget(state.active)],
              at: now
            }
          })
    };
  }
  function step(type, fields = {}) {
    const r = transitionPalaeontologyCareer(state, command(type, fields), now);
    state = r.state;
    events.push(r.event);
    items.push(...r.samples);
    return r;
  }
  function photographs() {
    for (const [index, slot] of ['layer', 'orientation'].entries())
      step('photograph', {
        slot,
        capture: {
          id: researchPhotoId('palaeontology', runId, slot),
          runId,
          slot,
          at: now,
          width: 64,
          height: 64,
          fingerprint: String(index + 1).repeat(64),
          view: {
            subjectId: `${state.active.site.id}:${slot}`,
            visible: true,
            environment: 'EARTH',
            travelMode: 'walk',
            liveGps: false,
            range: index ? 1.8 : 3.1
          },
          ...captures[slot]
        }
      });
    step('orientation', { layer: study.layer, orientation: study.orientation });
  }
  function prepare() {
    step('prepare', { zone: 'outer-matrix', tool: 'blunt-probe' });
    step('prepare', { zone: 'margin', tool: 'soft-brush' });
    step('support', { support: study.support });
    step('lift');
  }
  const custody = () => [state.active.specimen.instanceId];
  function compare(classification = study.classification) {
    for (const method of ['structure', 'surface', 'sediment'])
      step('examine', { method, custody: custody() });
    step('classify', {
      classification,
      structure: study.traits.structure,
      surface: study.traits.surface,
      custody: custody()
    });
  }
  function report(fields = {}) {
    return step('report', {
      interpretation: study.interpretation,
      limitation: study.limitation,
      custody: custody(),
      ...fields
    });
  }
  step('accept', { variantId, runId, site: fossilSite() });
  return {
    get state() {
      return state;
    },
    study,
    events,
    items,
    command,
    step,
    photographs,
    prepare,
    compare,
    report
  };
}
