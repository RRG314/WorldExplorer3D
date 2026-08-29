import assert from 'node:assert/strict';
import test from 'node:test';

import { ctx as appCtx } from '../app/js/shared-context.js?v=55';
import {
  getAdaptiveLoadProfile,
  getRuntimeDynamicBudget,
  initWorldBudgets,
  limitNodesByTileBudget,
  limitWaysByTileBudget
} from '../app/js/world/budgets.js';
import { prepareWorldFeatureSelections } from '../app/js/world/load-budgeting.js';

test('mobile world load policy bounds provider time and geometry without changing desktop policy', () => {
  const previousMobileDetector = appCtx.isLikelyMobileDevice;
  const previousBudgetState = appCtx.getDynamicBudgetState;
  try {
    appCtx.isLikelyMobileDevice = () => true;
    appCtx.getDynamicBudgetState = () => ({
      auto: true,
      tier: 'high',
      budgetScale: 1,
      lodScale: 1,
      reason: 'test'
    });
    const mobileBudget = getRuntimeDynamicBudget('rdt');
    const mobile = getAdaptiveLoadProfile(5, 'rdt', mobileBudget.budgetScale, mobileBudget.deviceClass);
    const desktop = getAdaptiveLoadProfile(5, 'rdt', 1, 'desktop');

    assert.equal(mobileBudget.deviceClass, 'mobile');
    assert.equal(mobileBudget.budgetScale, .28);
    assert.equal(mobile.maxTotalLoadMs, 32_000);
    assert.equal(mobile.overpassTimeoutMs, 12_000);
    assert.equal(mobile.optionalProviderTimeoutMs, 2_500);
    assert.equal(mobile.fixedRegionalGroundTimeoutMs, 2_500);
    assert.equal(mobile.regionalContextRadiusMeters, 6_000);
    assert.ok(mobile.maxBuildingWays < desktop.maxBuildingWays);
    assert.ok(mobile.maxRoadWays < desktop.maxRoadWays);
    assert.equal(desktop.maxTotalLoadMs, 44_000);
    assert.equal(desktop.regionalContextRadiusMeters, 14_000);
  } finally {
    appCtx.isLikelyMobileDevice = previousMobileDetector;
    appCtx.getDynamicBudgetState = previousBudgetState;
  }
});

test('fixed regional roads cannot overwhelm the mobile core-road budget', () => {
  const previousMobileDetector = appCtx.isLikelyMobileDevice;
  const previousSurfaceProfile = appCtx.worldSurfaceProfile;
  try {
    appCtx.isLikelyMobileDevice = () => true;
    initWorldBudgets({
      getPerfModeValue: () => 'rdt',
      limitNodesByDistance: (nodes, limit) => nodes.slice(0, limit),
      limitWaysByDistance: (ways, _nodes, limit) => ways.slice(0, limit),
      nodeDistanceSq: () => 0
    });
    const nodes = {};
    const elements = [];
    for (let index = 0; index < 2_000; index += 1) {
      const nodeA = index * 2 + 1;
      const nodeB = nodeA + 1;
      const lat = 39 + (index % 100) * .0002;
      const lon = -76 + Math.floor(index / 100) * .0002;
      nodes[nodeA] = { type: 'node', id: nodeA, lat, lon };
      nodes[nodeB] = { type: 'node', id: nodeB, lat: lat + .00005, lon: lon + .00005 };
      elements.push(nodes[nodeA], nodes[nodeB], {
        type: 'way',
        id: `regional-${index}`,
        nodes: [nodeA, nodeB],
        tags: { highway: 'residential', _regionalContext: 'fixed-location' }
      });
    }
    const loadMetrics = {
      roads: {}, buildings: {}, landuse: {}, linearFeatures: {
        railway: {}, footway: {}, cycleway: {}
      }, vegetation: {}, pois: {}
    };
    const selection = prepareWorldFeatureSelections({
      data: { elements },
      nodes,
      loadMetrics,
      tileBudgetCfg: {
        tileDegrees: .002,
        roadsPerTile: 40,
        roadsMinPerTile: 8,
        buildingsPerTile: 32,
        buildingsMinPerTile: 14,
        landusePerTile: 10,
        landuseMinPerTile: 4,
        poiPerTile: 6,
        poiMinPerTile: 3
      },
      useRdtBudgeting: false,
      enableLinearFeatures: false,
      maxRoadWays: 1_100,
      maxBuildingWays: 5_000,
      maxLanduseWays: 1_200,
      maxPoiNodes: 500,
      maxTreeNodes: 0,
      maxTreeRowWays: 0,
      classifyLinearFeatureTags: () => null,
      classifyStructureSemantics: () => ({}),
      classifyWorldSurfaceProfile: () => ({ reason: 'test', signals: { normalized: {} } }),
      isDriveableHighwayTag: (value) => Boolean(value),
      limitNodesByTileBudget,
      limitWaysByTileBudget,
      linearFeaturePriority: () => 0,
      poiKeyFromTags: () => '',
      roadTypePriority: () => 1
    });

    assert.equal(loadMetrics.regionalTransportSelection.regionalCap, 650);
    assert.ok(loadMetrics.regionalTransportSelection.generalSelected <= 650);
    assert.ok(selection.roadWays.length <= 650);
  } finally {
    appCtx.isLikelyMobileDevice = previousMobileDetector;
    appCtx.worldSurfaceProfile = previousSurfaceProfile;
  }
});
