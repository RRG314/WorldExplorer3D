import {PORTAL_CATALOG,portalDestination,portalSuggestions} from './catalog.js';
import {portalOffer,portalGameLink,portalDeviceProfile} from './game-intent.js';
import {createIndexedDbDiscoveryProfileStore} from '../discovery/profile-store.js?v=5';
import {createPortalTrailController} from './trail-controller.js';
import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';

const scope=createLifecycleScope('living-portal-page'),byId=id=>document.getElementById(id);
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const link=href=>globalThis.WorldExplorerDistribution?.url(href)||href;
let mode='wander',selectedId=null,learningId=null,homeId=null,auth=null,api=null,view={places:[],summary:{saved:0,investigated:0,visited:0},ownerScope:'device-guest',status:'device'};
try{homeId=localStorage.getItem('we3d:portal-home');}catch{}
const store=createIndexedDbDiscoveryProfileStore();
const controller=createPortalTrailController({store,request:async(...args)=>{
  if(!api)throw new Error('Account service is unavailable.');return api.postProtectedFunction(...args);
},onChange:next=>{view=next;render();}});
scope.defer(()=>controller.dispose());
const offered=new Set();
const observer=new IntersectionObserver(rows=>{
  if(document.hidden)return;
  for(const row of rows){
    if(!row.isIntersecting)continue;
    const id=row.target.dataset.destination,day=Math.floor(Date.now()/86400000),key=`${view.ownerScope}|${id}|${day}`;
    if(offered.has(key)||Math.floor((placeState(id).lastOfferedAt||0)/86400000)===day)continue;
    offered.add(key);run(()=>controller.act(id,'offered'));
  }
},{threshold:.3});
scope.defer(()=>observer.disconnect());
function notice(message){byId('notice').textContent=message;}
function run(work){Promise.resolve().then(work).catch(error=>notice(error.message||'Your Portal could not open. Please try again.'));}
function placeState(id){return view.places.find(row=>row.destinationId===id)||{};}
function render(){
  observer.disconnect();
  const focused=document.activeElement;
  const focusKey=focused?.matches('button')?[...focused.attributes].find(attribute=>attribute.name.startsWith('data-')):null;
  const restoreFocus=()=>{if(focusKey&&!focused.isConnected&&!document.querySelector('dialog[open]'))document.querySelector(`button[${focusKey.name}="${CSS.escape(focusKey.value)}"]`)?.focus({preventScroll:true});};
  const account=view.ownerScope!=='device-guest';byId('accountBtn').textContent=account?'Account':'Sign in';
  byId('syncBtn').hidden=!account;byId('copyBtn').hidden=!account;
  byId('syncState').textContent=(!navigator.onLine?'Offline · ':'')+(view.error||(view.status==='syncing'?'Syncing your Trail…':view.status==='synced'?'Trail synced to your Explorer account':account?'Choices saved on this device · sync pending':'Device Trail · sign in for cross-device sync'));
  byId('trailCounts').innerHTML=['saved','investigated','visited'].map(key=>`<div><strong>${view.summary[key]||0}</strong><span>${key==='investigated'?'Investigated':key==='visited'?'3D visits':'Saved'}</span></div>`).join('');
  const rows=view.places.filter(row=>row.saved||row.investigatedAt||row.visitedAt);
  byId('trailList').innerHTML=rows.length?rows.map(row=>{
    const place=portalDestination(row.destinationId);
    return `<article class="trail-item"><strong>${escape(place?.title||row.destinationId)}</strong><small>${[row.saved?'Saved':null,row.investigatedAt?'Investigated':null,row.visitedAt?'Visited in 3D':null].filter(Boolean).join(' · ')}${row.pending?' · Sync pending':''}</small>${place?`<button type="button" data-reopen="${escape(row.destinationId)}">Open place</button>`:''}</article>`;
  }).join(''):'<p class="empty muted">Your Trail starts with a place that catches your interest.</p>';
  document.querySelectorAll('[data-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mode===mode)));
  const section=byId('discovery');
  if(mode==='together'){
    section.innerHTML=`<div class="panel"><p class="eyebrow">Explore with others</p><h2>Find your fellow explorers</h2><p>Open Multiplayer to join the shared weekly city, create a room, or use a friend’s room code.</p><a class="button primary" href="${escape(link('../app/?tab=multiplayer'))}">Open Multiplayer ↗</a><p class="small muted">Sign-in and room availability are checked in the game. This Portal keeps no background room connection.</p></div>`;return;
  }
  if(mode==='beyond'){
    section.innerHTML=`<div class="panel"><p class="eyebrow">Look beyond Earth</p><h2>Choose your next horizon</h2><p>Visit the Moon or Mars, or start a journey in space. Your game’s destination menu includes the available worlds and controls.</p><div class="actions"><a class="button primary" href="${escape(link('../app/?launch=moon&gm=free'))}">Moon ↗</a><a class="button" href="${escape(link('../app/?launch=mars&gm=free'))}">Mars ↗</a><a class="button" href="${escape(link('../app/?launch=space&gm=free'))}">Space ↗</a></div></div>`;return;
  }
  const suggestions=portalSuggestions({mode,homeId}),place=portalDestination(selectedId)||suggestions[0];
  if(!place){section.innerHTML='<div class="panel"><p class="eyebrow">Your home Portal</p><h2>Keep a favorite place close</h2><p>Choose a destination in Wander, then select “Make this my Home Portal.” Your Home Portal stays here until you change it.</p><button type="button" data-wander>Choose a place</button></div>';return;}
  selectedId=place.id;const state=placeState(place.id),point=place.destination.origin;
  const offer=portalOffer(place,PORTAL_CATALOG,{now:Date.now(),deviceProfile:portalDeviceProfile()});
  section.innerHTML=`<article class="destination" data-destination="${place.id}">${place.image?`<img src="${escape(place.image)}" alt="${escape(place.imageAlt)}" width="1200" height="600">`:`<div class="coordinate-art" aria-label="Geographic coordinates"><strong>${Math.abs(point.lat).toFixed(4)}° ${point.lat<0?'S':'N'}</strong><strong>${Math.abs(point.lon).toFixed(4)}° ${point.lon<0?'W':'E'}</strong><small>Location reference · not a scene preview</small></div>`}<div class="body"><p class="eyebrow">${escape(place.topic)}</p><h2>${escape(place.title)}</h2><p class="region">${escape(place.region)}</p><p>${escape(place.summary)}</p><div class="actions"><button type="button" class="primary" data-investigate="${place.id}">${state.investigatedAt?'Read again':'Investigate'}</button><button type="button" data-save="${place.id}" aria-pressed="${!!state.saved}">${state.saved?'Saved · remove':'Save place'}</button></div><div class="actions"><button type="button" data-home="${place.id}" ${homeId===place.id?'disabled':''}>${homeId===place.id?'Your Home Portal':'Make this my Home Portal'}</button>${offer.decision.eligible?`<a class="button primary" href="${escape(link(portalGameLink(place)))}">Enter World ↗</a></div><p class="small muted">Your 3D visit is recorded after the game admits and shows this destination.</p>`:`</div><p class="availability">3D entry is being checked for this destination. You can save it and investigate now; a ready world will appear here when its location and gameplay checks pass.</p>`}</div></article><div class="next"><span class="small muted">${suggestions.length} ${suggestions.length===1?'place':'places'} in this collection · no daily streak required</span>${suggestions.length>1?'<button type="button" data-next>Another place →</button>':''}</div>`;
  observer.observe(section.querySelector('[data-destination]'));
  restoreFocus();
}
scope.listen(document,'click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.mode){mode=button.dataset.mode;selectedId=null;render();return;}
  if(button.hasAttribute('data-wander')){mode='wander';selectedId=null;render();return;}
  if(button.dataset.reopen){mode='wander';selectedId=button.dataset.reopen;render();byId('discovery').scrollIntoView({behavior:'instant'});return;}
  if(button.dataset.save){const id=button.dataset.save;run(()=>controller.act(id,placeState(id).saved?'unsave':'save'));return;}
  if(button.dataset.investigate){learningId=button.dataset.investigate;const place=portalDestination(learningId);
    byId('learningBody').innerHTML=`<p class="eyebrow">${escape(place.region)}</p><h2>${escape(place.learning.title)}</h2>${place.learning.paragraphs.map(text=>`<p>${escape(text)}</p>`).join('')}<p class="sources">Read more: ${place.learning.sources.map(source=>`<a href="${escape(source.url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a>`).join(' · ')}</p>`;
    byId('completeBtn').textContent=placeState(learningId).investigatedAt?'Investigated · close':'Add to Investigated';byId('learning').showModal();return;}
  if(button.id==='completeBtn'){const place=portalDestination(learningId);if(place)run(async()=>{
    if(placeState(place.id).investigationVersion!==place.learning.version)await controller.act(place.id,'investigate',place.learning.version);
    byId('learning').close();byId('discovery').querySelector('[data-investigate]')?.focus({preventScroll:true});notice('Investigation saved to your Trail.');
  });return;}
  if(button.dataset.home){homeId=button.dataset.home;try{localStorage.setItem('we3d:portal-home',homeId);notice('Your Home Portal is set on this device.');}catch{notice('Home is set for this visit. Browser storage is unavailable.');}render();return;}
  if(button.hasAttribute('data-next')){const rows=portalSuggestions({mode,homeId});selectedId=rows[(Math.max(0,rows.findIndex(row=>row.id===selectedId))+1)%rows.length]?.id;render();return;}
  if(button.id==='syncBtn')run(()=>controller.sync());
  if(button.id==='copyBtn')run(async()=>{await controller.copyDeviceChoices();notice('Device saves and investigations copied. Existing device records are kept.');});
  if(button.id==='accountBtn'){byId('account').showModal();return;}
  if(button.id==='googleBtn')runAuth(()=>auth.signInWithGoogle());
  if(button.id==='signOutBtn')runAuth(()=>auth.signOutUser());
});
async function runAuth(work){byId('accountError').textContent='';if(!auth){byId('accountError').textContent='Sign-in is unavailable offline. Your device Trail still works.';return;}
  try{await work();byId('account').close();}catch(error){byId('accountError').textContent=error.message||'Sign-in could not complete. Please try again.';}}
scope.listen(byId('signInForm'),'submit',event=>{event.preventDefault();const data=new FormData(event.currentTarget);void runAuth(()=>auth.signInWithEmailPassword(data.get('email'),data.get('password')));});
scope.listen(window,'online',()=>{render();run(()=>controller.sync());});
scope.listen(window,'offline',render);
scope.listen(document,'visibilitychange',()=>{if(!document.hidden)run(()=>controller.sync());});
scope.listen(window,'pagehide',event=>{if(!event.persisted)scope.dispose('page closed');});
render();run(()=>controller.changeOwner(null));
if('serviceWorker' in navigator){
  const cacheStatic=()=>{
    const urls=[location.origin+'/portal/',...performance.getEntriesByType('resource').map(row=>row.name)];
    navigator.serviceWorker.controller?.postMessage({type:'cache-portal-static',urls});
  };
  scope.listen(navigator.serviceWorker,'controllerchange',cacheStatic);
  void navigator.serviceWorker.register('/portal/sw.js',{scope:'/portal/'}).then(()=>navigator.serviceWorker.ready).then(cacheStatic).catch(()=>{});
}
// Local discovery/storage opens before network SDKs, preserving offline use.
void Promise.all([import('../../../js/auth-ui.js?v=56'),import('../../../js/function-api.js?v=3')]).then(([authModule,apiModule])=>{
  if(!scope.isActive())return;auth=authModule;api=apiModule;
  scope.defer(auth.observeAuth(user=>{
    if(!scope.isActive())return;const registered=user&&!user.isAnonymous;
    byId('signOutBtn').hidden=!registered;byId('googleBtn').hidden=!!registered;byId('signInForm').hidden=!!registered;
    byId('accountInfo').textContent=registered?`Signed in as ${user.email||user.displayName||'Explorer'}. Your account Trail stays separate from device-only choices.`:'Sign in to keep your Portal Trail across devices. Device-only choices stay separate until you choose to copy them.';
    run(()=>controller.changeOwner(registered?user.uid:null));
  }));
}).catch(()=>{byId('accountInfo').textContent='Sign-in is unavailable offline. You can still save places and investigate on this device.';});
