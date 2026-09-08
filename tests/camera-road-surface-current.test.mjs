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
