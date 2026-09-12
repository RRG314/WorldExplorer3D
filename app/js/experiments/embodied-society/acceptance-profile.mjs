// Declared initial conditions, not an action policy. No starter inventory or kits.
export const ACCEPTANCE_PROFILE=Object.freeze({id:'resource-use-v1',water:.45,food:.55,rest:.9,minimumSupplyDistanceMeters:5});
export function applyAcceptanceNeeds(state){
 const copy=structuredClone(state);
 for(const actor of Object.values(copy.actors))actor.needs={...actor.needs,water:ACCEPTANCE_PROFILE.water,food:ACCEPTANCE_PROFILE.food,rest:ACCEPTANCE_PROFILE.rest};
 return copy;
}
export function evidenceSnapshot(body,workshop,actorId){
 const state=workshop.snapshot(),actor=state.actors[actorId];
 return structuredClone({tick:state.tick,position:body.observation().position,needs:actor.needs,condition:actor.condition,
  inventory:workshop.inspectInventory(actorId).items,job:actor.job,
  resources:Object.fromEntries(Object.values(state.nodes).map(n=>[n.id,n.remaining])),
  structures:Object.values(state.structures).map(s=>({id:s.id,kind:s.kind,block:s.block}))});
}
