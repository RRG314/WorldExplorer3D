import test from 'node:test';
import assert from 'node:assert/strict';
import {auditCapturedRoadOverlap} from '../scripts/verification/street-captured-road-overlap.mjs';
const t = points => points.map(([x,z]) => ({x,y:0,z}));
const capture = triangles => ({surfaces:[{family:'road',triangles}]});
test('rendered capture audit distinguishes shared edges from duplicate tops',()=>{
  const a=t([[0,0],[2,0],[0,2]]),b=t([[2,0],[2,2],[0,2]]);
  assert.equal(auditCapturedRoadOverlap(capture([a,b])).overlappingPairs,0);
  const duplicate=auditCapturedRoadOverlap(capture([a,a]));
  assert.equal(duplicate.overlappingPairs,1);assert.equal(duplicate.pairwiseOverlapArea,2);
});
test('rendered capture audit catches partial overlap in either winding',()=>{
  const a=t([[0,0],[2,0],[0,2]]),b=t([[1,0],[3,0],[1,2]]);
  for(const triangle of [b,[...b].reverse()]) {
    const report=auditCapturedRoadOverlap(capture([a,triangle]));
    assert.equal(report.overlappingPairs,1);assert.equal(report.pairwiseOverlapArea,.5);
  }
});

test('collapsed Float32 triangles are reported separately instead of clipping the entire other triangle',()=>{
 const a=t([[0,0],[2,0],[0,2]]),line=t([[1,0],[1,1],[1,1]]);
 const report=auditCapturedRoadOverlap(capture([a,line]));
 assert.equal(report.degenerateTriangles,1);assert.equal(report.overlappingPairs,0);
});
