import { RECIPES } from './material-rules.mjs';

const point = p => p && ['x', 'y', 'z'].every(k => Number.isFinite(p[k]));
const blockPoint = block => ({x:block.gx, y:block.gy, z:block.gz});
const denied = () => ({allowed:false});

// Host-owned adapter. World queries must read the pinned research scene, and
// execute under the host's simulation/action lock. Resident JSON never supplies
// permissions, observed position, station capabilities or shelter evidence.
export function createWorldAuthority({runId, snapshot, bodies, world, reachMeters=3, metersPerWorldUnit=1}) {
  if (!runId || typeof snapshot !== 'function' || !(bodies instanceof Map) ||
      !['permits','lineOfSight','placementAllowed','shelterAt','transferConsented'].every(k => typeof world?.[k] === 'function') ||
      !Number.isFinite(metersPerWorldUnit) || metersPerWorldUnit<=0 || !Number.isFinite(reachMeters) || reachMeters <= 0 || reachMeters > 3) {
    throw new Error('Research world authority requires explicit world queries and bounded reach.');
  }
  function inReach(actorId, position, target) {
    return point(position) && point(target) && Math.hypot(position.x-target.x,position.y-target.y,position.z-target.z)*metersPerWorldUnit<=reachMeters &&
      world.lineOfSight({actorId,from:position,to:target}) === true;
  }
  function allowedTarget(actorId, position, target, action) {
    return target && inReach(actorId,position,target.position) && world.permits({actorId,target,action}) === true;
  }
  function authorize({runId:requestedRun,actorId,command,tick}) {
    const state=snapshot(),body=bodies.get(actorId),observation=body?.observation();
    if(requestedRun!==runId || state.runId!==runId || !state.actors[actorId] || observation?.actorId!==actorId || observation.paused || !point(observation?.position))return denied();
    const position=observation.position,actor=state.actors[actorId];
    const base={allowed:true};
    if(['consume','cancel'].includes(command.kind))return base;
    if(command.kind==='gather') {
      const node=state.nodes[command.targetId];
      return allowedTarget(actorId,position,node,'gather')?{...base,targetId:node.id,inReach:true}:denied();
    }
    if(command.kind==='build') {
      const p=command.placement;
      if(!p || !Number.isInteger(p.gx) || !Number.isInteger(p.gz) || !Number.isFinite(p.gy) || !Number.isInteger(p.gy*2))return denied();
      const placement={gx:p.gx,gy:p.gy,gz:p.gz};
      const target={position:blockPoint(placement),placement};
      if(!allowedTarget(actorId,position,target,'build') || world.placementAllowed({actorId,placement,materialId:command.materialId})!==true)return denied();
      return {...base,inReach:true,placementAllowed:true,placement};
    }
    if(['store','retrieve'].includes(command.kind)) {
      const structure=state.structures[command.targetId];
      const target=structure && {...structure,position:blockPoint(structure.block)};
      return allowedTarget(actorId,position,target,command.kind)?{...base,targetId:structure.id,inReach:true,storageAccess:true}:denied();
    }
    if(command.kind==='transfer') {
      const other=bodies.get(command.recipientId)?.observation();
      if(!state.actors[command.recipientId] || other?.actorId!==command.recipientId || !allowedTarget(actorId,position,{id:command.recipientId,position:other.position},'transfer') ||
         world.transferConsented({actorId,recipientId:command.recipientId,materialId:command.materialId,quantity:command.quantity,tick})!==true)return denied();
      return {...base,inReach:true,recipientId:command.recipientId,recipientConsented:true};
    }
    if(command.kind==='rest' || (command.kind==='finish' && actor.job?.kind==='rest')) {
      const shelter=world.shelterAt({actorId,position,tick});
      if(shelter?.sheltered!==true || !allowedTarget(actorId,position,shelter,'rest'))return denied();
      return {...base,inReach:true,sheltered:true,restContinuousSince:shelter.continuousSince};
    }
    if(command.kind==='craft' || command.kind==='finish') {
      const recipe=RECIPES.find(r=>r.id===(command.kind==='craft'?command.recipeId:actor.job?.recipeId));
      if(!recipe)return denied();
      if(!recipe.station)return base;
      const stationId=command.kind==='craft'?command.targetId:actor.job?.stationId;
      const station=state.structures[stationId];
      if(!station?.capabilities.includes(recipe.station) || !allowedTarget(actorId,position,{...station,position:blockPoint(station.block)},'work'))return denied();
      return {...base,inReach:true,stationId,stationCapabilities:[...station.capabilities]};
    }
    return denied();
  }
  return Object.freeze({authorize});
}
