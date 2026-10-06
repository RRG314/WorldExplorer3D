import test from 'node:test';
import assert from 'node:assert/strict';
import {createRegionalRoadCoveragePlan,regionalRoadSurfacePolicy,clipRoadSegment,buildRegionalRoadCoverageMask} from '../app/js/terrain/regional-road-coverage.js';
const make=(options={})=>createRegionalRoadCoveragePlan({bounds:{minX:0,minZ:0,maxX:1024,maxZ:1024},geoToWorld:(lat,lon)=>({x:lon,z:lat}),...options});
const line=coords=>({type:'LineString',coordinates:coords});

test('all mapped surface roads get coverage without spending the detailed transport budget',()=>{
 const p=make();for(let i=0;i<20001;i++)p.addGeometry(line([[2,3],[18,3]]),{kind:'residential'});
 assert.equal(p.stats.surfaceLines,20001);assert.equal(p.stats.segments,20001);assert.equal(p.stats.budgetExceeded,false);
 p.dispose();assert.equal(p.cells.size,0);assert.throws(()=>p.addGeometry(line([[2,3],[18,3]]),{kind:'residential'}),/retired/);
});
test('bridges, tunnels, layered roads and railways are never painted onto ground',()=>{
 for(const props of [{bridge:true},{tunnel:true},{layer:1},{layer:-1},{covered:true},{location:'underground'}])assert.equal(regionalRoadSurfacePolicy({kind:'primary',...props}).role,'structure');
 assert.equal(regionalRoadSurfacePolicy({kind:'primary',bridge:false,layer:0}).role,'surface');
 assert.equal(regionalRoadSurfacePolicy({kind:'rail',rail:true}),null);
 assert.equal(regionalRoadSurfacePolicy({kind:'runway'}),null);
 const p=make();p.addGeometry(line([[2,3],[18,3]]),{kind:'primary',bridge:true});
 assert.equal(p.stats.structureLines,1);assert.equal(p.cells.size,0);
});
test('widths use the same source cross section as physical roads, once in world units',()=>{
 const p=make({unitsPerMeter:.5});p.addGeometry(line([[20,20],[40,20]]),{kind:'residential',width:'12'});
 assert.ok([...p.cells.values()].flat().every(s=>s[4]===6));
});
test('clipping preserves crossing roads and avoids connecting malformed or disconnected paths',()=>{
 assert.deepEqual(clipRoadSegment(-10,5,10,5,{minX:0,minZ:0,maxX:8,maxZ:8}),[0,5,8,5]);
 assert.equal(clipRoadSegment(-10,-5,10,-5,{minX:0,minZ:0,maxX:8,maxZ:8}),null);
 const p=make();p.addGeometry({type:'MultiLineString',coordinates:[[[1,1],[10,1]],[[300,300],[320,300]]]}, {kind:'secondary'});
 assert.equal(p.stats.surfaceLines,2);assert.equal(p.stats.segments,2);assert.equal(p.cells.has('0:1'),false);
 p.addGeometry(line([[1,1],[NaN,2],[4,1]]),{kind:'secondary'});assert.equal(p.stats.invalidLines,1);assert.equal(p.stats.segments,2);
});
test('the explicit resource ceiling fails coverage instead of claiming that the truncated network is complete',async()=>{
 const p=make({maxSegments:1});p.addGeometry(line([[1,1],[10,1],[20,1]]),{kind:'primary'});
 assert.equal(p.stats.budgetExceeded,true);await assert.rejects(buildRegionalRoadCoverageMask({},p),/bounded input budget/);assert.equal(p.cells.size,0);
});
test('cancelling before mask compilation frees the staged cell inputs',async()=>{
 const p=make();p.addGeometry(line([[1,1],[10,1]]),{kind:'primary'});
 const controller=new AbortController();controller.abort();
 await assert.rejects(buildRegionalRoadCoverageMask({},p,{signal:controller.signal}),{name:'AbortError'});assert.equal(p.cells.size,0);
});
