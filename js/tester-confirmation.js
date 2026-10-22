const button=document.getElementById('confirmTester'),status=document.getElementById('testerStatus');
const heading=document.querySelector('h1'),description=heading.nextElementSibling;
const access=document.getElementById('testerAccessLink'),instructions=document.getElementById('testerInstructions');
let kind,token,epoch=0,pending;
function readLink(){
 pending?.abort();pending=null;epoch++;
 const fragment=location.hash.slice(1),parts=fragment.split('.');
 kind=parts.length===1?'verify':parts[0];token=parts.length===1?parts[0]:parts[1];
 history.replaceState(null,'',location.pathname);
 access.hidden=true;access.removeAttribute('href');instructions.hidden=true;instructions.textContent='';status.textContent='';button.disabled=false;button.hidden=false;
 const copy={
  verify:['Confirm your tester interest','Confirm that you’d like emails about testing the new World Explorer app. Invitations depend on availability.','Confirm interest'],
  invite:['You’re invited to test World Explorer','Accept this invitation to see the test build and getting-started instructions.','Accept invitation'],
  manage:['Manage testing invitations','Stop future World Explorer testing invitations for this email address. You can apply again later if you change your mind.','Stop testing invitations']
 }[kind];
 if(!copy||parts.length>2||!/^[a-f0-9]{64}$/.test(token||'')){button.hidden=true;status.textContent='This link is invalid. Use the application page below to request a new confirmation email.';return;}
 [heading.textContent,description.textContent,button.textContent]=copy;
}
readLink();window.addEventListener('hashchange',readLink);
button.addEventListener('click',async()=>{
 const own=epoch,action={verify:'confirm',invite:'invitation',manage:'withdraw'}[kind];
 if(!action||button.disabled)return;
 pending=new AbortController();const controller=pending,deadline=setTimeout(()=>controller.abort(),20000);
 button.disabled=true;status.textContent=kind==='manage'?'Stopping invitations…':'Confirming…';
 try{
  const response=await fetch('/registerAppTester',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,token}),signal:controller.signal});
  const result=response.ok?await response.json():null;if(own!==epoch)return;
  if(!result||(!result.confirmed&&!result.accepted&&!result.withdrawn))throw Error('Not confirmed');
  try{localStorage.setItem('we3d.tester-invitation.v1',result.withdrawn?'dismissed':'interested');}catch{/* Optional device preference. */}
  button.hidden=true;
  if(kind==='verify'){
   heading.textContent='Email confirmed';
   const copy={
    pending:['Your application is ready for review.','We’ll email you separately if you’re selected. Your application receipt includes a link to stop invitations.'],
    approved:['Your application is approved.','We’ll email you an invitation when a suitable test is available.'],
    invited:['Your invitation is ready.','Use your latest invitation email to see the test build and instructions. Reply to that email if you need a replacement link.'],
    accepted:['You’ve already accepted your invitation.','Use your latest invitation email to open the test build and instructions.'],
    withdrawn:['Your testing invitations are still stopped.','This previously used confirmation link does not sign you up again. Apply again below if you change your mind.'],
    declined:['Your application is closed.','Reply to your application receipt if you have questions.']
   }[result.status||'pending']||['We already have your application.','Reply to your application receipt if you have questions.'];
   [description.textContent,status.textContent]=copy;
  }
  if(kind==='manage'){heading.textContent='Invitations stopped';description.textContent='You won’t receive further testing invitations for this email address.';status.textContent='Testing invitations have been stopped. You can apply again using the link below.';}
  if(kind==='invite'){
   const url=new URL(result.buildUrl);if(url.protocol!=='https:')throw Error('Invalid access link');
   heading.textContent='Invitation accepted';description.textContent='Your test build and getting-started instructions are below.';access.href=url.href;access.hidden=false;instructions.textContent=result.instructions;instructions.hidden=false;
   status.textContent='Invitation accepted. Use the link and instructions below to get started. Reply to your invitation email whenever you have questions or feedback.';
  }
 }catch(_){if(own!==epoch)return;status.textContent=kind==='invite'?'We couldn’t open this invitation. It may have expired or been replaced. Try again, or reply to your invitation email to ask for a replacement link.':kind==='manage'?'We couldn’t stop invitations just now. Try again, or reply to your email and ask us to stop invitations.':'We couldn’t confirm this link. It may have expired or been replaced. Try again, or use the application page below to request a new email.';button.disabled=false;button.hidden=false;}
 finally{clearTimeout(deadline);if(pending===controller)pending=null;}
});
