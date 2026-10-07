import test from 'node:test';
import assert from 'node:assert/strict';
import {clipVectorLineToTile,stitchVectorRoadElements,vectorRoadIsDirected} from '../app/js/world/vector-line-ownership.js';
import {fetchShortbreadWorldData} from '../app/js/world/shortbread-source.js';
const ll=(x,y,z=14)=>[x/2**z*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/2**z)))*180/Math.PI];
const merc=([lon,lat],z=14)=>[(lon+180)/360*2**z,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z];
test('adjacent buffered fragments own disjoint road lengths with a shared seam',()=>{
  // Monaco-style buffer: each tile includes part of the neighbor's tunnel.
  const west=[ll(8529.9,5974.5),ll(8530.02,5974.55)];
  const east=[ll(8529.98,5974.533333333333),ll(8530.1,5974.583333333333)];
  const a=clipVectorLineToTile(west,8529,5974,14),b=clipVectorLineToTile(east,8530,5974,14);
  assert.equal(a.length,1);assert.equal(b.length,1);
  assert.ok(Math.abs(a[0].at(-1)[0]-b[0][0][0])<1e-12);
  assert.ok(Math.abs(a[0].at(-1)[1]-b[0][0][1])<1e-10);
  for(const p of a.flat())assert.ok(merc(p)[0]<=8530+1e-9);
  for(const p of b.flat())assert.ok(merc(p)[0]>=8530-1e-9);
});
test('crossing, re-entry and reverse traversal preserve the full owned line without connecting outside excursions',()=>{
 const input=[ll(11.2,20.2),ll(12.2,20.2),ll(12.2,20.8),ll(11.2,20.8)];
 const paths=clipVectorLineToTile(input,11,20,14);
 assert.equal(paths.length,2);assert.equal(paths[0][0],input[0]);assert.equal(paths[1].at(-1),input.at(-1));
 const reverse=clipVectorLineToTile([...input].reverse(),11,20,14);
 for(let i=0;i<2;i++)for(let j=0;j<2;j++)for(let k=0;k<2;k++)assert.ok(Math.abs(paths[i][j][k]-reverse[1-i][1-j][k])<1e-12);
});
test('unbuffered interior geometry is unchanged, corner tangencies publish no road, boundary lines have one owner',()=>{
 const inside=[ll(11.2,20.2),ll(11.5,20.7),ll(11.9,20.8)];
 assert.deepEqual(clipVectorLineToTile(inside,11,20,14),[inside]);
 assert.deepEqual(clipVectorLineToTile([ll(10,20),ll(11,19)],11,20,14),[]);
 const boundary=[ll(12,20.2),ll(12,20.8)];
 assert.deepEqual(clipVectorLineToTile(boundary,11,20,14),[]);
 assert.deepEqual(clipVectorLineToTile(boundary,12,20,14),[boundary]);
});

test('provider conversion clips before graph nodes and preserves stacked roads with identical footprints',async()=>{
 const result=await fetchShortbreadWorldData({lat:30,lon:0,zoom:2,bounds:{minLat:29,maxLat:31,minLon:-1,maxLon:1},layerNames:['streets'],includeBuildings:false,
  shortbreadFetchTile:async(z,x,y)=>({z,x,y,tile:{layers:{streets:{length:2,feature:i=>({id:i,toGeoJSON:()=>({properties:{kind:'primary',...(i?{tunnel:true,layer:-1}:{bridge:true,layer:1})},geometry:{type:'LineString',coordinates:[[-1,30],[1,30]]}})})}}}})});
 const nodes=new Map(result.elements.filter(e=>e.type==='node').map(n=>[n.id,n]));
 const ways=result.elements.filter(e=>e.type==='way');assert.equal(ways.length,2);
 for(const way of ways){
  const line=way.nodes.map(id=>nodes.get(id));
  assert.deepEqual([line[0].lon,line.at(-1).lon],[-1,1]);
  assert.equal(way.sourceFragments.length,2);
  assert.equal(line.some(p=>Math.abs(p.lon)<1e-10),true);
 }
 assert.equal(ways.filter(w=>w.tags.tunnel==='yes').length,1);
 assert.equal(ways.filter(w=>w.tags.bridge==='yes').length,1);
});

test('tile stitching preserves directed carriageways and implicit roundabouts',()=>{
 for(const tags of [{oneway:'yes'},{oneway:'-1'},{junction:'roundabout'},{highway:'motorway'}]){
  assert.equal(vectorRoadIsDirected(tags),true);
  const node=(id,x)=>{const [lon,lat]=ll(x,5974.5);return {id,type:'node',lon,lat}};
  const a={type:'way',id:1,nodes:[1,2],vectorRoadTile:{z:14,x:8529,y:5974},tags:{highway:'primary',...tags,_sourceFeatureId:'a'}};
  const b={type:'way',id:2,nodes:[3,2],vectorRoadTile:{z:14,x:8530,y:5974},tags:{highway:'primary',...tags,_sourceFeatureId:'b'}};
  const nodes=[node(1,8529.9),node(2,8530),node(3,8530.1)];
  assert.equal(stitchVectorRoadElements([...nodes,a,b]).filter(x=>x.type==='way').length,2);
  b.nodes.reverse();const joined=stitchVectorRoadElements([...nodes,a,b]).filter(x=>x.type==='way');
  assert.equal(joined.length,1);assert.deepEqual(joined[0].nodes,[1,2,3]);
 }
 assert.equal(vectorRoadIsDirected({junction:'roundabout',oneway:'no'}),false);
});

test('provider deduplication cannot discard opposite one-way or access-distinct roads',async()=>{
 const result=await fetchShortbreadWorldData({lat:30,lon:0,zoom:2,bounds:{minLat:29,maxLat:31,minLon:.1,maxLon:.9},layerNames:['streets'],includeBuildings:false,
  shortbreadFetchTile:async(z,x,y)=>({z,x,y,tile:{layers:{streets:{length:3,feature:i=>({id:i,toGeoJSON:()=>({properties:{kind:'primary',oneway:true,...(i===2?{access:'private'}:{})},geometry:{type:'LineString',coordinates:i===1?[[.8,30],[.2,30]]:[[.2,30],[.8,30]]}})})}}}})});
 const ways=result.elements.filter(e=>e.type==='way');assert.equal(ways.length,3);
 const nodes=new Map(result.elements.filter(e=>e.type==='node').map(e=>[e.id,e]));
 assert.equal(ways.filter(w=>nodes.get(w.nodes[0]).lon>nodes.get(w.nodes.at(-1)).lon).length,1);
 assert.equal(ways.filter(w=>w.tags.access==='private').length,1);
});
