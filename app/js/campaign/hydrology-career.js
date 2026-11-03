import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  validateFieldSite,
  requireFieldPresence,
  validateFieldHistory,
  canonicalFieldRecord,
} from './field-study-contract.js';
import { HYDROLOGY_REFERENCE } from './hydrology-reference.js';
export const HYDROLOGY_OFFSETS = Object.freeze({
  a: { x: -5, z: 0 },
  b: { x: 5, z: 0 },
  bench: { x: 0, z: 8 },
});
export const HYDROLOGY_PROTOCOL = 'three-lane-metre-gates-nine-optical-paths-v1';
export const HYDROLOGY_STUDIES = Object.freeze({
  campaign: {
    label: 'Following the Water',
    question: 'How do flow and a clarity proxy change along a declared virtual stream?',
    condition: 'higher-flow-return',
    before: { speeds: [0.16, 0.2, 0.18], blocked: [2, 4] },
    after: { speeds: [0.3, 0.36, 0.33], blocked: [5, 8] },
    catchment: ['wooded-margin', 'mixed-paved-margin'],
  },
  'dry-return': {
    label: 'A Lower-Flow Return',
    question: 'Does a lower flow reading establish why the water changed?',
    condition: 'lower-flow-return',
    before: { speeds: [0.24, 0.28, 0.26], blocked: [3, 5] },
    after: { speeds: [0.11, 0.15, 0.13], blocked: [1, 2] },
    catchment: ['grass-margin', 'mixed-paved-margin'],
  },
  'clear-water-rise': {
    label: 'Flow Without a Cloudier Sample',
    question: 'Does higher flow always mean a cloudier sample?',
    condition: 'clearer-higher-flow-return',
    before: { speeds: [0.16, 0.2, 0.18], blocked: [1, 1] },
    after: { speeds: [0.3, 0.36, 0.33], blocked: [1, 1] },
    catchment: ['wooded-margin', 'grass-margin'],
  },
});
export function normalizeHydrologyCareer(value) {
  const s = normalizeFieldStudy(value);
  return s.schemaVersion === 1 ? { records: {}, archives: [], ...s } : s;
}
export function hydrologyTarget(a) {
  return a.phase === 'trace'
    ? 'a'
    : ['measure', 'revisit'].includes(a.phase)
      ? ['a', 'b'][a.readingIndex]
      : 'bench';
}
const point = (p) => p && ['x', 'y', 'z'].every((k) => Number.isFinite(p[k]));
const metres = (a, b, u) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * u;
function readingValue(active, value, stationId, now) {
  const v = copy(value || {}),
    phase = active.phase === 'revisit' ? 'return' : 'baseline';
  if (
    v.protocol !== HYDROLOGY_PROTOCOL ||
    v.truthType !== 'virtual-stream-instruments' ||
    v.runId !== active.runId ||
    v.siteId !== active.site.id ||
    v.stationId !== stationId ||
    v.visit !== phase ||
    v.condition !==
      (phase === 'baseline' ? 'baseline' : HYDROLOGY_STUDIES[active.variantId].condition) ||
    !Number.isFinite(v.startedAt) ||
    v.startedAt <= 0 ||
    !Number.isFinite(v.completedAt) ||
    v.completedAt > now ||
    v.completedAt <= v.startedAt ||
    !Number.isFinite(v.activeSeconds) ||
    v.activeSeconds < 8 ||
    v.activeSeconds > 60 ||
    v.activeSeconds > (v.completedAt - v.startedAt) / 1000 + 0.25 ||
    !Number.isFinite(v.excludedSeconds) ||
    v.excludedSeconds < 0 ||
    !Number.isFinite(v.metersPerUnit) ||
    v.metersPerUnit <= 0 ||
    v.metersPerUnit !== active.trace.metersPerUnit ||
    !v.section ||
    !['left', 'right', 'surface', 'bed'].every((k) => point(v.section[k])) ||
    Math.abs(metres(v.section.left, v.section.right, v.metersPerUnit) - v.widthMeters) > 0.005 ||
    Math.abs((v.section.surface.y - v.section.bed.y) * v.metersPerUnit - v.depthMeters) > 0.005 ||
    !Number.isFinite(v.widthMeters) ||
    v.widthMeters < 0.1 ||
    v.widthMeters > 3 ||
    !Number.isFinite(v.depthMeters) ||
    v.depthMeters < 0.05 ||
    v.depthMeters > 1 ||
    !Array.isArray(v.lanes) ||
    v.lanes.length !== 3 ||
    !Array.isArray(v.optical) ||
    v.optical.length !== 3
  )
    throw Error('Finish the matched flow and nine-path clarity protocol at this bank station.');
  for (const [i, lane] of v.lanes.entries()) {
    if (
      lane.index !== i ||
      !point(lane.startPosition) ||
      !point(lane.endPosition) ||
      !Number.isFinite(lane.startedAt) ||
      !Number.isFinite(lane.finishedAt) ||
      lane.startedAt < 0 ||
      lane.finishedAt <= lane.startedAt ||
      lane.finishedAt > v.activeSeconds + 0.1 ||
      Math.abs(metres(lane.startPosition, lane.endPosition, v.metersPerUnit) - 1) > 0.02 ||
      lane.finishedAt - lane.startedAt < 0.5 ||
      lane.finishedAt - lane.startedAt > 40
    )
      throw Error('Record three actual one-metre float transits with their times.');
  }
  for (const sample of v.optical) {
    if (
      !Number.isFinite(sample.activeSeconds) ||
      sample.activeSeconds < 0 ||
      sample.activeSeconds > v.activeSeconds ||
      !Array.isArray(sample.paths) ||
      sample.paths.length !== 9 ||
      sample.paths.some(
        (p, i) =>
          p.index !== i ||
          !point(p.from) ||
          !point(p.to) ||
          metres(p.from, p.to, v.metersPerUnit) < 0.1 ||
          metres(p.from, p.to, v.metersPerUnit) > 0.5 ||
          typeof p.blocked !== 'boolean' ||
          (p.blocked &&
            (!Number.isFinite(p.hitMeters) ||
              p.hitMeters < 0 ||
              p.hitMeters > metres(p.from, p.to, v.metersPerUnit)))
      )
    )
      throw Error('Retain all nine actual optical paths in each clarity reading.');
  }
  if (v.optical[2].activeSeconds - v.optical[0].activeSeconds < 5)
    throw Error('Space the three optical readings across the measured effort.');
  return v;
}
export function hydrologyReading(value) {
  const speeds = value.lanes.map((l) => 1 / (l.finishedAt - l.startedAt)),
    velocity = speeds.reduce((a, b) => a + b, 0) / 3,
    area = value.widthMeters * value.depthMeters,
    flow = area * velocity,
    obstruction =
      value.optical.reduce(
        (sum, s) => sum + (s.paths.filter((p) => p.blocked).length / 9) * 100,
        0
      ) / value.optical.length;
  return {
    velocity,
    area,
    flow,
    flowUncertainty: flow * 0.08 + 0.001,
    obstruction,
    obstructionUncertainty: 100 / 9,
  };
}
export function hydrologyComparison(active) {
  return ['a', 'b'].map((id) => {
    const before = hydrologyReading(active.readings.baseline[id]),
      after = hydrologyReading(active.readings.return[id]);
    return {
      id,
      before,
      after,
      flowChange: after.flow - before.flow,
      flowResult:
        after.flow - after.flowUncertainty > before.flow + before.flowUncertainty
          ? 'increased'
          : after.flow + after.flowUncertainty < before.flow - before.flowUncertainty
            ? 'decreased'
            : 'overlap',
      obstructionChange: after.obstruction - before.obstruction,
      obstructionResult:
        after.obstruction - after.obstructionUncertainty >
        before.obstruction + before.obstructionUncertainty
          ? 'higher'
          : after.obstruction + after.obstructionUncertainty <
              before.obstruction - before.obstructionUncertainty
            ? 'lower'
            : 'unresolved',
    };
  });
}
export function hydrologyFlowConclusion(active) {
  const rows = hydrologyComparison(active);
  return rows.every((r) => r.flowResult === 'increased')
    ? 'increased-at-both-stations'
    : rows.every((r) => r.flowResult === 'decreased')
      ? 'decreased-at-both-stations'
      : 'mixed-or-overlapping-flow';
}
export function transitionHydrologyCareer(value, command, now = Date.now()) {
  const state = normalizeHydrologyCareer(value);
  if (state.schemaVersion !== 1)
    throw Error('This saved water study needs a newer World Explorer version.');
  if (command?.revision !== state.revision)
    throw Error('This water study changed in another tab. Reopen it.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The field clock is unavailable.');
  let a = state.active ? copy(state.active) : null,
    visit = false;
  const completed = { ...state.completed },
    records = { ...state.records },
    archives = copy(state.archives);
  if (['accept', 'relocate'].includes(command.type)) {
    const variantId = command.type === 'relocate' ? a?.variantId : command.variantId || 'campaign',
      study = HYDROLOGY_STUDIES[variantId];
    if (!study || (variantId !== 'campaign' && !completed.campaign))
      throw Error('Complete Following the Water before another study.');
    const site = validateFieldSite(command.site, HYDROLOGY_OFFSETS);
    if (command.type === 'accept' && a && a.phase !== 'complete') {
      if (a.variantId !== variantId || a.site.id !== site.id)
        throw Error('Continue this water study at its saved stations, or move the blocked course.');
      return { state, event: null, samples: [] };
    }
    if (command.type === 'relocate') {
      if (!a || a.phase === 'complete') throw Error('Only an unfinished water course can move.');
      archives.push({ ...copy(a), archivedAt: now, reason: 'site-relocated' });
    }
    if (command.type === 'accept' && records[variantId]) {
      a = copy(records[variantId]);
      if (a.site.id !== site.id) throw Error('Reopen the original marked stream stations.');
      visit = true;
    } else {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || ''))
        throw Error('The water study could not start.');
      a = {
        runId: command.runId,
        variantId,
        site,
        phase: 'trace',
        acceptedAt: now,
        readingIndex: 0,
        readings: { baseline: {}, return: {} },
        trace: null,
        context: null,
        declaredCondition: null,
        report: null,
        completedAt: 0,
      };
    }
  } else {
    if (!a || a.phase === 'complete') throw Error('Begin an unfinished water study.');
    const study = HYDROLOGY_STUDIES[a.variantId],
      target = hydrologyTarget(a);
    requireFieldPresence(a, target, command.evidence, now);
    if (command.type === 'trace' && a.phase === 'trace') {
      const t = command.trace;
      if (
        t?.truthType !== 'visible-virtual-stream' ||
        t.runId !== a.runId ||
        t.siteId !== a.site.id ||
        t.clearView !== true ||
        !point(t.from) ||
        !point(t.to) ||
        !Number.isFinite(t.metersPerUnit) ||
        t.metersPerUnit <= 0 ||
        metres(t.from, t.to, t.metersPerUnit) < 0.15 ||
        !Number.isFinite(t.activeSeconds) ||
        t.activeSeconds < 2 ||
        t.activeSeconds > 30 ||
        !Number.isFinite(t.startedAt) ||
        !Number.isFinite(t.completedAt) ||
        t.startedAt <= 0 ||
        t.completedAt <= t.startedAt ||
        t.activeSeconds > (t.completedAt - t.startedAt) / 1000 + 0.25 ||
        !Number.isFinite(t.at) ||
        t.at > now ||
        now - t.at > 120000 ||
        command.flowDirection !== 'upstream-to-downstream' ||
        command.stations !== 'dry-bank-a-and-b'
      )
        throw Error('Trace actual visible float movement and choose both dry bank stations.');
      a.trace = copy(t);
      a.phase = 'measure';
    } else if (command.type === 'measure' && ['measure', 'revisit'].includes(a.phase)) {
      const id = ['a', 'b'][a.readingIndex];
      if (
        command.flowUnit !== 'm3/s' ||
        command.clarityMeaning !== 'virtual-obstruction-not-calibrated-ntu'
      )
        throw Error('Keep volume flow units and the limits of the virtual clarity instrument.');
      a.readings[a.phase === 'measure' ? 'baseline' : 'return'][id] = readingValue(
        a,
        command.reading,
        id,
        now
      );
      a.readingIndex++;
      if (a.readingIndex === 2) {
        a.readingIndex = 0;
        a.phase = a.phase === 'measure' ? 'context' : 'report';
      }
    } else if (command.type === 'context' && a.phase === 'context') {
      if (
        command.catchment !== 'authored-margins-not-a-source-test' ||
        command.reference?.id !== HYDROLOGY_REFERENCE.id ||
        canonicalFieldRecord(command.reference) !== canonicalFieldRecord(HYDROLOGY_REFERENCE) ||
        command.publicLimit !== 'different-river-and-dates'
      )
        throw Error(
          'Retain the authored catchment and the archived gauge’s different river/dates.'
        );
      a.context = {
        catchment: copy(study.catchment),
        reference: copy(command.reference),
        limit: command.publicLimit,
      };
      a.phase = 'declare';
    } else if (command.type === 'declare' && a.phase === 'declare') {
      if (command.condition !== study.condition || command.truthType !== 'declared-virtual-return')
        throw Error(
          'Declare this changed training condition before returning to the same two stations.'
        );
      a.declaredCondition = { id: study.condition, truthType: command.truthType, at: now };
      a.phase = 'revisit';
    } else if (command.type === 'report' && a.phase === 'report') {
      if (
        command.flowResult !== hydrologyFlowConclusion(a) ||
        command.cause !== 'change-observed-source-unestablished' ||
        command.followUp !== 'repeat-matched-stations-and-source-measurements'
      )
        throw Error(
          'Use both paired measurements, keep unresolved sources and choose a matched follow-up.'
        );
      a.report = {
        schemaVersion: 1,
        title: study.label,
        truthType: 'virtual-stream-study',
        site: copy(a.site),
        trace: copy(a.trace),
        readings: copy(a.readings),
        context: copy(a.context),
        condition: copy(a.declaredCondition),
        comparison: hydrologyComparison(a),
        flowResult: command.flowResult,
        cause: command.cause,
        followUp: command.followUp,
        at: now,
      };
      a.phase = 'complete';
      a.completedAt = now;
    } else throw Error('Choose an action for the current water-study step.');
  }
  const revision = state.revision + 1,
    eventId = `event:research:hydrology:${a.runId}:${revision}`,
    finished = command.type === 'report' && a.phase === 'complete';
  if (finished) {
    completed[a.variantId] = eventId;
    records[a.variantId] = copy(a);
  }
  const next = { ...state, revision, completed, records, archives, active: a },
    study = HYDROLOGY_STUDIES[a.variantId];
  return {
    state: next,
    event: {
      eventId,
      eventType: finished ? 'campaign-completed' : 'campaign-progress',
      activityId: 'survey',
      family: 'water-survey',
      sourceSystem: 'research-careers',
      sourceId: `hydrology:${a.variantId}:${visit ? 'review' : command.type}:${command.reading?.visit || ''}:${command.reading?.stationId || ''}`,
      pathId: 'field',
      name: finished ? study.label + ' · watershed plate' : study.label + ' · water record',
      detail:
        'Matched virtual flow and clarity measurements. Archived river data and declared training conditions remain separate; changes do not identify a source.',
      occurredAt: now,
      environment: 'EARTH',
      regionId: a.site.id,
      regionLabel: a.site.name,
      locationSnapshot: { ...a.site.location, name: a.site.name },
      localPosition: copy(command.evidence?.localPosition || { x: 0, y: 0, z: 0 }),
      progress: { points: 0, reason: 'hydrology-study' },
      firstCompletion: finished && !state.completed[a.variantId],
      projections: {
        journal: !visit && command.type !== 'accept',
        profile: !visit && command.type !== 'accept',
        place: false,
      },
      metadata: {
        careerId: 'hydrology',
        runId: a.runId,
        variantId: a.variantId,
        phase: a.phase,
        truthType: 'virtual-stream-study',
        action: copy(command),
        ...(finished ? { hydrologyReport: copy(a.report) } : {}),
      },
    },
    samples: [],
  };
}
export function validateHydrologyCareerBackup(value, events, items) {
  validateFieldHistory(
    'hydrology',
    value,
    events,
    items,
    transitionHydrologyCareer,
    normalizeHydrologyCareer
  );
}
export function hydrologyCareerBadge(value) {
  const s = normalizeHydrologyCareer(value);
  return s.schemaVersion === 1 && s.completed.campaign
    ? {
        id: 'water-watch',
        label: 'Water Watch',
        detail:
          'Measured matched virtual stream stations, revisited them and retained public-data and causal limits.',
      }
    : null;
}
export function hydrologyCareerSummary(value, { variantId = 'campaign' } = {}) {
  const s = normalizeHydrologyCareer(value),
    study = HYDROLOGY_STUDIES[variantId] || HYDROLOGY_STUDIES.campaign,
    a = s.active?.variantId === variantId ? s.active : null,
    index = ['trace', 'measure', 'context', 'declare', 'revisit', 'report', 'complete'].indexOf(
      a?.phase
    );
  if (s.schemaVersion !== 1)
    return {
      title: 'Water study',
      summary: 'This save needs a newer World Explorer version.',
      choices: [],
      stages: [],
    };
  return {
    title: study.label,
    summary: study.question,
    resume: !!a && a.phase !== 'complete',
    ...(s.records[variantId] ? { actionLabel: 'Visit marked stream stations' } : {}),
    choices: Object.entries(HYDROLOGY_STUDIES)
      .filter(([id]) =>
        s.active && s.active.phase !== 'complete'
          ? id === s.active.variantId
          : id === 'campaign' || s.completed.campaign
      )
      .map(([id, row]) => ({ id, label: row.label })),
    stages: [
      'Trace the visible reach and choose dry bank stations',
      'Measure the same flow and clarity protocol twice',
      'Compare catchment and dated public context',
      'Revisit both stations under a declared virtual condition',
      'Save supported change and its unresolved cause',
    ].map((label, i) => ({ label, complete: index > [0, 1, 2, 4, 5][i] })),
  };
}
