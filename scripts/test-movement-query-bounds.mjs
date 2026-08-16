import assert from 'node:assert/strict';
import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import {
  findNearestRoad,
  initWorldNavigation
} from '../app/js/world/navigation.js';

const originalRoads = appCtx.roads;
const originalOverlayRoads = appCtx.overlayRuntimeRoads;

try {
  appCtx.roads = Array.from({ length: 2400 }, (_, index) => {
    const row = Math.floor(index / 60);
    const column = index % 60;
    const x = column * 18;
    const z = row * 18;
    return {
      sourceFeatureId: `fixture-road-${index}`,
      pts: [{ x, z }, { x: x + 12, z }],
      width: 7,
      type: 'residential'
    };
  });
  appCtx.overlayRuntimeRoads = [];

  let evaluatedSegments = 0;
  initWorldNavigation({
    areRoadsConnected: () => false,
    isSuppressedBaseRoad: () => false,
    sampleFeatureSurfaceY: () => {
      evaluatedSegments += 1;
      return 0;
    }
  });

  const near = findNearestRoad(4, 2);
  assert.ok(near.road, 'bounded spatial lookup did not find a nearby road');

  evaluatedSegments = 0;
  const outside = findNearestRoad(12000, 12000);
  assert.equal(outside.road, null, 'ordinary movement lookup selected a road outside bounded coverage');
  assert.equal(evaluatedSegments, 0, 'ordinary movement lookup scanned road segments after an indexed miss');

  evaluatedSegments = 0;
  const diagnostic = findNearestRoad(12000, 12000, { forceFullScan: true });
  assert.ok(diagnostic.road, 'explicit diagnostic full scan did not remain available');
  assert.equal(evaluatedSegments, appCtx.roads.length,
    'explicit full scan did not evaluate the complete fixture exactly once');

  console.log(JSON.stringify({
    ok: true,
    contract: 'bounded-movement-road-query',
    roads: appCtx.roads.length,
    ordinaryMissSegmentEvaluations: 0,
    explicitDiagnosticSegmentEvaluations: evaluatedSegments
  }, null, 2));
} finally {
  appCtx.roads = originalRoads;
  appCtx.overlayRuntimeRoads = originalOverlayRoads;
}
