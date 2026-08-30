import assert from 'node:assert/strict';
import test from 'node:test';

import { createEquipmentInventory } from '../app/js/urban-sandbox/equipment-model.js';
import {
  NPC_COMBAT_STATES,
  beginNpcDefense,
  beginNpcResponse,
  npcFireDecision,
  resolveNpcCombatState
} from '../app/js/urban-sandbox/npc-combat-policy.js';
import { claimLootPickup, createLootPickup } from '../app/js/urban-sandbox/loot-pickup-model.js';

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

test('custom quick-slot choices survive Backpack export and reload without a second loadout model', () => {
  const first = createEquipmentInventory();
  first.upsertItem({
    instanceId: 'recovered:test:compact-sidearm',
    catalogId: 'compact-sidearm',
    provenance: 'recovered-equipment'
  });
  assert.equal(first.assignHotbar(1, 'compact-sidearm'), true);
  assert.equal(first.assignHotbar(6, 'metal-detector'), false);
  const reloaded = createEquipmentInventory({ persistedState: first.exportState() });
  const slotOne = reloaded.snapshot().items.find((item) => item.hotbarSlot === 1);
  assert.equal(slotOne.catalogId, 'compact-sidearm');
  assert.equal(reloaded.equipSlot(1), true);
  assert.equal(reloaded.snapshot().equippedId, 'compact-sidearm');
});

test('each equipped item owns its cooldown so a quick-slot change remains responsive', () => {
  const inventory = createEquipmentInventory();
  assert.equal(inventory.equipSlot(4), true);
  assert.equal(inventory.prepareUse(1_000).ok, true);

  assert.equal(inventory.equipSlot(5), true);
  assert.equal(inventory.prepareUse(1_450).ok, true);
  assert.equal(inventory.prepareUse(1_900).reason, 'cooldown');

  assert.equal(inventory.equipSlot(4), true);
  assert.equal(inventory.prepareUse(1_450).ok, true);
});

test('downed-actor gear becomes an idempotent world pickup before entering the Backpack', () => {
  const inventory = createEquipmentInventory();
  const pickup = createLootPickup({
    sourceActorId: 'npc-a', catalogId: 'compact-sidearm', label: 'Compact sidearm', rounds: 18,
    position: { x: 4, y: 1, z: 8 }
  });
  assert.equal(inventory.has('compact-sidearm'), false);
  assert.equal(pickup.type, 'WorldLootPickup');
  const collected = claimLootPickup(pickup, inventory, 1234);
  assert.deepEqual(collected, { ok: true, catalogId: 'compact-sidearm', label: 'Compact sidearm', rounds: 18 });
  assert.equal(inventory.has('compact-sidearm'), true);
  assert.equal(inventory.snapshot().items.find((item) => item.catalogId === 'compact-sidearm').reserve, 18);
  assert.equal(claimLootPickup(pickup, inventory, 2345).reason, 'already_claimed');
});

test('only an armed surviving NPC enters a bounded defensive-fire state', () => {
  const armed = { id: 'npc-a', heldEquipment: 'compact-sidearm', condition: .7, nextShotAt: 0 };
  const defense = beginNpcDefense(armed, 1000, false);
  assert.deepEqual(defense, { hostileUntil: 15000, nextShotAt: 1520, reaction: 'defending' });
  assert.equal(beginNpcDefense({ heldEquipment: '' }, 1000, false), null);
  assert.equal(beginNpcDefense(armed, 1000, true), null);
});

test('NPC response states distinguish fleeing civilians, armed defense, combat, down, recovery, and alerts', () => {
  const civilian = beginNpcResponse({ condition: .8 }, 1000, false);
  assert.equal(civilian.combatState, NPC_COMBAT_STATES.FLEE);
  assert.equal(civilian.combatStateUntil, 7000);

  const armed = beginNpcResponse({ id: 'npc-a', heldEquipment: 'compact-sidearm', condition: .8 }, 1000, false);
  assert.equal(armed.combatState, NPC_COMBAT_STATES.DEFEND);
  assert.equal(resolveNpcCombatState({ ...armed, condition: .8, shotsFired: 1 }, 2000), NPC_COMBAT_STATES.COMBAT);
  assert.equal(resolveNpcCombatState({ condition: 0 }, 2000), NPC_COMBAT_STATES.DOWN);
  assert.equal(resolveNpcCombatState({ condition: .8, knockdownUntil: 3000 }, 2000), NPC_COMBAT_STATES.RECOVER);
  assert.equal(resolveNpcCombatState({ condition: .8 }, 2000, { alert: true }), NPC_COMBAT_STATES.ALERT);
  assert.equal(resolveNpcCombatState({ condition: .8 }, 2000), NPC_COMBAT_STATES.NORMAL);
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
