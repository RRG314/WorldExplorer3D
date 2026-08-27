import assert from 'node:assert/strict';
import test from 'node:test';

import { createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import { beginNpcDefense, npcFireDecision } from '../app/js/urban-sandbox/npc-combat-policy.js';

test('recoverable sidearms are earned items and can be assigned to any quick slot', () => {
  const inventory = createEquipmentInventory();
  assert.equal(inventory.has('compact-sidearm'), false);
  assert.equal(inventory.has('responder-sidearm'), false);

  inventory.upsertItem({
    instanceId: 'recovered:test:compact-sidearm',
    catalogId: 'compact-sidearm',
    provenance: 'recovered-equipment'
  });
  assert.equal(inventory.grantAmmo('compact-sidearm', 17), 17);
  assert.equal(inventory.assignHotbar(2, 'compact-sidearm'), true);
  assert.equal(inventory.equipSlot(2), true);

  const state = inventory.snapshot();
  const weapon = state.items.find((item) => item.id === 'compact-sidearm');
  assert.equal(state.equippedId, 'compact-sidearm');
  assert.equal(weapon.hotbarSlot, 2);
  assert.equal(weapon.reserve, 17);
});

test('only an armed surviving NPC enters a bounded defensive-fire state', () => {
  const armed = { id: 'npc-a', heldEquipment: 'compact-sidearm', condition: .7, nextShotAt: 0 };
  const defense = beginNpcDefense(armed, 1000, false);
  assert.deepEqual(defense, { hostileUntil: 15000, nextShotAt: 1520, reaction: 'defending' });
  assert.equal(beginNpcDefense({ heldEquipment: '' }, 1000, false), null);
  assert.equal(beginNpcDefense(armed, 1000, true), null);
});

test('defensive fire respects range, reaction delay, walking mode, and room authority', () => {
  const npc = {
    id: 'npc-a', heldEquipment: 'compact-sidearm', condition: .7,
    hostileUntil: 15000, nextShotAt: 1520, x: 0, z: 0
  };
  const actor = { x: 12, z: 0 };
  assert.equal(npcFireDecision(npc, actor, 1300, { walking: true })?.ready, false);
  assert.equal(npcFireDecision(npc, actor, 1600, { walking: true })?.ready, true);
  assert.equal(npcFireDecision(npc, { x: 2, z: 0 }, 1600, { walking: true })?.ready, false);
  assert.equal(npcFireDecision(npc, actor, 1600, { walking: false }), null);
  assert.equal(npcFireDecision(npc, actor, 1600, { walking: true, multiplayer: true }), null);
});
