import {
  normalizeAcceleratorCareer,
  transitionAcceleratorCareer,
  acceleratorTarget,
  acceleratorInstrumentPose,
  acceleratorDisplayPath,
} from '../../app/js/campaign/accelerator-career.js';
import {
  calculateAcceleratorExperiment,
  compactAcceleratorExperiment,
} from '../../app/js/campaign/accelerator-experiments.js';
import { ACCELERATOR_SOURCE, acceleratorStudy } from '../../app/js/campaign/accelerator-studies.js';
import { cernStationReference } from '../../app/js/campaign/cern-study-sites.js';
import { CMS_STUDY_REFERENCE } from '../../app/js/campaign/cms-study-reference.js';
import { boostPair } from '../../app/vendor/collision-lab/models.mjs';

// Controlled model fixtures only; never a source-world gameplay checkpoint.
export function acceleratorHarness(
  initial,
  variantId = 'campaign',
  runId = 'collision-' + variantId + '-0001'
) {
  let state = normalizeAcceleratorCareer(initial),
    now = 1800000000000;
  const events = [],
    study = acceleratorStudy(variantId);
  function command(input, extra = {}) {
    now += 4000;
    const target = state.active ? acceleratorTarget(state.active) : 'orientation',
      r = cernStationReference(target),
      evidence = {
        environment: 'EARTH',
        travelMode: 'walk',
        liveGps: false,
        supported: true,
        siteId: r.siteId,
        sourceBuildingId: r.source.sourceBuildingId,
        floorId: r.floorId,
        accuracy: 'interpretive-training-visit',
        position: r.position,
        verticalDistance: 0,
        at: now,
        ...extra.evidence,
      };
    const result = transitionAcceleratorCareer(
      state,
      { ...input, revision: state.revision, evidence },
      now
    );
    state = result.state;
    if (result.event) events.push(result.event);
    return result;
  }
  function measurement(inputs) {
    const method = state.active.phase,
      experiment = compactAcceleratorExperiment(
        calculateAcceleratorExperiment(variantId, method, inputs)
      ),
      end = now + 4000,
      position = acceleratorDisplayPath(experiment).at(-1);
    return {
      experiment,
      pose: acceleratorInstrumentPose(method, experiment.inputs),
      effort: {
        runId: state.active.runId,
        habitatId: 'cern:' + method,
        method: 'accelerator-' + method,
        complete: true,
        interrupted: false,
        liveGps: false,
        supported: true,
        sensor: { aligned: true },
        targetSeconds: 3,
        activeSeconds: 3,
        startedAt: now + 500,
        endedAt: end,
      },
      display: { version: 1, method, samples: 121, position, expectedPosition: position },
      ...(['mass', 'population'].includes(method)
        ? {
            dataVerification: {
              bundleSha256: ACCELERATOR_SOURCE.dataSha256,
              sourceSha256: CMS_STUDY_REFERENCE.sourceSha256,
              rows: 100000,
              category: 'REAL_RECORDED_DATA',
            },
          }
        : {}),
    };
  }
  function measure(inputs) {
    return command({ type: 'measure', measurement: measurement(inputs) });
  }
  command({ type: 'accept', variantId, runId });
  return {
    get state() {
      return state;
    },
    events,
    command,
    measurement,
    measure,
    finish() {
      if (state.active.phase === 'complete') return state;
      command({ type: 'orientation', scope: 'virtual-interpretive-not-access-permit' });
      measure({
        fieldTesla:
          ((study.caseIndex ? -1 : 1) * study.momentumGeV) / (0.299792458 * study.radiusMeters),
      });
      measure({ phaseDegrees: (Math.acos((study.rfTargetMeV - 20) / 16) * 180) / Math.PI });
      measure({ k1: 1.4, k2: study.caseIndex ? 1.2 : 1.1, alternating: true });
      measure({ revealed: [1], choice: -1 });
      measure({ revealed: [0, 1, 2, 3], choice: study.signalIndex });
      measure({ selected: [...(study.caseIndex ? 'GACJEF' : 'BHFADJ')] });
      measure({ beta: 0 });
      const lab = boostPair(CMS_STUDY_REFERENCE.witnesses[variantId].muons, 0);
      measure({ beta: lab.momentum / lab.energy });
      measure({ cutGeV: study.cutGeV, charge: 'opposite' });
      measure({ cutGeV: study.cutGeV, charge: 'same' });
      command({ type: 'publish', limit: 'recorded-comparison-not-discovery-or-engineering' });
      return state;
    },
  };
}
