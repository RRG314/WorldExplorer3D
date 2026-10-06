import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFarMappedContext,selectFarBuildingCoverage,farBuildingPriority} from '../app/js/terrain/far-field-mapped-context.js';

const box=(x,y,size=.00015)=>[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
const feature=(id,rings,properties={})=>({id,toGeoJSON:()=>({properties,geometry:{type:'MultiPolygon',coordinates:rings.map(r=>[r])}})});
const layer=features=>({length:features.length,feature:i=>features[i]});
const bounds={latS:0,latN:.001,lonW:0,lonE:.001};
const fetchFixture=buildings=>async(z,x,y)=>({z,x,y,tile:{layers:z===14?{buildings:layer(buildings)}:{}}});

test('all eligible rings are counted; malformed, out-of-region and near-owned footprints are separate',async()=>{
 const rings=[box(.0001,.0001),box(.0003,.0001),box(.0005,.0001),box(.0007,.0001),box(.1,.1),[[0,0],[1,1]],box(.0001,.0005)];
 const result=await loadFarMappedContext(bounds,{latS:.0005,latN:.0008,lonW:0,lonE:.0003},bounds,{fetchTile:fetchFixture([feature(1,rings)])});
 // Bounds straddle the equator: the fixture repeats per requested source tile.
 const n=result.loadedTiles;
 assert.equal(result.sourceBuildings,7*n);assert.equal(result.invalidBuildings,n);
 assert.equal(result.outsideBuildings,n);assert.equal(result.skippedNearBuildings,n);
 assert.equal(result.availableBuildings,4*n);assert.ok(result.selectedBuildingCoverage>=.95);
 assert.equal(result.buildingBudgetExceeded,false);
});

test('dense tiles can use the global budget left unused by sparse tiles',()=>{
 const dense=Array.from({length:10000},(_,i)=>({identity:`dense-${i}`,priority:10}));
 const sparse=Array.from({length:199},(_,i)=>[{identity:`sparse-${i}`,priority:10}]);
 const result=selectFarBuildingCoverage([dense,...sparse]);
 assert.equal(result.availableBuildings,10199);assert.equal(result.buildings.length,Math.ceil(10199*.95));
 assert.ok(result.buildings.filter(b=>b.identity.startsWith('dense')).length>=9300);
});

test('major buildings survive source ordering and the budget warning cannot report complete coverage',()=>{
 const ordinary=Array.from({length:100},(_,i)=>({identity:`house-${i}`,priority:10}));
 const major={identity:'last-skyscraper',priority:farBuildingPriority({height:120},90)};
 const result=selectFarBuildingCoverage([[...ordinary,major]],{maxInstances:10});
 assert.equal(result.availableBuildings,101);assert.equal(result.buildings.length,10);
 assert.equal(result.buildings.includes(major),true);assert.equal(result.majorBuildingsAvailable,1);
 assert.equal(result.majorBuildingsSelected,1);assert.equal(result.buildingBudgetExceeded,true);
});

test('failed source tiles do not silently become complete source coverage',async()=>{
 let calls=0;
 const fetchTile=async(z,x,y)=>{if(z===14&&calls++===0)throw Error('unavailable');return fetchFixture([feature(1,[box(.0001,.0001)])])(z,x,y);};
 const result=await loadFarMappedContext(bounds,null,bounds,{fetchTile});
 assert.ok(result.loadedTiles<result.requestedTiles);
});

test('compact instance dimensions preserve the existing building massing and height authority',async()=>{
 const {resolveFarBuildingMassing}=await import('../app/js/terrain/far-building-massing.js');
 for(const height of [undefined,6,35,90])for(const width of [5,12,40]){
  const b={widthMeters:width,depthMeters:9,identity:`same-${height}-${width}`,properties:{height,kind:'residential'}};
  const footprint=[{x:0,z:0},{x:width,z:0},{x:width,z:9},{x:0,z:9}];
  assert.deepEqual(resolveFarBuildingMassing(b,null,width*9,1),resolveFarBuildingMassing(b,footprint,width*9,1));
 }
});

test('regional request count is bounded without selecting a building-free zoom',async()=>{
 const {limitContextTiles}=await import('../app/js/terrain/far-field-mapped-context.js');
 const requested=Array.from({length:10000},(_,i)=>({x:i%100,y:Math.floor(i/100)}));
 const selected=limitContextTiles(requested,512);assert.equal(selected.length,512);
 assert.ok(selected.some(t=>t.x===50&&t.y===50));
 assert.ok(selected.every(t=>t.x>25&&t.x<75&&t.y>25&&t.y<75));
 const zooms=[];
 await loadFarMappedContext(bounds,null,bounds,{contextZoom:13,fetchTile:async(z,x,y)=>{zooms.push(z);return fetchFixture([])(z,x,y);}});
 assert.ok(zooms.includes(14));assert.equal(zooms.includes(13),false);
});
