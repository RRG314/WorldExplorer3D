import test from 'node:test';
import assert from 'node:assert/strict';

import { retainExactRegionalStructures } from '../app/js/world/fixed-regional-structures.js';
import { filterSelectionToAcceptedGround } from '../app/js/world/compiler/accepted-ground-selection.js';

test('a reviewed bridge with a published surface control survives shoreline ground gaps', () => {
  const data = {
    _transportSurfaceControls: [{
      id: 'current:published-bridge',
      match: { sourceFeatureIds: ['osm:way:100'] }
    }],
    elements: [
      { type: 'node', id: 1, lat: 1, lon: 1 },
      { type: 'node', id: 2, lat: 1.01, lon: 1.01 },
      {
        type: 'way',
        id: 100,
        nodes: [1, 2],
        tags: { highway: 'motorway', bridge: 'yes', name: 'Reviewed Bridge' }
      }
    ]
  };

  const retained = retainExactRegionalStructures(data);
  const bridge = retained.elements.find((element) => element.type === 'way');
  assert.equal(bridge.tags._publishedTransportSurfaceControlId, 'current:published-bridge');

  const result = filterSelectionToAcceptedGround(
    { roadWays: [bridge] },
    { 1: data.elements[0], 2: data.elements[1] },
    () => ({ status: 'unavailable' }),
    { sampleRegionalGroundAtLatLon: () => ({ status: 'unavailable' }) }
  );

  assert.equal(result.selection.roadWays.length, 1);
  assert.equal(result.diagnostics.reviewedBridgeSpansAcceptedByEndpoints, 0);
  assert.equal(result.diagnostics.publishedControlBridgeSpansAccepted, 1);
});
