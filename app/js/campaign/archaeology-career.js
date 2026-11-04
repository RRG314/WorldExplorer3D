const copy = value => JSON.parse(JSON.stringify(value));
const coordinate = p => p && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lon) && Math.abs(p.lon) <= 180;
const distance = (a, b) => Math.hypot((a.lat - b.lat) * 111000, (a.lon - b.lon) * 111000 * Math.cos(a.lat * Math.PI / 180));
const eventId = (runId, revision) => `event:research:archaeology:${runId}:${revision}`;

export const ARCHAEOLOGY_CAREER = Object.freeze({
  id: 'archaeology', version: 1, title: 'A Place in Context', badge: 'Archaeological Survey',
  sourceUrl: 'https://home.nps.gov/articles/sec-standards-archeo-doc-guidelines.htm'
});
export const ARCHAEOLOGY_OFFSETS = Object.freeze({feature: {x: 0, z: -9}, survey: {x: 7, z: -4}, trench: {x: 0, z: 0}, bench: {x: 9, z: 5}});
export const ARCHAEOLOGY_STUDIES = Object.freeze({
  campaign: {
    label: 'A Place in Context', question: 'What survives when a working yard is covered by later rubble?',
    brief: 'Cedar Yard is a fictional training site. A low stone line stands north of the trench. Compare the upper rubble and lower use surface; neither an object alone nor its appearance dates the whole site.',
    feature: 'stone-line', featureLabel: 'Low stone line',
    layers: [
      {id: '102', name: 'Loose rubble', colour: 'pale-brown', fabric: 'angular-stone', thicknessCm: 15, cell: 'A1', orientation: 'east-west', artifact: {kind: 'tile', name: 'Roof-tile fragment', material: 'ceramic', wear: 'weathered-edge', packing: 'labelled-box'}},
      {id: '101', name: 'Packed use surface', colour: 'dark-brown', fabric: 'fine-with-charcoal', thicknessCm: 15, cell: 'B1', orientation: 'north-south', artifact: {kind: 'rim', name: 'Soot-marked vessel rim', material: 'ceramic', wear: 'soot-on-outer-face', packing: 'labelled-box'}}
    ],
    interpretation: 'later-cover-over-use', alternative: 'household-or-workshop', conservation: 'dry-padded-separate',
    conclusion: 'Context 102 covers 101. Rubble accumulated after the lower surface was used. The rim supports use of a vessel; household and workshop explanations remain possible.'
  },
  'mixed-context': {
    label: 'When Layers Mix', question: 'Can an object from mixed fill date an earlier surface?',
    brief: 'The fictional East Cutting contains a later cut with mixed fill over an earlier packed surface. Keep each find with its actual context. A displaced object cannot date the undisturbed surface below it.',
    feature: 'cut-profile', featureLabel: 'Visible cut and fill',
    layers: [
      {id: '202', name: 'Mixed later fill', colour: 'mottled-brown', fabric: 'mixed-gravel', thicknessCm: 15, cell: 'B1', orientation: 'north-south', artifact: {kind: 'bead', name: 'Glass bead in mixed fill', material: 'glass', wear: 'abraded-surface', packing: 'labelled-box'}},
      {id: '201', name: 'Earlier packed surface', colour: 'ochre-brown', fabric: 'packed-fine-sediment', thicknessCm: 15, cell: 'A1', orientation: 'east-west', artifact: {kind: 'rim', name: 'Vessel rim below the cut fill', material: 'ceramic', wear: 'worn-rim', packing: 'labelled-box'}}
    ],
    interpretation: 'mixed-fill-limits-dating', alternative: 'displacement-or-reuse', conservation: 'dry-padded-separate',
    conclusion: 'The mixed fill is later than the packed surface, but the bead need not have been made when that fill was deposited. Displacement and reuse remain alternatives; a precise site date is unsupported.'
  },
  'fragile-find': {
    label: 'An Object and Its Support', question: 'How do context and preservation change the way a find can be lifted?',
    brief: 'The fictional Drain Yard has a stone-lined channel and a damp organic band beneath dry silt. The lower wooden training object is fragile: retain its sediment support before lifting it.',
    feature: 'drain', featureLabel: 'Stone-lined channel',
    layers: [
      {id: '302', name: 'Dry covering silt', colour: 'pale-brown', fabric: 'fine-silt', thicknessCm: 15, cell: 'A1', orientation: 'east-west', artifact: {kind: 'tile', name: 'Tile fragment in covering silt', material: 'ceramic', wear: 'weathered-edge', packing: 'labelled-box'}},
      {id: '301', name: 'Damp organic band', colour: 'dark-brown', fabric: 'fibrous-organic', thicknessCm: 15, cell: 'B1', orientation: 'north-south', artifact: {kind: 'wood', name: 'Fragile wooden fragment', material: 'wood', wear: 'soft-fibrous-surface', packing: 'supported-block'}}
    ],
    interpretation: 'different-preservation-conditions', alternative: 'function-remains-uncertain', conservation: 'supported-block-specialist-care',
    conclusion: 'The lower organic band preserved a fragile wooden fragment under different conditions from the dry silt. Its function remains uncertain. The supported block and contextual record are retained for specialist care.'
  }
});

export function normalizeArchaeologyCareer(value) {
  if (value?.schemaVersion != null && value.schemaVersion !== 1) return copy(value);
  return {schemaVersion: 1, revision: 0, completed: {}, active: null, ...copy(value || {})};
}
function validateSite(site) {
  if (!site?.id || site.truthType !== 'virtual-training-site' || !coordinate(site.location) ||
      !Object.keys(ARCHAEOLOGY_OFFSETS).every(id => coordinate(site.points?.[id]))) throw Error('Choose a supported fictional training site.');
  if (site.locationContext && !coordinate(site.locationContext)) throw Error('The saved training destination is invalid.');
  if (Object.values(site.points).some(p => distance(p, site.location) > 120) || distance(site.points.feature, site.points.trench) < 6 || distance(site.points.bench, site.points.trench) < 5) throw Error('The training layout is not supported.');
  return {id: String(site.id).slice(0, 100), name: String(site.name || 'Fictional archaeology training site').slice(0, 120), truthType: 'virtual-training-site',
    location: {lat: site.location.lat, lon: site.location.lon},
    locationContext: site.locationContext ? {lat: site.locationContext.lat, lon: site.locationContext.lon, name: String(site.locationContext.name || site.name).slice(0, 120)} : null,
    points: Object.fromEntries(Object.keys(ARCHAEOLOGY_OFFSETS).map(id => [id, {lat: site.points[id].lat, lon: site.points[id].lon}]))};
}
export function archaeologyMeasurements(site) {
  const origin = site.points.trench;
  return Object.fromEntries([['feature', 'north-of'], ['bench', 'south-east-of']].map(([id, relation]) => {
    const target = site.points[id], east = (target.lon - origin.lon) * 111000 * Math.cos(origin.lat * Math.PI / 180), north = (target.lat - origin.lat) * 111000;
    return [id, {relation, distanceMeters: Math.hypot(east, north), bearingDegrees: (Math.atan2(east, north) * 180 / Math.PI + 360) % 360}];
  }));
}
export function archaeologyTarget(active) {
  return active.phase === 'brief' ? 'feature' : active.phase === 'survey' ? 'survey' : active.phase === 'excavate' ? 'trench' : 'bench';
}
function physicallyAt(active, evidence, now) {
  if (evidence?.environment !== 'EARTH' || evidence.travelMode !== 'walk' || evidence.liveGps || evidence.supported !== true ||
      !Number.isFinite(evidence.verticalDistance) || Math.abs(evidence.verticalDistance) > 2.5 || !coordinate(evidence.position) ||
      evidence.siteId !== active.site.id || !Number.isFinite(evidence.at) || Math.abs(evidence.at - now) > 2000 ||
      distance(evidence.position, active.site.points[archaeologyTarget(active)]) > 3) throw Error('Walk to the marked training station before recording this step.');
}
function custody(active, command) {
  const ids = Object.values(active.artifacts).map(row => row.instanceId);
  if (ids.length !== 2 || !ids.every(id => command.custody?.includes(id))) throw Error('Bring both contextual finds to the catalog bench. Retrieve stored finds from your home first.');
  return ids;
}
function recordedAction(command) {
  const keys = ['type', 'revision', 'runId', 'variantId', 'site', 'evidence', 'feature', 'orientation', 'unit', 'target', 'relation', 'distanceMeters', 'bearingDegrees', 'tool', 'contextId', 'cell', 'fabric', 'relationship', 'packing', 'method', 'custody', 'classifications', 'interpretation', 'alternative', 'conservation'];
  return Object.fromEntries(keys.filter(key => command[key] !== undefined).map(key => [key, copy(command[key])]));
}
export function transitionArchaeologyCareer(value, command, now = Date.now()) {
  const state = normalizeArchaeologyCareer(value);
  if (state.schemaVersion !== 1) throw Error('This saved archaeology career needs a newer version of World Explorer.');
  if (command?.revision !== state.revision) throw Error('This study changed in another tab. Reopen it to continue.');
  if (!Number.isFinite(now) || now <= 0) throw Error('This field step could not be timed. Try again.');
  let active = state.active ? copy(state.active) : null, requiredItems = [];
  const completed = {...state.completed}, samples = [];
  if (command.type === 'accept') {
    const variantId = command.variantId || 'campaign';
    if (!ARCHAEOLOGY_STUDIES[variantId] || variantId !== 'campaign' && !completed.campaign) throw Error('Finish A Place in Context before choosing another case.');
    if (active && active.phase !== 'complete') {
      if (active.variantId !== variantId) throw Error('Continue your current archaeology case first.');
      return {state, event: null, samples};
    }
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || '')) throw Error('This training case could not start. Try again.');
    active = {runId: command.runId, variantId, site: validateSite(command.site), acceptedAt: now, phase: 'brief', feature: null,
      grid: null, measurements: {}, layerIndex: 0, excavation: {}, contexts: {}, artifacts: {}, tests: {}, classifications: {}, report: null, completedAt: 0};
  } else {
    if (!active || active.phase === 'complete') throw Error('Choose an archaeology case first.');
    const study = ARCHAEOLOGY_STUDIES[active.variantId];
    if (!study) throw Error('This saved training case needs a newer version of World Explorer.');
    physicallyAt(active, command.evidence, now);
    const layer = study.layers[active.layerIndex];
    if (command.type === 'inspect' && active.phase === 'brief') {
      if (command.feature !== study.feature) throw Error('Inspect the visible feature and match its form before recording it.');
      active.feature = {kind: command.feature, observedAt: now, position: copy(command.evidence.position)};
      active.phase = 'survey';
    } else if (command.type === 'grid' && active.phase === 'survey' && !active.grid) {
      if (command.orientation !== 'north' || command.unit !== 'metre') throw Error('Align the one-metre training grid with north.');
      active.grid = {orientation: 'north', unit: 'metre', cells: ['A1', 'B1'], recordedAt: now};
    } else if (command.type === 'measure' && active.phase === 'survey' && active.grid) {
      const expected = archaeologyMeasurements(active.site)[command.target];
      const bearingError = expected ? Math.abs(((command.bearingDegrees - expected.bearingDegrees + 540) % 360) - 180) : Infinity;
      if (!expected || active.measurements[command.target] || command.relation !== expected.relation || !Number.isFinite(command.distanceMeters) ||
          !Number.isFinite(command.bearingDegrees) || Math.abs(command.distanceMeters - expected.distanceMeters) > .5 || bearingError > 2) throw Error('Use the tape and compass, then record the measured relationship.');
      active.measurements[command.target] = {...expected, method: 'virtual-tape-and-compass', recordedAt: now};
      if (active.measurements.feature && active.measurements.bench) active.phase = 'excavate';
    } else if (command.type === 'excavate' && active.phase === 'excavate') {
      const depth = active.excavation[layer.id] || 0, remaining = layer.thicknessCm - depth;
      if (remaining <= 0) throw Error('Record this exposed context before lifting its find.');
      if (command.tool !== (remaining > 5 ? 'trowel' : 'brush')) throw Error(remaining > 5 ? 'Use the trowel for the next bounded five-centimetre spit.' : 'The find is close to the surface. Use the soft brush for the final spit.');
      active.excavation[layer.id] = depth + 5;
    } else if (command.type === 'context' && active.phase === 'excavate') {
      if (active.excavation[layer.id] !== layer.thicknessCm || active.contexts[layer.id]) throw Error('Expose and record each context once, before removing its find.');
      if (command.contextId !== layer.id || command.cell !== layer.cell || command.fabric !== layer.fabric || command.orientation !== layer.orientation ||
          command.relationship !== (active.layerIndex === 0 ? 'above-next' : 'below-previous')) throw Error('Match the context number, grid cell, sediment, orientation and layer relationship to the exposed section.');
      active.contexts[layer.id] = {contextId: layer.id, cell: layer.cell, fabric: layer.fabric, orientation: layer.orientation,
        relationship: command.relationship, depthCm: (active.layerIndex + 1) * layer.thicknessCm, recordedAt: now,
        recordEventId: eventId(active.runId, state.revision + 1)};
    } else if (command.type === 'collect' && active.phase === 'excavate') {
      const context = active.contexts[layer.id];
      if (!context || active.artifacts[layer.id]) throw Error('Record the exposed context before lifting its find.');
      if (command.packing !== layer.artifact.packing) throw Error(layer.artifact.packing === 'supported-block' ? 'This fragile find needs its sediment support and a block-lift cradle.' : 'Pack the find in a padded box with its context label.');
      const instanceId = `research:archaeology:${active.runId}:artifact:${layer.id}`, claimId = `claim:${instanceId}`;
      const label = {careerId: 'archaeology', runId: active.runId, contextId: layer.id, gridCell: layer.cell, contextEventId: context.recordEventId, packing: command.packing};
      samples.push({instanceId, claimId, catalogId: `training-archaeology-${layer.artifact.kind}`, name: `${layer.artifact.name} · Context ${layer.id}`,
        description: `Fictional training find from ${active.site.name}; context ${layer.id}, grid ${layer.cell}.`, quantity: 1, authority: 'anonymous-local',
        tradeable: false, provenance: 'field-discovery', sourceEventId: eventId(active.runId, state.revision + 1), collectedAt: now,
        regionId: active.site.id, regionLabel: active.site.name, evidenceClass: 'virtual-training-artifact', researchLabel: label});
      active.artifacts[layer.id] = {instanceId, claimId, ...label, collectedAt: now};
      active.layerIndex++;
      if (active.layerIndex === study.layers.length) active.phase = 'lab';
    } else if (command.type === 'test' && active.phase === 'lab') {
      requiredItems = custody(active, command);
      const target = study.layers.find(row => row.id === command.contextId), key = `${command.contextId}:${command.method}`;
      if (!target || !['material', 'wear'].includes(command.method) || active.tests[key]) throw Error('Choose an unrecorded material or wear examination for a contextual find.');
      active.tests[key] = {contextId: target.id, method: command.method, result: target.artifact[command.method], truthType: 'virtual-training-observation', at: now};
    } else if (command.type === 'classify' && active.phase === 'lab') {
      requiredItems = custody(active, command);
      if (!study.layers.every(row => ['material', 'wear'].every(method => active.tests[`${row.id}:${method}`]))) throw Error('Examine the material and wear of both contextual finds first.');
      for (const row of study.layers) if (![row.artifact.material, 'uncertain'].includes(command.classifications?.[row.id])) throw Error('Choose a supported material identification or retain uncertainty.');
      active.classifications = Object.fromEntries(study.layers.map(row => [row.id, command.classifications[row.id]]));
      active.phase = 'interpretation';
    } else if (command.type === 'report' && active.phase === 'interpretation') {
      requiredItems = custody(active, command);
      if (![study.interpretation, 'need-more-evidence'].includes(command.interpretation) ||
          Object.values(active.classifications).includes('uncertain') && command.interpretation !== 'need-more-evidence') throw Error('Support the interpretation with your contexts, or retain an inconclusive result.');
      if (command.alternative !== study.alternative || command.conservation !== study.conservation) throw Error('Retain the supported alternative and a conservation plan suited to these finds.');
      active.report = {interpretation: command.interpretation, alternative: command.alternative, conservation: command.conservation,
        conclusion: command.interpretation === 'need-more-evidence' ? 'The interpretation remains inconclusive. Preserve the contextual records and finds for a follow-up study.' : study.conclusion,
        contextEventIds: Object.values(active.contexts).map(row => row.recordEventId), at: now};
      active.completedAt = now; active.phase = 'complete';
      completed[active.variantId] = eventId(active.runId, state.revision + 1);
    } else throw Error('That action does not match the current archaeology step.');
  }
  const revision = state.revision + 1, complete = command.type === 'report', study = ARCHAEOLOGY_STUDIES[active.variantId];
  const report = complete ? {title: study.label, truthType: 'fictional-training-site', site: active.site, feature: active.feature, grid: active.grid,
    measurements: active.measurements, contexts: active.contexts, artifacts: active.artifacts, tests: active.tests, classifications: active.classifications, ...active.report} : null;
  const event = {eventId: eventId(active.runId, revision), eventType: complete ? 'campaign-completed' : 'campaign-progress', sourceSystem: 'research-careers',
    sourceId: `archaeology:${active.variantId}:${command.type}:${command.contextId || ''}:${command.method || ''}`, activityId: 'virtual-archaeology', pathId: 'field',
    name: `${study.label} · ${complete ? 'site report' : command.type === 'collect' ? 'contextual find' : command.type === 'context' ? 'Context ' + command.contextId + ' record' : command.type === 'test' ? 'lab examination' : 'field record'}`,
    detail: complete ? active.report.conclusion : 'Fictional archaeology training. Real heritage visits are observation-only.', occurredAt: now, environment: 'EARTH',
    regionId: active.site.id, regionLabel: active.site.name, locationSnapshot: {...active.site.location, name: active.site.name}, points: 0,
    firstCompletion: complete && !state.completed[active.variantId], projections: {journal: ['inspect','measure','context','collect','classify','report'].includes(command.type), profile: ['inspect','measure','context','collect','classify','report'].includes(command.type), place: false},
    metadata: {careerId: 'archaeology', runId: active.runId, variantId: active.variantId, phase: active.phase, truthType: 'fictional-training-site',
      action: recordedAction(command), ...(command.type === 'accept' ? {base: {revision: state.revision, completed: state.completed}} : {}),
      ...(report ? {archaeologyReport: report, exhibition: {title: study.label, contexts: Object.keys(active.contexts), artifactIds: Object.values(active.artifacts).map(row => row.instanceId)}} : {}),
      sourceRefs: [{url: ARCHAEOLOGY_CAREER.sourceUrl, truthType: 'reference'}]}};
  return {state: {...state, revision, active, completed}, event, samples, requiredItems};
}

export function archaeologyCareerSummary(value, {variantId = 'campaign'} = {}) {
  const state = normalizeArchaeologyCareer(value), study = ARCHAEOLOGY_STUDIES[variantId] || ARCHAEOLOGY_STUDIES.campaign;
  const phases = ['brief', 'survey', 'excavate', 'lab', 'interpretation', 'complete'], index = state.active?.variantId === variantId ? phases.indexOf(state.active.phase) : -1;
  return {title: study.label, summary: study.question, resume: index >= 0 && index < 5,
    choices: Object.entries(ARCHAEOLOGY_STUDIES).filter(([id]) => id === 'campaign' || state.completed.campaign).map(([id, row]) => ({id, label: row.label})),
    stages: ['Inspect the fictional site without moving its feature', 'Lay a north-aligned grid and measure two relationships', 'Record successive contexts before lifting their finds', 'Compare material, wear and context at the catalog bench', 'File a supported interpretation and conservation plan'].map((label, i) => ({label, complete: index > i}))};
}
export function archaeologyCareerBadge(value) {
  const state = normalizeArchaeologyCareer(value);
  return state.schemaVersion === 1 && state.completed.campaign ? {id: 'archaeological-survey', label: ARCHAEOLOGY_CAREER.badge,
    detail: 'Surveyed a fictional site, preserved find contexts and filed a supported conservation record.', eventId: state.completed.campaign} : null;
}
const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
export function validateArchaeologyCareerBackup(value, events, items) {
  if (!value || value.schemaVersion !== 1) return;
  const state = normalizeArchaeologyCareer(value), records = events.filter(row => row.sourceSystem === 'research-careers' && row.metadata?.careerId === 'archaeology');
  const fail = () => {throw TypeError('The archaeological record or find custody is incomplete.');};
  if (!state.active) {if (state.revision !== 0 || Object.keys(state.completed).length || records.length) fail(); return;}
  records.sort((a, b) => Number(a.metadata.action?.revision) - Number(b.metadata.action?.revision));
  let replay = normalizeArchaeologyCareer();
  for (const record of records) {
    const command = record.metadata?.action;
    if (!command || command.revision !== replay.revision) fail();
    if (command.type === 'accept' && canonical(record.metadata.base) !== canonical({revision: replay.revision, completed: replay.completed})) fail();
    const result = transitionArchaeologyCareer(replay, command, record.occurredAt);
    if (!result.event || record.eventId !== result.event.eventId || record.eventType !== result.event.eventType || canonical(record.metadata) !== canonical(result.event.metadata)) fail();
    for (const sample of result.samples) {
      const item = items.find(row => row.instanceId === sample.instanceId);
      if (!item || item.tradeable !== false || item.catalogId !== sample.catalogId || item.sourceEventId !== sample.sourceEventId ||
          canonical(item.researchLabel) !== canonical(sample.researchLabel)) fail();
    }
    replay = result.state;
  }
  if (canonical(replay) !== canonical(state)) fail();
}
