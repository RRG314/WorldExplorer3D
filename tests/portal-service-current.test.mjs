import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {buildSharedPortal} from '../scripts/build-shared-portal.mjs';
const {buildPortalExports}=createRequire(import.meta.url)('../functions/portal.js');
function fixture(){
  const records=new Map(),writes=[];let at=1800000000000,auth={uid:'owner'},checked=true;
  function ref(path){return {path,id:path.split('/').at(-1),collection:name=>collection(`${path}/${name}`)};}
  function collection(path){return {doc:id=>ref(`${path}/${id}`),orderBy:()=>query(path)};}
  function query(path,after='',count=100){return {startAfter:id=>query(path,id,count),limit:n=>query(path,after,n),get:async()=>({docs:[...records].filter(([key])=>key.startsWith(path+'/')&&key.split('/').length===path.split('/').length+1&&key.split('/').at(-1)>after).sort(([a],[b])=>a<b?-1:1).slice(0,count).map(([key,value])=>({id:key.split('/').at(-1),data:()=>structuredClone(value)}))})};}
  const db={collection,async runTransaction(work){const pending=[];let written=false;
    const result=await work({get:async ref=>{assert.equal(written,false,'Firestore reads must precede writes');const value=records.get(ref.path);return {exists:value!==undefined,data:()=>value&&structuredClone(value)};},
      set:(ref,value)=>{written=true;pending.push([ref.path,value]);},create:(ref,value)=>{written=true;assert.ok(!records.has(ref.path));pending.push([ref.path,value]);}});
    for(const [path,value] of pending){records.set(path,structuredClone(value));writes.push(path);}return result;
  }};
  const functions={region:()=>({runWith(){return this;},https:{onRequest:handler=>handler}})};
  const endpoints=buildPortalExports({functions,db,now:()=>at++,setCors:()=>false,verifyAuth:async(req,res)=>{if(!auth)res.status(401).json({error:'Auth required'});return auth;},verifyAppCheck:async(req,res)=>{if(!checked)res.status(401).json({error:'App Check required'});return checked;}});
  async function call(name,body,method='POST'){const res={code:200,status(code){this.code=code;return this;},set(){},json(body){this.body=body;return this;}};await endpoints[name]({method,body},res);return res;}
  return {records,writes,call,setAuth:value=>auth=value,setCheck:value=>checked=value};
}
const action=(kind='save',operationId='operation-1')=>({expectedOwnerUid:'owner',action:{operationId,destinationId:'baltimore-harbor',kind,createdAt:1000,...(kind==='investigate'?{contentVersion:'2026.10.25.1'}:{})}});

test('service uses the same checked-in catalog and Trail rules as browser clients',async()=>{
  const output=await buildSharedPortal({write:false});assert.equal(output.outputFiles[0].text,await readFile(new URL('../functions/generated/portal.cjs',import.meta.url),'utf8'));
});
test('actual endpoint pins account and attestation before any durable action',async()=>{
  const f=fixture();for(const body of [{}, {...action(),expectedOwnerUid:'other'}])assert.equal((await f.call('mutatePortalTrail',body)).code,409);
  f.setAuth(null);assert.equal((await f.call('mutatePortalTrail',action())).code,401);f.setAuth({uid:'owner'});f.setCheck(false);assert.equal((await f.call('mutatePortalTrail',action())).code,401);
  assert.equal((await f.call('mutatePortalTrail',action(),'GET')).code,405);assert.equal(f.writes.length,0);
});
test('save/learn/unsave commit independent server facts; replay acknowledges current state exactly once',async()=>{
  const f=fixture(),save=await f.call('mutatePortalTrail',action());assert.equal(save.body.state.saved,true);assert.ok(save.body.state.savedAt>1000);assert.equal(save.body.state.revision,1);
  const learned=await f.call('mutatePortalTrail',action('investigate','learn-1'));assert.equal(learned.body.state.investigationVersion,'2026.10.25.1');
  await f.call('mutatePortalTrail',action('unsave','unsave-1'));const before=f.writes.length;
  const replay=await f.call('mutatePortalTrail',action());assert.equal(f.writes.length,before);assert.equal(replay.body.state.saved,false);assert.equal(replay.body.state.revision,3);
  assert.equal(replay.body.state.visitedAt,0);assert.deepEqual(replay.body.state.expeditionIds,[]);assert.ok(replay.body.state.investigatedAt>0);
  assert.equal((await f.call('mutatePortalTrail',action('unsave'))).code,409);
  assert.ok(f.writes.every(path=>/\/portal(Trail|Operations|Limits)\//.test(path)),'no character, item, claim or reward mutation');
});
test('unknown places, completion verbs, stale content, excessive payload and deleting accounts cannot mutate',async()=>{
  const f=fixture();const invalid=[{...action(),action:{...action().action,destinationId:'invented-place'}},action('visited'),{...action('investigate'),action:{...action('investigate').action,contentVersion:'old'}},{...action(),extra:'x'.repeat(5000)}];
  for(const body of invalid)assert.ok((await f.call('mutatePortalTrail',body)).code>=400);assert.equal(f.writes.length,0);
  f.records.set('captureAccountDeletions/owner',{started:true});assert.equal((await f.call('mutatePortalTrail',action())).code,409);assert.equal(f.writes.length,0);
});
test('bounded private pagination returns only current owner and validates page limits',async()=>{
  const f=fixture();await f.call('mutatePortalTrail',action());await f.call('mutatePortalTrail',{...action('save','monaco-1'),action:{...action('save','monaco-1').action,destinationId:'monaco-coast'}});
  f.records.set('explorerProfiles/other/portalTrail/secret',{destinationId:'secret'});
  const first=await f.call('listPortalTrail',{expectedOwnerUid:'owner',limit:1});assert.equal(first.body.items[0].destinationId,'baltimore-harbor');assert.equal(first.body.nextCursor,'baltimore-harbor');
  const next=await f.call('listPortalTrail',{expectedOwnerUid:'owner',limit:1,after:first.body.nextCursor});assert.equal(next.body.items[0].destinationId,'monaco-coast');assert.equal(next.body.nextCursor,null);
  for(const body of [{limit:101},{limit:0},{limit:2.5},{after:'../other'}])assert.equal((await f.call('listPortalTrail',{expectedOwnerUid:'owner',...body})).code,400);
});
test('rate limit keeps pending choices retryable and never charges exact retries again',async()=>{
  const f=fixture();await f.call('mutatePortalTrail',action());f.records.set('explorerProfiles/owner/portalLimits/actions',{windowAt:1800000000000,count:120});
  assert.equal((await f.call('mutatePortalTrail',action())).code,200);
  const before=f.writes.length;assert.equal((await f.call('mutatePortalTrail',action('unsave','later'))).code,429);assert.equal(f.writes.length,before);
});
