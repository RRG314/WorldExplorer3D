import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  fieldCoordinate,
  fieldDistance,
  validateFieldHistory,
} from './field-study-contract.js';
import {
  marinePoint,
  requireMarineVoyage,
  requireMarinePresence,
} from './marine-study-contract.js';
export const MARINE_BIOLOGY_PROTOCOL = Object.freeze({
  viewProtocol: 'licensed-mesh-camera-150ms-v1',
  seconds: 8,
  surfaceDepthMeters: 3,
  stationaryDriftMeters: 2,
  fishDistanceMeters: 5,
  dolphinDistanceMeters: 50,
  maximumViewMeters: 160,
});
const OFFSHORE_SITE = Object.freeze({ lat: 34.2, lon: -120.4, name: 'Offshore California' });
export const MARINE_BIOLOGY_STUDIES = Object.freeze({
  campaign: {
    label: 'Life Along the Slope',
    question: 'What do equally observed upper and lower virtual water habitats reveal?',
    method: 'habitat-stationary-v1',
    site: OFFSHORE_SITE,
    habitats: ['upper-pelagic', 'lower-pelagic'],
    depthBands: [
      [0, 6],
      [6, 20],
    ],
    actorDepths: [2, 12],
    followKind: 'dolphin',
    habitatKind: 'pelagic',
  },
  'swim-transects': {
    label: 'The Same Marked Search',
    question: 'How does a matched moving search differ from a stationary watch?',
    method: 'habitat-transect-v1',
    site: OFFSHORE_SITE,
    habitats: ['upper-pelagic', 'lower-pelagic'],
    depthBands: [
      [0, 6],
      [6, 20],
    ],
    actorDepths: [2, 12],
    followKind: 'dolphin',
    habitatKind: 'pelagic',
  },
  'open-water': {
    label: 'A Deeper Non-Detection',
    question: 'Does an empty deeper watch establish that an animal is absent?',
    method: 'habitat-stationary-v1',
    site: OFFSHORE_SITE,
    habitats: ['upper-pelagic', 'deep-pelagic'],
    depthBands: [
      [0, 6],
      [20, 35],
    ],
    actorDepths: [2, 27],
    followKind: 'dolphin',
    habitatKind: 'pelagic',
  },
});
export const MARINE_BIOLOGY_SOURCES = Object.freeze([
  {
    url: 'https://coralreef.noaa.gov/topics/national-coral-reef-monitoring-program/protocols',
    truthType: 'standardized-observation-reference',
  },
  {
    url: 'https://www.fisheries.noaa.gov/topic/marine-life-viewing-guidelines',
    truthType: 'non-disturbing-observation-reference',
  },
]);
export function normalizeMarineBiologyCareer(value) {
  const state = normalizeFieldStudy(value);
  return state.schemaVersion === 1 ? { records: {}, ...state } : state;
}
const eventId = (run, revision) => `event:research:marine-biology:${run}:${revision}`;
const dist = (a, b, u) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * u;
function windowValue(active, value, kind, now, habitatId = null) {
  const c = value?.config,
    study = MARINE_BIOLOGY_STUDIES[active.variantId],
    expected =
      kind === 'surface'
        ? 'surface-watch-v1'
        : kind === 'follow'
          ? 'individual-follow-v1'
          : study.method;
  if (
    !value ||
    c?.runId !== active.runId ||
    c.voyageId !== active.voyage.id ||
    c.subId !== active.voyage.subId ||
    c.kind !== kind ||
    c.method !== expected ||
    c.seconds !== MARINE_BIOLOGY_PROTOCOL.seconds ||
    c.viewProtocol !== MARINE_BIOLOGY_PROTOCOL.viewProtocol ||
    typeof c.sceneId !== 'string' ||
    !c.sceneId ||
    c.sceneId.length > 100 ||
    !Number.isFinite(c.metersPerUnit) ||
    c.metersPerUnit <= 0 ||
    value.ready !== true ||
    value.interrupted ||
    !Number.isFinite(value.startedAt) ||
    !Number.isFinite(value.completedAt) ||
    value.startedAt <= 0 ||
    value.completedAt > now + 100 ||
    !Number.isFinite(value.activeSeconds) ||
    value.activeSeconds < 8 ||
    value.activeSeconds > (value.completedAt - value.startedAt) / 1000 + 0.1 ||
    !Number.isFinite(value.excludedSeconds) ||
    value.excludedSeconds < 0 ||
    value.activeSeconds + value.excludedSeconds >
      (value.completedAt - value.startedAt) / 1000 + 0.3 ||
    !marinePoint(value.startPosition) ||
    !marinePoint(value.endPosition) ||
    !Number.isFinite(value.distanceMeters) ||
    value.distanceMeters < 0 ||
    !Array.isArray(value.contexts) ||
    !value.contexts.length ||
    value.contexts.length > 3 ||
    !Array.isArray(value.observations) ||
    value.observations.length > 64
  )
    throw Error('Retain a complete, physically timed observation window from this vessel.');
  const ids = new Set();
  for (const o of value.observations) {
    const minimum = o?.speciesId === 'short_beaked_common_dolphin' ? 50 : 5;
    if (
      !o ||
      o.truthType !== 'simulated-licensed-animal' ||
      o.visible !== true ||
      o.lineClear !== true ||
      !['fish', 'dolphin'].includes(o.kind) ||
      typeof o.individualId !== 'string' ||
      o.individualId.length < 3 ||
      o.individualId.length > 180 ||
      ids.has(o.individualId) ||
      !/^[a-z][a-z0-9_-]{1,100}$/.test(o.speciesId || '') ||
      typeof o.assetId !== 'string' ||
      !o.assetId ||
      !marinePoint(o.position) ||
      !marinePoint(o.observerPosition) ||
      !Number.isFinite(o.waterSurfaceY) ||
      Math.abs(Math.max(0, (o.waterSurfaceY - o.position.y) * c.metersPerUnit) - o.depthMeters) >
        0.05 ||
      Math.abs(dist(o.position, o.observerPosition, c.metersPerUnit) - o.distanceMeters) > 0.05 ||
      (o.kind === 'dolphin' && o.depthMeters > 20) ||
      !Number.isFinite(o.distanceMeters) ||
      o.distanceMeters < minimum ||
      o.distanceMeters > 160 ||
      !Number.isFinite(o.minimumDistanceMeters) ||
      o.minimumDistanceMeters < minimum ||
      !Number.isFinite(o.depthMeters) ||
      o.depthMeters < 0 ||
      !Number.isFinite(o.observedAt) ||
      o.observedAt < value.startedAt - 200 ||
      o.observedAt > value.completedAt ||
      (o.kind === 'dolphin') !== (o.speciesId === 'short_beaked_common_dolphin') ||
      !Number.isFinite(o.firstSeenAt) ||
      !Number.isFinite(o.lastSeenAt) ||
      o.firstSeenAt < value.startedAt ||
      o.lastSeenAt < o.firstSeenAt ||
      o.lastSeenAt > value.completedAt
    )
      throw Error(
        'Retain unique, clear views of licensed virtual animals at a respectful distance.'
      );
    ids.add(o.individualId);
  }
  for (const context of value.contexts) {
    if (
      !context ||
      !Number.isFinite(context.at) ||
      context.at < value.startedAt ||
      context.at > value.completedAt ||
      !marinePoint(context.observerPosition) ||
      !Number.isFinite(context.waterSurfaceY) ||
      Math.abs(
        Math.max(0, (context.waterSurfaceY - context.observerPosition.y) * c.metersPerUnit) -
          context.depthMeters
      ) > 0.05 ||
      context.depthTruth !== 'measured-game-depth' ||
      context.depthSourceId !== 'water-surface-observer-position-v1' ||
      !Number.isFinite(context.depthMeters) ||
      context.depthMeters < 0 ||
      context.depthMeters > 12000 ||
      context.light?.truthType !== 'scene-lighting' ||
      context.light.sourceId !== 'rendered-ocean-light-v1' ||
      !Number.isFinite(context.light.relative) ||
      context.light.relative < 0 ||
      context.light.relative > 1 ||
      context.current?.truthType !== 'unavailable'
    )
      throw Error(
        'Retain actual game depth/light and the missing-current limit; do not invent local flow measurements.'
      );
    if (kind === 'surface' && context.depthMeters > MARINE_BIOLOGY_PROTOCOL.surfaceDepthMeters)
      throw Error('Conduct the surface watch within three game metres of the water surface.');
    if (kind === 'habitat') {
      const h = context.habitat;
      if (
        h?.id !== habitatId ||
        h.truthType !== 'virtual-habitat-view' ||
        h.visible !== true ||
        h.lineClear !== true ||
        h.ready !== true ||
        !marinePoint(h.position) ||
        !fieldCoordinate(h.coordinate) ||
        !Number.isFinite(h.distanceMeters) ||
        Math.abs(dist(h.position, context.observerPosition, c.metersPerUnit) - h.distanceMeters) >
          0.05 ||
        h.distanceMeters < (study.habitatKind === 'pelagic' ? 0 : 3) ||
        h.distanceMeters > 25 ||
        (study.habitatKind === 'reef' && h.licensedInvertebrates !== true)
      )
        throw Error('Observe the actual ready habitat patch without entering or disturbing it.');
    }
  }
  if (
    kind !== 'follow' &&
    expected !== 'habitat-transect-v1' &&
    (!Number.isFinite(value.maximumDriftMeters) || value.maximumDriftMeters > 2)
  )
    throw Error('The paired stationary watches must keep their original viewpoints.');
  if (
    expected === 'habitat-transect-v1' &&
    (value.gateIndex !== 2 ||
      value.distanceMeters < 12 ||
      c.habitatId !== habitatId ||
      !Array.isArray(c.gates) ||
      c.gates.length !== 2 ||
      !c.gates.every(marinePoint) ||
      dist(c.gates[0], c.gates[1], c.metersPerUnit) < 14 ||
      dist(c.gates[0], c.gates[1], c.metersPerUnit) > 16 ||
      dist(value.startPosition, c.gates[0], c.metersPerUnit) > 2 ||
      dist(value.endPosition, c.gates[1], c.metersPerUnit) > 2)
  )
    throw Error(
      'Cross both ends of the marked fifteen-metre transect; waiting is not a moving search.'
    );
  if (kind === 'habitat') {
    const band = study.depthBands[study.habitats.indexOf(habitatId)];
    if (
      !band ||
      value.contexts.some((c) => c.depthMeters < band[0] || c.depthMeters > band[1]) ||
      value.observations.some((o) => o.depthMeters < band[0] || o.depthMeters > band[1])
    )
      throw Error(
        'Keep the observation and animal records within this habitat’s declared game-depth band.'
      );
  }
  if (kind === 'follow') {
    const subject = value.observations.find((o) => o.individualId === c.individualId),
      path = value.trajectory;
    if (
      !subject ||
      subject.kind !== study.followKind ||
      !Array.isArray(path) ||
      path.length < 3 ||
      path.length > 4 ||
      path.some(
        (p, i) =>
          !marinePoint(p.position) ||
          p.individualId !== subject.individualId ||
          !Number.isFinite(p.at) ||
          p.at < value.startedAt ||
          p.at > value.completedAt ||
          !Number.isFinite(p.distanceMeters) ||
          p.distanceMeters < subject.minimumDistanceMeters ||
          p.distanceMeters > 160 ||
          (i > 0 && p.at <= path[i - 1].at)
      ) ||
      path
        .slice(1)
        .reduce((sum, p, i) => sum + dist(p.position, path[i].position, c.metersPerUnit), 0) < 1
    )
      throw Error('Follow the same visible individual through an actual movement sequence.');
  }
  return copy(value);
}
export function marineBehaviorOptions(window) {
  const rows = window?.trajectory || [],
    u = window?.config?.metersPerUnit || 1;
  if (rows.length < 3) return [];
  const result = ['swam-through-view'];
  if (
    Math.max(...rows.map((p) => p.position.y)) - Math.min(...rows.map((p) => p.position.y)) >
    0.6 / u
  )
    result.push('changed-depth');
  for (let i = 2; i < rows.length; i++) {
    const a = rows[i - 2].position,
      b = rows[i - 1].position,
      c = rows[i].position,
      one = Math.atan2(b.x - a.x, b.z - a.z),
      two = Math.atan2(c.x - b.x, c.z - b.z);
    if (Math.abs(Math.atan2(Math.sin(two - one), Math.cos(two - one))) > 0.35) {
      result.push('changed-direction');
      break;
    }
  }
  return result;
}
export function marineHabitatComparison(active) {
  const rows = active.habitats.map((w) => ({
    id: w.config.habitatId,
    method: w.config.method,
    seconds: w.activeSeconds,
    individuals: w.observations.length,
    taxa: [...new Set(w.observations.map((o) => o.speciesId))].sort(),
    depthMeters: w.contexts.reduce((n, c) => n + c.depthMeters, 0) / w.contexts.length,
    lightRelative: w.contexts.reduce((n, c) => n + c.light.relative, 0) / w.contexts.length,
  }));
  if (rows.length !== 2) throw Error('Finish both matched habitat observations.');
  const result =
    !rows[0].individuals && !rows[1].individuals
      ? 'neither-watch-detected-animals'
      : JSON.stringify(rows[0].taxa) !== JSON.stringify(rows[1].taxa)
        ? 'different-observed-taxa'
        : rows[0].individuals !== rows[1].individuals
          ? 'different-individual-detections'
          : 'similar-observed-records';
  return {
    rows,
    result,
    comparableMethod: rows[0].method === rows[1].method,
    current: 'unavailable',
    populationEstimate: false,
  };
}
export function transitionMarineBiologyCareer(value, command, now = Date.now()) {
  const state = normalizeMarineBiologyCareer(value);
  if (state.schemaVersion !== 1)
    throw Error('This saved marine study needs a newer version of World Explorer.');
  if (command?.revision !== state.revision)
    throw Error('This marine study changed in another tab. Reopen it before continuing.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The observation clock is unavailable.');
  let active = state.active ? copy(state.active) : null,
    visit = false;
  const completed = { ...state.completed },
    records = { ...state.records };
  if (command.type === 'accept') {
    const variantId = command.variantId || 'campaign',
      study = MARINE_BIOLOGY_STUDIES[variantId];
    if (!study || (variantId !== 'campaign' && !completed.campaign))
      throw Error('Complete Life Along the Slope before choosing another study.');
    if (active && active.phase !== 'complete') {
      if (active.variantId !== variantId) throw Error('Continue the current marine study first.');
      return { state, event: null, samples: [] };
    }
    if (records[variantId]) {
      active = copy(records[variantId]);
      requireMarinePresence(active, command.evidence, now, {
        underwater: command.evidence?.environment === 'OCEAN',
      });
      visit = true;
    } else {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || ''))
        throw Error('The observation study could not start.');
      const voyage = requireMarineVoyage(command.evidence?.voyage);
      if (fieldDistance(voyage.site, study.site) > 1800)
        throw Error('Use this study’s admitted virtual habitat site.');
      active = {
        runId: command.runId,
        variantId,
        phase: 'surface',
        acceptedAt: now,
        voyage,
        surface: null,
        habitats: [],
        follow: null,
        behavior: null,
        comparison: null,
        report: null,
        completedAt: 0,
      };
      requireMarinePresence(active, command.evidence, now, {
        underwater: command.evidence?.environment === 'OCEAN',
      });
      if (
        voyage.depthProfile?.model !== 'geographic-metres-v1' ||
        voyage.depthProfile.entryDepthMeters < 91 ||
        voyage.depthProfile.entryDepthMeters > 1980
      )
        throw Error(
          'Use the admitted offshore observation site with a modeled bottom depth of 91–1,980 m.'
        );
    }
  } else {
    if (!active || active.phase === 'complete')
      throw Error('Begin an unfinished marine study first.');
    const study = MARINE_BIOLOGY_STUDIES[active.variantId];
    if (['surface-watch', 'habitat-watch', 'follow'].includes(command.type)) {
      active.voyage = requireMarinePresence(active, command.evidence, now, { underwater: true });
      const kind =
          command.type === 'surface-watch'
            ? 'surface'
            : command.type === 'habitat-watch'
              ? 'habitat'
              : 'follow',
        habitat = study.habitats[active.habitats.length];
      if (active.phase !== kind) throw Error('Complete the current observation step first.');
      const window = windowValue(active, command.window, kind, now, habitat);
      if (
        command.confidence !==
        (window.observations.length ? 'virtual-label-supported' : 'not-observed')
      )
        throw Error('Distinguish a virtual animal record from non-detection.');
      if (kind === 'surface') {
        active.surface = window;
        active.phase = 'habitat';
      } else if (kind === 'habitat') {
        if (window.config.habitatId !== habitat)
          throw Error('Use the next matched habitat station.');
        if (
          active.habitats.length &&
          fieldDistance(
            active.habitats[0].contexts[0].habitat.coordinate,
            window.contexts[0].habitat.coordinate
          ) < 5
        )
          throw Error('Observe a second physical habitat patch, not the same renamed viewpoint.');
        active.habitats.push(window);
        if (active.habitats.length === 2) active.phase = 'follow';
      } else {
        if (
          !marineBehaviorOptions(window).includes(command.behavior) ||
          command.interpretation !== 'observed-motion-not-feeding-or-intent'
        )
          throw Error(
            'Describe visible movement without inventing feeding, intention or population size.'
          );
        active.follow = window;
        active.behavior = command.behavior;
        active.phase = 'comparison';
      }
    } else if (command.type === 'compare' && active.phase === 'comparison') {
      active.voyage = requireMarinePresence(active, command.evidence, now, { station: 'lab' });
      const comparison = marineHabitatComparison(active);
      if (
        command.result !== comparison.result ||
        command.limitation !== 'individual-records-not-population-or-cause' ||
        command.currentLimit !== 'no-local-current-measurement'
      )
        throw Error(
          'Compare the recorded observations and retain the missing-current and population limits.'
        );
      active.comparison = comparison;
      active.phase = 'report';
    } else if (command.type === 'report' && active.phase === 'report') {
      active.voyage = requireMarinePresence(active, command.evidence, now, { station: 'lab' });
      const followUp = study.habitats.includes(command.followUp) ? command.followUp : null;
      if (!followUp || command.followUpMethod !== 'repeat-matched-effort-other-time')
        throw Error('Choose a recorded habitat for another matched observation period.');
      active.report = {
        schemaVersion: 1,
        title: study.label,
        truthType: 'virtual-marine-observations',
        surface: active.surface,
        habitats: active.habitats,
        follow: active.follow,
        behavior: active.behavior,
        comparison: active.comparison,
        followUp,
        followUpMethod: command.followUpMethod,
        voyageId: active.voyage.id,
        shipId: active.voyage.ship.transportEntityId,
        livePresenceClaim: false,
        populationEstimate: false,
        at: now,
      };
      active.phase = 'complete';
      active.completedAt = now;
      completed[active.variantId] = eventId(active.runId, state.revision + 1);
      records[active.variantId] = copy(active);
    } else throw Error('That action does not match the current marine observation step.');
  }
  const revision = state.revision + 1,
    finished = command.type === 'report' && active.phase === 'complete',
    study = MARINE_BIOLOGY_STUDIES[active.variantId],
    event = {
      eventId: eventId(active.runId, revision),
      eventType: finished ? 'campaign-completed' : 'campaign-progress',
      sourceSystem: 'research-careers',
      sourceId: `marine-biology:${active.variantId}:${visit ? 'review' : command.type}`,
      activityId: 'marine-wildlife-watch-v1',
      family: 'marine-life',
      pathId: 'field',
      name: `${study.label} · ${finished ? 'habitat plate' : visit ? 'saved study reviewed' : 'observation record'}`,
      detail:
        'Virtual animal and habitat observations with bounded effort. Individual records are not a population estimate or proof of real wildlife.',
      occurredAt: now,
      environment: command.evidence?.environment || 'EARTH',
      regionId:
        active.variantId === 'open-water'
          ? 'offshore-california-virtual-study'
          : 'coral-shelf-authored-study',
      regionLabel: study.site.name,
      locationSnapshot: { ...study.site },
      localPosition: copy(command.evidence?.localPosition || { x: 0, y: 0, z: 0 }),
      progress: { points: 0, reason: 'marine-biology-study' },
      firstCompletion: finished && !state.completed[active.variantId],
      projections: {
        journal: !visit && command.type !== 'accept',
        profile: !visit && command.type !== 'accept',
        place: false,
      },
      metadata: {
        careerId: 'marine-biology',
        runId: active.runId,
        variantId: active.variantId,
        phase: active.phase,
        truthType: 'virtual-marine-observations',
        action: copy(command),
        sourceRefs: copy(MARINE_BIOLOGY_SOURCES),
        ...(finished ? { marineBiologyReport: active.report } : {}),
      },
    };
  return { state: { ...state, revision, active, completed, records }, event, samples: [] };
}
export function validateMarineBiologyCareerBackup(value, events, items) {
  validateFieldHistory(
    'marine-biology',
    value,
    events,
    items,
    transitionMarineBiologyCareer,
    normalizeMarineBiologyCareer
  );
}
export function marineBiologyCareerBadge(value) {
  const s = normalizeMarineBiologyCareer(value);
  return s.schemaVersion === 1 && s.completed.campaign
    ? {
        id: 'marine-observer',
        label: 'Marine Observer',
        detail:
          'Compared two habitats with bounded effort and recorded an individual’s visible behavior.',
      }
    : null;
}
export function marineBiologyCareerSummary(value, { variantId = 'campaign' } = {}) {
  const s = normalizeMarineBiologyCareer(value),
    study = MARINE_BIOLOGY_STUDIES[variantId] || MARINE_BIOLOGY_STUDIES.campaign;
  if (s.schemaVersion !== 1)
    return {
      title: study.label,
      summary: 'This saved marine study needs a newer version.',
      choices: [],
      stages: [],
    };
  const a = s.active?.variantId === variantId ? s.active : s.records[variantId],
    index =
      { surface: 0, habitat: 1, follow: 2, comparison: 3, report: 4, complete: 5 }[a?.phase] || 0;
  return {
    title: study.label,
    summary: study.question,
    resume: !!a && a.phase !== 'complete',
    ...(s.records[variantId] ? { actionLabel: 'Review saved habitat plate' } : {}),
    choices: Object.entries(MARINE_BIOLOGY_STUDIES)
      .filter(([id]) =>
        s.active && s.active.phase !== 'complete'
          ? id === s.active.variantId
          : id === 'campaign' || s.completed.campaign
      )
      .map(([id, row]) => ({ id, label: row.label })),
    stages: [
      'Conduct a bounded surface watch',
      'Observe two habitat patches with matched effort',
      'Follow one individual’s visible movement',
      'Compare records with depth, light and current limits',
      'Save a habitat plate and choose a follow-up station',
    ].map((label, i) => ({ label, complete: index > i })),
  };
}
