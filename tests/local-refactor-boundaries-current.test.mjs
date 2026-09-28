import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleProfileAtDistance,sampleSortedProfileAtDistance} from '../app/js/structure-semantics/profile-sampling.js';
import {compileTransportSurfaceModel,sampleTransportSurfaceAtDistance} from '../app/js/world/compiler/transport-surface-model.js';
import {limitWaysByDistance,limitNodesByDistance} from '../app/js/earth-core/location-selection.js';
import {rendererOwnershipSnapshot} from '../app/js/runtime/renderer-owners.js';

test('sorted interpolation preserves legacy knots, nonfinite fallback and shortened values',()=>{
 for(const ds of [[0],[0,0],[0,2,2,4],[0,1e-8,2],[2,4,6]])for(const vs of [ds.map((_,i)=>i*3),ds.map(()=>NaN),ds.map((_,i)=>i%2?Infinity:5),[7]]){
  const d=Float64Array.from(ds),v=Float32Array.from(vs);
  for(const q of [-Infinity,-1,0,1e-9,1,2,3,4,6,8,Infinity,NaN])assert.ok(Object.is(sampleSortedProfileAtDistance(d,v,q),sampleProfileAtDistance(d,v,q)),`${ds}/${vs}/${q}`);
 }
});
test('compiled models sample current heights exactly and external profiles retain general behavior',()=>{
 const model=compileTransportSurfaceModel({pts:[{x:0,z:0},{x:150,z:10}],width:8,type:'residential',structureSemantics:{terrainMode:'at_grade'}},(x,z)=>x*.05+z*.1);
 for(let distance=-1;distance<170;distance+=.13)for(const offset of [-10,-2,0,2,10]){
  const c=sampleProfileAtDistance(model.distances,model.centerHeights,distance),lateral=Math.max(-1,Math.min(1,offset/(model.width/2)));
  const edge=sampleProfileAtDistance(model.distances,lateral>0?model.leftHeights:model.rightHeights,distance);
  assert.equal(sampleTransportSurfaceAtDistance(model,distance,offset),lateral?c+(edge-c)*Math.abs(lateral):c);
 }
 model.centerHeights[1]+=1;
 assert.equal(sampleTransportSurfaceAtDistance(model,model.distances[1]),model.centerHeights[1]);
 const external={...model,distances:Float64Array.from([0,10,3,20]),centerHeights:Float32Array.from([0,5,10,15])};
 for(const q of [1,5,8,12])assert.equal(sampleTransportSurfaceAtDistance(external,q),sampleProfileAtDistance(external.distances,external.centerHeights,q));
});
test('geographic selection honors supplied location, source priority and stable spread without mutation',()=>{
 const nodes={a:{lat:0,lon:0},b:{lat:0,lon:1},c:{lat:0,lon:2},d:{lat:0,lon:3}};
 const ways=Object.keys(nodes).map(id=>({id,nodes:[id]})),snapshot=JSON.stringify(ways);
 assert.deepEqual(limitWaysByDistance(ways,nodes,2,null,{},nodes.a).map(x=>x.id),['a','b']);
 assert.deepEqual(limitWaysByDistance(ways,nodes,2,null,{},nodes.d).map(x=>x.id),['d','c']);
 assert.deepEqual(limitWaysByDistance(ways,nodes,2,(a,b)=>b.id.localeCompare(a.id),{},nodes.a).map(x=>x.id),['d','c']);
 assert.deepEqual(limitWaysByDistance(ways,nodes,3,null,{spreadAcrossArea:true,coreRatio:.5},nodes.a).map(x=>x.id),['a','b','c']);
 assert.equal(JSON.stringify(ways),snapshot);
 assert.deepEqual(limitNodesByDistance(Object.values(nodes),2,nodes.d),[nodes.d,nodes.c]);
});
test('renderer diagnostics select actual owner and sample aliased renderers once',()=>{
 const main={},ocean={},space={};let calls=0;const snapshot=r=>({identity:r,serial:++calls});
 const ctx={renderer:main,gameStarted:true,oceanMode:{renderer:ocean,active:false},spaceFlight:{renderer:space,active:false}};
 assert.equal(rendererOwnershipSnapshot(ctx,snapshot).active.identity,main);
 ctx.oceanMode.active=true;assert.equal(rendererOwnershipSnapshot(ctx,snapshot).active.identity,ocean);
 ctx.spaceFlight.active=true;assert.equal(rendererOwnershipSnapshot(ctx,snapshot).active.identity,space);
 ctx.spaceFlight.renderer=null;assert.equal(rendererOwnershipSnapshot(ctx,snapshot).active,null,'missing active renderer is not dormant Earth');
 ctx.spaceFlight.active=false;ctx.oceanMode.active=false;ctx.gameStarted=false;assert.equal(rendererOwnershipSnapshot(ctx,snapshot).activeOwner,null);
 ctx.oceanMode.renderer=main;ctx.spaceFlight.renderer=main;calls=0;const report=rendererOwnershipSnapshot(ctx,snapshot);
 assert.equal(calls,1);assert.equal(report.main,report.ocean);assert.equal(report.main,report.space);
});

test('committed departure releases Earth overlays; rejected transitions preserve them',async()=>{
 const {commitEnvironment}=await import('../app/js/session-coordinator.js?v=2');
 const previousDocument=globalThis.document;
 const action={onclick:()=>{},hidden:false};
 const selection={hidden:false,_hideTimer:0,querySelector:()=>action};
 const civic={shown:true,attributes:{},classList:{remove(name){if(name==='show')civic.shown=false;}},setAttribute(name,value){this.attributes[name]=value;}};
 globalThis.document={getElementById:id=>id==='worldSelectionNotice'?selection:id==='urbanCivicStatus'?civic:null};
 try{
  assert.equal(commitEnvironment('EARTH'),true);
  assert.equal(commitEnvironment('UNKNOWN'),false);
  assert.equal(selection.hidden,false);
  assert.equal(commitEnvironment('OCEAN'),true);
  assert.equal(selection.hidden,true);
  assert.equal(action.onclick,null);
  assert.equal(action.hidden,true);
  assert.equal(civic.shown,false);
  assert.equal(civic.attributes['aria-hidden'],'true');
  assert.equal(commitEnvironment('EARTH'),true);
  assert.equal(selection.hidden,true,'return does not resurrect an old action');
 }finally{globalThis.document=previousDocument;}
});
