import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inferBuildingPartKind,
  interpretBuildingSemantics
} from '../app/js/building-semantics.js';

test('OSM building=roof is a thin pass-through structure, not a full inferred building', () => {
  const tags = { building: 'roof', layer: '1' };
  const semantics = interpretBuildingSemantics(tags, {
    buildingType: 'roof',
    footprintArea: 4_000,
    footprintWidth: 90,
    footprintDepth: 45,
    fallbackHeight: 14
  });
  assert.equal(inferBuildingPartKind(tags), 'roof');
  assert.equal(semantics.partKind, 'roof');
  assert.equal(semantics.heightSource, 'fallback_part');
  assert.equal(semantics.heightMeters, 0.35);
  assert.equal(semantics.roofLike, true);
  assert.equal(semantics.allowsPassageBelow, true);
  assert.equal(semantics.shouldCreateGroundPatch, false);
  assert.equal(semantics.collisionKind, 'thin_part');
});

test('ordinary mapped residential buildings remain full structures', () => {
  const semantics = interpretBuildingSemantics({ building: 'residential', layer: '1' }, {
    buildingType: 'residential',
    footprintArea: 900,
    footprintWidth: 30,
    footprintDepth: 30,
    fallbackHeight: 12
  });
  assert.equal(semantics.partKind, 'full');
  assert.equal(semantics.heightMeters, 12);
  assert.equal(semantics.allowsPassageBelow, false);
  assert.equal(semantics.collisionKind, 'solid');
});

test('building:part roof semantics remain compatible', () => {
  const semantics = interpretBuildingSemantics({ building: 'yes', 'building:part': 'roof', min_height: '8' });
  assert.equal(semantics.partKind, 'roof');
  assert.equal(semantics.baseOffsetMeters, 8);
  assert.equal(semantics.heightMeters, 0.35);
});
