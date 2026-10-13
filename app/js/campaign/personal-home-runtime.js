import { harborJourneyEventIds, harborJourneyState, lunarHomecomingRecord, harborCompletionRecord } from './lunar-homecoming.js';
import {investigationId,investigationState,investigationEventIds} from './coastal-investigation.js';
import {resolveBuildingEntrySupport} from '../building-entry.js?v=9';
import {normalizeWorkspace,findWorkspacePlacement,validateWorkspacePlacement} from './personal-workspace.js';
import {createWorkspaceVisual} from '../interiors/personal-workspace-visual.js';
import {disposeCuratedHomeFurnishing} from '../interiors/curated-home-furnishing.js?v=1';
import {registerInteriorFurnishingAction} from '../interiors/runtime.js?v=20';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function createPersonalHomeRuntime(state,dependencies={}) {
  const {getHousing:getPersonalHousing,candidates:getPersonalHomeCandidates,route:routeToPersonalHome}=dependencies;
  const ctx=state.appCtx,store=state.profileStore,element=document.getElementById('discoveryPersonalHome');
  const abort=new AbortController(),housing=(dependencies.getHousing||getPersonalHousing)();
  let profile={},home=null,offers=[],record=null,visual=null,visualKey='',renderKey='',message='',busy=false,disposed=false,saveFailed=false,reviewing=false,loaded=false,elapsed=0,generation=0;
  let coastalReport=null, lunarJourney=harborJourneyState();
  let selectedPurpose='journal';
  let storageOpen=false;
  let importedDesign=null;
  let releaseInteriorAction=null;
  const actor=()=>ctx.Walk?.state?.walker;
  const outdoors=()=>ctx.getEnv?.()==='EARTH'&&!ctx.worldLoading&&!ctx.activeInterior&&ctx.getCurrentTravelMode?.()==='walk'&&!ctx.getLiveGpsSnapshot?.().active;
  const insideHome=()=>home&&ctx.activeInterior?.ownedHome?.id===home.id&&Number(ctx.activeInterior.activeLevel||0)===0&&ctx.getCurrentTravelMode?.()==='walk';
  const workspace=()=>normalizeWorkspace(home?.workspace);
  function reloadHome(){const view=housing.snapshot();home=view.homes.find(h=>h.id===view.starterHomeId)||view.homes.find(h=>h.workspace)||null;return view;}
  function supportFor(candidate){
    const building=ctx.buildings?.find(b=>String(b.sourceBuildingId||b.sourceFeatureId||b.id)===candidate.sourceBuildingId);
    return building?resolveBuildingEntrySupport(building):null;
  }
  function currentPlacement(pose=workspace().pose){return validateWorkspacePlacement(ctx.activeInterior,pose,ctx.dynamicBuildingColliders||[]);}
  function canUse(){
    if(!insideHome()||!visual||!actor()||ctx.getLiveGpsSnapshot?.().active)return false;
    const geometry=visual.geometry;
    return Math.hypot(actor().x-geometry.use.x,actor().z-geometry.use.z)<1.4
      &&Math.abs(actor().y-(ctx.Walk?.CFG?.eyeHeight||1.7)-geometry.use.y)<.8;
  }
  const check=result=>{if(!result?.ok)throw Error(result?.message||({save_failed:'Your home could not be saved. Existing progress is kept; retry when browser storage is available.',starter_already_claimed:'Your personal workspace is already saved.',home_too_far:'Walk to the building entrance first.',item_attached:'Keep equipped field tools in your Backpack.'}[result?.reason]||'That home action is unavailable here.'));reloadHome();return result;};
  function render(){
    if(disposed||!element)return;
    const w=workspace(),v=housing.snapshot(),bag=ctx.playerBackpackInventory?.page?.({offset:0,limit:24})?.items||[];
    const supplies=bag.filter(item=>item.catalogId!=='hands'&&!item.equipped&&!item.verbs?.includes('equip')&&item.category!=='field-tool');
    const key=JSON.stringify([loaded,profile.openingChapter?.phase,profile.homeAchievements,w,home?.id,home?.journey,home?.storage,coastalReport?.eventId,lunarJourney,record?.eventId,v.primaryHomeId,offers.map(o=>o.id),busy,insideHome(),message,reviewing,!!visual,saveFailed,supplies.map(i=>[i.instanceId,i.quantity])]);
    if(key===renderKey)return;renderKey=key;
    const button=(action,label,disabled=false)=>`<button type="button" data-home-action="${escape(action)}"${busy||disabled?' disabled':''}>${escape(label)}</button>`;
    let body='';
    if(!loaded)body='<p>Reading your saved home…</p>';
    else if(profile.openingChapter?.phase!=='complete')body='<p>Finish First Bearings to choose a personal workspace.</p>';
    else if(!home){
      body='<p>Choose a local workspace for your research. This is your own game interior, saved on this device. It does not reserve a real address or a shared property. One workspace is included; no purchase or account is needed.</p>'+button('find','Find nearby workspaces');
      body+=offers.map((o,i)=>`<article class="discoveryDeliveryOffer"><strong>${escape(o.label)}</strong><small>${Math.round(o.distance)} m · ${o.area} m² mapped footprint · personal workspace</small><div class="discoveryPhotoActions">${button(`route:${i}`,'Show walking route')}${button(`claim:${i}`,'Choose at entrance')}</div></article>`).join('');
    }else{
      body=`<p><strong>${escape(home.label)}</strong> · ${escape(home.locationLabel)}. Your local workspace and belongings stay on this device.</p><div class="discoveryPhotoActions">${button('route','Route home')}${button('enter','Enter workspace',!outdoors())}${button('primary',v.primaryHomeId===home.id?'Return destination set':'Set as return destination',v.primaryHomeId===home.id)}</div>`;
      if(insideHome()){
        body+=`<p>Make a Useful Place${profile.homeAchievements?.maker?' · Maker badge earned':''}. Place the desk and chair, try a turn, then undo a change. Walk to the left side of the desk to review a saved record.</p>`;
        body+=`<label>Reuse a saved design <input type="file" accept="application/json,.json" data-home-import${busy?' disabled':''}></label>`;
        if(!w.pose)body+=`<label>Workspace use <select data-home-purpose><option value="journal"${selectedPurpose==='journal'?' selected':''}>Field Journal desk</option>${profile.threeViews?.phase==='complete'&&!profile.threeViews.mediaDeleted?`<option value="album"${selectedPurpose==='album'?' selected':''}>Photo and observation desk</option>`:''}</select></label><div class="discoveryPhotoActions">${button('place','Place desk and chair')}</div>`;
        else body+=`<div class="discoveryPhotoActions">${button('left','Move left ½ m')}${button('right','Move right ½ m')}${button('back','Move back ½ m')}${button('forward','Move forward ½ m')}${button('rotate','Turn 90°')}${button('undo','Undo placement')}${button('walk','Walk to your desk')}${button('export','Export reusable design')}</div><small>${w.rotated?'Rotation tried':'Try a rotation'} · ${w.undone?'Undo tried':'Try undo'} · ${visual?'Furniture ready':'Loading furniture…'}</small>`;
        body+=`<details data-home-storage${storageOpen?' open':''}><summary>Home storage · ${home.storage.reduce((n,i)=>n+i.quantity,0)} / ${home.storageCapacity}</summary><p>Supplies and specimens can be stored here. Equipped tools stay with you.</p>${supplies.map(i=>`<div class="discoveryDeliveryOffer"><span>${escape(i.label)} · ${i.quantity} carried</span>${button(`store:${i.instanceId}`,'Store one')}</div>`).join('')}${home.storage.map(i=>`<div class="discoveryDeliveryOffer"><span>${escape(i.label)} · ${i.quantity} stored</span>${button(`withdraw:${i.instanceId}`,'Take one')}</div>`).join('')}${!supplies.length&&!home.storage.length?'<small>Bring a supply or specimen when you have one to store.</small>':''}</details>`;
      }
      const j=home.journey||{};
      body+=`<p>A Place to Return${profile.homeAchievements?.home?' · Complete':''}: ${j.entered?'entered':'enter your room'} · ${j.displayed?'record displayed':'use your desk'} · ${j.departed?'outing started':'leave for an outing'} · ${j.returned?'returned':'walk back and enter again'}.</p>`;
      if(insideHome()&&coastalReport&&w.pose)body+=button('coastal-display',w.recordId===coastalReport.eventId?'Coastal expedition displayed':'Display coastal expedition',w.recordId===coastalReport.eventId);
      if(lunarJourney.report){
        if(insideHome()&&w.pose)body+=button('lunar-display',w.recordId===lunarJourney.report.eventId?'Lunar field book displayed':'Display lunar field book',w.recordId===lunarJourney.report.eventId);
        body+=`<details><summary>From the Harbor · your journey${lunarJourney.complete?' · complete':''}</summary><ol>${lunarJourney.steps.map(step=>`<li>${step.complete?'✓ ':''}<strong>${escape(step.label)}</strong><br><small>${escape(step.decision)}</small></li>`).join('')}</ol><p>Free roam remains open. Choose another research journey whenever you like.</p>${insideHome()&&w.recordId===lunarJourney.report.eventId?button('lunar-review','Review journey at the desk'):''}</details>`;
      }
      if(reviewing&&record)body+=`<article class="discoveryDeliveryOffer"><strong>${escape(record.name)}</strong><p>${escape(record.detail||record.description||'Your saved First Bearings observation.')}</p><small>${escape(record.regionLabel||home.locationLabel)}</small>${button('review','Review this record at the desk')}${w.purpose==='album'?button('album','Open saved album'):''}</article>`;
      body+=button('journeys','Choose your next journey');
    }
    if(saveFailed)body+=button('retry','Retry saved home');
    element.innerHTML=`<span class="discoveryChapterEyebrow">FROM THE HARBOR · MAKER &amp; HOME</span><strong>Your personal workspace</strong>${body}<small role="status">${escape(message)}</small>`;
    element.setAttribute('aria-busy',String(busy));
  }
  async function refresh(provided){
    try{
      profile=provided||await store.getProfile();if(disposed)return;
      reloadHome();
      const investigationEvents=await store.getEventsById(harborJourneyEventIds);
      coastalReport=investigationState(investigationEvents).report||null;
      lunarJourney=harborJourneyState(profile,investigationEvents);
      const recordId=workspace().recordId||profile.openingChapter?.eventId;
      const [evidence]=recordId?await store.getEventsById([recordId]):[];
      if(disposed)return;record=evidence||null;loaded=true;render();
    }catch{if(!disposed){message='Your workspace could not refresh. Reopen the Journal to retry.';render();}}
  }
  function clearVisual(){generation++;releaseInteriorAction?.();releaseInteriorAction=null;visual?.dispose();visual=null;visualKey='';}
  async function present(){
    const active=ctx.activeInterior,w=workspace();
    if(!insideHome()||!w.pose){if(visual||visualKey)clearVisual();return;}
    const key=`${active.group.uuid}:${home.id}:${w.revision}:${record?.eventId||""}`;if(key===visualKey)return;
    clearVisual();const seq=generation;visualKey=key;
    disposeCuratedHomeFurnishing(active);
    const placement=currentPlacement();
    if(!placement.ok){message=placement.reason;render();return;}
    try {
      const next=await (dependencies.createVisual||createWorkspaceVisual)(ctx,active,placement.geometry,record,{signal:abort.signal,isCurrent:()=>!disposed&&generation===seq&&ctx.activeInterior===active&&active.group.parent});
      if(disposed||generation!==seq){next?.dispose();return;}
      visual=next;
      if(next){
        // The desk belongs to this room's interaction owner. Registering it
        // only as a world context action let a nearby exit consume E first.
        releaseInteriorAction=registerInteriorFurnishingAction(active,{id:'personal-workspace',level:0,
          x:next.geometry.use.x,z:next.geometry.use.z,radius:1.4,label:'Open field record',
          available:()=>!disposed&&!busy&&!state.ui?.open&&ctx.activeInterior===active&&canUse(),
          perform:()=>act('use').then(()=>true)});
      }else visualKey='';
      render();
    }catch(error){if(!disposed&&generation===seq){message='The furniture did not finish loading. Your layout is saved; retry to load it again.';saveFailed=true;render();}}
  }
  async function award(kind){
    if(profile.homeAchievements?.[kind])return;
    await store.recordHomeAchievement(kind,home);profile=await store.getProfile();
    ctx.showToast?.(kind==='maker'?'Maker badge earned · your design is saved':'A Place to Return badge earned');await state.ui?.refreshData();
  }
  async function act(action){
    if(disposed||busy)return;busy=true;message='';render();
    try{
      if(action==='find'){
        if(!outdoors())throw Error('Look for a workspace outdoors on foot, with Live GPS off.');
        offers=(dependencies.candidates||getPersonalHomeCandidates)().filter(c=>c.mappedResidential&&c.sharedEligible&&c.area>=40&&c.area<=500&&supportFor(c)?.enterable).slice(0,5);
        if(!offers.length)message='No suitable mapped homes are ready nearby. Try a residential street; your current progress is kept.';
      }else if(action.startsWith('route:')){const candidate=offers[Number(action.split(':')[1])];if(!candidate||!(dependencies.route||routeToPersonalHome)(candidate))throw Error('That route is unavailable in this region.');state.ui?.setOpen(false);}
      else if(action.startsWith('claim:')){
        if(!outdoors()||profile.openingChapter?.phase!=='complete')throw Error('Finish First Bearings and walk to the entrance.');
        const candidate=offers[Number(action.split(':')[1])],support=candidate&&supportFor(candidate),entry=support?.exteriorEntrance||support?.entryAnchor;
        if(!entry||Math.hypot(actor().x-entry.x,actor().z-entry.z)>5)throw Error('Follow the walking route and stand at the entrance before choosing this workspace.');
        check(housing.claimStarter(candidate));offers=[];message='Workspace saved. Enter to arrange your desk.';
      }else if(action==='route'){if(!home||!(dependencies.route||routeToPersonalHome)(home))throw Error(`Return to ${home?.locationLabel||'your home region'} from Travel, then set this route.`);state.ui?.setOpen(false);}
      else if(action==='enter'){
        const support=home&&supportFor(home),entry=support?.exteriorEntrance||support?.entryAnchor;
        if(!outdoors()||!entry||Math.hypot(actor().x-entry.x,actor().z-entry.z)>5)throw Error('Walk to your home entrance before entering.');
        const enter=ctx.enterInteriorForSupport||(await import('../interiors.js?v=24')).enterInteriorForSupport;
        if(!await enter(support))throw Error('This interior is not ready. Try entering again.');state.ui?.setOpen(false);
      }else if(action==='primary'){check(housing.setPrimary(home.id));message='Your return destination is saved.';}
      else if(['place','left','right','forward','back','rotate','undo','import'].includes(action)){
        if(!insideHome())throw Error('Enter the ground floor of your personal workspace.');
        const w=workspace();let pose=w.pose&&{...w.pose};
        if(action==='place')pose=findWorkspacePlacement(ctx.activeInterior,ctx.dynamicBuildingColliders);
        if(action==='import'){
          if(importedDesign?.format!=='world-explorer-workspace'||importedDesign.schemaVersion!==1||!['journal','album'].includes(importedDesign.purpose)||JSON.stringify(importedDesign.assets)!==JSON.stringify(['workspace-table','workspace-chair']))throw Error('Choose a World Explorer workspace design file.');
          if(importedDesign.purpose==='album'&&(profile.threeViews?.phase!=='complete'||profile.threeViews.mediaDeleted))throw Error('Finish your Three Views record before using an album desk.');
          pose=importedDesign.pose;selectedPurpose=importedDesign.purpose;
        }
        if(action==='left')pose.x-=.5;if(action==='right')pose.x+=.5;if(action==='forward')pose.z-=.5;if(action==='back')pose.z+=.5;if(action==='rotate')pose.turn=(pose.turn+1)%4;
        if(action==='undo')pose=w.previous;
        if(pose){const validation=currentPlacement(pose);if(!validation.ok)throw Error(validation.reason);}
        else if(action!=='undo')throw Error('This room has no clear position for the desk. Keep the entrance and interior corridor free.');
        check(housing.updateWorkspace(home.id,{type:action==='undo'?'undo':'place',pose,purpose:['place','import'].includes(action)?selectedPurpose:w.purpose,revision:w.revision}));
        importedDesign=null;
        reviewing=false;await present();
      }else if(action==='walk'){state.ui?.setOpen(false);ctx.showToast?.('Walk to the side of your desk and use the interaction button.');}
      else if(action==='use'){if(!canUse())throw Error('Stand beside your desk to open the field record.');const placement=currentPlacement();if(!placement.ok)throw Error(placement.reason);reviewing=true;ctx.openWorldDiscoverySection?.('today');}
      else if(action==='review'){
        if(!canUse()||!record)throw Error('Review your saved field record while standing beside the desk.');
        check(housing.updateWorkspace(home.id,{type:'use',revision:workspace().revision}));check(housing.recordHomeVisit(home.id,'displayed'));
        await award('maker');reviewing=false;message='Record reviewed. Your working arrangement is saved for future visits.';
      }else if(action==='coastal-display'){
        if(!canUse())throw Error('Stand beside your desk to display the expedition.');
        const rows=await store.getEventsById(investigationEventIds),report=investigationState(rows).report;
        if(!report||report.eventId!==investigationId('report'))throw Error('File a complete coastal report before displaying it.');
        check(housing.updateWorkspace(home.id,{type:'record',recordId:report.eventId,revision:workspace().revision}));record=report;coastalReport=report;await present();reviewing=true;message='Your coastal expedition is displayed on the desk. Open the field record to review its evidence.';
      }else if(action==='lunar-display'||action==='lunar-review'){
        if(ctx.getEnv?.()!=='EARTH'||!canUse())throw Error('Stand beside your desk on Earth to review the lunar field book.');
        const rows=await store.getEventsById(harborJourneyEventIds),journey=harborJourneyState(await store.getProfile(),rows);
        if(!journey.report)throw Error('Return the lunar comparison to Solis Reach’s Analysis Lab first.');
        if(action==='lunar-display'){
          check(housing.updateWorkspace(home.id,{type:'record',recordId:journey.report.eventId,revision:workspace().revision}));
          record=journey.report;await present();reviewing=true;message='Lunar field book displayed. Review your journey beside the desk to record the homecoming.';
        }else{
          const saved=await store.recordExplorerEvent(lunarHomecomingRecord(home,journey.report));
          if(saved?.recorded!==true&&saved?.reason!=='already-recorded')throw Error('Your homecoming could not be saved. Retry at the desk.');
          const updated=await store.getEventsById(harborJourneyEventIds),currentProfile=await store.getProfile();
          const completed=harborJourneyState(currentProfile,updated);
          if(completed.ready){
            const award=await store.recordExplorerEvent(harborCompletionRecord(currentProfile,updated));
            if(award?.recorded!==true&&award?.reason!=='already-recorded')throw Error('The homecoming is saved. Retry to record the campaign badge.');
            message='From the Harbor complete. Your field records and choices are saved. Choose your next journey, or keep exploring.';
          }else message='Homecoming saved. Your journey record shows the remaining chapters; each can be completed in free roam.';
          await refresh();await state.ui?.refreshData();
        }
      }else if(action==='album'){if(!canUse())throw Error('Stand beside your desk.');ctx.openWorldDiscoverySection?.('today');document.getElementById('discoveryThreeViews')?.scrollIntoView({block:'nearest'});}
      else if(action.startsWith('store:')||action.startsWith('withdraw:')){
        if(!insideHome())throw Error('Enter your personal workspace to use its storage.');
        const [kind,...id]=action.split(':');check(kind==='store'?housing.storeItem(home.id,id.join(':'),1):housing.withdrawItem(home.id,id.join(':'),1));
      }else if(action==='journeys'){ctx.openWorldDiscoverySection?.('today');document.getElementById('discoveryOpeningChapter')?.scrollIntoView({block:'start'});}
      else if(action==='export'){
        const w=workspace();if(!w.pose)throw Error('Place a workspace first.');
        const file={format:'world-explorer-workspace',schemaVersion:1,purpose:w.purpose,pose:w.pose,assets:['workspace-table','workspace-chair']};
        const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='world-explorer-workspace.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }else if(action==='retry'){saveFailed=false;clearVisual();await refresh();await present();}
    }catch(error){message=error.message||'Your workspace action could not finish.';if(message.includes('saved')||message.includes('save'))saveFailed=true;ctx.showToast?.(message);}
    finally{busy=false;reloadHome();render();}
  }
  async function visit(){
    if(!home||busy||saveFailed||!loaded)return;
    const j=home.journey||{};
    let action=null;
    if(insideHome()&&!j.entered)action='entered';
    else if(!ctx.activeInterior&&j.displayed&&!j.departed&&actor()&&Math.hypot(actor().x-home.x,actor().z-home.z)>60)action='departed';
    else if(insideHome()&&j.departed&&!j.returned&&housing.snapshot().primaryHomeId===home.id)action='returned';
    if(!action&&!j.returned&&!(home.workspace?.usedAt&&!profile.homeAchievements?.maker))return;
    busy=true;
    try {if(action)check(housing.recordHomeVisit(home.id,action));if(home.workspace?.usedAt&&!profile.homeAchievements?.maker)await award('maker');if(home.journey.returned)await award('home');}
    catch(error){saveFailed=true;message=error.message||'Home progress did not save. Retry to continue.';}
    finally{busy=false;render();}
  }
  element?.addEventListener('toggle',event=>{if(event.target.matches('[data-home-storage]'))storageOpen=event.target.open;},{capture:true,signal:abort.signal});
  element?.addEventListener('click',event=>{const b=event.target.closest('[data-home-action]');if(b)void act(b.dataset.homeAction);},{signal:abort.signal});
  element?.addEventListener('change',async event=>{
    if(event.target.matches('[data-home-purpose]'))selectedPurpose=event.target.value;
    if(event.target.matches('[data-home-import]')){
      const file=event.target.files?.[0];if(!file)return;
      try{if(file.size>4096)throw Error('The design file is too large.');importedDesign=JSON.parse(await file.text());await act('import');}
      catch{message='That design file could not be read. Your saved arrangement is kept.';render();}
    }
  },{signal:abort.signal});
  void refresh();
  return {refresh,act,update(dt=.016){elapsed+=dt;if(elapsed<.3)return;elapsed=0;reloadHome();void present();void visit();render();},
    snapshot:()=>({homeId:home?.id||null,workspace:workspace(),journey:home?.journey||{},furnitureReady:!!visual,interactionReady:canUse(),offers:offers.map(o=>({id:o.id,label:o.label})),busy,saveFailed,message}),
    dispose(){disposed=true;abort.abort();clearVisual();element?.replaceChildren();}};
}
