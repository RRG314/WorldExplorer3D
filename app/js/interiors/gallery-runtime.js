import {acquireVenueLighting} from './venue-lighting.js';
import {loadModelAsset} from '../assets/model-asset-runtime.js?v=16';
import {releaseGalleryTextures} from './gallery-finishes.js';
import {isMuseumContent,exhibitJournalEventId} from './content-contract.js';
import {openGalleryPanel,closeGalleryPanel} from './gallery-ui.js';

export async function attachGallery(ctx,T,active,{load=loadModelAsset}={}){
  const content=active.definition.curatedContent;if(!isMuseumContent(content))return;
  const controller=new AbortController(),state={controller,exhibits:new Map(),saved:new Set(),journalError:false,panel:null,furnishings:[]};active.gallery=state;
  const current=()=>!controller.signal.aborted&&ctx.activeInterior===active&&active.outsideWorldSequence===ctx._worldLoadSequence;
  state.isCurrent=current;
  const lighting=acquireVenueLighting(ctx,active.group);state.releaseLighting=lighting.release;
  for(const exhibit of content.exhibits)state.exhibits.set(exhibit.id,{exhibit,status:'waiting',instance:null});
  state.loadExhibit=async id=>{
    const record=state.exhibits.get(id);if(!record||!current()||record.status==='loading'||record.status==='ready')return false;
    record.status='loading';state.refresh?.();
    try{
      const instance=await load(T,record.exhibit.assetId,{signal:controller.signal});
      if(!current()){instance.dispose();return false;}
      const placement=active.definition.exhibitPlacements.find(p=>p.id===id),root=instance.root,extent=record.exhibit.displayExtentMeters/(ctx.METERS_PER_WORLD_UNIT||1);
      root.scale.setScalar(extent);root.position.set(placement.x,record.exhibit.presentation==='artwork'?1.2:1.06,placement.z);root.rotation.y=placement.yaw;
      root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
      active.group.add(root);lighting.apply(root);record.instance=instance;record.status='ready';
      state.refresh?.();return true;
    }catch(error){if(current()){record.status='unavailable';record.error=String(error.message).slice(0,160);state.refresh?.();}return false;}
  };
  state.save=async id=>{
    const record=state.exhibits.get(id);if(!record||!current())throw Error('The gallery has closed.');
    const store=ctx.discoveryProfileStore;if(!store?.recordExplorerEvent)throw Error('Your Journal is still opening. Try again shortly.');
    const e=record.exhibit,source=content.sources.find(s=>s.id===e.sourceId);
    const result=await store.recordExplorerEvent({eventId:exhibitJournalEventId(content.id,id),eventType:'museum-exhibit',sourceSystem:'museum',sourceId:`${content.id}:${id}`,name:e.title,detail:`Gallery study · ${e.collection}. ${e.description}`.slice(0,240),regionId:content.id,regionLabel:content.title,environment:'EARTH',locationKey:ctx.LOC?.id||ctx.currentLocationKey||'',locationSnapshot:ctx.LOC,
      projections:{journal:true,profile:false,place:false,fieldGuide:false,collection:false,missionProgress:false},metadata:{contentId:content.id,contentVersion:content.version,representation:content.kind,sourceUrl:source.url,license:source.license}});
    if(current()){state.saved.add(id);state.refresh?.();}return result;
  };
  // One store authority, one bounded read. Failed reads never overwrite saves.
  state.restore=async()=>{
    try{const store=ctx.discoveryProfileStore;if(!store?.getEventsById)throw Error('Journal not ready');
      const rows=await store.getEventsById(content.exhibits.map(e=>exhibitJournalEventId(content.id,e.id)));
      if(current()){for(const row of rows||[]){const exhibit=content.exhibits.find(e=>exhibitJournalEventId(content.id,e.id)===row.eventId);if(exhibit)state.saved.add(exhibit.id);}state.journalError=false;state.refresh?.();}}
    catch{if(current()){state.journalError=true;state.refresh?.();}}
  };
  void state.restore();
  // Do not burst requests on entry. The playable shell, map and exit exist
  // before the first exhibit resolves. Reentry shares the bounded model cache.
  state.ready=(async()=>{for(const exhibit of content.exhibits){if(!current())break;await state.loadExhibit(exhibit.id);}
    for(const placement of active.group.userData.galleryFurnishings||[]){
      if(!current())break;
      try{const instance=await load(T,placement.assetId,{signal:controller.signal});if(!current()){instance.dispose();break;}
        instance.root.scale.setScalar(1/(ctx.METERS_PER_WORLD_UNIT||1));instance.root.position.set(placement.x,0,placement.z);instance.root.rotation.y=placement.yaw;active.group.add(instance.root);state.furnishings.push(instance);
        lighting.apply(instance.root);
      }catch{if(current())state.furnitureUnavailable=true;}
    }
    if(current())state.renderPreparation=ctx.prepareResidentPresentation?.(active.group)||null;
  })();
  await state.ready;
}
export function disposeGallery(ctx,active){
  releaseGalleryTextures(active?.group);
  const state=active?.gallery;if(!state)return;
  closeGalleryPanel(ctx,active);state.controller.abort();state.releaseLighting?.();
  for(const record of state.exhibits.values())record.instance?.dispose();
  for(const instance of state.furnishings)instance.dispose();
  state.furnishings.length=0;state.exhibits.clear();state.refresh=null;active.gallery=null;
}
export function handleGalleryAction(ctx,active,interaction){
  if(!['museum-map','museum-exhibit'].includes(interaction?.kind)||!active?.gallery)return false;
  return openGalleryPanel(ctx,active,interaction.exhibitId||null);
}
