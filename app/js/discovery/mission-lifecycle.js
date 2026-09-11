const MISSION_LIFECYCLE_SCHEMA_VERSION = 1;

const MINIMUM_5_0_MISSION_SCOPE = Object.freeze({
  authority: 'field-mission-lifecycle-v1',
  retainedPrograms: Object.freeze(['field-today', 'weekly-expedition', 'seasonal-regional-survey']),
  excludedSystems: Object.freeze(['crafting', 'currency', 'reward-grade-economy']),
  progressSource: 'versioned-explorer-events',
  rewardClass: 'personal-recognition-only',
  competitiveRewards: false
});

function text(value, maximum = 160) {
  return String(value ?? '').trim().slice(0, maximum);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function uniqueText(values = [], maximum = 160) {
  return [...new Set(values.map((value) => text(value, maximum)).filter(Boolean))];
}

function normalizeMissionProgressEvent(input = {}) {
  const sourceId = text(input.eventId || input.claimId, 260);
  if (!sourceId) return null;
  const occurredAt = Math.max(1, Number(input.occurredAt || input.collectedAt) || 1);
  return deepFreeze({
    type: 'MissionProgressEvent',
    schemaVersion: MISSION_LIFECYCLE_SCHEMA_VERSION,
    eventId: sourceId.startsWith('event:') ? sourceId : `event:${sourceId}`,
    occurredAt,
    eventType: text(input.eventType || 'discovery-recorded', 80),
    activityId: text(input.activityId, 80),
    evidenceContractId: text(input.evidenceContractId, 80),
    catalogId: text(input.catalogId, 160),
    regionId: text(input.regionId || input.worldIdentity || 'local-region', 180),
    firstIdentification:
      input.firstIdentification === true || text(input.progress?.reason, 80) === 'new-identification',
    movementSource: text(input.movementSource || input.evidencePayload?.movementSource || 'manual_direct', 80),
    multiplayerContribution: input.multiplayerContribution === true,
    sourceSchemaVersion: Math.max(1, Number(input.schemaVersion) || 1)
  });
}

function dedupeMissionProgressEvents(events = []) {
  const byId = new Map();
  let rejected = 0;
  let duplicates = 0;
  for (const input of Array.isArray(events) ? events : []) {
    const event = normalizeMissionProgressEvent(input);
    if (!event) {
      rejected += 1;
      continue;
    }
    if (byId.has(event.eventId)) {
      duplicates += 1;
      continue;
    }
    byId.set(event.eventId, event);
  }
  const accepted = [...byId.values()].sort((left, right) =>
    left.occurredAt - right.occurredAt || left.eventId.localeCompare(right.eventId));
  return deepFreeze({
    type: 'MissionProgressEventSet',
    schemaVersion: MISSION_LIFECYCLE_SCHEMA_VERSION,
    accepted,
    acceptedCount: accepted.length,
    duplicateCount: duplicates,
    rejectedCount: rejected
  });
}

function normalizeObjective(input = {}) {
  const id = text(input.id, 120);
  if (!id) throw new TypeError('Mission objectives require a stable ID.');
  const target = Math.max(1, Number(input.target) || 1);
  const current = Math.max(0, Number(input.current) || 0);
  const contributingEventIds = uniqueText(input.contributingEventIds, 260);
  return deepFreeze({
    id,
    label: text(input.label || id, 180),
    detail: text(input.detail, 280),
    progressEventTypes: uniqueText(input.progressEventTypes, 80),
    current,
    target,
    complete: current >= target,
    progressPercent: Math.min(100, Math.round(current / target * 100)),
    contributingEventIds
  });
}

function createMissionProgramSnapshot(options = {}) {
  const id = text(options.id, 180);
  if (!id) throw new TypeError('Mission programs require a stable ID.');
  const programVersion = Math.max(1, Number(options.programVersion) || 1);
  const objectives = (Array.isArray(options.objectives) ? options.objectives : []).map(normalizeObjective);
  if (!objectives.length) throw new TypeError(`Mission program ${id} requires at least one objective.`);
  if (new Set(objectives.map((entry) => entry.id)).size !== objectives.length) {
    throw new TypeError(`Mission program ${id} contains duplicate objective IDs.`);
  }

  const eligibilityReasons = uniqueText(options.eligibility?.reasons, 180);
  const eligible = options.eligibility?.eligible !== false && eligibilityReasons.length === 0;
  const cancellationReason = text(options.cancellation?.reason, 180);
  const complete = eligible && objectives.every((entry) => entry.complete);
  const started = objectives.some((entry) => entry.current > 0);
  const phase = cancellationReason
    ? 'cancelled'
    : !eligible
      ? 'ineligible'
      : complete
        ? 'completed'
        : started
          ? 'in-progress'
          : 'available';
  const eventSet = dedupeMissionProgressEvents(options.progressEvents);
  const rewardIdempotencyKey = `mission:${id}:v${programVersion}:complete`;

  return deepFreeze({
    type: 'MissionProgramSnapshot',
    schemaVersion: MISSION_LIFECYCLE_SCHEMA_VERSION,
    id,
    programType: text(options.programType || 'field-program', 80),
    programVersion,
    label: text(options.label || id, 180),
    phase,
    resetPolicy: text(options.resetPolicy || 'explicit-replay-no-permanent-loss', 120),
    eligibility: {
      eligible,
      reasons: eligibilityReasons,
      acceptedMovementSources: uniqueText(options.eligibility?.acceptedMovementSources, 80)
    },
    objectives,
    completion: {
      complete,
      policy: 'all-objectives',
      idempotencyKey: rewardIdempotencyKey
    },
    cancellation: {
      allowed: true,
      reason: cancellationReason || null,
      losesPermanentProgress: false,
      resumable: options.cancellation?.resumable !== false
    },
    reward: {
      type: 'personal-recognition-only',
      available: complete,
      idempotencyKey: rewardIdempotencyKey,
      authority: 'derived-personal-progress',
      competitive: false,
      currency: false,
      craftingIngredient: false,
      pointsGranted: 0
    },
    replayPolicy: {
      mode: text(options.replayPolicy?.mode || 'period-rollover', 80),
      repeatRewards: false,
      missedPeriodPenalty: false
    },
    locationScope: {
      kind: text(options.locationScope?.kind || 'region', 80),
      regionId: text(options.locationScope?.regionId, 180),
      regionalPackId: text(options.locationScope?.regionalPackId, 160)
    },
    multiplayer: {
      mode: text(options.multiplayer?.mode || 'personal-progress', 80),
      sharedCompletion: options.multiplayer?.sharedCompletion === true,
      contributionRequiresOwnEvidence: options.multiplayer?.contributionRequiresOwnEvidence !== false
    },
    window: {
      key: text(options.window?.key || id, 180),
      startsAt: Number.isFinite(Number(options.window?.startsAt)) ? Number(options.window.startsAt) : null,
      endsAt: Number.isFinite(Number(options.window?.endsAt)) ? Number(options.window.endsAt) : null
    },
    progressEvents: {
      acceptedCount: eventSet.acceptedCount,
      duplicateCount: eventSet.duplicateCount,
      rejectedCount: eventSet.rejectedCount,
      eventIds: eventSet.accepted.map((entry) => entry.eventId)
    },
    versioning: {
      migration: 'reproject-from-versioned-explorer-events',
      rollback: 'restore-previous-program-definition-and-reproject',
      destructiveMigration: false
    }
  });
}

export {
  MINIMUM_5_0_MISSION_SCOPE,
  MISSION_LIFECYCLE_SCHEMA_VERSION,
  createMissionProgramSnapshot,
  dedupeMissionProgressEvents,
  normalizeMissionProgressEvent
};
