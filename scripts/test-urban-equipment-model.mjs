import assert from 'node:assert/strict';
import { EQUIPMENT_DEFINITIONS, createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import { applyConditionImpact, blastTargets, impactAtDistance } from '../app/js/urban-sandbox/impact-model.js';

assert.deepEqual(EQUIPMENT_DEFINITIONS.map((item) => item.slot), [1, 2, 3, 4, 5]);
assert.equal(new Set(EQUIPMENT_DEFINITIONS.map((item) => item.id)).size, EQUIPMENT_DEFINITIONS.length);

const inventory = createEquipmentInventory();
assert.equal(inventory.snapshot().equippedId, 'hands');
assert.equal(inventory.equipSlot(4), true);
assert.equal(inventory.equipped().id, 'pulse-sidearm');
const firstShot = inventory.prepareUse(1000);
assert.equal(firstShot.ok, true);
assert.equal(inventory.snapshot().items.find((item) => item.id === 'pulse-sidearm').magazine, 11);
assert.equal(inventory.prepareUse(1100).reason, 'cooldown');

inventory.equip('flashlight');
assert.equal(inventory.prepareUse(2000).enabled, true);
assert.equal(inventory.prepareUse(2200).enabled, false);
assert.equal(inventory.addSandboxItem(2), 2);

const melee = impactAtDistance(EQUIPMENT_DEFINITIONS[2], 2.1);
assert.equal(melee.accepted, true);
assert.equal(impactAtDistance(EQUIPMENT_DEFINITIONS[2], 4).reason, 'out_of_range');
const condition = applyConditionImpact({ condition: 1, resistance: 100 }, melee.force);
assert.ok(condition.after < 1 && condition.after > 0);

const charge = EQUIPMENT_DEFINITIONS[4];
const affected = blastTargets({ x: 0, z: 0 }, [
  { id: 'near', x: 1, z: 1 },
  { id: 'edge', x: 7, z: 0 },
  { id: 'far', x: 12, z: 0 }
], charge);
assert.deepEqual(affected.map((entry) => entry.target.id), ['near', 'edge']);
assert.ok(affected[0].force > affected[1].force, 'blast falloff regressed');

console.log(JSON.stringify({
  ok: true,
  equipment: EQUIPMENT_DEFINITIONS.map((item) => item.id),
  carriedSandboxItems: inventory.snapshot().sandboxItems,
  affectedTargets: affected.map((entry) => ({ id: entry.target.id, force: Number(entry.force.toFixed(2)) }))
}, null, 2));
