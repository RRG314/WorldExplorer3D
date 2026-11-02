import {ARCHAEOLOGY_OFFSETS, ARCHAEOLOGY_STUDIES, archaeologyMeasurements, archaeologyTarget, normalizeArchaeologyCareer, transitionArchaeologyCareer} from '../../app/js/campaign/archaeology-career.js';
export function trainingSite() {
  const location = {lat: 39.3189, lon: -76.6363};
  return {id: 'virtual-archaeology:test', name: 'Fictional training yard', truthType: 'virtual-training-site', location,
    locationContext: {...location, name: 'Druid Hill Park'}, points: Object.fromEntries(Object.entries(ARCHAEOLOGY_OFFSETS).map(([id, p]) => [id,
      {lat: location.lat - p.z / 111000, lon: location.lon + p.x / (111000 * Math.cos(location.lat * Math.PI / 180))}]))};
}
export function studyHarness(initial, variantId = 'campaign', runId = 'archaeology-case-0001') {
  let state = normalizeArchaeologyCareer(initial);
  const events = [], items = [], study = ARCHAEOLOGY_STUDIES[variantId], now = 1000;
  function command(type, fields = {}) {
    return {type, revision: state.revision, ...fields, ...(type === 'accept' ? {} : {evidence: {environment: 'EARTH', travelMode: 'walk', liveGps: false,
      supported: true, verticalDistance: 1.7, siteId: state.active.site.id, position: state.active.site.points[archaeologyTarget(state.active)], at: now}})};
  }
  function step(type, fields) {
    const result = transitionArchaeologyCareer(state, command(type, fields), now); state = result.state;
    if (result.event) events.push(result.event); items.push(...result.samples); return result;
  }
  function survey() {
    step('inspect', {feature: study.feature}); step('grid', {orientation: 'north', unit: 'metre'});
    for (const [target, reading] of Object.entries(archaeologyMeasurements(state.active.site))) step('measure', {target, ...reading});
  }
  function excavate() {
    for (const layer of study.layers) {
      for (const tool of ['trowel', 'trowel', 'brush']) step('excavate', {tool});
      step('context', {contextId: layer.id, cell: layer.cell, fabric: layer.fabric, orientation: layer.orientation, relationship: state.active.layerIndex === 0 ? 'above-next' : 'below-previous'});
      step('collect', {packing: layer.artifact.packing});
    }
  }
  function lab(classificationOverrides = {}) {
    const custody = Object.values(state.active.artifacts).map(row => row.instanceId);
    for (const layer of study.layers) for (const method of ['material', 'wear']) step('test', {contextId: layer.id, method, custody});
    step('classify', {classifications: {...Object.fromEntries(study.layers.map(row => [row.id, row.artifact.material])),...classificationOverrides}, custody});
  }
  function report(fields = {}) {
    return step('report', {interpretation: study.interpretation, alternative: study.alternative, conservation: study.conservation,
      custody: Object.values(state.active.artifacts).map(row => row.instanceId), ...fields});
  }
  step('accept', {variantId, runId, site: trainingSite()});
  return {get state() {return state;}, events, items, study, step, command, survey, excavate, lab, report};
}
