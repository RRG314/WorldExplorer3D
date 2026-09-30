import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {cameraRoadSurfaceCollision,initWorldNavigation} from '../app/js/world/navigation.js';

test('camera road probes use surface height, actual width and existing index across levels',()=>{
  const prior=ctx.roads;
  const road={width:8,pts:[{x:0,z:-30},{x:0,z:30}],surfaceY:20};
  initWorldNavigation({sampleFeatureSurfaceY:r=>r.surfaceY,isSuppressedBaseRoad:r=>r.suppressed===true});
  try{
    ctx.roads=[road];
    assert.equal(cameraRoadSurfaceCollision(0,20,0,.8),true);
    assert.equal(cameraRoadSurfaceCollision(0,19.3,0,.8),true);
    assert.equal(cameraRoadSurfaceCollision(0,3,0,.8),false,'no solid column beneath bridge');
    assert.equal(cameraRoadSurfaceCollision(0,22,0,.8),false);
    assert.equal(cameraRoadSurfaceCollision(6,20,0,.8),false,'outside rendered width');
    assert.equal(cameraRoadSurfaceCollision(20000,20,0,.8),false,'no distant fallback scan');
    road.suppressed=true;
    assert.equal(cameraRoadSurfaceCollision(0,20,0,.8),false);
    ctx.roads=[{...road,suppressed:false,surfaceY:4}];
    assert.equal(cameraRoadSurfaceCollision(0,4,0,.8),true,'replacement road collection rebuilds index');
    assert.equal(cameraRoadSurfaceCollision(NaN,4,0,.8),false);
  }finally{ctx.roads=prior;}
});

import {cameraRoadSurfaceHit} from '../app/js/world/camera-road-surface.js';
import {evaluateNearestRoadCandidate as reference} from './fixtures/nearest-road-before-pruning.js';
import {roadWidthAtProjection} from '../app/js/world/road-cross-section-profile.js';

test('camera surface probes preserve curved, variable-width, stacked-road collision decisions',()=>{
 const roads=Array.from({length:8},(_,r)=>({width:7+r,metersPerWorldUnit:1,height:r*4,pts:Array.from({length:32},(_,i)=>({x:i*6,z:r*8+Math.sin(i*.3)*12})),structureSemantics:{terrainMode:['elevated','subgrade','at_grade'][r%3],gradeSeparated:r%3!==2},structureTransitionAnchors:[{distance:10,span:4}]}));
 roads.push({width:12,height:0,pts:[{x:0,z:0},{x:0,z:0}]});
 let oldSamples=0,newSamples=0;
 const height=(road,x,z,p)=>road.height+p.t*.6;
 const runtime={sampleFeatureSurfaceY:(...args)=>{oldSamples++;return height(...args);},areRoadsConnected:()=>false};
 const sample=(...args)=>{newSamples++;return height(...args);};
 const suppressed=r=>r===roads[4];
 for(let x=-6;x<200;x+=7)for(let z=-10;z<90;z+=5)for(let y=-2;y<35;y+=1.25)for(const radius of [.38,1.2]){
  const expected=roads.some(road=>{if(suppressed(road))return false;const h=reference(road,x,z,NaN,Infinity,null,runtime,a=>ArrayBuffer.isView(a));return h&&h.dist<=roadWidthAtProjection(road,h)*.5+radius&&Number.isFinite(h.y)&&Math.abs(y-h.y)<=radius+.12;});
  assert.equal(cameraRoadSurfaceHit(roads,x,y,z,radius,sample,roadWidthAtProjection,suppressed),expected,`${x},${y},${z} r${radius}`);
 }
 assert.ok(newSamples<oldSamples*.03,`${newSamples}/${oldSamples} height queries`);
});

test('camera remains free below overpass and rejects missing height without a solid column',()=>{
 const road={width:8,pts:[{x:-10,z:0},{x:10,z:0}]};
 const probe=(y,height)=>cameraRoadSurfaceHit([road],0,y,0,.38,()=>height,()=>8,()=>false);
 assert.equal(probe(0,8),false);assert.equal(probe(8.4,8),true);assert.equal(probe(8.6,8),false);assert.equal(probe(8,NaN),false);
});
