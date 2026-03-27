import assert from 'node:assert/strict';
import {
  assignFeatureConnections,
  buildFeatureStations,
  buildFeatureTransitionAnchors,
  classifyStructureSemantics,
  isRoadSurfaceReachable,
  sampleFeatureSurfaceY,
  updateFeatureSurfaceProfile
} from '../app/js/structure-semantics.js';

function makeFeature(id, pts, tags, width = 8, kind = 'road', subtype = '') {
  const semantics = classifyStructureSemantics(tags, {
    featureKind: kind,
    subtype
  });
  return {
    id,
    pts,
    width,
    kind,
    networkKind: kind,
    type: subtype || tags?.highway || '',
    subtype,
    structureTags: tags,
    structureSemantics: semantics,
    surfaceBias: 0.42,
    bounds: {
      minX: Math.min(...pts.map((p) => p.x)) - width,
      maxX: Math.max(...pts.map((p) => p.x)) + width,
      minZ: Math.min(...pts.map((p) => p.z)) - width,
      maxZ: Math.max(...pts.map((p) => p.z)) + width
    }
  };
}

function flatTerrain() {
  return 0;
}

function run() {
  const bridge = makeFeature(
    'bridge-main',
    [{ x: 0, z: 0 }, { x: 40, z: 0 }, { x: 80, z: 0 }],
    { highway: 'primary', bridge: 'yes', layer: '1', name: 'Harbor Spine' },
    12,
    'road',
    'primary'
  );
  const ramp = makeFeature(
    'bridge-ramp',
    [{ x: -70, z: 0 }, { x: -30, z: 0 }, { x: 0, z: 0 }],
    { highway: 'primary_link', placement: 'transition', name: 'Harbor Spine Ramp' },
    10,
    'road',
    'primary_link'
  );
  const crossPrimary = makeFeature(
    'cross-primary',
    [{ x: 0, z: -46 }, { x: 0, z: 0 }, { x: 0, z: 46 }],
    { highway: 'primary', name: 'Cross Avenue' },
    12,
    'road',
    'primary'
  );
  const tunnel = makeFeature(
    'tunnel-main',
    [{ x: 0, z: 26 }, { x: 40, z: 26 }, { x: 80, z: 26 }],
    { highway: 'secondary', tunnel: 'yes', layer: '-1' },
    10,
    'road',
    'secondary'
  );
  const tunnelApproach = makeFeature(
    'tunnel-approach',
    [{ x: -60, z: 26 }, { x: -20, z: 26 }, { x: 0, z: 26 }],
    { highway: 'secondary_link', placement: 'transition' },
    10,
    'road',
    'secondary_link'
  );
  const indoorCorridorSemantics = classifyStructureSemantics(
    { highway: 'footway', indoor: 'yes' },
    { featureKind: 'footway', subtype: 'footway' }
  );
  const coveredPassageSemantics = classifyStructureSemantics(
    { highway: 'footway', tunnel: 'building_passage', covered: 'yes' },
    { featureKind: 'footway', subtype: 'footway' }
  );

  assignFeatureConnections([bridge, ramp, crossPrimary, tunnel, tunnelApproach]);

  bridge.structureStations = buildFeatureStations(bridge, {
    features: [bridge],
    waterAreas: []
  });
  tunnel.structureStations = buildFeatureStations(tunnel, {
    features: [tunnel],
    waterAreas: []
  });

  updateFeatureSurfaceProfile(bridge, flatTerrain, { surfaceBias: 0.42 });
  updateFeatureSurfaceProfile(tunnel, flatTerrain, { surfaceBias: 0.42 });

  buildFeatureTransitionAnchors(ramp, flatTerrain);
  buildFeatureTransitionAnchors(crossPrimary, flatTerrain);
  buildFeatureTransitionAnchors(tunnelApproach, flatTerrain);

  updateFeatureSurfaceProfile(ramp, flatTerrain, { surfaceBias: 0.42 });
  updateFeatureSurfaceProfile(crossPrimary, flatTerrain, { surfaceBias: 0.42 });
  updateFeatureSurfaceProfile(tunnelApproach, flatTerrain, { surfaceBias: 0.42 });

  const bridgeStartY = sampleFeatureSurfaceY(bridge, 1, 0);
  const bridgeMidY = sampleFeatureSurfaceY(bridge, 40, 0);
  const rampFarY = sampleFeatureSurfaceY(ramp, -70, 0);
  const rampNearY = sampleFeatureSurfaceY(ramp, -3, 0);
  const crossPrimaryCenterY = sampleFeatureSurfaceY(crossPrimary, 0, 0);
  const crossPrimaryFarY = sampleFeatureSurfaceY(crossPrimary, 0, 40);
  const tunnelStartY = sampleFeatureSurfaceY(tunnel, 1, 26);
  const tunnelMidY = sampleFeatureSurfaceY(tunnel, 40, 26);
  const tunnelApproachFarY = sampleFeatureSurfaceY(tunnelApproach, -60, 26);
  const tunnelApproachNearY = sampleFeatureSurfaceY(tunnelApproach, -3, 26);
  const bridgeReachableFromBelow = isRoadSurfaceReachable({
    road: bridge,
    dist: 1.2,
    y: bridgeStartY,
    verticalDelta: Math.abs(bridgeStartY - 0.42)
  });
  const bridgeReachableAtTransitionFromBelow = isRoadSurfaceReachable({
    road: bridge,
    dist: 1.2,
    y: bridgeStartY,
    verticalDelta: Math.abs(bridgeStartY - 0.42),
    distanceToTransitionZone: 0
  });
  const bridgeReachableAtTransitionOnDeck = isRoadSurfaceReachable({
    road: bridge,
    dist: 1.2,
    y: bridgeStartY,
    verticalDelta: 1.1,
    distanceToTransitionZone: 0
  });
  const bridgeReachableFromRamp = isRoadSurfaceReachable({
    road: bridge,
    dist: 1.2,
    y: bridgeStartY,
    verticalDelta: Math.abs(bridgeStartY - (rampNearY - 0.35))
  }, {
    currentRoad: ramp
  });
  const tunnelReachableFromSurface = isRoadSurfaceReachable({
    road: tunnel,
    dist: 1.4,
    y: tunnelStartY,
    verticalDelta: Math.abs(tunnelStartY - 0.42)
  });

  assert.ok(bridgeStartY > 4.5, `bridge endpoints should stay elevated, got ${bridgeStartY}`);
  assert.ok(bridgeMidY >= bridgeStartY - 0.2, 'bridge midpoint should not collapse below its deck endpoints');
  assert.ok(Array.isArray(ramp.structureTransitionAnchors) && ramp.structureTransitionAnchors.length > 0, 'ramp should inherit transition anchors from connected bridge');
  assert.ok(rampNearY > rampFarY + 2.5, `ramp should rise toward the bridge deck, got far=${rampFarY}, near=${rampNearY}`);
  assert.ok(Math.abs(rampNearY - bridgeStartY) < 1.4, `ramp should meet bridge endpoint height, got ramp=${rampNearY}, bridge=${bridgeStartY}`);
  assert.equal(crossPrimary.structureTransitionAnchors.length, 0, 'perpendicular through street should not inherit bridge transition anchors');
  assert.ok(Math.abs(crossPrimaryCenterY - crossPrimaryFarY) < 0.75, `perpendicular through street should stay near grade, got center=${crossPrimaryCenterY}, far=${crossPrimaryFarY}`);

  assert.ok(tunnelStartY < -3, `tunnel endpoints should stay below grade, got ${tunnelStartY}`);
  assert.ok(tunnelMidY <= tunnelStartY + 0.2, 'tunnel midpoint should remain within the subgrade channel');
  assert.ok(Array.isArray(tunnelApproach.structureTransitionAnchors) && tunnelApproach.structureTransitionAnchors.length > 0, 'tunnel approach should inherit transition anchors from connected tunnel');
  assert.ok(tunnelApproachNearY < tunnelApproachFarY - 1.8, `tunnel approach should slope downward, got far=${tunnelApproachFarY}, near=${tunnelApproachNearY}`);
  assert.equal(indoorCorridorSemantics.gradeSeparated, false, 'indoor footways without explicit elevation should stay at grade');
  assert.equal(indoorCorridorSemantics.terrainMode, 'at_grade', 'indoor footways without explicit elevation should not become elevated skywalks');
  assert.equal(coveredPassageSemantics.gradeSeparated, false, 'covered building passages without explicit elevation should stay at grade');
  assert.equal(coveredPassageSemantics.terrainMode, 'at_grade', 'covered building passages should not be elevated by default');
  assert.equal(bridgeReachableFromBelow, false, 'bridge deck should not be reachable from ground directly below it');
  assert.equal(bridgeReachableAtTransitionFromBelow, false, 'bridge endpoint should not capture a ground vehicle just because it is near a transition');
  assert.equal(bridgeReachableAtTransitionOnDeck, true, 'bridge transition should still be reachable when the vehicle is already close to deck height');
  assert.equal(bridgeReachableFromRamp, true, 'connected ramp should still be allowed onto the bridge deck');
  assert.equal(tunnelReachableFromSurface, false, 'subgrade tunnel should not be reachable from the surface above it');

  console.log(JSON.stringify({
    ok: true,
    bridgeStartY,
    bridgeMidY,
    rampFarY,
    rampNearY,
    crossPrimaryCenterY,
    crossPrimaryFarY,
    tunnelStartY,
    tunnelMidY,
    tunnelApproachFarY,
    tunnelApproachNearY,
    bridgeReachableFromBelow,
    bridgeReachableAtTransitionFromBelow,
    bridgeReachableAtTransitionOnDeck,
    bridgeReachableFromRamp,
    tunnelReachableFromSurface,
    indoorCorridorSemantics,
    coveredPassageSemantics,
    rampAnchors: ramp.structureTransitionAnchors.length,
    tunnelAnchors: tunnelApproach.structureTransitionAnchors.length
  }, null, 2));
}

try {
  run();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: String(error?.message || error)
  }, null, 2));
  process.exitCode = 1;
}
