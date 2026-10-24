const form=document.getElementById('testerSignup'),status=document.getElementById('testerSignupStatus'),button=form.querySelector('button');
let pending=false;
form.addEventListener('submit',async event=>{
 event.preventDefault();if(pending||!form.reportValidity())return;
 pending=true;button.disabled=true;status.textContent='Sending your confirmation email…';
 try{
  const {postAppCheckedFunction}=await import('./function-api.js?v=3');
  const result=await postAppCheckedFunction('/registerAppTester',{action:'request',email:document.getElementById('testerEmail').value.trim(),consent:document.getElementById('testerConsent').checked,consentVersion:'app-testing-v1'},{label:'Tester application',timeoutMs:20000});
  if(!result?.pending)throw Error('Not confirmed');
  form.hidden=true;status.textContent='Check your inbox. Your confirmation link is valid for 24 hours. Confirm your email to submit your application. Approval and invitations come separately.';
 }catch(_){status.textContent='We couldn’t confirm your request. If an email arrives, use its confirmation link. Otherwise wait a few minutes and try again.';}
 finally{pending=false;button.disabled=false;}
});
