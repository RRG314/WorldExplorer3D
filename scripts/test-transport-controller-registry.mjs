import { createTransportControllerRegistry } from '../app/js/transport/controller-registry.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let clock = 0;
const updates = [];
const conflicts = [];
const registry = createTransportControllerRegistry({
  now: () => clock++,
  onConflict: (conflict) => conflicts.push(conflict)
});

const state = { walk: false, plane: false };
registry.registerController({
  id: 'walk',
  priority: 20,
  isActive: () => state.walk,
  update: (dt) => updates.push(['walk', dt])
});
registry.registerController({
  id: 'plane',
  priority: 10,
  isActive: () => state.plane,
  update: (dt) => updates.push(['plane', dt])
});

assert(registry.update(1 / 60) === false, 'An inactive registry should not claim the frame.');
state.walk = true;
assert(registry.update(1 / 60) === true, 'The active walking controller should claim the frame.');
state.plane = true;
registry.update(1 / 30);
registry.update(1 / 30);

assert(updates.map(([id]) => id).join(',') === 'walk,plane,plane', 'Priority should select exactly one active controller.');
assert(conflicts.length === 1, 'A persistent conflict should be reported once.');
const snapshot = registry.snapshot();
assert(snapshot.activeId === 'plane', 'Snapshot should identify the authoritative controller.');
assert(snapshot.activeCandidates.join(',') === 'plane,walk', 'Snapshot should expose conflicting candidates in priority order.');
assert(snapshot.controllers.find((controller) => controller.id === 'plane').updates === 2, 'Controller update counts should be tracked.');

console.log(JSON.stringify({ ok: true, activeId: snapshot.activeId, conflicts: snapshot.conflicts }, null, 2));
