import {portalOwnerScope,portalTrailView,portalTrailSummary} from './trail-model.js';

// A page/native-adapter command owner around the Journal store. No timers or
// second persistent state. Account generations revoke outstanding network work.
export function createPortalTrailController({store,request,onChange=()=>{},now=Date.now,operationId=()=>crypto.randomUUID()}){
  let generation=0,uid=null,abort=new AbortController(),disposed=false,work=null,again=false;
  let status='device',error='';
  const current=(version,owner)=>!disposed&&generation===version&&uid===owner;
  async function entries(owner){let rows=[],after=null;do{const page=await store.listPortalTrail(portalOwnerScope(owner),{after,limit:100});rows.push(...page.items);after=page.nextCursor;}while(after);return rows;}
  async function publish(version=generation,owner=uid){
    const rows=await entries(owner);if(!current(version,owner))return;
    onChange({ownerScope:portalOwnerScope(owner),status,error,summary:portalTrailSummary(rows),places:rows.map(portalTrailView)});
  }
  function sync(){
    if(disposed||!uid||!request)return Promise.resolve();
    again=true;if(work)return work;
    const version=generation,owner=uid,signal=abort.signal;
    const run=async()=>{
      try{
        do{
          again=false;if(!current(version,owner))return;status='syncing';error='';await publish(version,owner);
          for(const row of await entries(owner)){
            for(const action of Object.values(row.pending).sort((a,b)=>a.createdAt-b.createdAt||a.operationId.localeCompare(b.operationId))){
              if(!current(version,owner))return;
              const response=await request(action.kind==='visit'?'confirmPortalVisit':'mutatePortalTrail',{expectedOwnerUid:owner,action},{expectedUserId:owner,signal});
              if(!current(version,owner))return;
              await store.acceptPortalTrailSync(portalOwnerScope(owner),response);
            }
          }
          let after=null;
          do{
            if(!current(version,owner))return;
            const response=await request('listPortalTrail',{expectedOwnerUid:owner,after,limit:100},{expectedUserId:owner,signal});
            if(!current(version,owner))return;
            if(response.ownerScope!==portalOwnerScope(owner)||!Array.isArray(response.items)||response.items.length>100||
              !(response.nextCursor===null||typeof response.nextCursor==='string'&&response.nextCursor!==after))throw new Error('Invalid Trail synchronization response.');
            for(const state of response.items)await store.acceptPortalTrailSync(portalOwnerScope(owner),{ownerScope:response.ownerScope,state,operationId:null});
            after=response.nextCursor;
          }while(after);
        }while(again&&current(version,owner));
        if(current(version,owner)){status='synced';await publish(version,owner);}
      }catch(cause){if(current(version,owner)){status='pending';error=cause.status===409?cause.message:'Sync is unavailable. Your choices are saved on this device. Try again when connected.';await publish(version,owner);}}
    };
    // Set work before yielding to async callbacks; a second command joins this run.
    const active=Promise.resolve().then(run);work=active;
    const finish=()=>{if(work===active){work=null;if(again&&status==='synced'&&current(version,owner))void sync();}};
    active.then(finish,finish);return active;
  }
  return Object.freeze({
    async changeOwner(ownerUid){
      abort.abort();abort=new AbortController();generation++;uid=ownerUid||null;work=null;again=false;
      status=uid?'pending':'device';error='';const version=generation,owner=uid;
      await publish(version,owner);if(current(version,owner))await sync();
    },
    async act(destinationId,kind,contentVersion){
      if(disposed)throw new Error('The Portal is closed.');
      const version=generation,owner=uid;
      await store.recordPortalAction(portalOwnerScope(owner),{operationId:operationId(),destinationId,kind,createdAt:now(),...(kind==='investigate'?{contentVersion}:{})});
      if(current(version,owner)){await publish(version,owner);void sync();}
    },
    async copyDeviceChoices(){
      if(!uid||disposed)throw new Error('Sign in before copying device choices.');
      const version=generation,owner=uid;
      for(const entry of await entries(null)){
        if(!current(version,owner))return;
        const view=portalTrailView(entry);
        for(const kind of [...(view.saved?['save']:[]),...(view.investigatedAt?['investigate']:[])]){
          await store.recordPortalAction(portalOwnerScope(owner),{operationId:operationId(),destinationId:view.destinationId,kind,createdAt:now(),...(kind==='investigate'?{contentVersion:view.investigationVersion}:{})});
        }
      }
      if(current(version,owner)){await publish(version,owner);await sync();}
    },
    sync,
    refresh:()=>publish(),
    dispose(){if(disposed)return;disposed=true;generation++;abort.abort();}
  });
}
