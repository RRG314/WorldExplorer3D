const BACKPACK_SCHEMA_VERSION = 2;
const HOTBAR_SLOT_COUNT = 6;

function text(value, fallback = '') {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function positiveInteger(value, fallback = 1) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeVerbs(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => text(entry)).filter(Boolean))];
}

function normalizeDefinition(definition = {}) {
  const catalogId = text(definition.catalogId || definition.id);
  if (!catalogId) throw new TypeError('Backpack catalog definitions require a catalogId.');
  return Object.freeze({
    ...definition,
    id: catalogId,
    catalogId,
    label: text(definition.label || definition.name, catalogId),
    category: text(definition.category, 'object'),
    icon: text(definition.icon, 'ITEM'),
    verbs: Object.freeze(normalizeVerbs(definition.verbs)),
    stackLimit: positiveInteger(definition.stackLimit, 1)
  });
}

function normalizeItem(item = {}, definition = null) {
  const catalogId = text(item.catalogId || item.id || definition?.catalogId);
  if (!catalogId) throw new TypeError('Backpack items require a catalogId.');
  const instanceId = text(item.instanceId, `catalog:${catalogId}`);
  return {
    instanceId,
    catalogId,
    quantity: positiveInteger(item.quantity, 1),
    condition: item.condition == null ? null : Math.max(0, Math.min(1, Number(item.condition) || 0)),
    authority: text(item.authority, 'anonymous-local'),
    provenance: text(item.provenance || item.source, 'starter-grant'),
    sourceEventId: text(item.sourceEventId || item.eventId),
    tradeable: item.tradeable === true,
    acquiredAt: Number(item.acquiredAt || item.collectedAt) || 0,
    metadata: item.metadata && typeof item.metadata === 'object' ? { ...item.metadata } : {}
  };
}

function createBackpackModel(options = {}) {
  const definitions = new Map();
  const items = new Map();
  const aliases = new Map();
  const hotbar = Array.from({ length: HOTBAR_SLOT_COUNT }, () => null);
  const listeners = new Set();
  let equippedInstanceId = null;
  let revision = 0;
  let duplicateEventMerges = 0;

  function registerDefinitions(next = []) {
    for (const entry of next) {
      const definition = normalizeDefinition(entry);
      definitions.set(definition.catalogId, definition);
    }
    return definitions.size;
  }

  function resolveItem(identity) {
    const id = text(identity);
    if (!id) return null;
    if (items.has(id)) return items.get(id);
    if (aliases.has(id) && items.has(aliases.get(id))) return items.get(aliases.get(id));
    return [...items.values()].find((item) => item.catalogId === id) || null;
  }

  function definitionForItem(item) {
    return item ? definitions.get(item.catalogId) || normalizeDefinition({
      catalogId: item.catalogId,
      label: item.metadata?.label || item.catalogId,
      category: item.metadata?.category || 'object',
      icon: item.metadata?.icon || 'ITEM',
      verbs: item.metadata?.verbs || ['inspect']
    }) : null;
  }

  function notify(reason, detail = {}) {
    revision += 1;
    const change = Object.freeze({ reason, revision, ...detail });
    for (const listener of listeners) listener(change);
    return change;
  }

  function upsertItem(next, settings = {}) {
    const candidateDefinition = settings.definition || next?.definition;
    if (candidateDefinition) registerDefinitions([candidateDefinition]);
    const definition = definitions.get(text(next?.catalogId || next?.id || candidateDefinition?.catalogId || candidateDefinition?.id));
    const item = normalizeItem(next, definition);
    const sameInstance = items.get(item.instanceId);
    const sameEvent = item.sourceEventId ? [...items.values()].find((entry) =>
      entry.sourceEventId === item.sourceEventId && entry.catalogId === item.catalogId
    ) : null;
    const existing = sameInstance || sameEvent;
    const canonicalInstanceId = existing?.instanceId || item.instanceId;
    if (sameEvent && sameEvent.instanceId !== item.instanceId) {
      aliases.set(item.instanceId, sameEvent.instanceId);
      duplicateEventMerges += 1;
    }
    const canonicalItem = { ...item, instanceId: canonicalInstanceId };
    items.set(canonicalInstanceId, existing
      ? { ...existing, ...canonicalItem, metadata: { ...existing.metadata, ...canonicalItem.metadata } }
      : canonicalItem);
    if (settings.hotbarSlot != null) assignHotbar(settings.hotbarSlot, canonicalInstanceId, { silent: true });
    if (settings.equip === true || !equippedInstanceId) equippedInstanceId = canonicalInstanceId;
    if (!settings.silent) notify(
      sameEvent && !sameInstance ? 'duplicate-event-merged' : existing ? 'item-updated' : 'item-added',
      { instanceId: canonicalInstanceId, catalogId: item.catalogId, sourceEventId: item.sourceEventId }
    );
    return canonicalInstanceId;
  }

  function assignHotbar(slot, identity, settings = {}) {
    const index = Number(slot) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= HOTBAR_SLOT_COUNT) return false;
    const item = identity == null ? null : resolveItem(identity);
    if (identity != null && !item) return false;
    const next = item?.instanceId || null;
    if (hotbar[index] === next) return true;
    hotbar[index] = next;
    if (!settings.silent) notify('hotbar-changed', { slot: index + 1, instanceId: next });
    return true;
  }

  function equip(identity, settings = {}) {
    const item = resolveItem(identity);
    if (!item) return false;
    const definition = definitionForItem(item);
    if (!definition.verbs.includes('equip') && definition.category !== 'unarmed') return false;
    if (equippedInstanceId === item.instanceId) return true;
    equippedInstanceId = item.instanceId;
    if (!settings.silent) notify('equipped-changed', { instanceId: item.instanceId, catalogId: item.catalogId });
    return true;
  }

  function equipSlot(slot) {
    const instanceId = hotbar[Number(slot) - 1];
    return instanceId ? equip(instanceId) : false;
  }

  function snapshot() {
    const records = [...items.values()].map((item) => {
      const definition = definitionForItem(item);
      const hotbarIndex = hotbar.indexOf(item.instanceId);
      return Object.freeze({
        ...definition,
        ...item,
        id: item.catalogId,
        hotbarSlot: hotbarIndex >= 0 ? hotbarIndex + 1 : null,
        equipped: item.instanceId === equippedInstanceId
      });
    });
    records.sort((left, right) => {
      const leftSlot = left.hotbarSlot || 99;
      const rightSlot = right.hotbarSlot || 99;
      return leftSlot - rightSlot || left.category.localeCompare(right.category) || left.label.localeCompare(right.label);
    });
    return Object.freeze({
      type: 'BackpackSnapshot',
      schemaVersion: BACKPACK_SCHEMA_VERSION,
      revision,
      duplicateEventMerges,
      equippedInstanceId,
      equippedCatalogId: resolveItem(equippedInstanceId)?.catalogId || null,
      hotbar: Object.freeze(hotbar.slice()),
      items: Object.freeze(records)
    });
  }

  function exportState() {
    return {
      schemaVersion: BACKPACK_SCHEMA_VERSION,
      revision,
      equippedInstanceId,
      hotbar: hotbar.slice(),
      items: [...items.values()].map((item) => ({ ...item, metadata: { ...item.metadata } }))
    };
  }

  registerDefinitions(options.definitions || []);
  for (const item of options.items || []) upsertItem(item, { silent: true });
  (options.hotbar || []).slice(0, HOTBAR_SLOT_COUNT).forEach((identity, index) => assignHotbar(index + 1, identity, { silent: true }));
  const requestedEquipped = options.equippedInstanceId || options.equippedCatalogId;
  if (requestedEquipped) equip(requestedEquipped, { silent: true });

  return Object.freeze({
    type: 'BackpackModel',
    assignHotbar,
    definition(id) { return definitions.get(text(id)) || null; },
    equip,
    equipSlot,
    equipped() { return definitionForItem(resolveItem(equippedInstanceId)); },
    exportState,
    has(identity) { return !!resolveItem(identity); },
    item(identity) {
      const item = resolveItem(identity);
      return item ? { ...item, metadata: { ...item.metadata } } : null;
    },
    registerDefinitions,
    snapshot,
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    touch(reason = 'contents-changed', detail = {}) { return notify(reason, detail); },
    upsertItem
  });
}

export {
  BACKPACK_SCHEMA_VERSION,
  HOTBAR_SLOT_COUNT,
  createBackpackModel,
  normalizeDefinition as normalizeBackpackDefinition,
  normalizeItem as normalizeBackpackItem
};
