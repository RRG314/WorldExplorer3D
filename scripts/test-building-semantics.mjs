import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = process.cwd();
const moduleUrl = pathToFileURL(path.join(rootDir, 'app/js/building-semantics.js')).href;
const {
  DEFAULT_LEVEL_HEIGHT_METERS,
  interpretBuildingSemantics
} = await import(moduleUrl);

const levelHeight = DEFAULT_LEVEL_HEIGHT_METERS;

const roof = interpretBuildingSemantics({
  'building:part': 'roof',
  level: '3'
});
assert.equal(roof.partKind, 'roof');
assert.equal(roof.baseOffsetMeters, 3 * levelHeight);
assert.ok(roof.heightMeters <= 0.5);
assert.equal(roof.allowsPassageBelow, true);

const balcony = interpretBuildingSemantics({
  'building:part': 'balcony',
  level: '2'
});
assert.equal(balcony.partKind, 'balcony');
assert.equal(balcony.baseOffsetMeters, levelHeight);
assert.ok(balcony.heightMeters <= 0.5);

const elevatedPart = interpretBuildingSemantics({
  'building:part': 'part',
  'building:min_level': '2',
  'building:levels': '3'
});
assert.equal(elevatedPart.baseOffsetMeters, 2 * levelHeight);
assert.equal(elevatedPart.heightMeters, 3 * levelHeight);
assert.equal(elevatedPart.allowsPassageBelow, true);

const explicitHeight = interpretBuildingSemantics({
  building: 'yes',
  min_height: '5',
  height: '8'
});
assert.equal(explicitHeight.baseOffsetMeters, 5);
assert.equal(explicitHeight.heightMeters, 8);

const explicitFeetHeight = interpretBuildingSemantics({
  building: 'yes',
  min_height: '12 ft',
  height: '36 ft'
});
assert.ok(Math.abs(explicitFeetHeight.baseOffsetMeters - 3.6576) < 1e-3);
assert.ok(Math.abs(explicitFeetHeight.heightMeters - 10.9728) < 1e-3);

const fallback = interpretBuildingSemantics({
  building: 'office'
}, {
  fallbackHeight: 26
});
assert.equal(fallback.partKind, 'full');
assert.equal(fallback.heightMeters, 26);
assert.equal(fallback.baseOffsetMeters, 0);

const cappedRooftopPart = interpretBuildingSemantics({
  'building:part': 'yes',
  min_height: '40',
  height: '150'
}, {
  footprintArea: 28,
  footprintWidth: 4,
  footprintDepth: 7
});
assert.equal(cappedRooftopPart.heightCapped, true);
assert.ok(cappedRooftopPart.heightMeters <= 18);

const intentionalTowerPart = interpretBuildingSemantics({
  'building:part': 'yes',
  man_made: 'chimney',
  min_height: '40',
  height: '150'
}, {
  footprintArea: 28,
  footprintWidth: 4,
  footprintDepth: 7
});
assert.equal(intentionalTowerPart.heightCapped, false);
assert.equal(intentionalTowerPart.heightMeters, 150);

console.log(JSON.stringify({
  ok: true,
  levelHeight,
  cases: {
    roof,
    balcony,
    elevatedPart,
    explicitHeight,
    explicitFeetHeight,
    fallback,
    cappedRooftopPart,
    intentionalTowerPart
  }
}, null, 2));
