import { BUILTIN_DISCOVERY_CATALOGS } from './catalog.js?v=2';

const DISCOVERY_SCHEMA_VERSION = 1;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  const text = String(value || '');
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deterministicUnit(seed) {
  let value = fnv1a(seed) || 1;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 0x100000000;
}

function resolveDiscoverySlotPosition(bounds = {}, seed = '', options = {}) {
  const margin = Math.max(0.1, Math.min(0.4, Number(options.margin) || 0.18));
  const validate = typeof options.isPositionEligible === 'function' ? options.isPositionEligible : null;
  const attempts = Math.max(1, Math.min(32, Math.floor(Number(options.attempts) || 18)));
  const width = Number(bounds.maxX) - Number(bounds.minX);
  const depth = Number(bounds.maxZ) - Number(bounds.minZ);
  if (!(width > 0) || !(depth > 0)) return null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const suffix = attempt === 0 ? '' : `:candidate:${attempt}`;
    const xUnit = margin + deterministicUnit(`${seed}:x${suffix}`) * (1 - margin * 2);
    const zUnit = margin + deterministicUnit(`${seed}:z${suffix}`) * (1 - margin * 2);
    const position = Object.freeze({
      x: Number(bounds.minX) + width * xUnit,
      z: Number(bounds.minZ) + depth * zUnit
    });
    if (!validate || validate(position, { seed, attempt })) return position;
  }
  return null;
}

function activitySuitability(activity, cell) {
  const contexts = new Set(cell?.contexts || []);
  const excluded = (activity.exclusions || []).find((context) => contexts.has(context));
  if (excluded) return { band: 'ineligible', reasons: [`excluded:${excluded}`] };
  if (activity.universal || activity.contexts?.includes('any')) {
    return { band: contexts.has('sensitive') ? 'marginal' : 'suitable', reasons: ['universal-low-risk-action'] };
  }
  const matches = (activity.contexts || []).filter((context) => contexts.has(context));
  if (!matches.length) return { band: 'ineligible', reasons: ['no-compatible-context'] };
  return {
    band: matches.length >= 2 ? 'strong' : 'suitable',
    reasons: matches.map((context) => `context:${context}`)
  };
}

function compileGeographicEligibility(environment, catalogs = BUILTIN_DISCOVERY_CATALOGS) {
  if (environment?.type !== 'EnvironmentContextPublication') {
    throw new TypeError('Eligibility requires an EnvironmentContextPublication.');
  }
  const eligible = [];
  catalogs.activities.forEach((activity) => {
    const cellIds = [];
    const evidence = [];
    environment.cells.forEach((cell) => {
      const suitability = activitySuitability(activity, cell);
      if (suitability.band === 'ineligible') return;
      cellIds.push(cell.cellId);
      evidence.push({ cellId: cell.cellId, suitabilityBand: suitability.band, reasons: suitability.reasons });
    });
    if (cellIds.length) {
      eligible.push({
        catalogId: activity.id,
        domain: 'activity',
        cellIds,
        suitabilityBand: evidence.some((item) => item.suitabilityBand === 'strong') ? 'strong' : 'suitable',
        evidenceClass: 'habitat-plausible',
        evidence,
        sourceRefs: activity.sourceRefs,
        sensitiveLocationPolicy: 'generalize-and-never-assert-access'
      });
    }
  });
  return deepFreeze({
    type: 'GeographicEligibilityPublication', schemaVersion: DISCOVERY_SCHEMA_VERSION,
    requestId: environment.requestId, sequence: environment.sequence,
    worldIdentity: environment.worldIdentity, catalogBundleVersion: catalogs.version,
    eligible, diagnostics: { evaluatedCells: environment.cells.length, evaluatedActivities: catalogs.activities.length }
  });
}

function compileWorldInteractionPublication(environment, eligibility, catalogs = BUILTIN_DISCOVERY_CATALOGS) {
  if (eligibility?.type !== 'GeographicEligibilityPublication') {
    throw new TypeError('Interactions require a GeographicEligibilityPublication.');
  }
  const categories = eligibility.eligible.map((record) => {
    const activity = catalogs.activities.find((entry) => entry.id === record.catalogId);
    return {
      activityId: record.catalogId,
      label: activity?.label || record.catalogId,
      discipline: activity?.discipline || 'exploration',
      toolCapability: activity?.toolCapability || null,
      cellIds: record.cellIds,
      suitabilityBand: record.suitabilityBand,
      reasons: record.evidence.flatMap((item) => item.reasons),
      restrictions: ['virtual-activity-only', 'real-world-access-not-asserted']
    };
  });
  return deepFreeze({
    type: 'WorldInteractionPublication', schemaVersion: DISCOVERY_SCHEMA_VERSION,
    requestId: environment.requestId, sequence: environment.sequence,
    worldIdentity: environment.worldIdentity,
    eligibilityVersion: eligibility.catalogBundleVersion,
    categories,
    diagnostics: { actionCount: categories.length, generatedWithAdditionalProviderQueries: false }
  });
}

function findCell(environment, position = {}) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const cell of environment?.cells || []) {
    if (
      position.x >= cell.bounds.minX && position.x <= cell.bounds.maxX &&
      position.z >= cell.bounds.minZ && position.z <= cell.bounds.maxZ
    ) return cell;
    const dx = Number(position.x || 0) - cell.center.x;
    const dz = Number(position.z || 0) - cell.center.z;
    const distance = dx * dx + dz * dz;
    if (distance < nearestDistance) {
      nearest = cell;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function resolveContextActions(options = {}) {
  const environment = options.environment;
  const interaction = options.interaction;
  if (environment?.type !== 'EnvironmentContextPublication' || interaction?.type !== 'WorldInteractionPublication') return [];
  const cell = findCell(environment, options.position);
  if (!cell) return [];
  const actions = interaction.categories
    .filter((category) => category.cellIds.includes(cell.cellId))
    .map((category) => ({
      id: category.activityId,
      label: category.label,
      discipline: category.discipline,
      toolCapability: category.toolCapability,
      suitabilityBand: category.suitabilityBand,
      cellId: cell.cellId,
      reasons: category.reasons
    }));
  const priorities = new Map([['metal-detect', 0], ['inspect', 1], ['photograph', 2], ['survey', 3]]);
  return deepFreeze(actions.sort((a, b) =>
    (priorities.get(a.id) ?? 10) - (priorities.get(b.id) ?? 10) || a.label.localeCompare(b.label)
  ).slice(0, Math.max(1, Number(options.limit) || 4)));
}

function compatibleFinds(cell, catalogs) {
  const contexts = new Set(cell.contexts || []);
  const matches = catalogs.finds.filter((find) => find.contexts.some((context) => contexts.has(context)));
  return matches.length ? matches : catalogs.finds.filter((find) => find.id === 'weathered-can-tab');
}

function compileEncounterPlan(environment, eligibility, catalogs = BUILTIN_DISCOVERY_CATALOGS, options = {}) {
  if (environment?.type !== 'EnvironmentContextPublication' || eligibility?.type !== 'GeographicEligibilityPublication') {
    throw new TypeError('Encounter planning requires environment and eligibility publications.');
  }
  const detectorCells = new Set(eligibility.eligible.find((entry) => entry.catalogId === 'metal-detect')?.cellIds || []);
  const slots = [];
  // Opportunities should be common enough that walking a compatible area is
  // rewarding, while individual claims remain finite and progression-gated.
  const slotsPerCell = Math.max(1, Math.min(5, Number(options.slotsPerCell) || 3));
  environment.cells.forEach((cell) => {
    if (!detectorCells.has(cell.cellId)) return;
    const finds = compatibleFinds(cell, catalogs);
    for (let index = 0; index < slotsPerCell; index++) {
      const seed = `${environment.worldIdentity.id}|${catalogs.version}|metal-detect|${cell.cellId}|${index}`;
      const find = finds[Math.floor(deterministicUnit(`${seed}:find`) * finds.length) % finds.length];
      const depth = find.depthBands[Math.floor(deterministicUnit(`${seed}:depth`) * find.depthBands.length) % find.depthBands.length];
      const position = resolveDiscoverySlotPosition(cell.bounds, seed, {
        margin: 0.18,
        attempts: options.positionAttempts,
        isPositionEligible: options.isPositionEligible
      });
      if (!position) continue;
      const id = `encounter:${fnv1a(seed).toString(36)}`;
      slots.push({
        id, claimId: `claim:${environment.worldIdentity.id}:${catalogs.version}:${id}`,
        activityId: 'metal-detect', cellId: cell.cellId, catalogId: find.id,
        slotIndex: index,
        rarityBand: find.rarityBand || 'common',
        position,
        depthBand: depth,
        signalClass: find.signalClass,
        evidenceClass: 'guided-exploration-lead',
        supportingEvidence: ['habitat-plausible'],
        sourceRefs: find.sourceRefs
      });
    }
  });
  return deepFreeze({
    type: 'EncounterPlan', schemaVersion: DISCOVERY_SCHEMA_VERSION,
    requestId: environment.requestId, sequence: environment.sequence,
    worldIdentity: environment.worldIdentity, catalogBundleVersion: catalogs.version,
    slots, diagnostics: { logicalSlots: slots.length, slotsPerCompatibleCell: slotsPerCell, visibleSlots: 0, generatedWithAdditionalProviderQueries: false }
  });
}

function createDiscoveryPublication(options = {}) {
  const { snapshot, environment, eligibility, interaction, encounters, fieldActivities, wildlife } = options;
  if (snapshot?.type !== 'WorldSnapshot' || !Object.isFrozen(snapshot)) throw new TypeError('Discovery publication requires an immutable WorldSnapshot.');
  for (const value of [environment, eligibility, interaction, encounters, fieldActivities, wildlife].filter(Boolean)) {
    if (!value || value.requestId !== snapshot.requestId || value.sequence !== snapshot.sequence) {
      throw new Error('Discovery publication inputs must match the active WorldSnapshot.');
    }
  }
  return deepFreeze({
    type: 'WorldDiscoveryPublication', schemaVersion: DISCOVERY_SCHEMA_VERSION,
    requestId: snapshot.requestId, sequence: snapshot.sequence,
    worldIdentity: environment.worldIdentity,
    environment, eligibility, interaction, encounters, fieldActivities: fieldActivities || null, wildlife: wildlife || null,
    diagnostics: { generatedWithAdditionalProviderQueries: false }
  });
}

function createDiscoveryPublicationStore() {
  let current = null;
  return Object.freeze({
    publish(publication, active = {}) {
      if (publication?.type !== 'WorldDiscoveryPublication' || !Object.isFrozen(publication)) return { published: false, reason: 'invalid-publication' };
      if (active.requestId && publication.requestId !== active.requestId) return { published: false, reason: 'stale-request' };
      if (Number.isFinite(active.sequence) && publication.sequence !== active.sequence) return { published: false, reason: 'stale-sequence' };
      current = publication;
      return { published: true, publication };
    },
    clear() { current = null; },
    get: () => current
  });
}

export {
  DISCOVERY_SCHEMA_VERSION,
  compileEncounterPlan,
  compileGeographicEligibility,
  compileWorldInteractionPublication,
  createDiscoveryPublication,
  createDiscoveryPublicationStore,
  deterministicUnit,
  findCell,
  resolveDiscoverySlotPosition,
  resolveContextActions
};
