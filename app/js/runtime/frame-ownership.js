const frameOwners = new Map();

function normalizeState(value) {
  if (typeof value === 'boolean') {
    return { active: value, scheduled: value, suspended: false };
  }
  const state = value && typeof value === 'object' ? value : {};
  const active = state.active === true;
  return {
    ...state,
    active,
    scheduled: state.scheduled === true || active,
    suspended: state.suspended === true
  };
}

function registerFrameOwner(definition = {}) {
  const id = String(definition.id || '').trim();
  if (!id) throw new TypeError('Frame owners require a stable id.');
  if (frameOwners.has(id)) throw new Error(`Frame owner already registered: ${id}`);
  if (typeof definition.getState !== 'function') {
    throw new TypeError(`Frame owner ${id} requires getState().`);
  }

  const record = Object.freeze({
    id,
    label: String(definition.label || id),
    kind: String(definition.kind || 'animation'),
    exclusiveGroup: String(definition.exclusiveGroup || '').trim() || null,
    getState: definition.getState,
    getMetadata: typeof definition.getMetadata === 'function' ? definition.getMetadata : null
  });
  frameOwners.set(id, record);

  let registered = true;
  return () => {
    if (!registered) return false;
    registered = false;
    return frameOwners.delete(id);
  };
}

function ownerSnapshot(record) {
  try {
    const state = normalizeState(record.getState());
    return {
      id: record.id,
      label: record.label,
      kind: record.kind,
      exclusiveGroup: record.exclusiveGroup,
      ...state,
      metadata: record.getMetadata?.() || null,
      snapshotError: ''
    };
  } catch (error) {
    return {
      id: record.id,
      label: record.label,
      kind: record.kind,
      exclusiveGroup: record.exclusiveGroup,
      active: false,
      scheduled: false,
      suspended: false,
      metadata: null,
      snapshotError: error instanceof Error ? error.message : String(error)
    };
  }
}

function getFrameOwnershipSnapshot() {
  const owners = [...frameOwners.values()].map(ownerSnapshot);
  const activeByGroup = new Map();
  for (const owner of owners) {
    if (!owner.active || !owner.exclusiveGroup) continue;
    const group = activeByGroup.get(owner.exclusiveGroup) || [];
    group.push(owner.id);
    activeByGroup.set(owner.exclusiveGroup, group);
  }
  const conflicts = [...activeByGroup.entries()]
    .filter(([, ownerIds]) => ownerIds.length > 1)
    .map(([exclusiveGroup, ownerIds]) => ({ exclusiveGroup, ownerIds }));
  const snapshotErrors = owners
    .filter((owner) => owner.snapshotError)
    .map((owner) => ({ id: owner.id, message: owner.snapshotError }));

  return {
    ok: conflicts.length === 0 && snapshotErrors.length === 0,
    registered: owners.length,
    active: owners.filter((owner) => owner.active).map((owner) => owner.id),
    scheduled: owners.filter((owner) => owner.scheduled).map((owner) => owner.id),
    conflicts,
    snapshotErrors,
    owners
  };
}

export { getFrameOwnershipSnapshot, registerFrameOwner };
