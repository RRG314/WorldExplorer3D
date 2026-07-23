import assert from 'node:assert/strict';
import { sampleStructureVisualPolyline } from '../app/js/terrain/structure-visual-sampling.js';

const denseStraight = Array.from({ length: 101 }, (_, index) => ({ x: index * 0.5, z: 0 }));
const sampledStraight = sampleStructureVisualPolyline(denseStraight, 4);
assert.equal(sampledStraight[0], denseStraight[0]);
assert.equal(sampledStraight.at(-1), denseStraight.at(-1));
assert.ok(sampledStraight.length >= 12 && sampledStraight.length <= 15, `unexpected straight sample count ${sampledStraight.length}`);

const sharpCorner = [
  { x: 0, z: 0 },
  { x: 4, z: 0 },
  { x: 8, z: 0 },
  { x: 10, z: 0 },
  { x: 10, z: 2 },
  { x: 10, z: 6 },
  { x: 10, z: 10 }
];
const sampledCorner = sampleStructureVisualPolyline(sharpCorner, 6);
assert.ok(sampledCorner.includes(sharpCorner[3]), 'sharp bridge corner was removed');
assert.equal(sampledCorner[0], sharpCorner[0]);
assert.equal(sampledCorner.at(-1), sharpCorner.at(-1));

console.log(JSON.stringify({
  ok: true,
  densePointReduction: `${denseStraight.length}->${sampledStraight.length}`,
  endpointsPreserved: true,
  sharpCornersPreserved: true
}, null, 2));
