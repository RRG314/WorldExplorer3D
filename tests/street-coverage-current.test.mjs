import test from 'node:test';
import assert from 'node:assert/strict';
import { auditStreetCoverage, segmentCoverageFraction } from '../app/js/world/street-coverage.js';
import { assessStreetQuality } from '../app/js/world/street-quality-assessment.js';

const bounds={minX:-384,maxX:384,minZ:-384,maxZ:384};
const road=(a,b,tags={sidewalk:'both'})=>({pts:[a,b],type:'residential',transportRecord:{sourceTags:tags}});
test('144 completed cells cannot certify a larger loaded street network',()=>{
 const sourceCoverage=auditStreetCoverage({coverageBounds:bounds,metersPerWorldUnit:1,roads:[road({x:-768,z:0},{x:768,z:0})]});
 assert.equal(sourceCoverage.compilationCoveragePercent,50);
 assert.equal(sourceCoverage.outsideCompilationWindowMeters,1536);
 assert.equal(sourceCoverage.status,'incomplete');
 const result=assessStreetQuality({street:{plannedTiles:144,tiles:144,sourceCoverage}});
 assert.equal(result.status,'fail');assert.match(result.failures.join(' '),/beyond/);
});
test('coverage clips crossing segments even when both endpoints are outside',()=>{
 assert.equal(segmentCoverageFraction({x:-768,z:-768},{x:768,z:768},bounds),.5);
 assert.equal(segmentCoverageFraction({x:-500,z:500},{x:500,z:500},bounds),0);
 assert.equal(segmentCoverageFraction({x:0,z:0},{x:100,z:100},bounds),1);
});
test('rural unknowns, explicit exclusions and elevated roads do not demand inferred ground sidewalks',()=>{
 const roads=[road({x:800,z:0},{x:900,z:0},{}),road({x:800,z:0},{x:900,z:0},{sidewalk:'no'}),{...road({x:800,z:0},{x:900,z:0}),structureSemantics:{terrainMode:'elevated'}}];
 const result=auditStreetCoverage({roads,coverageBounds:bounds});
 assert.equal(result.status,'unknown');assert.equal(result.requiredSegments,0);
});
test('urban frontages and separately mapped sidewalks count outside the current window',()=>{
 const result=auditStreetCoverage({roads:[road({x:800,z:0},{x:900,z:0},{})],buildings:[{pts:[{x:800,z:10},{x:900,z:10},{x:900,z:20}]}],linearFeatures:[{kind:'footway',subtype:'sidewalk',pts:[{x:0,z:0},{x:100,z:0}]}],coverageBounds:bounds,metersPerWorldUnit:1});
 assert.equal(result.requiredSidewalkMeters,300);assert.equal(result.withinCompilationWindowMeters,100);
 assert.equal(result.uncoveredSegments,1);
});
test('moving compilation windows change coverage without changing the required network',()=>{
 const roads=[road({x:700,z:0},{x:900,z:0})];
 const before=auditStreetCoverage({roads,coverageBounds:bounds});
 const after=auditStreetCoverage({roads,coverageBounds:{...bounds,minX:500,maxX:1100}});
 assert.equal(before.requiredSidewalkMeters,after.requiredSidewalkMeters);
 assert.equal(before.compilationCoveragePercent,0);assert.equal(after.compilationCoveragePercent,100);
});
