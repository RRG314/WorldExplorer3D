const {test}=require('node:test');const assert=require('node:assert/strict');
const {Webhook}=require('../functions/node_modules/svix');
const {fixture}=require('./helpers/tester-program-fixture.cjs');
const {buildTesterProgramExports}=require('../functions/tester-program');
function exportsFor(f,authorized=true){return buildTesterProgramExports({...f,config:()=>f.cfg,setCors:()=>false,verifyAppCheck:async()=>true,requireModerator:async(_req,res)=>{if(!authorized){res.status(403).json({error:'Admin access required.'});return null;}return f.moderator;}});}
test('every admin action requires the existing moderator boundary, irrespective of body claims',async()=>{
 const f=fixture(),handlers=exportsFor(f,false);
 for(const action of ['list','approve','settings','preview','invite','retry','revoke','decline']){
  const result=await f.call(handlers.manageAppTesters,{action,admin:true,role:'admin',id:'a'.repeat(64),email:'other@example.com',expectedRevision:1});assert.equal(result.code,403);
 }
 assert.equal(f.db.records.size,0);assert.equal(f.requests.length,0);
});
test('signed webhooks use the exact raw body; forged, modified and stale signatures cannot mutate data',async()=>{
 const f=fixture(),handler=exportsFor(f).appTesterEmailWebhook,secret=f.cfg.webhookSecret;
 const payload=JSON.stringify({type:'email.delivered',data:{email_id:'provider-99'}}),id='message-1234',time=new Date();
 const headers={'svix-id':id,'svix-timestamp':String(Math.floor(time.getTime()/1000)),'svix-signature':new Webhook(secret).sign(id,time,payload)};
 for(const extra of [{rawBody:Buffer.from(payload),headers:{...headers,'svix-signature':'v1,forged'}},{rawBody:Buffer.from(payload+' '),headers},{rawBody:Buffer.from(payload),headers:{...headers,'svix-timestamp':'1'}}])assert.equal((await f.call(handler,{},extra)).code,400);
 assert.equal(f.db.records.size,0);
 assert.equal((await f.call(handler,{}, {rawBody:Buffer.from(payload),headers})).code,200);
 assert.equal(f.db.records.get('appTesterMailReceipts/provider-99').status,'delivered');
});
test('receipt management tokens cannot accept invitations or reveal download instructions',async()=>{
 const f=fixture();await f.confirmed();const job=f.jobs().find(j=>j.kind==='receipt'),token=job.message.text.match(/#manage\.([a-f0-9]{64})/)[1];
 await assert.rejects(()=>f.program.publicAction({action:'invitation',token}),/replaced|no longer/);
 const result=await f.program.publicAction({action:'status',token});assert.equal(result.canAccept,false);assert.equal(result.buildUrl,undefined);
});
test('a newer saved program invalidates a preview made before its change',async()=>{
 const f=fixture(),id=await f.confirmed(),app=f.db.records.get(`appTesterInterests/${id}`);
 await f.program.adminAction({action:'approve',id,expectedRevision:app.revision},f.moderator);
 await f.program.adminAction({action:'settings',buildUrl:'https://example.com/v1',instructions:'First instructions',expectedRevision:0},f.moderator);
 const current=f.db.records.get(`appTesterInterests/${id}`),preview=await f.program.adminAction({action:'preview',id,expectedRevision:current.revision},f.moderator);
 await f.program.adminAction({action:'settings',buildUrl:'https://example.com/v2',instructions:'Updated instructions',expectedRevision:1},f.moderator);
 await assert.rejects(()=>f.program.adminAction({action:'invite',id,expectedRevision:current.revision,settingsRevision:preview.settingsRevision},f.moderator),/settings changed/);
 assert.equal(f.jobs().filter(j=>j.kind==='invitation').length,0);
});
