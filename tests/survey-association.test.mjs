import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rankSurveyBuildings} from '../app/js/reality-capture/survey-association.js';
const building=(id,lat,lon=0)=>({sourceBuildingId:id,worldId:'earth:test',lat,lon,spatialContext:{footprint:[{x:-5,z:-5},{x:5,z:-5},{x:5,z:5},{x:-5,z:5}]}});
test('missing GPS stays unresolved, even beside one candidate',()=>assert.deepEqual(rankSurveyBuildings({location:null},[building('a',0)]),[]));
test('true heading favors the building ahead over a nearer building behind',()=>{
  const result=rankSurveyBuildings({location:{latitude:0,longitude:0},heading:{degrees:0,reference:'true'}},[building('near-behind',-.00005),building('ahead',.0004)]);
  assert.equal(result[0].building.sourceBuildingId,'ahead');assert.equal(result[0].confidence,'MEDIUM');assert.ok(Number.isInteger(result[0].wall));assert.equal(result[0].confirmed,undefined);
});
test('magnetic and absent headings do not masquerade as reliable true bearings',()=>{
  const result=rankSurveyBuildings({location:{latitude:0,longitude:0},heading:{degrees:0,reference:'magnetic'}},[building('a',.0003),building('b',-.0001)]);
  assert.equal(result[0].confidence,'LOW');assert.equal(result[0].building.sourceBuildingId,'b');
});
test('distant buildings are excluded and alternatives are bounded',()=>{
  const result=rankSurveyBuildings({location:{latitude:0,longitude:0}},[building('far',20),...Array.from({length:8},(_,i)=>building(String(i),.0001*(i+1)))]);
  assert.equal(result.length,3);assert.ok(result.every(r=>r.building.sourceBuildingId!=='far'));
});
