import { ACTIVITY_CATALOG, FIELD_DISCOVERY_CATALOG } from './catalog.js?v=2';
import { resolveRegionalEcologyPack, selectRegionalTaxa } from './ecology/regional-packs.js?v=2';
import { buildFieldEvidencePayload, resolveFieldEvidenceContract } from './evidence-contracts.js?v=2';
import { deterministicUnit, findCell, resolveDiscoverySlotPosition } from './model.js?v=1';
import { fieldProgress, prioritizeProgressiveSlots } from './pacing.js?v=2';

const NON_FIELD_ACTIVITIES = new Set(['metal-detect', 'fish']);
const FIELD_OBSERVATION_RADIUS = 24;
const FIELD_OBSERVATION_BREAK_RADIUS = 31;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function compileFieldActivityPlan(environment, eligibility, options = {}) {
  if (environment?.type !== 'EnvironmentContextPublication' || eligibility?.type !== 'GeographicEligibilityPublication') {
    throw new TypeError('Field activity planning requires environment and eligibility publications.');
  }
  const slots = [];
  const slotsPerCell = Math.max(1, Math.min(3, Number(options.slotsPerCell) || 2));
  const regionalPack = options.regionalPack === undefined
    ? resolveRegionalEcologyPack(environment.worldIdentity?.location)
    : options.regionalPack;
  eligibility.eligible.forEach((eligible) => {
    if (NON_FIELD_ACTIVITIES.has(eligible.catalogId)) return;
    const activity = ACTIVITY_CATALOG.find((entry) => entry.id === eligible.catalogId);
    if (!activity) return;
    eligible.cellIds.forEach((cellId) => {
      const cell = environment.cells.find((entry) => entry.cellId === cellId);
      if (!cell) return;
      const contextSet = new Set(cell.contexts || []);
      const eligibleRegionalIds = new Set(selectRegionalTaxa(regionalPack, {
        activityId: activity.id,
        contexts: cell.contexts,
        month: environment.temporal?.month,
        timeBand: environment.temporal?.localTimeBand
      }).map((entry) => entry.id));
      const candidates = FIELD_DISCOVERY_CATALOG.filter((entry) =>
        entry.activityIds.includes(activity.id) &&
        (!entry.regionalPackId || (entry.regionalPackId === regionalPack?.id && eligibleRegionalIds.has(entry.id))) &&
        (entry.contexts.includes('any') || entry.contexts.some((context) => contextSet.has(context)))
      );
      if (!candidates.length) return;
      const reviewedRegionalCandidates = candidates.filter((entry) => eligibleRegionalIds.has(entry.id));
      const selectionPool = reviewedRegionalCandidates.length ? reviewedRegionalCandidates : candidates;
      for (let slotIndex = 0; slotIndex < slotsPerCell; slotIndex += 1) {
        const seed = `${environment.worldIdentity.id}|${eligibility.catalogBundleVersion}|${activity.id}|${cellId}|${slotIndex}`;
        const discovery = selectionPool[Math.floor(deterministicUnit(`${seed}:discovery`) * selectionPool.length) % selectionPool.length];
        const position = resolveDiscoverySlotPosition(cell.bounds, seed, {
          margin: 0.24,
          attempts: options.positionAttempts,
          isPositionEligible: options.isPositionEligible
        });
        if (!position) continue;
        const slotId = `field:${activity.id}:${cellId}:${slotIndex}`;
        const approachEvidenceBase = typeof options.resolveApproachEvidence === 'function'
          ? options.resolveApproachEvidence(position)
          : {
              stableSurface: true,
              buildingClear: true,
              barrierEvidence: 'not-asserted',
              accessEvidence: 'unknown',
              accessClaim: false,
              guidance: 'Stay on a permitted public route and follow local signs.'
            };
        const approachEvidence = { ...approachEvidenceBase, targetId: slotId };
        const evidenceContract = resolveFieldEvidenceContract(activity.id);
        slots.push({
          id: slotId,
          claimId: `claim:${environment.worldIdentity.id}:${eligibility.catalogBundleVersion}:field:${activity.id}:${cellId}:${slotIndex}`,
          activityId: activity.id,
          activityLabel: activity.label,
          discipline: activity.discipline,
          toolCapability: activity.toolCapability,
          evidenceContract,
          contextBands: [...contextSet].sort(),
          timeBand: environment.temporal?.localTimeBand || 'day',
          cellId,
          slotIndex,
          catalogId: discovery.id,
          regionalPackId: eligibleRegionalIds.has(discovery.id) ? regionalPack?.id || null : null,
          regionalPackVersion: eligibleRegionalIds.has(discovery.id) ? regionalPack?.version || null : null,
          rarityBand: discovery.rarityBand || 'common',
          position,
          evidenceClass: 'guided-field-lead',
          approachEvidence,
          supportingEvidence: entryEvidence(discovery, environment.temporal, regionalPack),
          sourceRefs: discovery.sourceRefs
        });
      }
    });
  });
  return deepFreeze({
    type: 'FieldActivityPlan', schemaVersion: 2,
    requestId: environment.requestId, sequence: environment.sequence,
    worldIdentity: environment.worldIdentity,
    catalogBundleVersion: eligibility.catalogBundleVersion,
    slots,
    diagnostics: {
      logicalSlots: slots.length,
      slotsPerCompatibleCell: slotsPerCell,
      generatedWithAdditionalProviderQueries: false,
      regionalEcologyPackId: regionalPack?.id || null,
      regionalEcologyPackVersion: regionalPack?.version || null,
      regionalTaxonCount: regionalPack?.taxa?.length || 0
    }
  });
}

function entryEvidence(discovery, temporal = {}, regionalPack = null) {
  if (!regionalPack || discovery?.regionalPackId !== regionalPack.id) return ['habitat-plausible'];
  return [
    'habitat-plausible',
    `regional-pack:${regionalPack.id}@${regionalPack.version}`,
    `season-month:${Math.max(1, Math.min(12, Number(temporal.month) || 1))}`,
    'no-live-presence-claim'
  ];
}

function createFieldActivitySession(options = {}) {
  const plan = options.plan;
  if (plan?.type !== 'FieldActivityPlan') throw new TypeError('Field activity session requires a FieldActivityPlan.');
  const claimedIds = options.claimedIds instanceof Set ? options.claimedIds : new Set(options.claimedIds || []);
  const observedCatalogIds = options.observedCatalogIds instanceof Set ? options.observedCatalogIds : new Set(options.observedCatalogIds || []);
  let progress = options.progress || fieldProgress({ collectionCount: options.collectionCount || 0 });
  let state = { phase: 'idle', activityId: null, slot: null, elapsed: 0, message: 'Choose an available field activity.', error: '', result: null, authority: null };

  const distanceToSlot = (position, slot) => slot ? Math.hypot(Number(position?.x || 0) - slot.position.x, Number(position?.z || 0) - slot.position.z) : null;
  const bearingToSlot = (position, slot) => slot ? (Math.atan2(slot.position.x - Number(position?.x || 0), slot.position.z - Number(position?.z || 0)) * 180 / Math.PI + 360) % 360 : null;

  function authorityFor(slot, context = {}) {
    if (!slot || typeof context.evaluateFieldTarget !== 'function') return null;
    return context.evaluateFieldTarget(slot.position, slot.approachEvidence);
  }

  function beginWithSlot(activityId, slot, position, context = {}) {
    if (!slot) return false;
    const authority = authorityFor(slot, context);
    const distance = authority?.distanceMeters ?? distanceToSlot(position, slot);
    const phase = authority ? authority.eligible ? 'observing' : 'seeking' : distance <= FIELD_OBSERVATION_RADIUS ? 'observing' : 'seeking';
    const actionPhrase = slot.evidenceContract?.actionPhrase || `${slot.activityLabel.toLowerCase()} examines this virtual survey point`;
    const message = authority?.message || (phase === 'observing'
      ? `Hold position to ${actionPhrase}…`
      : `A plausible survey point is ${Math.ceil(distance)} m away. Follow the bearing while the panel is minimized.`);
    state = { phase, activityId, slot, elapsed: 0, message, error: '', result: null, authority };
    return true;
  }

  function begin(activityId, environment, position, context = {}) {
    const cell = findCell(environment, position);
    let localSlots = plan.slots.filter((entry) => entry.activityId === activityId && entry.cellId === cell?.cellId);
    if (context.preferNearby === true) {
      localSlots = plan.slots.filter((entry) => entry.activityId === activityId)
        .sort((left, right) => distanceToSlot(position, left) - distanceToSlot(position, right));
    }
    const slot = prioritizeProgressiveSlots(
      localSlots,
      { claimedIds, observedCatalogIds, progress }
    )[0];
    if (!slot) {
      const rankLocked = localSlots.some((entry) => !claimedIds.has(entry.claimId));
      state = { phase: 'complete', activityId, slot: null, elapsed: 0, message: rankLocked ? `This cell has a follow-up opportunity at a higher field rank. Explore another cell or build ${progress.rankLabel.toLowerCase()} records.` : 'This survey cell is documented for this activity. Walk into another cell to continue.', error: '', result: null, authority: null };
      return false;
    }
    return beginWithSlot(activityId, slot, position, context);
  }

  function beginSlot(slotId, position, context = {}) {
    const slot = plan.slots.find((entry) => entry.id === slotId);
    if (!slot || claimedIds.has(slot.claimId)) return false;
    const available = prioritizeProgressiveSlots([slot], { claimedIds, observedCatalogIds, progress })[0];
    return beginWithSlot(slot.activityId, available, position, context);
  }

  function update(dt, position = {}, context = {}) {
    if (!['seeking', 'observing'].includes(state.phase)) return snapshot(position);
    const authority = authorityFor(state.slot, context);
    const distance = authority?.distanceMeters ?? distanceToSlot(position, state.slot);
    state.authority = authority;
    if (state.phase === 'seeking') {
      if (authority ? authority.eligible : distance <= FIELD_OBSERVATION_RADIUS) {
        state.phase = 'observing';
        state.elapsed = 0;
        state.message = `Survey point reached. Hold position to ${state.slot.evidenceContract?.actionPhrase || state.slot.activityLabel.toLowerCase()}…`;
      } else if (authority?.message) {
        state.message = authority.message;
      }
      return snapshot(position);
    }
    if (authority ? !authority.eligible : distance > FIELD_OBSERVATION_BREAK_RADIUS) {
      state.phase = 'seeking';
      state.elapsed = 0;
      state.message = authority?.message || 'The survey point moved outside observation range. Follow the bearing to resume.';
      return snapshot(position);
    }
    state.elapsed += Math.max(0, Number(dt) || 0);
    if (state.elapsed >= Number(state.slot.evidenceContract?.holdSeconds || 1.8)) {
      const discovery = FIELD_DISCOVERY_CATALOG.find((entry) => entry.id === state.slot.catalogId);
      state.phase = 'revealed';
      state.message = `${discovery?.names?.common || state.slot.catalogId} documented as a guided field record.`;
    }
    return snapshot(position);
  }

  async function record(profileStore, context = {}) {
    if (state.phase !== 'revealed' || !state.slot) return false;
    const authority = authorityFor(state.slot, context);
    if (authority && !authority.eligible) {
      state.authority = authority;
      state.error = authority.message || 'Return to the field stop with an eligible Live GPS fix before recording.';
      return false;
    }
    state.error = '';
    const discovery = FIELD_DISCOVERY_CATALOG.find((entry) => entry.id === state.slot.catalogId);
    const distance = state.authority?.distanceMeters ?? distanceToSlot(context.localPosition || {}, state.slot);
    const evidencePayload = buildFieldEvidencePayload(state.slot.evidenceContract, {
      slot: state.slot,
      elapsed: state.elapsed,
      distanceMeters: distance,
      timeBand: state.slot.timeBand,
      authority: authority || state.authority
    });
    const record = {
      instanceId: `item:${state.slot.id}`,
      claimId: state.slot.claimId,
      catalogId: state.slot.catalogId,
      name: discovery?.names?.common || state.slot.catalogId,
      description: discovery?.description || '',
      family: discovery?.family || 'field-record',
      regionalPackId: state.slot.regionalPackId || null,
      regionalPackVersion: state.slot.regionalPackVersion || null,
      stableTaxonId: discovery?.stableTaxonId || null,
      taxonGroup: state.slot.regionalPackId ? String(discovery?.family || '').replace(/-taxon$/, '') : null,
      rarityBand: discovery?.rarityBand || 'common',
      qualityBand: discovery?.qualityBand || 'observed',
      discipline: state.slot.discipline,
      activityId: state.slot.activityId,
      toolId: context.toolId || null,
      regionId: plan.worldIdentity.id,
      regionLabel: context.regionLabel || 'Current region',
      locationKey: context.locationKey || '',
      locationSnapshot: context.locationSnapshot || null,
      worldIdentity: plan.worldIdentity.id,
      environment: context.environment || 'EARTH',
      localPosition: context.localPosition || state.slot.position,
      evidenceClass: state.slot.evidenceClass,
      evidenceContractId: state.slot.evidenceContract?.id || null,
      evidencePayload,
      supportingEvidence: state.slot.supportingEvidence,
      sourceRefs: state.slot.sourceRefs,
      collectedAt: Date.now()
    };
    const collection = ['specimen', 'collectible'].includes(String(discovery?.tradePolicy || ''));
    const result = typeof profileStore.recordObservation === 'function'
      ? await profileStore.recordObservation(record, { collection })
      : await profileStore.collect(record);
    if (!result.recorded && !result.collected) {
      state.error = result.reason === 'already-claimed' ? 'This field record was already saved.' : 'The field record could not be saved.';
      return false;
    }
    claimedIds.add(state.slot.claimId);
    observedCatalogIds.add(state.slot.catalogId);
    progress = fieldProgress(result.profile || { collectionCount: progress.records + 1 });
    state.phase = 'recorded';
    state.result = result;
    const destination = result.collected ? 'Journal, Field Guide, and Backpack' : 'Journal and Field Guide';
    state.message = `${result.event?.name || result.item?.name || record.name} saved to your ${destination}.`;
    return true;
  }

  function leave() {
    state.phase = 'left';
    state.message = 'Observation left unrecorded. The stable encounter remains available.';
    return true;
  }

  function reset() {
    state = { phase: 'idle', activityId: null, slot: null, elapsed: 0, message: 'Choose an available field activity.', error: '', result: null, authority: null };
  }

  function snapshot(position = {}) {
    const discovery = state.slot ? FIELD_DISCOVERY_CATALOG.find((entry) => entry.id === state.slot.catalogId) : null;
    const distance = state.authority?.distanceMeters ?? distanceToSlot(position, state.slot);
    const bearing = bearingToSlot(position, state.slot);
    return Object.freeze({
      active: state.phase !== 'idle', phase: state.phase, activityId: state.activityId,
      activityLabel: ACTIVITY_CATALOG.find((entry) => entry.id === state.activityId)?.label || '',
      message: state.message, error: state.error,
      targetId: state.slot?.id || null,
      targetCatalogId: state.slot?.catalogId || null,
      targetName: ['revealed', 'recorded'].includes(state.phase) ? discovery?.names?.common || state.slot?.catalogId : null,
      evidenceClass: state.slot?.evidenceClass || null,
      evidenceContract: state.slot?.evidenceContract ? {
        id: state.slot.evidenceContract.id,
        recordKind: state.slot.evidenceContract.recordKind,
        requiredFields: state.slot.evidenceContract.requiredFields,
        holdSeconds: state.slot.evidenceContract.holdSeconds
      } : null,
      distanceMeters: Number.isFinite(distance) ? Number(distance.toFixed(1)) : null,
      bearingDegrees: Number.isFinite(bearing) ? Number(bearing.toFixed(1)) : null,
      claimState: state.slot ? claimedIds.has(state.slot.claimId) ? 'claimed' : 'unclaimed' : null,
      movementAuthority: state.authority?.authority || 'manual-direct',
      proximityState: state.authority?.state || null,
      interactionEligible: state.authority ? state.authority.eligible === true : Number.isFinite(distance) && distance <= FIELD_OBSERVATION_RADIUS,
      pauseReason: state.authority?.pauseReason || null,
      approachEvidence: state.slot?.approachEvidence || null,
      rewardEligibility: state.authority?.rewardEligibility || null,
      collectionResult: state.result ? {
        recorded: state.result.recorded !== false,
        collected: state.result.collected === true,
        instanceId: state.result.item?.instanceId || null,
        eventId: state.result.event?.eventId || null,
        event: state.result.event || null,
        progress: state.result.progress || null
      } : null,
      fieldProgress: progress
    });
  }

  return Object.freeze({ begin, beginSlot, leave, record, reset, snapshot, update });
}

export { FIELD_OBSERVATION_RADIUS, compileFieldActivityPlan, createFieldActivitySession };
