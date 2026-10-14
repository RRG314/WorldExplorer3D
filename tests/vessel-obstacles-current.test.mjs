import test from 'node:test';
import assert from 'node:assert/strict';
import {vesselObstacleAdmission} from '../app/js/transport/vessel-obstacles.js';
import {createBuildingCollisionQuery} from '../app/js/physics/building-collision.js';
import {getMaritimeCatalogEntry} from '../app/js/transport/maritime-catalog.js';

const boat=getMaritimeCatalogEntry('marina-runabout');
const obstacle=(minX,maxX,minZ,maxZ,minY=0,maxY=5)=>({minX,maxX,minZ,maxZ,minY,maxY,sourceBuildingId:'pier',pts:[{x:minX,z:minZ},{x:maxX,z:minZ},{x:maxX,z:maxZ},{x:minX,z:maxZ}]});
function admit(buildings,x=0,z=0,yaw=0){
  const ctx={buildings,dynamicBuildingColliders:[],METERS_PER_WORLD_UNIT:1,getEnv:()=> 'EARTH'};
  ctx.checkBuildingCollision=createBuildingCollisionQuery(ctx);
  return vesselObstacleAdmission(ctx,boat,x,z,yaw,0);
}
test('a thin structure between water sample points blocks the actual hull',()=>{
  assert.equal(admit([obstacle(-.2,.2,1,1.1)]).allowed,false);
  assert.equal(admit([obstacle(1.2,1.4,2,2.2)]).allowed,false,'Bow-side contact');
});
test('nearby piers outside the oriented hull do not block navigation',()=>{
  assert.equal(admit([obstacle(2,2.5,2,2.5)]).allowed,true,'Reject broad-phase false positive');
  assert.equal(admit([obstacle(2,2.5,-.5,.5)],0,0,Math.PI/2).allowed,false,'Rotating the hull creates real contact');
});
test('bridge clearance uses actual vertical ranges without blocking a safe passage',()=>{
  assert.equal(admit([obstacle(-5,5,-1,1,8,10)]).allowed,true);
  assert.equal(admit([obstacle(-5,5,-1,1,1,3)]).allowed,false);
  assert.equal(admit([obstacle(-5,5,-1,1,-10,-5)]).allowed,true);
});
test('separate Ocean scene does not collide with a cached Earth district',()=>{
  assert.equal(vesselObstacleAdmission({getEnv:()=> 'OCEAN',checkBuildingCollision:()=>{throw Error('Cached Earth query');}},boat,0,0,0,0).allowed,true);
});
