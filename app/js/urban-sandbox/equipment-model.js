const EQUIPMENT_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'hands', label: 'Hands', category: 'unarmed', slot: 1, range: 2.4, force: 12, cooldownMs: 520, actionLabel: 'Shove', icon: 'HAND' }),
  Object.freeze({ id: 'flashlight', label: 'Field light', category: 'utility', slot: 2, range: 18, force: 0, cooldownMs: 180, actionLabel: 'Toggle light', icon: 'LIGHT' }),
  Object.freeze({ id: 'baton', label: 'Impact baton', category: 'melee', slot: 3, range: 2.7, force: 28, cooldownMs: 620, actionLabel: 'Strike', icon: 'BATON' }),
  Object.freeze({ id: 'pulse-sidearm', label: 'Pulse sidearm', category: 'sidearm', slot: 4, range: 42, force: 34, cooldownMs: 310, magazineSize: 12, reserve: 36, actionLabel: 'Fire', icon: 'PULSE' }),
  Object.freeze({ id: 'concussion-charge', label: 'Concussion charge', category: 'explosive', slot: 5, range: 19, force: 78, blastRadius: 7.5, cooldownMs: 1100, quantity: 4, actionLabel: 'Throw', icon: 'CHARGE' })
]);

function definitionFor(id) {
  return EQUIPMENT_DEFINITIONS.find((definition) => definition.id === String(id || '')) || null;
}

function createEquipmentInventory(options = {}) {
  const acquired = new Set(Array.isArray(options.acquired)
    ? options.acquired.filter((id) => definitionFor(id))
    : EQUIPMENT_DEFINITIONS.map((definition) => definition.id));
  acquired.add('hands');
  const ammo = new Map();
  const quantities = new Map();
  EQUIPMENT_DEFINITIONS.forEach((definition) => {
    if (definition.magazineSize) ammo.set(definition.id, {
      magazine: Number(options.ammo?.[definition.id]?.magazine ?? definition.magazineSize),
      reserve: Number(options.ammo?.[definition.id]?.reserve ?? definition.reserve)
    });
    if (definition.quantity) quantities.set(definition.id, Number(options.quantities?.[definition.id] ?? definition.quantity));
  });
  let equippedId = acquired.has(options.equippedId) ? options.equippedId : 'hands';
  let lastUseAt = -Infinity;
  let flashlightEnabled = false;
  let sandboxItems = Math.max(0, Math.floor(Number(options.sandboxItems) || 0));

  const snapshot = () => Object.freeze({
    equippedId,
    flashlightEnabled,
    sandboxItems,
    items: Object.freeze(EQUIPMENT_DEFINITIONS.filter((definition) => acquired.has(definition.id)).map((definition) => {
      const rounds = ammo.get(definition.id);
      return Object.freeze({
        ...definition,
        magazine: rounds?.magazine ?? null,
        reserve: rounds?.reserve ?? null,
        quantity: quantities.get(definition.id) ?? null,
        equipped: definition.id === equippedId
      });
    }))
  });

  return Object.freeze({
    snapshot,
    equipped() {
      return definitionFor(equippedId);
    },
    equip(id) {
      const definition = definitionFor(id);
      if (!definition || !acquired.has(definition.id)) return false;
      equippedId = definition.id;
      return true;
    },
    equipSlot(slot) {
      const definition = EQUIPMENT_DEFINITIONS.find((entry) => entry.slot === Number(slot) && acquired.has(entry.id));
      if (!definition) return false;
      equippedId = definition.id;
      return true;
    },
    cycle(direction = 1) {
      const available = EQUIPMENT_DEFINITIONS.filter((definition) => acquired.has(definition.id));
      const current = Math.max(0, available.findIndex((definition) => definition.id === equippedId));
      equippedId = available[(current + (direction < 0 ? -1 : 1) + available.length) % available.length].id;
      return definitionFor(equippedId);
    },
    addSandboxItem(count = 1) {
      sandboxItems = Math.min(99, sandboxItems + Math.max(0, Math.floor(Number(count) || 0)));
      return sandboxItems;
    },
    reload() {
      const definition = definitionFor(equippedId);
      const rounds = ammo.get(equippedId);
      if (!definition?.magazineSize || !rounds || rounds.magazine >= definition.magazineSize || rounds.reserve <= 0) return false;
      const needed = definition.magazineSize - rounds.magazine;
      const moved = Math.min(needed, rounds.reserve);
      rounds.magazine += moved;
      rounds.reserve -= moved;
      return true;
    },
    prepareUse(at = Date.now()) {
      const definition = definitionFor(equippedId);
      if (!definition) return Object.freeze({ ok: false, reason: 'missing_equipment' });
      const timestamp = Number(at) || 0;
      if (timestamp - lastUseAt < definition.cooldownMs) return Object.freeze({ ok: false, reason: 'cooldown', definition });
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
      lastUseAt = timestamp;
      return Object.freeze({ ok: true, definition });
    }
  });
}

export { EQUIPMENT_DEFINITIONS, createEquipmentInventory, definitionFor };
