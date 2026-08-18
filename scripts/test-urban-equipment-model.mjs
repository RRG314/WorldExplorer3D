import assert from 'node:assert/strict';
import { EQUIPMENT_DEFINITIONS, createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import { applyConditionImpact, blastTargets, impactAtDistance } from '../app/js/urban-sandbox/impact-model.js';
import { PARACHUTE_POLICY, evaluateParachuteDeployment, integrateParachuteFall } from '../app/js/urban-sandbox/parachute-model.js';

assert.deepEqual(EQUIPMENT_DEFINITIONS.map((item) => item.slot), [1, 2, 3, 4, 5, 6]);
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

inventory.equipSlot(6);
assert.equal(inventory.equipped().id, 'parachute');
assert.equal(evaluateParachuteDeployment({
  environment: 'EARTH', travelMode: 'walk', onGround: false,
  feetY: 18, groundY: 2, verticalVelocity: -3
}).allowed, true);
assert.equal(evaluateParachuteDeployment({
  environment: 'EARTH', travelMode: 'walk', onGround: true,
  feetY: 2, groundY: 2, verticalVelocity: 0
}).reason, 'on-ground');
assert.equal(evaluateParachuteDeployment({
  environment: 'EARTH', travelMode: 'walk', onGround: false,
  feetY: 4, groundY: 2, verticalVelocity: -3
}).reason, 'too-low');
let descent = -3;
for (let step = 0; step < 240; step += 1) descent = integrateParachuteFall(descent, 1 / 60, true);
assert.ok(descent >= -PARACHUTE_POLICY.terminalDescentSpeed, 'deployed parachute exceeded terminal descent speed');

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
