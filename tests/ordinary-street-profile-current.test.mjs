import test from 'node:test';
import assert from 'node:assert/strict';
import {assignOrdinaryStreetJunctions,fitOrdinaryStreetProfile} from '../app/js/world/compiler/ordinary-street-profile.js';
import {compileTransportSurfaceModel} from '../app/js/world/compiler/transport-surface-model.js';
import {sampleFeatureSurfaceY} from '../app/js/structure-semantics.js';
const feature=(id,pts)=>({pts,width:5,type:'residential',surfaceBias:.18,structureSemantics:{terrainMode:'at_grade'},transportGraphRef:{featureId:id}});
test('simplified interior street intersections share one terrain elevation without adding routing topology',()=>{
 for(const reverse of [false,true]){
  const main=feature('main',[{x:-100,z:0},{x:100,z:0}]),crossing=feature('crossing',[{x:20,z:-50},{x:20,z:50}]);
  for(const f of [main,crossing])f.transportRecord={completeness:'generalized',routeState:'complete'};
  const terrain=x=>7-6*Math.exp(-(((x+8)/10)**2)),network={connections:[]};
  const roads=reverse?[crossing,main]:[main,crossing];
  const result=assignOrdinaryStreetJunctions(roads,network,terrain);
  assert.equal(result.surfaceIntersections,1);assert.deepEqual(network.connections,[]);
  for(const f of roads){
   f.transportSurfaceModel=compileTransportSurfaceModel(f,terrain);
   assert.ok(Math.abs(sampleFeatureSurfaceY(f,20,0)-terrain(20)-.18)<1e-5);
   assert.equal(f.transportSurfaceModel.engineeredApproach,false);
  }
 }
});

test('surface crossing inference preserves explicit topology and grade separation',()=>{
 for(const variant of ['lossless','bridge','layer','highway','engineered','parallel']){
  const a=feature('a',[{x:-20,z:0},{x:20,z:0}]),b=feature('b',[{x:0,z:-20},{x:0,z:20}]);
  for(const f of [a,b])f.transportRecord={completeness:'generalized'};
  if(variant==='lossless')a.transportRecord.completeness='lossless';
  if(variant==='bridge')a.structureSemantics.gradeSeparated=true;
  if(variant==='layer')a.structureSemantics.verticalOrder=1;
  if(variant==='highway')a.type='motorway';
  if(variant==='engineered')a.transportSurfaceModel={engineeredApproach:true};
  if(variant==='parallel')b.pts=[{x:-20,z:2},{x:20,z:2}];
  assert.equal(assignOrdinaryStreetJunctions([a,b],{connections:[]},()=>7).surfaceIntersections,0,variant);
 }
});
test('ordinary endpoint-to-interior junctions meet without becoming bridge approaches',()=>{
 const through=feature('through',[{x:0,z:0},{x:60,z:0}]),branch=feature('branch',[{x:23,z:0},{x:23,z:30}]);
 const point={x:23,z:0},terrain=(x,z)=>.2*x+.04*z;
 const network={connections:[{left:{featureId:'through',distanceAlong:23,point},right:{featureId:'branch',distanceAlong:0,point}}]};
 const result=assignOrdinaryStreetJunctions([through,branch],network,terrain);assert.equal(result.nodes,1);
 for(const road of [through,branch])road.transportSurfaceModel=compileTransportSurfaceModel(road,terrain);
 const expected=terrain(23,0)+.18;
 for(const road of [through,branch]){assert.ok(Math.abs(sampleFeatureSurfaceY(road,23,0)-expected)<1e-5);assert.equal(road.transportSurfaceModel.engineeredApproach,false);assert.equal(road.structureTransitionAnchors,undefined);}
 assert.ok(through.transportSurfaceModel.maximumGrade>=.2-1e-6);
 for(let x=0;x<=60;x+=.5)assert.ok(Math.abs(sampleFeatureSurfaceY(through,x,0)-terrain(x,0)-.18)<1e-5);
});
test('profile constraints preserve slopes and shared stations after translation in elevation',()=>{
 const d=new Float64Array([0,2,4,6,8,10]);
 for(const offset of [0,1500]){
  const fit=fitOrdinaryStreetProfile(d,Float32Array.from([4,0,8,2,6,0],y=>y+offset),[{distance:0,targetSurfaceY:offset},{distance:4,targetSurfaceY:offset+1},{distance:10,targetSurfaceY:offset+2}]);
  assert.equal(fit.heights[0],offset);assert.equal(fit.heights[2],offset+1);assert.equal(fit.heights[5],offset+2);
  for(let i=1;i<d.length;i++)assert.ok(Math.abs(fit.heights[i]-fit.heights[i-1])/(d[i]-d[i-1])<=fit.maximumGrade+1e-5);
 }
});
test('mixed structure nodes are excluded from ordinary ground-height constraints',()=>{
 const a=feature('street',[{x:0,z:0},{x:10,z:0}]),b=feature('bridge',[{x:10,z:0},{x:20,z:0}]);b.structureSemantics.terrainMode='elevated';
 const result=assignOrdinaryStreetJunctions([a,b],{connections:[{left:{featureId:'street',distanceAlong:10,point:{x:10,z:0}},right:{featureId:'bridge',distanceAlong:0,point:{x:10,z:0}}}]},()=>0);
 assert.equal(result.nodes,0);assert.deepEqual(a.ordinaryStreetAnchors,[]);
});
