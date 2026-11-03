import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  validateFieldSite,
  requireFieldPresence,
  validateFieldHistory,
  canonicalFieldRecord,
} from './field-study-contract.js';
import {
  ASTRONOMY_SOURCE,
  DETECTOR,
  chooseAstronomyTarget,
  astronomyAxis,
  astronomySeparation,
  syntheticDetectorFrame,
  decodeDetectorFrame,
  apertureMeasurement,
} from './astronomy-instrument.js';
export const ASTRONOMY_OFFSETS = Object.freeze({
  a: { x: -6, z: 0 },
  b: { x: 6, z: 0 },
  bench: { x: 0, z: 8 },
});
export const ASTRONOMY_STUDIES = Object.freeze({
  campaign: {
    label: 'A Night’s Observing',
    question: 'Does a catalog match survive a repeat exposure and a covered-detector control?',
  },
  'exposure-bracket': {
    label: 'When the Bright Image Clips',
    question: 'Which exposure can support a brightness comparison when pixels saturate?',
  },
  'detector-dither': {
    label: 'Which Light Moves?',
    question:
      'Does a bright point follow the sky when the telescope moves, or stay on the detector?',
  },
});
export function normalizeAstronomyCareer(value) {
  const s = normalizeFieldStudy(value);
  return s.schemaVersion === 1 ? { records: {}, archives: [], ...s } : s;
}
export function astronomyTarget(a) {
  return ['align', 'configure', 'primary'].includes(a.phase)
    ? 'a'
    : a.phase === 'controls'
      ? 'b'
      : 'bench';
}
export function astronomyFrameRole(a) {
  return a.phase === 'primary'
    ? 'primary'
    : a.phase === 'controls'
      ? a.frames.comparison
        ? 'dark'
        : 'comparison'
      : null;
}
export function astronomyDitherPointing(pointing) {
  // Four detector pixels east/west in the tangent plane, retaining elevation.
  const radians = (4 / (DETECTOR.size / 2)) * Math.tan((DETECTOR.fieldDegrees * Math.PI) / 360),
    offset =
      (radians * 180) / Math.PI / Math.max(0.15, Math.cos((pointing.altitude * Math.PI) / 180));
  return { azimuth: (pointing.azimuth + offset + 360) % 360, altitude: pointing.altitude };
}
export function astronomyExposurePlan(a, role = astronomyFrameRole(a)) {
  const first = a.frames.primary?.image.pointing || a.pointing,
    comparison =
      a.variantId === 'detector-dither' && first ? astronomyDitherPointing(first) : first;
  return {
    role,
    seconds:
      role === 'primary'
        ? a.exposureSeconds
        : a.variantId === 'exposure-bracket'
          ? 2
          : a.exposureSeconds,
    pointing: role === 'primary' ? a.pointing : comparison,
    shutter: role === 'dark' ? 'closed' : 'open',
    hotPixel: a.variantId === 'detector-dither',
  };
}
function physicalAxis(raw) {
  const axis = raw?.axis;
  if (
    !axis ||
    !['x', 'y', 'z'].every((k) => Number.isFinite(axis[k])) ||
    Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) > 1e-5
  )
    throw Error('Wait for the supported telescope’s actual optical axis.');
  return axis;
}
function exposureValue(a, input, role, now) {
  const raw = copy(input || {}),
    image = decodeDetectorFrame(raw.image),
    plan = astronomyExposurePlan(a, role),
    effort = raw.effort,
    axis = physicalAxis(raw);
  if (
    !image.pointing ||
    !plan.pointing ||
    ![
      image.pointing.azimuth,
      image.pointing.altitude,
      plan.pointing.azimuth,
      plan.pointing.altitude,
    ].every(Number.isFinite)
  )
    throw Error('Retain the telescope pointing with its detector image.');
  if (
    raw.instrumentId !== a.site.id ||
    raw.role !== role ||
    raw.opticalState !== (plan.shutter === 'closed' ? 'covered-reference' : 'open-and-clear') ||
    image.protocol !== 'catalog-synthetic-detector-v1' ||
    image.truthType !== 'synthetic-instrument-image' ||
    image.seconds !== plan.seconds ||
    image.shutter !== plan.shutter ||
    image.hotPixel !== plan.hotPixel ||
    astronomySeparation(axis, astronomyAxis(image.pointing.azimuth, image.pointing.altitude)) >
      0.001 ||
    astronomySeparation(axis, astronomyAxis(plan.pointing.azimuth, plan.pointing.altitude)) > 0.025
  )
    throw Error('Use the same telescope, planned pointing, exposure and shutter control.');
  if (
    !effort ||
    effort.runId !== a.runId ||
    effort.habitatId !== a.site.id + ':' + role ||
    effort.method !== 'astronomy-exposure' ||
    effort.complete !== true ||
    effort.interrupted ||
    effort.liveGps ||
    effort.supported !== true ||
    effort.sensor?.aligned !== true ||
    effort.targetSeconds !== plan.seconds ||
    !Number.isFinite(effort.activeSeconds) ||
    effort.activeSeconds < plan.seconds - 1e-6 ||
    effort.activeSeconds > plan.seconds + 0.251 ||
    !Number.isFinite(effort.observerDistanceMeters) ||
    effort.observerDistanceMeters > 0.8 ||
    !Number.isFinite(effort.startedAt) ||
    !Number.isFinite(effort.endedAt) ||
    effort.startedAt < a.configuredAt ||
    effort.endedAt > now ||
    effort.endedAt < effort.startedAt + plan.seconds * 1000 - 250
  )
    throw Error('Complete a supported, aligned exposure on the normal observation clock.');
  const previous =
    role === 'comparison' ? a.frames.primary : role === 'dark' ? a.frames.comparison : null;
  if (previous && effort.startedAt < previous.effort.endedAt)
    throw Error('Take the comparison and covered control after the preceding exposure.');
  const expected = syntheticDetectorFrame({
    target: a.target,
    location: a.site.location,
    referenceTime: a.referenceTime,
    pointing: image.pointing,
    seconds: plan.seconds,
    seed: image.seed,
    shutter: plan.shutter,
    hotPixel: plan.hotPixel,
  });
  // ECMAScript engines may differ in the last bits of trigonometric results.
  // Retain the original subpixel coordinate; pixels and every source setting
  // must still match exactly. The bound is a billionth of one detector pixel.
  const sameProjection = ['x', 'y'].every(
    (k) =>
      Number.isFinite(image.targetPixel?.[k]) &&
      Math.abs(expected.targetPixel[k] - image.targetPixel[k]) <= 1e-9
  );
  if (
    !sameProjection ||
    canonicalFieldRecord({
      ...expected,
      targetPixel: { x: image.targetPixel.x, y: image.targetPixel.y },
    }) !== canonicalFieldRecord(image)
  )
    throw Error('The saved pixels do not match their retained source, settings and noise seed.');
  apertureMeasurement(image);
  return raw;
}
export function astronomyAnalysis(a) {
  const images = Object.fromEntries(
      Object.entries(a.frames).map(([k, v]) => [k, decodeDetectorFrame(v.image)])
    ),
    measurements = Object.fromEntries(
      Object.entries(images).map(([k, v]) => [k, apertureMeasurement(v)])
    ),
    { primary, comparison } = measurements;
  const positionConsistent = ['primary', 'comparison'].every(
      (k) =>
        measurements[k].centroid &&
        Math.hypot(
          measurements[k].centroid.x - images[k].targetPixel.x,
          measurements[k].centroid.y - images[k].targetPixel.y
        ) <= 1.5
    ),
    rateDifference = comparison.rate - primary.rate,
    rateBound = 3 * Math.hypot(primary.uncertainty, comparison.uncertainty),
    matchedRates = !primary.clipped && !comparison.clipped && Math.abs(rateDifference) <= rateBound;
  const fixedIndex = 24 * 64 + 45,
    fixedDefect = Object.values(images).every((f) => f.pixels[fixedIndex] === 255),
    skyShift =
      primary.centroid && comparison.centroid
        ? Math.hypot(
            primary.centroid.x - comparison.centroid.x,
            primary.centroid.y - comparison.centroid.y
          )
        : 0;
  let outcome =
    positionConsistent && matchedRates
      ? 'catalog-match-repeat-consistent'
      : 'catalog-position-brightness-unresolved';
  if (a.variantId === 'exposure-bracket')
    outcome =
      primary.clipped && !comparison.clipped && positionConsistent
        ? 'saturated-first-use-shorter-frame'
        : !primary.clipped && !comparison.clipped && positionConsistent
          ? 'two-unclipped-frames'
          : 'no-supported-brightness-comparison';
  if (a.variantId === 'detector-dither')
    outcome =
      fixedDefect && skyShift >= 3 && positionConsistent
        ? 'fixed-detector-artifact-separated'
        : 'artifact-or-position-unresolved';
  return {
    measurements,
    positionConsistent,
    matchedRates,
    rateDifference,
    rateBound,
    fixedDefect,
    skyShift,
    outcome,
  };
}
export function transitionAstronomyCareer(value, command, now = Date.now()) {
  const state = normalizeAstronomyCareer(value);
  if (state.schemaVersion !== 1)
    throw Error('This observing log needs a newer World Explorer version.');
  if (command?.revision !== state.revision)
    throw Error('This observing log changed in another tab. Reopen it.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The observing clock is unavailable.');
  let a = state.active ? copy(state.active) : null,
    visit = false;
  const completed = { ...state.completed },
    records = { ...state.records },
    archives = copy(state.archives);
  if (['accept', 'relocate'].includes(command.type)) {
    const variantId = command.type === 'relocate' ? a?.variantId : command.variantId || 'campaign';
    if (
      !Object.hasOwn(ASTRONOMY_STUDIES, variantId) ||
      (variantId !== 'campaign' && !completed.campaign)
    )
      throw Error('Finish A Night’s Observing before another observing study.');
    const site = validateFieldSite(command.site, ASTRONOMY_OFFSETS);
    if (command.type === 'accept' && a && a.phase !== 'complete') {
      if (a.variantId !== variantId || a.site.id !== site.id)
        throw Error('Continue at the saved observatory or move the blocked course.');
      return { state, event: null, samples: [] };
    }
    if (command.type === 'relocate') {
      if (!a || a.phase === 'complete') throw Error('Only an unfinished observatory can move.');
      archives.push({ ...copy(a), archivedAt: now, reason: 'site-relocated' });
    }
    if (command.type === 'accept' && records[variantId]) {
      a = copy(records[variantId]);
      if (a.site.id !== site.id) throw Error('Reopen the original observatory.');
      visit = true;
    } else {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || ''))
        throw Error('The observing study could not start.');
      const selected = chooseAstronomyTarget(site.location, now);
      a = {
        runId: command.runId,
        variantId,
        site,
        phase: 'align',
        acceptedAt: now,
        referenceTime: now,
        target: selected.star,
        catalogDirection: selected.direction,
        source: copy(ASTRONOMY_SOURCE),
        pointing: null,
        alignment: null,
        exposureSeconds: null,
        configuredAt: 0,
        frames: {},
        analysis: null,
        report: null,
        completedAt: 0,
      };
    }
  } else {
    if (!a || a.phase === 'complete') throw Error('Begin an unfinished observing study.');
    requireFieldPresence(a, astronomyTarget(a), command.evidence, now);
    if (command.type === 'align' && a.phase === 'align') {
      const v = copy(command.alignment || {}),
        axis = physicalAxis(v);
      if (
        v.instrumentId !== a.site.id ||
        v.clear !== true ||
        astronomySeparation(axis, a.catalogDirection) > 0.15 ||
        astronomySeparation(axis, astronomyAxis(v.azimuth, v.altitude)) > 0.001
      )
        throw Error('Align the actual telescope on the catalog target with a clear optical path.');
      a.alignment = { ...v, at: now };
      a.pointing = { azimuth: v.azimuth, altitude: v.altitude };
      a.phase = 'configure';
    } else if (command.type === 'configure' && a.phase === 'configure') {
      const seconds = Number(command.seconds);
      if (a.variantId === 'exposure-bracket' ? seconds !== 8 : ![1, 2].includes(seconds))
        throw Error(
          a.variantId === 'exposure-bracket'
            ? 'Use the specified eight-second clipping trial, then compare a shorter exposure.'
            : 'Choose a one- or two-second matched exposure.'
        );
      a.exposureSeconds = seconds;
      a.configuredAt = now;
      a.phase = 'primary';
    } else if (command.type === 'expose' && ['primary', 'controls'].includes(a.phase)) {
      const role = astronomyFrameRole(a);
      a.frames[role] = exposureValue(a, command.exposure, role, now);
      a.phase = role === 'dark' ? 'analyze' : 'controls';
    } else if (command.type === 'analyze' && a.phase === 'analyze') {
      const analysis = astronomyAnalysis(a);
      if (
        command.catalogHip !== a.target.hip ||
        command.outcome !== analysis.outcome ||
        command.limit !== 'synthetic-not-calibrated-sky-discovery'
      )
        throw Error(
          'Compare the recorded pixels with the catalog and retain clipping, noise and simulation limits.'
        );
      a.analysis = { ...analysis, at: now };
      a.phase = 'publish';
    } else if (command.type === 'publish' && a.phase === 'publish') {
      a.report = {
        schemaVersion: 1,
        truthType: 'catalog-and-synthetic-observing-log',
        variantId: a.variantId,
        title: ASTRONOMY_STUDIES[a.variantId].label,
        site: copy(a.site),
        referenceTime: a.referenceTime,
        target: copy(a.target),
        source: copy(a.source),
        alignment: copy(a.alignment),
        frames: copy(a.frames),
        analysis: copy(a.analysis),
        limit: 'synthetic-not-calibrated-sky-discovery',
        at: now,
      };
      a.phase = 'complete';
      a.completedAt = now;
    } else throw Error('Choose an action for the current observing step.');
  }
  const revision = state.revision + 1,
    eventId = 'event:research:astronomy:' + a.runId + ':' + revision,
    finished = command.type === 'publish' && a.phase === 'complete';
  if (finished) {
    completed[a.variantId] = eventId;
    records[a.variantId] = copy(a);
  }
  return {
    state: { ...state, revision, completed, records, archives, active: a },
    samples: [],
    event: {
      eventId,
      eventType: finished ? 'campaign-completed' : 'campaign-progress',
      activityId: 'survey',
      family: 'astronomy-study',
      sourceSystem: 'research-careers',
      sourceId:
        'astronomy:' +
        a.variantId +
        ':' +
        (visit ? 'review' : command.type) +
        ':' +
        (command.exposure?.role || ''),
      pathId: 'field',
      name:
        ASTRONOMY_STUDIES[a.variantId].label +
        (finished ? ' · observing log' : ' · observing record'),
      detail:
        'Real catalog positions and a reproducible synthetic detector comparison, with noise, clipping and controls retained.',
      occurredAt: now,
      environment: 'EARTH',
      regionId: a.site.id,
      regionLabel: a.site.name,
      locationSnapshot: { ...a.site.location, name: a.site.name },
      localPosition: copy(command.evidence?.localPosition || { x: 0, y: 0, z: 0 }),
      progress: { points: 0, reason: 'astronomy-study' },
      firstCompletion: finished && !state.completed[a.variantId],
      projections: {
        journal: !visit && command.type !== 'accept',
        profile: !visit && command.type !== 'accept',
        place: false,
      },
      metadata: {
        careerId: 'astronomy',
        runId: a.runId,
        variantId: a.variantId,
        phase: a.phase,
        truthType: 'catalog-and-synthetic-observing-log',
        action: copy(command),
        ...(finished ? { astronomyReport: copy(a.report) } : {}),
      },
    },
  };
}
export function validateAstronomyCareerBackup(value, events, items) {
  validateFieldHistory(
    'astronomy',
    value,
    events,
    items,
    transitionAstronomyCareer,
    normalizeAstronomyCareer
  );
}
export function astronomyCareerBadge(value) {
  const s = normalizeAstronomyCareer(value);
  return s.schemaVersion === 1 && s.completed.campaign
    ? {
        id: 'sky-observer',
        label: 'Sky Observer',
        detail:
          'Aligned a catalog target and retained a controlled synthetic observing comparison.',
        eventId: s.completed.campaign,
      }
    : null;
}
export function astronomyCareerSummary(value, { variantId = 'campaign' } = {}) {
  const s = normalizeAstronomyCareer(value);
  if (s.schemaVersion !== 1)
    return {
      title: 'Observing log unavailable',
      summary: 'Your saved log needs a compatible build.',
      stages: [],
      choices: [],
    };
  const a = s.active,
    done = s.completed[variantId],
    phase = ['align', 'configure', 'primary', 'controls', 'analyze', 'publish', 'complete'].indexOf(
      a?.phase
    ),
    complete = !!done;
  return {
    title: ASTRONOMY_STUDIES[variantId]?.label || ASTRONOMY_STUDIES.campaign.label,
    summary: ASTRONOMY_STUDIES[variantId]?.question || ASTRONOMY_STUDIES.campaign.question,
    resume: !!a && a.phase !== 'complete',
    ...(complete ? { actionLabel: 'Visit the saved observatory' } : {}),
    choices: Object.entries(ASTRONOMY_STUDIES)
      .filter(([id]) =>
        a && a.phase !== 'complete'
          ? id === a.variantId
          : id === 'campaign' || !!s.completed.campaign
      )
      .map(([id, row]) => ({ id, label: row.label })),
    stages: [
      'Align the working telescope on a catalog target',
      'Choose an exposure and retain its synthetic pixels and noise',
      'Take a comparison and a covered-detector control',
      'Compare position and brightness with the cited catalog',
      'Publish a reproducible observing log with its limits',
    ].map((label, i) => ({ label, complete: complete || phase > [0, 2, 3, 4, 5][i] })),
  };
}
