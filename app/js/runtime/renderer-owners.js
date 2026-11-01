import {resolveControlState} from '../transport/control-state.js';
// An immersive session's visibility is independent of its HTML document. Only
// the currently executing, owned compositor frame may admit a hidden document.
export function presentationFrameVisible(context,frame){
  return globalThis.document?.hidden!==true||context.vrPresentation?.isFrameVisible?.(frame)===true;
}
// Presentation ownership only; does not change or dispose renderer resources.
export function activePresentationOwner(context) {
  const control=resolveControlState(context);
  if(control.frame==='space')return 'space';
  if(control.frame==='ocean')return 'ocean';
  return context.gameStarted?'main':null;
}

export function dedicatedPresentationActive(context) {
  const frame=resolveControlState(context).frame;
  return !!(context.worldLoading || context.arSessionActive ||
    frame==='space' || frame==='ocean' ||
    (frame!=='ship-interior' && context.isEnv?.(context.ENV?.SPACE_FLIGHT)));
}

export function capturePresentation(context) {
  const owner=activePresentationOwner(context),source=owner==='main'?context:owner==='space'?context.spaceFlight:context.oceanMode;
  const renderer=source?.renderer,scene=source?.scene,camera=source?.camera;
  const frameDriver=owner==='main'?null:source?.captureFrameDriver?.();
  const isCurrent=()=>activePresentationOwner(context)===owner&&source?.renderer===renderer&&source?.scene===scene&&source?.camera===camera;
  return Object.freeze({owner,renderer,scene,camera,frameDriver,
    isCurrent,restoreCamera:()=>isCurrent()?source?.restorePresentationCamera?.():false});
}

export function rendererOwnershipSnapshot(context, snapshot) {
  const owners={main:context.renderer||null,ocean:context.oceanMode?.renderer||null,space:context.spaceFlight?.renderer||null};
  const activeOwner=activePresentationOwner(context);
  const values=new Map();
  const byOwner={};
  for(const [owner,renderer] of Object.entries(owners)){
    if(renderer&&!values.has(renderer))values.set(renderer,snapshot(renderer));
    byOwner[owner]=renderer?values.get(renderer):null;
  }
  return {activeOwner,active:activeOwner?byOwner[activeOwner]:null,...byOwner};
}
