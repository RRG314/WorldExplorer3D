'use strict';
const crypto = require('node:crypto');
const HOUR = 3600000;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const REPLY_ADDRESS = 'testers@mail.worldexplorer3d.io';
const SUPPORT_ADDRESS = 'support@mail.worldexplorer3d.io';
const clean = (value, max=1000) => String(value || '').replace(/\r\n?/g,'\n').trim().slice(0,max);
const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function siteOrigin(project=process.env.GCLOUD_PROJECT) {
  return project === 'worldexplorer3d-d9b83' ? 'https://worldexplorer3d.io' : 'https://we3d-staging-20260712.web.app';
}
function accessUrl(value) {
  if (!value) return '';
  let url; try { url = new URL(value); } catch { throw Object.assign(Error('Use a valid HTTPS download or access link.'),{status:400}); }
  if (url.protocol !== 'https:' || url.username || url.password || /^(localhost|127\.|\[|0\.)/.test(url.hostname)) throw Object.assign(Error('Use a public HTTPS download or access link with no embedded username or password.'),{status:400});
  return url.href;
}
function template(kind, data) {
  const titles={verification:'Confirm your World Explorer tester interest',receipt:'Your World Explorer tester application is confirmed',owner:'A new World Explorer tester is ready for review',invitation:'You’re invited to test the new World Explorer app',accepted:'A tester accepted your World Explorer invitation',reply:'New message for World Explorer'};
  const title=titles[kind];if(!title)throw Error('Unknown tester email kind');
  const paragraphs={
    verification:['You asked to hear about testing the new World Explorer app. Confirm your email within one hour.','This confirms your application, not a testing place. We’ll review it and email you separately if you’re selected.','If you didn’t request this, ignore this email.'],
    receipt:['Your email is confirmed and your application is waiting for review.','You don’t need to do anything else yet. We’ll email you if a suitable test is available. This is not a newsletter subscription.'],
    owner:[`A person confirmed their tester application: ${data.email || ''}`,'Open your private Testers dashboard to approve them. Approval does not send an invitation until you choose Send invitation.'],
    invitation:['You’ve been selected to test the new World Explorer app.','Accept this invitation within 14 days to see the access link and getting-started instructions. Early versions may have bugs; your feedback will help us improve them.'],
    accepted:[`A tester accepted their invitation: ${data.email || ''}`,'You can see their status in your private Testers dashboard.'],
    reply:[`From: ${data.from || ''}`,`Subject: ${clean(data.subject,160)}`,clean(data.text,16000)||'(No plain-text message. Open Resend to read the original.)',data.hasAttachments?'Attachments are available in the original message in Resend. No attachments were forwarded automatically.':'']
  }[kind].filter(Boolean);
  const action=kind==='verification'?['Confirm my email',data.verifyUrl]:kind==='invitation'?['Review invitation',data.inviteUrl]:['owner','accepted'].includes(kind)?['Review testers',data.adminUrl]:null;
  const footer=[`Reply to ${REPLY_ADDRESS} with testing questions.`,data.manageUrl?`Stop testing invitations: ${data.manageUrl}`:'',kind==='verification'?'Testing invitations depend on availability.':''].filter(Boolean);
  const text=[title,'',...paragraphs.flatMap(p=>[p,'']),...(action?[`${action[0]}: ${action[1]}`,'']:[]),...footer].join('\n');
  const html=`<!doctype html><html><body style="margin:0;background:#f2f5fa;color:#17283b;font:16px/1.6 Arial,sans-serif"><div style="max-width:560px;margin:24px auto;padding:28px;background:white;border-radius:12px"><p style="font-size:12px;letter-spacing:2px;color:#52677e">WORLD EXPLORER</p><h1 style="font-size:24px;line-height:1.3">${escape(title)}</h1>${paragraphs.map(p=>`<p style="white-space:pre-wrap">${escape(p)}</p>`).join('')}${action?`<p><a href="${escape(action[1])}" style="display:inline-block;padding:12px 18px;background:#155fc4;color:white;border-radius:8px;text-decoration:none">${escape(action[0])}</a></p>`:''}<hr style="border:0;border-top:1px solid #d8e1eb"><p style="font-size:12px;color:#52677e">${footer.map(escape).join('<br>')}</p>${data.manageUrl?`<p><a href="${escape(data.manageUrl)}">Stop testing invitations</a></p>`:''}</div></body></html>`;
  return {subject:title,text,html};
}
function mailJob({kind,applicationId='',data={},recipient,from,revision=0,createdAtMs}) {
  const id=hash(`${kind}/${applicationId}/${revision}`);
  const message={from,to:[recipient],reply_to:['owner','accepted'].includes(kind)?data.email:kind==='reply'?data.from:REPLY_ADDRESS,...template(kind,data),tags:[{name:'we3d_flow',value:'tester'},{name:'we3d_job',value:id}]};
  if(data.manageUrl)message.headers={'List-Unsubscribe':`<${data.manageUrl}>`};
  return {id,kind,applicationId,revision,createdAtMs,status:'queued',attempts:0,retryRevision:0,message,expiresAt:new Date(createdAtMs+30*24*HOUR)};
}
const deliveryState = (current,next) => ({complained:5,bounced:4,failed:4,delivered:3,accepted:2,queued:1}[next]||0)>=({complained:5,bounced:4,failed:4,delivered:3,accepted:2,queued:1}[current]||0)?next:current;
async function deliverTesterMail({db,jobId,config,fetchImpl=fetch,now=Date.now}) {
  const ref=db.collection('appTesterMail').doc(jobId),snapshot=await ref.get();if(!snapshot.exists)return;
  const job=snapshot.data(),time=now();
  if(['accepted','delivered','bounced','complained','failed','cancelled','needs_attention','not_configured'].includes(job.status))return;
  if(job.applicationId){
    const app=(await db.collection('appTesterInterests').doc(job.applicationId).get()).data();
    if(!app||app.consentState!=='active'||['declined','withdrawn','suppressed'].includes(app.status)||(job.kind==='invitation'&&job.revision!==app.invitationVersion)){
      await ref.update({status:'cancelled',updatedAtMs:time});return;
    }
  }
  if(time-job.createdAtMs>23*HOUR){await ref.update({status:'needs_attention',updatedAtMs:time});return;}
  const cfg=config();if(!cfg.resendApiKey){await ref.update({status:'not_configured',updatedAtMs:time});return;}
  await ref.update({status:'sending',updatedAtMs:time,attempts:(job.attempts||0)+1});
  let response;
  try {response=await fetchImpl('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${cfg.resendApiKey}`,'Content-Type':'application/json','Idempotency-Key':`tester-mail/${jobId}`},body:JSON.stringify(job.message)});}
  catch(_){await ref.update({status:'retry_pending',updatedAtMs:time});throw Error('tester_mail_delivery_retry');}
  if(!response.ok){
    const retryable=response.status>=500||[408,409,429].includes(response.status);
    await ref.update({status:retryable?'retry_pending':'needs_attention',httpStatus:response.status,updatedAtMs:time});
    if(retryable)throw Error('tester_mail_delivery_retry');return;
  }
  const result=await response.json();if(!/^[a-zA-Z0-9-]{8,100}$/.test(result.id||'')){await ref.update({status:'retry_pending',updatedAtMs:time});throw Error('tester_mail_response_retry');}
  const providerId=result.id;
  await db.runTransaction(async tx=>{
    const [latest,receipt]=await Promise.all([tx.get(ref),tx.get(db.collection('appTesterMailReceipts').doc(providerId))]);
    tx.update(ref,{status:deliveryState(latest.data()?.status,receipt.data()?.status||'accepted'),providerId,updatedAtMs:time});
    tx.set(db.collection('appTesterMailProvider').doc(providerId),{jobId,applicationId:job.applicationId,kind:job.kind,expiresAt:new Date(time+30*24*HOUR)});
    if(job.applicationId&&['bounced','complained'].includes(receipt.data()?.status)&&['receipt','invitation'].includes(job.kind))tx.update(db.collection('appTesterInterests').doc(job.applicationId),{status:'suppressed',consentState:'suppressed',updatedAtMs:time});
  });
}
module.exports={HOUR,hash,clean,REPLY_ADDRESS,SUPPORT_ADDRESS,siteOrigin,accessUrl,template,mailJob,deliveryState,deliverTesterMail};
