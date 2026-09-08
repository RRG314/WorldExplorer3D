import test from 'node:test';
import assert from 'node:assert/strict';
import initializeManifold from 'manifold-3d';
import { compileTunnelSolid } from '../app/js/world/compiler/tunnel-solid-kernel.js';
import { buildTunnelSolidInput, prepareTunnelSolidBoundary, queryTunnelSolid, tunnelSolidComponents } from '../app/js/world/compiler/tunnel-solid-model.js';
import { compileTransportSurfaceModel } from '../app/js/world/compiler/transport-surface-model.js';
import { compileTunnelSystemModels } from '../app/js/world/compiler/tunnel-system-model.js';
import { compileStructureColliderDescriptors } from '../app/js/world/structure-colliders.js';
import { resolveTunnelSpace } from '../app/js/world/compiler/tunnel-space-query.js';
import { compileTransportNetworkModel } from '../app/js/world/compiler/transport-network-model.js';

const kernel=await initializeManifold();kernel.setup();
function road(id,pts,width=8,layer=-1){
  const f={sourceFeatureId:id,pts,width,structureSemantics:{terrainMode:'subgrade',structureKind:'tunnel',isTunnel:true,layer,cutDepth:6},
    transportRecord:{completeness:'lossless',routeState:'complete',safeForDriving:true,rawTags:{layer:String(layer)}},connectedFeatures:{start:[],end:[]}};
  f.transportSurfaceModel=compileTransportSurfaceModel(f,()=>20);return f;
}
function fixture(angle=90,width=8){
  const a=road('a',[{x:0,z:-40},{x:0,z:0}]);
  const b=road('b',[{x:0,z:0},{x:0,z:40}]);
  const c=road('c',[{x:0,z:0},{x:Math.sin(angle*Math.PI/180)*40,z:Math.cos(angle*Math.PI/180)*40}],width);
  a.connectedFeatures.end=[b,c].map(feature=>({feature}));
  b.connectedFeatures.start=[a,c].map(feature=>({feature}));c.connectedFeatures.start=[a,b].map(feature=>({feature}));
  compileTunnelSystemModels([a,b,c],()=>20);return[a,b,c];
}
function compile(features){
  const input=buildTunnelSolidInput(features), result=compileTunnelSolid(kernel,input);
  const boundary=prepareTunnelSolidBoundary(input,result);boundary.publisher=features[0];
  features.forEach(f=>f.tunnelSolidBoundary=boundary);return{input,result,boundary};
}
for(const [name,angle,width] of [['T',90,8],['acute Y',15,5],['obtuse',135,10],['near-parallel',5,4]]){
  test(`${name}: one closed union, no internal branch wall, camera uses the same space`,()=>{
    const f=fixture(angle,width);const {result,boundary}=compile(f);
    const edges=new Map();
    for(let i=0;i<result.indices.length;i+=3)for(let j=0;j<3;j++){
      const a=result.indices[i+j],b=result.indices[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(':');
      edges.set(key,(edges.get(key)||0)+1);
    }
    assert.ok([...edges.values()].every(count=>count===2),'every solid edge belongs to two triangles');
    const floor=f[0].transportSurfaceModel.centerHeights[0];
    const x=Math.sin(angle*Math.PI/180)*10,z=Math.cos(angle*Math.PI/180)*10;
    assert.equal(resolveTunnelSpace(f[0],x,z,floor+1.2).inside,true,'incoming feature can query its connected branch');
    assert.equal(queryTunnelSolid(boundary,0,0,floor+1).inside,true);
    assert.equal(queryTunnelSolid(boundary,0,0,floor+20).inside,false);
    assert.ok(compileStructureColliderDescriptors(f).length>0);
    assert.equal(boundary.render.some(t=>Math.abs(t.normal[1]+1)<1e-6),false,'no duplicate road-floor skin');
  });
}
test('stacked layers, unrelated crossings and different source families stay separate',()=>{
  const f=fixture();f[2].transportRecord.rawTags.layer='-2';
  assert.equal(tunnelSolidComponents(f)[0].length,2);
  f[1].transportRecord.completeness='generalized';
  assert.equal(tunnelSolidComponents(f).length,0);
});
test('a sloped and translated network retains finite positive clearance',()=>{
  const f=fixture(35,6);
  for(const r of f){
    r.pts=r.pts.map(p=>({x:p.x+100000,z:p.z-200000}));
    r.transportSurfaceModel=compileTransportSurfaceModel(r,(_x,z)=>20+(z+200000)*.03);
  }
  compileTunnelSystemModels(f,(_x,z)=>20+(z+200000)*.03);
  const {boundary}=compile(f);
  const sample=queryTunnelSolid(boundary,100000,-200000,NaN);
  assert.equal(sample.inside,true);assert.ok(sample.ceilingY-sample.floorY>3);
});

test('oblique graded sweeps do not retain internal station endcaps',()=>{
  const f=road('oblique',[{x:-304.54380448997676,z:41.2200946115604},{x:-298.3425033466714,z:2.461821087251792}],5);
  const total=Math.hypot(f.pts[1].x-f.pts[0].x,f.pts[1].z-f.pts[0].z);
  f.transportSurfaceModel={distances:Float64Array.from({length:73},(_,i)=>i*total/72),
    centerHeights:Float32Array.from({length:73},(_,i)=>59.8893814+i*total/72*.135)};
  f.tunnelSystemModel={visualKind:'tunnel',total,clearance:4.35,shellRanges:[{start:0,end:total}]};
  const {boundary}=compile([f]);
  const tx=(f.pts[1].x-f.pts[0].x)/total,tz=(f.pts[1].z-f.pts[0].z)/total;
  const crossWalls=boundary.walls.filter(w=>Math.abs(w.normal[0]*tx+w.normal[2]*tz)>.5);
  assert.equal(crossWalls.length,0);
});

test('a curved graded sweep keeps the entire centerline inside one continuous volume',()=>{
  const points=Array.from({length:21},(_,i)=>({x:60*(1-Math.cos(i*Math.PI/40)),z:60*Math.sin(i*Math.PI/40)}));
  const f=road('curve',points,6);
  f.transportSurfaceModel=compileTransportSurfaceModel(f,(_x,z)=>20+z*.06);
  compileTunnelSystemModels([f],(_x,z)=>20+z*.06);
  const {boundary}=compile([f]);
  for(let i=1;i<points.length-1;i++){
    const p=points[i],space=queryTunnelSolid(boundary,p.x,p.z,NaN);
    assert.equal(space.inside,true,`curve station ${i}`);
    assert.ok(space.ceilingY-space.floorY>3);
  }
});

test('nearby display labels cannot create route links across generalized gaps',()=>{
  const features=[0,23].map((x,i)=>({sourceFeatureId:`gap:${i}`,type:'motorway',
    pts:[{x,z:0},{x:x+10,z:0}],structureSemantics:{terrainMode:'elevated',verticalOrder:1},
    transportRecord:{identity:`gap:${i}`,completeness:'generalized',routeState:'complete',
      sourceTags:{name:'Same displayed street',highway:'motorway'},rawTags:{}}}));
  assert.equal(compileTransportNetworkModel(features).connections.length,1,'control: explicit source route names permit a bounded gap');
  for(const f of features)f.transportRecord.capabilities={routeName:'display-only'};
  assert.equal(compileTransportNetworkModel(features).connections.length,0,'inferred label is not topology');
});
