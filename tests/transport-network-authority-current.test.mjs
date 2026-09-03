import test from 'node:test';
import assert from 'node:assert/strict';

import { compileTransportNetworkModel } from '../app/js/world/compiler/transport-network-model.js';
import { filterSelectionToAcceptedGround } from '../app/js/world/compiler/accepted-ground-selection.js';

function generalizedElevatedRoad({ id, type, points, heights, verticalOrder = 1, name = 'Mapped elevated route' }) {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances.push(distances[index - 1] + Math.hypot(
      points[index].x - points[index - 1].x,
      points[index].z - points[index - 1].z
    ));
  }
  return {
    sourceFeatureId: id,
    type,
    width: 10,
    driveable: true,
    walkable: true,
    pts: points,
    transportRecord: {
      identity: id,
      completeness: 'generalized',
      routeState: 'complete',
      safeForDriving: true,
      sourceTags: { highway: type, name }
    },
    structureSemantics: {
      terrainMode: 'elevated',
      verticalOrder,
      gradeSeparated: true,
      isBridge: true
    },
    transportSurfaceModel: {
      distances: new Float32Array(distances),
      centerHeights: new Float32Array(heights)
    }
  };
}

test('a mapped generalized ramp joins the same elevated route at an exact endpoint', () => {
  const ramp = generalizedElevatedRoad({
    id: 'current:ramp',
    type: 'motorway_link',
    points: [{ x: 0, z: -8 }, { x: 15, z: 0 }],
    heights: [10, 12]
  });
  const motorway = generalizedElevatedRoad({
    id: 'current:motorway',
    type: 'motorway',
    points: [{ x: 10, z: 0 }, { x: 15, z: 0 }, { x: 20, z: 0 }],
    // Independent generalized fragments can sample different terrain. The
    // exact mapped join is stronger connection evidence than that discrepancy.
    heights: [20, 20, 20]
  });

  const graph = compileTransportNetworkModel([ramp, motorway]);

  assert.equal(graph.connections.length, 1);
  assert.equal(graph.connections[0].kind, 'endpoint-interior');
  assert.equal(graph.connections[0].provenance.method, 'generalized-aligned-endpoint-interior');
  assert.equal(ramp.connectedFeatures.end[0].feature, motorway);
  assert.equal(motorway.transportConnections[0].feature, ramp);
});

test('generalized elevated arterial and motorway fragments join across a tile seam', () => {
  const arterial = generalizedElevatedRoad({
    id: 'current:arterial-bridge',
    type: 'primary',
    name: 'Named bridge segment',
    points: [{ x: 0, z: 0 }, { x: 20, z: 0 }],
    heights: [8, 8]
  });
  const motorway = generalizedElevatedRoad({
    id: 'current:motorway-bridge',
    type: 'motorway',
    name: 'Named motorway segment',
    points: [{ x: 27, z: 0 }, { x: 47, z: 0 }, { x: 67, z: 0 }],
    heights: [8, 8, 8]
  });

  const graph = compileTransportNetworkModel([arterial, motorway]);

  assert.equal(graph.connections.length, 1);
  assert.equal(graph.connections[0].kind, 'endpoint-endpoint');
  assert.equal(graph.connections[0].provenance.method, 'generalized-aligned-endpoint-conflation');
});

test('named upper and lower bridge-level fragments share one generalized structure route', () => {
  const lower = generalizedElevatedRoad({
    id: 'lower',
    type: 'service',
    name: 'Ed Koch Queensboro Bridge Lower Level',
    points: [{ x: 0, z: 0 }, { x: 20, z: 0 }],
    heights: [8, 8]
  });
  const upper = generalizedElevatedRoad({
    id: 'upper',
    type: 'trunk',
    name: 'Ed Koch Queensboro Bridge Upper Level',
    points: [{ x: 26, z: 0 }, { x: 60, z: 0 }],
    heights: [8, 8]
  });
  const model = compileTransportNetworkModel([lower, upper]);
  assert.ok(model.connections.some((connection) =>
    new Set([connection.left.featureId, connection.right.featureId]).has('lower') &&
    new Set([connection.left.featureId, connection.right.featureId]).has('upper')));
});

test('a short named bridge terminal can join its deck as a perpendicular T-junction', () => {
  const terminal = generalizedElevatedRoad({
    id: 'bridge-terminal',
    type: 'service',
    name: 'Ed Koch Queensboro Bridge Lower Level',
    points: [{ x: 0, z: -3.5 }, { x: 0, z: 0 }],
    heights: [8, 8]
  });
  const deck = generalizedElevatedRoad({
    id: 'bridge-deck',
    type: 'trunk',
    name: 'Ed Koch Queensboro Bridge Upper Level',
    points: [{ x: -20, z: 6.75 }, { x: 20, z: 6.75 }],
    heights: [8, 8]
  });

  const model = compileTransportNetworkModel([terminal, deck]);

  assert.equal(model.connections.length, 1);
  assert.equal(model.connections[0].kind, 'endpoint-interior');
  assert.equal(model.connections[0].snapDistanceMeters, 6.75);
});

test('a long perpendicular bridge route is not conflated with a nearby deck', () => {
  const crossing = generalizedElevatedRoad({
    id: 'bridge-crossing',
    type: 'service',
    name: 'Ed Koch Queensboro Bridge Lower Level',
    points: [{ x: 0, z: -30 }, { x: 0, z: 0 }],
    heights: [8, 8]
  });
  const deck = generalizedElevatedRoad({
    id: 'bridge-deck',
    type: 'trunk',
    name: 'Ed Koch Queensboro Bridge Upper Level',
    points: [{ x: -20, z: 3.5 }, { x: 20, z: 3.5 }],
    heights: [8, 8]
  });

  const model = compileTransportNetworkModel([crossing, deck]);

  assert.equal(model.connections.length, 0);
});

test('a bundled reviewed bridge keeps its deck when constituent endpoints are over water', () => {
  const reviewedBridge = {
    type: 'way',
    id: 537838948,
    nodes: [1, 2],
    tags: {
      highway: 'motorway',
      bridge: 'yes',
      _regionalContext: 'fixed-location',
      _fixedRegionalStructure: 'exact',
      _reviewedStructureAuthority: 'bundled-landmark-pack'
    }
  };
  const result = filterSelectionToAcceptedGround(
    { roadWays: [reviewedBridge] },
    {
      1: { id: 1, lat: 37.81, lon: -122.48 },
      2: { id: 2, lat: 37.82, lon: -122.48 }
    },
    () => ({ status: 'unavailable' }),
    { sampleRegionalGroundAtLatLon: () => ({ status: 'unavailable' }) }
  );
  assert.deepEqual(result.selection.roadWays, [reviewedBridge]);
  assert.equal(result.diagnostics.exactStructureAuthorities, 1);
});
