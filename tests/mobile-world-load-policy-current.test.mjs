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
import {
  prepareWorldFeatureSelections,
  uniqueMappedWays
} from '../app/js/world/load-budgeting.js';

test('road identity deduplication does not spend regional budget twice', () => {
  const core = { type: 'way', id: 42, tags: { highway: 'primary' } };
  const overlappingRegional = {
    type: 'way',
    id: 42,
    tags: { highway: 'primary', _regionalContext: 'fixed-location' }
  };
  const distinctRegional = {
    type: 'way',
    id: 43,
    tags: { highway: 'residential', _regionalContext: 'fixed-location' }
  };
  assert.deepEqual(uniqueMappedWays([core, overlappingRegional, distinctRegional]), [
    core,
    distinctRegional
  ]);
});

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

    assert.equal(loadMetrics.regionalTransportSelection.regionalCap, 1_100);
    assert.equal(loadMetrics.regionalTransportSelection.generalSelected, 1_100);
    assert.ok(selection.roadWays.length <= 1_100);
  } finally {
    appCtx.isLikelyMobileDevice = previousMobileDetector;
    appCtx.worldSurfaceProfile = previousSurfaceProfile;
  }
});

test('a complete regional road result is retained when it fits the client road budget', () => {
  const previousMobileDetector = appCtx.isLikelyMobileDevice;
  const previousSurfaceProfile = appCtx.worldSurfaceProfile;
  try {
    appCtx.isLikelyMobileDevice = () => false;
    initWorldBudgets({
      getPerfModeValue: () => 'baseline',
      limitNodesByDistance: (nodes, limit) => nodes.slice(0, limit),
      limitWaysByDistance: (ways, _nodes, limit) => ways.slice(0, limit),
      nodeDistanceSq: () => 0
    });
    const nodes = {};
    const elements = [];
    for (let index = 0; index < 120; index += 1) {
      const nodeA = index * 2 + 1;
      const nodeB = nodeA + 1;
      nodes[nodeA] = { type: 'node', id: nodeA, lat: 39.30, lon: -76.61 + index * 0.000001 };
      nodes[nodeB] = { type: 'node', id: nodeB, lat: 39.30001, lon: -76.61 + index * 0.000001 };
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
      data: { elements }, nodes, loadMetrics,
      tileBudgetCfg: {
        tileDegrees: .002,
        roadsPerTile: 2, roadsMinPerTile: 1,
        buildingsPerTile: 2, buildingsMinPerTile: 1,
        landusePerTile: 2, landuseMinPerTile: 1,
        poiPerTile: 2, poiMinPerTile: 1
      },
      useRdtBudgeting: false,
      enableLinearFeatures: false,
      maxRoadWays: 200,
      maxBuildingWays: 10,
      maxLanduseWays: 10,
      maxPoiNodes: 10,
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

    assert.equal(selection.requestedCounts.roads, 120);
    assert.equal(selection.roadWays.length, 120);
    assert.equal(loadMetrics.regionalTransportSelection.generalSelected, 120);
  } finally {
    appCtx.isLikelyMobileDevice = previousMobileDetector;
    appCtx.worldSurfaceProfile = previousSurfaceProfile;
  }
});
