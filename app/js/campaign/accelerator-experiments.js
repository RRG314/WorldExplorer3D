import {
  bend,
  accelerate,
  beamTransport,
  signatures,
  candidates,
  hitSample,
  fitTrack,
  circleY,
  boostPair,
} from '../../vendor/collision-lab/models.mjs';
import { invariantMass } from '../../vendor/collision-lab/science.mjs';
import { missions } from '../../vendor/collision-lab/missions.mjs';
import {
  ACCELERATOR_PROTOCOL,
  ACCELERATOR_SOURCE,
  acceleratorStudy,
} from './accelerator-studies.js';
import { CMS_STUDY_REFERENCE } from './cms-study-reference.js';
import { canonicalFieldRecord } from './field-study-contract.js';

const number = (v, lo, hi) => {
  if (!Number.isFinite(v) || v < lo || v > hi) throw Error('Use a bounded instrument setting.');
  return v;
};
const round = (v) =>
  typeof v === 'number'
    ? Number.isFinite(v)
      ? Number(v.toPrecision(12))
      : null
    : Array.isArray(v)
      ? v.map(round)
      : v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)]))
        : v;
function keys(input, allowed) {
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== 'object' ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    throw Error('This experiment contains unsupported settings.');
}
function indices(value, max) {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length)
    throw Error('Retain distinct chosen measurements.');
  return value;
}
export function calculateAcceleratorExperiment(studyId, method, input) {
  // Canonicalise before calculating, so a saved twelve-significant-digit
  // setting reproduces the same readings rather than a pre-rounding result.
  input = round(input);
  const study = acceleratorStudy(studyId);
  let readings,
    plot,
    accepted = false,
    category = 'EDUCATIONAL_MODEL';
  if (method === 'bend') {
    keys(input, ['fieldTesla']);
    const field = number(input.fieldTesla, -3, 3),
      r = bend(study.momentumGeV, field),
      error = Math.abs(r.radius - study.radiusMeters) / study.radiusMeters;
    readings = {
      fieldTesla: field,
      momentumGeV: study.momentumGeV,
      radiusMeters: r.radius,
      curvaturePerMeter: r.curvature,
      targetRadiusMeters: study.radiusMeters,
      relativeError: error,
    };
    plot = { points: r.points };
    accepted = (study.caseIndex ? r.curvature > 0 : r.curvature < 0) && error <= 0.05;
  } else if (method === 'rf') {
    keys(input, ['phaseDegrees']);
    const r = accelerate(number(input.phaseDegrees, 0, 180));
    readings = { energyMeV: r.energy, gainPerCavityMeV: r.gain, targetMeV: study.rfTargetMeV };
    plot = { energies: r.energies };
    accepted = Math.abs(r.energy - study.rfTargetMeV) <= 0.5;
  } else if (method === 'focus') {
    keys(input, ['k1', 'k2', 'alternating']);
    if (typeof input.alternating !== 'boolean') throw Error('Choose the quadrupole orientation.');
    const r = beamTransport(
        number(input.k1, 0, 2),
        number(input.k2, 0, 2),
        input.alternating,
        study.spread
      ),
      limit = study.caseIndex ? 0.0032 : 0.0025;
    readings = {
      rmsXMeters: r.x,
      rmsYMeters: r.y,
      lost: r.lost,
      total: r.total,
      spread: study.spread,
      limitXMeters: limit,
      limitYMeters: study.caseIndex ? 0.001 : limit,
    };
    plot = { history: r.history };
    accepted = r.lost === 0 && r.x <= limit && r.y <= readings.limitYMeters;
  } else if (method === 'signals') {
    keys(input, ['revealed', 'choice']);
    const revealed = indices(input.revealed, 4);
    if (
      revealed.some((i) => !Number.isInteger(i) || i < 0 || i > 3) ||
      !Number.isInteger(input.choice) ||
      input.choice < -1 ||
      input.choice >= signatures.length
    )
      throw Error('Choose existing detector readouts and an interpretation.');
    const signal = signatures[study.signalIndex].signal,
      possible = candidates(signal, revealed);
    readings = {
      opened: revealed.map((index) => ({ index, value: signal[index] })),
      possible,
      interpretation: input.choice < 0 ? null : signatures[input.choice].name,
    };
    plot = { signal: revealed.map((index) => ({ index, value: signal[index] })) };
    accepted = possible.length === 1 && input.choice === study.signalIndex;
  } else if (method === 'track') {
    keys(input, ['selected']);
    const ids = indices(input.selected, 6),
      all = hitSample(study.caseIndex);
    if (ids.length < 3 || ids.some((id) => !all.some((p) => p.id === id)))
      throw Error('Select three to six actual displayed hits.');
    const hits = all.filter((p) => ids.includes(p.id)),
      fit = fitTrack(hits);
    readings = {
      ...fit,
      residuals: hits.map((h) => ({ id: h.id, meters: h.y - circleY(fit.k, h.x) })),
    };
    plot = {
      hits: all,
      selected: hits,
      curve: Array.from({ length: 81 }, (_, i) => {
        const x = i / 40;
        return { x, y: circleY(fit.k, x) };
      }),
    };
    accepted = fit.count === 6 && fit.residual < 0.015 && fit.span > 1.4;
  } else if (method === 'mass') {
    keys(input, ['beta']);
    const event = CMS_STUDY_REFERENCE.witnesses[studyId],
      r = boostPair(event.muons, number(input.beta, 0, 0.999999));
    category = 'REAL_RECORDED_DATA';
    readings = {
      ...r,
      invariantMassGeV: invariantMass(...event.muons),
      eventId: event.id,
      sourceRow: event.row,
      sourceMassGeV: event.sourceMass,
      muons: event.muons,
      sourceRowValues: event.sourceRow,
    };
    plot = { event, energyGeV: r.energy, momentumGeV: r.momentum };
    accepted = r.mass > 0 && Math.abs(r.momentum) / r.mass < 0.03;
  } else if (method === 'population') {
    keys(input, ['cutGeV', 'charge']);
    if (input.cutGeV !== study.cutGeV || !['all', 'opposite', 'same'].includes(input.charge))
      throw Error('Keep this study’s identical momentum cut when changing the charge selection.');
    category = 'REAL_RECORDED_DATA';
    readings = {
      ...CMS_STUDY_REFERENCE.populations[study.cutGeV][input.charge],
      cutGeV: input.cutGeV,
      charge: input.charge,
    };
    plot = { bins: readings.bins };
    accepted = input.charge !== 'all';
  } else throw Error('Choose an available Collision Lab instrument.');
  const mission = missions.find((m) => m.id === (method === 'population' ? 'evidence' : method));
  return round({
    protocol: ACCELERATOR_PROTOCOL,
    studyId,
    method,
    category,
    source: ACCELERATOR_SOURCE,
    inputs: input,
    readings,
    accepted,
    limits: mission.model,
    referenceUrl: mission.source,
    plot,
  });
}
export function compactAcceleratorExperiment(result) {
  const { plot, dataVerification, ...record } = result;
  return record;
}
export function validateAcceleratorExperiment(studyId, method, record) {
  const expected = compactAcceleratorExperiment(
    calculateAcceleratorExperiment(studyId, method, record?.inputs)
  );
  if (canonicalFieldRecord(record) !== canonicalFieldRecord(expected))
    throw Error('The experiment no longer matches its original source, inputs and readings.');
  return expected;
}
