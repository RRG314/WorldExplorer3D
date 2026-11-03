import { validateMiningAdmission } from './mining-places.js';
import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  validateFieldSite,
  requireFieldPresence,
  validateFieldHistory,
  canonicalFieldRecord,
  fieldCoordinate,
  fieldDistance,
} from './field-study-contract.js';
import {
  MINING_JOBS,
  MINING_OFFSETS,
  miningFormation,
  miningAssay,
  miningCutPlan,
  miningSeparate,
  miningProcess,
  miningFabricate,
  MINING_LIMITS,
} from './mining-formation.js';
export { MINING_JOBS, MINING_OFFSETS };
export function normalizeMiningCareer(value) {
  const s = normalizeFieldStudy(value);
  return s.schemaVersion === 1 ? { records: {}, archives: [], ...s } : s;
}
export function miningTarget(a) {
  if (a.phase === 'inspect') return ['a', 'b', 'c'].find((k) => !a.faces[k]) || 'c';
  if (a.phase === 'assay') return ['a', 'b', 'c'].find((k) => !a.assays[k]) || 'c';
  return ['cut', 'sort', 'restore'].includes(a.phase) ? a.zone : 'bench';
}
export function miningExpectedAssays(a, id = miningTarget(a)) {
  const f = miningFormation(a.variantId);
  return Array.from({ length: 5 }, (_, column) => miningAssay(f, [id + ':1:' + column]));
}
function effort(raw, a, method, seconds, now) {
  if (
    !raw ||
    raw.runId !== a.runId ||
    raw.habitatId !== a.site.id + ':' + method ||
    raw.method !== 'mining-' + method ||
    raw.complete !== true ||
    raw.interrupted ||
    raw.liveGps ||
    raw.supported !== true ||
    raw.sensor?.aligned !== true ||
    raw.targetSeconds !== seconds ||
    !Number.isFinite(raw.activeSeconds) ||
    raw.activeSeconds < seconds - 1e-6 ||
    raw.activeSeconds > (method === 'delivery' ? 300 : seconds + 0.251) ||
    !Number.isFinite(raw.startedAt) ||
    raw.startedAt < (a.phaseAt || a.acceptedAt) ||
    !Number.isFinite(raw.endedAt) ||
    raw.endedAt > now ||
    raw.endedAt < raw.startedAt + raw.activeSeconds * 1000 - 250
  )
    throw Error('Complete the supported working instrument on the normal observation clock.');
}
function inspectValue(a, raw, id) {
  const faces = miningFormation(a.variantId).cells.filter((c) => c.faceId === id),
    features = [...new Set(faces.map((c) => c.features))].sort();
  if (
    raw?.faceId !== id ||
    raw.visible !== true ||
    raw.truthType !== 'visible-authored-formation' ||
    canonicalFieldRecord(raw.features) !== canonicalFieldRecord(features)
  )
    throw Error('Inspect the actual visible face and retain its exposed features.');
  return copy(raw);
}
function assayValue(a, raw, id, now) {
  if (
    raw?.faceId !== id ||
    raw.truthType !== 'modeled-virtual-line-assay' ||
    !Array.isArray(raw.samples) ||
    raw.samples.length !== 5
  )
    throw Error('Place and measure all five points of this face’s sampling line.');
  effort(raw.effort, a, 'assay-' + id, 5, now);
  const expected = miningExpectedAssays(a, id);
  for (let i = 0; i < 5; i++) {
    const s = raw.samples[i],
      e = expected[i];
    if (
      !s.tipMeters ||
      ![s.tipMeters.x, s.tipMeters.y, s.tipMeters.z].every(Number.isFinite) ||
      Math.abs(s.tipMeters.x - (i - 2) * 0.2) > 0.015 ||
      Math.abs(s.tipMeters.y - 1) > 0.015 ||
      s.tipMeters.z < 0.1 ||
      s.tipMeters.z > 0.2 ||
      s.contact !== true ||
      s.cellId !== e.cellIds[0] ||
      s.massGrams !== e.massGrams ||
      s.copperGrams !== e.copperGrams ||
      s.magnetic !== e.magnetic ||
      !Number.isFinite(s.activeSeconds) ||
      s.activeSeconds < i + 0.5 ||
      s.activeSeconds > i + 1.251
    )
      throw Error(
        'Retain the actual geometry-bound core, assay and sampling time at every line point.'
      );
  }
  return copy(raw);
}
function cutValue(a, raw, now) {
  effort(raw?.effort, a, 'cut', 4, now);
  if (
    raw?.truthType !== 'working-cutter-contact' ||
    !Array.isArray(raw.contacts) ||
    raw.contacts.length < a.plan.cellIds.length ||
    a.plan.cellIds.some(
      (id) =>
        !raw.contacts.some((c) => {
          const column = Number(id.split(':')[2]),
            p = c.tipMeters;
          return (
            c.cellId === id &&
            c.contact === true &&
            p &&
            [p.x, p.y, p.z].every(Number.isFinite) &&
            Math.abs(p.x - (column - 2) * 0.2) <= 0.104 &&
            Math.abs(p.y - 1) <= 0.104 &&
            Math.abs(p.z) <= 0.104 &&
            Number.isFinite(c.motorAngle) &&
            Math.abs(c.motorAngle - c.activeSeconds * 8 * Math.PI) < 1e-5 &&
            c.activeSeconds > 0 &&
            c.activeSeconds <= 4.251
          );
        })
    )
  )
    throw Error('Run the actual rotating cutter against every marked cell.');
  return copy(raw);
}
function deliveryValue(a, raw, now) {
  effort(raw?.effort, a, 'delivery', 3, now);
  if (
    raw?.truthType !== 'walked-carrier-delivery' ||
    raw.onPan !== true ||
    !Array.isArray(raw.wheelClearancesMeters) ||
    raw.wheelClearancesMeters.length !== 4 ||
    raw.wheelClearancesMeters.some((d) => !Number.isFinite(d) || Math.abs(d) >= 0.01) ||
    raw.massGrams !== a.separation.inputGrams ||
    canonicalFieldRecord([...(raw.cellIds || [])].sort()) !==
      canonicalFieldRecord([...a.plan.cellIds].sort()) ||
    !Array.isArray(raw.route) ||
    raw.route.length < 5 ||
    !['dispatch', 'bench'].every((id, i) => raw.effort.routeGates?.[i] === id)
  )
    throw Error('Walk the loaded carrier through the return control to the receiving scale.');
  const first = raw.route[0],
    last = raw.route.at(-1);
  if (
    !fieldCoordinate(first?.position) ||
    !fieldCoordinate(last?.position) ||
    fieldDistance(first.position, a.site.points[a.zone]) > 4 ||
    fieldDistance(last.position, a.site.points.bench) > 3
  )
    throw Error('Keep the actual loaded-face start and receiving-scale endpoint.');
  let distance = 0;
  for (let i = 0; i < raw.route.length; i++) {
    const p = raw.route[i],
      prior = raw.route[i - 1];
    if (
      !fieldCoordinate(p.position) ||
      ![p.heightMeters, p.activeSeconds].every(Number.isFinite) ||
      p.supported !== true ||
      p.carrierBlocked === true
    )
      throw Error('Retain the supported carrier path.');
    if (prior) {
      const d = Math.hypot(
          fieldDistance(prior.position, p.position),
          p.heightMeters - prior.heightMeters
        ),
        dt = p.activeSeconds - prior.activeSeconds;
      if (dt <= 0 || d > Math.max(1, dt * 8))
        throw Error('The carrier route contains an unsupported position change.');
      distance += d;
    }
  }
  const gate = raw.route.findIndex((p) => fieldDistance(p.position, a.site.points.dispatch) <= 3);
  if (
    gate < 0 ||
    !raw.route.slice(gate + 1).some((p) => fieldDistance(p.position, a.site.points.bench) <= 3)
  )
    throw Error('Retain the return control before the receiving scale.');
  if (
    distance < 8 ||
    Math.abs(distance - raw.distanceMeters) > 0.01 ||
    raw.effort.observerDistanceMeters < 8
  )
    throw Error('Deliver by walking the measured return route, not by opening the scale panel.');
  return copy(raw);
}
export function transitionMiningCareer(value, command, now = Date.now()) {
  const s = normalizeMiningCareer(value);
  if (s.schemaVersion !== 1)
    throw Error('This quarry ledger needs a compatible World Explorer version.');
  if (command?.revision !== s.revision)
    throw Error('This quarry job changed in another tab. Reopen it.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The quarry clock is unavailable.');
  let a = s.active ? copy(s.active) : null,
    visit = false;
  const completed = { ...s.completed },
    records = { ...s.records },
    archives = copy(s.archives);
  if (['accept', 'relocate'].includes(command.type)) {
    const variantId = command.type === 'relocate' ? a?.variantId : command.variantId || 'campaign';
    if (!Object.hasOwn(MINING_JOBS, variantId) || (variantId !== 'campaign' && !completed.campaign))
      throw Error('Complete the first quarry job before choosing another deposit.');
    const site = validateFieldSite(command.site, MINING_OFFSETS);
    // Curated, authored training-yard admission is separate from mapped geology.
    validateMiningAdmission(site, command.admission);
    if (command.type === 'accept' && a && a.phase !== 'complete') {
      if (a.variantId !== variantId || a.site.id !== site.id)
        throw Error('Continue the original job or move the blocked training exhibit.');
      return { state: s, event: null, samples: [] };
    }
    if (command.type === 'relocate') {
      if (!a || a.phase === 'complete') throw Error('Only an unfinished quarry exhibit can move.');
      archives.push({ ...copy(a), archivedAt: now, reason: 'site-relocated' });
    }
    if (command.type === 'accept' && records[variantId]) {
      a = copy(records[variantId]);
      if (a.site.id !== site.id) throw Error('Return to the original training yard.');
      visit = true;
    } else {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || ''))
        throw Error('The quarry job could not start.');
      a = {
        runId: command.runId,
        variantId,
        site,
        phase: 'inspect',
        acceptedAt: now,
        phaseAt: now,
        formationVersion: 1,
        seed: MINING_JOBS[variantId].seed,
        faces: {},
        assays: {},
        zone: null,
        plan: null,
        cut: null,
        separation: null,
        delivery: null,
        processing: null,
        fabrication: null,
        restoration: null,
        report: null,
        completedAt: 0,
      };
    }
  } else {
    if (!a || a.phase === 'complete') throw Error('Begin an unfinished quarry job.');
    requireFieldPresence(a, miningTarget(a), command.evidence, now);
    const f = miningFormation(a.variantId),
      id = miningTarget(a);
    if (command.type === 'inspect' && a.phase === 'inspect') {
      a.faces[id] = { ...inspectValue(a, command.inspection, id), at: now };
      if (['a', 'b', 'c'].every((k) => a.faces[k])) a.phase = 'assay';
    } else if (command.type === 'assay' && a.phase === 'assay') {
      a.assays[id] = assayValue(a, command.assay, id, now);
      if (['a', 'b', 'c'].every((k) => a.assays[k])) a.phase = 'plan';
    } else if (command.type === 'plan' && a.phase === 'plan') {
      const plan = miningCutPlan(f, command.cellIds, {
          returnRouteClear: command.returnRoute?.clear === true,
        }),
        oreIds = plan.cellIds.filter(
          (id) => miningAssay(f, [id]).gradePermille >= MINING_LIMITS.oreCutoffPermille
        ),
        preview = miningProcess(f, plan.cellIds, oreIds);
      if (preview.materialGrams < MINING_LIMITS.orderGrams)
        throw Error('Use the assays to choose a bounded cut that can supply the yard order.');
      if (
        a.variantId === 'narrow-vein' &&
        (plan.cellIds.length !== 1 || plan.cellIds[0] !== 'b:1:2')
      )
        throw Error('Follow the assayed narrow vein without the adjacent barren cells.');
      if (
        a.variantId === 'mixed-batch' &&
        canonicalFieldRecord(plan.cellIds.slice().sort()) !==
          canonicalFieldRecord(['b:1:1', 'b:1:2', 'b:1:3'])
      )
        throw Error('Mark the specified mixed batch, then separate it by the recorded assays.');
      a.zone = plan.faceId;
      a.plan = { ...plan, markedAt: now, returnRoute: copy(command.returnRoute) };
      a.phase = 'cut';
    } else if (command.type === 'cut' && a.phase === 'cut') {
      a.cut = { ...cutValue(a, command.cut, now), cellIds: [...a.plan.cellIds], at: now };
      a.phase = 'sort';
    } else if (command.type === 'sort' && a.phase === 'sort') {
      a.separation = { ...miningSeparate(f, a.plan.cellIds, command.oreCellIds), at: now };
      a.phase = 'deliver';
    } else if (command.type === 'deliver' && a.phase === 'deliver') {
      a.delivery = { ...deliveryValue(a, command.delivery, now), at: now };
      a.phase = 'process';
    } else if (command.type === 'process' && a.phase === 'process') {
      a.processing = { ...miningProcess(f, a.plan.cellIds, a.separation.oreCellIds) };
      a.phase = 'fabricate';
    } else if (command.type === 'fabricate' && a.phase === 'fabricate') {
      a.fabrication = { ...miningFabricate(a.processing), at: now };
      a.phase = 'restore';
    } else if (command.type === 'restore' && a.phase === 'restore') {
      const r = command.restoration;
      if (
        r?.truthType !== 'restored-authored-quarry-cell' ||
        r.supportsIntact !== true ||
        r.returnRouteClear !== true ||
        r.orderInstalled !== true ||
        r.backfillGrams !== a.processing.inputGrams - a.processing.materialGrams ||
        canonicalFieldRecord([...(r.backfilledCellIds || [])].sort()) !==
          canonicalFieldRecord([...a.plan.cellIds].sort())
      )
        throw Error(
          'Backfill the worked cells, retain supports and install the useful return-route marker.'
        );
      a.restoration = { ...copy(r), at: now };
      a.phase = 'publish';
    } else if (command.type === 'publish' && a.phase === 'publish') {
      if (command.limit !== 'authored-formation-not-real-ore-reserve')
        throw Error('Retain the authored geology and processing limits.');
      a.report = {
        schemaVersion: 1,
        truthType: 'authored-quarry-mass-ledger',
        variantId: a.variantId,
        title: MINING_JOBS[a.variantId].label,
        site: copy(a.site),
        formation: { version: a.formationVersion, seed: a.seed },
        faces: copy(a.faces),
        assays: copy(a.assays),
        plan: copy(a.plan),
        cut: copy(a.cut),
        separation: copy(a.separation),
        delivery: copy(a.delivery),
        processing: copy(a.processing),
        fabrication: copy(a.fabrication),
        restoration: copy(a.restoration),
        limit: command.limit,
        at: now,
      };
      a.phase = 'complete';
      a.completedAt = now;
    } else throw Error('Choose an action for the current quarry step.');
  }
  if (!['accept', 'relocate'].includes(command.type)) a.phaseAt = now;
  const revision = s.revision + 1,
    eventId = 'event:research:mining:' + a.runId + ':' + revision,
    finished = command.type === 'publish' && a.phase === 'complete';
  if (finished) {
    completed[a.variantId] = eventId;
    records[a.variantId] = copy(a);
  }
  const samples = finished
    ? [
        {
          instanceId: 'research-mining:' + a.runId + ':marker-record',
          catalogId: 'mining-marker-workorder',
          claimId: 'research-mining:' + a.runId + ':marker-record',
          sourceEventId: eventId,
          name: 'Quarry marker fabrication record',
          description:
            'Record of the conserved one-kilogram marker installed at this training yard; no tradable metal stock.',
          quantity: 1,
          tradeable: false,
          collectedAt: now,
          regionLabel: a.site.name,
          evidenceClass: 'field-research-record',
          researchLabel: {
            careerId: 'mining',
            runId: a.runId,
            variantId: a.variantId,
            siteId: a.site.id,
            productGrams: a.fabrication.productGrams,
            sourceCellIds: [...a.plan.cellIds],
          },
        },
      ]
    : [];
  return {
    state: { ...s, revision, completed, records, archives, active: a },
    samples,
    event: {
      eventId,
      eventType: finished ? 'campaign-completed' : 'campaign-progress',
      activityId: 'survey',
      family: 'mining-study',
      sourceSystem: 'research-careers',
      sourceId: 'mining:' + a.variantId + ':' + (visit ? 'review' : command.type),
      pathId: 'field',
      name:
        MINING_JOBS[a.variantId].label +
        (finished ? ' · conserved quarry ledger' : ' · quarry record'),
      detail:
        'Authored formation, measured virtual assays and a conserved training batch; supports, return route and retained waste remain in the record.',
      occurredAt: now,
      environment: 'EARTH',
      regionId: a.site.id,
      regionLabel: a.site.name,
      locationSnapshot: { ...a.site.location, name: a.site.name },
      localPosition: copy(command.evidence?.localPosition || { x: 0, y: 0, z: 0 }),
      progress: { points: 0, reason: 'mining-study' },
      firstCompletion: finished && !s.completed[a.variantId],
      projections: {
        journal: !visit && command.type !== 'accept',
        profile: !visit && command.type !== 'accept',
        place: false,
      },
      metadata: {
        careerId: 'mining',
        runId: a.runId,
        variantId: a.variantId,
        phase: a.phase,
        truthType: 'authored-quarry-mass-ledger',
        action: copy(command),
        ...(finished ? { miningReport: copy(a.report) } : {}),
      },
    },
  };
}
export function validateMiningCareerBackup(value, events, items) {
  validateFieldHistory(
    'mining',
    value,
    events,
    items,
    transitionMiningCareer,
    normalizeMiningCareer
  );
}
export function miningCareerBadge(value) {
  const s = normalizeMiningCareer(value);
  return s.schemaVersion === 1 && s.completed.campaign
    ? {
        id: 'mining-survey',
        label: 'Mining Survey',
        detail: 'Assayed an authored formation, conserved the batch and restored the worked cell.',
        eventId: s.completed.campaign,
      }
    : null;
}
export function miningCareerSummary(value, { variantId = 'campaign' } = {}) {
  const s = normalizeMiningCareer(value);
  if (s.schemaVersion !== 1)
    return {
      title: 'Quarry ledger unavailable',
      summary: 'Your saved job needs a compatible build.',
      choices: [],
      stages: [],
    };
  const a = s.active,
    done = !!s.completed[variantId],
    stages = [
      ['Inspect three actual visible faces', a && Object.keys(a.faces).length === 3],
      ['Measure and compare three five-point assay lines', a && Object.keys(a.assays).length === 3],
      ['Mark a bounded cut with supports and a clear return route', !!a?.plan],
      ['Operate the cutter, separate and deliver the weighed batch', !!a?.delivery],
      ['Process, fabricate the yard order and restore the cell', !!a?.report],
    ];
  return {
    title: MINING_JOBS[variantId]?.label || MINING_JOBS.campaign.label,
    summary: MINING_JOBS[variantId]?.question || MINING_JOBS.campaign.question,
    resume: !!a && a.phase !== 'complete',
    ...(done ? { actionLabel: 'Visit the original training yard' } : {}),
    choices: Object.entries(MINING_JOBS)
      .filter(([id]) =>
        a && a.phase !== 'complete'
          ? id === a.variantId
          : id === 'campaign' || !!s.completed.campaign
      )
      .map(([id, row]) => ({ id, label: row.label })),
    stages: stages.map(([label, complete]) => ({ label, complete: done || !!complete })),
  };
}
