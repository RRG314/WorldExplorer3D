import {buildingRegionCountry} from '../app/js/world/building-region-lookup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveRegionalBuildingStyle} from '../app/js/world/regional-building-style.js';
import {selectBuildingExteriorProfile} from '../app/js/world/building-exterior-catalog.js';
import {resolveMappedRoof} from '../app/js/world/mapped-roof-geometry.js';
const points=[{x:0,z:0},{x:12,z:0},{x:12,z:8},{x:0,z:8}];
const options={buildingIdentity:'osm:way:123',buildingType:'house',heightMeters:8,footprintWidth:12,footprintDepth:8,footprintArea:96};
test('regional palettes follow explicit residential use without assigning historic styles by country',()=>{
 const jp=resolveRegionalBuildingStyle({...options,location:{countryCode:'JP'}});
 assert.equal(jp.id,'japan-contemporary-lowrise');assert.equal(jp.roof,null);
 assert.equal(jp,resolveRegionalBuildingStyle({...options,location:{countryCode:'JP'}}));
 assert.equal(resolveRegionalBuildingStyle({...options,location:{countryCode:'IT'}}).id,'southern-europe-lowrise');
 assert.equal(resolveRegionalBuildingStyle({...options,buildingType:'cabin',location:{countryCode:'NO'}}).id,'northern-cabin');
 assert.equal(resolveRegionalBuildingStyle({...options,location:{countryCode:'NO'}}),null);
 for(const buildingType of ['yes','industrial','church','office']) assert.equal(resolveRegionalBuildingStyle({...options,buildingType,location:{countryCode:'JP'}}),null);
 assert.equal(resolveRegionalBuildingStyle({...options,heightMeters:40,location:{countryCode:'JP'}}),null);
});
test('mapped architecture outranks location, unsupported architecture remains unaltered',()=>{
 const tags={building:'house','building:architecture':'Mission Revival'};
 assert.equal(resolveRegionalBuildingStyle({...options,tags,location:{countryCode:'JP'}}).id,'mission-revival');
 assert.equal(resolveRegionalBuildingStyle({...options,tags:{...tags,'building:architecture':'unreviewed'},location:{countryCode:'JP'}}),null);
 const roof=resolveMappedRoof(tags,8,null,points,{location:{countryCode:'US'}});
 assert.equal(roof.shape,'hipped');assert.equal(roof.regionalStyleId,'mission-revival');
 assert.equal(resolveMappedRoof({...tags,'roof:shape':'flat'},8,null,points),null);
 const mapped=resolveMappedRoof({...tags,'roof:shape':'gabled','roof:height':'1'},8,null,points);
 assert.equal(mapped.shape,'gabled');assert.equal(mapped.roofHeight,1);assert.equal(mapped.roofShapeSource,'mapped');
});
test('near and mid exterior profiles preserve regional choices and stable identity',()=>{
 const context={...options,location:{countryCode:'JP'},tags:{building:'house'},geographicCenter:{lat:35.6,lon:139.7}};
 const near=selectBuildingExteriorProfile({...context,lodTier:'near',centerX:0,centerZ:0});
 const mid=selectBuildingExteriorProfile({...context,lodTier:'mid',centerX:1500,centerZ:-800});
 assert.equal(near.materialId,mid.materialId);assert.equal(near.familyId,mid.familyId);
 assert.ok(near.regionalStyle.materials.includes(near.materialId));
 assert.equal(near.regionalStyle.confidence,'regional-inference');
 assert.ok(Object.isFrozen(near.regionalStyle.materials));
});

test('coordinate-only selections use real country polygons and preserve explicit place metadata',()=>{
 for(const [lat,lon,code] of [[35.6762,139.6503,'JP'],[43.77,11.25,'IT'],[38.72,-9.14,'PT'],[59.33,18.06,'SE'],[60.17,24.94,'FI'],[45.42,-75.7,'CA']]) {
  assert.equal(buildingRegionCountry({lat,lon}),code);
 }
 for(const point of [{lat:0,lon:0},{lat:38,lon:135},{lat:91,lon:0},{lat:null,lon:null}]) assert.equal(buildingRegionCountry(point),'');
 assert.equal(buildingRegionCountry({lat:35.6,lon:139.7,countryCode:'US'}),'US');
 assert.equal(resolveRegionalBuildingStyle({...options,location:{lat:35.6762,lon:139.6503}}).id,'japan-contemporary-lowrise');
});
test('cabins and farmhouses remain residential rather than generic or agricultural sheds',()=>{
 for(const buildingType of ['cabin','farmhouse','dwelling_house']) {
  const profile=selectBuildingExteriorProfile({...options,buildingType,levels:2});
  assert.equal(profile.category,'residential');
  assert.equal(profile.familyId,'detached_suburban_house');
 }
 const barn=selectBuildingExteriorProfile({...options,buildingType:'farm_auxiliary'});
 assert.equal(barn.category,'agricultural');
});
