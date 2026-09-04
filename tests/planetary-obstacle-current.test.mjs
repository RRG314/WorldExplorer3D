import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clearActivePlanetaryObstacles,
  queryPlanetaryObstacle,
  setActivePlanetaryObstacles,
  snapshotPlanetaryObstacles
} from '../app/js/planetary/runtime/obstacle-authority.js';

test('the active planetary hull blocks its body and clears without touching other worlds', () => {
  setActivePlanetaryObstacles('test-world', [{ id: 'return-pod', x: 9, z: 7, radius: 1.62 }]);
  assert.equal(snapshotPlanetaryObstacles().obstacles.length, 1);
  assert.equal(queryPlanetaryObstacle(9, 7, 0.28, 'test-world')?.obstacle.id, 'return-pod');
  assert.equal(queryPlanetaryObstacle(12, 7, 0.28, 'test-world'), null);
  assert.equal(queryPlanetaryObstacle(9, 7, 0.28, 'different-world'), null);
  assert.equal(clearActivePlanetaryObstacles('different-world'), false);
  assert.equal(snapshotPlanetaryObstacles().bodyId, 'test-world');
  assert.equal(clearActivePlanetaryObstacles('test-world'), true);
  assert.equal(queryPlanetaryObstacle(9, 7, 0.28, 'test-world'), null);
});
