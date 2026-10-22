import {postProtectedFunction} from './function-api.js?v=3';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pending:'Awaiting review',approved:'Approved · not invited',invited:'Invitation queued or sent',accepted:'Invitation accepted',declined:'Closed',withdrawn:'Contact stopped',suppressed:'Email blocked or bounced'};
const mailLabels={queued:'Queued',sending:'Sending',accepted:'Accepted by provider · delivery pending',delivered:'Delivered',retry_pending:'Temporary failure · retry pending',not_configured:'Sender configuration needed',needs_attention:'Needs attention',failed:'Delivery failed',bounced:'Bounced',complained:'Recipient marked as spam',cancelled:'Cancelled'};
const date=value=>value?new Date(value).toLocaleString():'—';
export function mountAdminTesters(root,{userId,call=(body,options)=>postProtectedFunction('/manageAppTesters',body,{...options,label:'Tester program'})}={}){
 const lifetime=new AbortController();let disposed=false,busy=false,sequence=0,items=[],nextCursor=null,settings=null,settingsRevision=0,dirty=false;
 root.innerHTML=`<div class="tester-program-intro"><h2>Tester applications</h2><p><a href="./testers.html" target="_blank" rel="noopener">Open the public application page to share</a></p><p>People confirm their email, then appear here for your review. Approve anyone you want to include; send an invitation when a test build is ready.</p></div>
 <div class="tester-program-grid"><section class="card"><h3>Test build & instructions</h3><p>Approval is available now. Invitations stay disabled until you save a working access link and getting-started instructions.</p><form data-tester-settings><label>Download or access link<input name="buildUrl" type="url" maxlength="2000" placeholder="https://…"></label><label>Getting-started instructions<textarea name="instructions" rows="5" maxlength="4000" placeholder="How to install or open the app, what to try, and how to share feedback."></textarea></label><div class="action-row"><button type="submit">Save details</button><button type="button" class="secondary-btn" data-tester-reload>Reload saved details</button></div></form><p data-tester-email-setup></p><p><a href="https://resend.com/emails" target="_blank" rel="noopener">Open email delivery & replies in Resend</a></p></section>
 <section class="card"><h3>How this works</h3><ol><li>Someone submits and confirms their email.</li><li>You receive an application notification.</li><li>Choose <strong>Approve</strong>. This sends no invitation yet.</li><li>Preview the email, then choose <strong>Send invitation</strong>.</li><li>The tester accepts the secure link and sees your access details.</li></ol><p>Replies go to your existing notification mailbox. People can stop invitations using the link in their emails. These applications are separate from newsletters.</p></section></div>
 <p data-tester-status role="status" aria-live="polite"></p><div class="action-row"><label>Applications <select data-tester-filter>${Object.entries(labels).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}<option value="all">All</option></select></label><button type="button" class="secondary-btn" data-tester-refresh>Refresh list</button></div><div data-tester-list></div><button type="button" class="secondary-btn" data-tester-next hidden>Next page</button>
 <dialog data-tester-preview class="tester-email-dialog"><h2>Review invitation</h2><p data-preview-to></p><p data-preview-subject></p><details><summary>What they’ll see after accepting</summary><p data-preview-url></p><pre data-preview-instructions></pre></details><iframe title="Invitation email preview" sandbox=""></iframe><p data-preview-status role="status"></p><div class="action-row"><button type="button" class="secondary-btn" data-preview-cancel>Cancel</button><button type="button" data-preview-send>Send invitation</button></div></dialog>`;
 const $=selector=>root.querySelector(selector),status=$('[data-tester-status]'),form=$('[data-tester-settings]'),filter=$('[data-tester-filter]'),dialog=$('[data-tester-preview]');
 let preview=null;
 const message=text=>{if(!disposed)status.textContent=text;};
 const request=body=>call(body,{expectedUserId:userId,signal:lifetime.signal,timeoutMs:30000});
 const syncBusy=()=>{for(const button of root.querySelectorAll('button'))button.disabled=busy;};
 const on=(element,type,handler)=>element.addEventListener(type,handler,{signal:lifetime.signal});
 function populateSettings(value){settings=value;if(!dirty){form.elements.buildUrl.value=value.buildUrl;form.elements.instructions.value=value.instructions;settingsRevision=value.revision;}
  $('[data-tester-email-setup]').textContent=`Replies: ${value.replyAddress}. ${value.emailConfigured&&value.ownerNotificationConfigured?'Sender and owner notification address are configured.':'Email setup needs attention before launch.'} ${value.webhookConfigured?'Reply forwarding and delivery reporting are enabled.':'Reply forwarding and delivery reporting need activation.'}`;
 }
 function render(){
  $('[data-tester-list]').innerHTML=items.length?items.map(app=>`<article class="card tester-application"><h3>${escape(app.email)}</h3><p><strong>${escape(labels[app.status]||app.status)}</strong> · Email confirmed ${escape(date(app.confirmedAtMs))}</p><div class="action-row">${app.status==='pending'?`<button data-tester-action="approve" data-id="${app.id}">Approve</button>`:''}${['approved','invited'].includes(app.status)?`<button data-tester-action="preview" data-id="${app.id}" ${settings?.buildUrl&&!dirty?'':'disabled'}>${app.status==='invited'?'Preview replacement invitation':'Preview & send invitation'}</button>`:''}${['invited','accepted'].includes(app.status)?`<button class="secondary-btn" data-tester-action="revoke" data-id="${app.id}">Revoke invitation link</button>`:''}${['pending','approved'].includes(app.status)?`<button class="secondary-btn" data-tester-action="decline" data-id="${app.id}">Close application · no email</button>`:''}</div>${['approved','invited'].includes(app.status)&&(!settings?.buildUrl||dirty)?'<p>Save the test build details above before sending invitations.</p>':''}${app.invitationExpiresAtMs?`<p>Invitation expires ${escape(date(app.invitationExpiresAtMs))}</p>`:''}<ul>${app.mail.map(mail=>`<li>${escape({owner:'Your application alert',receipt:'Application receipt',invitation:'Tester invitation',accepted:'Your acceptance alert'}[mail.kind]||mail.kind)}: ${escape(mailLabels[mail.status]||mail.status)} ${mail.retryAllowed?`<button class="secondary-btn" data-tester-action="retry" data-id="${app.id}" data-job="${mail.id}">Retry this email</button>`:''}</li>`).join('')}</ul></article>`).join(''):'<div class="card"><p>No applications in this view. New people appear after they confirm their email.</p></div>';
  $('[data-tester-next]').hidden=!nextCursor;
  if(busy)syncBusy();
 }
 async function refresh(cursor=null){
  const own=++sequence;message('Loading tester applications…');
  try{const payload=await request({action:'list',status:filter.value,...(cursor?{cursor}:{})});if(disposed||own!==sequence)return;
   items=payload.items||[];nextCursor=payload.nextCursor;populateSettings(payload.settings);render();message('Applications updated. Provider acceptance is shown separately from confirmed delivery.');
  }catch(_){if(!disposed&&own===sequence)message('Could not load tester applications. Check your admin sign-in, then refresh.');}
 }
 async function act(action,id,jobId){
  if(busy)return;const app=items.find(item=>item.id===id);if(!app)return;
  busy=true;syncBusy();message('Working…');
  try{
   const result=await request({action,id,expectedRevision:app.revision,...(jobId?{jobId}:{})});if(disposed)return;
   if(action==='preview'){
    preview={...result,id,expectedRevision:app.revision};$('[data-preview-to]').textContent=`To: ${result.recipient}`;$('[data-preview-subject]').textContent=`Subject: ${result.subject}`;$('[data-preview-url]').textContent=result.buildUrl;$('[data-preview-instructions]').textContent=result.instructions;
    dialog.querySelector('iframe').srcdoc=result.html;$('[data-preview-status]').textContent='The secure invitation link will be created when you send. Replacing an invitation revokes its earlier link.';dialog.showModal();message('Review the recipient, email and access details before sending.');
   }else{await refresh();message(action==='approve'?'Approved. No invitation has been sent.':action==='retry'?'Email retry queued. Refresh to check its delivery status.':action==='revoke'?'Invitation revoked. A replacement can be sent after review.':'Application closed. No email was sent.');}
  }catch(_){if(!disposed)message('The action could not be confirmed. Refresh the list to check its status before trying again.');}
  finally{busy=false;if(!disposed){syncBusy();render();}}
 }
 on(root,'click',event=>{const button=event.target.closest('[data-tester-action]');if(button)void act(button.dataset.testerAction,button.dataset.id,button.dataset.job);});
 on(form,'input',()=>{dirty=true;render();});
 on(form,'submit',async event=>{event.preventDefault();if(busy)return;busy=true;syncBusy();message('Saving test build details…');try{const result=await request({action:'settings',buildUrl:form.elements.buildUrl.value.trim(),instructions:form.elements.instructions.value.trim(),expectedRevision:settingsRevision});if(disposed)return;dirty=false;populateSettings(result.settings);render();message(result.settings.buildUrl?'Access details saved. You can now preview invitations.':'Saved without a build link. You can approve testers and invite them later.');}catch(_){if(!disposed)message('Could not save these details. Use a valid HTTPS link and instructions. If settings changed elsewhere, reload saved details before editing.');}finally{busy=false;if(!disposed){syncBusy();render();}}});
 on($('[data-tester-reload]'),'click',()=>{dirty=false;void refresh();});
 on(filter,'change',()=>void refresh());on($('[data-tester-refresh]'),'click',()=>void refresh());on($('[data-tester-next]'),'click',()=>void refresh(nextCursor));
 on($('[data-preview-cancel]'),'click',()=>dialog.close());
 on($('[data-preview-send]'),'click',async()=>{
  if(busy||!preview)return;busy=true;syncBusy();$('[data-preview-status]').textContent='Queueing the invitation…';
  try{const result=await request({action:'invite',id:preview.id,expectedRevision:preview.expectedRevision,settingsRevision:preview.settingsRevision});if(disposed)return;if(!result.queued)throw Error('Not queued');dialog.close();await refresh();message('Invitation queued. The delivery status below will show whether it reaches the tester.');}
  catch(_){if(!disposed)$('[data-preview-status]').textContent='Could not confirm sending. Close this preview and refresh the application before trying again.';}
  finally{busy=false;if(!disposed){syncBusy();render();}}
 });
 return {refresh,dispose(){disposed=true;sequence++;lifetime.abort();if(dialog.open)dialog.close();root.replaceChildren();}};
}
