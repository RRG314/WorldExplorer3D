import { createBackpackModel } from '../player/backpack-model.js?v=3';

const EQUIPMENT_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'hands', label: 'Hands', category: 'unarmed', slot: 1, range: 2.4, force: 12, cooldownMs: 520, actionLabel: 'Shove', icon: 'HAND', verbs: ['equip', 'use'] }),
  Object.freeze({ id: 'flashlight', label: 'Field light', category: 'utility', slot: 2, range: 18, force: 0, cooldownMs: 180, actionLabel: 'Toggle light', icon: 'LIGHT', verbs: ['equip', 'use'] }),
  // Keep the catalog id for save compatibility; the explorer-facing name no
  // longer implies that the player is law enforcement.
  Object.freeze({ id: 'baton', label: 'Explorer staff', category: 'melee', slot: 3, range: 2.7, force: 28, cooldownMs: 620, actionLabel: 'Swing', icon: 'STAFF', verbs: ['equip', 'use'] }),
  Object.freeze({ id: 'pulse-sidearm', label: 'Pulse sidearm', category: 'sidearm', slot: 4, range: 42, force: 34, cooldownMs: 310, magazineSize: 12, reserve: 36, projectileKind: 'pulse', projectileSpeed: 58, actionLabel: 'Fire', icon: 'PULSE', verbs: ['equip', 'use'] }),
  Object.freeze({ id: 'concussion-charge', label: 'Concussion charge', category: 'explosive', slot: 5, range: 19, force: 78, blastRadius: 7.5, cooldownMs: 1100, quantity: 4, projectileKind: 'thrown-charge', projectileSpeed: 15, fuseSeconds: 1.15, actionLabel: 'Throw', icon: 'CHARGE', verbs: ['equip', 'use'] }),
  Object.freeze({ id: 'parachute', label: 'Explorer parachute', category: 'mobility', slot: 6, range: 0, force: 0, cooldownMs: 500, actionLabel: 'Deploy', icon: 'CHUTE', verbs: ['equip', 'use'] }),
  Object.freeze({ id: 'laser-gun', label: 'Laser gun', category: 'sidearm', slot: null, range: 58, force: 42, cooldownMs: 230, magazineSize: 20, reserve: 80, projectileKind: 'laser', projectileSpeed: 92, actionLabel: 'Fire', icon: 'LASER', verbs: ['equip', 'use'] }),
  Object.freeze({ id: 'paintball-gun', label: 'Paintball gun', category: 'sidearm', slot: null, range: 34, force: 9, cooldownMs: 145, magazineSize: 30, reserve: 120, projectileKind: 'paintball', projectileSpeed: 38, projectileGravity: 4.8, actionLabel: 'Fire', icon: 'PAINT', verbs: ['equip', 'use'] }),
  Object.freeze({ id: 'compact-sidearm', label: 'Compact sidearm', category: 'sidearm', slot: null, starter: false, range: 38, force: 27, cooldownMs: 360, magazineSize: 10, reserve: 0, projectileKind: 'pulse', projectileSpeed: 55, actionLabel: 'Fire', icon: 'COMPACT', verbs: ['equip', 'use'] }),
  Object.freeze({ id: 'responder-sidearm', label: 'Response sidearm', category: 'sidearm', slot: null, starter: false, range: 44, force: 32, cooldownMs: 280, magazineSize: 15, reserve: 0, projectileKind: 'pulse', projectileSpeed: 66, actionLabel: 'Fire', icon: 'RESPONSE', verbs: ['equip', 'use'] })
]);

function definitionFor(id, backpack = null) {
  return backpack?.definition?.(id) || EQUIPMENT_DEFINITIONS.find((definition) => definition.id === String(id || '')) || null;
}

function starterItem(definition) {
  return {
    instanceId: `starter:${definition.id}`,
    catalogId: definition.id,
    quantity: 1,
    authority: 'anonymous-local',
    provenance: 'starter-grant'
  };
}

function createEquipmentInventory(options = {}) {
  const acquired = new Set(Array.isArray(options.acquired)
    ? options.acquired.filter((id) => definitionFor(id))
    : EQUIPMENT_DEFINITIONS.filter((definition) => definition.starter !== false).map((definition) => definition.id));
  acquired.add('hands');
  const persisted = options.persistedState && typeof options.persistedState === 'object' ? options.persistedState : null;
  const backpack = options.backpack || createBackpackModel({
    definitions: EQUIPMENT_DEFINITIONS,
    items: persisted?.items?.length ? persisted.items : EQUIPMENT_DEFINITIONS.filter((definition) => acquired.has(definition.id)).map(starterItem),
    hotbar: persisted?.hotbar?.length ? persisted.hotbar : EQUIPMENT_DEFINITIONS
      .filter((definition) => Number.isInteger(definition.slot))
      .map((definition) => `starter:${definition.id}`),
    equippedInstanceId: persisted?.equippedInstanceId,
    equippedCatalogId: persisted?.equippedCatalogId || options.equippedId || 'hands'
  });
  backpack.registerDefinitions(EQUIPMENT_DEFINITIONS);
  for (const definition of EQUIPMENT_DEFINITIONS.filter((entry) => acquired.has(entry.id))) {
    if (!backpack.has(definition.id)) backpack.upsertItem(starterItem(definition), { silent: true });
    if (Number.isInteger(definition.slot) && !backpack.snapshot().hotbar[definition.slot - 1]) {
      backpack.assignHotbar(definition.slot, definition.id, { silent: true });
    }
  }
  if (!backpack.equipped()) backpack.equip('hands', { silent: true });

  const ammo = new Map();
  const quantities = new Map();
  const persistedAmmo = persisted?.ammo && typeof persisted.ammo === 'object' ? persisted.ammo : {};
  const persistedQuantities = persisted?.quantities && typeof persisted.quantities === 'object' ? persisted.quantities : {};
  EQUIPMENT_DEFINITIONS.forEach((definition) => {
    if (definition.magazineSize) ammo.set(definition.id, {
      magazine: Number(options.ammo?.[definition.id]?.magazine ?? persistedAmmo?.[definition.id]?.magazine ?? definition.magazineSize),
      reserve: Number(options.ammo?.[definition.id]?.reserve ?? persistedAmmo?.[definition.id]?.reserve ?? definition.reserve)
    });
    if (definition.quantity) quantities.set(definition.id, Number(options.quantities?.[definition.id] ?? persistedQuantities?.[definition.id] ?? definition.quantity));
  });
  let lastUseAt = -Infinity;
  let flashlightEnabled = false;

  const snapshot = () => {
    const base = backpack.snapshot();
    return Object.freeze({
      ...base,
      equippedId: base.equippedCatalogId,
      flashlightEnabled,
      items: Object.freeze(base.items.map((item) => {
        const rounds = ammo.get(item.catalogId);
        return Object.freeze({
          ...item,
          slot: item.hotbarSlot,
          magazine: rounds?.magazine ?? null,
          reserve: rounds?.reserve ?? null,
          quantity: quantities.get(item.catalogId) ?? item.quantity ?? null
        });
      }))
    });
  };

  function equippedDefinition() {
    return definitionFor(backpack.snapshot().equippedCatalogId, backpack);
  }

  return Object.freeze({
    type: 'CharacterBackpackEquipmentAdapter',
    backpack,
    snapshot,
    exportState: () => ({
      ...backpack.exportState(),
      ammo: Object.fromEntries([...ammo.entries()].map(([id, rounds]) => [id, { ...rounds }])),
      quantities: Object.fromEntries(quantities)
    }),
    subscribe: (listener) => backpack.subscribe(listener),
    registerDefinitions(definitions) { return backpack.registerDefinitions(definitions); },
    upsertItem(item, settings = {}) { return backpack.upsertItem(item, settings); },
    upsertItems(entries = [], settings = {}) {
      return entries.map((entry) => backpack.upsertItem(entry, settings));
    },
    has(identity) { return backpack.has(identity); },
    equipped: equippedDefinition,
    equip(id) { return backpack.equip(id); },
    equipSlot(slot) { return backpack.equipSlot(slot); },
    assignHotbar(slot, id) { return backpack.assignHotbar(slot, id); },
    cycle(direction = 1) {
      const state = backpack.snapshot();
      const available = state.hotbar.filter(Boolean);
      if (!available.length) return equippedDefinition();
      const current = Math.max(0, available.indexOf(state.equippedInstanceId));
      const next = available[(current + (direction < 0 ? -1 : 1) + available.length) % available.length];
      backpack.equip(next);
      return equippedDefinition();
    },
    reload() {
      const definition = equippedDefinition();
      const rounds = ammo.get(definition?.id);
      if (!definition?.magazineSize || !rounds || rounds.magazine >= definition.magazineSize || rounds.reserve <= 0) return false;
      const moved = Math.min(definition.magazineSize - rounds.magazine, rounds.reserve);
      rounds.magazine += moved;
      rounds.reserve -= moved;
      backpack.touch?.('ammunition-reloaded', { catalogId: definition.id, rounds: moved });
      return true;
    },
    grantAmmo(id, rounds = 0) {
      const definition = definitionFor(id, backpack);
      const state = ammo.get(definition?.id);
      const amount = Math.max(0, Math.floor(Number(rounds) || 0));
      if (!definition?.magazineSize || !state || amount <= 0) return 0;
      state.reserve += amount;
      backpack.touch?.('ammunition-added', { catalogId: definition.id, rounds: amount });
      return amount;
    },
    grantQuantity(id, quantity = 0) {
      const definition = definitionFor(id, backpack);
      const amount = Math.max(0, Math.floor(Number(quantity) || 0));
      if (!definition?.quantity || amount <= 0) return 0;
      quantities.set(definition.id, Number(quantities.get(definition.id) || 0) + amount);
      backpack.touch?.('quantity-added', { catalogId: definition.id, quantity: amount });
      return amount;
    },
    prepareUse(at = Date.now()) {
      const definition = equippedDefinition();
      if (!definition) return Object.freeze({ ok: false, reason: 'missing_equipment' });
      if (!definition.verbs?.includes('use') && definition.category !== 'unarmed') {
        return Object.freeze({ ok: false, reason: 'no_direct_use', definition });
      }
      const timestamp = Number(at) || 0;
      if (timestamp - lastUseAt < Number(definition.cooldownMs || 0)) return Object.freeze({ ok: false, reason: 'cooldown', definition });
      if (definition.category === 'utility') {
        flashlightEnabled = !flashlightEnabled;
        lastUseAt = timestamp;
        return Object.freeze({ ok: true, definition, utility: 'flashlight', enabled: flashlightEnabled });
      }
      const rounds = ammo.get(definition.id);
      if (rounds && rounds.magazine <= 0) return Object.freeze({ ok: false, reason: rounds.reserve > 0 ? 'reload' : 'empty', definition });
      const quantity = quantities.get(definition.id);
      if (quantity !== undefined && quantity <= 0) return Object.freeze({ ok: false, reason: 'empty', definition });
      if (rounds) rounds.magazine -= 1;
      if (quantity !== undefined) quantities.set(definition.id, quantity - 1);
      if (rounds || quantity !== undefined) backpack.touch?.('equipment-consumed', { catalogId: definition.id });
      lastUseAt = timestamp;
      return Object.freeze({ ok: true, definition });
    }
  });
}

export { EQUIPMENT_DEFINITIONS, createEquipmentInventory, definitionFor };
