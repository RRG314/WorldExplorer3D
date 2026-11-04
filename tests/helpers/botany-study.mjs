import {
  BOTANY_OFFSETS,
  BOTANY_PLANTS,
  BOTANY_STUDIES,
  normalizeBotanyCareer,
  transitionBotanyCareer,
  botanyTarget,
  botanyPlotComparison
} from '../../app/js/campaign/botany-career.js';
import { researchPhotoId } from '../../app/js/campaign/research-media.js';
export function botanySite() {
  const location = { lat: 39.3173, lon: -76.64044 };
  return {
    id: 'virtual-botany:test',
    name: 'Virtual plant study',
    truthType: 'virtual-training-site',
    location,
    locationContext: { ...location, name: 'Druid Hill Park · park lawns' },
    points: Object.fromEntries(
      Object.entries(BOTANY_OFFSETS).map(([id, p]) => [
        id,
        {
          lat: location.lat - p.z / 111000,
          lon: location.lon + p.x / (111000 * Math.cos((location.lat * Math.PI) / 180))
        }
      ])
    )
  };
}
export function botanyHarness(initial, variantId = 'campaign', runId = 'botany-case-0001') {
  let state = normalizeBotanyCareer(initial),
    now = 1000;
  const events = [],
    study = BOTANY_STUDIES[variantId];
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
            position: state.active.site.points[botanyTarget(state.active)],
            at: now
          }
        })
  });
  function step(type, fields = {}) {
    const result = transitionBotanyCareer(state, command(type, fields), now);
    state = result.state;
    if (result.event) events.push(result.event);
    now += 1000;
    return result;
  }
  function photograph(id) {
    const slot = `plant-${id}`,
      capture = {
        id: researchPhotoId('botany', state.active.runId, slot),
        runId: state.active.runId,
        slot,
        at: now,
        width: 64,
        height: 64,
        fingerprint: '1'.repeat(64),
        view: {
          subjectId: `${state.active.site.id}:plant:${id}`,
          visible: true,
          environment: 'EARTH',
          travelMode: 'walk',
          liveGps: false,
          range: 1.5
        }
      };
    return step('photograph', { slot, capture });
  }
  function reading(id) {
    const p = BOTANY_PLANTS[id];
    return {
      plantId: id,
      runId: state.active.runId,
      siteId: state.active.site.id,
      truthType: 'authored-virtual-bed',
      method: 'paired-training-sensors',
      depthCm: 5,
      units: { light: 'relative-index', moisture: 'relative-index' },
      at: now,
      light: p.light,
      moisture: p.moisture,
      supported: true
    };
  }
  function measure(id, fields = {}) {
    return step('measure-plant', { form: BOTANY_PLANTS[id].form, reading: reading(id), ...fields });
  }
  function plotReading(phase, { control = 4, treatment = 4 } = {}) {
    const row = (n) => ({
      points: Array.from({ length: 16 }, (_, i) => ({
        index: i,
        kind: i < n ? 'vegetation' : 'soil'
      })),
      vegetationHits: n,
      coverPercent: (n / 16) * 100
    });
    return {
      runId: state.active.runId,
      siteId: state.active.site.id,
      phase,
      virtualSeason: state.active.currentSeason,
      truthType: 'declared-season-simulation',
      method: 'vertical-point-intercept',
      gridKey: 'fixed-four-by-four-v1',
      sideMeters: 1.6,
      at: now,
      control: row(control),
      treatment: row(treatment)
    };
  }
  function plants() {
    for (const id of ['a', 'b', 'c']) {
      photograph(id);
      measure(id);
    }
  }
  function mark() {
    return step('mark-plot', {
      comparison: 'light-and-moisture-contrast',
      reading: plotReading('baseline')
    });
  }
  function revisit() {
    step('declare-season', { virtualSeason: study.visitSeason });
    return step('revisit', { reading: plotReading('visit') });
  }
  function condition() {
    return {
      runId: state.active.runId,
      siteId: state.active.site.id,
      truthType: 'authored-virtual-bed',
      method: 'paired-training-sensors',
      depthCm: 5,
      units: { light: 'relative-index', moisture: 'relative-index' },
      virtualSeason: state.active.currentSeason,
      light: study.plotLight,
      moisture: study.plotMoisture,
      at: now
    };
  }
  function plant(fields = {}) {
    return step('plant', { variety: study.suitable, cell: 15, condition: condition(), ...fields });
  }
  function followup(options) {
    step('declare-followup', { virtualSeason: study.afterSeason });
    return step('followup', {
      reading: plotReading('followup', options || { control: 5, treatment: 9 })
    });
  }
  function report(fields = {}) {
    return step('report', {
      result: botanyPlotComparison(state.active).result,
      limitation: study.limitation,
      followUp: 'repeat-the-same-points',
      ...fields
    });
  }
  step('accept', { runId, variantId, site: botanySite() });
  return {
    get state() {
      return state;
    },
    get now() {
      return now;
    },
    study,
    events,
    step,
    command,
    photograph,
    reading,
    measure,
    plotReading,
    plants,
    mark,
    revisit,
    condition,
    plant,
    followup,
    report
  };
}
