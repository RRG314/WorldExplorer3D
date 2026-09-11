import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSurveyMetadata as normalize} from '../app/js/reality-capture/survey-metadata.js';
test('missing, malformed and out-of-range coordinates are not converted to a location',()=>{
  for(const raw of [{},{latitude:null,longitude:null},{latitude:NaN,longitude:NaN},{latitude:'39',longitude:'-76'},{latitude:91,longitude:0}])assert.equal(normalize(raw).location,null);
});
test('valid zero coordinates remain evidence, not a building assignment',()=>{
  const result=normalize({latitude:0,longitude:0,GPSImgDirection:90,GPSImgDirectionRef:'T'});
  assert.equal(result.location.latitude,0);assert.equal(result.location.subjectLocation,false);assert.equal(result.assignmentStatus,'unassigned');assert.equal(result.heading.reference,'true');
});
test('pixel orientation is distinct from compass heading; magnetic heading stays magnetic',()=>{
  assert.equal(normalize({Orientation:6}).heading,null);
  assert.equal(normalize({GPSImgDirection:30,GPSImgDirectionRef:'M'}).heading.reference,'magnetic');
  assert.equal(normalize({GPSImgDirection:30}).heading,null);
});
