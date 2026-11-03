import {
  normalizeFieldStudy,
  copyFieldRecord as copy,
  canonicalFieldRecord as canonical,
  validateFieldHistory,
  fieldCoordinate,
  fieldDistance,
} from './field-study-contract.js';
import {
  ACCELERATOR_STUDIES,
  ACCELERATOR_SOURCE,
  acceleratorStudy,
} from './accelerator-studies.js';
import {
  validateAcceleratorExperiment,
  calculateAcceleratorExperiment,
} from './accelerator-experiments.js';
import { cernStationReference, CERN_ARRIVALS } from './cern-study-sites.js';

export const ACCELERATOR_METHODS = Object.freeze([
  'bend',
  'rf',
  'focus',
  'signals',
  'track',
  'mass',
  'population',
]);
export function normalizeAcceleratorCareer(value) {
  const s = normalizeFieldStudy(value);
  return s.schemaVersion === 1 ? { records: {}, archives: [], ...s } : s;
}
export const acceleratorTarget = (a) =>
  ['publish', 'complete'].includes(a.phase) ? 'population' : a.phase;
function presence(method, e, now) {
  const r = cernStationReference(method);
  if (
    e?.environment !== 'EARTH' ||
    e.travelMode !== 'walk' ||
    e.liveGps ||
    e.supported !== true ||
    e.siteId !== r.siteId ||
    e.floorId !== r.floorId ||
    !Number.isFinite(e.verticalDistance) ||
    Math.abs(e.verticalDistance) > 2.5 ||
    !fieldCoordinate(e.position) ||
    fieldDistance(e.position, r.position) > 3 ||
    ![r.source.sourceBuildingId, ...(r.source.sourceAliases || [])].includes(e.sourceBuildingId) ||
    e.accuracy !== 'interpretive-training-visit' ||
    !Number.isFinite(e.at) ||
    Math.abs(e.at - now) > 2000
  )
    throw Error('Walk to the supported instrument in this admitted CERN training room.');
  return r;
}
export function acceleratorInstrumentPose(method, inputs) {
  const angles =
    method === 'bend'
      ? { fieldTesla: (inputs.fieldTesla * Math.PI) / 3 }
      : method === 'rf'
        ? { phaseDegrees: (inputs.phaseDegrees * Math.PI) / 180 }
        : method === 'focus'
          ? { k1: (inputs.k1 * Math.PI) / 2, k2: (inputs.k2 * Math.PI) / 2 }
          : method === 'mass'
            ? { beta: inputs.beta * Math.PI }
            : {};
  return {
    version: 1,
    method,
    angles,
    ...(method === 'focus' ? { alternating: inputs.alternating } : {}),
    ...(method === 'signals' ? { revealed: [...inputs.revealed], choice: inputs.choice } : {}),
    ...(method === 'track' ? { selected: [...inputs.selected] } : {}),
    ...(method === 'population' ? { cutGeV: inputs.cutGeV, charge: inputs.charge } : {}),
  };
}
function measurement(a, raw, now) {
  const method = a.phase,
    result = validateAcceleratorExperiment(a.variantId, method, raw?.experiment);
  const expectedPose = acceleratorInstrumentPose(method, result.inputs),
    actualPose = raw.pose;
  if (
    !actualPose ||
    canonical({ ...actualPose, angles: expectedPose.angles }) !== canonical(expectedPose) ||
    Object.keys(actualPose.angles || {})
      .sort()
      .join() !== Object.keys(expectedPose.angles).sort().join() ||
    Object.entries(expectedPose.angles).some(
      ([key, value]) =>
        !Number.isFinite(actualPose.angles[key]) || Math.abs(actualPose.angles[key] - value) > 1e-9
    )
  )
    throw Error('Retain the actual mounted instrument settings.');
  const e = raw.effort;
  if (
    !e ||
    e.runId !== a.runId ||
    e.habitatId !== 'cern:' + method ||
    e.method !== 'accelerator-' + method ||
    e.complete !== true ||
    e.interrupted ||
    e.liveGps ||
    e.supported !== true ||
    e.sensor?.aligned !== true ||
    e.targetSeconds !== 3 ||
    !Number.isFinite(e.activeSeconds) ||
    e.activeSeconds < 3 ||
    e.activeSeconds > 3.251 ||
    !Number.isFinite(e.startedAt) ||
    e.startedAt < (a.phaseAt || a.acceptedAt) ||
    !Number.isFinite(e.endedAt) ||
    e.endedAt > now ||
    e.endedAt < e.startedAt + e.activeSeconds * 1000 - 250
  )
    throw Error('Observe the actual working instrument for three supported active seconds.');
  if (
    ['mass', 'population'].includes(method) &&
    canonical(raw.dataVerification) !==
      canonical({
        bundleSha256: ACCELERATOR_SOURCE.dataSha256,
        sourceSha256: '47d09d16c01db9a45ce349c9730f032fdd22bf27980ecf524e7fb1fd84572cdb',
        rows: 100000,
        category: 'REAL_RECORDED_DATA',
      })
  )
    throw Error('Load and verify the original recorded CMS bundle at this analysis station.');
  if (
    !raw.display ||
    raw.display.version !== 1 ||
    raw.display.method !== method ||
    raw.display.samples !== 121 ||
    !Array.isArray(raw.display.position) ||
    raw.display.position.length !== 3 ||
    raw.display.position.some((v) => !Number.isFinite(v)) ||
    Math.hypot(...raw.display.position.map((v, i) => v - raw.display.expectedPosition?.[i])) > 1e-6
  )
    throw Error('Retain the measured position on the rendered instrument path.');
  // Derive the expected final display point independently from the pinned model.
  const expected = acceleratorDisplayPath(result).at(-1);
  if (Math.hypot(...expected.map((v, i) => v - raw.display.position[i])) > 1e-6)
    throw Error('The rendered instrument no longer follows this experiment.');
  return copy(raw);
}
export function acceleratorDisplayPath(result) {
  const method = result.method,
    full = result.plot
      ? result
      : calculateAcceleratorExperiment(result.studyId, method, result.inputs);
  // A labelled tabletop visualisation, not an engineering-scale accelerator.
  // Scientific values above always remain in their original physical units.
  return Array.from({ length: 121 }, (_, i) => {
    const t = i / 120;
    if (method === 'bend') {
      const [x, z] = full.plot.points[i];
      return [x * 0.35 - 1, 0.12, z * 0.2];
    }
    if (method === 'rf')
      return [-1 + t * 2, 0.12 + (20 + (result.readings.energyMeV - 20) * t) / 80, 0];
    if (method === 'focus') {
      const history = full.plot.history,
        index = t * (history.length - 1),
        a = history[Math.floor(index)],
        b = history[Math.min(history.length - 1, Math.ceil(index))],
        f = index - Math.floor(index),
        ray = a.rays[0].map((v, j) => (j < 2 ? v + (b.rays[0][j] - v) * f : v));
      return [-1 + t * 2, 0.2 + ray[0] * 20, ray[1] * 20];
    }
    if (method === 'track') {
      const curve = full.plot.curve,
        index = t * (curve.length - 1),
        a = curve[Math.floor(index)],
        b = curve[Math.min(curve.length - 1, Math.ceil(index))];
      return [-1 + t * 2, 0.2 + a.y + (b.y - a.y) * (index - Math.floor(index)), 0];
    }
    if (method === 'mass')
      return [-1 + t * 2, 0.2 + Math.min(1, result.readings.energy / 100) * t, 0];
    if (method === 'population')
      return [
        -1 + t * 2,
        0.2 +
          (result.readings.bins[Math.min(54, Math.floor(t * 55))] || 0) /
            Math.max(1, ...result.readings.bins),
        0,
      ];
    const value =
      result.readings.opened?.find((r) => r.index === Math.min(3, Math.floor(t * 4)))?.value || 0;
    return [-1 + t * 2, 0.2 + value * 0.15, 0];
  });
}
export function transitionAcceleratorCareer(value, command, now = Date.now()) {
  const s = normalizeAcceleratorCareer(value);
  if (s.schemaVersion !== 1)
    throw Error('This Collision Lab notebook needs a compatible World Explorer version.');
  if (command?.revision !== s.revision)
    throw Error('This study changed in another tab. Reopen it.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The study clock is unavailable.');
  let a = s.active ? copy(s.active) : null,
    visit = false;
  const completed = { ...s.completed },
    records = { ...s.records },
    archives = copy(s.archives);
  if (command.type === 'accept') {
    const variantId = command.variantId || 'campaign';
    acceleratorStudy(variantId);
    if (variantId !== 'campaign' && !completed.campaign)
      throw Error('Complete the first Collision Lab study before another case.');
    if (a && a.phase !== 'complete') {
      if (a.variantId !== variantId) throw Error('Continue the original Collision Lab study.');
      return { state: s, event: null, samples: [] };
    }
    if (records[variantId]) {
      a = copy(records[variantId]);
      visit = true;
    } else {
      if (typeof command.runId !== 'string' || !/^[a-zA-Z0-9:._-]{1,100}$/.test(command.runId))
        throw Error('A stable study identity is required.');
      if (a) archives.push(copy(a));
      a = {
        runId: command.runId,
        variantId,
        phase: 'orientation',
        acceptedAt: now,
        phaseAt: now,
        measurements: {},
        site: {
          id: 'cern-two-site-training',
          name: 'CERN · Meyrin and CMS',
          location: { lat: 46.23353415849373, lon: 6.056988453434153 },
        },
      };
    }
  } else {
    if (!a || a.phase === 'complete') throw Error('Choose or continue a Collision Lab study.');
    presence(acceleratorTarget(a), command.evidence, now);
    if (command.type === 'orientation' && a.phase === 'orientation') {
      if (command.scope !== 'virtual-interpretive-not-access-permit')
        throw Error('Keep the virtual training and real access boundaries.');
      a.orientation = { at: now, evidence: copy(command.evidence), scope: command.scope };
      a.phase = 'bend';
    } else if (command.type === 'measure' && ACCELERATOR_METHODS.includes(a.phase)) {
      const method = a.phase,
        raw = measurement(a, command.measurement, now),
        result = raw.experiment,
        list = a.measurements[method] || [];
      if (list.length >= 8)
        throw Error(
          'This instrument already retains its bounded attempts. Continue with the recorded settings.'
        );
      if (method === 'signals') {
        if (
          !list.length &&
          (!result.inputs.revealed.length ||
            result.readings.possible.length < 2 ||
            result.inputs.choice !== -1)
        )
          throw Error(
            'First retain an ambiguous chosen detector subset before choosing a particle.'
          );
        if (
          list.length &&
          result.accepted &&
          !list.some((r) => r.experiment.readings.possible.length > 1)
        )
          throw Error('Retain the earlier ambiguous readout.');
      } else if (method === 'mass') {
        if (!list.length && result.inputs.beta !== 0)
          throw Error('First record the original laboratory observer, β = 0.');
        if (
          list.length &&
          result.accepted &&
          Math.abs(result.inputs.beta - list[0].experiment.inputs.beta) < 0.005
        )
          throw Error('Change the observer by at least 0.005 in β and compare the invariant mass.');
        if (list.length && Math.abs(result.readings.mass - list[0].experiment.readings.mass) > 1e-7)
          throw Error('Changing the observer cannot change the pair invariant mass.');
      } else if (method === 'population') {
        if (!list.length && result.inputs.charge !== 'opposite')
          throw Error('Record the opposite-charge population first.');
        if (list.length && result.inputs.charge !== 'same')
          throw Error('Use the identical cut for the same-charge control.');
      }
      list.push({ ...raw, at: now, evidence: copy(command.evidence) });
      a.measurements[method] = list;
      const ready =
        result.accepted &&
        (method !== 'signals' || list.length > 1) &&
        (method !== 'mass' || list.length > 1) &&
        (method !== 'population' || list.length === 2);
      if (ready)
        a.phase = ACCELERATOR_METHODS[ACCELERATOR_METHODS.indexOf(method) + 1] || 'publish';
    } else if (command.type === 'publish' && a.phase === 'publish') {
      if (command.limit !== 'recorded-comparison-not-discovery-or-engineering')
        throw Error('Retain the data and model limits in the report.');
      a.report = {
        schemaVersion: 1,
        truthType: 'collision-lab-reproducible-study',
        title: ACCELERATOR_STUDIES[a.variantId].label,
        variantId: a.variantId,
        source: ACCELERATOR_SOURCE,
        orientation: copy(a.orientation),
        measurements: copy(a.measurements),
        limit: command.limit,
        at: now,
      };
      a.phase = 'complete';
      a.completedAt = now;
    } else throw Error('Choose an action for the current Collision Lab step.');
    a.phaseAt = now;
  }
  const revision = s.revision + 1,
    eventId = 'event:research:accelerator:' + a.runId + ':' + revision,
    finished = command.type === 'publish' && a.phase === 'complete';
  if (finished) {
    completed[a.variantId] = eventId;
    records[a.variantId] = copy(a);
  }
  return {
    state: { ...s, revision, completed, records, archives, active: a },
    samples: [],
    event: {
      eventId,
      eventType: finished ? 'campaign-completed' : 'campaign-progress',
      activityId: 'survey',
      family: 'accelerator-study',
      sourceSystem: 'research-careers',
      sourceId: 'accelerator:' + a.variantId + ':' + (visit ? 'review' : command.type),
      pathId: 'field',
      name:
        ACCELERATOR_STUDIES[a.variantId].label +
        (finished ? ' · Collision Lab notebook' : ' · experiment record'),
      detail:
        'Original educational beam models and independently verified recorded CMS events, with chosen settings and controls retained.',
      occurredAt: now,
      environment: 'EARTH',
      regionId: a.site.id,
      regionLabel: a.site.name,
      locationSnapshot:
        command.evidence?.siteId && CERN_ARRIVALS[command.evidence.siteId]
          ? {
              lat: CERN_ARRIVALS[command.evidence.siteId].lat,
              lon: CERN_ARRIVALS[command.evidence.siteId].lon,
              name: CERN_ARRIVALS[command.evidence.siteId].name,
            }
          : { ...a.site.location, name: a.site.name },
      localPosition: copy(command.evidence?.localPosition || { x: 0, y: 0, z: 0 }),
      progress: { points: 0, reason: 'accelerator-study' },
      firstCompletion: finished && !s.completed[a.variantId],
      projections: {
        journal: !visit && command.type !== 'accept',
        profile: !visit && command.type !== 'accept',
        place: false,
      },
      metadata: {
        careerId: 'accelerator',
        runId: a.runId,
        variantId: a.variantId,
        phase: a.phase,
        truthType: 'collision-lab-reproducible-study',
        action: copy(command),
        ...(finished ? { acceleratorReport: copy(a.report) } : {}),
      },
    },
  };
}
export function validateAcceleratorCareerBackup(value, events, items) {
  validateFieldHistory(
    'accelerator',
    value,
    events,
    items,
    transitionAcceleratorCareer,
    normalizeAcceleratorCareer
  );
}
export function acceleratorCareerBadge(value) {
  const s = normalizeAcceleratorCareer(value);
  return s.schemaVersion === 1 && s.completed.campaign
    ? {
        id: 'collision-lab',
        label: 'Collision Lab',
        detail: 'Controlled a training beam and retained a reproducible recorded-data comparison.',
        eventId: s.completed.campaign,
      }
    : null;
}
export function acceleratorCareerSummary(value, { variantId = 'campaign' } = {}) {
  const s = normalizeAcceleratorCareer(value);
  if (s.schemaVersion !== 1)
    return {
      title: 'Collision Lab unavailable',
      summary: 'This notebook needs a compatible build.',
      choices: [],
      stages: [],
    };
  const a = s.active,
    done = !!s.completed[variantId];
  return {
    title: ACCELERATOR_STUDIES[variantId]?.label || ACCELERATOR_STUDIES.campaign.label,
    summary: ACCELERATOR_STUDIES[variantId]?.question || ACCELERATOR_STUDIES.campaign.question,
    resume: !!a && a.phase !== 'complete',
    ...(done ? { actionLabel: 'Review original CMS notebook' } : {}),
    choices: Object.values(ACCELERATOR_STUDIES)
      .filter((r) =>
        a && a.phase !== 'complete'
          ? r.id === a.variantId
          : r.id === 'campaign' || s.completed.campaign
      )
      .map((r) => ({ id: r.id, label: r.label })),
    stages: [
      [
        'Visit Meyrin and control steering, RF and focusing',
        !!a?.measurements.focus?.at(-1)?.experiment.accepted,
      ],
      [
        'Travel to CMS and distinguish detector clues',
        !!a?.measurements.signals?.at(-1)?.experiment.accepted,
      ],
      [
        'Fit selected hits and compare recorded observers',
        !!a?.measurements.mass?.at(-1)?.experiment.accepted,
      ],
      ['Hold the cut fixed for opposite/same-charge populations', !!a?.report],
    ].map(([label, complete]) => ({ label, complete: done || complete })),
  };
}
