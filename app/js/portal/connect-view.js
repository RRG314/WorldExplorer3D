import {createPortalConnectController} from './connect-controller.js';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

export function mountPortalConnection({parentScope,projectId,request,onSignIn,search=location.search,navigate}){
  const params=new URLSearchParams(search);if(!params.has('connect'))return null;
  const scope=createLifecycleScope('portal-device-approval');parentScope.defer(()=>scope.dispose('Portal closed'));
  const byId=id=>document.getElementById(id),panel=byId('nativeConnection');panel.hidden=false;
  let state,ownerUid=null,user=null;
  const messages={signin:'Sign in to connect this app to your existing Explorer account.',loading:'Checking the app’s connection request…',
    review:'Compare this code with the one shown in your World Explorer app. Approve only if they match and you started this connection.',
    approved:'Device approved. Return to your app to finish connecting.',returned:'Opening World Explorer 3D…',
    restart:'This connection was already approved. Return to the app, or start a new connection there if it did not finish.',
    'signin-again':'Sign in again to confirm this device. Your saved choices stay available.',
    invalid:'This connection link is invalid. Start a new connection from the app.',cancelling:'Cancelling this device connection…',cancelled:'Connection cancelled. Return to your app when you are ready.',error:'This device connection could not open.'};
  function render(next){
    state=next;if(ownerUid!==state.ownerUid){byId('nativeConfirmCode').checked=false;ownerUid=state.ownerUid;}
    byId('nativeConnectionStatus').textContent=state.error||messages[state.phase]||'';
    byId('nativeDeviceLabel').textContent=state.label||'Connect your World Explorer app';
    byId('nativeConnectionAccount').textContent=user?`Explorer account: ${user.email||user.displayName||'signed in'}`:'';
    byId('nativeConnectionCode').textContent=state.verificationCode?`${state.verificationCode.slice(0,4)} ${state.verificationCode.slice(4)}`:'';
    byId('nativeConnectionCode').hidden=!state.verificationCode;
    byId('nativeConfirmLabel').hidden=state.phase!=='review';byId('nativeConfirmCode').disabled=state.busy;
    byId('nativeApprove').hidden=state.phase!=='review';byId('nativeApprove').disabled=!state.canApprove||!byId('nativeConfirmCode').checked;
    byId('nativeSignIn').hidden=!['signin','signin-again'].includes(state.phase);
    byId('nativeSignIn').textContent=state.phase==='signin-again'?'Sign in again':'Sign in to connect';
    byId('nativeReturn').hidden=!state.canReturn;byId('nativeRetry').hidden=state.phase!=='error';byId('nativeRetry').disabled=state.busy;
    byId('nativeRetry').textContent=state.cancelRequested?'Try cancellation again':'Try again';
    byId('nativeCancel').hidden=['returned','cancelled'].includes(state.phase);byId('nativeCancel').disabled=state.phase==='cancelling';
  }
  const controller=createPortalConnectController({requestId:params.getAll('connect').length===1?params.get('connect'):'',projectId,request,navigate,onChange:render});
  scope.defer(()=>controller.dispose());
  scope.listen(byId('nativeConfirmCode'),'change',()=>render(state));
  scope.listen(byId('nativeApprove'),'click',()=>void controller.approve(byId('nativeConfirmCode').checked));
  scope.listen(byId('nativeSignIn'),'click',()=>onSignIn({recent:state.phase==='signin-again'}));
  scope.listen(byId('nativeReturn'),'click',()=>controller.returnToApp());
  scope.listen(byId('nativeCancel'),'click',()=>controller.cancel());
  scope.listen(byId('nativeRetry'),'click',()=>void controller.retry());
  return Object.freeze({async changeUser(value){user=value&&!value.isAnonymous?value:null;if((user?.uid||null)===state.ownerUid&&state.phase!=='signin-again'){render(state);return;}await controller.changeOwner(user?.uid||null);},dispose:()=>scope.dispose('connection closed')});
}
