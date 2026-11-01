import test from 'node:test';import assert from 'node:assert/strict';
import {listStoredActivities,saveStoredActivity} from '../app/js/activity-discovery/library.js';
const reference={version:1,districtFingerprint:'race-district:'+'a'.repeat(64),path:['road:forward'],discipline:'sprint',laps:1,participants:4,startOffsetMeters:null,name:'Harbour run'};
test('mapped race drafts use the existing activity library and report failed persistence honestly',()=>{
 const previous=globalThis.localStorage,map=new Map();globalThis.localStorage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};
 try {
  saveStoredActivity({id:'old-walk',templateId:'city-walk',title:'My walking route',anchors:[{x:1,y:2,z:3,typeId:'start'}]});
  saveStoredActivity({id:'my-race',templateId:'road-race',title:'Harbour run',raceRoute:reference});
  const rows=listStoredActivities();assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.id==='my-race').raceRoute,reference);
  assert.equal(rows.find(r=>r.id==='old-walk').anchors[0].z,3);
  globalThis.localStorage.setItem=()=>{throw Error('Quota exceeded');};
  assert.throws(()=>saveStoredActivity({id:'unsaved-race',templateId:'road-race',raceRoute:reference}),/save_failed/);
  assert.equal(listStoredActivities().length,2);
 }finally{globalThis.localStorage=previous;}
});
