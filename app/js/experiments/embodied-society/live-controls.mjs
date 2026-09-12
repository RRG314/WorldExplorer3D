import {createObserverPanel} from './observer-panel.mjs';
import {decisionReport} from './observer-report.mjs';
import {RESEARCH_OBJECTIVES,researchObjective} from './research-objectives.mjs';
import {createDecisionCadence} from './decision-cadence.mjs';
import {ctx} from '../../shared-context.js?v=55';
import {createMappedWorldHost} from './mapped-world-host.mjs';
import {createWorkshopState} from './workshop.mjs';
import {createRunController} from './run-controller.mjs';
import {ACCEPTANCE_PROFILE,applyAcceptanceNeeds} from './acceptance-profile.mjs';
import {RECIPES} from './material-rules.mjs';

// Loaded only by the dedicated loopback research server, never app-entry.
const {panel,el,updateInventory}=createObserverPanel(document);
panel.hidden=true;document.body.append(panel);
for(const objective of RESEARCH_OBJECTIVES){const option=document.createElement('option');option.value=objective.id;option.textContent=objective.label;el('objective').append(option);}
const showObjective=()=>{el('task').textContent=researchObjective(el('objective').value).text??'General exploration: no additional task assigned.';};
el('objective').onchange=showObjective;showObjective();
let setup=null,host=null,controller=null,timer=null,busy=false,previousPause=false,carVisible=null,walkVisible=null,lastDecisionFrame=-60,previousCamera=null;
let cadence=null,starting=false;
const resources=[];
let humanStateCaptured=false,wallTimer=null;
function restoreHuman() {
 if(!humanStateCaptured)return;
 ctx.paused=previousPause;ctx.updateCamera=previousCamera;
 if(ctx.carMesh&&carVisible!==null)ctx.carMesh.visible=carVisible;
 if(ctx.Walk?.state?.characterMesh&&walkVisible!==null)ctx.Walk.state.characterMesh.visible=walkVisible;
 humanStateCaptured=false;
}
function disposeResearch() {
 clearInterval(timer);clearTimeout(wallTimer);restoreHuman();host?.dispose();host=null;
 for(const {mesh} of resources){ctx.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
 resources.length=0;
}
function message(text){el('status').textContent=text;el('compact-status').textContent=text;}
async function post(name,value,signal) {
 const response=await fetch(`/research-api/${name}`,{method:'POST',signal,headers:{'Content-Type':'application/json','X-Research-Session':setup.session},body:JSON.stringify(value)});
 const result=await response.json();if(!response.ok)throw Error(result.error||`Research ${name} failed.`);return result;
}
function readiness() {
 panel.hidden=!ctx.gameStarted||ctx.worldLoading||document.getElementById('globeSelectorScreen')?.classList.contains('show');
 if(controller||starting){el('start').disabled=true;return;}
 if(!setup?.ready){el('start').disabled=true;return;}
 if(setup.savedCheckpoint){el('start').disabled=true;message('This run already has a checkpoint. Use a new run ID; restart recovery is not enabled yet.');return;}
 const ready=ctx.gameStarted&&!ctx.worldLoading&&ctx.worldPublication?.type==='WorldSnapshot';
 el('start').disabled=!ready;
 message(ready?'Mapped world ready. Start will place one AI resident and finite research supplies.':'Choose and enter a world using World Explorer. The resident will use that actual map.');
}
function freeSite(x,z) {
 const sample=ctx.SurfaceQuery?.walkAt(x,z,{currentY:ctx.car?.y});
 if(!Number.isFinite(sample?.position?.y)||sample.kind==='water'||sample.kind==='interior'||sample.provenance?.fallback===true||(sample.kind==='terrain'&&sample.provenance?.source!=='accepted_ground_artifact')||sample.traversal?.walk!==true)return null;
 if(ctx.checkBuildingCollision?.(x,z,.8,{actorBaseY:sample.position.y,actorHeight:1.8})?.collision!==false)return null;
 return {x,y:sample.position.y,z};
}
function resourceMarker(node) {
 const mesh=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4),new THREE.MeshStandardMaterial({color:node.materialId==='trail-water'?0x269dc4:node.materialId==='route-snack'?0xddad45:0x947450}));
 mesh.position.set(node.position.x,node.position.y+.2,node.position.z);mesh.userData.researchResourceId=node.id;ctx.scene.add(mesh);resources.push({mesh,nodeId:node.id});
}
function refresh() {
 if(!controller)return;
 const state=controller.state(),observation=controller.observation({includePerception:false});
 el('start').disabled=true;
 message(`AI resident ${state.status}${state.pending?' · deciding':''}`);
 el('pause').disabled=!['running','paused'].includes(state.status);el('pause').textContent=state.status==='paused'?'Resume':'Pause';el('end').disabled=['ended','failed'].includes(state.status);
 el('needs').textContent=`Water ${(observation.needs.water*100).toFixed(1)}% · Food ${(observation.needs.food*100).toFixed(1)}% · Rest ${(observation.needs.rest*100).toFixed(1)}%`;
 el('details').textContent=state.error||`${Math.floor(state.frames/60)} simulated seconds · ${state.calls} decisions${observation.lastOutcome?` · Last action: ${observation.lastOutcome.action.kind} (${observation.lastOutcome.reason||observation.lastOutcome.status})`:''}`;
 updateInventory(observation.inventory);
 el('report').disabled=false;
 if(!host)return;
 const p=host.body.observation().position;
 ctx.camera.position.set(p.x+8,p.y+7,p.z+8);ctx.camera.lookAt(p.x,p.y-.5,p.z);
 const resourceState=host.workshop.stateView();
 for(const entry of resources)entry.mesh.visible=resourceState.nodes[entry.nodeId].remaining>0;
}
async function cycle() {
 if(busy||!controller||controller.state().status!=='running')return;
 busy=true;
 try {
  host.validate();if(ctx.paused!==true)throw Error("Human play resumed; research stopped to prevent unrecorded intervention.");
  const state=controller.state();
  if(state.calls>=state.maxDecisions&&host.body.observation().remainingFrames===0){await controller.end();refresh();disposeResearch();message('Run ended at the declared decision limit.');return;}
  if(host.body.observation().remainingFrames===0&&state.frames-lastDecisionFrame>=60&&cadence.ready()){lastDecisionFrame=state.frames;await cadence.run(()=>controller.decide());}
  if(controller.state().status==='running')await controller.step(4);
  host.reconcile();refresh();
  if(controller.state().status==='ended'){disposeResearch();message('Run ended at a declared simulation or condition limit.');}
 }catch(error){await controller.abort(error).catch(()=>{});refresh();message(`Run stopped: ${error.message}`);disposeResearch();}
 finally{busy=false;}
}
el('start').onclick=async()=>{
 if(starting||controller||setup?.savedCheckpoint)return;
 starting=true;el('start').disabled=true;
 try {
  readiness();if(!setup.ready||setup.savedCheckpoint||!ctx.worldPublication||ctx.worldLoading)throw Error('World and run configuration must be ready.');
  const center=ctx.car||{x:0,z:0};let spawn=null;
  for(let r=3;r<=12&&!spawn;r+=3)for(let n=0;n<12&&!spawn;n++)spawn=freeSite(center.x+Math.cos(n*Math.PI/6)*r,center.z+Math.sin(n*Math.PI/6)*r);
  if(!spawn)throw Error('No clear mapped spawn near the current position. Choose another location.');
  const sites=[];for(let x=-8;x<=8;x+=2)for(let z=-8;z<=8;z+=2){if(Math.hypot(x,z)<2)continue;const p=freeSite(Math.round(spawn.x)+x,Math.round(spawn.z)+z);if(p)sites.push(p);}
  sites.sort((a,b)=>Math.hypot(a.x-spawn.x,a.z-spawn.z)-Math.hypot(b.x-spawn.x,b.z-spawn.z));
  if(sites.length<12)throw Error('Not enough clear mapped ground for a bounded research plot.');
  const acceptance=el('profile').value===ACCEPTANCE_PROFILE.id;
  const resourceSites=acceptance?sites.filter(p=>Math.hypot(p.x-spawn.x,p.z-spawn.z)*(ctx.METERS_PER_WORLD_UNIT??1)>=ACCEPTANCE_PROFILE.minimumSupplyDistanceMeters):sites;
  if(resourceSites.length<6)throw Error('Not enough verified distant supply sites for this acceptance profile.');
  const definitions=[['trail-water',8],['route-snack',8],['research:fiber',30],['research:branch',16],['research:stone',16],['research:timber',40]];
  const nodes=definitions.map(([materialId,remaining],i)=>({id:`supply-${i}`,materialId,remaining,position:resourceSites[i],...(materialId==='research:timber'?{requiredTool:'research:stone-axe'}:{})}));
  let initialState=createWorkshopState({runId:setup.runId,actorIds:['resident-1'],nodes});
  if(acceptance)initialState=applyAcceptanceNeeds(initialState);
  const wallDeadlineMs=Date.now()+setup.runWindow.maxWallMs;
  const manifest={wallDeadlineMs,runWindow:setup.runWindow,objectiveId:el('objective').value,memoryCondition:el('memory').value,metersPerWorldUnit:ctx.METERS_PER_WORLD_UNIT,profile:acceptance?ACCEPTANCE_PROFILE:{id:'original-full-needs'},initialNeeds:initialState.actors['resident-1'].needs,resources:nodes,environment:'isolated-research',runId:setup.runId,worldSnapshotId:ctx.worldPublication.id,spawn:{...spawn,y:spawn.y+1.7,yaw:0},radiusMeters:40,resourceNodeIds:nodes.map(n=>n.id),buildSites:sites.filter(p=>!nodes.some(n=>n.position===p)).slice(0,24).map(p=>({gx:p.x,gy:Math.ceil((p.y+.5)*2)/2,gz:p.z}))};
  await post('start',{runId:setup.runId,worldSnapshotId:ctx.worldPublication.id,manifest});setup.savedCheckpoint=true;
  host=createMappedWorldHost({THREE,appCtx:ctx,manifest,initialState,persistWorkshop:value=>post('workshop',value)});
  await post('workshop',initialState);nodes.forEach(resourceMarker);
  controller=createRunController({actorId:'resident-1',body:host.body,workshop:host.workshop,
   perceive:()=>({...host.perceive(),knownProcesses:RECIPES,actionGuide:{walkingMetersPerSecond:2.8*ctx.METERS_PER_WORLD_UNIT,needScale:'0 exhausted, 1 full; water/food decrease with simulated time. Carried consumables show needRestore effects.',turnRadiansPerSecond:2.6,positiveStrafe:'left: -x at yaw zero',reachMeters:3,consume:'consumes one carried item and restores its corresponding need',finish:'complete an active job only when tick reaches readyAt'},resourceOrigin:'Finite operator-placed research supplies in this isolated mapped world; not real-world stock.'}),
   persistCheckpoint:value=>post('checkpoint',value),decide:async(observation,{signal})=>post('decision',observation,signal),maxDecisions:setup.model.maxCalls,maxSeconds:setup.runWindow.maxSeconds,clockIntervalSeconds:setup.runWindow.clockIntervalSeconds,wallDeadlineMs,memoryCondition:manifest.memoryCondition});
  humanStateCaptured=true;previousPause=ctx.paused;ctx.paused=true;previousCamera=ctx.updateCamera;ctx.updateCamera=()=>{const p=host.body.observation().position;ctx.camera.position.set(p.x+8,p.y+7,p.z+8);ctx.camera.lookAt(p.x,p.y-.5,p.z);};
  carVisible=ctx.carMesh?.visible;if(ctx.carMesh)ctx.carMesh.visible=false;
  walkVisible=ctx.Walk?.state?.characterMesh?.visible;if(ctx.Walk?.state?.characterMesh)ctx.Walk.state.characterMesh.visible=false;
  el('memory').disabled=true;el('profile').disabled=true;el('objective').disabled=true;
  wallTimer=setTimeout(async()=>{clearInterval(timer);try{await controller.end();refresh();}finally{disposeResearch();message('Run ended at the declared wall-time limit.');}},Math.max(0,wallDeadlineMs-Date.now()));
  await controller.resume();timer=setInterval(cycle,1000/15);refresh();
 }catch(error){await controller?.abort(error).catch(()=>{});disposeResearch();controller=null;message(error.message);}
 finally{starting=false;}
};
el('report').onclick=()=>{
 if(!controller)return;
 const url=URL.createObjectURL(new Blob([decisionReport(controller.report())],{type:'text/markdown;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=`${setup.runId}-decision-report.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
el('pause').onclick=async()=>{
 try{if(controller.state().status==='paused'){await controller.resume();clearInterval(timer);timer=setInterval(cycle,1000/15);}else await controller.pause();refresh();}catch(error){message(error.message);}
};
el('end').onclick=async()=>{clearInterval(timer);try{await controller.end();refresh();disposeResearch();}catch(error){message(error.message);restoreHuman();}};
window.addEventListener('pagehide',()=>{controller?.end().catch(()=>{});disposeResearch();});
try{setup=await(await fetch('/research-api/status')).json();cadence=createDecisionCadence(setup.model?.minDecisionIntervalMs??0);if(!setup.ready){message('AI configuration is required before starting.');el('details').textContent='For the free hosted pilot, use scripts/embodied-society/start-free.command. You will need a Gemini Free-tier project and API key.';}else{el('details').textContent=`${setup.model.model} · ${setup.model.accountTier==='free'?'Free-plan account required':'maximum $'+setup.model.budgetUsd} · ${setup.model.maxCalls} calls · ${setup.runWindow.maxSeconds/3600} simulated hours maximum. Finite research supplies and known recipes are declared starting conditions.`;}}
catch(error){message(`Research server unavailable: ${error.message}`);}
const readyTimer=setInterval(readiness,1000);window.addEventListener('pagehide',()=>clearInterval(readyTimer));readiness();
