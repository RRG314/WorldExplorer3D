import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIVING_WORLD_DEMAND_BY_TIER,
  normalizeTrafficFlowSnapshot,
  populationEdgeWeight,
  resolveLivingWorldDemand
} from '../app/js/living-world/demand-model.js';
import { compileTrafficGraph } from '../app/js/living-world/navigation-graphs.js';

function roadSegment() {
  const feature = {
    id: 'osm:way:activity-road',
    type: 'residential',
    networkKind: 'road',
    driveable: true,
    width: 8,
    speedLimit: 12,
    pts: [{ x: 0, z: 0 }, { x: 100, z: 0 }],
    transportRecord: {
      identity: 'osm:way:activity-road',
      completeness: 'lossless',
      crossSection: { widthMeters: 8, lanes: 2, lanesSource: 'mapped' },
      speed: { metersPerSecond: 12 }
    }
  };
  return {
    p1: { x: 0, y: 0, z: 0 },
    p2: { x: 100, y: 0, z: 0 },
    direction: 'both',
    segIndex: 0,
    sourceTStart: 0,
    sourceTEnd: 1,
    feature
  };
}

test('quality density is materially higher while lower tiers remain bounded', () => {
  assert.equal(LIVING_WORLD_DEMAND_BY_TIER.quality.pedestrians, 56);
  assert.equal(LIVING_WORLD_DEMAND_BY_TIER.quality.vehicles, 36);
  assert.ok(LIVING_WORLD_DEMAND_BY_TIER.low.pedestrians < LIVING_WORLD_DEMAND_BY_TIER.balanced.pedestrians);
  assert.ok(LIVING_WORLD_DEMAND_BY_TIER.performance.vehicles < LIVING_WORLD_DEMAND_BY_TIER.quality.vehicles);
});

test('time bands independently reduce overnight foot and vehicle activity', () => {
  const day = resolveLivingWorldDemand({ tier: 'balanced', timePhase: 'day' });
  const night = resolveLivingWorldDemand({ tier: 'balanced', timePhase: 'night' });
  assert.ok(day.pedestrianActiveRatio > night.pedestrianActiveRatio);
  assert.ok(day.vehicleActiveRatio > night.vehicleActiveRatio);
  assert.equal(day.activityBand, 'daytime-activity');
  assert.equal(night.activityBand, 'overnight-activity');
});

test('fresh aggregate traffic flow can tune demand and speed, but stale data fails closed', () => {
  const now = Date.UTC(2026, 8, 5, 12, 0, 0);
  const fresh = normalizeTrafficFlowSnapshot({
    source: 'test-flow',
    currentSpeed: 20,
    freeFlowSpeed: 50,
    updatedAtMs: now - 60_000,
    confidence: 1
  }, { now });
  const stale = normalizeTrafficFlowSnapshot({
    currentSpeed: 20,
    freeFlowSpeed: 50,
    updatedAtMs: now - 60 * 60_000
  }, { now });
  assert.equal(fresh.available, true);
  assert.ok(fresh.speedScale < 1);
  assert.ok(fresh.demandScale > 1);
  assert.deepEqual(stale, { available: false, reason: 'stale' });
});

test('mapped activity anchors raise route demand without inventing routes', () => {
  const segment = roadSegment();
  const withoutActivity = compileTrafficGraph({ traversal: { segments: [segment] }, tier: 'balanced' });
  const withActivity = compileTrafficGraph({
    traversal: { segments: [segment] },
    activityAnchors: [{ x: 50, z: 10, kind: 'retail', weight: 5 }],
    tier: 'balanced'
  });
  assert.equal(withActivity.publication.edges.length, withoutActivity.publication.edges.length);
  assert.ok(withActivity.publication.edges[0].activityScore > withoutActivity.publication.edges[0].activityScore);
  assert.ok(
    populationEdgeWeight(withActivity.publication.edges[0], 'vehicle') >
    populationEdgeWeight(withoutActivity.publication.edges[0], 'vehicle')
  );
});
