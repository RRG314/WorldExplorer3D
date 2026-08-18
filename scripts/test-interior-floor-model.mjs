import assert from 'node:assert/strict';
import {
  MAX_BUILDING_FLOORS,
  deriveInteriorFloorPlan,
  interiorFloorIdentity,
  loadedInteriorLevels,
  nextElevatorLevel
} from '../app/js/interiors/floor-model.js';

const plan = deriveInteriorFloorPlan({
  key: 'building:baltimore:office-14',
  building: { levels: 6, height: 21 }
}, { width: 24, depth: 18 });
assert.equal(plan.floorCount, 6);
assert.equal(plan.connectorEligible, true);
assert.equal(interiorFloorIdentity(plan, 0).label, 'Lobby');
assert.equal(interiorFloorIdentity(plan, 2).id, 'building:baltimore:office-14:floor:2');
assert.deepEqual([...loadedInteriorLevels(plan, 0)], [0, 1]);
assert.deepEqual([...loadedInteriorLevels(plan, 3)], [2, 3, 4]);
assert.deepEqual([...loadedInteriorLevels(plan, 5)], [4, 5]);
assert.equal(nextElevatorLevel(plan, 3), 4);
assert.equal(nextElevatorLevel(plan, 5), 0);

const narrow = deriveInteriorFloorPlan({ key: 'narrow', building: { levels: 12, height: 42 } }, { width: 6, depth: 40 });
assert.equal(narrow.floorCount, 1, 'a narrow footprint does not publish unusable connectors');
const capped = deriveInteriorFloorPlan({ key: 'tower', building: { levels: 60, height: 210 } }, { width: 40, depth: 40 });
assert.equal(capped.floorCount, MAX_BUILDING_FLOORS, 'bounded streaming model caps generated floors');

console.log(JSON.stringify({
  ok: true,
  contract: 'stable-interior-floor-model-v1',
  floorCount: plan.floorCount,
  loadedAtLobby: loadedInteriorLevels(plan, 0),
  loadedAtMiddle: loadedInteriorLevels(plan, 3),
  cappedFloors: capped.floorCount
}, null, 2));
