import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  validateFieldSite,
  requireFieldPresence,
  requireFieldCustody,
  validateFieldHistory
} from './field-study-contract.js';
import { researchPhotoId } from './research-media.js';
export const PALAEONTOLOGY_CAREER = Object.freeze({
  id: 'palaeontology',
  title: 'The Fossil Bed',
  badge: 'Fossil Recorder',
  sourceUrl:
    'https://www.amnh.org/research/paleontology/vertebrate/fossil-preparation/collecting/techniques-field'
});
export const PALAEONTOLOGY_OFFSETS = Object.freeze({ bed: { x: 0, z: 0 }, bench: { x: 9, z: 5 } });
export const PALAEONTOLOGY_STUDIES = Object.freeze({
  campaign: {
    label: 'The Fossil Bed',
    question: 'What do a coiled shell and its enclosing layer tell us together?',
    brief:
      'A ribbed, coiled shell cast is partly exposed in Layer F1 of this freestanding formation. Photograph the surrounding bed and its orientation before preparing it. This is an original invented training cast, not an authentic museum scan or a fossil from this real place.',
    kind: 'coiled-shell',
    form: 'planispiral-shell',
    orientation: 'east-west',
    layer: 'F1',
    sediment: 'fine-carbonate',
    sedimentLabel: 'Fine carbonate matrix with small shell fragments',
    colour: 0x766c52,
    traits: { structure: 'coils-in-one-plane', surface: 'curved-ribs' },
    classification: 'coiled-mollusc',
    support: 'padded-matrix-tray',
    interpretation: 'marine-deposition',
    limitation: 'precise-depth-and-age-unknown',
    conclusion:
      'The coiled shell form and carbonate matrix support marine deposition in this invented bed. They do not establish an exact age, depth or species.'
  },
  'plant-impression': {
    label: 'A Leaf in the Layer',
    question: 'Does a leaf impression prove that a tree grew exactly here?',
    brief:
      'Layer F2 contains an invented leaf impression in finely laminated sediment. Its thin margins are fragile. Keep the support block beneath it, and distinguish a transported leaf from a plant growing at the site.',
    kind: 'leaf',
    form: 'veined-leaf',
    orientation: 'north-south',
    layer: 'F2',
    sediment: 'laminated-silt',
    sedimentLabel: 'Fine silt with thin, parallel laminations',
    colour: 0x5d4a37,
    traits: { structure: 'branching-veins', surface: 'thin-impression' },
    classification: 'plant-impression',
    support: 'supported-block',
    interpretation: 'quiet-water-with-plant-input',
    limitation: 'leaf-may-be-transported',
    conclusion:
      'The leaf impression and laminated fine silt support quiet-water deposition with plant input. The leaf may have travelled before burial; a forest at this exact point is not established.'
  },
  'transported-shell': {
    label: 'A Shell Out of Place',
    question: 'Can a broken shell identify the animal’s original habitat?',
    brief:
      'An invented paired-valve shell cast lies obliquely in Layer F3. Broken edges and cross-bedded sand suggest transport. Preserve those edges rather than polishing away the evidence.',
    kind: 'paired-shell',
    form: 'paired-valves',
    orientation: 'north-east-south-west',
    layer: 'F3',
    sediment: 'cross-bedded-sand',
    sedimentLabel: 'Coarse sand with inclined cross-beds',
    colour: 0x8c713f,
    traits: { structure: 'two-matching-valves', surface: 'broken-radial-ribs' },
    classification: 'bivalve-form',
    support: 'padded-matrix-tray',
    interpretation: 'transported-in-moving-water',
    limitation: 'burial-not-living-habitat',
    conclusion:
      'The paired valves, damaged edges and cross-bedded sand support transport in moving water. The burial setting alone cannot establish where the animal lived.'
  }
});
export const normalizePalaeontologyCareer = normalizeFieldStudy;
export const palaeontologyTarget = (active) =>
  ['brief', 'photographs', 'preparation'].includes(active.phase) ? 'bed' : 'bench';
const receiptId = (run, revision) => `event:research:palaeontology:${run}:${revision}`;
function captureRef(active, command, now) {
  const c = command.capture,
    slot = command.slot;
  if (
    !['layer', 'orientation'].includes(slot) ||
    active.captures[slot] ||
    !c ||
    c.id !== researchPhotoId('palaeontology', active.runId, slot) ||
    c.runId !== active.runId ||
    c.slot !== slot ||
    !/^[a-f0-9]{64}$/.test(c.fingerprint || '') ||
    !Number.isFinite(c.at) ||
    Math.abs(now - c.at) > 2500 ||
    !Number.isInteger(c.width) ||
    !Number.isInteger(c.height) ||
    c.width < 64 ||
    c.height < 64 ||
    c.width > 1280 ||
    c.height > 1280 ||
    c.width * c.height > 1280 * 960 ||
    c.view?.subjectId !== `${active.site.id}:${slot}` ||
    c.view.visible !== true ||
    c.view.environment !== 'EARTH' ||
    c.view.travelMode !== 'walk' ||
    c.view.liveGps ||
    !Number.isFinite(c.view.range) ||
    !(slot === 'layer'
      ? c.view.range >= 2.3 && c.view.range <= 5.5
      : c.view.range >= 0.7 && c.view.range <= 2.25) ||
    Object.values(active.captures).some((row) => row.fingerprint === c.fingerprint)
  )
    throw Error(
      'Frame a fresh, unobstructed photograph of the required subject at the indicated distance.'
    );
  return copy(c);
}
export function transitionPalaeontologyCareer(value, command, now = Date.now()) {
  const state = normalizeFieldStudy(value),
    completed = { ...state.completed };
  if (state.schemaVersion !== 1)
    throw Error('This saved fossil career needs a newer version of World Explorer.');
  if (command?.revision !== state.revision)
    throw Error('This case changed in another tab. Reopen it to continue.');
  if (!Number.isFinite(now) || now <= 0) throw Error('This field step could not be timed.');
  let archivedRecord = null,
    active = state.active ? copy(state.active) : null,
    requiredItems = [],
    mediaRefs = [],
    requiredMedia = [];
  const samples = [];
  if (command.type === 'accept') {
    const variantId = command.variantId || 'campaign';
    if (!PALAEONTOLOGY_STUDIES[variantId] || (variantId !== 'campaign' && !completed.campaign))
      throw Error('Finish The Fossil Bed before choosing another case.');
    if (active && active.phase !== 'complete') {
      if (active.variantId !== variantId) throw Error('Continue your current fossil case first.');
      return { state, event: null, samples };
    }
    if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || ''))
      throw Error('This fossil case could not start.');
    active = {
      runId: command.runId,
      variantId,
      site: validateFieldSite(command.site, PALAEONTOLOGY_OFFSETS),
      acceptedAt: now,
      phase: 'brief',
      observation: null,
      captures: {},
      orientation: null,
      preparation: [],
      support: null,
      specimen: null,
      tests: {},
      classification: null,
      report: null,
      completedAt: 0
    };
  } else if (command.type === 'relocate') {
    if (!active || active.phase === 'complete' || command.variantId !== active.variantId)
      throw Error('Choose an unfinished training case to move.');
    if (
      !/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || '') ||
      command.runId === active.runId ||
      (active.priorAttempts || []).some((row) => row.runId === command.runId)
    )
      throw Error('The moved course needs a fresh field record.');
    archivedRecord = copy(active);
    delete archivedRecord.priorAttempts;
    const site = validateFieldSite(command.site, PALAEONTOLOGY_OFFSETS),
      previous = {
        runId: active.runId,
        site: copy(active.site),
        phase: active.phase,
        photoIds: Object.values(active.captures).map((row) => row.id),
        specimenIds: active.specimen ? [active.specimen.instanceId] : [],
        lastEventId: receiptId(active.runId, state.revision),
        archivedAt: now
      };
    active = {
      ...active,
      runId: command.runId,
      site,
      acceptedAt: now,
      phase: 'brief',
      observation: null,
      captures: {},
      orientation: null,
      preparation: [],
      support: null,
      specimen: null,
      tests: {},
      classification: null,
      report: null,
      completedAt: 0,
      priorAttempts: [...(active.priorAttempts || []), previous]
    };
  } else {
    if (!active || active.phase === 'complete') throw Error('Choose a fossil case first.');
    requireFieldPresence(active, palaeontologyTarget(active), command.evidence, now);
    const study = PALAEONTOLOGY_STUDIES[active.variantId];
    if (!study) throw Error('This fossil case needs a newer version.');
    if (command.type === 'inspect' && active.phase === 'brief') {
      if (command.form !== study.form) throw Error('Match the visible form before recording it.');
      active.observation = {
        form: command.form,
        truthType: 'invented-training-cast',
        position: copy(command.evidence.position),
        at: now
      };
      active.phase = 'photographs';
    } else if (command.type === 'photograph' && active.phase === 'photographs') {
      const ref = captureRef(active, command, now);
      active.captures[command.slot] = ref;
      mediaRefs = [ref];
    } else if (command.type === 'orientation' && active.phase === 'photographs') {
      if (!active.captures.layer || !active.captures.orientation)
        throw Error('Keep both the layer and orientation photographs before touching the cast.');
      if (command.layer !== study.layer || command.orientation !== study.orientation)
        throw Error('Record the exposed layer label and the cast’s axis against the north marker.');
      requiredMedia = Object.values(active.captures);
      active.orientation = {
        layer: command.layer,
        axis: command.orientation,
        photoIds: requiredMedia.map((row) => row.id),
        at: now
      };
      active.phase = 'preparation';
    } else if (command.type === 'prepare' && active.phase === 'preparation') {
      const expected = [
        ['outer-matrix', 'blunt-probe'],
        ['margin', 'soft-brush']
      ][active.preparation.length];
      if (!expected || command.zone !== expected[0] || command.tool !== expected[1])
        throw Error(
          'Expose the outer matrix first, then use the soft brush at the margin. Leave the cast’s diagnostic surface intact.'
        );
      requiredMedia = Object.values(active.captures);
      active.preparation.push({
        zone: command.zone,
        tool: command.tool,
        surfacePreserved: true,
        at: now
      });
    } else if (command.type === 'support' && active.phase === 'preparation') {
      if (active.preparation.length !== 2 || active.support || command.support !== study.support)
        throw Error('Finish bounded exposure, then choose support suited to this specimen.');
      active.support = {
        method: command.support,
        label: `${study.layer} · ${active.runId}`,
        at: now
      };
    } else if (command.type === 'lift' && active.phase === 'preparation') {
      if (!active.support) throw Error('Support and label the specimen before lifting it.');
      requiredMedia = Object.values(active.captures);
      const instanceId = `research:palaeontology:${active.runId}:specimen`,
        researchLabel = {
          careerId: 'palaeontology',
          runId: active.runId,
          layer: study.layer,
          orientation: active.orientation.axis,
          support: active.support.method,
          photoIds: requiredMedia.map((row) => row.id)
        };
      active.specimen = { instanceId, ...researchLabel, collectedAt: now };
      samples.push({
        instanceId,
        claimId: `claim:${instanceId}`,
        catalogId: `training-fossil-${study.kind}`,
        name: `${study.label} · prepared training cast`,
        description:
          'Original invented training fossil, retained with its layer, orientation and preparation record.',
        quantity: 1,
        authority: 'anonymous-local',
        tradeable: false,
        provenance: 'field-discovery',
        sourceEventId: receiptId(active.runId, state.revision + 1),
        collectedAt: now,
        regionId: active.site.id,
        regionLabel: active.site.name,
        evidenceClass: 'invented-training-fossil',
        researchLabel
      });
      active.phase = 'comparison';
    } else if (command.type === 'examine' && active.phase === 'comparison') {
      requiredItems = requireFieldCustody(active, command, [active.specimen.instanceId]);
      if (
        !['structure', 'surface', 'sediment'].includes(command.method) ||
        active.tests[command.method]
      )
        throw Error('Choose an unrecorded specimen examination.');
      active.tests[command.method] = {
        result: command.method === 'sediment' ? study.sediment : study.traits[command.method],
        truthType: 'virtual-training-observation',
        at: now
      };
    } else if (command.type === 'classify' && active.phase === 'comparison') {
      requiredItems = requireFieldCustody(active, command, [active.specimen.instanceId]);
      if (Object.keys(active.tests).length !== 3)
        throw Error('Compare structure, surface and sediment before identifying the cast.');
      if (
        ![study.classification, 'uncertain'].includes(command.classification) ||
        command.structure !== study.traits.structure ||
        command.surface !== study.traits.surface
      )
        throw Error(
          'Use diagnostic structure and surface evidence, or retain an uncertain identification.'
        );
      active.classification = {
        kind: command.classification,
        structure: command.structure,
        surface: command.surface,
        at: now
      };
      active.phase = 'interpretation';
    } else if (command.type === 'report' && active.phase === 'interpretation') {
      requiredItems = requireFieldCustody(active, command, [active.specimen.instanceId]);
      requiredMedia = Object.values(active.captures);
      if (
        ![study.interpretation, 'inconclusive'].includes(command.interpretation) ||
        (active.classification.kind === 'uncertain' && command.interpretation !== 'inconclusive') ||
        command.limitation !== study.limitation
      )
        throw Error(
          'Combine the specimen and its sediment, and retain the stated limit on the interpretation.'
        );
      active.report = {
        interpretation: command.interpretation,
        limitation: command.limitation,
        conclusion:
          command.interpretation === 'inconclusive'
            ? 'Identification and environment remain inconclusive. The photographed layer, preserved morphology and supported specimen are retained for another comparison.'
            : study.conclusion,
        at: now
      };
      active.completedAt = now;
      active.phase = 'complete';
      completed[active.variantId] = receiptId(active.runId, state.revision + 1);
    } else throw Error('That action does not match the current fossil step.');
  }
  const revision = state.revision + 1,
    study = PALAEONTOLOGY_STUDIES[active.variantId],
    complete = active.phase === 'complete';
  const action = Object.fromEntries(
    [
      'type',
      'revision',
      'runId',
      'variantId',
      'site',
      'evidence',
      'custody',
      'form',
      'slot',
      'capture',
      'layer',
      'orientation',
      'zone',
      'tool',
      'support',
      'method',
      'classification',
      'structure',
      'surface',
      'interpretation',
      'limitation'
    ]
      .filter((key) => command[key] !== undefined)
      .map((key) => [key, copy(command[key])])
  );
  const report = complete
    ? {
        title: study.label,
        truthType: 'invented-training-fossil',
        site: active.site,
        form: active.observation.form,
        captures: active.captures,
        orientation: active.orientation,
        preparation: active.preparation,
        support: active.support,
        specimen: active.specimen,
        tests: active.tests,
        classification: active.classification,
        ...active.report
      }
    : null;
  const event = {
    eventId: receiptId(active.runId, revision),
    eventType: complete ? 'campaign-completed' : 'campaign-progress',
    sourceSystem: 'research-careers',
    sourceId: `palaeontology:${active.variantId}:${command.type}:${command.slot || command.method || command.zone || ''}`,
    activityId: 'fossil-document',
    pathId: 'field',
    name: `${study.label} · ${complete ? 'fossil report' : command.type === 'relocate' ? 'training site moved' : command.type === 'photograph' ? 'field photograph' : command.type === 'lift' ? 'prepared specimen' : 'field record'}`,
    detail: complete
      ? active.report.conclusion
      : command.type === 'relocate'
        ? 'Training furniture moved to newly checked ground. Earlier photographs, specimens and notes are retained; observations at this site begin again.'
        : 'Invented training fossil and formation; not a real-world fossil occurrence.',
    occurredAt: now,
    environment: 'EARTH',
    regionId: active.site.id,
    regionLabel: active.site.name,
    locationSnapshot: { ...active.site.location, name: active.site.name },
    points: 0,
    firstCompletion: complete && !state.completed[active.variantId],
    projections: {
      journal: ['inspect', 'orientation', 'lift', 'classify', 'report', 'relocate'].includes(
        command.type
      ),
      profile: ['inspect', 'orientation', 'lift', 'classify', 'report'].includes(command.type),
      place: false
    },
    metadata: {
      careerId: 'palaeontology',
      runId: active.runId,
      variantId: active.variantId,
      phase: active.phase,
      truthType: 'invented-training-fossil',
      action,
      ...(archivedRecord ? { palaeontologyArchive: archivedRecord } : {}),
      ...(report ? { palaeontologyReport: report } : {}),
      sourceRefs: [{ url: PALAEONTOLOGY_CAREER.sourceUrl, truthType: 'reference' }]
    }
  };
  return {
    state: { ...state, revision, active, completed },
    event,
    samples,
    requiredItems,
    mediaRefs,
    requiredMedia
  };
}
export function palaeontologyCareerSummary(value, { variantId = 'campaign' } = {}) {
  const state = normalizeFieldStudy(value),
    study = PALAEONTOLOGY_STUDIES[variantId] || PALAEONTOLOGY_STUDIES.campaign,
    index =
      state.active?.variantId === variantId
        ? [
            'brief',
            'photographs',
            'preparation',
            'comparison',
            'interpretation',
            'complete'
          ].indexOf(state.active.phase)
        : -1;
  return {
    title: study.label,
    summary: study.question,
    resume: index >= 0 && index < 5,
    ...(state.active && state.active.phase !== 'complete'
      ? {
          recovery: {
            id: 'relocate-course',
            label: 'Move training site',
            reason:
              'If this ground is unavailable, move the portable training furniture. New observations begin at the new site; earlier notes and photographs stay in Journal, and specimens remain in your collection.'
          }
        }
      : {}),
    choices: Object.entries(PALAEONTOLOGY_STUDIES)
      .filter(([id]) => id === 'campaign' || state.completed.campaign)
      .map(([id, row]) => ({ id, label: row.label })),
    stages: [
      'Inspect an exposed invented fossil form',
      'Photograph its layer and orientation before touching',
      'Expose, support and lift the bounded training specimen',
      'Compare morphology and sediment at the preparation bench',
      'Save a palaeoenvironment report with its limits'
    ].map((label, i) => ({ label, complete: index > i }))
  };
}
export function palaeontologyCareerBadge(value) {
  const state = normalizeFieldStudy(value);
  return state.schemaVersion === 1 && state.completed.campaign
    ? {
        id: 'fossil-recorder',
        label: 'Fossil Recorder',
        detail:
          'Preserved a photographed fossil context, prepared a supported cast and interpreted its sediment.',
        eventId: state.completed.campaign
      }
    : null;
}
export const validatePalaeontologyCareerBackup = (value, events, items) =>
  validateFieldHistory('palaeontology', value, events, items, transitionPalaeontologyCareer);
