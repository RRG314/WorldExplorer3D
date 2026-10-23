import {drainCooperatively} from './cooperative-scheduling.js?v=1';
import { streetScaleForWorld } from './compiler/street-frontage-policy.js';
import {isPavementFootway,isPavementCrossing} from './compiler/pavement-footway-policy.js';
// The worker consumes street evidence, not provider provenance or the full
// transport classification. Keep unknown nonempty tags for forward compatibility;
// blank/null tags have identical value semantics in the street predicates.
function streetTags(tags){
  if(!tags)return tags;
  return Object.fromEntries(Object.entries(tags).filter(([key,value])=>!key.startsWith('_')&&value!==''&&value!=null));
}
function groundSemantics(value){
  return value==null?value:{terrainMode:value.terrainMode,gradeSeparated:value.gradeSeparated,rampCandidate:value.rampCandidate};
}
function streetCrossSection(value){
  return value==null?value:{widthMeters:value.widthMeters,lanes:value.lanes,placement:value.placement};
}
// A compact source snapshot. Rendering objects, textures and caches never cross
// the worker boundary. The overview retains the complete loaded source domain.
function* streetSourceInputSteps(appCtx, select) {
  const roads=[],buildings=[],landuses=[],linearFeatures=[];
  for(const [auditIndex,road] of (appCtx.roads||[]).entries()){
    yield;
    if(select(road))roads.push({
      auditIndex,metersPerWorldUnit:road.metersPerWorldUnit,surfaceBias:road.surfaceBias,pts:road.pts,width:road.width,type:road.type,tags:streetTags(road.tags),isStructureConnector:road.isStructureConnector,resolvedCrossSection:road.resolvedCrossSection,
      structureSemantics:groundSemantics(road.structureSemantics),transportRecord:{sourceTags:streetTags(road.transportRecord?.sourceTags),crossSection:streetCrossSection(road.transportRecord?.crossSection)}
    });
  }
  for(const [items,target,buildingsOnly] of [[appCtx.buildings,buildings,true],[appCtx.landuses,landuses,false]]){
    for(const item of items||[]){
      yield;
      if((!buildingsOnly||!item.allowsPassageBelow)&&select(item))target.push({pts:item.surfaceFootprint||item.pts||item.footprint,holes:item.holes,holeRings:item.holeRings,type:item.type,tags:streetTags(item.tags),presentationOwner:item.presentationOwner});
    }
  }
  for(const f of appCtx.linearFeatures||[]){
    yield;
    if(select(f)&&(isPavementFootway(f)||isPavementCrossing(f)))linearFeatures.push({kind:f.kind,subtype:f.subtype,width:f.width,pts:f.pts,sourceTags:streetTags(f.sourceTags||f.transportRecord?.sourceTags||f.tags),crossingNodes:f.crossingNodes,structureSemantics:groundSemantics(f.structureSemantics)});
  }
  return {roads,buildings,landuses,linearFeatures,metersPerWorldUnit:streetScaleForWorld(appCtx)};
}
export function streetSourceInput(appCtx, select=()=>true) {
  const steps=streetSourceInputSteps(appCtx,select);
  for(;;){const result=steps.next();if(result.done)return result.value;}
}
export function streetSourceInputCooperatively(appCtx,select=()=>true,schedule={}){
  return drainCooperatively(streetSourceInputSteps(appCtx,select),schedule);
}

// postMessage clones on the sending thread. Bound each message as well as the
// source scan so a whole city's polygons cannot monopolize a movement frame.
export async function sendStreetSourceInChunks(input,request,{current=()=>true,yieldWork,chunkSize=256}={}){
  if(!Number.isInteger(chunkSize)||chunkSize<1||chunkSize>512)throw new RangeError('Street source chunk size must be 1–512');
  if(!current())throw new Error('Street source superseded');
  await request({type:'source-begin',metersPerWorldUnit:input.metersPerWorldUnit});
  for(const field of ['roads','buildings','landuses','linearFeatures']){
    for(let offset=0;offset<input[field].length;offset+=chunkSize){
      if(!current())throw new Error('Street source superseded');
      await request({type:'source-chunk',field,items:input[field].slice(offset,offset+chunkSize)});
      await yieldWork?.();
    }
  }
}
