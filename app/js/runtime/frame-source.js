import {createLifecycleScope} from './lifecycle-scope.js?v=2';

// A lease for supplying timestamps to the existing kernel. This never owns a
// second simulation or schedules frames; the renderer/runtime supplies them.
export function createRuntimeFrameSource(kernel,{onError=()=>{}}={}){
  let active=null,sequence=0,disposed=false;
  function release(record,reason='released',resume=true){
    if(active!==record)return false;
    active=null;record.reason=reason;record.scope.dispose(reason);
    // Reset timing even though the flat scheduler is already stopped.
    kernel.stop(`external-frame:${reason}`);
    if(resume&&record.resumeFlat&&!disposed)kernel.start();
    try{record.onExit?.(reason);}catch(error){onError({owner:record.owner,error});}return true;
  }
  return Object.freeze({
    start(){return !disposed&&!active?kernel.start():false;},
    stop(reason='stopped'){const released=active?release(active,reason,false):false;return kernel.stop(reason)||released;},
    acquire({owner,start,stop,isCurrent=()=>true,onExit,resumeOnRelease=true}={}){
      if(disposed)throw new Error('The runtime frame source is disposed.');
      if(active)throw new Error(`Runtime frames already belong to ${active.owner}.`);
      if(typeof owner!=='string'||!owner||typeof start!=='function'||typeof stop!=='function'||typeof isCurrent!=='function'||onExit!==undefined&&typeof onExit!=='function'||typeof resumeOnRelease!=='boolean')throw new TypeError('An external frame source requires an owner, start and stop.');
      if(!isCurrent())throw new Error('The external frame source is already obsolete.');
      // XR may still own the framebuffer after its callback is revoked. That
      // adapter resumes flat frames only after the actual session end event.
      const record={owner,id:++sequence,scope:createLifecycleScope(`runtime-frame:${owner}`),resumeFlat:resumeOnRelease&&kernel.snapshot().running,onExit,reason:null,frames:0};
      kernel.stop(`external-frame:${owner}`);active=record;
      record.scope.defer(stop,'frame-source');
      const frame=(timestamp,frameContext={})=>{
        if(active!==record)return false;
        try{
          if(!isCurrent()){release(record,'obsolete');return false;}
          kernel.runFrame(timestamp,{...frameContext,source:owner});record.frames++;return true;
        }catch(error){release(record,'failed',false);onError({owner,error});return false;}
      };
      try{start(frame);}
      catch(error){release(record,'start-failed');throw error;}
      if(active!==record)throw new Error('The external frame source ended during startup.');
      return Object.freeze({owner,id:record.id,isCurrent:()=>active===record,release:(reason)=>release(record,reason)});
    },
    snapshot:()=>active?{owner:active.owner,id:active.id,frames:active.frames,active:true}:{owner:'window',active:false},
    dispose(){if(disposed)return;disposed=true;if(active)release(active,'disposed',false);kernel.stop('frame-source-disposed');}
  });
}
