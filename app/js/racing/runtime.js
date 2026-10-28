import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {captureEnvironmentSession} from '../session-coordinator.js?v=2';
import {resolveControlState} from '../transport/control-state.js';
import {collectRaceDistrict,recommendRaceCourses} from './world-course-source.js';
import {createRaceCourse,shortestRacePath} from './course-rules.js';
import {raceDistrictFingerprint,raceCourseReference,restoreRaceCourse,raceCourseKey} from './course-library.js';
import {createRaceVehicleProfile} from './vehicle-controller.js';
import {createPracticeRaceController} from './road-activity-controller.js';
import {prepareRacePresentation} from './presentation.js';
import {listStoredActivities,saveStoredActivity} from '../activity-discovery/library.js?v=3';
import {createActivityCompletionStore} from '../activity-discovery/completion.js';
import {personalVehicleById,personalVehicleIdentity} from '../transport/vehicle-garage-rules.js';
import {getCurrentUser} from '../../../js/auth-ui.js?v=56';
import {getCurrentRoom} from '../multiplayer/rooms.js?v=67';
const formatTime=ms=>Number.isFinite(ms)?`${Math.floor(ms/60000)}:${((ms%60000)/1000).toFixed(2).padStart(5,'0')}`:'—';
const messages={no_qualified_racing_roads:'No supported racing district is ready here. Continue loading nearby roads or choose another destination.',
 no_qualified_race_route:'These roads do not yet form a safe race route. Choose another location or create a route on the map.',race_route_length:'Use a connected route between 200 m and 8 km.',
 race_grid_has_no_clearance:'Start on a longer, wider straight so the grid fits.',race_turn_too_sharp:'That route contains a turn too tight for the starting grid. Choose another approach.',
 disconnected_race_route:'Those junctions are not connected by a qualified driving route.',race_circuit_not_closed:'Add a route back to the start for a circuit.',
 race_sprint_is_closed:'Use Circuit for a closed route, or finish at a different junction.',race_roads_changed_requalify_route:'Road data has changed. Re-create this route on the current qualified roads.',
 race_vehicle_exceeds_course_envelope:'This course supports cars and vans up to 6.5 m long. Your larger vehicle stays available in Free Roam.',race_vehicle_needs_repair:'Repair your car to at least 30% condition before racing.',race_grid_no_longer_clear:'The start grid is no longer clear. Choose another route.',
 race_world_changed:'The location changed. Open Racing again in the current world.',activity_library_save_failed:'This device could not save the route. Free some storage and retry.'};
const message=error=>messages[error?.message]||'This race could not complete. Your garage and exploration progress are safe. Try again.';
export function createRacingRuntime(c,{closeMenus=()=>{},requestWorldFocus=()=>{},chooseDestination=()=>{}}={}) {
 let routeDiagnostics=null;
 let dialog=null,hud=null,loadScope=null,loadPublication=null,raceScope=null,controller=null,presentation=null,district=null,graph=null,fingerprint='',events=[],selected=0;
 let recordOwner='',records=null;
 let creatorPath=[],creatorNodes=[],customCourse=null,returnFocus=null,busy=false,recordId='',lastUiAt=-Infinity,saving=false,lastResult=null,lastResultCourse=null,lastResultOwner='',resultSaved=false;
 function currentRecords() {
  const uid=getCurrentUser()?.uid||'';if(records&&recordOwner===uid)return records;
  recordOwner=uid;
  const owner=uid,namespace=uid?`:account:${uid}`:':guest-racing';
  records=createActivityCompletionStore({storage:()=>({getItem:key=>localStorage.getItem(key+namespace),setItem:(key,value)=>localStorage.setItem(key+namespace,value)}),
   recordEvent:event=>{if((getCurrentUser()?.uid||'')!==owner)throw Error('race_account_changed');return c.recordExplorerEvent?.(event);},
   lookupEvents:ids=>c.getExplorerEventsById?.(ids),context:()=>({environment:'EARTH',locationSnapshot:{...(c.worldPublication?.location||c.LOC||{}),name:district?.locationLabel||''},regionLabel:district?.locationLabel||'Earth road race'})});
  return records;
 }
 const el=(selector)=>dialog.querySelector(selector),status=text=>{el('[data-race-status]').textContent=text;};
 function ensure() {
  if(dialog)return;dialog=document.createElement('dialog');dialog.id='racingHub';dialog.className='racing-hub';dialog.setAttribute('aria-labelledby','racingHeading');
  dialog.innerHTML=`<header><div><p class="racing-eyebrow">WORLD EXPLORER · OPEN RIVALS</p><h2 id="racingHeading" data-race-heading>Road racing</h2></div><button type="button" data-race-close aria-label="Close racing">Close</button></header>
   <p data-race-location></p><div class="racing-toolbar"><button type="button" data-race-destination>Choose destination</button><button type="button" data-race-garage>My garage</button><button type="button" data-race-refresh>Refresh roads</button></div>
   <p role="status" aria-live="polite" data-race-status></p>
   <div class="racing-layout"><nav aria-label="Road events" data-race-events></nav><section><div class="racing-map" data-race-map></div>
   <h3 data-race-name>Qualifying the loaded roads…</h3><p data-race-detail></p><p data-race-record></p>
   <div class="racing-options"><label>Opponents<select data-race-rivals><option value="2">Two rivals</option><option value="1">One rival</option><option value="0">Solo practice</option></select></label>
   <label>Difficulty<select data-race-difficulty><option value=".45">Explorer</option><option value=".65" selected>Club</option><option value=".85">Expert</option></select></label></div>
   <details data-race-creator><summary>Create a mapped-road route</summary><p>Choose a start junction, then add connected destinations. Roads, heights and driving direction are retained.</p>
   <label>Junction<select data-race-node aria-label="Route junction"></select></label><button type="button" data-race-add>Add junction</button><button type="button" data-race-undo>Undo last</button><button type="button" data-race-reset>Clear route</button>
   <p data-race-waypoints></p><label>Route name<input data-race-route-name maxlength="100" placeholder="My city run"></label>
   <label>Discipline<select data-race-discipline><option value="sprint">Sprint</option><option value="circuit">Circuit · 2 laps</option><option value="time-trial">Time trial</option></select></label>
   <button type="button" data-race-test>Test this route</button><button type="button" data-race-save>Save route</button><p data-race-saved></p></details>
   </section></div><footer class="racing-start-bar"><button class="racing-primary" type="button" data-race-start disabled>Start practice</button>
   <p class="racing-note">Closed course · ghost competitors · standard road class, boosts off. Practice records are kept in your Journal.</p></footer><section data-race-results hidden aria-labelledby="racingResultHeading"><h3 id="racingResultHeading" tabindex="-1">Race results</h3><ol data-race-order></ol><p data-race-save-state role="status"></p>
   <button type="button" data-race-retry-save hidden>Retry Journal save</button><button type="button" data-race-again>Race again</button><button type="button" data-race-explore>Return to exploration</button></section>`;
  document.body.append(dialog);
  hud=document.createElement('section');hud.id='roadRaceHud';hud.className='road-race-hud';hud.hidden=true;hud.setAttribute('aria-label','Race progress');
  hud.innerHTML='<p data-race-phase aria-live="polite"></p><strong data-race-clock></strong><span data-race-progress></span><button type="button" data-race-leave>Leave race</button>';document.body.append(hud);
  dialog.querySelector('[data-race-close]').onclick=()=>dialog.close();
  dialog.addEventListener('keydown',event=>{if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();dialog.close();}});
  dialog.addEventListener('close',()=>{if(busy&&!controller){loadScope?.dispose('menu_closed');if(raceScope)stop('menu_closed');busy=false;}if(lastResult&&controller)stop('results_closed');c.setPauseReason?.('racing-menu',false);c.clearControlInputState?.('racing-menu-closed');if(controller)requestWorldFocus();else returnFocus?.focus?.({preventScroll:true});});
  el('[data-race-destination]').onclick=()=>{stop('destination');dialog.close();chooseDestination();};
  el('[data-race-garage]').onclick=()=>{if(controller){status('Leave the race before changing your car.');return;}dialog.close();c.openVehicleGarage?.();};
  el('[data-race-refresh]').onclick=()=>void qualify();
  el('[data-race-events]').onclick=event=>{const button=event.target.closest('[data-event-index]');if(button&&!busy){selected=Number(button.dataset.eventIndex);customCourse=null;render();}};
  el('[data-race-start]').onclick=()=>void begin(customCourse||events[selected]);
  el('[data-race-add]').onclick=()=>addJunction(Number(el('[data-race-node]').value));
  el('[data-race-undo]').onclick=()=>{creatorNodes.pop();rebuildCreator();};el('[data-race-reset]').onclick=()=>{creatorNodes=[];rebuildCreator();};
  el('[data-race-test]').onclick=()=>{try{const course=buildCustom();customCourse=course;render();void begin(course);}catch(error){status(message(error));}};
  el('[data-race-save]').onclick=()=>void saveRoute();
  hud.querySelector('[data-race-leave]').onclick=()=>{stop('left_race');void open();};
  el('[data-race-explore]').onclick=()=>{stop('return_to_exploration');dialog.close();requestWorldFocus();};
  el('[data-race-again]').onclick=()=>void begin(lastResultCourse||customCourse||events[selected]);
  el('[data-race-retry-save]').onclick=()=>void persistResult();
 }
 async function open() {
  ensure();if(!controller&&resultSaved){lastResult=null;lastResultCourse=null;}returnFocus=document.activeElement;closeMenus();c.clearControlInputState?.('racing-menu');
  c.setPauseReason?.('racing-menu',true);if(!dialog.open)dialog.showModal();
  if(lastResult){renderResults();return;}
  if(controller){render();return;}
  if(district&&loadScope?.isActive()&&c.worldPublication===loadPublication){render();return;}
  await qualify();
 }
 async function qualify() {
  if(busy)return;stop('roads_refresh');loadScope?.dispose('replaced');district=null;graph=null;events=[];customCourse=null;creatorNodes=[];creatorPath=[];lastResult=null;
  const scope=createLifecycleScope('race-district'),session=captureEnvironmentSession(),publication=c.worldPublication;loadScope=scope;
  // The captured publication belongs to this load scope; no late world may adopt it.
  const current=()=>scope.isActive()&&session.isCurrent()&&c.worldPublication===publication;
  scope.listen(session.signal,'abort',()=>{scope.dispose('world_changed');if(loadScope===scope){district=null;status('Location changed. Open Racing in the new world.');}});
  busy=true;status('Checking published roads, clearance and terrain…');render();
  try {
   if(!c.gameStarted||resolveControlState(c).frame!=='surface')throw Error('race_world_changed');
   const facts=await collectRaceDistrict(c,{current});const derived=recommendRaceCourses(facts),hash=await raceDistrictFingerprint(facts);
   if(!current())throw Error('race_world_changed');district=facts;graph=derived.graph;events=derived.events;routeDiagnostics=derived.diagnostics;fingerprint=hash;selected=0;
   for(const saved of listStoredActivities().filter(a=>a.raceRoute&&a.locationLabel===facts.locationLabel))try{events.push(restoreRaceCourse(saved.raceRoute,district,graph,hash));}catch{/* Kept in the library for explicit recovery; never silently remap it. */}
   const nodeSelect=el('[data-race-node]');
   const labels=new Map();for(const road of facts.roads)if(road.label){
    const edge=graph.edges.find(e=>e.sourceId===road.sourceId);if(edge){for(const id of [edge.from,edge.to]){if(!labels.has(id))labels.set(id,new Set());labels.get(id).add(road.label);}}
   }
   nodeSelect.replaceChildren(...graph.nodes.map(n=>new Option(`${[...(labels.get(n.id)||[])].slice(0,2).join(' / ')||'Mapped junction'} · ${n.id+1}`,String(n.id))));
   status(derived.events.length?`${facts.roads.length} road spans qualified. Choose an event or create your own route.`:'The mapped roads are ready. Create a route using the qualified junctions below, or choose another destination.');
   // Store the identity on the local scope projection, not the world owner.
   loadPublication=publication;
  } catch(error){if(current())status(message(error));}
  finally {if(loadScope===scope){busy=false;render();}}
 }
 function map(course=customCourse||events[selected]) {
  const host=el('[data-race-map]');host.replaceChildren();if(!graph)return;
  const points=graph.nodes,minX=Math.min(...points.map(p=>p.x))-12,minZ=Math.min(...points.map(p=>p.z))-12,
   width=Math.max(...points.map(p=>p.x))-minX+12,height=Math.max(...points.map(p=>p.z))-minZ+12;
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`${minX} ${minZ} ${width} ${height}`);
  svg.setAttribute('role','img');svg.setAttribute('aria-label',`${district.locationLabel} qualified mapped roads and selected route`);
  const path=(pts,color,lineWidth)=>{const poly=document.createElementNS(ns,'polyline');poly.setAttribute('points',pts.map(p=>`${p.x},${p.z}`).join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke',color);poly.setAttribute('stroke-width',lineWidth);poly.setAttribute('stroke-linecap','round');svg.append(poly);};
  for(const road of district.roads)path([road.a,road.b],'#405662',2);
  if(course)path(course.points,'#b7f568',3.5);
  if(creatorPath.length)for(const id of creatorPath){const e=graph.edges.find(edge=>edge.id===id);path([graph.nodes[e.from],graph.nodes[e.to]],'#79c8ef',3);}
  for(const [i,id]of creatorNodes.entries()){const point=graph.nodes[id],circle=document.createElementNS(ns,'circle');circle.setAttribute('cx',point.x);circle.setAttribute('cy',point.z);circle.setAttribute('r',5);circle.setAttribute('fill',i?'#79c8ef':'#fff');svg.append(circle);}
  svg.addEventListener('click',event=>{if(!el('[data-race-creator]').open||busy)return;const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;const at=p.matrixTransform(svg.getScreenCTM().inverse());
   const node=graph.nodes.reduce((best,n)=>Math.hypot(n.x-at.x,n.z-at.y)<Math.hypot(best.x-at.x,best.z-at.y)?n:best);addJunction(node.id);});host.append(svg);
 }
 function render() {
  if(!dialog)return;dialog.dataset.raceView='events';el('[data-race-heading]').textContent='Road racing';el('[data-race-location]').textContent=district?district.locationLabel:'Current selected location';
  const list=el('[data-race-events]');list.replaceChildren();events.forEach((course,i)=>{const b=document.createElement('button');b.type='button';b.dataset.eventIndex=i;b.setAttribute('aria-pressed',String(!customCourse&&i===selected));
   const strong=document.createElement('strong'),small=document.createElement('span');strong.textContent=course.name;small.textContent=`${course.discipline} · ${(course.lengthMeters/1000).toFixed(2)} km${course.laps>1?` · ${course.laps} laps`:''}`;b.append(strong,small);list.append(b);});
  const course=customCourse||events[selected];el('[data-race-name]').textContent=course?.name||(busy?'Qualifying loaded roads…':'No qualified event available');
  const vehicle=personalVehicleById(c.car?.personalVehicleId||'bmw_e34');el('[data-race-detail]').textContent=course?`${course.discipline} · ${(course.lengthMeters/1000).toFixed(2)} km · ${course.laps} lap${course.laps===1?'':'s'} · ${vehicle?.label||'Personal vehicle'}`:'';
  el('[data-race-start]').disabled=busy||!course;el('[data-race-rivals]').disabled=course?.discipline==='time-trial';map(course);
  el('[data-race-results]').hidden=!lastResult;el('[data-race-creator]').hidden=!graph;
  if(course)void raceCourseKey(course).then(id=>{if((customCourse||events[selected])!==course)return;const record=currentRecords().get(id);el('[data-race-record]').textContent=record?.bestTimeMs?`Practice personal best · ${formatTime(record.bestTimeMs)}`:'Set your first practice record.';});
 }
 function addJunction(id) {try{if(!graph?.nodes[id]||creatorNodes.at(-1)===id)return;if(creatorNodes.length>=30)throw Error('invalid_race_route');creatorNodes.push(id);rebuildCreator(true);}catch(error){creatorNodes.pop();status(message(error));}}
 function rebuildCreator(throwFailure=false) {
  creatorPath=[];try{for(let i=1;i<creatorNodes.length;i++)creatorPath.push(...shortestRacePath(graph,creatorNodes[i-1],creatorNodes[i]));
   el('[data-race-waypoints]').textContent=creatorNodes.length?creatorNodes.map(id=>`Junction ${id+1}`).join(' → '):'Choose a start junction.';customCourse=null;map();
  }catch(error){if(throwFailure)throw error;status(message(error));}
 }
 function buildCustom() {
  if(!district||!creatorPath.length)throw Error('race_route_length');const discipline=el('[data-race-discipline]').value;
  return createRaceCourse(graph,creatorPath,{locationId:district.locationId,locationLabel:district.locationLabel,anchor:district.anchor,
   name:el('[data-race-route-name]').value.trim()||`${district.locationLabel} · Your route`,discipline,laps:discipline==='circuit'?2:1,participants:discipline==='time-trial'?1:4});
 }
 async function saveRoute() {
  try {const course=buildCustom(),reference=raceCourseReference(course,fingerprint),id=await raceCourseKey(course);
   saveStoredActivity({id:`route-${id}`,templateId:'road-race',title:course.name,description:'Qualified mapped-road race',locationLabel:district.locationLabel,
    creatorId:getCurrentUser()?.uid||'',visibility:'private',status:'draft',raceRoute:reference,anchors:[],center:course.points[0]});
   customCourse=course;events.push(course);selected=events.length-1;render();status('Route saved on this device. Test it before sharing.');
  }catch(error){status(message(error));}
 }
 async function begin(course) {
  if(busy||!course)return;if(lastResult&&!resultSaved){el('[data-race-save-state]').textContent='Save your previous result before starting another run.';el('[data-race-retry-save]').hidden=false;return;}busy=true;status('Preparing your car and rivals…');
  stop('race_replaced');const scope=createLifecycleScope('racing-run'),session=captureEnvironmentSession(),request=new AbortController(),publication=c.worldPublication;
  raceScope=scope;scope.defer(()=>request.abort(),'preparation');scope.listen(session.signal,'abort',()=>stop('world_changed'));
  const uid=getCurrentUser()?.uid||'practice-player',current=()=>scope.isActive()&&session.isCurrent()&&publication===c.worldPublication&&(getCurrentUser()?.uid||'practice-player')===uid;
  try {
   if(getCurrentRoom())throw Error('practice_leave_room_first');
   const control=resolveControlState(c);if(control.frame!=='surface'||!['ground','driver'].includes(control.occupancy))throw Error('race_vehicle_or_world_changed');
   if(!c.car.personalVehicleId){if(c.setTravelMode?.('drive',{source:'racing'})!=='drive')throw Error('race_vehicle_or_world_changed');}
   if(Math.abs(Number(c.car.speed||0))>4)throw Error('stop_before_racing');
   const vehicleId=c.car.personalVehicleId||'bmw_e34',definition=personalVehicleById(vehicleId),garage=c.getVehicleGarage?.();
   if(!definition||!garage?.vehicles[vehicleId])throw Error('race_owned_vehicle_required');
   if(resolveControlState(c).controller!=='drive'&&c.setTravelMode?.('drive',{source:'racing'})!=='drive')throw Error('race_vehicle_or_world_changed');
   const levels=c.vehicleUpgradeStore?.levels({vehicleIdentity:personalVehicleIdentity(vehicleId)})||{};
   const profile=createRaceVehicleProfile(vehicleId,{condition:c.car.condition??garage.vehicles[vehicleId].condition,levels});
   const count=course.discipline==='time-trial'?0:Math.min(course.participants-1,Number(el('[data-race-rivals]').value));
   const rivals=Array.from({length:count},(_,i)=>({label:['Mara · Coastline Crew','Jules · City Current','Rin · Night Survey'][i],
    difficulty:Number(el('[data-race-difficulty]').value),profile:createRaceVehicleProfile(['golf_ii','datsun_280z','delorean'][i])}));
   recordId=await raceCourseKey(course);if(!currentRecords().canStart(recordId))throw Error('race_previous_result_unsaved');
   const prepared=await prepareRacePresentation(THREE,c,course,rivals,{signal:request.signal,current});scope.defer(()=>prepared.dispose(),'race-visuals');
   if(!current())throw Error('race_world_changed');
   const run=createPracticeRaceController({context:c,course,profile,rivals,label:'You',uid,onComplete:result=>complete(result),isAdmitted:current});
   scope.defer(()=>{run.stop('race_scope_closed');if(c.roadRaceController===run)c.roadRaceController=null;},'road-controller');
   run.start();controller=run;c.roadRaceController=run;presentation=prepared;prepared.mount();
   const population=c.livingWorldRuntime?.population;population?.setRaceClosure(course);scope.defer(()=>population?.setRaceClosure(null),'civilian-course');
   scope.defer(c.setUrbanRaceClosure?.(course),'urban-course');
   lastResult=null;lastResultCourse=null;resultSaved=false;el('[data-race-results]').hidden=true;dialog.dataset.raceView='events';status('');dialog.close();hud.hidden=false;c.clearControlInputState?.('race_countdown');requestWorldFocus();
   update(0);
  }catch(error){if(raceScope===scope){stop('race_start_failed');status(error.message==='practice_leave_room_first'?'Leave the shared exploration room before starting private practice.':error.message==='stop_before_racing'?'Stop your car before entering a race.':error.message==='race_previous_result_unsaved'?'Retry saving your previous race result before starting another run.':message(error));}}
  finally {busy=false;}
 }
 function complete(result) {lastResult=result;lastResultCourse=controller.course;lastResultOwner=getCurrentUser()?.uid||'';resultSaved=false;status('');hud.hidden=true;c.setPauseReason?.('racing-menu',true);if(!dialog.open)dialog.showModal();renderResults();el('#racingResultHeading').focus({preventScroll:true});void persistResult();}
 function renderResults() {
  if(!lastResult)return;dialog.dataset.raceView='results';el('[data-race-heading]').textContent='Race results';el('#racingResultHeading').textContent=lastResult.courseName;el('[data-race-results]').hidden=false;const list=el('[data-race-order]');list.replaceChildren();
  for(const player of lastResult.players){const li=document.createElement('li');li.textContent=`${player.label} · ${player.dnf?'Did not finish':formatTime(player.progress?.elapsedMs)}${player.ai?' · AI rival':''}`;list.append(li);}
  el('[data-race-save-state]').textContent=resultSaved?'Practice record saved in your Journal.':'Device practice result. Your Journal save needs to finish.';el('[data-race-retry-save]').hidden=resultSaved||saving;
 }
 async function persistResult() {
  if(!lastResult||saving)return;
  if((getCurrentUser()?.uid||'')!==lastResultOwner){el('[data-race-save-state]').textContent='Sign back into the account that ran this race to save its result.';el('[data-race-retry-save]').hidden=false;return;}
  saving=true;const result=lastResult,player=result.players.find(p=>!p.ai),id=recordId,course=lastResultCourse;
  el('[data-race-save-state]').textContent='Saving your practice record in the Journal…';el('[data-race-retry-save]').hidden=true;
  try {if(!player?.progress?.finished){resultSaved=true;el('[data-race-save-state]').textContent='Run ended without a finishing time. Your exploration progress is preserved.';return;}
   const saved=await currentRecords().complete({id,title:course.name,sourceType:'creator'},player.progress.elapsedMs,player.pose,
    {pointsFirst:0,detail:`Practice road race · ${course.locationLabel} · ${formatTime(player.progress.elapsedMs)}`,metadata:{resultOwner:'game-result',raceVerified:false,discipline:course.discipline,position:player.position}});
   if(lastResult!==result)return;resultSaved=saved;el('[data-race-save-state]').textContent=saved?'Practice record saved in your Journal.':'The result needs a Journal save. Retry before starting another run.';el('[data-race-retry-save]').hidden=saved;
  }finally{saving=false;}
 }
 function update(dt) {
  if(!controller)return;if(!controller.isCurrent()){stop('race_vehicle_or_world_changed');return;}
  const snapshot=controller.snapshot();presentation?.update(snapshot,controller.uid,dt);
  if(snapshot.serverAtMs-lastUiAt<100&&snapshot.phase==='running')return;lastUiAt=snapshot.serverAtMs;
  const player=snapshot.players.find(p=>p.uid===controller.uid),left=Math.max(0,(snapshot.startAtMs||0)-snapshot.serverAtMs);
  hud.querySelector('[data-race-phase]').textContent=snapshot.phase==='countdown'?`Ready · ${Math.max(1,Math.ceil(left/1000))}`:player?.progress?.finished?'Finished · waiting for rivals':`${player?.position||1} / ${snapshot.players.length}`;
  hud.querySelector('[data-race-clock]').textContent=formatTime(player?.progress?.elapsedMs??Math.max(0,snapshot.serverAtMs-(snapshot.startAtMs||0)));
  hud.querySelector('[data-race-progress]').textContent=`Lap ${player?.progress?.lap||1}/${controller.course.laps} · Gate ${Math.min((player?.progress?.nextGate||0)+1,controller.course.gates.length)}/${controller.course.gates.length}`;
  if(snapshot.phase==='cancelled') {stop(snapshot.reason);c.showToast?.('Race ended. Normal exploration is available.');}
 }
 function stop(reason='racing_closed') {
  if(controller&&c.roadRaceController===controller)c.roadRaceController=null;
  controller?.stop(reason);controller=null;presentation=null;raceScope?.dispose(reason);raceScope=null;if(hud)hud.hidden=true;
  lastUiAt=-Infinity;
 }
 function stopAll(reason) {
  stop(reason);loadScope?.dispose(reason);loadScope=null;loadPublication=null;district=null;graph=null;
  busy=false;dialog?.close();c.setPauseReason?.('racing-menu',false);
 }
 return {open,update,stop:stopAll,snapshot:()=>controller?.snapshot()||{phase:'idle',qualification:district?.diagnostics||null,routes:routeDiagnostics,roadLengths:district?.roads.map(r=>Math.hypot(r.b.x-r.a.x,r.b.z-r.a.z)*district.metersPerUnit).sort((a,b)=>b-a).slice(0,12)||[],events:events.map(e=>({name:e.name,discipline:e.discipline,lengthMeters:e.lengthMeters})),fingerprint}};
}
