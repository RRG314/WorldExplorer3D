import {
  copyFieldRecord as copy,
  normalizeFieldStudy,
  fieldCoordinate,
  fieldDistance,
  validateFieldHistory,
} from './field-study-contract.js';
import { requireMarineVoyage as voyageValue, requireMarinePresence as presence } from './marine-study-contract.js';
import { COASTAL_SITES } from './coastal-departure.js';
export const OCEANOGRAPHY_PROTOCOL = Object.freeze({
  id: 'virtual-ctd-three-depths-v1',
  depths: Object.freeze([2, 4, 6]),
  minimumActiveSeconds: 6,
  parentApproachMeters: 20,
  depthToleranceMeters: 0.2,
  temperatureUncertaintyC: 0.2,
  salinityUncertainty: 0.1,
  sourceId: 'we3d-authored-water-column-v1',
});
export const OCEANOGRAPHY_STUDIES = Object.freeze({
  campaign: {
    label: 'Across the Water Column',
    question:
      'Does the same depth protocol resolve a difference between two virtual water columns?',
    target: 'habitat',
    result: 'temperature-contrast-with-depth',
    limit: 'two-simulated-profiles-not-a-regional-water-mass',
    profiles: {
      shelf: { temperature: [25, 24, 22], salinity: [34, 34, 34] },
      north: { temperature: [23, 23, 23], salinity: [34, 34, 34] },
    },
  },
  'mixed-water': {
    label: 'When the Profiles Overlap',
    question: 'Can a small difference be resolved at the declared instrument precision?',
    target: 'rock',
    result: 'not-resolved-by-this-protocol',
    limit: 'unresolved-does-not-prove-identical-water',
    profiles: {
      shelf: { temperature: [23, 23.05, 23], salinity: [34, 34.02, 34] },
      north: { temperature: [23.1, 23.08, 23.05], salinity: [34.05, 34.04, 34.03] },
    },
  },
  'freshwater-lens': {
    label: 'A Fresher Upper Layer',
    question: 'Does a fresher upper layer identify the source of that water?',
    target: 'case',
    result: 'fresher-upper-layer',
    limit: 'salinity-pattern-does-not-identify-a-river-source',
    profiles: {
      shelf: { temperature: [23, 23, 23], salinity: [31, 33, 34] },
      north: { temperature: [23, 23, 23], salinity: [34.2, 34.2, 34.2] },
    },
  },
});
export const OCEANOGRAPHY_SOURCES = Object.freeze([
  {
    url: 'https://origin.oceanexplorer.noaa.gov/technology/ctd/',
    truthType: 'ctd-method-reference',
  },
  {
    url: 'https://oceanobservatories.org/data-product/pracsal/',
    truthType: 'practical-salinity-unit-reference',
  },
]);
export const OCEANOGRAPHY_STATIONS = COASTAL_SITES;
export function normalizeOceanographyCareer(value) {
  const s = normalizeFieldStudy(value);
  return s.schemaVersion === 1 ? { records: {}, ...s } : s;
}
export function virtualWaterColumnReading(variantId, stationId, depthMeters) {
  const profile = OCEANOGRAPHY_STUDIES[variantId]?.profiles[stationId];
  if (!profile || !Number.isFinite(depthMeters) || depthMeters < 0 || depthMeters > 8)
    throw Error('The authored reference profile does not cover this cast.');
  const d = OCEANOGRAPHY_PROTOCOL.depths,
    index = Math.min(1, Math.max(0, depthMeters < d[1] ? 0 : 1)),
    t = Math.max(0, Math.min(1, (depthMeters - d[index]) / (d[index + 1] - d[index]))),
    interpolate = (values) =>
      Number((values[index] + (values[index + 1] - values[index]) * t).toFixed(3));
  return {
    temperatureC: interpolate(profile.temperature),
    practicalSalinity: interpolate(profile.salinity),
  };
}
const point = (p) => p && ['x', 'y', 'z'].every((key) => Number.isFinite(p[key]));
const eventId = (run, revision) => `event:research:oceanography:${run}:${revision}`;
function castValue(active, c, e, now) {
  const protocol = OCEANOGRAPHY_PROTOCOL,
    station = COASTAL_SITES[active.stationIndex];
  if (
    !c ||
    c.protocolId !== protocol.id ||
    c.stationId !== station.id ||
    c.runId !== active.runId ||
    c.voyageId !== active.voyage.id ||
    c.truthType !== 'authored-water-column-simulation' ||
    c.sourceId !== `${protocol.sourceId}:${active.variantId}:${station.id}` ||
    c.method !== 'virtual-ctd-downcast' ||
    c.units?.depth !== 'm' ||
    c.units?.temperature !== 'degC' ||
    c.units?.practicalSalinity !== 'unitless' ||
    !fieldCoordinate(c.position) ||
    fieldDistance(c.position, station) > 25 ||
    fieldDistance(c.position, e.position) > 2 ||
    !Number.isFinite(c.startedAt) ||
    c.startedAt <= 0 ||
    !Number.isFinite(c.completedAt) ||
    c.completedAt < c.startedAt ||
    c.completedAt > now ||
    !Number.isFinite(c.activeSeconds) ||
    c.activeSeconds < protocol.minimumActiveSeconds ||
    c.activeSeconds > (c.completedAt - c.startedAt) / 1000 + 0.1 ||
    !Number.isFinite(c.maximumDriftMeters) ||
    c.maximumDriftMeters > 2 ||
    c.maximumDriftMeters < 0 ||
    !Array.isArray(c.samples) ||
    c.samples.length !== 3
  )
    throw Error('Complete the same three-depth downcast while moored at the planned station.');
  let previous = c.startedAt;
  for (let i = 0; i < 3; i++) {
    const row = c.samples[i],
      depth = protocol.depths[i];
    if (
      !row ||
      !Number.isFinite(row.depthMeters) ||
      Math.abs(row.depthMeters - depth) > protocol.depthToleranceMeters ||
      !Number.isFinite(row.at) ||
      row.at <= previous ||
      row.at > c.completedAt
    )
      throw Error('Retain the three ordered samples at their actual supported instrument depths.');
    const expected = virtualWaterColumnReading(active.variantId, station.id, row.depthMeters);
    if (
      row.temperatureC !== expected.temperatureC ||
      row.practicalSalinity !== expected.practicalSalinity
    )
      throw Error('Keep the labeled reference-profile readings with the measured game depths.');
    previous = row.at;
  }
  return copy(c);
}
export function oceanographyComparison(active) {
  const a = active.casts?.shelf?.samples,
    b = active.casts?.north?.samples;
  if (!a || !b) return null;
  const temperatureSpanA =
      Math.max(...a.map((r) => r.temperatureC)) - Math.min(...a.map((r) => r.temperatureC)),
    temperatureSpanB =
      Math.max(...b.map((r) => r.temperatureC)) - Math.min(...b.map((r) => r.temperatureC)),
    salinitySpanA =
      Math.max(...a.map((r) => r.practicalSalinity)) -
      Math.min(...a.map((r) => r.practicalSalinity)),
    salinitySpanB =
      Math.max(...b.map((r) => r.practicalSalinity)) -
      Math.min(...b.map((r) => r.practicalSalinity)),
    temperatureContrast = Math.max(
      ...a.map((r, i) => Math.abs(r.temperatureC - b[i].temperatureC))
    ),
    salinityContrast = Math.max(
      ...a.map((r, i) => Math.abs(r.practicalSalinity - b[i].practicalSalinity))
    );
  let result = 'not-resolved-by-this-protocol';
  if (salinitySpanA > 0.4 && b[0].practicalSalinity - a[0].practicalSalinity > 0.4)
    result = 'fresher-upper-layer';
  else if (Math.max(temperatureSpanA, temperatureSpanB) > 0.4 || temperatureContrast > 0.4)
    result = 'temperature-contrast-with-depth';
  else if (salinitySpanB > 0.4 || salinityContrast > 0.4) result = 'other-resolved-contrast';
  return {
    temperatureSpanA,
    temperatureSpanB,
    salinitySpanA,
    salinitySpanB,
    temperatureContrast,
    salinityContrast,
    result,
  };
}
export function transitionOceanographyCareer(value, command, now = Date.now()) {
  const state = normalizeOceanographyCareer(value);
  if (state.schemaVersion !== 1)
    throw Error('This saved ocean survey needs a newer version of World Explorer.');
  if (command?.revision !== state.revision)
    throw Error('This voyage study changed in another tab. Reopen it before continuing.');
  if (!Number.isFinite(now) || now <= 0) throw Error('The survey clock is unavailable.');
  let active = state.active ? copy(state.active) : null,
    visit = false;
  const completed = { ...state.completed },
    records = { ...state.records };
  if (command.type === 'accept') {
    const variantId = command.variantId || 'campaign',
      study = OCEANOGRAPHY_STUDIES[variantId];
    if (!study || (variantId !== 'campaign' && !completed.campaign))
      throw Error('Complete Across the Water Column before choosing a repeat survey.');
    if (active && active.phase !== 'complete') {
      if (active.variantId !== variantId) throw Error('Continue the current vessel survey first.');
      return { state, event: null, samples: [] };
    }
    if (records[variantId]) {
      active = copy(records[variantId]);
      visit = true;
    } else {
      if (!/^[a-zA-Z0-9-]{8,64}$/.test(command.runId || ''))
        throw Error('The vessel study could not start.');
      const v = voyageValue(command.evidence?.voyage);
      const stationDepths = command.stationDepths;
      if (
        !Array.isArray(stationDepths) ||
        stationDepths.length !== 2 ||
        COASTAL_SITES.some((station, i) => {
          const d = stationDepths[i];
          return (
            d?.stationId !== station.id ||
            !fieldCoordinate(d) ||
            fieldDistance(d, station) > 1 ||
            d.truthType !== 'modeled' ||
            !Number.isFinite(d.depthMeters) ||
            d.depthMeters < 8 ||
            !d.sourceId ||
            typeof d.fetchedAt !== 'string' ||
            !d.fetchedAt ||
            d.navigationSafe !== false
          );
        })
      )
        throw Error(
          'Retain both admitted station chart depths with their model source and archived sample date.'
        );
      active = {
        runId: command.runId,
        variantId,
        phase: 'casts',
        acceptedAt: now,
        voyage: v,
        plan: {
          protocolId: OCEANOGRAPHY_PROTOCOL.id,
          stationIds: COASTAL_SITES.map((s) => s.id),
          maximumDepthMeters: 6,
          stationDepths: copy(stationDepths),
        },
        stationIndex: 0,
        casts: {},
        pings: [],
        selected: null,
        observation: null,
        returned: null,
        report: null,
        completedAt: 0,
      };
      presence(active, command.evidence, now, { station: 'chart' });
      if (
        command.protocolId !== OCEANOGRAPHY_PROTOCOL.id ||
        command.stationOrder?.join(':') !== active.plan.stationIds.join(':')
      )
        throw Error('Plan both charted stations with one depth protocol before departure.');
    }
  } else {
    if (!active || active.phase === 'complete')
      throw Error('Choose a new survey or review the saved transect.');
    const study = OCEANOGRAPHY_STUDIES[active.variantId];
    if (!study) throw Error('This saved survey requires a newer version.');
    if (command.type === 'cast' && active.phase === 'casts') {
      active.voyage = presence(active, command.evidence, now, { station: 'sub' });
      const cast = castValue(active, command.cast, command.evidence, now);
      active.casts[cast.stationId] = cast;
      active.stationIndex++;
      if (active.stationIndex === 2) active.phase = 'mapping';
    } else if (command.type === 'ping' && active.phase === 'mapping') {
      active.voyage = presence(active, command.evidence, now, { underwater: true });
      const r = command.return,
        target = r?.target;
      if (
        !r ||
        r.truthType !== 'authored-geometry' ||
        r.method !== 'geometry-sonar' ||
        r.voyageId !== active.voyage.id ||
        !['habitat', 'rock', 'case'].includes(target?.id) ||
        active.pings.some((p) => p.target.id === target.id) ||
        !point(target) ||
        !Number.isFinite(target.radius) ||
        target.radius <= 0 ||
        target.radius > 12 ||
        !Number.isFinite(r.distanceMeters) ||
        r.distanceMeters < 0 ||
        r.distanceMeters > 80 ||
        r.lineClear !== true ||
        r.inCone !== true ||
        !Number.isFinite(r.speedMetersPerSecond) ||
        Math.abs(r.speedMetersPerSecond) > 0.6 ||
        !Number.isFinite(r.uncertaintyMeters) ||
        r.uncertaintyMeters < 1 ||
        !Number.isFinite(r.sampledBottomY) ||
        !Number.isFinite(r.at) ||
        Math.abs(r.at - now) > 2000 ||
        !fieldCoordinate(r.position) ||
        fieldDistance(r.position, command.evidence.position) > 0.5 ||
        !point(r.studyPosition) ||
        !point(r.samplePosition) ||
        !Number.isFinite(r.metersPerUnit) ||
        r.metersPerUnit <= 0
      )
        throw Error(
          'Chart a real geometry return from the active sonar cone, retaining its uncertainty.'
        );
      const distance =
        Math.hypot(
          target.x - command.evidence.localPosition.x,
          target.y - command.evidence.localPosition.y,
          target.z - command.evidence.localPosition.z
        ) * r.metersPerUnit;
      if (Math.abs(distance - r.distanceMeters) > 0.01)
        throw Error('The sonar return does not match the measured craft position.');
      if (active.pings.length) {
        const previous = active.pings.at(-1);
        if (
          Math.hypot(
            r.studyPosition.x - previous.studyPosition.x,
            r.studyPosition.z - previous.studyPosition.z
          ) *
            r.metersPerUnit <
          5
        )
          throw Error('Map a corridor by moving at least five metres before the next return.');
      }
      active.pings.push(copy(r));
      if (active.pings.length === 3) active.phase = 'select-target';
    } else if (command.type === 'select-target' && active.phase === 'select-target') {
      active.voyage = presence(active, command.evidence, now, { underwater: true });
      if (
        !active.pings.some((p) => p.target.id === command.targetId) ||
        command.uncertainty !== 'return-shape-not-identification'
      )
        throw Error(
          'Choose this survey’s mapped contact and retain the uncertainty of its sonar shape.'
        );
      active.selected = command.targetId;
      active.phase = 'inspection';
    } else if (command.type === 'inspect' && active.phase === 'inspection') {
      active.voyage = presence(active, command.evidence, now, { underwater: true });
      const o = command.observation;
      if (
        !o ||
        o.targetId !== active.selected ||
        o.method !== 'direct-submersible-view' ||
        o.truthType !== 'authored-geometry' ||
        o.visible !== true ||
        o.lineClear !== true ||
        !Number.isFinite(o.distanceMeters) ||
        o.distanceMeters < 0 ||
        o.distanceMeters > 6 ||
        !Number.isFinite(o.at) ||
        Math.abs(o.at - now) > 2000 ||
        !point(o.studyPosition) ||
        o.form !==
          {
            habitat: 'branching-colonies-on-rock',
            rock: 'unbroken-mineral-surface',
            case: 'straight-edges-and-latches',
          }[active.selected]
      )
        throw Error(
          'Approach the mapped feature in the submarine and record its visible structure.'
        );
      active.observation = copy(o);
      active.phase = 'return';
    } else if (command.type === 'return-approach' && active.phase === 'return') {
      active.voyage = presence(active, command.evidence, now, { underwater: true });
      const r = command.return;
      if (
        !r ||
        r.shipId !== active.voyage.ship.transportEntityId ||
        r.subId !== active.voyage.subId ||
        !Number.isFinite(r.distanceMeters) ||
        r.distanceMeters < 0 ||
        r.distanceMeters > OCEANOGRAPHY_PROTOCOL.parentApproachMeters ||
        !Number.isFinite(r.depthMeters) ||
        r.depthMeters < 1 ||
        r.depthMeters > 15 ||
        !Number.isFinite(r.at) ||
        Math.abs(r.at - now) > 2000
      )
        throw Error('Navigate back alongside the same parent vessel before recovering aboard.');
      active.returned = copy(r);
      active.phase = 'report';
    } else if (command.type === 'report' && active.phase === 'report') {
      active.voyage = presence(active, command.evidence, now, { station: 'lab' });
      const comparison = oceanographyComparison(active);
      if (
        command.result !== comparison.result ||
        command.limitation !== study.limit ||
        command.geometryContext !== 'virtual-feature-not-a-regional-cause' ||
        command.followUp !== 'repeat-matched-profiles-other-time'
      )
        throw Error(
          'Explain the measured profiles and observed feature without inventing a regional cause or real measurement.'
        );
      active.report = {
        comparison,
        result: command.result,
        limitation: command.limitation,
        geometryContext: command.geometryContext,
        followUp: command.followUp,
        conclusion: `The paired virtual profiles show ${comparison.result.replaceAll('-', ' ')}. The directly inspected ${active.selected} is local game geometry; it does not establish the cause of either water profile. Repeat matched profiles at another time before extending this comparison.`,
        at: now,
      };
      active.completedAt = now;
      active.phase = 'complete';
      completed[active.variantId] = eventId(active.runId, state.revision + 1);
      records[active.variantId] = copy(active);
    } else throw Error('That action does not match the current vessel survey step.');
  }
  const revision = state.revision + 1,
    finished = command.type === 'report' && active.phase === 'complete',
    study = OCEANOGRAPHY_STUDIES[active.variantId],
    action = copy(command),
    report = finished
      ? {
          schemaVersion: 1,
          title: study.label,
          truthType: 'authored-water-column-and-geometry',
          runId: active.runId,
          voyageId: active.voyage.id,
          shipId: active.voyage.ship.transportEntityId,
          protocol: OCEANOGRAPHY_PROTOCOL,
          plan: active.plan,
          casts: active.casts,
          pings: active.pings,
          selected: active.selected,
          observation: active.observation,
          returned: active.returned,
          ...active.report,
        }
      : null;
  const event = {
    eventId: eventId(active.runId, revision),
    eventType: finished ? 'campaign-completed' : 'campaign-progress',
    sourceSystem: 'research-careers',
    sourceId: `oceanography:${active.variantId}:${visit ? 'review' : command.type}`,
    activityId: command.type === 'inspect' ? 'dive-survey' : 'sonar-survey',
    family: 'water-survey',
    pathId: 'field',
    name: `${study.label} · ${finished ? 'annotated transect' : visit ? 'saved survey reviewed' : 'survey record'}`,
    detail: finished
      ? active.report.conclusion
      : 'Authored training profiles and game geometry; regional modeled charts and live observations remain distinct.',
    occurredAt: now,
    environment: command.evidence?.environment || 'EARTH',
    regionId: 'coral-shelf-authored-study',
    regionLabel: 'Coral Shelf authored study',
    locationSnapshot: { ...active.voyage.site, name: 'Research vessel' },
    points: 0,
    firstCompletion: finished && !state.completed[active.variantId],
    projections: {
      journal: !visit && ['cast', 'ping', 'inspect', 'report'].includes(command.type),
      profile: !visit && ['cast', 'ping', 'inspect', 'report'].includes(command.type),
      place: false,
    },
    metadata: {
      careerId: 'oceanography',
      runId: active.runId,
      variantId: active.variantId,
      phase: active.phase,
      truthType: 'authored-water-column-and-geometry',
      action,
      ...(report ? { oceanographyReport: report } : {}),
      sourceRefs: copy(OCEANOGRAPHY_SOURCES),
    },
  };
  return { state: { ...state, revision, active, completed, records }, event, samples: [] };
}
export function oceanographyCareerSummary(value, { variantId = 'campaign' } = {}) {
  const s = normalizeOceanographyCareer(value),
    study = OCEANOGRAPHY_STUDIES[variantId] || OCEANOGRAPHY_STUDIES.campaign;
  if (s.schemaVersion !== 1)
    return {
      title: study.label,
      summary: 'This saved ocean career needs a newer version.',
      choices: [],
      stages: [],
    };
  const active = s.active?.variantId === variantId ? s.active : s.records[variantId] || null,
    index =
      active?.phase === 'complete'
        ? 5
        : { casts: 1, mapping: 2, 'select-target': 2, inspection: 3, return: 3, report: 4 }[
            active?.phase
          ] || 0;
  return {
    title: study.label,
    summary: study.question,
    resume: !!active && active.phase !== 'complete',
    ...(s.records[variantId] ? { actionLabel: 'Review saved transect' } : {}),
    choices: Object.entries(OCEANOGRAPHY_STUDIES)
      .filter(([id]) =>
        s.active && s.active.phase !== 'complete'
          ? id === s.active.variantId
          : id === 'campaign' || s.completed.campaign
      )
      .map(([id, row]) => ({ id, label: row.label })),
    stages: [
      'Read the ship chart and plan two matched stations',
      'Run the same three-depth protocol at both stations',
      'Map a geometry corridor and retain uncertainty',
      'Inspect one feature and navigate back to this vessel',
      'Compare profiles at the wet lab and save the transect',
    ].map((label, i) => ({ label, complete: index > i })),
  };
}
export function oceanographyCareerBadge(value) {
  const s = normalizeOceanographyCareer(value);
  return s.schemaVersion === 1 && s.completed.campaign
    ? {
        id: 'paired-ocean-survey',
        label: 'Ocean Survey',
        detail:
          'Compared matched virtual profiles, mapped a corridor and returned to the same research vessel.',
        eventId: s.completed.campaign,
      }
    : null;
}
export const validateOceanographyCareerBackup = (value, events, items) =>
  validateFieldHistory(
    'oceanography',
    value,
    events,
    items,
    transitionOceanographyCareer,
    normalizeOceanographyCareer
  );
