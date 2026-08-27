const FIELD_EVIDENCE_SCHEMA_VERSION = 2;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const FIELD_EVIDENCE_CONTRACTS = deepFreeze({
  observation: {
    id: 'observation', recordKind: 'direct-observation', holdSeconds: 2.4,
    activityIds: ['nature-observe'], requiredFields: ['durationSeconds', 'distanceBand', 'habitatContexts'],
    actionPhrase: 'observe behavior and habitat context'
  },
  photography: {
    id: 'photography', recordKind: 'virtual-photograph', holdSeconds: 1.8,
    activityIds: ['photograph'], requiredFields: ['captureMode', 'distanceBand', 'lightBand'],
    actionPhrase: 'frame a virtual identification photograph'
  },
  'track-sign': {
    id: 'track-sign', recordKind: 'virtual-sign-record', holdSeconds: 3.2,
    activityIds: ['wildlife-track'], requiredFields: ['signClass', 'substrateContext', 'liveSignClaim'],
    actionPhrase: 'compare a virtual track or sign clue'
  },
  'insect-macro': {
    id: 'insect-macro', recordKind: 'virtual-macro-record', holdSeconds: 2.8,
    activityIds: ['insect-macro'], requiredFields: ['captureMode', 'scaleClass', 'handlingPolicy'],
    actionPhrase: 'hold a non-contact virtual macro frame'
  },
  habitat: {
    id: 'habitat', recordKind: 'habitat-transect', holdSeconds: 3.6,
    activityIds: ['habitat-survey'], requiredFields: ['habitatContexts', 'transectClass', 'accessClaim'],
    actionPhrase: 'record a modeled habitat transect'
  },
  geology: {
    id: 'geology', recordKind: 'geology-context-record', holdSeconds: 3.4,
    activityIds: ['geology-inspect'], requiredFields: ['substrateContext', 'samplePolicy', 'locationClaim'],
    actionPhrase: 'inspect a virtual geology context'
  },
  community: {
    id: 'community', recordKind: 'local-game-checklist', holdSeconds: 4,
    activityIds: ['community-survey'], requiredFields: ['checklistScope', 'submissionState', 'presenceClaim'],
    actionPhrase: 'complete a local game checklist'
  }
});

const CONTRACT_BY_ACTIVITY = new Map(Object.values(FIELD_EVIDENCE_CONTRACTS)
  .flatMap((contract) => contract.activityIds.map((activityId) => [activityId, contract])));

function resolveFieldEvidenceContract(activityId) {
  return CONTRACT_BY_ACTIVITY.get(String(activityId || '')) || null;
}

function distanceBand(distanceMeters) {
  const distance = Number(distanceMeters);
  if (!Number.isFinite(distance)) return 'unavailable';
  if (distance <= 5) return 'near';
  if (distance <= 15) return 'mid';
  return 'far';
}

function buildFieldEvidencePayload(contract, input = {}) {
  if (!contract?.id) return null;
  const contexts = [...new Set(input.slot?.contextBands || [])].sort();
  const base = {
    schemaVersion: FIELD_EVIDENCE_SCHEMA_VERSION,
    contractId: contract.id,
    recordKind: contract.recordKind,
    generatedGameRecord: true,
    livePresenceClaim: false,
    approachEvidence: {
      stableSurface: input.slot?.approachEvidence?.stableSurface === true,
      buildingClear: input.slot?.approachEvidence?.buildingClear === true,
      barrierEvidence: String(input.slot?.approachEvidence?.barrierEvidence || 'not-asserted'),
      accessEvidence: String(input.slot?.approachEvidence?.accessEvidence || 'unknown'),
      accessClaim: false
    },
    rewardEligibility: {
      personalVirtualRecord: input.authority?.rewardEligibility?.personalVirtualRecord !== false,
      competitive: false,
      locationReward: false,
      reason: String(input.authority?.rewardEligibility?.reason || 'virtual-field-record')
    }
  };
  const byContract = {
    observation: { durationSeconds: Number(Number(input.elapsed || 0).toFixed(1)), distanceBand: distanceBand(input.distanceMeters), habitatContexts: contexts },
    photography: { captureMode: 'virtual-field-camera', distanceBand: distanceBand(input.distanceMeters), lightBand: input.timeBand || 'modeled-local-time' },
    'track-sign': { signClass: 'virtual-clue', substrateContext: contexts, liveSignClaim: false },
    'insect-macro': { captureMode: 'virtual-non-contact', scaleClass: 'macro-reference', handlingPolicy: 'do-not-handle-real-organisms' },
    habitat: { habitatContexts: contexts, transectClass: 'modeled-game-cell', accessClaim: false },
    geology: { substrateContext: contexts, samplePolicy: 'virtual-only', locationClaim: 'context-plausible-not-field-confirmed' },
    community: { checklistScope: 'current-game-cell', submissionState: 'local-game-record-only', presenceClaim: false }
  };
  return deepFreeze({ ...base, ...(byContract[contract.id] || {}) });
}

export {
  FIELD_EVIDENCE_CONTRACTS,
  FIELD_EVIDENCE_SCHEMA_VERSION,
  buildFieldEvidencePayload,
  resolveFieldEvidenceContract
};
