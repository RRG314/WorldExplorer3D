import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEntranceCatalog} from '../app/js/living-world/entrance-catalog.js';
import {reviewedVenueForBuilding} from '../app/js/interiors/venue-exterior-policy.js';
import {selectBuildingExteriorProfile} from '../app/js/world/building-exterior-catalog.js';

test('reviewed museum aliases match without granting entry to similarly named buildings',()=>{
  for(const sourceBuildingId of ['way/336352958','osm:way:336352958'])assert.equal(reviewedVenueForBuilding({sourceBuildingId}),'peale-baltimore');
  assert.equal(reviewedVenueForBuilding({sourceBuildingId:'way/1336352958',name:'The Peale'}),null);
});
test('a loaded reviewed venue keeps a usable facade entrance far from the launch origin',()=>{
  const id='venue',building={sourceBuildingId:id,pts:[{x:2000,z:2000},{x:2020,z:2000},{x:2020,z:2020},{x:2000,z:2020}],height:10,baseY:0,buildingType:'museum'};
  const options={buildings:[building],mappedEntrances:[{id:'door',buildingSourceId:id,x:2010,z:2000}],sampleGround:()=>0};
  assert.equal(compileEntranceCatalog(options).entrances.length,0);
  const catalog=compileEntranceCatalog({...options,priorityBuildingIds:new Set([id])});
  assert.equal(catalog.entrances.length,1);assert.equal(catalog.entrances[0].provenance,'mapped');
  assert.equal(compileEntranceCatalog({...options,priorityBuildingIds:new Set([id]),sampleGround:()=>5}).entrances.length,0,'Priority must not bypass safe ground placement');
});
test('aquarium and museum exteriors never inherit residential awnings or wooden house doors',()=>{
  const aquarium=selectBuildingExteriorProfile({buildingIdentity:'overture:7bacec0b-326a-401f-ad9f-f3ebed72c8cf',buildingType:'entertainment',location:{name:'Baltimore'},tags:{}});
  assert.equal(aquarium.familyId,'aquarium_glass_pavilion');assert.equal(aquarium.doorStyle,'commercial_double');assert.equal(aquarium.materialId,'glass_blue');
  const museum=selectBuildingExteriorProfile({buildingIdentity:'osm:way:336352958',buildingType:'museum'});
  assert.equal(museum.materialId,'red_brick');assert.equal(museum.familyId,'peale_federal_museum');
  assert.equal(selectBuildingExteriorProfile({buildingType:'museum'}).category,'institutional');
});

test('reviewed component collision preserves door identity and real canopy clearance',async()=>{
  const {replaceVenueCollision,venueComponentCollider}=await import('../app/js/world/venue-collision.js');
  const {createBuildingCollisionQuery}=await import('../app/js/physics/building-collision.js');
  const pts=[{x:0,z:0},{x:20,z:0},{x:20,z:20},{x:0,z:20}];
  const building={...venueComponentCollider('venue',pts,0,18),buildingType:'museum'};
  const context={buildings:[building],dynamicBuildingColliders:[]};
  replaceVenueCollision(context,[building],[venueComponentCollider('canopy',pts,3.65,4)]);
  const collide=createBuildingCollisionQuery(context);
  assert.equal(collide(10,10,.4,{actorBaseY:0,actorHeight:1.8}).collision,false,'Pedestrian can walk under the visible canopy');
  assert.equal(collide(10,10,.4,{actorBaseY:3,actorHeight:1.8}).collision,true,'Visible canopy remains solid at its real elevation');
  assert.equal(collide(10,10,.4,{actorBaseY:5,actorHeight:1.8}).collision,false,'Retired estimated building cannot create an invisible wall');
  const catalog=compileEntranceCatalog({buildings:[building],mappedEntrances:[{id:'door',buildingSourceId:'venue',x:10,z:0}],sampleGround:()=>0});
  assert.equal(catalog.entrances.length,1,'Visual replacement must retain the canonical admission identity');
  assert.equal(building.collisionDisabled,undefined);
});
