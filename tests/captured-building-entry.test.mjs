import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {pickNearbyEnterableBuildingSupport} from '../app/js/building-entry.js';
import {resolveBuildingEntrySupport} from '../app/js/building-entry.js';
import {compileEntranceCatalog} from '../app/js/living-world/entrance-catalog.js';
const id='overture:entry-test',building={sourceBuildingId:id,buildingType:'house',pts:[{x:-15,z:-6},{x:15,z:-6},{x:15,z:6},{x:-15,z:6}],minY:0,maxY:6};
const options={requireExteriorEntrance:true,radius:8.5,actorBaseY:0,actorHeight:1.7};
test('mapped bridges, roof parts and thin elevated fragments cannot gain painted doors or interiors',()=>{
 const candidates=[
  {...building,buildingType:'bridge_structure',bodyHeightMeters:.568},
  {...building,buildingType:'bridge',bodyHeightMeters:8},
  {...building,buildingType:'yes',buildingPartKind:'roof',bodyHeightMeters:8},
  {...building,buildingType:'yes',buildingPartKind:'part',height:8.121,bodyHeightMeters:.171},
  {...building,buildingType:'yes',buildingPartKind:'canopy',bodyHeightMeters:3}
 ];
 for(const candidate of candidates){
  const before=structuredClone(candidate);
  assert.equal(resolveBuildingEntrySupport(candidate).enterable,false);
  assert.equal(compileEntranceCatalog({buildings:[candidate],tier:'quality'}).entrances.length,0);
  assert.deepEqual(candidate,before,'Entry classification must not mutate bridge or building physics');
 }
 // Do not block actual occupied building wings or legacy/photographed homes.
 for(const candidate of [building,{...building,buildingPartKind:'part',bodyHeightMeters:3.4}]){
  assert.equal(resolveBuildingEntrySupport(candidate).enterable,true);
  assert.equal(compileEntranceCatalog({buildings:[candidate],tier:'quality'}).entrances.length,1);
 }
});
test('photographed facade remains reachable when generated door is on the other side',()=>{
 ctx.buildings=[building];ctx.buildingEntranceByBuilding=new Map([[id,{x:0,z:-6,approachX:0,approachZ:-8}]]);ctx.communityRealityCaptureEntryBuildings=new Set();
 assert.equal(pickNearbyEnterableBuildingSupport(0,7,options),null);
 ctx.communityRealityCaptureEntryBuildings.add(id);
 assert.equal(pickNearbyEnterableBuildingSupport(0,7,options)?.support.key,id);
 assert.equal(pickNearbyEnterableBuildingSupport(0,10,options),null,'No remote entry');
 assert.equal(pickNearbyEnterableBuildingSupport(0,7,{...options,actorBaseY:12}),null,'No entry from above the building');
 ctx.communityRealityCaptureEntryBuildings.clear();assert.equal(pickNearbyEnterableBuildingSupport(0,7,options),null,'Withdrawal removes additional entry');
});
test('reviewed exterior without a generated door can be entered; ordinary buildings still need doors',()=>{
 ctx.buildingEntranceByBuilding.clear();ctx.communityRealityCaptureEntryBuildings.add(id);
 assert.equal(pickNearbyEnterableBuildingSupport(0,7,options)?.support.key,id);
 ctx.communityRealityCaptureEntryBuildings.clear();assert.equal(pickNearbyEnterableBuildingSupport(0,7,options),null);
});
test('nearby interior directory applies the same visible-entry eligibility as interaction',async()=>{
 const {listEnterableBuildingSupportsNear}=await import('../app/js/building-entry.js');
 ctx.buildings=[building];ctx.buildingEntranceByBuilding.clear();ctx.communityRealityCaptureEntryBuildings.clear();
 assert.equal(listEnterableBuildingSupportsNear(0,7,50,8,{requireExteriorEntrance:true}).length,0);
 ctx.buildingEntranceByBuilding.set(id,{x:0,z:-6,approachX:0,approachZ:-8});
 assert.equal(listEnterableBuildingSupportsNear(0,7,50,8,{requireExteriorEntrance:true})[0]?.key,id);
 ctx.buildingEntranceByBuilding.clear();ctx.communityRealityCaptureEntryBuildings.add(id);
 assert.equal(listEnterableBuildingSupportsNear(0,7,50,8,{requireExteriorEntrance:true})[0]?.key,id);
 ctx.communityRealityCaptureEntryBuildings.clear();
});
