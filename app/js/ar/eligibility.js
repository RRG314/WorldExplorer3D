const AR_EXPERIENCE_TYPES = Object.freeze({
  COMPANION: 'companion',
  SPECIMEN: 'specimen',
  FIELD_CHALLENGE: 'field-challenge'
});

const TABLETOP_CATALOG_IDS = new Set([
  'granite-field-sample', 'quartz-vein-sample', 'shell-impression-cast',
  'sea-glass-fragment', 'common-plant-record', 'wetland-waterbird-clue',
  'woodland-track-clue', 'urban-nature-photo'
]);
const WATERFOWL_CONTEXTS = new Set(['wetland', 'riverbank', 'fresh-water', 'coast', 'beach']);

function cellAtPosition(environment, position = {}) {
  const x = Number(position.x || 0);
  const z = Number(position.z || 0);
  return environment?.cells?.find((cell) => x >= cell.bounds.minX && x <= cell.bounds.maxX && z >= cell.bounds.minZ && z <= cell.bounds.maxZ)
    || environment?.cells?.find((cell) => cell.cellId === 'cell:0:0')
    || environment?.cells?.[0]
    || null;
}

function movementLockout(context = {}) {
  const live = context.liveGpsSnapshot || {};
  const speedMps = Number(live.speedMps || 0);
  const travelMode = String(context.travelMode || 'walk');
  if (['car', 'plane', 'drone', 'boat'].includes(travelMode)) return { allowed: false, reason: 'stop-vehicle-first', speedMps };
  if (live.active && speedMps > 2.2) return { allowed: false, reason: 'moving-too-fast', speedMps };
  return { allowed: true, reason: 'stationary', speedMps };
}

function evaluateArEligibility(request = {}, context = {}) {
  const type = String(request.type || '');
  if (String(context.environmentName || 'EARTH') !== 'EARTH') {
    return Object.freeze({ allowed: false, reason: 'earth-only', type });
  }
  const movement = movementLockout(context);
  if (!movement.allowed) return Object.freeze({ ...movement, type });

  if (type === AR_EXPERIENCE_TYPES.COMPANION) {
    const companion = request.companion;
    const owned = !!companion?.instanceId && context.companions?.some?.((entry) => entry.instanceId === companion.instanceId);
    return Object.freeze({ allowed: owned, reason: owned ? 'owned-companion' : 'companion-not-owned', type });
  }
  if (type === AR_EXPERIENCE_TYPES.SPECIMEN) {
    const recorded = !!request.record?.catalogId;
    const modeled = TABLETOP_CATALOG_IDS.has(String(request.record?.catalogId || ''));
    return Object.freeze({ allowed: recorded && modeled, reason: !recorded ? 'record-required' : modeled ? 'tabletop-model-ready' : 'model-unavailable', type });
  }
  if (type === AR_EXPERIENCE_TYPES.FIELD_CHALLENGE) {
    const cell = cellAtPosition(context.environment, context.position);
    const contexts = cell?.contexts || [];
    const habitat = contexts.find((value) => WATERFOWL_CONTEXTS.has(value)) || '';
    return Object.freeze({
      allowed: !!habitat,
      reason: habitat ? 'waterfowl-habitat' : 'waterfowl-habitat-required',
      type,
      cellId: cell?.cellId || null,
      habitat,
      contexts: Object.freeze([...contexts])
    });
  }
  return Object.freeze({ allowed: false, reason: 'unknown-experience', type });
}

function getArEligibilityRegistrySnapshot() {
  return Object.freeze({
    types: Object.freeze(Object.values(AR_EXPERIENCE_TYPES)),
    tabletopCatalogIds: Object.freeze([...TABLETOP_CATALOG_IDS]),
    waterfowlContexts: Object.freeze([...WATERFOWL_CONTEXTS]),
    deferred: Object.freeze(['detector-sweep', 'portal-scale', 'multiplayer-spectator'])
  });
}

export { AR_EXPERIENCE_TYPES, TABLETOP_CATALOG_IDS, WATERFOWL_CONTEXTS, cellAtPosition, evaluateArEligibility, getArEligibilityRegistrySnapshot, movementLockout };
