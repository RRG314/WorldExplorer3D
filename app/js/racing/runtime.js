import {createLifecycleScope} from '../runtime/lifecycle-scope.js?v=2';
import {captureEnvironmentSession} from '../session-coordinator.js?v=2';
import {resolveControlState} from '../transport/control-state.js';
import {rallyPaceNoteText} from './rally-rules.js';
import {collectRaceDistrict,recommendRaceCourses} from './world-course-source.js';
import {buildVenueRaceCourses} from './venue-courses.js';
import {raceMaximumDurationMs} from './session-limits.js';
import {createRaceCourse,shortestRacePath,buildRaceRoadGraph,RACE_MAX_ROUTE_EDGES} from './course-rules.js';
import {raceDistrictFingerprint,raceCourseReference,restoreRaceCourse,raceCourseKey} from './course-library.js';
import {createRaceVehicleProfile} from './vehicle-controller.js';
import {createPracticeRaceController,canOwnRoadRace} from './road-activity-controller.js';
import {prepareRacePresentation} from './presentation.js';
import {listStoredActivities,saveStoredActivity} from '../activity-discovery/library.js?v=3';
import {createActivityCompletionStore} from '../activity-discovery/completion.js';
import {personalVehicleById,personalVehicleIdentity} from '../transport/vehicle-garage-rules.js';
import {getCurrentUser} from '../../../js/auth-ui.js?v=56';
import {getCurrentRoom} from '../multiplayer/rooms.js?v=67';
import {racePracticeRecordKey,racePhysicsVersion,raceRecordConfiguration,raceCompetitiveRecordConfiguration} from './record-rules.js';
import {racingPracticeStorage} from './practice-storage.js';
import {racingCollectionSummary,racePracticeFeedback,racePracticeMetadata,raceOnlineMetadata,raceQualificationMetadata,raceRoomMetadata} from './driver-progress.js';
import {carSpeedToMph} from '../physics/vehicle-speed-units.js?v=2';
import {createRaceLocationPreview} from './location-preview.js';
import {createRaceRouteMap,raceCourseDisplayName,raceDisciplineLabel} from './course-preview.js';
import {createRaceConnection} from './network-client.js';
import {createNetworkRaceController,raceNetworkProfile} from './network-controller.js';
import {racingServiceOptions,readRacingCatalog,commitRacingRoute} from './service-client.js';
import {assertRaceCourseInDistrict,reconstructPublishedRace,rebaseRaceReference,canonicalRaceDistrict} from './publication-rules.js';
import {collectGroundRaceDistrict} from './ground-course-source.js';
import {cleanGroundRaceLayout,recordedGroundRaceDraft,recordedRoadRacePath,recordRaceRoadSpan} from './route-draft.js';
import {VEHICLE_ROOT_TO_GROUND_METERS} from '../engine/vehicle-catalog.js?v=6';
import {releaseRoadRaceMotion} from '../physics/road-race-delegate.js';
const formatTime=ms=>Number.isFinite(ms)?`${Math.floor(ms/60000)}:${((ms%60000)/1000).toFixed(2).padStart(5,'0')}`:'—';
const messages={race_invalid_ground_draft:'Place 2–80 anchors on the loaded ground, with at least three for a loop.',race_ground_room_only:'Ground tracks can be shared with your room. Public rankings require reviewed road courses.',race_ground_rough:'This ground is too uneven for a clean track. Move the anchors to smoother ground.',race_ground_grade:'This corridor is too steep. Move the anchors to gentler ground.',race_ground_water:'The track crosses water. Move the anchors onto dry ground.',race_ground_blocked:'A building, tree or solid obstacle blocks the corridor. Move the anchors or use a narrower track.',race_ground_unsupported:'The ground is unavailable here. Keep the track on the loaded terrain.',race_anchors_too_close:'Space corner anchors at least 12 m apart.',race_route_self_crossing:'The track crosses itself. Move or undo a corner anchor.',race_invalid_venue_extent:'The complete venue is not ready yet. Let nearby roads finish loading, then refresh roads.',race_venue_timing_line_pending:'This circuit is under construction. Racing opens after its timing line and full course are verified. You can continue exploring here.',race_venue_surface_incomplete:'The full circuit surface could not be verified. Return to exploration or try this location again.',race_venue_direction_unavailable:'This circuit’s driving direction could not be verified. Return to exploration.',no_qualified_racing_roads:'No supported racing district is ready here. Continue loading nearby roads or choose another destination.',
 no_qualified_race_route:'These roads do not yet form a safe race route. Choose another location or create a route on the map.',race_route_length:'Use a connected route between 200 m and 8 km.',
 race_grid_has_no_clearance:'Start on a longer, wider straight so the grid fits.',race_turn_too_sharp:'That route contains a turn too tight for the starting grid. Choose another approach.',
 disconnected_race_route:'Those junctions are not connected by a qualified driving route.',race_circuit_not_closed:'Add a route back to the start for a circuit.',
 race_sprint_is_closed:'Use Circuit for a closed route, or finish at a different junction.',race_roads_changed_requalify_route:'Road data has changed. Re-create this route on the current qualified roads.',
 race_vehicle_exceeds_course_envelope:'This course supports cars and vans up to 6.5 m long. Your larger vehicle stays available in Free Roam.',race_vehicle_needs_repair:'Repair your car to at least 30% condition before racing.',race_grid_no_longer_clear:'The start grid is no longer clear. Choose another route.',
 race_world_changed:'The location changed. Open Racing again in the current world.',activity_library_save_failed:'This device could not save the route. Free some storage and retry.'};
const message=error=>messages[error?.message]||'This race could not complete. Your garage and exploration progress are safe. Try again.';
export function createRacingRuntime(c,{closeMenus=()=>{},requestWorldFocus=()=>{},chooseDestination=()=>{},openCareerJourney=()=>{}}={}) {
 let online=null,onlineCourse=null,onlineRoster='',onlineVisualRevision=0,onlinePreparing=false,lastResultUid='',lastUiFresh=true;
 let careerView=null,careerScope=null,careerOwner='',careerRevision=0,careerOpen=false;
 let routeDiagnostics=null,approvedDistrict=null,catalogMessage='',coursePublications=new WeakMap(),catalogRevision=0,catalogCursor=null;
 let dialog=null,hud=null,loadScope=null,loadPublication=null,raceScope=null,controller=null,presentation=null,district=null,graph=null,fingerprint='',events=[],selected=0;
 let bestRead=null,bestReadOwner='',bestReadRevision=0;
 let recordOwner='',records=null,driverReadRevision=0,locationPreview=null,previewRevision=0,openRevision=0;
 let creatorMode='road',creatorRecorded=false,groundAnchors=[],recording=null,recordHud=null,creatorRevision=0;const groundCourseFacts=new WeakMap();
 let creatorPath=[],creatorNodes=[],customCourse=null,returnFocus=null,busy=false,recordId='',lastUiAt=-Infinity,saving=false,lastResult=null,lastResultCourse=null,lastResultProfile=null,lastResultOwner='',resultSaved=false;
 function currentRecords() {
  const uid=getCurrentUser()?.uid||'';if(records&&recordOwner===uid)return records;
  recordOwner=uid;
  const owner=uid;
  records=createActivityCompletionStore({storage:()=>racingPracticeStorage(owner),eventNamespace:owner?`racing:${owner}`:'racing:guest',
   recordEvent:event=>{if((getCurrentUser()?.uid||'')!==owner)throw Error('race_account_changed');return c.recordExplorerEvent?.(event);},
   lookupEvents:ids=>c.getExplorerEventsById?.(ids),context:()=>({environment:'EARTH',
    locationSnapshot:{...(lastResultCourse?.anchor||district?.anchor||c.worldPublication?.location||c.LOC||{}),name:lastResultCourse?.locationLabel||district?.locationLabel||''},
    regionId:lastResultCourse?.locationId||district?.locationId||'earth-road-racing',worldIdentity:lastResultCourse?.locationId||district?.locationId||'earth-road-racing',
    regionLabel:lastResultCourse?.locationLabel||district?.locationLabel||'Earth road race'})});
  return records;
 }
 function journalRecords(owner) {
  if(bestRead&&bestReadOwner===owner)return bestRead;
  bestReadOwner=owner;const revision=++bestReadRevision,store=c.discoveryProfileStore;
  bestRead=import('./leaderboard.js').then(({readRacingPracticeBests})=>readRacingPracticeBests({ownerUid:owner,
   lookupEvents:ids=>c.getExplorerEventsById?.(ids),listEventsByIdPrefix:store?.listEventsByIdPrefix?.bind(store),
   isCurrent:()=>revision===bestReadRevision&&(getCurrentUser()?.uid||'')===owner}));
  bestRead.catch(()=>{if(revision===bestReadRevision)bestRead=null;});
  return bestRead;
 }
 const el=(selector)=>dialog.querySelector(selector),status=text=>{el('[data-race-status]').textContent=text;};
 function ensure() {
  if(dialog)return;dialog=document.createElement('dialog');dialog.id='racingHub';dialog.className='racing-hub';dialog.setAttribute('aria-labelledby','racingHeading');
  dialog.innerHTML=`<header><div><p class="racing-eyebrow">WORLD EXPLORER 3D</p><h2 id="racingHeading" data-race-heading>Racing</h2></div><button type="button" data-race-close aria-label="Close racing">Close</button></header>
   <p data-race-location></p><div class="racing-toolbar"><button type="button" data-race-destination>Change location</button><button type="button" data-race-garage>Garage</button><button type="button" data-race-create>Create track</button><button type="button" data-race-career-open>Rivals &amp; crews</button><button type="button" data-race-refresh aria-label="Update routes" title="Update routes"><span aria-hidden="true">↻</span></button></div>
   <p role="status" aria-live="polite" data-race-status></p>
   <div class="racing-layout"><aside class="racing-setup"><nav aria-label="Road events" data-race-events></nav><div class="racing-setup-controls"><p data-race-detail></p><p data-race-record></p>
   <div class="racing-options"><label>Computer drivers<select data-race-rivals><option value="2">2 drivers</option><option value="1">1 driver</option><option value="0">None</option></select></label>
   <label>Difficulty<select data-race-difficulty><option value=".45">Explorer</option><option value=".65" selected>Club</option><option value=".85">Expert</option></select></label></div></div></aside>
   <section class="racing-event-detail"><div class="racing-summary"><h3 data-race-name>Loading routes…</h3><dl class="racing-course-facts" data-race-facts></dl></div><div class="racing-preview-panel">
   <div class="racing-view-switch" role="group" aria-label="Course preview"><button type="button" data-race-preview="scene" aria-pressed="true">Location view</button><button type="button" data-race-preview="map" aria-pressed="false">Route map</button></div>
   <div class="racing-course-view"><figure class="racing-location-view" data-race-scene><img data-race-image hidden alt=""><p data-race-image-empty>Loading location view…</p><figcaption data-race-image-credit hidden><span data-race-image-caption></span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a></figcaption></figure><div class="racing-map" data-race-map hidden></div></div></div><div class="racing-extra">
   <details data-race-creator><summary>Create a track here</summary><p>Choose roads on the overhead map, or lay out a marked track on open ground. You can also drive the route first. Preview and test before sharing.</p><label>Build on<select data-race-creator-mode><option value="road">Existing roads</option><option value="ground">Open ground · no roads needed</option></select></label><label data-race-ground-width hidden>Track width<select data-race-width><option value="6">6 m · technical</option><option value="8" selected>8 m</option><option value="10">10 m</option><option value="12">12 m · wide</option></select></label><p data-race-creator-help>Click junctions in driving order. Arrows pan the map; + / − zoom. Enter adds the map centre.</p><div><button type="button" data-race-map-zoom=".65">Zoom in</button><button type="button" data-race-map-zoom="1.5">Zoom out</button><button type="button" data-race-map-reset>Fit track</button><button type="button" data-race-map-area>Show nearby area</button></div>
   <label data-race-road-junction>Junction<select data-race-node aria-label="Route junction"></select></label><button type="button" data-race-add>Add junction</button><button type="button" data-race-undo>Undo last</button><button type="button" data-race-reset>Clear route</button><button type="button" data-race-close-loop>Close loop</button><button type="button" data-race-record-drive>Drive to create</button>
   <p data-race-waypoints></p><label>Route name<input data-race-route-name maxlength="100" placeholder="My city run"></label>
   <label>Discipline<select data-race-discipline><option value="sprint">Sprint</option><option value="circuit">Circuit · 2 laps</option><option value="time-trial">Time trial</option></select></label>
   <button type="button" data-race-preview-draft>Preview track</button><button type="button" data-race-test>Test this route</button><button type="button" data-race-save>Save route</button><button type="button" data-race-room-share>Share with this room</button><button type="button" data-race-publish-test>Submit a public road route</button><p data-race-saved></p></details>
   <details data-race-driver><summary>Your cars &amp; driving skill</summary><p data-race-collection></p><p data-race-skill></p>
   <p>Manage cars and upgrades in My garage. Finish routes to build Ground Vehicles skill; repeated runs earn less XP. Skill rank does not change race handling.</p></details>
   <details><summary>Practice rules</summary><p>AI cars can pass through you. Barriers damage your car and damage affects handling; repair it in My garage. Boosts are off. Results save to your Journal; practice does not pay Credits or enter online rankings.</p></details></div>
   <section class="racing-online" aria-labelledby="racingOnlineHeading"><h3 id="racingOnlineHeading">Race with your room</h3><p data-race-online-help>Join a multiplayer room at this location, then drive your own car to the start shown on the route map. Online races use approved routes and shared timing.</p><p data-race-publication></p><button type="button" data-race-catalog-more hidden>More shared routes</button><a href="/account/?section=contributions&amp;content=racing" target="_blank" rel="noopener">My shared routes</a><ol data-race-online-roster></ol><button type="button" data-race-online-join>Join room race</button></section>
   </section></div><section class="racing-career-view" data-race-career-view hidden><div data-race-career-host></div></section><footer class="racing-career-actions" data-race-career-actions hidden><button type="button" data-race-career-back>Back to racing</button></footer><footer class="racing-start-bar"><button class="racing-primary" type="button" data-race-start disabled>Start practice</button>
   <p class="racing-note">Private practice · results saved in your Journal</p><div class="racing-lobby-actions" data-race-lobby-actions hidden><button class="racing-primary" type="button" data-race-online-ready hidden>Ready</button><button type="button" data-race-online-start hidden>Start race</button><button type="button" data-race-online-leave hidden aria-label="Leave race lobby">Leave</button></div></footer><section data-race-results hidden aria-labelledby="racingResultHeading"><h3 id="racingResultHeading" tabindex="-1">Race results</h3><ol data-race-order></ol><p data-race-save-state role="status"></p>
   <p data-race-feedback></p></section><footer class="racing-result-actions" data-race-result-actions hidden><button type="button" data-race-retry-save hidden>Retry Journal save</button><button type="button" data-race-again>Race again</button><button type="button" data-race-times>My times</button><button type="button" data-race-submit hidden>Submit route for review</button><button type="button" data-race-journey>Career progress</button><button type="button" data-race-career-results>Rivals &amp; crews</button><button type="button" data-race-explore>Return to exploration</button></footer>`;
  document.body.append(dialog);
  hud=document.createElement('section');hud.id='roadRaceHud';hud.className='road-race-hud';hud.hidden=true;hud.setAttribute('aria-label','Race progress');
  hud.innerHTML='<p data-race-phase aria-live="polite"></p><strong data-race-clock></strong><span data-race-progress></span><span data-race-speed></span><span data-race-pace aria-live="polite"></span><div class="road-race-actions"><button type="button" data-race-recover hidden>Recover +15s</button><button type="button" data-race-leave>Leave race</button><button type="button" data-race-vr>VR view</button></div>';document.body.append(hud);
  recordHud=document.createElement('section');recordHud.className='road-race-hud';recordHud.hidden=true;recordHud.setAttribute('aria-label','Track recording');recordHud.innerHTML='<strong>Drive to create</strong><span data-race-record-status>Drive your route. Stop before finishing.</span><div><button type="button" data-race-record-finish>Finish &amp; edit</button><button type="button" data-race-record-cancel>Cancel recording</button></div>';document.body.append(recordHud);
  recordHud.querySelector('[data-race-record-finish]').onclick=()=>finishRecording();recordHud.querySelector('[data-race-record-cancel]').onclick=()=>{recording=null;recordHud.hidden=true;void open();};
  dialog.querySelector('[data-race-close]').onclick=()=>dialog.close();
  dialog.addEventListener('keydown',event=>{if(event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();dialog.close();}});
  dialog.addEventListener('close',()=>{el('[data-race-map] svg')?.disposeMap?.();careerOpen=false;el('[data-race-career-view]').hidden=el('[data-race-career-actions]').hidden=true;disposeCareer();releaseLocationPreview();if(online&&!controller)stop('lobby_closed');if(busy&&!controller){loadScope?.dispose('menu_closed');if(raceScope)stop('menu_closed');busy=false;}if(lastResult&&controller)stop('results_closed');c.setPauseReason?.('racing-menu',false);c.clearControlInputState?.('racing-menu-closed');if(controller)requestWorldFocus();else returnFocus?.focus?.({preventScroll:true});});
  for(const button of dialog.querySelectorAll('[data-race-preview]'))button.onclick=()=>showPreview(button.dataset.racePreview);
  el('[data-race-creator]').addEventListener('toggle',()=>{if(el('[data-race-creator]').open)showPreview('map');renderOnline();});
  el('[data-race-create]').onclick=()=>{el('[data-race-creator]').open=!el('[data-race-creator]').open;renderOnline();if(el('[data-race-creator]').open){showPreview('map');el('[data-race-creator-mode]').focus({preventScroll:true});}};
  el('[data-race-destination]').onclick=()=>{stop('destination');dialog.close();chooseDestination();};
  el('[data-race-garage]').onclick=()=>{if(controller){status('Leave the race before changing your car.');return;}dialog.close();c.openVehicleGarage?.();};
  el('[data-race-career-open]').onclick=()=>void showCareer();
  el('[data-race-career-results]').onclick=()=>{if(!resultSaved){el('[data-race-save-state]').textContent='Save your Journal result first.';return;}stop('view_career');lastResult=null;void showCareer(true);};
  el('[data-race-career-back]').onclick=()=>{careerOpen=false;disposeCareer();el('[data-race-career-view]').hidden=el('[data-race-career-actions]').hidden=true;render();el('[data-race-career-open]').focus({preventScroll:true});};
  el('[data-race-refresh]').onclick=()=>void qualify();
  el('[data-race-catalog-more]').onclick=()=>void refreshCatalog(catalogCursor);
  el('[data-race-events]').onclick=event=>{const button=event.target.closest('[data-event-index]');if(button&&!busy&&!online){selected=Number(button.dataset.eventIndex);customCourse=null;render();}};
  el('[data-race-start]').onclick=()=>void begin(customCourse||events[selected]);
  el('[data-race-online-join]').onclick=()=>void joinOnline(customCourse||events[selected]);
  el('[data-race-online-ready]').onclick=()=>{const state=online?.snapshot(),me=state?.players.find(p=>p.uid===getCurrentUser()?.uid);online?.send({type:'ready',ready:!me?.ready});};
  el('[data-race-online-start]').onclick=()=>online?.send({type:'start'});
  el('[data-race-online-leave]').onclick=()=>{stop('left_lobby');renderOnline();status('Left the race lobby.');};
  el('[data-race-add]').onclick=()=>addJunction(Number(el('[data-race-node]').value));
  el('[data-race-undo]').onclick=()=>{creatorMode==='ground'?groundAnchors.pop():creatorNodes.pop();rebuildCreator();};el('[data-race-reset]').onclick=()=>{creatorNodes=[];groundAnchors=[];creatorRecorded=false;rebuildCreator();};
  el('[data-race-creator-mode]').onchange=()=>{creatorMode=el('[data-race-creator-mode]').value;rebuildCreator();map(undefined,true,creatorMode==='ground'&&groundAnchors.length>1);};el('[data-race-route-name]').oninput=()=>{creatorRevision++;customCourse=null;};el('[data-race-width]').onchange=()=>rebuildCreator();el('[data-race-discipline]').onchange=()=>rebuildCreator();
  el('[data-race-close-loop]').onclick=()=>{if(creatorMode==='road'&&creatorNodes.length>2)addJunction(creatorNodes[0]);el('[data-race-discipline]').value='circuit';rebuildCreator();};
  el('[data-race-record-drive]').onclick=()=>startRecording();
  el('[data-race-preview-draft]').onclick=()=>void previewDraft();
  for(const button of dialog.querySelectorAll('[data-race-map-zoom]'))button.onclick=()=>el('[data-race-map] svg')?.zoomBy(Number(button.dataset.raceMapZoom));
  el('[data-race-map-reset]').onclick=()=>map(undefined,true,true);el('[data-race-map-area]').onclick=()=>map(undefined,true,false);
  el('[data-race-room-share]').onclick=()=>void shareWithRoom();
  el('[data-race-test]').onclick=async()=>{const course=await previewDraft();if(course)void begin(course);};
  el('[data-race-save]').onclick=()=>void saveRoute();
  el('[data-race-publish-test]').onclick=()=>void testForPublication();
  el('[data-race-submit]').onclick=()=>void submitRoute();
  hud.querySelector('[data-race-leave]').onclick=()=>{stop('left_race');void open();};
  hud.querySelector('[data-race-recover]').onclick=()=>{try{controller?.recover();}catch{c.showToast?.('Recovery is unavailable. Wait for the next recovery window.');}};
  hud.querySelector('[data-race-vr]').onclick=()=>{void c.openVrSettings?.().catch(error=>c.showToast?.(error.message||'VR setup could not open.'));};
  el('[data-race-explore]').onclick=()=>{stop('return_to_exploration');dialog.close();requestWorldFocus();};
  el('[data-race-again]').onclick=()=>{if(!resultSaved){el('[data-race-save-state]').textContent='Retry the Journal save before starting another race.';return;}if(lastResult?.receipt){stop('next_online_race');lastResult=null;void open();}else void begin(lastResultCourse||customCourse||events[selected]);};
  el('[data-race-retry-save]').onclick=()=>void persistResult();
  el('[data-race-journey]').onclick=()=>{if(!resultSaved)return;dialog.close();c.setPauseReason?.('racing-menu',false);openCareerJourney();};
  el('[data-race-times]').onclick=async event=>{
   event.stopPropagation();
   if(!resultSaved){el('[data-race-save-state]').textContent='Save this result before opening your times.';return;}
   const verified=!!lastResult?.receipt;stop('view_times');dialog.close();
   try{await c.ensureFlowerChallengeReady?.();await c.openLeaderboardView?.('racing');if(verified){const source=document.getElementById('racingRecordSource');if(source){source.value='online';source.dispatchEvent(new Event('change'));}}}
   catch{c.showToast?.('Your racing times could not open. They are kept in your Journal.');}
  };
 }

 function disposeCareer(){careerRevision++;careerView?.dispose();careerView=null;careerScope?.dispose('panel_closed');careerScope=null;careerOwner='';}
 async function mountCareer(){
  if(careerView||!dialog.open||!careerOpen)return;const owner=getCurrentUser()?.uid;if(!owner||getCurrentUser()?.isAnonymous){el('[data-race-career-host]').textContent='Sign in with an account to use rivals and crews.';return;}
  disposeCareer();const revision=careerRevision,publication=c.worldPublication,session=captureEnvironmentSession(),scope=createLifecycleScope('racing-career-panel');careerScope=scope;careerOwner=owner;
  const current=()=>scope.isActive()&&careerRevision===revision&&dialog.open&&careerOpen&&getCurrentUser()?.uid===owner&&c.worldPublication===publication&&session.isCurrent();
  scope.listen(session.signal,'abort',disposeCareer);el('[data-race-career-host]').textContent='Loading rivals and crews…';
  scope.defer(c.registerRuntimeSystem?.({id:'racing.career-owner',owner:'racing',phase:'presentation',critical:false,enabled:()=>!!careerScope,update:()=>{if(!current())disposeCareer();}}),'career-owner');
  try{const {mountRacingCareer}=await import('./career-workspace.js');if(!current())return;careerView=mountRacingCareer(el('[data-race-career-host]'),{ownerUid:owner,roomCode:getCurrentRoom()?.code,showHeading:false,isCurrent:current,isReadOnly:()=>!!online||!!controller});scope.defer(()=>careerView?.dispose(),'career-view');}
  catch{if(current())el('[data-race-career-host]').textContent='Racing progress could not open. Close this section and try again.';}
 }
 async function showCareer(reopen=false){if(reopen)await open();if(!dialog.open)return;careerOpen=true;dialog.dataset.raceView='career';el('[data-race-heading]').textContent='Rivals & crews';el('[data-race-career-view]').hidden=el('[data-race-career-actions]').hidden=false;await mountCareer();}

 async function open() {
  const revision=++openRevision,session=captureEnvironmentSession();
  if(c.vrPresentation?.active)await c.vrPresentation.stop('racing-menu');
  if(revision!==openRevision||!session.isCurrent())return;
  ensure();if(!controller&&resultSaved){lastResult=null;lastResultCourse=null;}bestRead=null;bestReadRevision++;returnFocus=document.activeElement;closeMenus();c.clearControlInputState?.('racing-menu');
  c.setPauseReason?.('racing-menu',true);if(!dialog.open)dialog.showModal();
  void refreshDriver();
  if(lastResult){renderResults();return;}
  refreshLocationPreview();
  if(controller){render();return;}
  if(district&&loadScope?.isActive()&&c.worldPublication===loadPublication){render();void refreshCatalog();return;}
  await qualify();
 }
 async function qualify() {
  if(busy)return;catalogRevision++;approvedDistrict=null;catalogMessage='';coursePublications=new WeakMap();stop('roads_refresh');loadScope?.dispose('replaced');district=null;graph=null;events=[];customCourse=null;creatorNodes=[];groundAnchors=[];creatorPath=[];creatorRecorded=false;creatorRevision++;recording=null;if(recordHud)recordHud.hidden=true;lastResult=null;
  const scope=createLifecycleScope('race-district'),session=captureEnvironmentSession(),publication=c.worldPublication;loadScope=scope;
  // The captured publication belongs to this load scope; no late world may adopt it.
  const current=()=>scope.isActive()&&session.isCurrent()&&c.worldPublication===publication;
  scope.listen(session.signal,'abort',()=>{scope.dispose('world_changed');if(loadScope===scope){releaseLocationPreview();district=null;status('Location changed. Open Racing again here.');}});
  busy=true;delete dialog.dataset.raceQualificationError;status('Checking roads…');render();
  try {
   if(!c.gameStarted||resolveControlState(c).frame!=='surface')throw Error('race_world_changed');
   const venue=c.worldLoadRuntimeState?.venuePack;
   const facts=await collectRaceDistrict(c,{current,allowEmpty:!venue,...(venue?{radiusWorld:venue.qualificationRadiusWorld,sourceFeatureIds:venue.sourceFeatureIds}:{})});
   const derived=venue?buildVenueRaceCourses(facts,venue):recommendRaceCourses(facts),hash=await raceDistrictFingerprint(facts);
   if(!current())throw Error('race_world_changed');district=facts;graph=derived.graph;events=derived.events;routeDiagnostics=derived.diagnostics;fingerprint=hash;selected=0;
   for(const saved of listStoredActivities().filter(a=>a.raceRoute&&a.locationLabel===facts.locationLabel))try{if(saved.raceRoute.groundDraft){const ground=await collectGroundRaceDistrict(c,saved.raceRoute.groundDraft,{current}),g=buildRaceRoadGraph(ground.roads,{metersPerUnit:ground.metersPerUnit}),course=restoreRaceCourse(saved.raceRoute,ground,g,await raceDistrictFingerprint(ground));groundCourseFacts.set(course,ground);events.push(course);}else events.push(restoreRaceCourse(saved.raceRoute,district,graph,hash));}catch{/* Kept in the library for explicit recovery; never silently remap it. */}
   const nodeSelect=el('[data-race-node]');
   const labels=new Map();for(const road of facts.roads)if(road.label){
    const edge=graph.edges.find(e=>e.sourceId===road.sourceId);if(edge){for(const id of [edge.from,edge.to]){if(!labels.has(id))labels.set(id,new Set());labels.get(id).add(road.label);}}
   }
   nodeSelect.replaceChildren(...graph.nodes.map(n=>new Option(`${[...(labels.get(n.id)||[])].slice(0,2).join(' / ')||'Mapped junction'} · ${n.id+1}`,String(n.id))));
   status(derived.events.length?`${venue?.presentationStatus==='under-construction'?'Venue in progress · ':''}${events.length} routes available`:'No suggested routes here. Create a route or change location.');
   // Store the identity on the local scope projection, not the world owner.
   loadPublication=publication;
  } catch(error){if(current()){dialog.dataset.raceQualificationError=String(error?.message||'unknown');status(message(error));}}
  finally {if(loadScope===scope){busy=false;render();if(district)void refreshCatalog();}}
 }

 async function refreshCatalog(cursor){
  const revision=++catalogRevision,owner=getCurrentUser()?.uid,facts=district,scope=loadScope;
  if(!owner||getCurrentUser()?.isAnonymous||!facts)return;
  const request=new AbortController();scope?.defer(()=>request.abort(),'race-catalog');
  const current=()=>revision===catalogRevision&&scope?.isActive()&&district===facts&&getCurrentUser()?.uid===owner;
  try{
   const catalog=await readRacingCatalog({ownerUid:owner,locationId:facts.locationId,cursor,roomCode:getCurrentRoom()?.code,signal:request.signal});if(!current())return;
   approvedDistrict=catalog.district;catalogCursor=catalog.nextCursor;el('[data-race-catalog-more]').hidden=!catalogCursor;let unavailable=0;
   for(const entry of catalog.courses||[]){
    try{
     const course=await reconstructPublishedRace(entry.reference,catalog.district.facts);assertRaceCourseInDistrict(course,facts);if(!current())return;
     for(const previousCourse of [...events,customCourse,lastResultCourse]){const previous=previousCourse&&coursePublications.get(previousCourse);if(previous?.id===entry.id)Object.assign(previous,entry);}
     if(customCourse&&coursePublications.get(customCourse)?.id===entry.id)customCourse=course;
     const previous=events.findIndex(e=>e.discipline===course.discipline&&e.laps===course.laps&&JSON.stringify(e.sourcePath)===JSON.stringify(course.sourcePath));
     coursePublications.set(course,entry);if(previous<0)events.push(course);else events[previous]=course;
    }catch{unavailable++;}
   }
   for(const listed of catalog.roomCourses||[])try{
    const response=await readRacingCatalog({ownerUid:owner,locationId:facts.locationId,roomCode:listed.roomCode,roomCourseId:listed.id,signal:request.signal}),entry=response.roomCourses?.[0];if(!current())return;if(!entry?.facts)continue;
    const course=await reconstructPublishedRace(entry.reference,entry.facts);
    if(course.groundDraft){const ground=await collectGroundRaceDistrict(c,course.groundDraft,{current});assertRaceCourseInDistrict(course,ground);groundCourseFacts.set(course,ground);}else assertRaceCourseInDistrict(course,facts,{allowVenueSubset:true});
    if(!current())return;coursePublications.set(course,entry);const previous=events.findIndex(e=>coursePublications.get(e)?.id===entry.id);if(previous<0)events.push(course);else events[previous]=course;
   }catch{unavailable++;}
   catalogMessage=!catalog.district?'Shared routes are not available at this location yet. Private practice is available.':unavailable?'Some shared routes do not match the loaded roads. They are unavailable here until the road data matches.':'';
   if(!busy&&!online)render();
  }catch{if(current()){catalogMessage='Shared routes could not load. Private routes and practice are still available.';if(!online)renderOnline();}}
 }
 async function testForPublication(){
  if(busy)return;const owner=getCurrentUser()?.uid;if(!owner||getCurrentUser()?.isAnonymous){status('Sign in to test a route for sharing.');return;}
  if(!getCurrentRoom()){status('Join a multiplayer room at this location, then test your route with shared timing.');return;}
  if(!approvedDistrict){status(catalogMessage||'This location needs reviewed road data before routes can be shared.');return;}
  const currentDistrict=district,publication=c.worldPublication,scope=loadScope,request=new AbortController(),current=()=>getCurrentUser()?.uid===owner&&district===currentDistrict&&c.worldPublication===publication&&loadScope===scope&&scope?.isActive();scope?.defer(()=>request.abort(),'route-test-draft');busy=true;status('Saving this route for a timed test…');
  try{
   const local=await buildCustom();if(local.surfaceKind==='ground')throw Error('race_ground_room_only');const reference=await rebaseRaceReference(raceCourseReference(local,fingerprint),approvedDistrict.facts,district);
   const saved=await commitRacingRoute(owner,{action:'save-draft',districtId:approvedDistrict.id,reference},request.signal);
   if(!current())return;
   const course=await reconstructPublishedRace(reference,approvedDistrict.facts);assertRaceCourseInDistrict(course,district);
   coursePublications.set(course,{...saved,reference,ownerUid:owner,tested:false});customCourse=course;render();busy=false;await joinOnline(course);
  }catch(error){if(current())status(onlineMessage(error.message));}finally{if(current())busy=false;}
 }
 async function shareWithRoom(requested){
  if(busy||online)return;const owner=getCurrentUser()?.uid,room=getCurrentRoom();if(!owner||getCurrentUser()?.isAnonymous||!room){status('Join a room at this location with a signed-in account, then share your track.');return;}
  busy=true;const revision=creatorRevision,publication=c.worldPublication,current=()=>getCurrentUser()?.uid===owner&&getCurrentRoom()?.code===room.code&&c.worldPublication===publication&&creatorRevision===revision;
  status('Checking and sharing this track with your room…');
  try{
   const local=requested||customCourse||await buildCustom(),known=coursePublications.get(local);if(known?.status==='approved'||known?.status==='room'){busy=false;return await joinOnline(local);}
   const source=groundCourseFacts.get(local)||district,ids=new Set(local.sourcePath.map(id=>id.replace(/:(forward|reverse)$/,''))),{venueSource,...roomSource}=source,roads=source.roads.filter(r=>ids.has(r.sourceId));
   if(local.pitLane||['oval','rally'].includes(local.discipline))throw Error('race_invalid_room_route');if(roads.some(r=>r.widthMeters<6))throw Error('race_room_course_width');const facts=canonicalRaceDistrict({...roomSource,roads});
   const reference=await rebaseRaceReference(raceCourseReference(local,await raceDistrictFingerprint(source)),facts,source,{allowVenueSubset:true}),saved=await commitRacingRoute(owner,{action:'share-room',roomCode:room.code,facts,reference});
   if(!current())return;const course=await reconstructPublishedRace(reference,facts);assertRaceCourseInDistrict(course,source,{allowVenueSubset:true});if(course.surfaceKind==='ground')groundCourseFacts.set(course,source);
   coursePublications.set(course,{...saved,reference,ownerUid:saved.ownerUid||owner});customCourse=course;if(!events.includes(course))events.push(course);render();busy=false;await joinOnline(course);
  }catch(error){if(current())status(onlineMessage(error.message));}finally{busy=false;}
 }
 async function submitRoute(){
  if(busy||!lastResultCourse)return;const course=lastResultCourse,entry=coursePublications.get(course),owner=getCurrentUser()?.uid;
  if(!entry||entry.ownerUid!==owner)return;busy=true;el('[data-race-submit]').disabled=true;
  try{
   const result=await commitRacingRoute(owner,{action:'submit',id:entry.id,revision:entry.revision});
   if(getCurrentUser()?.uid!==owner||lastResultCourse!==course)return;Object.assign(entry,result);el('[data-race-submit]').hidden=true;
   el('[data-race-save-state]').textContent='Submitted for review. Your route stays private until it is approved. Check My shared routes in Account for the decision.';
  }catch(error){if(getCurrentUser()?.uid===owner&&lastResultCourse===course)el('[data-race-save-state]').textContent=onlineMessage(error.message);}
  finally{busy=false;el('[data-race-submit]').disabled=false;}
 }

 function showPreview(view) {
  el('[data-race-scene]').hidden=view!=='scene';el('[data-race-map]').hidden=view!=='map';
  for(const button of dialog.querySelectorAll('[data-race-preview]'))button.setAttribute('aria-pressed',String(button.dataset.racePreview===view));
 }
 function releaseLocationPreview() {
  previewRevision++;locationPreview?.dispose();locationPreview=null;
  if(!dialog)return;
  const image=el('[data-race-image]');image.hidden=true;image.removeAttribute('src');
  el('[data-race-image-credit]').hidden=true;
  el('[data-race-image-caption]').textContent='';el('[data-race-image-empty]').hidden=false;
  el('[data-race-image-empty]').textContent='Location view unavailable. Use the route map.';
 }
 function refreshLocationPreview() {
  releaseLocationPreview();const revision=previewRevision,publication=c.worldPublication;
  el('[data-race-image-empty]').textContent='Loading location view…';showPreview('scene');
  locationPreview=createRaceLocationPreview(c,{isCurrent:()=>revision===previewRevision&&dialog.open,
   onImage:url=>{const image=el('[data-race-image]');image.src=url;image.alt=`Current in-game view of ${district?.locationLabel||'this location'}`;image.hidden=false;
    el('[data-race-image-empty]').hidden=true;el('[data-race-image-credit]').hidden=false;el('[data-race-image-caption]').textContent=`Current view · ${district?.locationLabel||'this location'}`;},
   onUnavailable:()=>{if(c.worldPublication===publication){el('[data-race-image-empty]').textContent='Location view unavailable. Use the route map.';showPreview('map');}}
  });
 }
 function map(course=customCourse||events[selected],reset=false,fitTrack=false) {
  const host=el('[data-race-map]'),initialView=reset?null:host.querySelector('svg')?.getMapView?.();host.querySelector('svg')?.disposeMap?.();host.replaceChildren();if(!graph)return;
  let creatorSegments=creatorPath.map(id=>{const e=graph.edges.find(edge=>edge.id===id);return [graph.nodes[e.from],graph.nodes[e.to]];});
  if(creatorMode==='ground'&&groundAnchors.length>1)try{const pts=cleanGroundRaceLayout(groundDraft(),district.metersPerUnit);creatorSegments=pts.slice(1).map((p,i)=>[pts[i],p]);}catch{creatorSegments=groundAnchors.slice(1).map((p,i)=>[groundAnchors[i],p]);}
  const svg=createRaceRouteMap({roads:district.roads,buildings:c.buildings,course:el('[data-race-creator]').open?customCourse:course,locationLabel:district.locationLabel,creatorSegments,initialView,boundsPoints:fitTrack?(customCourse?.points|| (creatorMode==='ground'&&groundAnchors.length>1?groundAnchors:creatorSegments.length?creatorSegments.flat():course?.points)):null,creatorPoints:creatorMode==='ground'?groundAnchors:(creatorRecorded?[...new Set([creatorNodes[0],creatorNodes.at(-1)])].filter(id=>id!==undefined):creatorNodes).map(id=>graph.nodes[id]),player:c.car,
   onPoint:at=>{if(!el('[data-race-creator]').open||busy)return;if(creatorMode==='ground'){if(groundAnchors.length>=80){status('Use at most 80 anchors.');return;}groundAnchors.push({x:at.x,z:at.y});rebuildCreator();return;}
    const node=graph.nodes.reduce((best,n)=>!best||Math.hypot(n.x-at.x,n.z-at.y)<Math.hypot(best.x-at.x,best.z-at.y)?n:best,null);
    if(!node||Math.hypot(node.x-at.x,node.z-at.y)*district.metersPerUnit>35){status('Choose a highlighted road junction, or switch to Open ground.');return;}addJunction(node.id);}});if(svg){host.append(svg);svg.zoomBy(1);svg.observeResize?.();}
  const credit=document.createElement('a');credit.href='https://www.openstreetmap.org/copyright';credit.textContent='© OpenStreetMap contributors · ODbL';credit.target='_blank';credit.rel='noopener';credit.className='racing-map-credit';host.append(credit);
 }
 function currentVehicleProfile() {
  const vehicleId=c.car?.personalVehicleId||'bmw_e34',garage=c.getVehicleGarage?.();
  const levels=c.vehicleUpgradeStore?.levels({vehicleIdentity:personalVehicleIdentity(vehicleId)})||{};
  return createRaceVehicleProfile(vehicleId,{condition:c.car?.condition??garage?.vehicles?.[vehicleId]?.condition??1,levels});
 }
 async function refreshDriver() {
  const revision=++driverReadRevision,owner=getCurrentUser()?.uid||'';
  const renderDriver=profile=>{
   if(revision!==driverReadRevision||(getCurrentUser()?.uid||'')!==owner)return;
   const summary=racingCollectionSummary(c.getVehicleGarage?.(),profile);
   el('[data-race-collection]').textContent=`${summary.owned} of ${summary.available} cars owned · ${summary.families.classics} classics · ${summary.families.everyday} everyday · ${summary.families.utility} utility. ${summary.homed} assigned to a home.`;
   el('[data-race-skill]').textContent=summary.skill?`Ground Vehicles · ${summary.skill.label} · ${summary.skill.xp} XP${summary.skill.nextXp?` · next rank at ${summary.skill.nextXp} XP`:''}`:'Your driving skill is shown when the Journal is available. Saved progress is kept.';
  };
  renderDriver(null);
  try{renderDriver(await c.discoveryProfileStore?.getProfile?.());}catch{/* Leave the garage usable and retain the unavailable-skill message. */}
 }
 function render() {
  if(!dialog)return;dialog.dataset.raceView=careerOpen?'career':'events';el('[data-race-heading]').textContent=careerOpen?'Rivals & crews':'Racing';el('[data-race-location]').textContent=district?district.locationLabel:'Current location';
  const list=el('[data-race-events]'),focused=list.contains(document.activeElement)?document.activeElement?.dataset.eventIndex:null;list.replaceChildren();events.forEach((course,i)=>{const b=document.createElement('button');b.type='button';b.dataset.eventIndex=i;b.setAttribute('aria-pressed',String(!customCourse&&i===selected));
   const strong=document.createElement('strong'),small=document.createElement('span');strong.textContent=raceCourseDisplayName(course);small.textContent=`${(course.lengthMeters/1000).toFixed(2)} km · ${course.laps} lap${course.laps===1?'':'s'}${coursePublications.get(course)?.status==='approved'?' · Shared':''}`;b.append(strong,small);list.append(b);});
  if(focused!=null)list.querySelector(`[data-event-index="${Number(focused)}"]`)?.focus({preventScroll:true});
  const course=customCourse||events[selected];el('[data-race-name]').textContent=course?raceCourseDisplayName(course):(busy?'Loading routes…':'No routes available');
  const facts=el('[data-race-facts]');facts.replaceChildren();if(course)for(const [label,value]of[['Distance',`${(course.lengthMeters/1000).toFixed(2)} km`],['Laps',course.laps],['Event',raceDisciplineLabel(course.discipline)],['Time limit',`${raceMaximumDurationMs(course)/60000} min`]]){const group=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value;group.append(term,detail);facts.append(group);}
  const vehicle=personalVehicleById(c.car?.personalVehicleId||'bmw_e34');el('[data-race-detail]').textContent=course?`Car · ${vehicle?.label||'Personal vehicle'}`:'';
  if(!el('[data-race-image]').hidden){el('[data-race-image]').alt=`Current in-game view of ${district?.locationLabel||'this location'}`;el('[data-race-image-caption]').textContent=`Current view · ${district?.locationLabel||'this location'}`;}
  el('[data-race-start]').textContent=getCurrentRoom()?'Test with room':'Start practice';el('[data-race-start]').disabled=busy||!!online||!course;el('[data-race-rivals]').disabled=course?.discipline==='time-trial';map(course);renderOnline();
  el('[data-race-results]').hidden=!lastResult;el('[data-race-result-actions]').hidden=!lastResult;el('[data-race-creator]').hidden=!graph;el('[data-race-room-share]').disabled=!getCurrentRoom()||busy||!!online;
  el('[data-race-record]').textContent='';
  if(course){const owner=getCurrentUser()?.uid||'';el('[data-race-record]').textContent='Reading personal best…';try{void Promise.all([racePracticeRecordKey(course,currentVehicleProfile()),journalRecords(owner)]).then(([id,bests])=>{
   if((customCourse||events[selected])!==course||(getCurrentUser()?.uid||'')!==owner)return;
   if(!bests)return;const record=bests.entries.find(e=>e.id===id);el('[data-race-record]').textContent=record?`Personal best · ${formatTime(record.timeMs)} · this car setup`:'Personal best · No time set';
  }).catch(()=>{if((customCourse||events[selected])===course)el('[data-race-record]').textContent='Practice records could not be read. Your saved results are kept.';});}
  catch{el('[data-race-record]').textContent='Repair your car before racing.';}}
 }
 function addJunction(id) {try{if(!graph?.nodes[id]||creatorNodes.at(-1)===id)return;if(creatorNodes.length>=(creatorRecorded?RACE_MAX_ROUTE_EDGES:30))throw Error('invalid_race_route');creatorNodes.push(id);rebuildCreator(true);}catch(error){creatorNodes.pop();status(message(error));}}
 function groundDraft(){return {version:1,widthMeters:Number(el('[data-race-width]').value),closed:el('[data-race-discipline]').value==='circuit',anchors:groundAnchors.map(p=>({...p}))};}
 function rebuildCreator(throwFailure=false) {
  creatorRevision++;creatorPath=[];customCourse=null;
  const ground=creatorMode==='ground';el('[data-race-ground-width]').hidden=!ground;el('[data-race-road-junction]').hidden=ground;el('[data-race-add]').hidden=ground;el('[data-race-publish-test]').hidden=ground;
  el('[data-race-creator-help]').textContent=ground?'Click a few corner anchors on open ground. Corners are rounded and the full width is checked before testing. Arrows pan; + / − zoom; Enter adds the map centre.':'Click road junctions in driving order. Recording follows connected road spans, so steering wobble does not become the track.';
  try{if(!ground)for(let i=1;i<creatorNodes.length;i++)creatorPath.push(...shortestRacePath(graph,creatorNodes[i-1],creatorNodes[i]));
   el('[data-race-waypoints]').textContent=ground?`${groundAnchors.length} corner anchors · ${el('[data-race-width]').value} m wide`:creatorRecorded?`Road recording · ${(creatorPath.reduce((sum,id)=>sum+(graph.edges.find(e=>e.id===id)?.length||0),0)/1000).toFixed(2)} km. Add a junction to extend it, or Undo to shorten it.`:creatorNodes.length?creatorNodes.map(id=>el('[data-race-node]').options[id]?.text.split(' · ')[0]||`Junction ${id+1}`).join(' → '):'Choose a start junction.';map();
  }catch(error){if(throwFailure)throw error;status(message(error));}
 }
 async function buildCustom() {
  if(!district)throw Error('race_world_changed');const discipline=el('[data-race-discipline]').value,revision=creatorRevision,publication=c.worldPublication;
  let facts=district,g=graph,path=creatorPath,draft=null;
  if(creatorMode==='ground'){draft=groundDraft();facts=await collectGroundRaceDistrict(c,draft,{current:()=>revision===creatorRevision&&c.worldPublication===publication&&loadScope?.isActive()});g=buildRaceRoadGraph(facts.roads,{metersPerUnit:facts.metersPerUnit});path=facts.roads.slice().sort((a,b)=>Number(a.sourceId.split(':').at(-1))-Number(b.sourceId.split(':').at(-1))).map(r=>r.sourceId+':forward');}
  if(!path.length)throw Error('race_route_length');
  const course=createRaceCourse(g,path,{locationId:facts.locationId,locationLabel:facts.locationLabel,anchor:facts.anchor,name:el('[data-race-route-name]').value.trim()||`${facts.locationLabel} · Your track`,discipline,laps:discipline==='circuit'?2:1,participants:discipline==='time-trial'?1:4,...(draft?{groundDraft:draft}:{})});
  if(draft)groundCourseFacts.set(course,facts);return course;
 }
 async function previewDraft(){if(busy)return null;busy=true;status('Checking the full track width…');try{const course=await buildCustom();customCourse=course;render();showPreview('map');map(course,true,true);status(`Track checked · ${(course.lengthMeters/1000).toFixed(2)} km. Test before sharing.`);return course;}catch(error){status(message(error));return null;}finally{busy=false;el('[data-race-start]').disabled=!!online||!(customCourse||events[selected]);el('[data-race-room-share]').disabled=!getCurrentRoom()||!!online;}}
 async function saveRoute() {
  if(busy)return;busy=true;try {const course=customCourse||await buildCustom(),facts=groundCourseFacts.get(course)||district,reference=raceCourseReference(course,await raceDistrictFingerprint(facts)),id=await raceCourseKey(course);
   saveStoredActivity({id:`route-${id}`,templateId:'road-race',title:course.name,description:course.surfaceKind==='ground'?'Marked open-ground race':'Qualified mapped-road race',locationLabel:district.locationLabel,creatorId:getCurrentUser()?.uid||'',visibility:'private',status:'draft',raceRoute:reference,anchors:[],center:course.points[0]});
   customCourse=course;if(!events.includes(course))events.push(course);selected=events.indexOf(course);render();status('Track saved on this device. Ground tracks are checked again when opened.');
  }catch(error){status(message(error));}finally{busy=false;el('[data-race-start]').disabled=!!online||!(customCourse||events[selected]);el('[data-race-room-share]').disabled=!getCurrentRoom()||!!online;}
 }
 function startRecording(){
  if(busy||controller||online||!district||resolveControlState(c).controller!=='drive'){status('Enter your car, then choose Drive to create.');return;}
  recording={mode:creatorMode,publication:c.worldPublication,vehicleId:c.car.personalVehicleId,path:[],points:[],last:null,elapsed:0};recordHud.hidden=false;dialog.close();requestWorldFocus();
 }
 function recordDrive(dt){
  const r=recording;if(!r)return;
  if(r.publication!==c.worldPublication||r.vehicleId!==c.car.personalVehicleId||resolveControlState(c).controller!=='drive'){recording=null;recordHud.hidden=true;c.showToast?.('Recording stopped because your car or location changed.');return;}
  r.elapsed+=dt;if(r.elapsed<.15)return;r.elapsed=0;
  if(r.mode==='road'){const edge=recordRaceRoadSpan(graph,{...c.car,y:c.car.y-VEHICLE_ROOT_TO_GROUND_METERS,yaw:c.car.angle},r.last);if(edge&&edge.id!==r.last?.id){if(r.path.length>=500)return;r.path.push(edge.id);r.last=edge;}}
  else {const p={x:c.car.x,z:c.car.z},last=r.points.at(-1);if(!last||Math.hypot(p.x-last.x,p.z-last.z)*district.metersPerUnit>=4){if(r.points.length>=2000)return;r.points.push(p);}}
  recordHud.querySelector('[data-race-record-status]').textContent=`${r.mode==='road'?r.path.length+' connected road spans':r.points.length+' samples'} · Stop, then Finish & edit. Normal driving and collisions remain active.`;
 }
 function finishRecording(){
  if(!recording)return;if(Math.abs(c.car.speed||0)>4){c.showToast?.('Stop your car before finishing the recording.');return;}
  const r=recording;recording=null;recordHud.hidden=true;creatorMode=r.mode;el('[data-race-creator-mode]').value=r.mode;
  if(r.mode==='road'){creatorRecorded=true;creatorPath=recordedRoadRacePath(r.path,graph);const path=creatorPath,byId=new Map(graph.edges.map(e=>[e.id,e]));creatorNodes=path.length?[byId.get(path[0]).from,...path.map(id=>byId.get(id).to)]:[];}
  else {const draft=recordedGroundRaceDraft(r.points,district.metersPerUnit);groundAnchors=draft.anchors;el('[data-race-discipline]').value=draft.closed?'circuit':'sprint';}
  if(r.mode==='road')el('[data-race-discipline]').value=creatorNodes.length>1&&creatorNodes[0]===creatorNodes.at(-1)?'circuit':'sprint';
  rebuildCreator();void open().then(()=>{el('[data-race-creator]').open=true;showPreview('map');status('Recording is an editable draft. Check the layout, then Preview track.');});
 }
 async function begin(course) {
  if(getCurrentRoom())return shareWithRoom(course);
  if(busy||!course)return;if(lastResult&&!resultSaved){el('[data-race-save-state]').textContent='Save your previous result before starting another run.';el('[data-race-retry-save]').hidden=false;return;}busy=true;status('Preparing your car and rivals…');
  delete dialog.dataset.raceStartError;stop('race_replaced');const scope=createLifecycleScope('racing-run'),session=captureEnvironmentSession(),request=new AbortController(),publication=c.worldPublication;
  raceScope=scope;scope.defer(()=>request.abort(),'preparation');scope.listen(session.signal,'abort',()=>stop('world_changed'));
  const ownerUid=getCurrentUser()?.uid||'',uid=ownerUid||'practice-player',current=()=>scope.isActive()&&session.isCurrent()&&publication===c.worldPublication&&(getCurrentUser()?.uid||'')===ownerUid;
  try {
   if(getCurrentRoom())throw Error('practice_leave_room_first');
   if(c.getLiveGpsSnapshot?.().active)throw Error('race_live_gps_active');
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
    difficulty:Number(el('[data-race-difficulty]').value),profile:createRaceVehicleProfile(['bmw_m3_e92_race','porsche_carrera_4s','bmw_m3_e46'][i])}));
   recordId=await racePracticeRecordKey(course,profile);if(!currentRecords().canStart(recordId))throw Error('race_previous_result_unsaved');
   const prepared=await prepareRacePresentation(THREE,c,course,rivals,{signal:request.signal,current});scope.defer(()=>prepared.dispose(),'race-visuals');
   if(!current())throw Error('race_world_changed');
   const run=createPracticeRaceController({context:c,course,profile,rivals,label:'You',uid,onComplete:result=>complete(result),isAdmitted:current});
   scope.defer(()=>{run.stop('race_scope_closed');if(c.roadRaceController===run)c.roadRaceController=null;},'road-controller');
   adoptRun(run,prepared,scope,current);
   update(0);
  }catch(error){if(raceScope===scope){dialog.dataset.raceStartError=String(error.message||'unknown');stop('race_start_failed');status(error.message==='race_live_gps_active'?'Stop Live GPS before racing.':error.message==='practice_leave_room_first'?'Leave the shared exploration room before starting private practice.':error.message==='stop_before_racing'?'Stop your car before entering a race.':error.message==='race_previous_result_unsaved'?'Retry saving your previous race result before starting another run.':message(error));}}
  finally {busy=false;}
 }
 function adoptRun(run,prepared,scope,current){
   run.start();controller=run;c.roadRaceController=run;presentation=prepared;prepared.mount();
   // A VR finish stays in the headset until Results/Exit returns presentation.
   // The existing kernel can present its native result UI even while simulation
   // is paused; no extra loop or VR callback owns the race result.
   scope.defer(c.registerRuntimeSystem?.({id:'racing.result-presentation',owner:'racing',phase:'presentation',critical:false,
    enabled:()=>current()&&!!lastResult&&!c.vrPresentation?.active&&!dialog.open,
    update:()=>{if(current()&&lastResult&&!c.vrPresentation?.active)showResults();}}),'result-presentation');
   const population=c.livingWorldRuntime?.population;population?.setRaceClosure(run.course);scope.defer(()=>population?.setRaceClosure(null),'civilian-course');
   scope.defer(c.setUrbanRaceClosure?.(run.course),'urban-course');
   c.screenLayout?.setActivityLayer('racing',true);
   scope.defer(()=>{if(c.screenLayout?.snapshot().activityLayer==='racing')c.screenLayout.setActivityLayer('racing',false);},'racing-screen-layer');
   lastResult=null;lastResultCourse=null;resultSaved=false;el('[data-race-results]').hidden=true;el('[data-race-result-actions]').hidden=true;dialog.dataset.raceView='events';status('');dialog.close();hud.hidden=false;c.clearControlInputState?.('race_countdown');requestWorldFocus();
 }
 const onlineMessages={race_room_course_width:'Use the full venue event for this narrow track, or create a route at least 6 m wide.',race_room_route_limit:'This room has eight tracks. Use an existing track or create another room.',race_room_route_too_large:'This track is too detailed to share. Use a shorter route or fewer anchors.',race_invalid_room_route:'This course needs the reviewed public catalogue. Choose Join room race on the approved event instead.',race_room_presence_expired:'Your room presence expired. Rejoin the room and try again.',race_move_to_start:'Drive your car to the start on the route map, then join again.',race_course_unavailable:'This route has not been approved for online racing. Practice is available.',
  race_signed_account_required:'Sign in with an account before joining an online race.',race_personal_car_lease_required:'Enter your personal car in this room before joining the race.',race_room_busy:'Another race is using this room. Wait for it to finish.',
  race_vehicle_needs_repair:'Repair your car to at least 30% condition before racing.',vehicle_condition_save_required:'Your car could not be saved. Open the garage and try again.',
  race_not_ready:'Every driver must be ready before the race starts.',race_needs_two_players:'At least two drivers must join and be ready.',race_vehicle_setup_changed:'Your car setup changed. Leave and rejoin the race lobby.',
  race_reconnect_expired:'The connection could not be restored. Return to exploration and rejoin.',race_roster_locked:'The race has started. Wait for the next race.',race_community_consent_required:'Agree to the community rules before racing online.',race_test_route_first:'Finish a timed test of this exact route before submitting.',race_route_already_exists:'This route already belongs to another creator. Choose it from the event list or create a different route.',race_withdraw_before_editing:'Withdraw this route in Account before changing it.',race_route_library_full:'You have 40 shared route drafts. Reuse an existing route before creating another.',race_route_changed:'This version changed. Refresh routes and try again.',race_course_changed:'This course is no longer available. Return to exploration and refresh routes.'};
 function onlineMessage(reason){return onlineMessages[reason]||'Online racing is unavailable right now. Your car and progress are kept. You can leave the lobby and try again.';}
 function renderOnline(){
  if(!dialog)return;careerView?.setReadOnly();const state=online?.snapshot(),me=state?.players.find(p=>p.uid===getCurrentUser()?.uid),inLobby=!!online,course=customCourse||events[selected],entry=coursePublications.get(course),purpose=state?.purpose||(entry?.status==='room'?'room-race':entry&&entry.status!=='approved'?'qualification':course?.discipline==='time-trial'?'time-trial':'competition');
  if(!lastResult){const creating=el('[data-race-creator]').open&&!inLobby&&!careerOpen;dialog.dataset.raceView=careerOpen?'career':inLobby?'lobby':creating?'creator':'events';el('[data-race-create]').textContent=creating?'Back to events':'Create track';if(!careerOpen)el('[data-race-heading]').textContent=creating?'Create a track':'Racing';}
  el('[data-race-lobby-actions]').hidden=!inLobby;
  for(const button of el('[data-race-events]').children)button.disabled=inLobby;
  el('[data-race-online-join]').hidden=inLobby;el('[data-race-online-join]').disabled=busy||!course||!entry||entry.status==='review_required'||!getCurrentRoom();
  el('[data-race-online-join]').textContent=entry&&['draft','rejected'].includes(entry.status)?'Join timed route test':'Join room race';
  el('[data-race-publication]').textContent=entry?({room:'Room track · unranked · no Credits or career wins',approved:'Approved shared route',draft:entry.tested?'Timed test complete · submit through My shared routes':'Private draft · timed test required',review_required:'Awaiting review · private until approved',rejected:'Changes requested · '+(entry.reviewNote||'Revise and test again')})[entry.status]:catalogMessage||'Private practice route · not published for online racing';
  for(const name of ['ready','start','leave'])el(`[data-race-online-${name}]`).hidden=!inLobby;
  el('[data-race-online-ready]').disabled=onlinePreparing||!me||state.phase!=='lobby';el('[data-race-online-ready]').textContent=me?.ready?'Not ready':'Ready';
  el('[data-race-online-start]').hidden=!inLobby||state?.leaderUid!==getCurrentUser()?.uid;
  el('[data-race-online-start]').disabled=onlinePreparing||!state||state.phase!=='lobby'||state.players.length<(purpose==='competition'?2:1)||state.players.some(p=>!p.ready||p.disconnected);
  el('[data-race-online-roster]').replaceChildren(...(state?.players||[]).map(p=>{const li=document.createElement('li');li.textContent=`${p.label} · ${personalVehicleById(p.vehicleId)?.label||'Car'} · ${p.disconnected?'Reconnecting':p.ready?'Ready':'Preparing'}`;return li;}));
  el('[data-race-online-help]').textContent=inLobby?onlinePreparing?'Loading drivers’ cars…':purpose==='room-race'?'Room track · shared timing, no Credits or global ranking. Ready your car, then start.':purpose==='qualification'?'Private timed route test · no Credits or shared ranking. Ready your car, then start.':purpose==='time-trial'?'Timed solo run · no Credits. Ready your car, then start.':'Rivals are ghosts. Course barriers damage your car; repair it in My garage. The room leader starts when everyone is ready.':
   getCurrentRoom()?'Drive your personal car to the start on the route map, then join. Approved routes use shared timing and online results.':'Join a multiplayer room at this location to race together.';
 }
 async function joinOnline(course){
  if(busy||online||!course)return;const room=getCurrentRoom(),owner=getCurrentUser()?.uid;if(!room||!owner||getCurrentUser()?.isAnonymous){status(onlineMessage('race_signed_account_required'));return;}
  stop('race_replaced');const scope=createLifecycleScope('racing-online'),session=captureEnvironmentSession(),publication=c.worldPublication,request=new AbortController();raceScope=scope;
  const current=()=>scope.isActive()&&session.isCurrent()&&c.worldPublication===publication&&getCurrentUser()?.uid===owner&&getCurrentRoom()?.code===room.code&&getCurrentRoom()?.world?.seed===room.world?.seed;
  scope.defer(()=>request.abort(),'connection-preparation');scope.listen(session.signal,'abort',()=>stop('world_changed'));busy=true;status('Connecting to your room’s race…');
  try{
   if(c.getLiveGpsSnapshot?.().active||resolveControlState(c).frame!=='surface')throw Error('race_world_changed');
   if(!c.car?.personalVehicleId||!canUseOnlineCar())throw Error('race_personal_car_lease_required');
   const lease=await c.selectPersonalVehicle?.(c.car.personalVehicleId,{intent:'ensure-room-lease'});
   if(!current())throw Error('race_world_changed');if(!lease?.ok)throw Error(lease?.reason||'race_personal_car_lease_required');
   if(course.groundDraft){const ground=await collectGroundRaceDistrict(c,course.groundDraft,{current});assertRaceCourseInDistrict(course,ground);groundCourseFacts.set(course,ground);}else assertRaceCourseInDistrict(course,district,{allowVenueSubset:coursePublications.get(course)?.status==='room'});
   const options=await racingServiceOptions(owner,request.signal),courseId=await raceCourseKey(course);if(!current())throw Error('race_world_changed');
   const connection=createRaceConnection({...options,expectedCourse:course,physicsVersion:racePhysicsVersion(course),uid:owner,join:{roomCode:room.code,worldSeed:room.world.seed,courseId,vehicleId:c.car.personalVehicleId},isCurrent:current,
    onError:reason=>{if(current()){if(!online?.snapshot()){stop('race_join_rejected');renderOnline();}else if(['race_reconnect_expired','race_account_changed','race_session_replaced','invalid_race_snapshot'].includes(reason)){stop(reason);c.clearControlInputState?.('race-ended');c.showToast?.(onlineMessage(reason));}status(onlineMessage(reason));}},onConnection:state=>{if(current()){if(state==='reconnecting')status('Reconnecting to the same race…');if(state==='connected')status(`Room ${room.code} · shared timing`);}},
    onSnapshot:(state,serverCourse)=>{if(!current())return;void acceptOnlineSnapshot(state,serverCourse,scope,current,owner).catch(error=>{if(current()){stop('race_start_failed');status(onlineMessage(error.message));renderOnline();}});}
   });
   online=connection;onlineCourse=course;onlineRoster='';scope.defer(()=>connection.stop(),'network-connection');
   scope.defer(c.registerRuntimeSystem?.({id:'racing.network',owner:'racing',phase:'presentation',critical:false,enabled:()=>online===connection,
    update:()=>connection.pump()}),'network-pump');
   await connection.connect();renderOnline();
  }catch(error){if(raceScope===scope){stop('race_join_failed');status(onlineMessage(error.message));renderOnline();}}
  finally{busy=false;if(dialog)renderOnline();}
 }
 function canUseOnlineCar(){return canOwnRoadRace(c)&&Math.abs(c.car.speed||0)<=4;}
 async function acceptOnlineSnapshot(state,serverCourse,scope,current,owner){
  if(state.phase==='cancelled'){stop(state.reason);c.clearControlInputState?.('race-ended');c.showToast?.(onlineMessage(state.reason));status(onlineMessage(state.reason));renderOnline();return;}
  const connection=online;if(!connection)return;
  if(serverCourse&&await raceCourseKey(serverCourse)!==await raceCourseKey(onlineCourse))throw Error('race_course_wrong_world');
  if(!current())return;
  if(state.phase==='complete'&&state.settlement==='saved'&&!controller){
   // A committed result may arrive before a local actor was adopted. Review
   // the receipt without moving/spawning a car at its finishing position.
   if(lastResult?.id!==state.id)complete(state,{course:onlineCourse,profile:raceNetworkProfile(state.profiles[owner],onlineCourse),uid:owner});
   return;
  }
  const signature=state.players.map(p=>`${p.uid}:${p.vehicleId}`).join('|');
  if(signature!==onlineRoster){
   const revision=++onlineVisualRevision;onlineRoster=signature;onlinePreparing=true;renderOnline();
   const rivals=state.players.filter(p=>p.uid!==owner).map(p=>({uid:p.uid,label:p.label,profile:raceNetworkProfile(state.profiles[p.uid],onlineCourse)}));
   const pending=new AbortController();scope.defer(()=>pending.abort(),'online-model-preparation');let prepared;
   try{prepared=await prepareRacePresentation(THREE,c,onlineCourse,rivals,{signal:pending.signal,current:()=>current()&&revision===onlineVisualRevision});}
   catch(error){if(!current()||revision!==onlineVisualRevision)return;throw error;}
   if(!current()||revision!==onlineVisualRevision){prepared.dispose();return;}
   presentation?.dispose();presentation=prepared;scope.defer(()=>prepared.dispose(),'online-visuals');onlinePreparing=false;
  }
  renderOnline();
  if(!controller&&!onlinePreparing&&['countdown','running'].includes(state.phase)){
   if(!current())return;
   const run=createNetworkRaceController({context:c,course:onlineCourse,connection,uid:owner,isAdmitted:current,onComplete:result=>complete(result)});
   scope.defer(()=>{run.stop();if(c.roadRaceController===run)c.roadRaceController=null;},'online-road-controller');
   adoptRun(run,presentation,scope,current);
  }
 }
 function showResults(){if(!lastResult)return;if(!dialog.open)dialog.showModal();renderResults();el('#racingResultHeading').focus({preventScroll:true});}
 function complete(result,{course=controller?.course,profile=controller?.profile,uid=controller?.uid}={}) {lastResult=result;lastResultCourse=course;lastResultProfile=profile;lastResultUid=uid;lastResultOwner=getCurrentUser()?.uid||'';
  const verified=result.receipt?.players.find(p=>p.uid===lastResultUid);if(verified)recordId=result.receipt.purpose==='qualification'?'race-route-test-'+result.courseId.slice(-32):result.receipt.purpose==='room-race'?'race-practice-'+result.courseId.slice(-32):'race-online-'+verified.boardId.slice(0,32);
  if(result.receipt?.purpose==='qualification'){const entry=coursePublications.get(lastResultCourse);if(entry)entry.tested=!!verified?.finished;}
  resultSaved=false;presentation?.update(result,lastResultUid,0);status('');hud.hidden=true;c.setPauseReason?.('racing-menu',true);renderResults();if(!c.vrPresentation?.active)showResults();void persistResult();}
 function renderResults() {
  if(!lastResult)return;dialog.dataset.raceView='results';el('[data-race-heading]').textContent=lastResult.receipt?.purpose==='qualification'?'Route test':'Race results';el('#racingResultHeading').textContent=lastResult.courseName;el('[data-race-results]').hidden=false;el('[data-race-result-actions]').hidden=false;const list=el('[data-race-order]');list.replaceChildren();
  for(const player of lastResult.players){const li=document.createElement('li');li.value=player.position;li.textContent=`${player.label} · ${player.dnf?'Did not finish':formatTime(player.progress?.elapsedMs)}${player.ai?' · Computer rival':''}`;list.append(li);}
  const player=lastResult.players.find(p=>p.uid===lastResultUid),feedback=racePracticeFeedback(player);
  el('[data-race-feedback]').textContent=feedback.finished?`${personalVehicleById(player.vehicleId)?.label||'Your car'} · ${feedback.clean?'Clean finish: no course barrier contacts or timing penalties.':'Finish recorded. Aim to avoid course barriers on your next run.'}${feedback.consistent?' Three or more laps within 5%: consistent driving.':''}`:'Finish the complete route to record a result.';
  el('[data-race-journey]').disabled=!resultSaved;
  const qualification=lastResult.receipt?.purpose==='qualification',entry=coursePublications.get(lastResultCourse);el('[data-race-submit]').hidden=!qualification||!entry?.tested||!['draft','rejected'].includes(entry.status);el('[data-race-times]').hidden=qualification||lastResult.receipt?.purpose==='room-race';
  const verified=!!lastResult.receipt,award=lastResult.receipt?.players.find(p=>p.uid===lastResultUid)?.credits||0;
  el('[data-race-again]').textContent=verified?'Choose next race':'Race again';el('[data-race-times]').textContent=verified?'Shared times':'My times';
  el('[data-race-save-state]').textContent=qualification?`Timed route test ${entry?.tested?'saved. You can submit this version for review.':'ended without a finishing time. Test again before submitting.'}${resultSaved?' Journal saved.':''}`:verified?`Online result saved${award?` · ${award} Credits`:''}. ${resultSaved?'Journal saved.':'Saving your Journal…'}`:resultSaved?'Practice record saved in your Journal.':'Device practice result. Your Journal save needs to finish.';el('[data-race-retry-save]').hidden=resultSaved||saving;
 }
 async function persistResult() {
  if(!lastResult||saving)return;
  if((getCurrentUser()?.uid||'')!==lastResultOwner){el('[data-race-save-state]').textContent='Sign back into the account that ran this race to save its result.';el('[data-race-retry-save]').hidden=false;return;}
  saving=true;const result=lastResult,player=result.players.find(p=>p.uid===lastResultUid),course=lastResultCourse;let id=recordId;
  el('[data-race-save-state]').textContent='Saving your result in the Journal…';el('[data-race-retry-save]').hidden=true;
  try {if(result.receipt?.purpose==='room-race'){id=await racePracticeRecordKey(course,lastResultProfile,{slot:player.slot,participants:course.participants});if(lastResult!==result)return;recordId=id;}if(!player?.progress?.finished){resultSaved=true;el('[data-race-save-state]').textContent='Run ended without a finishing time. Your exploration progress is preserved.';return;}
   const metadata=(result.receipt?.purpose==='qualification'?raceQualificationMetadata:result.receipt?.purpose==='room-race'?raceRoomMetadata:result.receipt?raceOnlineMetadata:racePracticeMetadata)(result,player,{courseId:await raceCourseKey(course),recordKey:id,physicsVersion:racePhysicsVersion(course)});
   metadata.racingVenueId=course.venueSource?.id||null;metadata.racingOwnerUid=lastResultOwner;metadata.raceConfiguration=result.receipt?raceCompetitiveRecordConfiguration(lastResultProfile,{slot:player.slot,participants:course.participants,course}):raceRecordConfiguration(lastResultProfile,{course});
   if(lastResult!==result)return;
   if((getCurrentUser()?.uid||'')!==lastResultOwner)throw Error('race_account_changed');
   const saved=await currentRecords().complete({id,title:course.name,sourceType:'creator'},player.progress.elapsedMs,player.pose,
    {pointsFirst:0,completionId:result.id,detail:`${result.receipt?.purpose==='qualification'?'Route test':result.receipt?.purpose==='room-race'?'Unranked room track':result.receipt?'Online road race':'Practice road race'} · ${course.locationLabel} · ${formatTime(player.progress.elapsedMs)} · ${personalVehicleById(player.vehicleId)?.label||'Personal car'}${metadata.cleanFinish?' · Clean finish':''}`,metadata});
   if(lastResult!==result)return;resultSaved=saved;renderResults();if(!saved)el('[data-race-save-state]').textContent='The result needs a Journal save. Retry before starting another run.';el('[data-race-retry-save]').hidden=saved;if(saved){bestRead=null;bestReadRevision++;void refreshDriver();}
  }catch(error){if(lastResult===result){el('[data-race-save-state]').textContent=error.message==='race_account_changed'?'Sign back into the account that ran this race to save its result.':'The result needs a Journal save. Retry before starting another run.';el('[data-race-retry-save]').hidden=false;}}
  finally{saving=false;}
 }
 function update(dt) {
  recordDrive(dt);
  if(careerView&&careerOwner!==(getCurrentUser()?.uid||''))disposeCareer();
  if(online&&!c.registerRuntimeSystem)online.pump();
  if(!controller)return;if(!controller.isCurrent()){stop('race_vehicle_or_world_changed');return;}
  const snapshot=controller.snapshot();presentation?.update(controller.presentationSnapshot?.()||snapshot,controller.uid,dt);
  const fresh=!online||online.connected()&&online.isFresh(),changed=fresh!==lastUiFresh;lastUiFresh=fresh;
  if(snapshot.serverAtMs-lastUiAt<100&&snapshot.phase==='running'&&!changed)return;lastUiAt=snapshot.serverAtMs;
  const player=snapshot.players.find(p=>p.uid===controller.uid),startAt=player?.rally?.startAtMs??snapshot.startAtMs,left=Math.max(0,(startAt||0)-snapshot.serverAtMs);
  const flag=snapshot.raceControl?.flag,raceOrder=`${player?.position||1} / ${snapshot.players.length}`;
  hud.querySelector('[data-race-phase]').textContent=online&&(!online.connected()||!online.isFresh())?'Reconnecting…':snapshot.phase==='countdown'||left>0?`${snapshot.raceControl?.start==='rolling'?'Rolling start':'Ready'} · ${Math.max(1,Math.ceil(left/1000))}`:player?.progress?.finished?'Finished · waiting for rivals':flag==='yellow'?`Yellow · no passing · ${raceOrder}`:player?.pit?.active?`Pit lane · ${raceOrder}`:flag==='white'?`Final lap · ${raceOrder}`:raceOrder;
  hud.querySelector('[data-race-clock]').textContent=formatTime(player?.progress?.elapsedMs??Math.max(0,snapshot.serverAtMs-(startAt||0)));
  hud.querySelector('[data-race-progress]').textContent=`${player?.rally?`Stage · Split ${player.rally.splits.length}/${controller.course.rally.splits.length}`:`Lap ${player?.progress?.lap||1}/${controller.course.laps}`} · Gate ${Math.min((player?.progress?.nextGate||0)+1,controller.course.gates.length)}/${controller.course.gates.length}${player?.progress?.penaltyMs?` · +${player.progress.penaltyMs/1000}s penalty`:''}`;
  hud.querySelector('[data-race-pace]').textContent=rallyPaceNoteText(player);
  const recovery=hud.querySelector('[data-race-recover]');recovery.hidden=!player?.rally;recovery.disabled=!fresh||!player?.rally?.canRecover;
  hud.querySelector('[data-race-speed]').textContent=`${Math.round(Math.abs(carSpeedToMph(player?.speed||0)))} MPH · Condition ${Math.round((player?.condition??1)*100)}%${player?.pit?.active&&controller?.course?.discipline==='circuit'?' · 60 km/h pit limit':flag==='yellow'||player?.trackZone==='apron'||player?.pit?.active?' · 22 MPH pace · no passing':snapshot.phase==='running'&&player?.draftingReduction>.04?' · Drafting':''}`;
  if(snapshot.phase==='cancelled') {stop(snapshot.reason);c.showToast?.('Race ended. Normal exploration is available.');}
 }
 function stop(reason='racing_closed') {
  if(controller&&!online)void c.checkpointPersonalVehicle?.();
  releaseRoadRaceMotion(c,controller);
  if(controller&&c.roadRaceController===controller)c.roadRaceController=null;
  controller?.stop(reason);controller=null;presentation=null;raceScope?.dispose(reason);raceScope=null;online?.stop(reason);online=null;onlineCourse=null;onlineRoster='';onlineVisualRevision++;onlinePreparing=false;if(hud)hud.hidden=true;
  lastUiAt=-Infinity;lastUiFresh=true;
 }
 function stopAll(reason) {
  creatorRevision++;recording=null;if(recordHud)recordHud.hidden=true;
  disposeCareer();openRevision++;catalogRevision++;approvedDistrict=null;bestRead=null;bestReadRevision++;
  stop(reason);releaseLocationPreview();loadScope?.dispose(reason);loadScope=null;loadPublication=null;district=null;graph=null;
  busy=false;dialog?.close();c.setPauseReason?.('racing-menu',false);
 }
 return {open,update,stop:stopAll,snapshot:()=>controller?.snapshot()||{phase:'idle',qualification:district?.diagnostics||null,routes:routeDiagnostics,roadLengths:district?.roads.map(r=>Math.hypot(r.b.x-r.a.x,r.b.z-r.a.z)*district.metersPerUnit).sort((a,b)=>b-a).slice(0,12)||[],events:events.map(e=>({name:e.name,discipline:e.discipline,lengthMeters:e.lengthMeters})),fingerprint}};
}
