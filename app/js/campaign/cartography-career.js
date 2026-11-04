import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  validateFieldSite,
  requireFieldPresence,
  validateFieldHistory,
  fieldDistance,
  fieldCoordinate,
} from './field-study-contract.js';
export const CARTOGRAPHY_PROTOCOL = 'loaded-walking-survey-v1';
export const CARTOGRAPHY_POINTS = { origin: {}, a: {}, b: {}, entry: {} };
export const CARTOGRAPHY_STUDIES = Object.freeze({
  campaign: {
    label: 'Make the Route Usable',
    question: 'What do measured legs and an inspected entrance add to a mapped route?',
  },
  reciprocal: {
    label: 'The Return Bearing',
    question: 'How do reciprocal bearings change while the same route length stays comparable?',
  },
  dogleg: {
    label: 'Around the Corner',
    question: 'How much does a connected route differ from the straight line between its ends?',
  },
});
export const normalizeCartographyCareer = (value) => {
  const s = normalizeFieldStudy(value);
  return s.schemaVersion === 1 ? { records: {}, ...s } : s;
};
export const cartographyTarget = (a) =>
  a.phase === 'leg-one'
    ? 'a'
    : a.phase === 'leg-two'
      ? 'b'
      : a.phase === 'access'
        ? 'entry'
        : 'origin';
export const cartographyBearing = (a, b) =>
  ((Math.atan2((b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180), b.lat - a.lat) * 180) /
    Math.PI +
    360) %
  360;
// Local true-north bearing; no magnetic declination or device compass is implied.
export function cartographyLegValue(raw) {
  let distance = 0,
    horizontal = 0,
    maxGrade = 0;
  for (let i = 1; i < raw.samples.length; i++) {
    const a = raw.samples[i - 1],
      b = raw.samples[i],
      d = fieldDistance(a.position, b.position),
      rise = b.heightMeters - a.heightMeters;
    horizontal += d;
    distance += Math.hypot(d, rise);
    if (d > 0.1) maxGrade = Math.max(maxGrade, Math.abs(rise) / d);
  }
  const a = raw.samples[0].position,
    b = raw.samples.at(-1).position;
  return {
    distance,
    horizontal,
    chord: fieldDistance(a, b),
    bearing: cartographyBearing(a, b),
    maxGrade,
  };
}
function siteValue(value) {
  const s = validateFieldSite(value, CARTOGRAPHY_POINTS),
    p = copy(value.plan);
  if (
    p?.protocol !== CARTOGRAPHY_PROTOCOL ||
    !['campaign', 'reciprocal', 'dogleg'].includes(p.variantId) ||
    !Array.isArray(p.legs) ||
    p.legs.length !== 2 ||
    !p.entry?.id ||
    !['mapped', 'inferred'].includes(p.entry.provenance) ||
    p.realAccess !== 'unverified'
  )
    throw Error('Keep the loaded route, entrance provenance and unverified real access.');
  for (const [i, leg] of p.legs.entries()) {
    if (
      leg.from !== ['origin', 'a'][i] ||
      leg.to !== ['a', 'b'][i] ||
      !Array.isArray(leg.points) ||
      leg.points.length < 2 ||
      leg.points.length > 128 ||
      !leg.points.every(fieldCoordinate) ||
      !Array.isArray(leg.sources) ||
      leg.sources.length > 24 ||
      !leg.sources.every(
        (f) =>
          typeof f.id === 'string' &&
          typeof f.kind === 'string' &&
          ['mapped', 'compiled'].includes(f.provenance)
      ) ||
      !Number.isFinite(leg.mapDistance) ||
      leg.mapDistance < 8 ||
      leg.mapDistance > 250 ||
      fieldDistance(leg.points[0], s.points[leg.from]) > 1 ||
      fieldDistance(leg.points.at(-1), s.points[leg.to]) > 1
    )
      throw Error('Use two bounded connected walking legs with their source references.');
  }
  if (
    p.variantId === 'dogleg' &&
    p.legs[1].mapDistance / fieldDistance(s.points.a, s.points.b) < 1.12
  )
    throw Error('The corner study needs a real detour in the connected network.');
  return { ...s, plan: p };
}
function readingValue(a, raw, now) {
  const r = copy(raw || {}),
    index = a.phase === 'leg-one' ? 0 : 1,
    leg = a.site.plan.legs[index];
  if (
    r.protocol !== CARTOGRAPHY_PROTOCOL ||
    r.runId !== a.runId ||
    r.siteId !== a.site.id ||
    r.legIndex !== index ||
    !Number.isFinite(r.startedAt) ||
    r.startedAt <= 0 ||
    !Number.isFinite(r.completedAt) ||
    r.completedAt <= r.startedAt ||
    r.completedAt > now ||
    now - r.completedAt > 120000 ||
    !Number.isFinite(r.activeSeconds) ||
    r.activeSeconds < 1 ||
    r.activeSeconds > (r.completedAt - r.startedAt) / 1000 + 0.25 ||
    !Number.isFinite(r.excludedSeconds) ||
    r.excludedSeconds < 0 ||
    !Array.isArray(r.samples) ||
    r.samples.length < 3 ||
    r.samples.length > 256
  )
    throw Error(
      'Walk this leg with the survey recorder active; keep its supported position samples.'
    );
  for (const [i, s] of r.samples.entries()) {
    if (
      !fieldCoordinate(s.position) ||
      !Number.isFinite(s.heightMeters) ||
      !Number.isFinite(s.activeSeconds) ||
      s.activeSeconds < 0 ||
      s.activeSeconds > r.activeSeconds ||
      s.supported !== true ||
      ![
        'terrain',
        'road',
        'footway',
        'path',
        'cycleway',
        'stairs',
        'structure',
        'bridge',
        'tunnel',
        'building',
      ].includes(s.surfaceKind)
    )
      throw Error('Keep every supported loaded-surface sample.');
    if (i) {
      const prev = r.samples[i - 1],
        dt = s.activeSeconds - prev.activeSeconds,
        d = fieldDistance(prev.position, s.position);
      if (dt <= 0 || d > 4 || d / dt > 8)
        throw Error('Restart the leg after a discontinuous or unsupported movement.');
    }
  }
  if (
    fieldDistance(r.samples[0].position, a.site.points[leg.from]) > 3 ||
    fieldDistance(r.samples.at(-1).position, a.site.points[leg.to]) > 3
  )
    throw Error('Begin and end at this leg’s original control points.');
  const v = cartographyLegValue(r);
  if (v.distance < leg.mapDistance * 0.65 || v.distance > leg.mapDistance * 2.5 || v.distance < 8)
    throw Error('Follow the connected route between the control points.');
  return r;
}
export function transitionCartographyCareer(value, command, now = Date.now()) {
  const s = normalizeCartographyCareer(value);
  if (s.schemaVersion !== 1) throw Error('This route survey needs a newer World Explorer version.');
  if (command?.revision !== s.revision) throw Error('This route survey changed. Reopen it.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The survey clock is unavailable.');
  let a = s.active ? copy(s.active) : null,
    visit = false;
  const completed = { ...s.completed },
    records = { ...s.records };
  if (command.type === 'accept') {
    const id = command.variantId || 'campaign',
      site = siteValue(command.site);
    if (
      !CARTOGRAPHY_STUDIES[id] ||
      site.plan.variantId !== id ||
      (id !== 'campaign' && !completed.campaign)
    )
      throw Error('Complete Make the Route Usable before another survey.');
    if (id === 'reciprocal' && records.campaign) {
      const base = records.campaign;
      if (
        site.plan.reciprocalOf !== base.runId ||
        ['origin', 'a', 'b'].some(
          (k, i) => fieldDistance(site.points[k], base.site.points[['b', 'a', 'origin'][i]]) > 0.1
        )
      )
        throw Error('Reverse the original controls for the reciprocal survey.');
    }
    if (a && a.phase !== 'complete') {
      if (a.variantId !== id || a.site.id !== site.id)
        throw Error('Continue the saved route survey first.');
      return { state: s, event: null, samples: [] };
    }
    if (records[id]) {
      a = copy(records[id]);
      if (a.site.id !== site.id) throw Error('Reopen the original route sheet.');
      visit = true;
    } else {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || ''))
        throw Error('The survey could not start.');
      a = {
        runId: command.runId,
        variantId: id,
        site,
        phase: 'controls',
        acceptedAt: now,
        controls: null,
        legs: [],
        access: null,
        reconciliation: null,
        report: null,
        completedAt: 0,
        reference:
          id === 'reciprocal' ? records.campaign.legs.map(cartographyLegValue).reverse() : null,
      };
    }
  } else {
    if (!a || a.phase === 'complete') throw Error('Begin an unfinished route survey.');
    requireFieldPresence(a, cartographyTarget(a), command.evidence, now);
    if (command.type === 'controls' && a.phase === 'controls') {
      const r = command.controls;
      if (
        r?.siteId !== a.site.id ||
        r.runId !== a.runId ||
        !Number.isFinite(r.at) ||
        Math.abs(now - r.at) > 2000 ||
        !Array.isArray(r.sights) ||
        r.sights.length !== 2 ||
        !r.sights.every(
          (p, i) =>
            p.id === ['a', 'b'][i] &&
            p.clear === true &&
            Number.isFinite(p.rangeMeters) &&
            Math.abs(p.rangeMeters - fieldDistance(a.site.points.origin, a.site.points[p.id])) <
              0.25
        ) ||
        command.north !== 'true-north'
      )
        throw Error('Sight both visible controls from the origin and use true north.');
      a.controls = copy(r);
      a.phase = 'leg-one';
    } else if (command.type === 'measure' && ['leg-one', 'leg-two'].includes(a.phase)) {
      const r = readingValue(a, command.reading, now);
      if (command.unit !== 'm' || command.bearingReference !== 'true-north')
        throw Error('Record metres and clockwise true-north bearings.');
      a.legs.push(r);
      a.phase = a.phase === 'leg-one' ? 'leg-two' : 'access';
    } else if (command.type === 'access' && a.phase === 'access') {
      const r = command.inspection;
      if (
        r?.siteId !== a.site.id ||
        r.runId !== a.runId ||
        r.entryId !== a.site.plan.entry.id ||
        !Number.isFinite(r.at) ||
        Math.abs(now - r.at) > 2000 ||
        !Number.isFinite(r.maxGrade) ||
        r.maxGrade < 0 ||
        !['enterable', 'exterior-only', 'unknown'].includes(r.entrySupport) ||
        !['mapped', 'inferred'].includes(r.entranceProvenance) ||
        ![
          'road',
          'footway',
          'path',
          'cycleway',
          'terrain',
          'stairs',
          'structure',
          'bridge',
          'tunnel',
          'building',
        ].includes(r.surfaceKind) ||
        typeof r.crossingMapped !== 'boolean' ||
        command.accessClaim !== 'virtual-only' ||
        command.limit !== 'no-step-free-or-public-access-proof'
      )
        throw Error(
          'Inspect the loaded approach and retain unknown real-world access and mobility limits.'
        );
      a.access = copy(r);
      a.phase = 'reconcile';
    } else if (command.type === 'reconcile' && a.phase === 'reconcile') {
      if (
        command.heightSource !== 'loaded-surface-not-mapped-height' ||
        command.geometryLimit !== 'same-source-not-independent-survey' ||
        command.routeMeaning !== 'connected-route-not-chord'
      )
        throw Error(
          'Separate loaded height, mapped geometry and route distance; agreement is not an independent accuracy test.'
        );
      a.reconciliation = {
        heightSource: command.heightSource,
        geometryLimit: command.geometryLimit,
        routeMeaning: command.routeMeaning,
        at: now,
      };
      a.phase = 'publish';
    } else if (command.type === 'publish' && a.phase === 'publish') {
      if (command.use !== 'personal-virtual-route' || command.followUp !== 'recheck-loaded-access')
        throw Error('Publish a personal virtual route and recheck its support before reuse.');
      a.phase = 'complete';
      a.completedAt = now;
      a.report = {
        schemaVersion: 1,
        truthType: 'loaded-virtual-route-survey',
        title: CARTOGRAPHY_STUDIES[a.variantId].label,
        site: copy(a.site),
        controls: copy(a.controls),
        legs: copy(a.legs),
        access: copy(a.access),
        reconciliation: copy(a.reconciliation),
        reference: copy(a.reference),
        at: now,
      };
    } else throw Error('Choose an action for the current survey step.');
  }
  const revision = s.revision + 1,
    eventId = 'event:research:cartography:' + a.runId + ':' + revision,
    finished = command.type === 'publish';
  if (finished) {
    completed[a.variantId] = eventId;
    records[a.variantId] = copy(a);
  }
  return {
    state: { ...s, revision, completed, records, active: a },
    samples: [],
    event: {
      eventId,
      eventType: finished ? 'campaign-completed' : 'campaign-progress',
      activityId: 'survey',
      family: 'route-survey',
      sourceSystem: 'research-careers',
      sourceId: 'cartography:' + a.variantId + ':' + (visit ? 'review' : command.type),
      pathId: 'field',
      name:
        CARTOGRAPHY_STUDIES[a.variantId].label + (finished ? ' · route sheet' : ' · survey record'),
      detail: 'Measured virtual route, loaded access notes and retained map uncertainty.',
      occurredAt: now,
      environment: 'EARTH',
      regionId: a.site.id,
      regionLabel: a.site.name,
      locationSnapshot: { ...a.site.location, name: a.site.name },
      localPosition: copy(command.evidence?.localPosition || { x: 0, y: 0, z: 0 }),
      progress: { points: 0, reason: 'cartography-study' },
      firstCompletion: finished && !s.completed[a.variantId],
      projections: {
        journal: !visit && command.type !== 'accept',
        profile: !visit && command.type !== 'accept',
        place: false,
      },
      metadata: {
        careerId: 'cartography',
        runId: a.runId,
        variantId: a.variantId,
        phase: a.phase,
        truthType: 'loaded-virtual-route-survey',
        action: copy(command),
        ...(finished ? { cartographyReport: copy(a.report) } : {}),
      },
    },
  };
}
export function validateCartographyCareerBackup(value, events, items) {
  validateFieldHistory(
    'cartography',
    value,
    events,
    items,
    transitionCartographyCareer,
    normalizeCartographyCareer
  );
}
export function cartographyCareerBadge(value) {
  const s = normalizeCartographyCareer(value);
  return s.schemaVersion === 1 && s.completed.campaign
    ? {
        id: 'route-survey',
        label: 'Route Survey',
        detail:
          'Measured loaded walking routes, inspected an approach and retained a reusable virtual route sheet.',
      }
    : null;
}
export function cartographyCareerSummary(value, { variantId = 'campaign' } = {}) {
  const s = normalizeCartographyCareer(value),
    study = CARTOGRAPHY_STUDIES[variantId] || CARTOGRAPHY_STUDIES.campaign,
    a = s.active?.variantId === variantId ? s.active : null,
    index = [
      'controls',
      'leg-one',
      'leg-two',
      'access',
      'reconcile',
      'publish',
      'complete',
    ].indexOf(a?.phase);
  if (s.schemaVersion !== 1)
    return {
      title: 'Route survey',
      summary: 'This save needs a newer World Explorer version.',
      choices: [],
      stages: [],
    };
  return {
    title: study.label,
    summary: study.question,
    resume: !!a && a.phase !== 'complete',
    ...(s.records[variantId] ? { actionLabel: 'Visit saved route' } : {}),
    choices: Object.entries(CARTOGRAPHY_STUDIES)
      .filter(([id]) =>
        s.active && s.active.phase !== 'complete'
          ? id === s.active.variantId
          : id === 'campaign' || s.completed.campaign
      )
      .map(([id, v]) => ({ id, label: v.label })),
    stages: [
      'Establish an origin and two visible controls',
      'Measure both route legs and true bearings',
      'Inspect slope, crossing and entrance support',
      'Reconcile mapped geometry with loaded surfaces',
      'Publish and reuse a personal virtual route sheet',
    ].map((label, i) => ({ label, complete: index > [0, 2, 3, 4, 5][i] })),
  };
}
