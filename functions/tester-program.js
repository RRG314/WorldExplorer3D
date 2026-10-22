'use strict';
const crypto=require('node:crypto');
const {Webhook}=require('svix');
const {HOUR,hash,clean,REPLY_ADDRESS,SUPPORT_ADDRESS,siteOrigin,accessUrl,template,mailJob,deliveryState,deliverTesterMail}=require('./tester-mail');
const {buildTesterInterestExport}=require('./tester-interest');
const ID=/^[a-f0-9]{64}$/;
const fail=(status,message)=>Object.assign(Error(message),{status});
const token=()=>crypto.randomBytes(32).toString('hex');
function createTesterProgram({db,config,now=Date.now,randomToken=token,fetchImpl=fetch}){
 const appRef=id=>db.collection('appTesterInterests').doc(id);
 const capRef=value=>db.collection('appTesterCapabilities').doc(hash(value));
 const settingRef=db.collection('appTesterProgram').doc('current');
 const queue=(tx,job)=>{const {id,...record}=job;tx.create(db.collection('appTesterMail').doc(id),record);return id;};
 const audit=(tx,moderator,action,id,time)=>tx.create(db.collection('adminActivity').doc(crypto.randomUUID()),{actionType:`testers.${action}`,targetType:'tester_application',targetId:id,title:`Tester ${action}`,summary:'Tester program action',actorUid:moderator.auth.uid,actorName:moderator.displayName,createdAtMs:time});
 const settings=async()=>{const value=(await settingRef.get()).data()||{};const cfg=config();return {buildUrl:value.buildUrl||'',instructions:value.instructions||'',revision:value.revision||0,replyAddress:REPLY_ADDRESS,supportAddress:SUPPORT_ADDRESS,ownerNotificationConfigured:!!cfg.adminNotificationEmail,ownerNotificationAddress:cfg.adminNotificationEmail||'',emailConfigured:!!(cfg.emailFrom&&cfg.resendApiKey),webhookConfigured:value.webhookEnabled===true};};
 async function confirm(value){
  if(!ID.test(value||''))throw fail(400,'This confirmation link is invalid or expired.');
  const time=now(),origin=siteOrigin(),cfg=config(),manageToken=randomToken();
  if(!cfg.emailFrom||!cfg.adminNotificationEmail)throw fail(503,'Tester confirmation is temporarily unavailable. Please try again later.');
  const confirmation=db.collection('appTesterConfirmations').doc(hash(value));
  return db.runTransaction(async tx=>{
   const snap=await tx.get(confirmation),record=snap.data();
   if(!record||record.expiresAtMs<=time)throw fail(400,'This confirmation link is invalid or expired. Request a new one from the game.');
   const id=hash(record.email),ref=appRef(id),existing=(await tx.get(ref)).data();
   if(existing?.consentState==='suppressed')throw fail(400,'This address cannot currently receive testing invitations. Contact support for help.');
   if(!record.confirmedAtMs&&(!existing||existing.status==='withdrawn')){
    const revision=(existing?.revision||0)+1;
    const data={...existing,email:record.email,status:'pending',consentState:'active',consentVersion:'app-testing-v1',source:'start-hub',confirmedAtMs:time,updatedAtMs:time,revision,invitationVersion:(existing?.invitationVersion||0)+1,invitation:null,manageTokenHash:hash(manageToken)};
    tx.set(ref,data);tx.set(capRef(manageToken),{applicationId:id,purpose:'manage'});
    const manageUrl=`${origin}/account/tester.html#manage.${manageToken}`;
    const receipt=mailJob({kind:'receipt',applicationId:id,data:{manageUrl},recipient:record.email,from:cfg.emailFrom,revision,createdAtMs:time});
    queue(tx,receipt);
    if(cfg.adminNotificationEmail)queue(tx,mailJob({kind:'owner',applicationId:id,data:{email:record.email,adminUrl:`${origin}/account/admin.html?view=testers`},recipient:cfg.adminNotificationEmail,from:cfg.emailFrom,revision,createdAtMs:time}));
   }
   tx.update(confirmation,{confirmedAtMs:record.confirmedAtMs||time});
   return {confirmed:true,status:existing?.status==='withdrawn'?'pending':existing?.status||'pending'};
  });
 }
 async function publicAction(body){
  if(body.action==='confirm')return confirm(body.token);
  if(!['invitation','withdraw','status'].includes(body.action)||!ID.test(body.token||''))throw fail(400,'This link is invalid or expired.');
  const time=now(),ref=capRef(body.token),cfg=config();
  return db.runTransaction(async tx=>{
   const cap=(await tx.get(ref)).data();
   if(!cap||(cap.expiresAtMs&&cap.expiresAtMs<=time))throw fail(400,'This link is invalid or expired.');
   const application=appRef(cap.applicationId),app=(await tx.get(application)).data();
   if(!app)throw fail(400,'This link is invalid or expired.');
   if(body.action==='withdraw'){
    // Either a management or invitation capability may always stop contact.
    tx.update(application,{status:'withdrawn',consentState:'withdrawn',revision:(app.revision||0)+1,updatedAtMs:time,withdrawnAtMs:time,invitationVersion:(app.invitationVersion||0)+1});
    return {withdrawn:true};
   }
   if(app.consentState!=='active')throw fail(400,'Testing invitations have been stopped for this address.');
   if(body.action==='status')return {status:app.status,purpose:cap.purpose,canAccept:cap.purpose==='invite'&&cap.version===app.invitationVersion};
   if(cap.purpose!=='invite'||cap.version!==app.invitationVersion||!['invited','accepted'].includes(app.status))throw fail(400,'This invitation was replaced or is no longer available.');
   if(app.status!=='accepted'){
    tx.update(application,{status:'accepted',acceptedAtMs:time,updatedAtMs:time,revision:app.revision+1});
    if(cfg.adminNotificationEmail)queue(tx,mailJob({kind:'accepted',applicationId:cap.applicationId,data:{email:app.email,adminUrl:`${siteOrigin()}/account/admin.html?view=testers`},recipient:cfg.adminNotificationEmail,from:cfg.emailFrom,revision:cap.version,createdAtMs:time}));
   }
   return {accepted:true,buildUrl:app.invitation.buildUrl,instructions:app.invitation.instructions,replyAddress:REPLY_ADDRESS};
  });
 }
 async function list(body){
  const allowed=['pending','approved','invited','accepted','declined','withdrawn','suppressed','all'];
  const filter=allowed.includes(body.status)?body.status:'pending';
  let query=db.collection('appTesterInterests');if(filter!=='all')query=query.where('status','==',filter);
  query=query.orderBy('updatedAtMs','desc');
  if(body.cursor){if(!ID.test(body.cursor))throw fail(400,'Invalid page cursor.');const cursor=await appRef(body.cursor).get();if(cursor.exists)query=query.startAfter(cursor);}
  const snapshot=await query.limit(31).get(),docs=snapshot.docs.slice(0,30);
  const items=await Promise.all(docs.map(async doc=>{
   const app=doc.data(),jobs=await db.collection('appTesterMail').where('applicationId','==',doc.id).orderBy('createdAtMs','desc').limit(8).get();
   return {id:doc.id,email:app.email,status:app.status,revision:app.revision,confirmedAtMs:app.confirmedAtMs,updatedAtMs:app.updatedAtMs,acceptedAtMs:app.acceptedAtMs||null,invitationExpiresAtMs:app.invitation?.expiresAtMs||null,mail:jobs.docs.map(job=>{const j=job.data();return {id:job.id,kind:j.kind,status:j.status,createdAtMs:j.createdAtMs,retryAllowed:['retry_pending','not_configured','needs_attention'].includes(j.status)&&now()-j.createdAtMs<23*HOUR};})};
  }));
  return {items,nextCursor:snapshot.docs.length>30?docs.at(-1).id:null,settings:await settings()};
 }
 async function adminAction(body,moderator){
  const time=now(),action=body.action;
  if(action==='list')return list(body);
  if(action==='settings'){
   const buildUrl=accessUrl(clean(body.buildUrl,2000)),instructions=clean(body.instructions,4000);
   if(buildUrl&&!instructions)throw fail(400,'Add getting-started instructions before enabling invitations.');
   await db.runTransaction(async tx=>{const previous=(await tx.get(settingRef)).data();if((previous?.revision||0)!==body.expectedRevision)throw fail(409,'Program settings changed. Refresh and try again.');tx.set(settingRef,{buildUrl,instructions,revision:(previous?.revision||0)+1,updatedAtMs:time,updatedBy:moderator.auth.uid},{merge:true});audit(tx,moderator,'settings','program',time);});
   return {settings:await settings()};
  }
  if(!ID.test(body.id||''))throw fail(400,'Invalid tester application.');
  const ref=appRef(body.id);
  if(action==='retry'){
   if(!ID.test(body.jobId||''))throw fail(400,'Invalid email.');
   await db.runTransaction(async tx=>{const mail=db.collection('appTesterMail').doc(body.jobId),[jobSnap,appSnap]=await Promise.all([tx.get(mail),tx.get(ref)]),job=jobSnap.data(),app=appSnap.data();
    if(!job||job.applicationId!==body.id||!app||app.consentState!=='active'||!['retry_pending','not_configured','needs_attention'].includes(job.status)||time-job.createdAtMs>=23*HOUR)throw fail(409,'This email cannot be retried safely. Refresh to review its status.');
    tx.update(mail,{status:'queued',retryRevision:(job.retryRevision||0)+1,updatedAtMs:time});audit(tx,moderator,'retry-email',body.id,time);
   });return {queued:true};
  }
  if(!['approve','decline','invite','revoke','preview'].includes(action))throw fail(400,'Unknown tester action.');
  const inviteToken=randomToken(),manageToken=randomToken();
  return db.runTransaction(async tx=>{
   const snap=await tx.get(ref),app=snap.data();
   if(!app)throw fail(404,'Tester application not found.');
   if(app.revision!==body.expectedRevision)throw fail(409,'This application changed. Refresh before acting.');
   if(app.consentState!=='active'||['withdrawn','suppressed'].includes(app.status))throw fail(409,'This person has stopped testing invitations. They must reapply themselves.');
   const currentSettings=['invite','preview'].includes(action)?(await tx.get(settingRef)).data():null;
   let next={updatedAtMs:time,revision:app.revision+1};
   if(action==='approve'){if(app.status!=='pending')throw fail(409,'Only pending applications can be approved.');next.status='approved';next.approvedAtMs=time;}
   if(action==='decline'){next.status='declined';next.invitationVersion=(app.invitationVersion||0)+1;}
   if(action==='revoke'){if(!['invited','accepted'].includes(app.status))throw fail(409,'No active invitation to revoke.');next.status='approved';next.invitationVersion=(app.invitationVersion||0)+1;next.invitation=null;}
   if(['invite','preview'].includes(action)){
    if(!['approved','invited'].includes(app.status))throw fail(409,'Approve this application before sending an invitation.');
    const cfg=config(),buildUrl=accessUrl(currentSettings?.buildUrl);
    if(!buildUrl||!currentSettings?.instructions)throw fail(409,'The test build is not ready. Add its access link and instructions first. Approval is saved.');
    if(!cfg.resendApiKey||!cfg.emailFrom)throw fail(503,'Email sending is not configured.');
    if(action==='preview')return {recipient:app.email,...template('invitation',{inviteUrl:'#',manageUrl:'#'}),buildUrl,instructions:currentSettings.instructions,settingsRevision:currentSettings.revision};
    if(body.settingsRevision!==currentSettings.revision)throw fail(409,'Invitation settings changed. Preview the email again before sending.');
    const version=(app.invitationVersion||0)+1,expiresAtMs=time+14*24*HOUR;
    next={...next,status:'invited',invitationVersion:version,invitation:{buildUrl,instructions:currentSettings.instructions,expiresAtMs,version},invitedAtMs:time};
    tx.create(capRef(inviteToken),{applicationId:body.id,purpose:'invite',version,expiresAtMs,expiresAt:new Date(expiresAtMs+24*HOUR)});
    tx.create(capRef(manageToken),{applicationId:body.id,purpose:'manage'});
    // Each replacement invitation also contains a working withdrawal capability.
    queue(tx,mailJob({kind:'invitation',applicationId:body.id,data:{inviteUrl:`${siteOrigin()}/account/tester.html#invite.${inviteToken}`,manageUrl:`${siteOrigin()}/account/tester.html#manage.${manageToken}`},recipient:app.email,from:cfg.emailFrom,revision:version,createdAtMs:time}));
   }
   tx.update(ref,next);audit(tx,moderator,action,body.id,time);return {updated:true,status:next.status,revision:next.revision,queued:action==='invite'};
  });
 }
 async function webhook(event){
  const data=event.data||{},time=now();
  if(!/^[a-zA-Z0-9-]{8,100}$/.test(data.email_id||''))return;
  if(event.type==='email.received'){
   const recipients=Array.isArray(data.to)?data.to:[];
   if(!recipients.some(v=>[REPLY_ADDRESS,SUPPORT_ADDRESS].includes(String(v).toLowerCase())))return;
   const cfg=config();const eventFrom=String(data.from||'').match(/(?:<)?([^\s<>]+@[^\s<>]+)(?:>)?$/)?.[1]?.toLowerCase();
   if(!cfg.inboundEnabled&&(!cfg.inboundTestSender||eventFrom!==cfg.inboundTestSender.toLowerCase()))return;
   if(!cfg.resendApiKey||!cfg.adminNotificationEmail||!cfg.emailFrom)throw fail(503,'Incoming email forwarding unavailable.');
   if([REPLY_ADDRESS,SUPPORT_ADDRESS].includes(cfg.adminNotificationEmail.toLowerCase()))throw fail(503,'Forwarding destination must be a separate mailbox.');
   const key=hash(`reply//${data.email_id}`),mailRef=db.collection('appTesterMail').doc(key);
   if((await mailRef.get()).exists)return;
   const response=await fetchImpl(`https://api.resend.com/emails/receiving/${encodeURIComponent(data.email_id)}`,{headers:{Authorization:`Bearer ${cfg.resendApiKey}`},signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw fail(503,'Incoming message retrieval unavailable.');
   const received=await response.json(),from=String(received.from||'').match(/(?:<)?([^\s<>]+@[^\s<>]+)(?:>)?$/)?.[1]?.toLowerCase();
   const systemFrom=String(cfg.emailFrom).match(/(?:<)?([^\s<>]+@[^\s<>]+)(?:>)?$/)?.[1]?.toLowerCase();
   if(!from||from===systemFrom||(!cfg.inboundEnabled&&from!==cfg.inboundTestSender.toLowerCase()))return;
   const headers=received.headers||{},auto=String(headers['auto-submitted']||headers['Auto-Submitted']||'no').toLowerCase();
   if(auto!=='no'||Object.keys(headers).some(name=>name.toLowerCase()==='x-we3d-forwarded'))return;
   const job=mailJob({kind:'reply',data:{from,subject:received.subject,text:received.text,hasAttachments:(received.attachments||[]).length>0},recipient:cfg.adminNotificationEmail,from:cfg.emailFrom,revision:data.email_id,createdAtMs:time});
   await db.runTransaction(async tx=>{
    const quota=db.collection('appTesterRequestLimits').doc('incoming'),[exists,limit]=await Promise.all([tx.get(mailRef),tx.get(quota)]);
    if(exists.exists)return;
    const bucket=Math.floor(time/HOUR),count=limit.data()?.bucket===bucket?limit.data().count:0;
    if(count>=30)throw fail(429,'Incoming notification limit reached. Original message is retained in Resend.');
    tx.set(quota,{bucket,count:count+1,expiresAt:new Date(time+2*HOUR)});queue(tx,job);
   });return;
  }
  const status={'email.delivered':'delivered','email.bounced':'bounced','email.complained':'complained','email.failed':'failed'}[event.type];if(!status)return;
  await db.runTransaction(async tx=>{
   const receiptRef=db.collection('appTesterMailReceipts').doc(data.email_id),provider=await tx.get(db.collection('appTesterMailProvider').doc(data.email_id)),mapping=provider.data();
   const [previous,jobSnap]=await Promise.all([tx.get(receiptRef),mapping?tx.get(db.collection('appTesterMail').doc(mapping.jobId)):null]);
   const next=deliveryState(previous.data()?.status,status);tx.set(receiptRef,{status:next,updatedAtMs:time,expiresAt:new Date(time+30*24*HOUR)});
   if(mapping&&jobSnap?.exists){tx.update(jobSnap.ref,{status:deliveryState(jobSnap.data().status,next),updatedAtMs:time});if(mapping.applicationId&&['receipt','invitation'].includes(mapping.kind)&&['bounced','complained'].includes(next))tx.update(appRef(mapping.applicationId),{status:'suppressed',consentState:'suppressed',updatedAtMs:time});}
  });
 }
 return {confirm,publicAction,adminAction,webhook,settings};
}
function buildTesterProgramExports({functions,db,setCors,verifyAppCheck,requireModerator,config,fetchImpl=fetch,now=Date.now}){
 const program=createTesterProgram({db,config,fetchImpl,now});
 const http=handler=>functions.region('us-central1').runWith({invoker:'public',timeoutSeconds:60,maxInstances:3}).https.onRequest(async(req,res)=>{
  res.set('Cache-Control','no-store');if(setCors(req,res))return;if(req.method!=='POST')return res.status(405).json({error:'Use POST.'});
  const moderator=await requireModerator(req,res);if(!moderator)return;
  try{return res.status(200).json(await handler(req.body||{},moderator));}catch(error){return res.status(error.status||503).json({error:error.status?error.message:'Tester program is temporarily unavailable.'});}
 });
 return {
  registerAppTester:buildTesterInterestExport({functions,db,setCors,verifyAppCheck,config,program,fetchImpl,now}),
  manageAppTesters:http(program.adminAction),
  deliverAppTesterMail:functions.region('us-central1').runWith({timeoutSeconds:60,maxInstances:3,failurePolicy:true}).firestore.document('appTesterMail/{jobId}').onWrite(async(change,context)=>{
   if(!change.after.exists)return;
   const before=change.before.data(),after=change.after.data();if(before&&before.retryRevision===after.retryRevision)return;
   return deliverTesterMail({db,jobId:context.params.jobId,config,fetchImpl,now});
  }),
  appTesterEmailWebhook:functions.region('us-central1').runWith({invoker:'public',timeoutSeconds:60,maxInstances:3,secrets:['WE3D_TESTER_RESEND_WEBHOOK_SECRET']}).https.onRequest(async(req,res)=>{
   if(req.method!=='POST')return res.status(405).send('Use POST.');
   const secret=config().webhookSecret;if(!secret)return res.status(503).send('Webhook not configured.');
   let event;try{if(!Buffer.isBuffer(req.rawBody)||req.rawBody.length>256*1024)throw Error('Invalid body');new Webhook(secret).verify(req.rawBody.toString('utf8'),{'svix-id':req.get('svix-id'),'svix-timestamp':req.get('svix-timestamp'),'svix-signature':req.get('svix-signature')});event=JSON.parse(req.rawBody.toString('utf8'));if(!event||typeof event!=='object')throw Error('Invalid event');}catch(_){return res.status(400).send('Invalid webhook signature.');}
   try{await program.webhook(event);return res.status(200).json({received:true});}catch(_){return res.status(503).send('Email processing temporarily unavailable.');}
  })
 };
}
module.exports={createTesterProgram,buildTesterProgramExports};
