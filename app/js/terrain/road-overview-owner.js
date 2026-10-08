// One road-colour shader authority per Earth context. A complete regional
// source overview takes precedence over the temporary selected-road overview.
// Late arrivals and disposal hand off the existing uniforms; two layers with
// the same shader names can never be installed at the same time.
const owners=new WeakMap();
export function leaseRoadOverview(appCtx,mask,priority) {
  let owner=owners.get(appCtx);
  if(!owner){owner={leases:new Set(),active:null};owners.set(appCtx,owner);}
  const lease={mask,priority};owner.leases.add(lease);let disposed=false;
  function reconcile(){
    let next=null;for(const candidate of owner.leases)if(!next||candidate.priority>next.priority)next=candidate;
    if(next===owner.active)return;
    owner.active?.mask.detachMaterials();owner.active=next;next?.mask.syncMaterials();
  }
  reconcile();
  return {
    publish:(...args)=>mask.publish(...args),retire:(...args)=>mask.retire(...args),
    finishBulkUpload:()=>mask.finishBulkUpload(),setEnabled:enabled=>mask.setEnabled(enabled),
    syncMaterials:()=>!disposed&&owner.active===lease?mask.syncMaterials():0,
    dispose(){if(disposed)return;disposed=true;owner.leases.delete(lease);reconcile();mask.dispose();if(!owner.leases.size)owners.delete(appCtx);}
  };
}
