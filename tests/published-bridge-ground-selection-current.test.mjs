import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

import { retainExactRegionalStructures, pruneSupersededGeneralizedStructures } from '../app/js/world/fixed-regional-structures.js';
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

const passageFixture = JSON.parse(readFileSync(new URL('./fixtures/baltimore-building-passage-20261008.json', import.meta.url)));
function passageSelection() {
  const elements = structuredClone(passageFixture.elements);
  return {
    ways: elements.filter(e => e.type === 'way'),
    nodes: Object.fromEntries(elements.filter(e => e.type === 'node').map(n => [n.id, n]))
  };
}

test('captured building passage has one physical owner despite an inferred nearby street name', () => {
  const {ways, nodes} = passageSelection();
  const before = structuredClone(ways);
  const result = pruneSupersededGeneralizedStructures(ways, nodes);
  assert.deepEqual(result.ways.map(w => w.id), [757223800, 757223802]);
  assert.equal(result.supersededGeneralizedStructures, 1);
  assert.equal(result.ways[1], ways[1], 'keep the exact covered-passage authority');
  assert.deepEqual(ways, before, 'source geometry and semantics remain unchanged');
});

for (const [label, change] of [
  ['authoritative different name', ({ways}) => { delete ways[2].tags._nameProvenance; }],
  ['reviewed different corridor', ({ways}) => { ways[2].tags._reviewedStructureName = 'separate corridor'; }],
  ['explicit different reference', ({ways}) => { ways[2].tags.ref = 'Separate'; }],
  ['separate vertical level', ({ways}) => { ways[2].tags.layer = '-1'; }],
  ['nearby parallel passage', ({nodes}) => { for(const id of [-100,-101]) nodes[id].lon += 0.00005; }],
  ['partial exact coverage', ({nodes}) => { const a=nodes[7071480791], b=nodes[7071480792]; b.lat=(a.lat+b.lat)/2; b.lon=(a.lon+b.lon)/2; }],
  ['missing exact node', ({nodes}) => { delete nodes[7071480792]; }],
  ['truncated exact data', ({ways}) => { ways[1].tags._sourceTruncated = 'yes'; }],
  ['different structure family', ({ways}) => { delete ways[1].tags.tunnel; ways[1].tags.bridge = 'yes'; }],
  ['no exact data', data => { data.ways = data.ways.slice(2); }]
]) test(`inferred-name ownership retains fallback for ${label}`, () => {
  const data = passageSelection(); change(data);
  assert.ok(pruneSupersededGeneralizedStructures(data.ways, data.nodes).ways.some(w => w.id === -200));
});

test('only ground-accepted exact passage coverage retires the generalized fallback', () => {
  const {ways, nodes} = passageSelection();
  const rejected = nodes[7071480792];
  const unavailable = filterSelectionToAcceptedGround({roadWays:ways}, nodes, (lat,lon) => ({
    status: lat === rejected.lat && lon === rejected.lon ? 'unavailable' : 'available'
  }));
  assert.deepEqual(unavailable.selection.roadWays.map(w => w.id), [757223800,-200]);
  const available = filterSelectionToAcceptedGround({roadWays:ways}, nodes, () => ({status:'available'}));
  assert.deepEqual(available.selection.roadWays.map(w => w.id), [757223800,757223802]);
});
