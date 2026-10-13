import {captureEnvironmentSession} from '../session-coordinator.js?v=2';
import {createIndexedDbDiscoveryProfileStore} from './profile-store.js?v=5';
import {journalReturnDestination,returnToJournalRecord} from './journal-return.js';

// The same Journal/Guide and DOM shell, usable before an Earth scene exists.
// This reader has no encounter generation, reward, inventory or save authority.
const sessions=new WeakMap();
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const paths={field:'Fieldwork',activity:'Games',creation:'Making',travel:'Travel',community:'Community',companion:'Companions'};
export function journeyJournalIsOpen(ctx){return sessions.has(ctx);}
export function closeJourneyJournal(ctx){
  const session=sessions.get(ctx);if(!session)return false;sessions.delete(ctx);session.controller.abort();session.revision++;
  const panel=document.getElementById('discoveryPanel');if(panel){delete panel.dataset.journeyJournalOwner;panel.classList.remove('show');panel.setAttribute('aria-hidden','true');}
  for(const [node,hidden] of session.hidden)node.hidden=hidden;
  for(const [node,visibility] of session.visibility)node.style.visibility=visibility;
  ctx.screenLayout?.setPanelLayer?.('journal',false);ctx.setPauseReason?.('journey_journal',false);return true;
}
function selectSection(session,section){
  session.section=section==='guide'?'guide':'journal';
  document.getElementById('discoveryPanelTitle').textContent=session.section==='guide'?'Field Guide':'Journal';
  document.querySelectorAll('[data-discovery-tab]').forEach(node=>node.classList.toggle('active',node.dataset.discoveryTab===session.section));
  document.querySelectorAll('[data-discovery-pane]').forEach(node=>node.classList.toggle('active',node.dataset.discoveryPane===session.section));
}
function render(ctx,session){
  if(sessions.get(ctx)!==session)return;
  const category=document.getElementById('discoveryJournalCategory')?.value||'all',region=document.getElementById('discoveryJournalRegion')?.value||'all';
  const rows=session.events.filter(e=>(category==='all'||(e.pathId||'field')===category)&&(region==='all'||e.regionId===region));
  const article=event=>{
    const destination=journalReturnDestination(event,ctx.LOCS),date=new Date(Number(event.occurredAt)||0).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    return `<article class="discoveryItem discoveryJournalEvent"><span class="discoveryJournalTime">${escape(date)}</span><span class="discoveryJournalPath">${escape(paths[event.pathId]||'Fieldwork')}</span><strong>${escape(event.name||'Explorer record')}</strong><small>${escape(event.regionLabel||'Saved journey')}</small><small>${escape(event.detail||'')}</small><span class="discoveryJournalProgress">Saved on this device</span>${destination?`<button class="discoveryJournalReturn" data-journey-return="${escape(event.eventId)}" type="button">${escape(destination.label)}</button>`:''}</article>`;
  };
  const list=document.getElementById('discoveryJournalList');if(list)list.innerHTML=rows.length?rows.map(article).join(''):'<div class="discoveryEmpty">No Journal records match these filters.</div>';
  const search=(document.getElementById('discoveryGuideSearch')?.value||'').trim().toLowerCase(),family=document.getElementById('discoveryGuideCategory')?.value||'all';
  const families={wildlife:['animal','bird','fish','wildlife','insect'],plants:['plant','flower','tree','fungus'],geology:['rock','mineral','sediment'],fossils:['fossil'],places:['places','place','artifact'],ocean:['fish','marine','coral']};
  const guide=session.guide.filter(e=>(!search||`${e.name||''} ${e.catalogId||''} ${e.family||''}`.toLowerCase().includes(search))&&(family==='all'||families[family]?.some(f=>String(e.family).includes(f))));
  const guideList=document.getElementById('discoveryFieldGuideList');if(guideList)guideList.innerHTML=guide.length?guide.map(e=>`<article class="discoveryItem"><strong>${escape(e.name||e.catalogId||'Field Guide record')}</strong><small>${Number(e.observations)||1} observation${Number(e.observations)===1?'':'s'}</small></article>`).join(''):'<div class="discoveryEmpty">No saved Guide entries match this search.</div>';
  const overview=document.getElementById('discoveryGuideOverview');if(overview)overview.innerHTML=`<article><strong>${session.guide.length}</strong><span>saved entries</span></article><article><strong>${session.events.length}</strong><span>recent records</span></article><article><strong>World</strong><span>Guide scope</span></article>`;
}
export async function refreshJourneyJournal(ctx){
  const session=sessions.get(ctx);if(!session)return false;const revision=++session.revision;
  try{
    const [events,guide]=await Promise.all([session.store.listEvents(100),session.store.listFieldGuide(200)]);
    if(sessions.get(ctx)!==session||revision!==session.revision)return false;
    session.events=events;session.guide=guide;
    const filter=document.getElementById('discoveryJournalRegion'),prior=filter?.value;
    if(filter){const regions=[...new Map(events.filter(e=>e.regionId).map(e=>[e.regionId,e.regionLabel||'Saved region']))];filter.innerHTML='<option value="all">All regions</option>'+regions.map(([id,label])=>`<option value="${escape(id)}">${escape(label)}</option>`).join('');filter.value=regions.some(([id])=>id===prior)?prior:'all';}
    render(ctx,session);return true;
  }catch{
    if(sessions.get(ctx)!==session||revision!==session.revision)return false;
    selectSection(session,'journal');
    document.getElementById('discoveryJournalList').innerHTML='<div class="discoveryEmpty">Your Journal could not be read. Saved records are kept. <button data-journey-retry type="button">Retry Journal</button></div>';
    return false;
  }
}
export async function openJourneyJournal(ctx,section='journal'){
  const panel=document.getElementById('discoveryPanel');if(!panel)return false;
  let session=sessions.get(ctx);
  if(!session){
    ctx.toggleWorldDiscoveryJournal?.(false);
    const hidden=new Map(),visibility=new Map(),controller=new AbortController();
    session={controller,hidden,visibility,store:ctx.discoveryProfileStore||createIndexedDbDiscoveryProfileStore(),events:[],guide:[],revision:0,section:'journal'};sessions.set(ctx,session);
    captureEnvironmentSession().signal.addEventListener('abort',()=>closeJourneyJournal(ctx),{once:true,signal:controller.signal});
    // Hide only Earth-runtime controls, recording prior visibility for handoff.
    for(const node of panel.querySelectorAll('[data-discovery-tab="today"], [data-discovery-destination], #discoveryProfileBtn, #discoveryHelpBtn, #discoverySectionTutorial, .discoveryJournalPlaces, #discoveryGuideScope, #discoveryGuideHelpBtn, #discoveryGuideHelp, .discoveryGuideLifeDetails, .discoveryGuideLeadsHead')){hidden.set(node,node.hidden);node.hidden=true;}
    for(const id of ['solidWorldPanel','solidWorldReturnBtn']){const node=document.getElementById(id);if(node){visibility.set(node,node.style.visibility);node.style.visibility='hidden';}}
    panel.dataset.journeyJournalOwner='journey';panel.classList.add('show');panel.setAttribute('aria-hidden','false');ctx.screenLayout?.setPanelLayer?.('journal',true);ctx.setPauseReason?.('journey_journal',true);
    const options={capture:true,signal:controller.signal};
    panel.addEventListener('click',event=>{
      const button=event.target.closest('button');if(!button)return;
      event.stopImmediatePropagation();
      if(button.id==='discoveryCloseBtn'){closeJourneyJournal(ctx);return;}
      if(button.dataset.discoveryTab){selectSection(session,button.dataset.discoveryTab);render(ctx,session);return;}
      if(button.hasAttribute('data-journey-retry')){void refreshJourneyJournal(ctx);return;}
      if(button.dataset.journeyReturn){const record=session.events.find(e=>e.eventId===button.dataset.journeyReturn);closeJourneyJournal(ctx);void returnToJournalRecord(ctx,record).then(ok=>{if(!ok)ctx.showToast?.('This journey could not reopen. Your saved record is kept.');});}
    },options);
    for(const type of ['change','input'])panel.addEventListener(type,event=>{event.stopImmediatePropagation();render(ctx,session);},options);
    document.addEventListener('keydown',event=>{if(event.code==='Escape'){event.stopImmediatePropagation();event.preventDefault();closeJourneyJournal(ctx);}},options);
  }
  selectSection(session,section);await refreshJourneyJournal(ctx);return true;
}
