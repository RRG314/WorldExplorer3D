import {postProtectedFunction} from './function-api.js?v=3';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={pending:'Awaiting review',approved:'Approved · not invited',invited:'Invitation queued or sent',accepted:'Invitation accepted',declined:'Closed',withdrawn:'Contact stopped',suppressed:'Email blocked or bounced'};
const mailLabels={queued:'Queued',sending:'Sending',accepted:'Sent · waiting for delivery confirmation',delivered:'Delivered',retry_pending:'Delivery delayed · retry pending',not_configured:'Sender configuration needed',needs_attention:'Needs attention',failed:'Delivery failed',bounced:'Bounced',complained:'Recipient marked as spam',cancelled:'Cancelled'};
const date=value=>value?new Date(value).toLocaleString():'—';
export function mountAdminTesters(root,{userId,call=(body,options)=>postProtectedFunction('/manageAppTesters',body,{...options,label:'Tester program'})}={}){
 const lifetime=new AbortController();let disposed=false,busy=false,sequence=0,items=[],nextCursor=null,settings=null,settingsRevision=0,dirty=false;
 root.classList.add('tester-program');
 root.innerHTML=`<div class="tester-program-intro"><p>Review confirmed applications, approve testers, then invite them when your app is ready.</p><a class="secondary-btn" href="./testers.html" target="_blank" rel="noopener">Open the application page to share</a></div>
 <details class="detail-card tester-program-settings" data-tester-setup><summary><strong>Test build & email settings</strong><span>Approval sends no invitation. Add access details when you’re ready to invite people.</span></summary><div class="tester-program-grid"><section><h3>Access details</h3><form data-tester-settings><label>Download or access link<input name="buildUrl" type="url" maxlength="2000" placeholder="https://…"></label><label>Getting-started instructions<textarea name="instructions" rows="4" maxlength="4000" placeholder="How to open the app, what to try, and how to send feedback."></textarea></label><div class="action-row"><button class="primary-btn" type="submit">Save details</button><button type="button" class="secondary-btn" data-tester-reload>Reload saved details</button></div></form><p class="muted-inline" data-tester-email-setup></p><p><a href="https://resend.com/emails" target="_blank" rel="noopener">View email delivery & replies in Resend</a></p></section>
 <section><h3>What happens next</h3><ol><li>The person confirms their email.</li><li>You receive an application alert.</li><li>Choose <strong>Approve</strong> to save your decision.</li><li>Preview and send an invitation when the app is ready.</li><li>The tester accepts and sees your access details.</li></ol><p class="muted-inline">People can reply to their emails or stop invitations at any time. This does not subscribe them to a newsletter.</p></section></div></details>
 <p class="status-line" data-tester-status role="status" aria-live="polite"></p><div class="action-row tester-program-filter"><label>Applications <select data-tester-filter>${Object.entries(labels).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}<option value="all">All</option></select></label><button type="button" class="secondary-btn" data-tester-refresh>Refresh list</button></div><div data-tester-list></div><button type="button" class="secondary-btn" data-tester-next hidden>Next page</button>
 <dialog data-tester-preview class="tester-email-dialog"><h2>Review invitation</h2><p data-preview-to></p><p data-preview-subject></p><details><summary>Access details after accepting</summary><p data-preview-url></p><pre data-preview-instructions></pre></details><iframe title="Invitation email preview" sandbox=""></iframe><p data-preview-status role="status"></p><div class="action-row"><button type="button" class="secondary-btn" data-preview-cancel>Cancel</button><button class="primary-btn" type="button" data-preview-send>Send invitation</button></div></dialog>`;
 const $=selector=>root.querySelector(selector),status=$('[data-tester-status]'),form=$('[data-tester-settings]'),filter=$('[data-tester-filter]'),dialog=$('[data-tester-preview]');
 let preview=null;
 const message=text=>{if(!disposed)status.textContent=text;};
 const request=body=>call(body,{expectedUserId:userId,signal:lifetime.signal,timeoutMs:30000});
 const syncBusy=()=>{for(const button of root.querySelectorAll('button'))button.disabled=busy;};
 const on=(element,type,handler)=>element.addEventListener(type,handler,{signal:lifetime.signal});
 function populateSettings(value){settings=value;if(!dirty){form.elements.buildUrl.value=value.buildUrl;form.elements.instructions.value=value.instructions;settingsRevision=value.revision;}
  $('[data-tester-email-setup]').textContent=`Application alerts: ${value.ownerNotificationAddress||'not configured'}. Replies: ${value.replyAddress}. ${value.emailConfigured&&value.ownerNotificationConfigured?'Email sending is configured.':'Email setup needs attention before launch.'} ${value.webhookConfigured?'Reply forwarding and delivery tracking are active.':'Reply forwarding and delivery tracking need activation.'}`;
 }
 function render(){
  $('[data-tester-list]').innerHTML=items.length?items.map(app=>`<article class="list-card tester-application"><h3>${escape(app.email)}</h3><p><strong>${escape(labels[app.status]||app.status)}</strong> · Email confirmed ${escape(date(app.confirmedAtMs))}</p><div class="action-row">${app.status==='pending'?`<button class="primary-btn" data-tester-action="approve" data-id="${app.id}">Approve</button>`:''}${['approved','invited'].includes(app.status)?`<button class="primary-btn" data-tester-action="preview" data-id="${app.id}" ${settings?.buildUrl&&!dirty?'':'disabled'}>${app.status==='invited'?'Preview replacement invitation':'Preview & send invitation'}</button>`:''}${['invited','accepted'].includes(app.status)?`<button class="secondary-btn" data-tester-action="revoke" data-id="${app.id}">Revoke invitation link</button>`:''}${['pending','approved'].includes(app.status)?`<button class="secondary-btn" data-tester-action="decline" data-id="${app.id}">Close application · no email</button>`:''}</div>${['approved','invited'].includes(app.status)&&(!settings?.buildUrl||dirty)?'<p class="tester-program-next">Approve now and invite later. <button type="button" class="ghost-btn" data-tester-open-settings>Add test build details</button></p>':''}${app.invitationExpiresAtMs?`<p>Invitation expires ${escape(date(app.invitationExpiresAtMs))}</p>`:''}<details class="tester-program-mail" ${app.mail.some(mail=>['retry_pending','needs_attention','not_configured','bounced','complained','failed'].includes(mail.status))?'open':''}><summary>Email activity</summary><ul>${app.mail.map(mail=>`<li>${escape({owner:'Your application alert',receipt:'Application receipt',invitation:'Tester invitation',accepted:'Your acceptance alert'}[mail.kind]||mail.kind)}: ${escape(mailLabels[mail.status]||mail.status)} ${mail.retryAllowed?`<button class="secondary-btn" data-tester-action="retry" data-id="${app.id}" data-job="${mail.id}">Retry this email</button>`:''}</li>`).join('')}</ul></details></article>`).join(''):'<div class="notice-card"><p>No applications in this view. New people appear after they confirm their email.</p></div>';
  $('[data-tester-next]').hidden=!nextCursor;
  if(busy)syncBusy();
 }
 async function refresh(cursor=null){
  const own=++sequence;message('Loading tester applications…');
  try{const payload=await request({action:'list',status:filter.value,...(cursor?{cursor}:{})});if(disposed||own!==sequence)return;
   items=payload.items||[];nextCursor=payload.nextCursor;populateSettings(payload.settings);render();message('Applications updated.');
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
   }else{if(['approve','revoke'].includes(action))filter.value='approved';await refresh();message(action==='approve'?'Approved. No invitation has been sent.':action==='retry'?'Email retry queued. Refresh to check its delivery status.':action==='revoke'?'Invitation revoked. A replacement can be sent after review.':'Application closed. No email was sent.');}
  }catch(_){if(!disposed)message('The action could not be confirmed. Refresh the list to check its status before trying again.');}
  finally{busy=false;if(!disposed){syncBusy();render();}}
 }
 on(root,'click',event=>{if(event.target.closest('[data-tester-open-settings]')){$('[data-tester-setup]').open=true;form.elements.buildUrl.focus();return;}const button=event.target.closest('[data-tester-action]');if(button)void act(button.dataset.testerAction,button.dataset.id,button.dataset.job);});
 on(form,'input',()=>{dirty=true;render();});
 on(form,'submit',async event=>{event.preventDefault();if(busy)return;busy=true;syncBusy();message('Saving test build details…');try{const result=await request({action:'settings',buildUrl:form.elements.buildUrl.value.trim(),instructions:form.elements.instructions.value.trim(),expectedRevision:settingsRevision});if(disposed)return;dirty=false;populateSettings(result.settings);render();message(result.settings.buildUrl?'Access details saved. You can now preview invitations.':'Saved without a build link. You can approve testers and invite them later.');}catch(_){if(!disposed)message('Could not save these details. Use a valid HTTPS link and instructions. If settings changed elsewhere, reload saved details before editing.');}finally{busy=false;if(!disposed){syncBusy();render();}}});
 on($('[data-tester-reload]'),'click',()=>{dirty=false;void refresh();});
 on(filter,'change',()=>void refresh());on($('[data-tester-refresh]'),'click',()=>void refresh());on($('[data-tester-next]'),'click',()=>void refresh(nextCursor));
 on($('[data-preview-cancel]'),'click',()=>dialog.close());
 on($('[data-preview-send]'),'click',async()=>{
  if(busy||!preview)return;busy=true;syncBusy();$('[data-preview-status]').textContent='Queueing the invitation…';
  try{const result=await request({action:'invite',id:preview.id,expectedRevision:preview.expectedRevision,settingsRevision:preview.settingsRevision});if(disposed)return;if(!result.queued)throw Error('Not queued');dialog.close();filter.value='invited';await refresh();message('Invitation queued. The delivery status below will show whether it reaches the tester.');}
  catch(_){if(!disposed)$('[data-preview-status]').textContent='Could not confirm sending. Close this preview and refresh the application before trying again.';}
  finally{busy=false;if(!disposed){syncBusy();render();}}
 });
 return {refresh,dispose(){disposed=true;sequence++;lifetime.abort();if(dialog.open)dialog.close();root.replaceChildren();}};
}
