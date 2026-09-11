'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {cleanupCaptureAccount}=require('../functions/capture-account-cleanup');
const {stableId}=require('../functions/reality-capture-authority');
test('account cleanup withdraws publications, retains other owners, removes every generation and resumes after failure',async()=>{
 const manifest='buildingPatchManifests/'+stableId('building-patches','osm:1');
 const records=new Map(Object.entries({
  'realityCaptures/owned':{ownerUid:'owner',building:{sourceBuildingId:'osm:1'}},
  'realityCaptures/owned/attempts/old':{state:'done'},
  'realityCaptures/other':{ownerUid:'other'},
  'buildingRepresentations/pub':{captureId:'owned',status:'approved'},
  'buildingRepresentations/other':{captureId:'other',status:'approved'},
  [manifest]:{regions:[{captureId:'owned'},{captureId:'other'}]},
  'privateSpaces/home':{ownerUid:'owner'},
  'privateSpaces/home/members/owner':{uid:'owner'},
  'privateSpaces/neighbor':{ownerUid:'other'},
  'privateSpaces/neighbor/members/owner':{uid:'owner'},
  'privateSpaces/neighbor/sessionGrants/owner':{uid:'owner'},
  'privateSpaces/neighbor/oneTimeGrants/owner':{uid:'owner'},
  'privateSpaceAccessRequests/request':{spaceId:'home',ownerUid:'owner',requesterUid:'visitor'},
  'captureAdmission/owner':{count:2}
 }));
 const files=new Set(['reality-captures/owner/owned/originals/a.jpg#1','reality-captures/owner/owned/originals/a.jpg#2','reality-captures/owner/orphan/originals/b.jpg#1','reality-captures/other/capture/originals/a.jpg#1']);let fail=true;
 const ref=path=>({path,get:async()=>snap(path),set:async data=>records.set(path,{...records.get(path),...data}),delete:async()=>records.delete(path)});
 const snap=path=>({id:path.split('/').at(-1),ref:ref(path),exists:records.has(path),data:()=>records.get(path)});
 function query(path,filters=[],count=Infinity,group=false){return {where:(field,op,value)=>query(path,[...filters,[field,value]],count,group),limit:n=>query(path,filters,n,group),doc:id=>ref(path+'/'+id),get:async()=>{const docs=[...records.keys()].filter(key=>(group?key.split('/').at(-2)===path:key.startsWith(path+'/')&&key.split('/').length===path.split('/').length+1)&&filters.every(([field,value])=>records.get(key)[field]===value)).slice(0,count).map(snap);return {docs,empty:!docs.length};}};}
 const db={collection:path=>query(path),collectionGroup:path=>query(path,[],Infinity,true),recursiveDelete:async ref=>{for(const path of records.keys())if(path===ref.path||path.startsWith(ref.path+'/'))records.delete(path);},runTransaction:async action=>{const writes=[];await action({get:obj=>obj.get(),update:(ref,data)=>writes.push(()=>records.set(ref.path,{...records.get(ref.path),...data})),delete:ref=>writes.push(()=>records.delete(ref.path))});writes.forEach(w=>w());}};
 const bucket={getFiles:async({prefix,versions})=>{assert.equal(versions,true);if(fail){fail=false;throw Error('storage unavailable');}return [[...files].filter(path=>path.startsWith(prefix)).map(path=>({delete:async()=>{assert.equal(records.has('buildingRepresentations/pub'),false);files.delete(path);}}))];}};
 const input={db,bucket,uid:'owner',FieldValue:{serverTimestamp:()=>1}};
 await assert.rejects(()=>cleanupCaptureAccount(input),/storage unavailable/);
 assert.equal(records.get('captureAccountDeletions/owner').status,'deleting');assert.equal(records.get('realityCaptures/owned').status,'deleting');
 await cleanupCaptureAccount(input);await cleanupCaptureAccount(input);
 assert.equal(records.get('captureAccountDeletions/owner').status,'complete');
 assert.equal([...records.keys()].some(k=>k.startsWith('realityCaptures/owned')||k.startsWith('privateSpaces/home')),false);
 assert.equal(records.has('privateSpaces/neighbor/members/owner'),false);assert.equal(records.has('privateSpaceAccessRequests/request'),false);assert.equal(records.has('captureAdmission/owner'),false);
 assert.deepEqual(records.get(manifest).regions,[{captureId:'other'}]);assert.ok(records.has('buildingRepresentations/other'));
 assert.deepEqual([...files],['reality-captures/other/capture/originals/a.jpg#1']);
});
