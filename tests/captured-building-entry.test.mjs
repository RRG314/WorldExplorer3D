import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {pickNearbyEnterableBuildingSupport} from '../app/js/building-entry.js';
const id='overture:entry-test',building={sourceBuildingId:id,buildingType:'house',pts:[{x:-15,z:-6},{x:15,z:-6},{x:15,z:6},{x:-15,z:6}],minY:0,maxY:6};
const options={requireExteriorEntrance:true,radius:8.5,actorBaseY:0,actorHeight:1.7};
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
