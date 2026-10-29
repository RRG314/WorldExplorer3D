import {readMyRacingRoutes,commitRacingRoute,reviewRacingRoutes} from './service-client.js';
import {createRaceRouteMap,raceDisciplineLabel} from './course-preview.js';

const text=(tag,value)=>Object.assign(document.createElement(tag),{textContent:value});
const button=(label,action)=>Object.assign(text('button',label),{type:'button',onclick:action});
const statusLabel=r=>({draft:r.tested?'Test complete · ready to submit':'Draft · timed test required',review_required:'Awaiting review',approved:'Published',rejected:'Changes requested'})[r.status]||'Unavailable';
export function racingRouteWorldUrl(r){const u=new URL('/app/',location.href);u.search=new URLSearchParams({loc:'custom',lat:r.anchor.lat,lon:r.anchor.lon,lname:r.locationLabel,launch:'earth',mode:'walking'});return u.href;}
// Mounted by the existing Account contribution/review owner; no auth observer,
// frame loop, renderer or second moderation authority is installed here.
export function mountRacingWorkspace(host,{ownerUid,review=false,api={readMyRacingRoutes,commitRacingRoute,reviewRacingRoutes},isCurrent=()=>true}={}){
 const abort=new AbortController();let disposed=false,revision=0,busy=false,current=null,nextCursor=null;
 const active=()=>!disposed&&isCurrent();host.classList.add('racing-workspace');
 const style=document.createElement('style');style.textContent='.racing-workspace nav{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.racing-workspace button,.racing-workspace select,.racing-workspace textarea{font:inherit;min-height:44px;padding:8px 12px;border:1px solid #53606a;border-radius:4px;background:#111e27;color:inherit}.racing-workspace a{color:var(--wx-accent,#eec96b)}.racing-workspace [data-racing-actions]>a{display:inline-flex;align-items:center;min-height:44px;padding:0 8px}.racing-workspace button{cursor:pointer}.racing-workspace button:disabled{opacity:.5}.racing-workspace [data-racing-layout]{display:grid;grid-template-columns:minmax(200px,1fr) minmax(0,2fr);gap:20px}.racing-workspace [data-racing-list]{list-style:none;padding:0}.racing-workspace [data-racing-list] button{width:100%;text-align:left;margin-bottom:6px}.racing-workspace [aria-current=true]{border-color:#eec96b}.racing-workspace svg{width:100%;max-height:360px;background:#102027}.racing-workspace textarea{width:100%;box-sizing:border-box}.racing-workspace [role=status]{min-height:24px}.racing-workspace [data-racing-actions]{background:#071018;padding:8px 0}@media(max-width:700px){.racing-workspace [data-racing-layout]{display:block}}';
 const nav=document.createElement('nav'),filter=document.createElement('select');filter.setAttribute('aria-label','Route review status');
 for(const [id,label]of [['review_required','Awaiting review'],['approved','Published'],['rejected','Changes requested']])filter.append(new Option(label,id));
 const refresh=button('Refresh',()=>load()),more=button('Next page',()=>load(nextCursor));more.hidden=true;
 if(review)nav.append(filter);nav.append(refresh,more);
 const status=text('p','Loading routes…');status.setAttribute('role','status');
 const layout=document.createElement('div');layout.dataset.racingLayout='';const list=text('ul','');list.dataset.racingList='';const detail=document.createElement('section');detail.setAttribute('aria-label','Selected route');layout.append(list,detail);
 host.replaceChildren(style,text('p',review?'Review the route map, source credits and timed test. Approval makes this version available for shared racing.':'Your shared routes. A timed server test is required before review. Saved device-only routes stay in the game.'),nav,status,layout);
 function select(r){
  if(busy||!active())return;current=r;detail.replaceChildren(text('h3',r.name||r.course?.name),text('p',statusLabel(r)));
  list.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',String(b.dataset.routeId===r.id)));
  if(r.reviewNote)detail.append(text('p',`Review note: ${r.reviewNote}`));
  const anchor=r.anchor||r.course?.anchor,locationLabel=r.locationLabel||r.course?.locationLabel;
  if(r.course){const c=r.course;detail.append(text('p',`${locationLabel} · ${(c.lengthMeters/1000).toFixed(2)} km · ${raceDisciplineLabel(c.discipline)} · ${c.laps} lap${c.laps===1?'':'s'}`));
   const map=createRaceRouteMap({roads:c.segments.map(s=>({a:s.a,b:s.b})),course:c,locationLabel});if(map)detail.append(map);
   detail.append(text('p',r.qualification?`Timed test: ${(r.qualification.timeMs/1000).toFixed(2)} s · ${r.qualification.physicsVersion}`:'No accepted timed test.'));
   const credits=text('p','Geographic sources: ');for(const source of r.credits||[]){const a=text('a',`${source.label} (${source.license}) `);try{const u=new URL(source.url);if(u.protocol!=='https:')continue;a.href=u.href;}catch{continue;}a.target='_blank';a.rel='noopener';credits.append(a);}detail.append(credits);
  }
  const actions=document.createElement('nav');actions.dataset.racingActions='';
  const open=text('a','Open location in game');open.href=racingRouteWorldUrl({anchor,locationLabel});open.target='_blank';open.rel='noopener';actions.append(open);
  if(review){const note=document.createElement('textarea');note.maxLength=400;note.placeholder='Explain any changes needed';note.setAttribute('aria-label','Review note');detail.append(note);
   if(r.status==='review_required')actions.append(button('Approve route',()=>decide(r,{decision:'approved',note:note.value})));
   if(['review_required','approved'].includes(r.status))actions.append(button(r.status==='approved'?'Remove from public racing':'Request changes',()=>{if(note.value.trim().length<3){status.textContent='Add a review note explaining what needs changing.';note.focus();return;}void decide(r,{decision:'rejected',note:note.value});}));
  }else{
   if(['draft','rejected'].includes(r.status)&&r.tested)actions.append(button('Submit for review',()=>decide(r,{action:'submit'})));
   if(['review_required','approved','rejected'].includes(r.status))actions.append(button('Withdraw to draft',()=>decide(r,{action:'withdraw'})));
   if(!r.tested&&r.status!=='approved')detail.append(text('p','Open this location, join a room and select your route in Racing. Finish the timed test, then submit it here.'));
  }
  detail.append(actions);
 }
 async function decide(r,command){
  if(busy||!active()||current!==r)return;busy=true;host.querySelectorAll('button,select').forEach(b=>b.disabled=true);status.textContent='Saving route status…';
  try{const result=review?await api.reviewRacingRoutes(ownerUid,{id:r.id,revision:r.revision,...command},abort.signal):await api.commitRacingRoute(ownerUid,{id:r.id,revision:r.revision,...command},abort.signal);
   if(!active())return;Object.assign(r,result);const row=list.querySelector(`[data-route-id="${r.id}"]`);if(row)row.textContent=`${r.name||r.course?.name} · ${statusLabel(r)}`;if(command.note)r.reviewNote=command.note;status.textContent=result.status==='approved'?'Published. Players can select this route when its reviewed roads are loaded.':result.status==='review_required'?'Submitted for review.':'Route status saved.';
  }catch(error){if(active())status.textContent=`Not saved: ${error.message}`;}
  finally{busy=false;if(active()){host.querySelectorAll('button,select').forEach(b=>b.disabled=false);select(r);}}
 }
 async function load(cursor){
  if(busy||!active())return;const token=++revision;current=null;list.replaceChildren();detail.replaceChildren();status.textContent='Loading routes…';
  try{const result=review?await api.reviewRacingRoutes(ownerUid,{action:'list',status:filter.value,...(cursor?{cursor}:{})},abort.signal):await api.readMyRacingRoutes(ownerUid,abort.signal);
   if(!active()||token!==revision)return;nextCursor=result.nextCursor;more.hidden=!nextCursor;
   for(const r of result.items||[]){const li=document.createElement('li'),b=button(`${r.name||r.course?.name} · ${statusLabel(r)}`,()=>select(r));b.dataset.routeId=r.id;li.append(b);list.append(li);}
   status.textContent=result.items?.length?`${result.items.length} route${result.items.length===1?'':'s'}${cursor?' · next page':''}`:'No routes in this list.';if(result.items?.length)select(result.items[0]);
  }catch(error){if(active()&&token===revision)status.textContent=`Routes could not load: ${error.message}`;}
 }
 filter.onchange=()=>load();void load();return()=>{disposed=true;revision++;abort.abort();host.replaceChildren();host.classList.remove('racing-workspace');};
}
