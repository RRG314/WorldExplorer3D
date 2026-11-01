import {portalPairingId,portalCallbackAllowed} from './native-contract.js';
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const randomCode=()=>encode(crypto.getRandomValues(new Uint8Array(32)));
const sha256=async value=>encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));

// Browser approval owns its pending request/account generation. It never creates
// a Firebase user or adopts a native identity; native SDKs consume the PKCE grant.
export function createPortalConnectController({requestId,projectId,request,onChange=()=>{},navigate=url=>globalThis.location.assign(url),now=Date.now,
  codeFactory=randomCode,hash=sha256}){
  let uid=null,generation=0,abort=new AbortController(),disposed=false,closed=false,busy=false,metadata=null,approval=null,callback=null;
  let phase=portalPairingId(requestId)?'signin':'invalid',error='';
  const current=(version,owner)=>!disposed&&generation===version&&uid===owner;
  function publish(){onChange({phase,error,busy,cancelRequested:closed,ownerUid:uid,label:metadata?.label||'',verificationCode:metadata?.verificationCode||'',expiresAt:metadata?.expiresAt||0,
    canApprove:!busy&&!!uid&&phase==='review'&&metadata.expiresAt>now(),canReturn:!busy&&phase==='approved'&&!!callback});}
  function interrupt(){abort.abort();abort=new AbortController();generation++;busy=false;}
  async function inspect(){
    if(disposed||closed||!uid||busy||phase==='invalid')return;const version=generation,owner=uid;busy=true;phase='loading';error='';publish();
    try{
      const value=await request('inspectPortalPairing',{requestId,expectedOwnerUid:owner},{expectedUserId:owner,signal:abort.signal});
      if(!current(version,owner))return;
      if(value.requestId!==requestId||!['android','ios'].includes(value.platform)||typeof value.label!=='string'||value.label.length>160||
        !/^\d{8}$/.test(value.verificationCode)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=now()||!['pending','approved'].includes(value.status))throw new Error('This device connection is unavailable. Start again from your app.');
      metadata=value;phase=value.status==='approved'&&!approval?'restart':'review';
    }catch(cause){if(current(version,owner)){phase='error';error=cause.message||'This device connection could not open. Try again.';}}
    finally{if(current(version,owner)){busy=false;publish();}}
  }
  async function approve(confirmed){
    if(disposed||closed||busy||phase!=='review'||!uid||!metadata||confirmed!==true)return false;
    if(metadata.expiresAt<=now()){phase='error';error='This connection expired. Start again from the app.';publish();return false;}
    const version=generation,owner=uid;busy=true;error='';publish();
    try{
      if(!approval){const code=codeFactory(),approvalId=codeFactory(),codeHash=await hash(code);if(!current(version,owner))return false;approval={code,approvalId,codeHash};}
      if(!current(version,owner))return false;
      const value=await request('approvePortalPairing',{requestId,expectedOwnerUid:owner,approvalId:approval.approvalId,codeHash:approval.codeHash},{expectedUserId:owner,signal:abort.signal});
      if(!current(version,owner))return false;
      if(value.requestId!==requestId||!portalCallbackAllowed(value.callback,projectId))throw new Error('The app return address was not recognized. Start again from your app.');
      const url=new URL(value.callback);url.searchParams.set('requestId',requestId);url.searchParams.set('code',approval.code);callback=url.href;
      phase='approved';return true;
    }catch(cause){if(current(version,owner)){phase=cause.status===401?'signin-again':'review';error=cause.message||'Approval could not finish. Try again.';}return false;}
    finally{if(current(version,owner)){busy=false;publish();}}
  }
  publish();
  const api=Object.freeze({
    async changeOwner(ownerUid){
      if(disposed||closed)return;
      const next=ownerUid||null,same=next===uid;interrupt();uid=next;metadata=null;callback=null;if(!same)approval=null;
      if(!portalPairingId(requestId)){phase='invalid';publish();return;}
      if(!uid){phase='signin';error='';publish();return;}await inspect();
    },
    approve,
    retry:()=>closed?api.cancel():inspect(),
    returnToApp(){if(disposed||closed||phase!=='approved'||!callback)return false;if(metadata.expiresAt<=now()){callback=null;approval=null;phase='error';error='This connection expired. Start again from the app.';publish();return false;}const target=callback;callback=null;approval=null;phase='returned';publish();navigate(target);return true;},
    async cancel(){
      if(disposed||phase==='returned'||phase==='cancelled')return;const owner=uid,remote=!!owner&&!!metadata;
      closed=true;
      interrupt();const version=generation;approval=null;callback=null;error='';
      if(!remote){metadata=null;phase='cancelled';publish();return;}
      busy=true;phase='cancelling';publish();
      try{
        const value=await request('cancelPortalApproval',{requestId,expectedOwnerUid:owner},{expectedUserId:owner,signal:abort.signal});
        if(!current(version,owner))return;
        if(value.cancelled!==true){phase='error';error='This connection already completed. Disconnect it in the app if needed.';}
        else{metadata=null;phase='cancelled';}
      }catch(cause){if(current(version,owner)){phase='error';error=cause.message||'Cancellation could not be confirmed. Return to the app and cancel there.';}}
      finally{if(current(version,owner)){busy=false;publish();}}
    },
    dispose(){if(disposed)return;disposed=true;interrupt();metadata=null;approval=null;callback=null;}
  });
  return api;
}
