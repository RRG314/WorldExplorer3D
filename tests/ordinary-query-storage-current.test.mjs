import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ctx} from '../app/js/shared-context.js?v=55';
import {distanceToFootprint,pointToSegmentDistance,hasFullBuildingFootprint,buildingFootprintPoints} from '../app/js/building-entry.js';

const source=readFileSync(new URL('../app/js/urban-sandbox/runtime.js',import.meta.url),'utf8');
const furnitureSource=source.slice(source.indexOf('function nearestFurnitureCandidate('),source.indexOf('function nearestResponderLootCandidate('));
const furniture=new Function('appCtx','activeWorldMatches',furnitureSource+';return nearestFurnitureCandidate;')(ctx,()=>true);

test('nearby furniture selection preserves radius, ties and current eligibility without reading decorative poses',()=>{
 const saved={Walk:ctx.Walk,streetFurnitureMeshes:ctx.streetFurnitureMeshes};
 try {
  ctx.Walk={state:{mode:'walk',walker:{x:0,z:0}}};
  const objects=Array.from({length:4000},(_,i)=>({position:{x:Math.sin(i)*40,z:Math.cos(i)*20},userData:{interactiveWorldObject:i%5===0}}));
  for(let frame=0;frame<120;frame++){
   const walker=ctx.Walk.state.walker;walker.x=frame/4;walker.z=Math.sin(frame)*6;
   ctx.streetFurnitureMeshes=objects;
   const expected=objects.map(object=>({object,distance:Math.hypot(object.position.x-walker.x,object.position.z-walker.z)}))
    .filter(hit=>hit.object.userData.interactiveWorldObject&&hit.distance<=3.2).sort((a,b)=>a.distance-b.distance)[0]||null;
   assert.deepEqual(furniture({}),expected);
  }
  ctx.Walk.state.walker={x:0,z:0};
  const first={position:{x:3.2,z:0},userData:{interactiveWorldObject:true}},second={position:{x:-3.2,z:0},userData:{interactiveWorldObject:true}};
  ctx.streetFurnitureMeshes=[{userData:{},get position(){throw Error('Decorative poses are irrelevant');}},first,second];
  assert.equal(furniture({}).object,first);first.userData.interactiveWorldObject=false;
  assert.equal(furniture({}).object,second);assert.equal(furniture({},3.19),null);
  ctx.Walk.state.mode='drive';assert.equal(furniture({}),null);
 } finally {Object.assign(ctx,saved);}
});

test('building entry keeps concave, degenerate, filtered and edited footprint rules',()=>{
 const polygon=[{x:0,z:0},{x:8,z:0},{x:8,z:2},{x:2,z:2},{x:2,z:8},{x:0,z:8}];
 const building={pts:polygon};
 assert.equal(hasFullBuildingFootprint(building),true);
 assert.deepEqual(distanceToFootprint(5,5,building),{dist:3,point:{x:5,z:2},inside:false});
 assert.deepEqual(distanceToFootprint(1,1,building),{dist:0,point:{x:1,z:0},inside:true});
 const hit=distanceToFootprint(5,5,building);distanceToFootprint(-50,-50,building);
 assert.deepEqual(hit,{dist:3,point:{x:5,z:2},inside:false});
 assert.equal(hasFullBuildingFootprint({pts:[null,...polygon,{x:NaN,z:7}]}),true);
 assert.equal(hasFullBuildingFootprint({pts:[polygon[0],null,polygon[1]]}),false);
 assert.equal(hasFullBuildingFootprint({minX:0,maxX:4,minZ:0,maxZ:3}),true);
 assert.equal(hasFullBuildingFootprint({minX:0,maxX:3.9,minZ:0,maxZ:3}),false);
 const independent=buildingFootprintPoints(building);independent[0].x=400;assert.equal(polygon[0].x,0);
 for(const point of polygon){point.x*=.1;point.z*=.1;}
 assert.equal(hasFullBuildingFootprint(building),false,'Editing a footprint must take effect without cache invalidation');
 const out={};assert.equal(pointToSegmentDistance(2,3,{x:1,z:1},{x:1,z:1},out),out);
 assert.deepEqual(out,{dist:Math.sqrt(5),x:1,z:1,t:0});
 assert.notEqual(pointToSegmentDistance(2,3,{x:1,z:1},{x:1,z:1}),pointToSegmentDistance(2,3,{x:1,z:1},{x:1,z:1}));
});

test('an installed interaction router owns the no-action result without rerunning the urban provider',()=>{
 const promptBody=source.slice(source.indexOf('function updatePrompt('),source.indexOf('function snapshot('));
 let routed=0,direct=0;
 const localCtx={getEnv:()=> 'EARTH',resolvePrimaryContextInteraction:()=>{routed++;return null;}};
 const update=new Function('appCtx','interactionCandidate','now','setDomHidden','setDomClass','setDomAttribute',promptBody+';return updatePrompt;')(
  localCtx,()=>{direct++;return null;},()=>10,()=>{},()=>{},()=>{});
 const state={prompt:{root:{}},statusUntil:0};update(state);
 assert.equal(routed,1);assert.equal(direct,0);
 delete localCtx.resolvePrimaryContextInteraction;update(state);assert.equal(direct,1);
});
