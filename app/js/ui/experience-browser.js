import {experienceById,filterExperiences} from '../experiences/catalog.js';
import {createExperienceIntent,experienceOffer} from '../experiences/entry.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createExperienceBrowser({documentRef=document,readContext=()=>({}),readProfile=async()=>null,saveSelection=async()=>{},resolveAdapter=()=>null,onBegin=async()=>false,onEntered=()=>{},onJournal=()=>{},onLayer=()=>{}}={}){
 const dialog=documentRef.createElement('dialog');dialog.id='experienceBrowser';dialog.className='experience-browser';dialog.setAttribute('aria-labelledby','experienceHeading');
 dialog.innerHTML=`<header class="experience-header"><div><span class="experience-eyebrow">World Explorer</span><h2 id="experienceHeading">Activities</h2></div><button type="button" data-experience-close aria-label="Close Activities">×</button></header>
 <nav class="experience-tabs" role="tablist" aria-label="Activities"><button type="button" role="tab" data-experience-view="continue" aria-selected="false" tabindex="-1">Continue</button><button type="button" role="tab" data-experience-view="careers" aria-selected="true">Careers</button><button type="button" role="tab" data-experience-view="quick" aria-selected="false" tabindex="-1">Quick play</button></nav>
 <p class="experience-status" role="status" aria-live="polite"></p><div class="experience-body"><section class="experience-list-pane"><label class="experience-search">Find an activity<input type="search" maxlength="100" placeholder="Search careers and games" aria-label="Find an activity"></label><div class="experience-list" role="region" aria-label="Activity choices"></div></section><section class="experience-detail" tabindex="-1" aria-label="Assignment details"></section></div>`;
 documentRef.body.append(dialog);
 const find=selector=>dialog.querySelector(selector),list=find('.experience-list'),detail=find('.experience-detail'),search=find('input'),status=find('.experience-status');
 const selections=new Map();
 let variantId='campaign';
 let view='careers',selected='',profile=null,revision=0,busy=false,origin=null,detailOpen=false,places=[],placeId='',returnScroll=0;
 const adapterFor=entry=>entry&&resolveAdapter(entry.adapterId,entry);
 function selectedPlace(){return places.find(p=>p.id===placeId)||null;}
 function message(text){status.textContent=text;}
 function render(){
  dialog.dataset.detail=String(detailOpen);dialog.dataset.view=view;
  for(const button of dialog.querySelectorAll('[data-experience-view]')){const active=button.dataset.experienceView===view;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  search.closest('label').hidden=view==='continue';
  let entries=filterExperiences({view:view==='continue'?'careers':view,query:search.value});
  if(view==='continue'){const id=profile?.activeExperience?.experienceId;entries=id&&experienceById(id)?[experienceById(id)]:[];}
  list.innerHTML=entries.map(entry=>`<button type="button" class="experience-card${entry.id===selected?' selected':''}" data-experience-id="${escape(entry.id)}" aria-pressed="${entry.id===selected}"><span>${escape(entry.kind==='career'?'Career':entry.kind==='route'?'Local route':'Quick play')}</span><strong>${escape(entry.label)}</strong><small>${escape(entry.assignment)}</small></button>`).join('')||`<div class="experience-empty"><h3>${view==='continue'?'Choose your first journey':'No matches'}</h3><p>${view==='continue'?'Choose a career or quick game to begin. Your Journal stays with you.':'Try a different name or browse the other Activities tabs.'}</p>${view==='continue'?'<button type="button" data-browse-careers>Browse careers</button>':''}</div>`;
  const entry=experienceById(selected);
  if(!entry){detail.innerHTML='<div class="experience-empty"><h3>What would you like to do?</h3><p>Choose a career for a guided journey, or Quick play for an independent game.</p></div>';return;}
  const adapter=adapterFor(entry),context=readContext(),offer=experienceOffer(entry,{adapter,place:selectedPlace(),profile});
  const progress=offer.state==='unavailable'?null:adapter?.summary?.({entry,profile,variantId})||null;
  detail.innerHTML=`<div class="experience-detail-content"><button type="button" class="experience-back" data-experience-back>← All activities</button><span class="experience-eyebrow">${escape(entry.label)}</span><h3>${escape(progress?.title||entry.assignment)}</h3><p>${escape(progress?.summary||entry.summary)}</p>${progress?.stages?`<ol class="experience-stages">${progress.stages.map(stage=>`<li${stage.complete?' class="complete"':''}>${escape(stage.label)}${stage.complete?' · Done':''}</li>`).join('')}</ol>`:''}
  <div class="experience-preparation"><h4>Prepare your visit</h4>${progress?.choices?.length>1?`<label>Assignment<select data-experience-variant>${progress.choices.map(choice=>`<option value="${escape(choice.id)}"${choice.id===variantId?' selected':''}>${escape(choice.label)}</option>`).join('')}</select></label>`:''}<label>Starting place<select data-experience-place ${!adapter?'disabled':''}>${places.map(p=>`<option value="${escape(p.id)}"${p.id===placeId?' selected':''}>${escape(p.name)}</option>`).join('')||'<option value="">Choose a place</option>'}</select></label><p>${escape(adapter?.equipment||'Select a starting place to see the available tools and equipment.')}</p></div>
  <p class="experience-saving">${escape(entry.persistence)}</p><p class="experience-reason">${escape(offer.reason||'Your location and equipment will be checked before play begins.')}</p>
  ${progress?.recovery?`<p class="experience-recovery-note">${escape(progress.recovery.reason)}</p>`:''}${context.offline?'<p>You are offline. Online races and shared results need a connection.</p>':''}</div><div class="experience-actions"><button type="button" class="experience-primary" data-experience-begin ${busy||!offer.enabled?'disabled':''}>${busy?'Opening…':escape(progress?.resume&&offer.enabled?'Resume':offer.label)}</button>${progress?.recovery&&adapter?.recoveryActions?.includes(progress.recovery.id)?`<button type="button" data-experience-recovery="${escape(progress.recovery.id)}"${busy?' disabled':''}>${escape(progress.recovery.label)}</button>`:''}${adapter?.prepare&&context.loaded?`<button type="button" data-experience-prepare>${escape(adapter.prepareLabel||'Equipment')}</button>`:''}<button type="button" data-experience-journal>View Journal</button></div>`;
 }
 async function select(id,{focus=true}={}){
  const entry=experienceById(id);if(!entry)return;selected=id;detailOpen=true;const saved=selections.get(id)||(profile?.activeExperience?.experienceId===id?{placeId:profile.activeExperience.place?.id,variantId:profile.activeExperience.variantId}:null);variantId=saved?.variantId||'campaign';placeId='';places=[];render();
  const run=++revision;try{
   const adapter=adapterFor(entry),context=readContext();
   const offered=await adapter?.places?.({entry,profile,context})||[];
   if(run!==revision||!dialog.open)return;
   places=offered.filter((p,i,rows)=>p&&rows.findIndex(row=>row.id===p.id)===i);placeId=places.some(p=>p.id===saved?.placeId)?saved.placeId:places[0]?.id||'';
   render();if(focus)detail.focus({preventScroll:true});
  }catch{if(run===revision)message('Starting places could not load. Select the activity to try again.');}
 }
 function close({restoreFocus=true}={}){revision++;if(dialog.open)dialog.close();onLayer(false);if(restoreFocus&&origin?.isConnected)origin.focus({preventScroll:true});}
 dialog.addEventListener('close',()=>onLayer(false));dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();return;}close();});
 dialog.addEventListener('keydown',event=>{if(event.key==='Escape')event.stopPropagation();});
 dialog.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||busy)return;
  if(button.hasAttribute('data-experience-close')){close();return;}
  if(button.hasAttribute('data-experience-back')){detailOpen=false;render();list.scrollTop=returnScroll;list.querySelector(`[data-experience-id="${selected}"]`)?.focus();return;}
  if(button.dataset.experienceView||button.hasAttribute('data-browse-careers')){view=button.dataset.experienceView||'careers';detailOpen=false;message('');render();return;}
  if(button.dataset.experienceId){returnScroll=list.scrollTop;void select(button.dataset.experienceId);return;}
  if(button.hasAttribute('data-experience-prepare')){const adapter=adapterFor(experienceById(selected));close();await adapter?.prepare?.();return;}
  if(button.hasAttribute('data-experience-journal')){close();onJournal();return;}
  if(button.hasAttribute('data-experience-begin')||button.hasAttribute('data-experience-recovery')){
   const entry=experienceById(selected),place=selectedPlace(),offer=experienceOffer(entry,{adapter:adapterFor(entry),place,profile});if(!offer.enabled)return;
   if(!place){message('Choose a starting place first.');find('[data-experience-place]')?.focus();return;}
   busy=true;message('');render();const run=++revision;
   try{const intent=createExperienceIntent({experienceId:selected,place,variantId,recoveryAction:button.dataset.experienceRecovery||''});await saveSelection(intent);if(run!==revision)return;dialog.close();onLayer(false);const started=await onBegin(intent);if(run!==revision)return;if(started===false){dialog.showModal();onLayer(true);message('That activity could not start here. Your selection is kept. Choose another place or try again.');}else{close({restoreFocus:false});onEntered();}}
   catch{if(run===revision){if(!dialog.open)dialog.showModal();onLayer(true);message('The activity could not open. Your saved progress is kept. Try again.');}}
   finally{busy=false;if(dialog.open)render();}
  }
 });
 dialog.addEventListener('change',event=>{if(event.target.matches('[data-experience-variant]')){variantId=event.target.value;selections.set(selected,{placeId,variantId});render();find('[data-experience-variant]')?.focus();}else if(event.target.matches('[data-experience-place]')){placeId=event.target.value;selections.set(selected,{placeId,variantId});render();find('[data-experience-place]')?.focus();}});
 search.addEventListener('input',()=>{detailOpen=false;render();});
 find('.experience-tabs').addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const tabs=[...dialog.querySelectorAll('[data-experience-view]')],index=tabs.indexOf(documentRef.activeElement);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;view=tabs[next].dataset.experienceView;detailOpen=false;render();tabs[next].focus();
 });
 return Object.freeze({
  async open(options={}){origin=documentRef.activeElement;view=options.view||view;selected=options.experienceId||selected;detailOpen=!!options.experienceId;if(!dialog.open)dialog.showModal();onLayer(true);message('');render();const run=++revision;try{profile=await readProfile();if(run!==revision)return;if(view==='continue'&&!selected)selected=profile?.activeExperience?.experienceId||'';render();if(selected)await select(selected,{focus:!!options.experienceId});}catch{if(run===revision)message('Your saved progress could not load. Close Activities and try again.');}},
  close,refresh:async()=>{profile=await readProfile();if(dialog.open)render();},
  snapshot:()=>({open:dialog.open,view,selected,detailOpen,placeId,busy}),
  dispose(){close();dialog.remove();}
 });
}
