import {experienceById,filterExperiences} from '../experiences/catalog.js';
import {continuableExperienceId,orderCareerEntries} from '../experiences/career-availability.js';
import {createExperienceIntent,experienceOffer} from '../experiences/entry.js';
import {EXPERIENCE_GROUPS,experiencePresentation} from './experience-presentation.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createExperienceBrowser({documentRef=document,readContext=()=>({}),readProfile=async()=>null,saveSelection=async()=>{},resolveAdapter=()=>null,onBegin=async()=>false,onEntered=()=>{},onFocus=async()=>{},onJournal=()=>{},onLayer=()=>{}}={}){
 const dialog=documentRef.createElement('dialog');dialog.id='experienceBrowser';dialog.className='experience-browser';dialog.setAttribute('aria-labelledby','experienceHeading');
 dialog.innerHTML=`<header class="experience-header"><div><span class="experience-eyebrow">World Explorer</span><h2 id="experienceHeading">Activities</h2></div><button type="button" data-experience-close aria-label="Close Activities">×</button></header>
 <nav class="experience-tabs" role="tablist" aria-label="Activities"><button type="button" role="tab" data-experience-view="continue" aria-selected="false" tabindex="-1">Continue</button><button type="button" role="tab" data-experience-view="careers" aria-selected="true">Careers</button><button type="button" role="tab" data-experience-view="quick" aria-selected="false" tabindex="-1">Quick play</button></nav>
 <p class="experience-status" role="status" aria-live="polite"></p><div class="experience-body"><section class="experience-list-pane"><div class="experience-intro"><h3>Follow your curiosity.</h3><p>Choose a pursuit, keep your discoveries and return when you are ready. Free exploration is always available.</p></div><label class="experience-search">Find an activity<input type="search" maxlength="100" placeholder="Search careers and games" aria-label="Find an activity"></label><div class="experience-groups" role="group" aria-label="Career interests"></div><div class="experience-list" role="region" aria-label="Activity choices"></div></section><section class="experience-detail" tabindex="-1" aria-label="Assignment details"></section></div>`;
 documentRef.body.append(dialog);
 const find=selector=>dialog.querySelector(selector),list=find('.experience-list'),scrollPane=find('.experience-list-pane'),detail=find('.experience-detail'),search=find('input'),status=find('.experience-status');
 const selections=new Map();
 let variantId='campaign';
 let view='careers',group='all',selected='',profile=null,revision=0,busy=false,origin=null,detailOpen=false,places=[],placeId='',returnScroll=0;
 const adapterFor=entry=>entry&&resolveAdapter(entry.adapterId,entry);
 function selectedPlace(){return places.find(p=>p.id===placeId)||null;}
 function message(text){status.textContent=text;}
 function render(){
  dialog.dataset.detail=String(detailOpen);dialog.dataset.view=view;
  dialog.setAttribute('aria-busy',String(busy));
  for(const button of dialog.querySelectorAll('[data-experience-view]')){const active=button.dataset.experienceView===view;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  search.closest('label').hidden=view==='continue';
  let entries=filterExperiences({view:view==='continue'?'careers':view,query:search.value});
  const groups=find('.experience-groups');groups.hidden=view!=='careers';
  groups.innerHTML=EXPERIENCE_GROUPS.map(item=>`<button type="button" data-experience-group="${item.id}" aria-pressed="${group===item.id}">${escape(item.label)}</button>`).join('');
  if(view==='careers'&&group!=='all')entries=entries.filter(entry=>experiencePresentation(entry).group===group);
  if(view==='continue'){const id=continuableExperienceId(profile?.activeExperience?.experienceId);entries=id&&experienceById(id)?[experienceById(id)]:[];}
  if(view==='careers')entries=orderCareerEntries(entries,{focusId:profile?.journeyPreferences?.activeFocusId});
  list.innerHTML=entries.map(entry=>{const presentation=experiencePresentation(entry),image=presentation.image;return `<article class="experience-tile"><button type="button" class="experience-card${entry.id===selected?' selected':''}" data-experience-id="${escape(entry.id)}" data-release-status="${entry.releaseStatus||'ready'}" ${entry.kind==='career'&&entry.releaseStatus!=='ready'?'disabled aria-disabled="true"':''} aria-pressed="${entry.id===selected}">${image?`<img src="${escape(image.src)}" alt="${escape(image.alt)}" loading="lazy" width="480" height="240">`:`<span class="experience-card-symbol" aria-hidden="true">${presentation.symbol}</span>`}<span>${escape(entry.kind==='career'?presentation.groupLabel:entry.kind==='route'?'Local route':'Quick play')}</span><strong>${escape(entry.label)}</strong><small>${escape(entry.assignment)}</small>${entry.kind==='career'?`<span class="experience-release-label">${escape(entry.releaseLabel)}</span>`:''}</button>${image?`<small class="experience-image-credit">${image.sourceUrl?`<a href="${escape(image.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(image.caption)}</a>`:escape(image.caption)}</small>`:''}</article>`;}).join('')||`<div class="experience-empty"><h3>${view==='continue'?'Choose your first journey':'No matches'}</h3><p>${view==='continue'?'Choose a career or quick game to begin. Your Journal stays with you.':'Try a different name or browse the other Activities tabs.'}</p>${view==='continue'?'<button type="button" data-browse-careers>Browse careers</button>':''}</div>`;
  const entry=experienceById(selected);
  if(!entry){detail.innerHTML='<div class="experience-empty"><h3>What would you like to do?</h3><p>Choose a career for a guided journey, or Quick play for an independent game.</p></div>';return;}
  const adapter=adapterFor(entry),context=readContext(),offer=experienceOffer(entry,{adapter,place:selectedPlace(),profile});
  const progress=offer.state==='unavailable'?null:adapter?.summary?.({entry,profile,variantId})||null;
  detail.innerHTML=`<div class="experience-detail-content"><button type="button" class="experience-back" data-experience-back>← All activities</button><span class="experience-eyebrow">${escape(entry.label)}</span><h3>${escape(progress?.title||entry.assignment)}</h3><p>${escape(progress?.summary||entry.summary)}</p>${progress?.stages?`<ol class="experience-stages">${progress.stages.map(stage=>`<li${stage.complete?' class="complete"':''}>${escape(stage.label)}${stage.complete?' · Done':''}</li>`).join('')}</ol>`:''}
  <div class="experience-preparation"><h4>Prepare your visit</h4>${progress?.choices?.length>1?`<label>Assignment<select data-experience-variant>${progress.choices.map(choice=>`<option value="${escape(choice.id)}"${choice.id===variantId?' selected':''}>${escape(choice.label)}</option>`).join('')}</select></label>`:''}<label>Starting place<select data-experience-place ${!adapter?'disabled':''}>${places.map(p=>`<option value="${escape(p.id)}"${p.id===placeId?' selected':''}>${escape(p.name)}</option>`).join('')||'<option value="">Choose a place</option>'}</select></label><p>${escape(adapter?.equipment||'Select a starting place to see the available tools and equipment.')}</p></div>
  <p class="experience-saving">${escape(entry.persistence)}</p><p class="experience-reason">${escape(offer.reason||'Your location and equipment will be checked before play begins.')}</p>
  ${progress?.recovery?`<p class="experience-recovery-note">${escape(progress.recovery.reason)}</p>`:''}${context.offline?'<p>You are offline. Online races and shared results need a connection.</p>':''}</div><div class="experience-actions"><button type="button" class="experience-primary" data-experience-begin ${busy||!offer.enabled?'disabled':''}>${busy?'Opening…':escape(progress?.resume&&offer.enabled?'Resume':progress?.actionLabel&&offer.enabled?progress.actionLabel:offer.label)}</button>${entry.kind==='career'&&entry.releaseStatus==='ready'?`<button type="button" data-experience-focus ${busy?'disabled':''}>${profile?.journeyPreferences?.activeFocusId===entry.id?'Following this career':'Follow this career'}</button>`:''}${progress?.recovery&&adapter?.recoveryActions?.includes(progress.recovery.id)?`<button type="button" data-experience-recovery="${escape(progress.recovery.id)}"${busy?' disabled':''}>${escape(progress.recovery.label)}</button>`:''}${adapter?.prepare&&context.loaded?`<button type="button" data-experience-prepare>${escape(adapter.prepareLabel||'Equipment')}</button>`:''}<button type="button" data-experience-journal>View Journal</button></div>`;
 }
 async function select(id,{focus=true}={}){
  const entry=experienceById(id);if(!entry)return;selected=id;detailOpen=true;const saved=selections.get(id)||(continuableExperienceId(profile?.activeExperience?.experienceId)===id?{placeId:profile.activeExperience.place?.id,variantId:profile.activeExperience.variantId}:null);variantId=saved?.variantId||'campaign';placeId='';places=[];render();
  const run=++revision;try{
   const adapter=adapterFor(entry),context=readContext(),unavailable=experienceOffer(entry,{adapter,profile}).state==='unavailable',choices=unavailable?null:adapter?.summary?.({entry,profile,variantId})?.choices;
   if(choices?.length&&!choices.some(choice=>choice.id===variantId))variantId=choices[0].id;
   const offered=unavailable?[]:await adapter?.places?.({entry,profile,context,variantId})||[];
   if(run!==revision||!dialog.open)return;
   places=offered.filter((p,i,rows)=>p&&rows.findIndex(row=>row.id===p.id)===i);placeId=places.some(p=>p.id===saved?.placeId)?saved.placeId:places[0]?.id||'';
   render();if(focus)detail.focus({preventScroll:true});
  }catch{if(run===revision)message('Starting places could not load. Select the activity to try again.');}
 }
 function close({restoreFocus=true}={}){revision++;if(dialog.open)dialog.close();onLayer(false);if(restoreFocus&&origin?.isConnected)origin.focus({preventScroll:true});}
 function changeView(next){
  revision++;view=next;selected=next==='continue'?continuableExperienceId(profile?.activeExperience?.experienceId)||'':'';
  detailOpen=false;places=[];placeId='';message('');render();
  if(selected)void select(selected,{focus:false});
 }
 dialog.addEventListener('close',()=>onLayer(false));dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();return;}close();});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
 dialog.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  if(button.hasAttribute('data-experience-close')){close();return;}
  if(button.dataset.experienceGroup&&EXPERIENCE_GROUPS.some(item=>item.id===button.dataset.experienceGroup)){revision++;group=button.dataset.experienceGroup;selected='';places=[];placeId='';detailOpen=false;render();find(`[data-experience-group="${group}"]`)?.focus();return;}
  if(button.hasAttribute('data-experience-back')){detailOpen=false;render();scrollPane.scrollTop=returnScroll;list.querySelector(`[data-experience-id="${selected}"]`)?.focus();return;}
  if(button.dataset.experienceView||button.hasAttribute('data-browse-careers')){changeView(button.dataset.experienceView||'careers');return;}
  if(button.dataset.experienceId){returnScroll=scrollPane.scrollTop;void select(button.dataset.experienceId);return;}
  if(button.hasAttribute('data-experience-prepare')){const adapter=adapterFor(experienceById(selected));close();await adapter?.prepare?.();return;}
  if(button.hasAttribute('data-experience-journal')){close();onJournal();return;}
  if(button.hasAttribute('data-experience-focus')){const entry=experienceById(selected);if(entry?.releaseStatus!=='ready'||busy)return;busy=true;render();try{await onFocus(entry.id==='career:explorer'?null:entry.id);profile=await readProfile();message(entry.id==='career:explorer'?'Free exploration selected. Your current assignment is kept.':`Following ${entry.label}. Your current assignment is kept.`);}catch(error){message(error.message||'Your career preference could not save. Try again.');}finally{busy=false;render();}return;}
  if(button.hasAttribute('data-experience-begin')||button.hasAttribute('data-experience-recovery')){
   const entry=experienceById(selected),place=selectedPlace(),offer=experienceOffer(entry,{adapter:adapterFor(entry),place,profile});if(!offer.enabled)return;
   if(!place){message('Choose a starting place first.');find('[data-experience-place]')?.focus();return;}
   busy=true;message('');render();const run=++revision;
   try{const intent=createExperienceIntent({experienceId:selected,place,variantId,recoveryAction:button.dataset.experienceRecovery||''});await saveSelection(intent);if(run!==revision)return;dialog.close();onLayer(false);const started=await onBegin(intent);if(run!==revision)return;if(started===false){dialog.showModal();onLayer(true);message('That activity could not start here. Your selection is kept. Choose another place or try again.');}else{close({restoreFocus:false});onEntered();}}
   catch{if(run===revision){if(!dialog.open)dialog.showModal();onLayer(true);message('The activity could not open. Your saved progress is kept. Try again.');}}
   finally{busy=false;if(dialog.open)render();}
  }
 });
 dialog.addEventListener('change',async event=>{if(event.target.matches('[data-experience-variant]')){variantId=event.target.value;selections.set(selected,{placeId,variantId});await select(selected,{focus:false});find('[data-experience-variant]')?.focus();}else if(event.target.matches('[data-experience-place]')){placeId=event.target.value;selections.set(selected,{placeId,variantId});render();find('[data-experience-place]')?.focus();}});
 search.addEventListener('input',()=>{revision++;selected='';places=[];placeId='';detailOpen=false;render();});
 find('.experience-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...dialog.querySelectorAll('[data-experience-view]')],index=tabs.indexOf(documentRef.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;changeView(tabs[next].dataset.experienceView);tabs[next].focus();
 });
 return Object.freeze({
  async open(options={}){origin=documentRef.activeElement;const requested=continuableExperienceId(options.experienceId);view=options.view||(requested&&experienceById(requested)?.kind!=='career'?'quick':view);selected=requested||(options.view?'':selected);detailOpen=!!options.experienceId;if(!dialog.open)dialog.showModal();onLayer(true);message('');render();const run=++revision;try{profile=await readProfile();if(run!==revision)return;if(view==='continue')selected=continuableExperienceId(profile?.activeExperience?.experienceId)||'';render();if(selected&&(options.experienceId||view==='continue'||detailOpen))await select(selected,{focus:!!options.experienceId});}catch{if(run===revision)message('Your saved progress could not load. Close Activities and try again.');}},
  close,refresh:async()=>{profile=await readProfile();if(dialog.open)render();},
  snapshot:()=>({open:dialog.open,view,selected,detailOpen,placeId,busy}),
  dispose(){close();dialog.remove();}
 });
}
