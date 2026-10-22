const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildTesterInterestExport} = require('../functions/tester-interest');
function fixture({allowed=true, sendOk=true, configured=true}={}) {
  const records = new Map(), sent=[]; let time=100000000, serial=0, appChecks=0;
  const ref = path => ({path});
  const db={collection:name=>({doc:id=>ref(`${name}/${id}`)}),runTransaction:async fn=>{
    const writes=[];
    const result=await fn({get:async r=>({data:()=>records.get(r.path)}),set:(r,d)=>writes.push(()=>records.set(r.path,d)),
      create:(r,d)=>writes.push(()=>{assert.ok(!records.has(r.path));records.set(r.path,d)}),update:(r,d)=>writes.push(()=>records.set(r.path,{...records.get(r.path),...d}))});
    writes.forEach(write=>write());return result;
  }};
  const functions={region:()=>({runWith:()=>({https:{onRequest:fn=>fn}})})};
  const handler=buildTesterInterestExport({functions,db,setCors:()=>false,verifyAppCheck:async(_req,res)=>{appChecks++;if(!allowed)res.status(401).json({error:'App Check required'});return allowed;},
    config:()=>configured?{projectId:'we3d-staging-20260712',resendApiKey:'server-only-test-key',adminNotificationEmail:'owner@example.com',emailFrom:'World Explorer <test@mail.worldexplorer3d.io>'}:{},
    now:()=>time,randomToken:()=> (++serial).toString(16).padStart(64,'0'),fetchImpl:async(url,init)=>{sent.push({url,...init,body:JSON.parse(init.body)});return {ok:sendOk};}});
  const call=async(body,method='POST')=>{const res={code:200,set(){},status(code){this.code=code;return this},json(value){this.body=value;return this}};await handler({body,method,ip:'127.0.0.2'},res);return res};
  return {call,records,sent,appChecks:()=>appChecks,advance:ms=>time+=ms};
}
const request={action:'request',email:'Tester@example.com',consent:true,consentVersion:'app-testing-v1'};
test('request delivers verification but records no interest until explicit confirmation',async()=>{
  const f=fixture();assert.equal((await f.call(request)).body.pending,true);assert.equal(f.sent.length,1);
  assert.equal([...f.records.keys()].filter(k=>k.startsWith('appTesterInterests/')).length,0);
  assert.equal(f.sent[0].body.to[0],'tester@example.com');assert.match(f.sent[0].body.text,/tester.html#[a-f0-9]{64}/);
  const token=f.sent[0].body.text.match(/#([a-f0-9]{64})/)[1];
  assert.equal((await f.call({action:'confirm',token},'GET')).code,405);
  assert.equal((await f.call({action:'confirm',token})).body.confirmed,true);
  assert.equal((await f.call({action:'confirm',token})).body.confirmed,true);
  const interests=[...f.records].filter(([k])=>k.startsWith('appTesterInterests/'));
  assert.equal(interests.length,1);assert.equal(interests[0][1].consentVersion,'app-testing-v1');assert.equal(f.sent.length,1);assert.equal(f.appChecks(),1);
});
test('consent, input and App Check failures never send mail',async()=>{
  const f=fixture();for(const invalid of [{...request,consent:false},{...request,consentVersion:'wrong'},{...request,email:'a\r\nb@x.com'}])assert.equal((await f.call(invalid)).code,400);
  assert.equal(f.sent.length,0);const denied=fixture({allowed:false});assert.equal((await denied.call(request)).code,401);assert.equal(denied.sent.length,0);
});
test('expired and fabricated capabilities never create verified records',async()=>{
  const f=fixture();await f.call(request);f.advance(3600001);
  for(const token of ['1'.padStart(64,'0'),'a'.repeat(64),'bad'])assert.equal((await f.call({action:'confirm',token})).code,400);
  assert.equal([...f.records.keys()].filter(k=>k.startsWith('appTesterInterests/')).length,0);
});
test('per-address quota survives separate requests and resets with the hour',async()=>{
  const f=fixture();for(let i=0;i<3;i++)assert.equal((await f.call(request)).code,200);
  assert.equal((await f.call({...request,email:'TESTER@EXAMPLE.COM'})).code,429);assert.equal(f.sent.length,3);
  f.advance(3600000);assert.equal((await f.call(request)).code,200);
  assert.ok([...f.records.values()].filter(v=>v.bucket).every(v=>v.expiresAt instanceof Date));
});
test('delivery failures and missing configuration never report confirmation or pending success',async()=>{
  const failed=fixture({sendOk:false});assert.equal((await failed.call(request)).code,503);
  assert.equal([...failed.records.keys()].filter(k=>k.startsWith('appTesterInterests/')).length,0);
  const missing=fixture({configured:false});assert.equal((await missing.call(request)).code,503);assert.equal(missing.sent.length,0);assert.equal(missing.records.size,0);
});
test('IP quota bounds many different addresses without retaining raw IP',async()=>{
  const f=fixture();for(let i=0;i<10;i++)assert.equal((await f.call({...request,email:`tester${i}@example.com`})).code,200);
  assert.equal((await f.call({...request,email:'overflow@example.com'})).code,429);
  assert.ok(!JSON.stringify([...f.records]).includes('127.0.0.2'));
});
