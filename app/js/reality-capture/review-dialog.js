import {mountReviewWorkspace,captureWorldUrl} from './review-workspace.js';
import {mountCaptureStep} from './workspace-navigation.js';
import {observeAuth,getCurrentUser} from '../../../js/auth-ui.js?v=55';
export async function openCaptureReview({appCtx=null,captureId=''}={}){
  const user=getCurrentUser();if(!user||user.isAnonymous)return;
  const dialog=document.createElement('dialog');dialog.className=`homeLayoutEditor${appCtx?' captureInWorld':''}`;dialog.style.cssText='width:min(1100px,96vw);max-height:94dvh;overflow:auto;padding:18px;background:#071018;color:#f4f7f9;border:1px solid #53606a';dialog.innerHTML='<header><h2>Review improvements</h2><button data-close>Back to contributions</button></header><div data-review-host></div>';document.body.append(dialog);dialog.showModal();
  appCtx?.setPauseReason?.('capture_review',true);appCtx?.clearControlInputState?.('capture-review');document.exitPointerLock?.();let closed=false,dispose=()=>{},stopAuth=()=>{};
  function close(){if(closed)return;closed=true;dispose();stopAuth();dialog.captureStepDispose?.();dialog.close();dialog.remove();appCtx?.setPauseReason?.('capture_review',false);}
  mountCaptureStep(dialog,{section:'Review improvements',requestClose:close,parentLabel:'Back to contributions'});dialog.querySelector('[data-close]').onclick=close;dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dispose=mountReviewWorkspace(dialog.querySelector('[data-review-host]'),{captureId,onOpenWorld:c=>{close();location.assign(captureWorldUrl(c.building));}});stopAuth=observeAuth(next=>{if(next?.uid!==user.uid)close();});return {close};
}
