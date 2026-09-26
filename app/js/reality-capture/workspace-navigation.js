// Each editor is a step in the same building workspace. Parent state stays
// mounted; only the active step is visible. Native Back uses its unsaved guard.
export function mountCaptureStep(dialog,{building,section,requestClose,parentLabel='Back'}={}) {
 const parent=[...document.querySelectorAll('dialog[open]')].filter(d=>d!==dialog&&d.dataset.captureStep&&d.style.visibility!=='hidden').at(-1);
 const focus=document.activeElement,previousVisibility=parent?.style.visibility||'';
 if(parent)parent.style.visibility='hidden';
 const token=crypto.randomUUID();dialog.dataset.captureStep=token;
 const title=document.createElement('div');title.className='captureWorkspaceContext';
 title.textContent=[building?.label||'Reality Capture',section].filter(Boolean).join(' · ');
 dialog.querySelector('header')?.append(title);
 const back=dialog.querySelector('[data-close],[data-capture-close]');
 if(back&&parent){back.textContent=parentLabel;back.setAttribute('aria-label',parentLabel);}
 let disposed=false,fromBack=false;
 const push=()=>history.pushState({...history.state,captureStep:token},'');push();
 const pop=()=>{if(disposed||history.state?.captureStep===token)return;fromBack=true;requestClose?.();if(dialog.open){fromBack=false;push();}};
 window.addEventListener('popstate',pop);
 const dispose=(options={})=>{if(disposed)return;disposed=true;window.removeEventListener('popstate',pop);title.remove();delete dialog.dataset.captureStep;if(parent?.open){parent.style.visibility=previousVisibility;focus?.isConnected&&focus.focus?.();}if(!fromBack&&history.state?.captureStep===token){if(options.skipHistory)history.replaceState({...history.state,captureStep:null},'');else history.back();}};
 dialog.captureStepDispose=dispose;dialog.addEventListener('close',()=>{if(!dialog.open)dispose();},{once:true});return dispose;
}
