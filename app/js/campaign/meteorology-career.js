import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  validateFieldSite,
  requireFieldPresence,
  validateFieldHistory,
} from './field-study-contract.js';
import { validateMeteorologySource } from './meteorology-source.js';
export const METEOROLOGY_PROTOCOL = 'virtual-cup-vane-sky-grid-v1';
// An authored training calibration, not a real cup-anemometer transfer function.
export const METEOROLOGY_CALIBRATION = 12;
export const METEOROLOGY_OFFSETS = Object.freeze({
  a: { x: -6, z: 0 },
  b: { x: 6, z: 0 },
  bench: { x: 0, z: 8 },
});
export const METEOROLOGY_STUDIES = Object.freeze({
  campaign: {
    label: 'Reading the Sky',
    question: 'Can a forecast be tested without confusing a model with an observation?',
    referenceTime: Date.parse('2026-06-01T12:00:00Z'),
    before: { speed: 4, from: 270, clouds: 3 },
    after: { speed: 4.4, from: 280, clouds: 4 },
  },
  freshening: {
    label: 'A Strengthening Breeze',
    question: 'What should the record retain when a bounded forecast misses?',
    referenceTime: Date.parse('2026-06-02T12:00:00Z'),
    before: { speed: 3, from: 260, clouds: 2 },
    after: { speed: 7, from: 250, clouds: 7 },
  },
  'turning-north': {
    label: 'Wind Across North',
    question: 'How do directions crossing north and sheltered stations affect a comparison?',
    referenceTime: Date.parse('2026-06-03T12:00:00Z'),
    before: { speed: 4, from: 350, clouds: 4 },
    after: { speed: 4, from: 10, clouds: 2 },
  },
});
export function normalizeMeteorologyCareer(value) {
  const s = normalizeFieldStudy(value);
  return s.schemaVersion === 1 ? { records: {}, archives: [], ...s } : s;
}
export function meteorologyTarget(a) {
  return a.phase === 'deploy'
    ? 'a'
    : a.phase === 'compare'
      ? 'b'
      : a.phase === 'verify'
        ? ['a', 'b'][a.readingIndex]
        : 'bench';
}
export const meteorologyDirectionDifference = (a, b) => ((a - b + 540) % 360) - 180;
const point = (p) => p && ['x', 'y', 'z'].every((k) => Number.isFinite(p[k]));
const direction = (s) =>
  ((((Math.atan2(s.vaneTip.x - s.vaneBase.x, -(s.vaneTip.z - s.vaneBase.z)) * 180) / Math.PI) %
    360) +
    360) %
  360;
export function meteorologyReading(raw) {
  const speeds = raw.samples
      .slice(1)
      .map(
        (s, i) =>
          (((s.rotorAngle - raw.samples[i].rotorAngle) /
            (s.activeSeconds - raw.samples[i].activeSeconds)) *
            METEOROLOGY_CALIBRATION) /
          (2 * Math.PI)
      ),
    bearings = raw.samples.map(direction),
    sx = bearings.reduce((n, b) => n + Math.sin((b * Math.PI) / 180), 0),
    sz = bearings.reduce((n, b) => n + Math.cos((b * Math.PI) / 180), 0);
  return {
    speed: speeds.reduce((n, v) => n + v, 0) / speeds.length,
    speedUncertainty: 0.3,
    fromDeg: ((Math.atan2(sx, sz) * 180) / Math.PI + 360) % 360,
    cloudPercent:
      raw.samples.reduce(
        (n, s) => n + (s.cloudPaths.filter((p) => p.covered).length / 9) * 100,
        0
      ) / raw.samples.length,
    clearWindPaths: raw.samples.at(-1).exposurePaths.filter((p) => !p.blocked).length,
    paths: 4,
    heightMeters: raw.heightMeters,
  };
}
export const meteorologyCloudCue = (value) =>
  value.cloudPercent >= 700 / 9 - 0.001
    ? 'overcast'
    : value.cloudPercent >= 300 / 9 - 0.001
      ? 'patchy'
      : 'mostly-clear';
function readingValue(a, value, id, now) {
  const v = copy(value || {}),
    visit = a.phase === 'verify' ? 'verification' : 'baseline',
    reference =
      METEOROLOGY_STUDIES[a.variantId].referenceTime + (visit === 'verification' ? 3600000 : 0);
  if (
    v.protocol !== METEOROLOGY_PROTOCOL ||
    v.truthType !== 'virtual-weather-instruments' ||
    v.runId !== a.runId ||
    v.siteId !== a.site.id ||
    v.stationId !== id ||
    v.visit !== visit ||
    v.referenceTime !== reference ||
    !Number.isFinite(v.startedAt) ||
    v.startedAt <= 0 ||
    !Number.isFinite(v.completedAt) ||
    v.completedAt <= v.startedAt ||
    v.completedAt > now ||
    now - v.completedAt > 120000 ||
    !Number.isFinite(v.activeSeconds) ||
    v.activeSeconds < 8 ||
    v.activeSeconds > 60 ||
    v.activeSeconds > (v.completedAt - v.startedAt) / 1000 + 0.25 ||
    !Number.isFinite(v.excludedSeconds) ||
    v.excludedSeconds < 0 ||
    !Number.isFinite(v.metersPerUnit) ||
    v.metersPerUnit <= 0 ||
    v.calibration !== METEOROLOGY_CALIBRATION ||
    !point(v.sensorPosition) ||
    !point(v.groundPosition) ||
    !Number.isFinite(v.heightMeters) ||
    v.heightMeters < 1.5 ||
    v.heightMeters > 2.5 ||
    Math.abs((v.sensorPosition.y - v.groundPosition.y) * v.metersPerUnit - v.heightMeters) > 0.01 ||
    !Array.isArray(v.samples) ||
    v.samples.length !== 3
  )
    throw Error(
      'Complete this station’s working sensor protocol at the declared replay reference time.'
    );
  for (const [i, s] of v.samples.entries()) {
    if (
      !Number.isFinite(s.activeSeconds) ||
      Math.abs(s.activeSeconds - [0, 4, 8][i]) > 0.26 ||
      s.activeSeconds > v.activeSeconds ||
      !Number.isFinite(s.rotorAngle) ||
      s.rotorAngle < 0 ||
      !point(s.vaneBase) ||
      !point(s.vaneTip) ||
      Math.hypot(s.vaneTip.x - s.vaneBase.x, s.vaneTip.z - s.vaneBase.z) * v.metersPerUnit < 0.1 ||
      !Array.isArray(s.cloudPaths) ||
      s.cloudPaths.length !== 9 ||
      !Array.isArray(s.exposurePaths) ||
      s.exposurePaths.length !== 4 ||
      s.cloudPaths.some(
        (p, j) => p.index !== j || !point(p.from) || !point(p.to) || typeof p.covered !== 'boolean'
      ) ||
      s.exposurePaths.some(
        (p, j) => p.index !== j || !point(p.from) || !point(p.to) || typeof p.blocked !== 'boolean'
      ) ||
      (i > 0 &&
        (s.activeSeconds <= v.samples[i - 1].activeSeconds ||
          s.rotorAngle < v.samples[i - 1].rotorAngle))
    )
      throw Error('Keep the actual rotor positions, vane geometry and sky/exposure ray samples.');
  }
  const r = meteorologyReading(v);
  if (!Number.isFinite(r.speed) || r.speed < 0.05 || r.speed > 25 || !Number.isFinite(r.fromDeg))
    throw Error('The virtual sensor calibration or direction is unavailable.');
  if (visit === 'verification' && (!a.forecast || v.startedAt < a.forecast.recordedAt))
    throw Error('Record the forecast before observing its comparison period.');
  return v;
}
export function meteorologyVerification(a) {
  const before = meteorologyReading(a.readings.baseline.a),
    observed = meteorologyReading(a.readings.verification.a),
    f = a.forecast,
    cloudChange = observed.cloudPercent - before.cloudPercent,
    cloudTrend =
      cloudChange > 100 / 9 + 0.01 ? 'more' : cloudChange < -(100 / 9 + 0.01) ? 'less' : 'similar';
  return {
    before,
    observed,
    forecast: copy(f),
    speedInRange: observed.speed >= f.speedLow && observed.speed <= f.speedHigh,
    directionInRange:
      Math.abs(meteorologyDirectionDifference(observed.fromDeg, f.directionFrom)) <=
      f.directionHalfwidth,
    speedError: observed.speed - (f.speedLow + f.speedHigh) / 2,
    directionError: meteorologyDirectionDifference(observed.fromDeg, f.directionFrom),
    cloudChange,
    cloudTrend,
    cloudTrendMatched: cloudTrend === f.cloudTrend,
  };
}
export function transitionMeteorologyCareer(value, command, now = Date.now()) {
  const state = normalizeMeteorologyCareer(value);
  if (state.schemaVersion !== 1)
    throw Error('This weather study needs a newer World Explorer version.');
  if (command?.revision !== state.revision)
    throw Error('This weather study changed in another tab. Reopen it.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The field clock is unavailable.');
  let a = state.active ? copy(state.active) : null,
    visit = false;
  const completed = { ...state.completed },
    records = { ...state.records },
    archives = copy(state.archives);
  if (['accept', 'relocate'].includes(command.type)) {
    const variantId = command.type === 'relocate' ? a?.variantId : command.variantId || 'campaign';
    if (!METEOROLOGY_STUDIES[variantId] || (variantId !== 'campaign' && !completed.campaign))
      throw Error('Finish Reading the Sky before another weather study.');
    const site = validateFieldSite(command.site, METEOROLOGY_OFFSETS);
    if (command.type === 'accept' && a && a.phase !== 'complete') {
      if (a.variantId !== variantId || a.site.id !== site.id)
        throw Error('Continue at the saved weather stations, or move the blocked course.');
      return { state, event: null, samples: [] };
    }
    if (command.type === 'relocate') {
      if (!a || a.phase === 'complete') throw Error('Only an unfinished weather course can move.');
      archives.push({ ...copy(a), archivedAt: now, reason: 'site-relocated' });
    }
    if (command.type === 'accept' && records[variantId]) {
      a = copy(records[variantId]);
      if (a.site.id !== site.id) throw Error('Reopen the original weather stations.');
      visit = true;
    } else {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || ''))
        throw Error('The weather study could not start.');
      a = {
        runId: command.runId,
        variantId,
        site,
        phase: 'source',
        acceptedAt: now,
        source: null,
        readings: { baseline: {}, verification: {} },
        forecast: null,
        readingIndex: 0,
        report: null,
        completedAt: 0,
      };
    }
  } else {
    if (!a || a.phase === 'complete') throw Error('Begin an unfinished weather study.');
    const id = meteorologyTarget(a);
    requireFieldPresence(a, id, command.evidence, now);
    if (command.type === 'source-check' && a.phase === 'source') {
      const source = validateMeteorologySource(command.source, now);
      if (
        command.classification !== source.classification ||
        command.ageBand !== source.ageBand ||
        command.plan !== 'explicit-simulated-replay'
      )
        throw Error('Identify this source and its age; keep the training replay separate.');
      a.source = source;
      a.phase = 'deploy';
    } else if (command.type === 'measure' && ['deploy', 'compare', 'verify'].includes(a.phase)) {
      const r = readingValue(a, command.reading, id, now),
        value = meteorologyReading(r);
      if (
        command.windMeaning !== 'from-true-north' ||
        command.speedUnit !== 'm/s' ||
        command.cloudCue !== meteorologyCloudCue(value)
      )
        throw Error('Use wind-from bearings, metres per second and the visible replay sky cue.');
      const phase = a.phase === 'verify' ? 'verification' : 'baseline';
      a.readings[phase][id] = r;
      if (a.phase === 'deploy') a.phase = 'compare';
      else if (a.phase === 'compare') a.phase = 'forecast';
      else if (a.readingIndex === 0) a.readingIndex = 1;
      else a.phase = 'report';
    } else if (command.type === 'forecast' && a.phase === 'forecast') {
      const f = command.forecast;
      if (
        !f ||
        !['speedLow', 'speedHigh', 'directionFrom', 'directionHalfwidth'].every((k) =>
          Number.isFinite(f[k])
        ) ||
        f.speedLow < 0 ||
        f.speedHigh > 25 ||
        f.speedHigh <= f.speedLow ||
        f.speedHigh - f.speedLow > 8 ||
        f.directionFrom < 0 ||
        f.directionFrom >= 360 ||
        f.directionHalfwidth < 5 ||
        f.directionHalfwidth > 90 ||
        !['more', 'less', 'similar'].includes(f.cloudTrend) ||
        f.truthType !== 'virtual-replay-forecast'
      )
        throw Error(
          'Choose a bounded speed interval, wind-from sector and cloud prediction for the replay.'
        );
      a.forecast = {
        truthType: f.truthType,
        speedLow: f.speedLow,
        speedHigh: f.speedHigh,
        directionFrom: f.directionFrom,
        directionHalfwidth: f.directionHalfwidth,
        cloudTrend: f.cloudTrend,
        recordedAt: now,
        issuedReferenceTime: METEOROLOGY_STUDIES[a.variantId].referenceTime,
        validReferenceTime: METEOROLOGY_STUDIES[a.variantId].referenceTime + 3600000,
      };
      a.phase = 'verify';
      a.readingIndex = 0;
    } else if (command.type === 'report' && a.phase === 'report') {
      const v = meteorologyVerification(a),
        outcome =
          v.speedInRange && v.directionInRange && v.cloudTrendMatched
            ? 'within-all-bounds'
            : 'one-or-more-missed';
      if (
        command.outcome !== outcome ||
        command.limit !== 'replay-not-public-forecast-validation' ||
        command.followUp !== 'repeat-matched-time-and-independent-observations'
      )
        throw Error(
          'Retain misses and the replay’s limits, then choose a matched independent follow-up.'
        );
      a.report = {
        schemaVersion: 1,
        truthType: 'virtual-weather-study',
        title: METEOROLOGY_STUDIES[a.variantId].label,
        site: copy(a.site),
        source: copy(a.source),
        readings: copy(a.readings),
        forecast: copy(a.forecast),
        verification: v,
        outcome,
        at: now,
      };
      a.phase = 'complete';
      a.completedAt = now;
    } else throw Error('Choose an action for the current weather-study step.');
  }
  const revision = state.revision + 1,
    eventId = 'event:research:meteorology:' + a.runId + ':' + revision,
    finished = command.type === 'report' && a.phase === 'complete';
  if (finished) {
    completed[a.variantId] = eventId;
    records[a.variantId] = copy(a);
  }
  return {
    state: { ...state, revision, completed, records, archives, active: a },
    event: {
      eventId,
      eventType: finished ? 'campaign-completed' : 'campaign-progress',
      activityId: 'survey',
      family: 'weather-study',
      sourceSystem: 'research-careers',
      sourceId:
        'meteorology:' +
        a.variantId +
        ':' +
        (visit ? 'review' : command.type) +
        ':' +
        (command.reading?.visit || '') +
        ':' +
        (command.reading?.stationId || ''),
      pathId: 'field',
      name:
        METEOROLOGY_STUDIES[a.variantId].label +
        (finished ? ' · forecast card' : ' · weather record'),
      detail:
        'A recorded forecast compared with matched virtual sensor readings. Public numerical forecasts, unavailable sources and replay observations remain distinct.',
      occurredAt: now,
      environment: 'EARTH',
      regionId: a.site.id,
      regionLabel: a.site.name,
      locationSnapshot: { ...a.site.location, name: a.site.name },
      localPosition: copy(command.evidence?.localPosition || { x: 0, y: 0, z: 0 }),
      progress: { points: 0, reason: 'meteorology-study' },
      firstCompletion: finished && !state.completed[a.variantId],
      projections: {
        journal: !visit && command.type !== 'accept',
        profile: !visit && command.type !== 'accept',
        place: false,
      },
      metadata: {
        careerId: 'meteorology',
        runId: a.runId,
        variantId: a.variantId,
        phase: a.phase,
        truthType: 'virtual-weather-study',
        action: copy(command),
        ...(finished ? { meteorologyReport: copy(a.report) } : {}),
      },
    },
    samples: [],
  };
}
export function validateMeteorologyCareerBackup(value, events, items) {
  validateFieldHistory(
    'meteorology',
    value,
    events,
    items,
    transitionMeteorologyCareer,
    normalizeMeteorologyCareer
  );
}
export function meteorologyCareerBadge(value) {
  const s = normalizeMeteorologyCareer(value);
  return s.schemaVersion === 1 && s.completed.campaign
    ? {
        id: 'weather-observer',
        label: 'Weather Observer',
        detail:
          'Identified weather provenance, deployed matched virtual sensors and retained an issued forecast and its verification.',
      }
    : null;
}
export function meteorologyCareerSummary(value, { variantId = 'campaign' } = {}) {
  const s = normalizeMeteorologyCareer(value),
    study = METEOROLOGY_STUDIES[variantId] || METEOROLOGY_STUDIES.campaign,
    a = s.active?.variantId === variantId ? s.active : null,
    index = ['source', 'deploy', 'compare', 'forecast', 'verify', 'report', 'complete'].indexOf(
      a?.phase
    );
  if (s.schemaVersion !== 1)
    return {
      title: 'Weather study',
      summary: 'This save needs a newer World Explorer version.',
      choices: [],
      stages: [],
    };
  return {
    title: study.label,
    summary: study.question,
    resume: !!a && a.phase !== 'complete',
    ...(s.records[variantId] ? { actionLabel: 'Visit marked weather stations' } : {}),
    choices: Object.entries(METEOROLOGY_STUDIES)
      .filter(([id]) =>
        s.active && s.active.phase !== 'complete'
          ? id === s.active.variantId
          : id === 'campaign' || s.completed.campaign
      )
      .map(([id, row]) => ({ id, label: row.label })),
    stages: [
      'Identify the existing weather source and age',
      'Deploy the working cup, vane and replay sky instrument',
      'Compare the same reference time at a second station',
      'Record a bounded forecast before the next replay period',
      'Verify at both stations and retain forecast errors',
    ].map((label, i) => ({ label, complete: index > [0, 1, 2, 3, 5][i] })),
  };
}
