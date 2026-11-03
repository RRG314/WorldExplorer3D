import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  validateFieldSite,
  requireFieldPresence,
  validateFieldHistory
} from './field-study-contract.js';
import { researchPhotoId } from './research-media.js';
export const WILDLIFE_CAREER = Object.freeze({
  id: 'wildlife',
  title: 'Two Habitats',
  badge: 'Habitat Observer',
  sourceUrl: 'https://support.ebird.org/en/support/solutions/articles/48000950859'
});
export const WILDLIFE_OFFSETS = Object.freeze({
  a: { x: -9, z: 0 },
  b: { x: 9, z: 0 },
  bench: { x: 0, z: 8 }
});
export const WILDLIFE_HABITATS = Object.freeze({
  a: { label: 'Wooded edge', cover: 'tree-and-shrub-cover' },
  b: { label: 'Open edge', cover: 'low-open-cover' }
});
export const WILDLIFE_STUDIES = Object.freeze({
  campaign: {
    label: 'Two Habitats',
    question: 'What can two comparable short observations tell you about contrasting cover?',
    brief:
      'Compare a wooded training patch and an open training patch in an admitted park or field. Choose a stationary watch or a short transect; use the same protocol at both. These simulated animals and habitats describe this exercise. Real wildlife presence at the location remains unknown.',
    lead: 'animal',
    methods: ['stationary-watch', 'transect'],
    activityId: 'nature-observe',
    limitation: 'short-pair-not-population',
    followUp: 'repeat-same-method-other-time'
  },
  'tracks-and-photos': {
    label: 'Tracks Are Evidence',
    question: 'Can a persistent track establish that an animal was present during your watch?',
    brief:
      'Follow two short, marked transects. Compare the visible hoof-like and canid-like training signs and photograph their diagnostic structures. A track can persist after its maker has gone; its form may support a group without identifying a species.',
    lead: 'track',
    methods: ['track-photo'],
    activityId: 'wildlife-track',
    limitation: 'signs-do-not-date-presence',
    followUp: 'compare-fresh-evidence'
  },
  'trail-cameras': {
    label: 'Who Passed the Sensor?',
    question: 'Are repeated camera detections the same as a count of different animals?',
    brief:
      'Align a modeled trail-camera sensor at each habitat and run equal observation windows. Its virtual motion triggers produce detection records, not photographs or a population census. Review repeated detections and the possibility of missed animals.',
    lead: 'track',
    methods: ['trail-camera'],
    activityId: 'trail-camera-survey',
    limitation: 'detections-not-individuals',
    followUp: 'repeat-sensors-longer'
  }
});
export const WILDLIFE_METHODS = Object.freeze({
  'stationary-watch': {
    label: 'Stationary watch',
    seconds: 10,
    minimumDistance: 0,
    maximumDistance: 0.8,
    source: 'visible-animal'
  },
  transect: {
    label: 'Short walking transect',
    seconds: 10,
    minimumDistance: 5,
    maximumDistance: 8,
    source: 'visible-animal'
  },
  'track-photo': {
    label: 'Tracking transect with photographs',
    seconds: 10,
    minimumDistance: 5,
    maximumDistance: 8,
    source: 'visible-track'
  },
  'trail-camera': {
    label: 'Mounted trail-camera detection window',
    seconds: 10,
    minimumDistance: 0,
    maximumDistance: 40,
    source: 'virtual-motion-trigger'
  }
});
export const normalizeWildlifeCareer = normalizeFieldStudy;
export const wildlifeTarget = (active) =>
  ['review', 'interpretation', 'complete'].includes(active.phase)
    ? 'bench'
    : active.phase === 'survey'
      ? active.habitatIndex === 0
        ? 'a'
        : 'b'
      : 'a';
const eventId = (run, revision) => `event:research:wildlife:${run}:${revision}`;
const dimensions = (c) =>
  Number.isInteger(c.width) &&
  Number.isInteger(c.height) &&
  c.width >= 64 &&
  c.height >= 64 &&
  c.width <= 1280 &&
  c.height <= 1280 &&
  c.width * c.height <= 1280 * 960;
function freshAttempt(command, now) {
  return {
    runId: command.runId,
    variantId: command.variantId || 'campaign',
    site: validateFieldSite(command.site, WILDLIFE_OFFSETS),
    acceptedAt: now,
    phase: 'brief',
    lead: null,
    method: null,
    habitatIndex: 0,
    surveys: {},
    captures: {},
    identifications: {},
    comparison: null,
    report: null,
    completedAt: 0
  };
}
function validRun(id) {
  return /^[a-zA-Z0-9-]{8,64}$/.test(id || '');
}
function measuredEffort(active, command, now) {
  const row = command.effort,
    habitat = active.habitatIndex === 0 ? 'a' : 'b',
    protocol = WILDLIFE_METHODS[active.method];
  if (
    !row ||
    row.runId !== active.runId ||
    row.habitatId !== habitat ||
    row.method !== active.method ||
    !Number.isFinite(row.startedAt) ||
    !Number.isFinite(row.endedAt) ||
    row.startedAt < active.acceptedAt ||
    row.endedAt < row.startedAt ||
    row.endedAt > now ||
    !Number.isFinite(row.activeSeconds) ||
    row.activeSeconds < protocol.seconds ||
    row.activeSeconds > 600 ||
    row.activeSeconds > (row.endedAt - row.startedAt) / 1000 + 0.05 ||
    !Number.isFinite(row.distanceMeters) ||
    row.distanceMeters < protocol.minimumDistance ||
    row.distanceMeters > protocol.maximumDistance ||
    row.supported !== true ||
    row.liveGps ||
    row.interrupted
  )
    throw Error(
      'Finish a supported, unpaused observation with the selected method and its actual effort.'
    );
  if (
    protocol.minimumDistance &&
    JSON.stringify(row.routeGates) !== JSON.stringify(['start', 'finish'])
  )
    throw Error('Walk the marked transect from its start to its finish before recording.');
  if (active.method === 'trail-camera' && ![1, 2].includes(row.instrumentVersion ?? 1))
    throw Error('This sensor protocol needs a newer version of World Explorer.');
  if (active.method === 'trail-camera' && row.sensor?.aligned !== true)
    throw Error('Align the mounted sensor with the marked detection path.');
  if (
    !Array.isArray(row.observations) ||
    row.observations.length > 16 ||
    new Set(row.observations.map((r) => r.id)).size !== row.observations.length
  )
    throw Error('The observation record is incomplete. Restart this observation.');
  const allowed =
    active.method === 'track-photo'
      ? ['hoofed-mammal-sign', 'canid-sign']
      : ['white-tailed-deer', 'woodland-fox'];
  for (const observed of row.observations)
    if (
      !observed.id?.startsWith(`research-wildlife:${active.runId}:${habitat}:`) ||
      !allowed.includes(observed.taxon) ||
      observed.source !== protocol.source ||
      !['walking', 'standing', 'persistent-sign', 'moving-through-cone'].includes(
        observed.behavior
      ) ||
      (active.method === 'track-photo' && observed.behavior !== 'persistent-sign') ||
      (active.method === 'trail-camera' && observed.behavior !== 'moving-through-cone') ||
      (['stationary-watch', 'transect'].includes(active.method) &&
        !['walking', 'standing'].includes(observed.behavior)) ||
      observed.truthType !== 'virtual-training-observation' ||
      !Number.isFinite(observed.firstAt) ||
      !Number.isFinite(observed.lastAt) ||
      observed.firstAt < row.startedAt ||
      observed.lastAt < observed.firstAt ||
      observed.lastAt > row.endedAt ||
      !Number.isInteger(observed.detections) ||
      observed.detections < 1 ||
      observed.detections > 1000 ||
      (active.method !== 'trail-camera' && observed.visible !== true)
    )
      throw Error(
        'Keep only actual visible observations or recorded virtual sensor detections from this habitat.'
      );
  return copy(row);
}
export function wildlifeEffortComparison(active) {
  const a = active.surveys.a,
    b = active.surveys.b;
  if (!a || !b) return null;
  const secondsDifference = Math.abs(a.activeSeconds - b.activeSeconds),
    distanceDifference = Math.abs(a.distanceMeters - b.distanceMeters);
  const sameMethod = a.method === b.method,
    sameInstrument = (a.instrumentVersion ?? 1) === (b.instrumentVersion ?? 1),
    versioned = a.instrumentVersion !== undefined || b.instrumentVersion !== undefined;
  const matched =
    sameMethod &&
    sameInstrument &&
    secondsDifference <= Math.max(0.5, Math.max(a.activeSeconds, b.activeSeconds) * 0.1) &&
    distanceDifference <= Math.max(0.8, Math.max(a.distanceMeters, b.distanceMeters) * 0.2);
  return {
    status: matched ? 'matched' : 'unequal-effort',
    sameMethod,
    secondsDifference,
    distanceDifference,
    ...(versioned ? { sameInstrument } : {})
  };
}
export function transitionWildlifeCareer(value, command, now = Date.now()) {
  const state = normalizeFieldStudy(value),
    completed = { ...state.completed },
    samples = [];
  let active = state.active ? copy(state.active) : null,
    archivedRecord = null,
    mediaRefs = [],
    requiredMedia = [];
  if (state.schemaVersion !== 1)
    throw Error('This saved wildlife career needs a newer version of World Explorer.');
  if (command?.revision !== state.revision)
    throw Error('This survey changed in another tab. Reopen it to continue.');
  if (!Number.isFinite(now) || now <= 0) throw Error('This observation could not be timed.');
  if (command.type === 'accept') {
    const variant = command.variantId || 'campaign';
    if (!WILDLIFE_STUDIES[variant] || (variant !== 'campaign' && !completed.campaign))
      throw Error('Complete Two Habitats before choosing a repeat study.');
    if (active && active.phase !== 'complete') {
      if (active.variantId !== variant)
        throw Error('Continue your current habitat comparison first.');
      return { state, event: null, samples };
    }
    if (!validRun(command.runId)) throw Error('This habitat comparison could not start.');
    active = freshAttempt(command, now);
  } else if (command.type === 'relocate') {
    if (
      !active ||
      active.phase === 'complete' ||
      command.variantId !== active.variantId ||
      !validRun(command.runId) ||
      command.runId === active.runId ||
      (active.priorAttempts || []).some((row) => row.runId === command.runId)
    )
      throw Error('Choose an unfinished survey and a fresh training site.');
    archivedRecord = copy(active);
    delete archivedRecord.priorAttempts;
    const previous = {
      runId: active.runId,
      site: copy(active.site),
      phase: active.phase,
      photoIds: Object.values(active.captures).map((row) => row.id),
      lastEventId: eventId(active.runId, state.revision),
      archivedAt: now
    };
    active = {
      ...active,
      ...freshAttempt(command, now),
      priorAttempts: [...(active.priorAttempts || []), previous]
    };
  } else {
    if (!active || active.phase === 'complete') throw Error('Choose a habitat comparison first.');
    const study = WILDLIFE_STUDIES[active.variantId];
    if (!study) throw Error('This saved study needs a newer version.');
    requireFieldPresence(active, wildlifeTarget(active), command.evidence, now);
    const habitat = active.habitatIndex === 0 ? 'a' : 'b';
    if (command.type === 'inspect' && active.phase === 'brief') {
      const lead = command.lead;
      if (
        lead?.kind !== study.lead ||
        lead.visible !== true ||
        lead.truthType !== 'virtual-training-observation' ||
        !lead.id?.startsWith(`research-wildlife:${active.runId}:a:`) ||
        !Number.isFinite(lead.at) ||
        Math.abs(lead.at - now) > 2000
      )
        throw Error(
          'Frame the visible animal or reliable training sign before recording the lead.'
        );
      active.lead = copy(lead);
      active.phase = 'method';
    } else if (command.type === 'method' && active.phase === 'method') {
      if (!study.methods.includes(command.method))
        throw Error('Choose a protocol suited to this study.');
      active.method = command.method;
      active.phase = 'survey';
    } else if (
      command.type === 'photograph' &&
      active.phase === 'survey' &&
      active.method === 'track-photo'
    ) {
      const c = command.capture,
        slot = `habitat-${habitat}`;
      if (
        command.slot !== slot ||
        active.captures[slot] ||
        !c ||
        c.runId !== active.runId ||
        c.slot !== slot ||
        c.id !== researchPhotoId('wildlife', active.runId, slot) ||
        !dimensions(c) ||
        !Number.isFinite(c.at) ||
        Math.abs(c.at - now) > 2500 ||
        !/^[a-f0-9]{64}$/.test(c.fingerprint || '') ||
        c.view?.subjectId !== `${active.site.id}:sign:${habitat}` ||
        c.view.visible !== true ||
        c.view.environment !== 'EARTH' ||
        c.view.travelMode !== 'walk' ||
        c.view.liveGps ||
        !Number.isFinite(c.view.range) ||
        c.view.range < 0.5 ||
        c.view.range > 8
      )
        throw Error('Take a clear, fresh photograph of this habitat’s diagnostic training sign.');
      active.captures[slot] = copy(c);
      mediaRefs = [copy(c)];
    } else if (command.type === 'survey' && active.phase === 'survey') {
      const effort = measuredEffort(active, command, now);
      if (active.method === 'track-photo') {
        const ref = active.captures[`habitat-${habitat}`];
        if (!ref) throw Error('Keep the diagnostic sign photograph before filing this transect.');
        requiredMedia = [ref];
      }
      active.surveys[habitat] = {
        habitatId: habitat,
        cover: WILDLIFE_HABITATS[habitat].cover,
        ...effort,
        photoId: active.captures[`habitat-${habitat}`]?.id || null,
        recordEventId: eventId(active.runId, state.revision + 1),
        recordedAt: now
      };
      active.habitatIndex++;
      if (active.habitatIndex === 2) active.phase = 'review';
    } else if (command.type === 'identify' && active.phase === 'review') {
      const comparison = wildlifeEffortComparison(active);
      if (command.effortComparison !== comparison.status)
        throw Error(
          'Compare both recorded durations and distances before reviewing identifications.'
        );
      for (const id of ['a', 'b']) {
        const observed = active.surveys[id].observations,
          entry = command.identifications?.[id];
        if (
          !entry ||
          !['confident', 'tentative', 'not-observed'].includes(entry.confidence) ||
          (!observed.length &&
            (entry.confidence !== 'not-observed' || entry.taxon !== 'unresolved')) ||
          (observed.length &&
            (entry.confidence === 'not-observed' ||
              (entry.confidence === 'confident' && entry.taxon === 'unresolved') ||
              (entry.taxon !== 'unresolved' &&
                !observed.some((row) => row.taxon === entry.taxon)))) ||
          (active.method === 'track-photo' && entry.confidence === 'confident')
        )
          throw Error(
            'Use the recorded evidence, retain identification uncertainty, and distinguish not observed from absence.'
          );
        active.identifications[id] = {
          taxon: entry.taxon,
          confidence: entry.confidence,
          detection: observed.length ? 'observed' : 'not-observed',
          at: now
        };
      }
      active.comparison = comparison;
      active.phase = 'interpretation';
    } else if (command.type === 'report' && active.phase === 'interpretation') {
      if (
        command.coverContrast !== 'wooded-versus-open' ||
        !['paired-observations-only', 'inconclusive'].includes(command.interpretation) ||
        command.limitation !== study.limitation ||
        (active.comparison.status === 'unequal-effort' &&
          (command.interpretation !== 'inconclusive' ||
            command.followUp !== 'repeat-matching-effort')) ||
        (active.comparison.status === 'matched' && command.followUp !== study.followUp)
      )
        throw Error(
          'Compare the actual habitat cover and keep the limit and follow-up appropriate to this method.'
        );
      requiredMedia = Object.values(active.captures);
      active.report = {
        coverContrast: command.coverContrast,
        interpretation: command.interpretation,
        limitation: command.limitation,
        followUp: command.followUp,
        conclusion:
          active.comparison.status === 'unequal-effort'
            ? 'The two protocols retained their actual unequal effort. Counts cannot be directly compared; repeat matched observations before drawing a habitat explanation.'
            : active.method === 'track-photo'
              ? 'The two photographed transects retain different training signs. Their persistence and uncertain makers prevent a claim that those animals were present during the survey.'
              : active.method === 'trail-camera'
                ? 'The paired sensor windows retain actual virtual detection events. Repeated detections can come from one recognizable model; non-detection does not establish absence.'
                : 'The paired checklists retain actual observed models and comparable short effort in contrasting virtual cover. This pair does not establish absence, population size or habitat preference.',
        at: now
      };
      active.phase = 'complete';
      active.completedAt = now;
      completed[active.variantId] = eventId(active.runId, state.revision + 1);
    } else throw Error('That action does not match the current wildlife study step.');
  }
  const revision = state.revision + 1,
    study = WILDLIFE_STUDIES[active.variantId],
    complete = active.phase === 'complete',
    action = Object.fromEntries(
      [
        'type',
        'revision',
        'runId',
        'variantId',
        'site',
        'evidence',
        'lead',
        'method',
        'slot',
        'capture',
        'effort',
        'identifications',
        'effortComparison',
        'coverContrast',
        'interpretation',
        'limitation',
        'followUp'
      ]
        .filter((key) => command[key] !== undefined)
        .map((key) => [key, copy(command[key])])
    );
  const report = complete
    ? {
        title: study.label,
        truthType: 'authored-virtual-habitats',
        site: active.site,
        method: active.method,
        surveys: active.surveys,
        captures: active.captures,
        identifications: active.identifications,
        comparison: active.comparison,
        ...active.report
      }
    : null;
  const event = {
    eventId: eventId(active.runId, revision),
    eventType: complete ? 'campaign-completed' : 'campaign-progress',
    sourceSystem: 'research-careers',
    sourceId: `wildlife:${active.variantId}:${command.type}:${command.slot || ''}`,
    activityId: study.activityId,
    pathId: 'field',
    name: `${study.label} · ${complete ? 'habitat report' : command.type === 'survey' ? 'comparable checklist' : command.type === 'relocate' ? 'training site moved' : 'field record'}`,
    detail: complete
      ? active.report.conclusion
      : command.type === 'relocate'
        ? 'The earlier survey remains in Journal; the moved training habitats require fresh observations.'
        : 'Short virtual wildlife exercise; no collecting and no claim of real sightings at this location.',
    occurredAt: now,
    environment: 'EARTH',
    regionId: active.site.id,
    regionLabel: active.site.name,
    locationSnapshot: { ...active.site.location, name: active.site.name },
    points: 0,
    firstCompletion: complete && !state.completed[active.variantId],
    projections: {
      journal: ['inspect', 'survey', 'identify', 'report', 'relocate'].includes(command.type),
      profile: ['inspect', 'survey', 'identify', 'report'].includes(command.type),
      place: false
    },
    metadata: {
      careerId: 'wildlife',
      runId: active.runId,
      variantId: active.variantId,
      phase: active.phase,
      truthType: 'authored-virtual-habitats',
      action,
      ...(report ? { wildlifeReport: report } : {}),
      ...(archivedRecord ? { wildlifeArchive: archivedRecord } : {}),
      sourceRefs: [
        { url: WILDLIFE_CAREER.sourceUrl, truthType: 'protocol-concepts-not-an-ebird-submission' }
      ]
    }
  };
  return {
    state: { ...state, revision, active, completed },
    event,
    samples,
    mediaRefs,
    requiredMedia
  };
}
export function wildlifeCareerSummary(value, { variantId = 'campaign' } = {}) {
  const state = normalizeFieldStudy(value),
    study = WILDLIFE_STUDIES[variantId] || WILDLIFE_STUDIES.campaign;
  if (state.schemaVersion !== 1)
    return {
      title: study.label,
      summary: 'This saved career needs a newer version of World Explorer.',
      resume: false,
      choices: [],
      stages: []
    };
  const phase = state.active?.variantId === variantId ? state.active.phase : null,
    index = ['brief', 'method', 'survey', 'review', 'interpretation', 'complete'].indexOf(phase);
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
              'Start fresh observations in clear training habitats. Earlier checklists and photographs stay in Journal.'
          }
        }
      : {}),
    choices: Object.entries(WILDLIFE_STUDIES)
      .filter(([id]) => id === 'campaign' || state.completed.campaign)
      .map(([id, row]) => ({ id, label: row.label })),
    stages: [
      'Inspect a visible animal or reliable sign',
      'Choose and measure a real observation protocol',
      'Repeat that protocol in contrasting virtual cover',
      'Review identification confidence and non-detection',
      'File comparable checklists, limits and a follow-up'
    ].map((label, i) => ({ label, complete: index > i }))
  };
}
export function wildlifeCareerBadge(value) {
  const state = normalizeFieldStudy(value);
  return state.schemaVersion === 1 && state.completed.campaign
    ? {
        id: 'paired-habitat-survey',
        label: 'Habitat Observer',
        detail:
          'Compared actual observations and effort in two virtual habitats, retaining uncertainty and non-detection limits.',
        eventId: state.completed.campaign
      }
    : null;
}
export const validateWildlifeCareerBackup = (value, events, items) =>
  validateFieldHistory('wildlife', value, events, items, transitionWildlifeCareer);
