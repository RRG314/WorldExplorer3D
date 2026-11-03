import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  validateFieldSite,
  requireFieldPresence,
  validateFieldHistory
} from './field-study-contract.js';
import { researchPhotoId } from './research-media.js';
export const BOTANY_CAREER = Object.freeze({
  id: 'botany',
  title: 'A Living Patch',
  badge: 'Plant Survey',
  sourceRefs: [
    {
      url: 'https://research.fs.usda.gov/treesearch/24062',
      truthType: 'point-intercept-method-reference'
    },
    {
      url: 'https://extension.umn.edu/about/our-stories/news/natural-resources-news/do-plant-id-apps-work-for-aquatic-plants',
      truthType: 'diagnostic-photograph-method-reference'
    }
  ]
});
export const BOTANY_OFFSETS = Object.freeze({
  a: { x: -6, z: 0 },
  b: { x: 0, z: 0 },
  c: { x: 6, z: 0 },
  plot: { x: 0, z: -8 },
  bench: { x: 0, z: 8 }
});
export const BOTANY_PLANTS = Object.freeze({
  a: {
    label: 'Fronded training variety',
    form: 'divided-fronds',
    assetId: 'nature-fern',
    light: 25,
    moisture: 75,
    lightRange: [10, 40],
    moistureRange: [60, 95]
  },
  b: {
    label: 'Broadleaf training shrub',
    form: 'branched-broadleaves',
    assetId: 'nature-shrub',
    light: 55,
    moisture: 55,
    lightRange: [35, 75],
    moistureRange: [40, 80]
  },
  c: {
    label: 'Narrow-bladed training grass',
    form: 'linear-blades',
    assetId: 'nature-grass',
    light: 90,
    moisture: 30,
    lightRange: [65, 100],
    moistureRange: [10, 55]
  }
});
export const BOTANY_STUDIES = Object.freeze({
  campaign: {
    label: 'A Living Patch',
    question: 'How can a fixed plot distinguish observed cover from a restoration prediction?',
    brief:
      'Photograph three training plant forms across a light and moisture boundary. Mark a fixed plot, revisit in a declared virtual season and choose a suitable planting for its measured conditions.',
    initialSeason: 'spring',
    visitSeason: 'summer',
    afterSeason: 'late-summer',
    plotLight: 25,
    plotMoisture: 75,
    suitable: 'a',
    visitScale: 0.9,
    afterScale: 1.02,
    limitation: 'one-virtual-plot-not-a-field-prediction'
  },
  'dry-summer': {
    label: 'A Patch Through Drought',
    question: 'Does matching a planting to dry conditions establish a real water budget?',
    brief:
      'Compare the same diagnostic forms, then revisit the marked plot under a declared virtual dry summer. Keep an untreated comparison and measure both with the same points.',
    initialSeason: 'spring',
    visitSeason: 'dry-summer',
    afterSeason: 'late-summer',
    plotLight: 90,
    plotMoisture: 25,
    suitable: 'c',
    visitScale: 0.62,
    afterScale: 0.74,
    limitation: 'no-real-water-budget-measured'
  },
  'returning-canopy': {
    label: 'When the Canopy Returns',
    question: 'Is an increase in plant cover the same as an increase in species diversity?',
    brief:
      'Revisit a marked plot as its virtual canopy and season change. Choose a compatible planting, retain an untreated comparison and distinguish cover from species diversity.',
    initialSeason: 'summer',
    visitSeason: 'autumn',
    afterSeason: 'spring',
    plotLight: 55,
    plotMoisture: 55,
    suitable: 'b',
    visitScale: 0.76,
    afterScale: 0.92,
    limitation: 'cover-is-not-species-diversity'
  }
});
const plantIds = Object.keys(BOTANY_PLANTS),
  eventId = (run, revision) => `event:research:botany:${run}:${revision}`,
  validRun = (id) => /^[a-zA-Z0-9-]{8,64}$/.test(id || '');
export function normalizeBotanyCareer(value) {
  const state = normalizeFieldStudy(value);
  return state.schemaVersion === 1 ? { records: {}, ...state } : state;
}
export function botanyTarget(active) {
  if (['photographs', 'plants'].includes(active.phase)) return plantIds[active.plantIndex || 0];
  if (['choose-season', 'choose-followup', 'report'].includes(active.phase)) return 'bench';
  return 'plot';
}
export function botanyPlotComparison(active) {
  const before = active.plotReadings?.visit,
    after = active.plotReadings?.followup;
  if (!before || !after) return null;
  const treatmentDelta = after.treatment.coverPercent - before.treatment.coverPercent,
    controlDelta = after.control.coverPercent - before.control.coverPercent,
    differenceInChange = treatmentDelta - controlDelta;
  return {
    treatmentDelta,
    controlDelta,
    differenceInChange,
    result: differenceInChange > 0 ? 'increased-relative-to-control' : 'no-demonstrated-gain'
  };
}
function fresh(command, now) {
  return {
    runId: command.runId,
    variantId: command.variantId || 'campaign',
    site: validateFieldSite(command.site, BOTANY_OFFSETS),
    acceptedAt: now,
    phase: 'photographs',
    plantIndex: 0,
    captures: {},
    plants: {},
    markedAt: 0,
    currentSeason: BOTANY_STUDIES[command.variantId || 'campaign'].initialSeason,
    plotReadings: {},
    planting: null,
    report: null,
    completedAt: 0
  };
}
function photo(active, command, now) {
  const c = command.capture,
    plantId = plantIds[active.plantIndex],
    slot = `plant-${plantId}`;
  if (
    command.slot !== slot ||
    active.captures[slot] ||
    !c ||
    c.runId !== active.runId ||
    c.slot !== slot ||
    c.id !== researchPhotoId('botany', active.runId, slot) ||
    !Number.isFinite(c.at) ||
    c.at <= 0 ||
    Math.abs(c.at - now) > 2500 ||
    !Number.isInteger(c.width) ||
    !Number.isInteger(c.height) ||
    c.width < 64 ||
    c.height < 64 ||
    c.width > 1280 ||
    c.height > 1280 ||
    c.width * c.height > 1280 * 960 ||
    !/^[a-f0-9]{64}$/.test(c.fingerprint || '') ||
    c.view?.subjectId !== `${active.site.id}:plant:${plantId}` ||
    c.view.visible !== true ||
    c.view.environment !== 'EARTH' ||
    c.view.travelMode !== 'walk' ||
    c.view.liveGps ||
    !Number.isFinite(c.view.range) ||
    c.view.range < 0.4 ||
    c.view.range > 8
  )
    throw Error('Photograph this plant’s visible diagnostic structures before recording its form.');
  return copy(c);
}
function plantReading(active, id, reading, now) {
  if (
    !reading ||
    reading.plantId !== id ||
    reading.runId !== active.runId ||
    reading.siteId !== active.site.id ||
    reading.truthType !== 'authored-virtual-bed' ||
    reading.method !== 'paired-training-sensors' ||
    reading.depthCm !== 5 ||
    reading.units?.light !== 'relative-index' ||
    reading.units?.moisture !== 'relative-index' ||
    !Number.isFinite(reading.at) ||
    reading.at <= 0 ||
    Math.abs(reading.at - now) > 5000 ||
    !Number.isFinite(reading.light) ||
    !Number.isFinite(reading.moisture) ||
    reading.light < 0 ||
    reading.light > 100 ||
    reading.moisture < 0 ||
    reading.moisture > 100 ||
    reading.supported !== true
  )
    throw Error(
      'Use the plot’s light sensor and five-centimetre moisture probe with their declared virtual indices.'
    );
  return copy(reading);
}
function plotReading(active, phase, reading, now) {
  if (
    !reading ||
    reading.runId !== active.runId ||
    reading.siteId !== active.site.id ||
    reading.phase !== phase ||
    reading.virtualSeason !== active.currentSeason ||
    reading.truthType !== 'declared-season-simulation' ||
    reading.method !== 'vertical-point-intercept' ||
    reading.gridKey !== 'fixed-four-by-four-v1' ||
    reading.sideMeters !== 1.6 ||
    !Number.isFinite(reading.at) ||
    reading.at <= 0 ||
    Math.abs(reading.at - now) > 5000
  )
    throw Error(
      'Lower the fixed point frame on both parts of this marked plot in the declared virtual season.'
    );
  for (const id of ['control', 'treatment']) {
    const row = reading[id];
    if (
      !Array.isArray(row?.points) ||
      row.points.length !== 16 ||
      row.points.some((p, i) => p.index !== i || !['vegetation', 'soil'].includes(p.kind)) ||
      row.vegetationHits !== row.points.filter((p) => p.kind === 'vegetation').length ||
      row.coverPercent !== (row.vegetationHits / 16) * 100
    )
      throw Error(
        'Retain all sixteen ordered point readings and calculate cover from their actual vegetation hits.'
      );
  }
  return copy(reading);
}
export function transitionBotanyCareer(value, command, now = Date.now()) {
  const state = normalizeBotanyCareer(value),
    completed = { ...state.completed },
    records = { ...state.records };
  let active = state.active ? copy(state.active) : null,
    archivedRecord = null,
    mediaRefs = [],
    requiredMedia = [],
    visit = false;
  if (state.schemaVersion !== 1)
    throw Error('This saved botany career needs a newer version of World Explorer.');
  if (command?.revision !== state.revision)
    throw Error('This plot changed in another tab. Reopen it to continue.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The plot record could not be timed.');
  if (command.type === 'accept') {
    const variant = command.variantId || 'campaign';
    if (!BOTANY_STUDIES[variant] || (variant !== 'campaign' && !completed.campaign))
      throw Error('Complete A Living Patch before selecting a repeat study.');
    if (active && active.phase !== 'complete') {
      if (active.variantId !== variant)
        throw Error('Continue your current marked-plot study first.');
      return { state, event: null, samples: [] };
    }
    if (records[variant]) {
      active = copy(records[variant]);
      visit = true;
      requiredMedia = Object.values(active.captures);
    } else {
      if (!validRun(command.runId)) throw Error('The training plot could not start.');
      active = fresh(command, now);
    }
  } else if (command.type === 'relocate') {
    if (
      !active ||
      active.phase === 'complete' ||
      command.variantId !== active.variantId ||
      !validRun(command.runId) ||
      command.runId === active.runId ||
      (active.priorAttempts || []).some((row) => row.runId === command.runId)
    )
      throw Error('Choose an unfinished plant study and a fresh training site.');
    archivedRecord = copy(active);
    delete archivedRecord.priorAttempts;
    const prior = {
      runId: active.runId,
      site: copy(active.site),
      phase: active.phase,
      photoIds: Object.values(active.captures).map((row) => row.id),
      lastEventId: eventId(active.runId, state.revision),
      archivedAt: now
    };
    active = {
      ...active,
      ...fresh(command, now),
      priorAttempts: [...(active.priorAttempts || []), prior]
    };
  } else {
    if (!active || active.phase === 'complete')
      throw Error('Choose a plant study or visit its saved plot.');
    const study = BOTANY_STUDIES[active.variantId];
    if (!study) throw Error('This saved plant study needs a newer version.');
    requireFieldPresence(active, botanyTarget(active), command.evidence, now);
    if (command.type === 'photograph' && ['photographs', 'plants'].includes(active.phase)) {
      const capture = photo(active, command, now);
      active.captures[capture.slot] = capture;
      mediaRefs = [copy(capture)];
      active.phase = 'plants';
    } else if (command.type === 'measure-plant' && active.phase === 'plants') {
      const id = plantIds[active.plantIndex],
        ref = active.captures[`plant-${id}`];
      if (!ref)
        throw Error('Keep this plant’s diagnostic photograph before recording its comparison.');
      if (command.form !== BOTANY_PLANTS[id].form)
        throw Error(
          'Compare the visible frond, branch or blade structures without assigning an unsupported wild species.'
        );
      active.plants[id] = {
        form: command.form,
        reading: plantReading(active, id, command.reading, now),
        photoId: ref.id,
        at: now
      };
      requiredMedia = [ref];
      active.plantIndex++;
      if (active.plantIndex === 3) active.phase = 'mark-plot';
    } else if (command.type === 'mark-plot' && active.phase === 'mark-plot') {
      if (command.comparison !== 'light-and-moisture-contrast')
        throw Error('Compare both measured light and moisture across the three plant stations.');
      const light = Object.values(active.plants).map((row) => row.reading.light),
        moisture = Object.values(active.plants).map((row) => row.reading.moisture);
      if (
        Math.max(...light) - Math.min(...light) < 25 ||
        Math.max(...moisture) - Math.min(...moisture) < 20
      )
        throw Error(
          'The measured boundary is not resolved. Check the instruments before claiming a contrast.'
        );
      active.plotReadings.baseline = plotReading(active, 'baseline', command.reading, now);
      active.markedAt = now;
      active.phase = 'choose-season';
    } else if (command.type === 'declare-season' && active.phase === 'choose-season') {
      if (command.virtualSeason !== study.visitSeason)
        throw Error('Choose the declared return season for this study.');
      active.currentSeason = command.virtualSeason;
      active.seasonDeclaredAt = now;
      active.phase = 'revisit';
    } else if (command.type === 'revisit' && active.phase === 'revisit') {
      active.plotReadings.visit = plotReading(active, 'visit', command.reading, now);
      active.phase = 'planting';
    } else if (command.type === 'plant' && active.phase === 'planting') {
      const kind = BOTANY_PLANTS[command.variety],
        condition = command.condition;
      if (
        !kind ||
        !condition ||
        condition.runId !== active.runId ||
        condition.siteId !== active.site.id ||
        condition.method !== 'paired-training-sensors' ||
        condition.depthCm !== 5 ||
        condition.virtualSeason !== active.currentSeason ||
        condition.units?.light !== 'relative-index' ||
        condition.units?.moisture !== 'relative-index' ||
        condition.truthType !== 'authored-virtual-bed' ||
        !Number.isFinite(condition.at) ||
        condition.at <= 0 ||
        Math.abs(condition.at - now) > 5000 ||
        condition.light !== study.plotLight ||
        condition.moisture !== study.plotMoisture ||
        condition.light < kind.lightRange[0] ||
        condition.light > kind.lightRange[1] ||
        condition.moisture < kind.moistureRange[0] ||
        condition.moisture > kind.moistureRange[1]
      )
        throw Error(
          'Match the training variety’s stated light and moisture bands to the measured plot.'
        );
      const cell = command.cell;
      if (
        !Number.isInteger(cell) ||
        cell < 0 ||
        cell > 15 ||
        active.plotReadings.visit.treatment.points[cell].kind !== 'soil'
      )
        throw Error(
          'Place the virtual planting at an unoccupied point inside the treatment quadrat.'
        );
      active.planting = {
        variety: command.variety,
        assetId: kind.assetId,
        cell,
        condition: copy(condition),
        at: now
      };
      active.phase = 'choose-followup';
    } else if (command.type === 'declare-followup' && active.phase === 'choose-followup') {
      if (command.virtualSeason !== study.afterSeason)
        throw Error('Choose this study’s declared follow-up season.');
      active.currentSeason = command.virtualSeason;
      active.followupDeclaredAt = now;
      active.phase = 'followup';
    } else if (command.type === 'followup' && active.phase === 'followup') {
      if (!active.planting)
        throw Error('Place the compatible virtual planting before recording its follow-up.');
      active.plotReadings.followup = plotReading(active, 'followup', command.reading, now);
      active.phase = 'report';
    } else if (command.type === 'report' && active.phase === 'report') {
      const comparison = botanyPlotComparison(active);
      if (
        command.result !== comparison.result ||
        command.limitation !== study.limitation ||
        command.followUp !== 'repeat-the-same-points'
      )
        throw Error(
          'Describe the measured change relative to the untreated comparison and retain this study’s limit.'
        );
      requiredMedia = Object.values(active.captures);
      active.report = {
        comparison,
        limitation: command.limitation,
        followUp: command.followUp,
        conclusion: `The treatment changed by ${comparison.treatmentDelta.toFixed(2)} percentage points and its untreated comparison by ${comparison.controlDelta.toFixed(2)}. ${comparison.result === 'increased-relative-to-control' ? 'Cover increased relative to that comparison.' : 'This sampling does not demonstrate a gain relative to that comparison.'} These declared-season training results do not predict real restoration or establish species diversity.`,
        at: now
      };
      active.completedAt = now;
      active.phase = 'complete';
      completed[active.variantId] = eventId(active.runId, state.revision + 1);
      records[active.variantId] = copy(active);
    } else throw Error('That action does not match the current plant study step.');
  }
  const revision = state.revision + 1,
    study = BOTANY_STUDIES[active.variantId],
    finished = command.type === 'report' && active.phase === 'complete';
  const action = Object.fromEntries(
    [
      'type',
      'revision',
      'runId',
      'variantId',
      'site',
      'evidence',
      'slot',
      'capture',
      'form',
      'reading',
      'comparison',
      'virtualSeason',
      'variety',
      'condition',
      'cell',
      'result',
      'limitation',
      'followUp'
    ]
      .filter((key) => command[key] !== undefined)
      .map((key) => [key, copy(command[key])])
  );
  const report = finished
    ? {
        title: study.label,
        truthType: 'declared-season-plant-study',
        runId: active.runId,
        site: active.site,
        captures: active.captures,
        plants: active.plants,
        initialSeason: study.initialSeason,
        visitSeason: study.visitSeason,
        afterSeason: study.afterSeason,
        plotReadings: active.plotReadings,
        planting: active.planting,
        ...active.report
      }
    : null;
  const event = {
    eventId: eventId(active.runId, revision),
    eventType: finished ? 'campaign-completed' : 'campaign-progress',
    sourceSystem: 'research-careers',
    sourceId: `botany:${active.variantId}:${visit ? 'visit' : command.type}:${command.slot || ''}`,
    activityId: command.type === 'photograph' ? 'photograph' : 'habitat-survey',
    pathId: 'field',
    name: `${study.label} · ${finished ? 'plant plate' : visit ? 'marked plot revisited' : command.type === 'relocate' ? 'training site moved' : 'field record'}`,
    detail: finished
      ? active.report.conclusion
      : visit
        ? 'The marked plot, planted geometry and original report are retained. No new result is inferred.'
        : 'Virtual training plants and declared seasonal simulation; no real occurrence, care or edible-plant identification is inferred.',
    occurredAt: now,
    environment: 'EARTH',
    regionId: active.site.id,
    regionLabel: active.site.name,
    locationSnapshot: { ...active.site.location, name: active.site.name },
    points: 0,
    firstCompletion: finished && !state.completed[active.variantId],
    projections: {
      journal:
        !visit &&
        [
          'measure-plant',
          'mark-plot',
          'revisit',
          'plant',
          'followup',
          'report',
          'relocate'
        ].includes(command.type),
      profile:
        !visit &&
        ['measure-plant', 'mark-plot', 'revisit', 'plant', 'followup', 'report'].includes(
          command.type
        ),
      place: false
    },
    metadata: {
      careerId: 'botany',
      runId: active.runId,
      variantId: active.variantId,
      phase: active.phase,
      truthType: 'declared-season-plant-study',
      action,
      ...(archivedRecord ? { botanyArchive: archivedRecord } : {}),
      ...(report ? { botanyReport: report } : {}),
      sourceRefs: copy(BOTANY_CAREER.sourceRefs)
    }
  };
  return {
    state: { ...state, revision, active, completed, records },
    event,
    samples: [],
    mediaRefs,
    requiredMedia
  };
}
export function botanyCareerSummary(value, { variantId = 'campaign' } = {}) {
  const state = normalizeBotanyCareer(value),
    study = BOTANY_STUDIES[variantId] || BOTANY_STUDIES.campaign;
  if (state.schemaVersion !== 1)
    return {
      title: study.label,
      summary: 'This saved career needs a newer version of World Explorer.',
      resume: false,
      choices: [],
      stages: []
    };
  const active = state.active?.variantId === variantId ? state.active : null,
    complete = !!state.records[variantId],
    phases = [
      ['photographs'],
      ['plants'],
      ['mark-plot', 'choose-season', 'revisit'],
      ['planting', 'choose-followup', 'followup'],
      ['report']
    ],
    stage =
      active?.phase === 'complete' ? 5 : phases.findIndex((row) => row.includes(active?.phase));
  return {
    title: study.label,
    summary: study.question,
    resume: !!active && active.phase !== 'complete',
    ...(complete ? { actionLabel: 'Visit marked plot' } : {}),
    ...(state.active && state.active.phase !== 'complete'
      ? {
          recovery: {
            id: 'relocate-course',
            label: 'Move training site',
            reason:
              'Fresh plants and measurements are required at the moved plot. Earlier records and photographs stay in Journal.'
          }
        }
      : {}),
    choices: Object.entries(BOTANY_STUDIES)
      .filter(([id]) =>
        state.active && state.active.phase !== 'complete'
          ? id === state.active.variantId
          : id === 'campaign' || state.completed.campaign
      )
      .map(([id, row]) => ({ id, label: row.label })),
    stages: [
      'Photograph diagnostic plant structures',
      'Compare three plants and their measured boundary',
      'Mark a fixed plot and revisit a declared virtual season',
      'Place a compatible planting and sample the same points',
      'Save a plant plate, comparison and limits'
    ].map((label, i) => ({ label, complete: stage > i }))
  };
}
export function botanyCareerBadge(value) {
  const state = normalizeBotanyCareer(value);
  return state.schemaVersion === 1 && state.completed.campaign
    ? {
        id: 'living-patch-survey',
        label: 'Plant Survey',
        detail:
          'Compared diagnostic plants and fixed-point cover through a declared virtual restoration study.',
        eventId: state.completed.campaign
      }
    : null;
}
export const validateBotanyCareerBackup = (value, events, items) =>
  validateFieldHistory('botany', value, events, items, transitionBotanyCareer);
