import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateShoreFishing } from '../app/js/fishing/shore-authority.js';

function context(tags = {}, overrides = {}) {
  return {
    inspectBoatCandidate: () => ({
      inside: false,
      synthetic: false,
      distanceToWater: 12,
      waterKind: 'harbor',
      label: 'Harbor Water',
      entryPoint: { x: 12, z: 0 },
      source: {
        registryId: 'water:test-harbor',
        tags,
        provenance: { dataset: 'osm-overpass' }
      },
      ...overrides
    }),
    checkBuildingCollision: () => ({ collision: false }),
    sampleSurfaceY: () => 0,
    worldToLatLon: () => ({ lat: 39.283, lon: -76.613 }),
    getLiveGpsSnapshot: () => ({ active: false })
  };
}

const walker = Object.freeze({ x: 0, y: 0, z: 0 });

test('explicit mapped fishing access enables reward-eligible shore fishing', () => {
  const result = evaluateShoreFishing(context({ fishing: 'yes', access: 'yes' }), walker);
  assert.equal(result.outcome, 'shore_eligible');
  assert.equal(result.playable, true);
  assert.equal(result.rewardEligible, true);
  assert.equal(result.waterbodyId, 'water:test-harbor');
  assert.equal(result.populationContext.waterbody.id, result.waterbodyId);
  assert.equal(result.populationContext.access.mode, 'shore');
  assert.equal(result.populationContext.evidence.livePresenceClaim, false);
  assert.equal(result.bankEvidence.stableStandingSurface, true);
  assert.equal(result.bankEvidence.castCorridorClear, true);
  assert.equal(result.bankEvidence.recoverableExit, true);
  assert.equal(result.bankEvidence.accessibilityClaim, false);
});

test('unknown access permits labeled virtual practice but no location reward', () => {
  const result = evaluateShoreFishing(context(), walker);
  assert.equal(result.outcome, 'access_unknown');
  assert.equal(result.playable, true);
  assert.equal(result.rewardEligible, false);
  assert.match(result.message, /permission is unknown/i);
});

test('mapped restrictions and blocked corridors refuse shore fishing', () => {
  assert.equal(evaluateShoreFishing(context({ fishing: 'no' }), walker).outcome, 'protected_or_closed');
  assert.equal(evaluateShoreFishing(context({ access: 'private' }), walker).outcome, 'private_or_excluded');
  const blocked = context({ fishing: 'yes' });
  blocked.checkBuildingCollision = () => ({ collision: true });
  assert.equal(evaluateShoreFishing(blocked, walker).outcome, 'no_safe_bank');
  const steep = context({ fishing: 'yes' });
  steep.sampleSurfaceY = (x) => x > 0 ? 3 : 0;
  const steepResult = evaluateShoreFishing(steep, walker);
  assert.equal(steepResult.outcome, 'no_safe_bank');
  assert.equal(steepResult.bankEvidence.reason, 'modeled-bank-too-steep');
});

test('Live GPS field holds also hold shore fishing', () => {
  const appCtx = context({ fishing: 'yes' });
  appCtx.getLiveGpsSnapshot = () => ({ active: true, fieldSession: { eligible: false, pauseReason: 'unsafe-speed' } });
  const result = evaluateShoreFishing(appCtx, walker);
  assert.equal(result.outcome, 'gps_held');
  assert.equal(result.playable, false);
  assert.match(result.message, /unsafe speed/i);
});
