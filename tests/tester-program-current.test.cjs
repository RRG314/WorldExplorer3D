const {test}=require('node:test');const assert=require('node:assert/strict');
const {fixture}=require('./helpers/tester-program-fixture.cjs');
const {hash,HOUR,accessUrl,template}=require('../functions/tester-mail');
const application=(f,id)=>f.db.records.get(`appTesterInterests/${id}`);
const action=(f,id,name,extra={})=>f.program.adminAction({action:name,id,expectedRevision:application(f,id).revision,...extra},f.moderator);
async function enable(f){await f.program.adminAction({action:'settings',buildUrl:'https://example.com/download#beta',instructions:'Install this test build. Try exploration and reply with feedback.',expectedRevision:0},f.moderator);}
async function invite(f,id){await action(f,id,'approve');await enable(f);const preview=await action(f,id,'preview');await action(f,id,'invite',{settingsRevision:preview.settingsRevision});return f.jobs().find(j=>j.kind==='invitation');}
test('confirmed applications queue one owner alert and receipt, retain approval on reconfirmation',async()=>{
 const f=fixture(),id=await f.confirmed();assert.equal(application(f,id).status,'pending');assert.deepEqual(f.jobs().map(j=>j.kind).sort(),['owner','receipt']);
 await action(f,id,'approve');await f.program.confirm(await f.request());assert.equal(application(f,id).status,'approved');assert.equal(f.jobs().length,2);
 const owner=f.jobs().find(j=>j.kind==='owner');await f.deliver(owner.id);assert.deepEqual(f.requests.at(-1).body.to,['owner@example.com']);assert.equal(f.requests.at(-1).body.reply_to,'tester@example.com');
});
test('approval works without a build, invitations require saved instructions and explicit preview revision',async()=>{
 const f=fixture(),id=await f.confirmed();await action(f,id,'approve');assert.equal(f.jobs().filter(j=>j.kind==='invitation').length,0);
 await assert.rejects(()=>action(f,id,'invite',{settingsRevision:0}),/not ready/);
 await enable(f);const preview=await action(f,id,'preview');assert.equal(preview.recipient,'tester@example.com');assert.match(preview.html,/Review invitation/);
 await assert.rejects(()=>action(f,id,'invite',{settingsRevision:0}),/settings changed/);
 await action(f,id,'invite',{settingsRevision:preview.settingsRevision});assert.equal(application(f,id).status,'invited');assert.equal(f.jobs().filter(j=>j.kind==='invitation').length,1);
});
test('competing approvals or send requests cannot double-commit or enqueue duplicate invitations',async()=>{
 const f=fixture(),id=await f.confirmed(),revision=application(f,id).revision;
 const result=await Promise.allSettled([1,2].map(()=>f.program.adminAction({action:'approve',id,expectedRevision:revision},f.moderator)));assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
 await enable(f);const preview=await action(f,id,'preview'),rev=application(f,id).revision;
 const sent=await Promise.allSettled([1,2].map(()=>f.program.adminAction({action:'invite',id,expectedRevision:rev,settingsRevision:preview.settingsRevision},f.moderator)));assert.equal(sent.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.jobs().filter(j=>j.kind==='invitation').length,1);
});
test('lost provider response retries the identical message and is accepted only once',async()=>{
 const f=fixture(),id=await f.confirmed(),job=f.jobs().find(j=>j.kind==='owner');f.setAmbiguous();
 await assert.rejects(()=>f.deliver(job.id),/retry/);const accepted=f.delivered.size;await f.deliver(job.id);assert.equal(f.delivered.size,accepted);
 const stored=f.db.records.get(`appTesterMail/${job.id}`);assert.equal(stored.status,'accepted');await f.deliver(job.id);assert.equal(f.delivered.size,accepted);
});
test('late retries stop before provider idempotency expires; withdrawal cancels queued mail',async()=>{
 const f=fixture(),id=await f.confirmed(),receipt=f.jobs().find(j=>j.kind==='receipt'),manage=receipt.message.text.match(/#manage\.([a-f0-9]{64})/)[1];
 await f.program.publicAction({action:'withdraw',token:manage});await f.deliver(receipt.id);assert.equal(f.db.records.get(`appTesterMail/${receipt.id}`).status,'cancelled');
 await assert.rejects(()=>action(f,id,'approve'),/must reapply/);
 const other=fixture();await other.confirmed();const mail=other.jobs()[0];other.advance(24*HOUR);await other.deliver(mail.id);assert.equal(other.db.records.get(`appTesterMail/${mail.id}`).status,'needs_attention');
});
test('invitation is explicit, repeat acceptance is idempotent and management link outlives invitation',async()=>{
 const f=fixture(),id=await f.confirmed(),job=await invite(f,id),token=job.message.text.match(/#invite\.([a-f0-9]{64})/)[1],manage=job.message.text.match(/#manage\.([a-f0-9]{64})/)[1];
 assert.equal(application(f,id).status,'invited');const accepted=await f.program.publicAction({action:'invitation',token});assert.equal(accepted.buildUrl,'https://example.com/download#beta');
 await f.program.publicAction({action:'invitation',token});assert.equal(f.jobs().filter(j=>j.kind==='accepted').length,1);
 f.advance(15*24*HOUR);await assert.rejects(()=>f.program.publicAction({action:'invitation',token}),/expired/);assert.equal((await f.program.publicAction({action:'withdraw',token:manage})).withdrawn,true);
});
test('replacement and revoked invitations cannot disclose access details',async()=>{
 const f=fixture(),id=await f.confirmed(),first=await invite(f,id),token=first.message.text.match(/#invite\.([a-f0-9]{64})/)[1];
 await action(f,id,'invite',{settingsRevision:1});await assert.rejects(()=>f.program.publicAction({action:'invitation',token}),/replaced/);
 const current=f.jobs().filter(j=>j.kind==='invitation').at(-1),latest=current.message.text.match(/#invite\.([a-f0-9]{64})/)[1];await action(f,id,'revoke');await assert.rejects(()=>f.program.publicAction({action:'invitation',token:latest}),/replaced/);
});
test('delivery events survive arriving before provider acknowledgement; bounce suppresses invitations',async()=>{
 const f=fixture(),id=await f.confirmed(),receipt=f.jobs().find(j=>j.kind==='receipt');
 await f.program.webhook({type:'email.bounced',data:{email_id:'provider-2'}});await f.deliver(receipt.id);
 assert.equal(f.db.records.get(`appTesterMail/${receipt.id}`).status,'bounced');assert.equal(application(f,id).consentState,'suppressed');
 await assert.rejects(()=>action(f,id,'approve'),/must reapply/);
 await f.program.webhook({type:'email.delivered',data:{email_id:'provider-2'}});assert.equal(f.db.records.get(`appTesterMail/${receipt.id}`).status,'bounced');
});
test('verified inbound replies forward once, with a safe sender and original reply-to',async()=>{
 const f=fixture();f.setIncoming({from:'Tester <person@example.com>',subject:'Feedback <img src=x>',text:'The build works. Here is my feedback.',attachments:[{id:'attachment'}]});
 const event={type:'email.received',data:{email_id:'incoming-1234',to:['testers@mail.worldexplorer3d.io']}};
 await f.program.webhook(event);await f.program.webhook(event);assert.equal(f.jobs().length,1);const job=f.jobs()[0];assert.equal(job.message.reply_to,'person@example.com');assert.match(job.message.text,/Attachments are available/);assert.ok(!job.message.html.includes('<img src=x>'));await f.deliver(job.id);assert.deepEqual(f.requests.at(-1).body.to,['owner@example.com']);
});
test('inbound aliases, automated responses and own-mailbox replies do not create loops',async()=>{
 const f=fixture();f.setIncoming({from:'Owner <owner@example.com>',text:'reply'});await f.program.webhook({type:'email.received',data:{email_id:'incoming-1111',to:['testers@mail.worldexplorer3d.io']}});
 f.setIncoming({from:'sender@example.com',headers:{'auto-submitted':'auto-replied'}});await f.program.webhook({type:'email.received',data:{email_id:'incoming-2222',to:['support@mail.worldexplorer3d.io']}});
 await f.program.webhook({type:'email.received',data:{email_id:'incoming-3333',to:['unknown@mail.worldexplorer3d.io']}});assert.equal(f.jobs().length,0);
});
test('access links validate HTTPS and email templates escape user controlled content',()=>{
 for(const value of ['javascript:alert(1)','http://example.com','https://name:secret@example.com','not a url'])assert.throws(()=>accessUrl(value));
 const result=template('reply',{from:'a@example.com',subject:'<script>x</script>',text:'<img src=x onerror=alert(1)>'});assert.ok(!result.html.includes('<script>'));assert.ok(!result.html.includes('<img src=x'));assert.ok(result.text.includes('<img src=x'));
});
