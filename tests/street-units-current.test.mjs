import test from 'node:test';
import assert from 'node:assert/strict';
import {roadDimensionsFromSource,roadPlacementOffsetWorld} from '../app/js/world/road-units.js';
import {roadWidthAtSegment,sourceRoadWidthMeters,roadSegmentIsDriveable} from '../app/js/world/road-cross-section-profile.js';
import {createBuildingRoadFootprintGuards} from '../app/js/world/building-road-footprint.js';
import {streetSourceInput} from '../app/js/world/street-source-input.js';
for(const scale of [1,1.11,2])test(`source widths, placement and building clearance remain physical metres at scale ${scale}`,async()=>{
 const transportRecord={crossSection:{widthMeters:6,widthSource:'fallback:road-class',placement:{centerlineOffsetMeters:1}},sourceTags:{highway:'residential'}};
 const road={...roadDimensionsFromSource(transportRecord,scale),transportRecord,pts:[{x:0,z:0},{x:20/scale,z:0}],type:'residential',driveable:true,structureSemantics:{terrainMode:'at_grade'}};
 assert.equal(sourceRoadWidthMeters(road),6);
 assert.ok(Math.abs(roadWidthAtSegment(road)*scale-6)<1e-8);
 assert.ok(Math.abs(roadPlacementOffsetWorld(road)*scale-1)<1e-8);
 const guards=await createBuildingRoadFootprintGuards({roads:[road],yieldToMainThread:async()=>{}});
 const footprint=[{x:5/scale,z:2/scale},{x:15/scale,z:2/scale},{x:15/scale,z:7/scale},{x:5/scale,z:7/scale}];
 const result=guards.resolveFootprintTransportAuthority(footprint,{sourceBuildingId:'test-building'});
 assert.equal(result.action,'constrain_inferred_width');
 guards.publishRoadCrossSectionProfiles();
 assert.ok(Math.abs(road.resolvedCrossSection.sourceWidthMeters-6)<1e-8);
 assert.ok(Math.abs(roadWidthAtSegment(road,0,.5)*scale-1.76)<1e-5);
 assert.equal(roadSegmentIsDriveable(road,0,.3,.7),false);
 const source=streetSourceInput({roads:[road],METERS_PER_WORLD_UNIT:scale});
 assert.equal(source.roads[0].metersPerWorldUnit,scale);
 assert.ok(Math.abs(roadWidthAtSegment(source.roads[0],0,.5)*scale-1.76)<1e-5);
});
test('invalid road scales fail before geometry publication',()=>{
 for(const scale of [0,-1,NaN,Infinity])assert.throws(()=>roadDimensionsFromSource({crossSection:{widthMeters:5}},scale));
});
