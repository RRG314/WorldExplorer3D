import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {normalizeLanduseSurfaceType,summarizeSurfaceSignals} from '../app/js/surface-rules.js';
import {collectWorldVegetationPlacements,initWorldVegetation} from '../app/js/world/vegetation.js';
import {currentMappedGroundIndex,resetMappedGroundIndex,mappedAreaContains} from '../app/js/terrain/mapped-ground-evidence.js';
import {fetchShortbreadWorldData} from '../app/js/world/shortbread-source.js';

const ring=(x,z,w)=>[{x,z},{x:x+w,z},{x:x+w,z:z+w},{x,z:z+w}];
const feature=(type,x,z,w,extra={})=>({type,pts:ring(x,z,w),bounds:{minX:x,maxX:x+w,minZ:z,maxZ:z+w},sourceFeatureId:`${type}:${x}:${z}:${w}`,tags:{},...extra});
function setup(landuses,extra={}) {
  for(const key of Object.keys(ctx))delete ctx[key];
  Object.assign(ctx,{landuses,LOC:{lat:40,lon:0},worldSeed:1,worldSurfaceProfile:null,
    _worldLoadSequence:1,waterAreas:[],waterways:[],osmTreeNodes:[],osmTreeRows:[],
    terrainGroup:{children:[]},geoToWorld:(lat,lon)=>({x:lon,z:lat}),
    elevationWorldYAtWorldXZ:()=>0,terrainMeshHeightAt:()=>0,
    activeTransportActor:()=>({position:{x:100,z:100}}),
    rand01FromInt:n=>((Math.imul(n>>>0,1664525)+1013904223)>>>0)/4294967296,...extra});
  resetMappedGroundIndex(ctx);
  initWorldVegetation({findNearestRoad:()=>({road:null,dist:Infinity}),getNearbyBuildings:()=>[],
    isRoadSurfaceReachable:()=>false,pointInPolygon:(x,z,pts)=>mappedAreaContains({pts,bounds:{minX:-Infinity,maxX:Infinity,minZ:-Infinity,maxZ:Infinity}},x,z),
    signedPolygonAreaXZ:pts=>pts.reduce((a,p,i)=>{const q=pts[(i+1)%pts.length];return a+p.x*q.z-q.x*p.z;},0)/2});
}

test('protected-area purpose never supplies forest; wetland retains its physical class',()=>{
  setup([]);
  assert.equal(normalizeLanduseSurfaceType({leisure:'nature_reserve'}),'nature_reserve');
  assert.equal(normalizeLanduseSurfaceType({boundary:'national_park'}),'national_park');
  assert.equal(normalizeLanduseSurfaceType({boundary:'protected_area',natural:'bare_rock'}),'barren');
  assert.equal(normalizeLanduseSurfaceType({leisure:'nature_reserve',natural:'wood'}),'wood');
  assert.equal(normalizeLanduseSurfaceType({natural:'wetland'}),'wetland');
  assert.equal(summarizeSurfaceSignals([{tags:{natural:'wetland'}}]).normalized.vegetated,1);
});

test('actual placement respects polygon holes, mapped clearings and overlapping forest owners',()=>{
  const hole=ring(90,90,60), forest=feature('forest',40,40,300,{holeRings:[hole],tags:{leaf_type:'needleleaved'}});
  const clearing=feature('grass',190,40,100);
  const nested=feature('wood',40,190,100);
  const signatures=[];
  for(const list of [[forest,clearing,nested],[nested,clearing,forest]]) {
    setup(list);
    const points=collectWorldVegetationPlacements().filter(p=>p.source==='polygon');
    assert.ok(points.length>20);
    assert.ok(points.every(p=>!mappedAreaContains(feature('hole',90,90,60),p.x,p.z)));
    assert.ok(points.every(p=>!mappedAreaContains(clearing,p.x,p.z)));
    assert.ok(points.some(p=>p.leafType==='needleleaved'));
    signatures.push(points.map(p=>`${p.x}:${p.z}`).sort());
  }
  assert.deepEqual(signatures[0],signatures[1]);
});

test('a broad park or reserve does not suppress measured forest within it',()=>{
  for(const type of ['park','nature_reserve','national_park']){
    setup([feature(type,0,0,500)],{terrainGroup:{children:[{position:{x:0,z:0},userData:{
      terrainTile:{bounds:{latN:500,latS:0,lonW:0,lonE:500}},
      worldCoverResult:{vegetationSamples:[{u:.4,v:.6,kind:'tree'}]}}}]}});
    const points=collectWorldVegetationPlacements();
    assert.ok(points.some(p=>p.source==='worldcover'&&p.x===200&&p.z===200),type);
  }
});

test('mapped marsh without raster produces bounded soft groundcover, with holes and clearing retained',()=>{
  const wetland=feature('wetland',0,0,200,{tags:{natural:'wetland',wetland:'marsh'},holeRings:[ring(80,80,40)]});
  const clearing=feature('park',130,70,60,{tags:{surface:'sand'}});
  setup([wetland,clearing]);
  const points=collectWorldVegetationPlacements();
  assert.ok(points.length>50);
  assert.ok(points.length<=600);
  assert.ok(points.every(p=>p.landuseType==='wetland_groundcover'));
  assert.ok(points.every(p=>Math.hypot(p.x-100,p.z-100)<=90));
  assert.ok(points.every(p=>mappedAreaContains(wetland,p.x,p.z)&&!mappedAreaContains(clearing,p.x,p.z)));
  assert.equal(new Set(points.map(p=>`${Math.floor(p.x/4)}:${Math.floor(p.z/4)}`)).size,points.length);
});

test('polygon fallback cannot bypass the same hole and physical-cover rules',()=>{
  setup([feature('forest',80,80,40,{holeRings:[ring(70,70,60)]})]);
  assert.deepEqual(collectWorldVegetationPlacements(),[]);
});

test('physical-cover sampler is shared and releases its old collection after reset',()=>{
  setup([feature('forest',0,0,200)]);
  const first=currentMappedGroundIndex(ctx);
  assert.equal(currentMappedGroundIndex(ctx),first);
  ctx.landuses.push(feature('park',90,90,40,{tags:{surface:'sand'}}));
  const second=currentMappedGroundIndex(ctx);
  assert.notEqual(first,second);assert.equal(second.sample(100,100).mode,'sand');
  ctx.landuses=[];resetMappedGroundIndex(ctx);
  assert.equal(currentMappedGroundIndex(ctx).sample(100,100),null);
});

test('vector land/site conversion retains protected areas and physical wood/wetland classes',async()=>{
  const kinds=['national_park','nature_reserve','wood','wetland'];
  const data=await fetchShortbreadWorldData({lat:40,lon:0,zoom:2,
    bounds:{minLat:20,maxLat:60,minLon:-30,maxLon:30},includeBuildings:false,layerNames:['land','sites'],
    shortbreadFetchTile:async(z,x,y)=>({z,x,y,tile:{layers:{land:{length:kinds.length,feature:i=>({id:i,toGeoJSON:()=>({properties:{kind:kinds[i]},geometry:{type:'Polygon',coordinates:[[[i,30],[i+.1,30],[i+.1,30.1],[i,30.1],[i,30]]]}})})},sites:{length:1,feature:()=>({id:9,toGeoJSON:()=>({properties:{kind:'national_park'},geometry:{type:'Polygon',coordinates:[[[0,40],[.1,40],[.1,40.1],[0,40.1],[0,40]]]}})})}}}})});
  const tags=data.elements.filter(e=>e.type==='way').map(e=>e.tags);
  assert.ok(tags.some(t=>t.boundary==='national_park'));
  assert.ok(tags.some(t=>t.leisure==='nature_reserve'));
  assert.ok(tags.some(t=>t.natural==='wood'));
  assert.ok(tags.some(t=>t.natural==='wetland'));
});

test('portal excavation excludes vegetation at the cut floor while preserving cover over buried tunnels',()=>{
 const nodes=[{id:1,lat:100,lon:100},{id:2,lat:100,lon:120},{id:3,lat:100,lon:140}];
 const mask={x:100,z:100,tangentX:1,tangentZ:0,roadY:0,grade:0,halfWidth:5,halfDepth:6,cutHeight:30};
 setup([],{osmTreeNodes:nodes,baseTerrainHeightAt:()=>20,terrainMeshHeightAt:(x)=>x===100?0:20,structureTerrainPortalDescriptors:[mask]});
 const cut=collectWorldVegetationPlacements().filter(p=>p.source==='node');
 assert.ok(cut.length>0);assert.ok(cut.every(p=>p.x!==100),'a removed hillside cannot become a planted tunnel lane');
 setup([],{osmTreeNodes:nodes,baseTerrainHeightAt:()=>40,terrainMeshHeightAt:()=>40,structureTerrainPortalDescriptors:[mask]});
 assert.ok(collectWorldVegetationPlacements().some(p=>p.x===100),'intact ground above the aperture still supports trees');
});
