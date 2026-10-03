import {sampleMarinePresentation} from './shared-marine-presentation.js';
// Room state owns this voyage. Local traversal saves and personal research are
// suspended while aboard; the first shared outing keeps its parent anchored.
export function marineVoyageRecord(s){return {version:1,id:s.id,subId:s.submarine.id,stage:s.stage==='underwater'?'underwater':'aboard',revision:s.revision,savedAt:s.updatedAtMs,site:s.site,waveOffset:{x:0,z:0},ship:{transportEntityId:s.ship.id,transportCatalogId:s.ship.catalogId,condition:1,yaw:s.ship.yaw,anchor:s.ship.anchor},sub:{...s.submarine.pose,condition:1}};}
export async function openSharedMarine(ctx,{transport:provided}={}){
 if(ctx.sharedMarine){ctx.sharedMarine.open();return ctx.sharedMarine;}
 const transport=provided||(await import('./shared-marine-authority.js')).createMarineTransport();
 let latest=null,active=false,disposed=false,busy=false,error='',transition='',applied='',queue=Promise.resolve(),lastSent=0,receivedAt=0,serverTime=0,controlFault=false;
 let samples=[];
 const panel=document.createElement('section');panel.id='sharedMarineControls';panel.setAttribute('aria-label','Shared research voyage');panel.style.cssText='position:fixed;right:12px;top:116px;z-index:140;width:270px;max-width:calc(100vw - 24px);max-height:calc(100dvh - 220px);overflow:auto;padding:12px;box-sizing:border-box;background:#092a3bf5;color:#eefaff;border:1px solid #91c2d0;border-radius:10px;font:13px/1.4 system-ui';
 const style=document.createElement('style');style.textContent='@media(max-width:600px){#sharedMarineControls{top:210px!important;max-height:calc(100dvh - 340px)}} body[data-shared-marine=true] #oceanVoyageControls,body[data-shared-marine=true] #researchDeckControls,body[data-shared-marine=true] #oceanDiverControls{display:none!important}';document.head.append(style);
 const title=document.createElement('strong');title.textContent='Shared Coral Shelf voyage';const info=document.createElement('p'),status=document.createElement('p');status.setAttribute('role','status');const actions=document.createElement('div');const reportView=document.createElement('details'),reportSummary=document.createElement('summary'),reportBody=document.createElement('div');reportSummary.textContent='Crew survey report';reportView.append(reportSummary,reportBody);reportView.id='sharedMarineReportDetails';panel.append(title,info,status,reportView,actions);document.body.append(panel);
 const buttons={};function button(id,label,run){const b=document.createElement('button');b.type='button';b.id=`sharedMarine${id}`;b.textContent=label;b.style.cssText='width:100%;min-height:42px;margin-top:5px;background:#175069;color:white;border:1px solid #91c2d0;border-radius:7px;font:inherit';b.onclick=()=>{b.blur();void run()};buttons[id]=b;actions.append(b);}
 const clock=()=>Date.now();
 const owns=seat=>active&&latest?.seats?.[seat]?.uid===transport.uid&&latest.seats[seat].untilMs>clock()&&!controlFault&&!transition;
 function accept(state){if(disposed||state&&latest&&state.revision<latest.revision)return;if(state){if(latest?.id!==state.id||latest?.stage!==state.stage)samples=[];if(!samples.length||samples.at(-1).at<state.submarine.poseAtMs)samples.push({at:state.submarine.poseAtMs,pose:{...state.submarine.pose}});samples=samples.slice(-4);}
 latest=state;receivedAt=performance.now();serverTime=state?.updatedAtMs||Date.now();if(!state&&active){error='The shared voyage is unavailable. Controls are stopped.';}refresh();if(active)void applyStage();}
 function send(type,extra={}){
  const requestId=crypto.randomUUID();
  const work=queue.catch(()=>{}).then(async()=>{
   if(disposed||!transport.isCurrent())throw Error('Room connection changed. Rejoin the voyage.');
   const command={type,...extra,requestId,revision:latest?.controlRevision||0,deployment:latest?.deployment||0};
   const result=await transport.send(command);error='';controlFault=false;accept(result.state);return result.state;
  });queue=work;return work;
 }
 async function act(type,extra={}){if(busy)return false;busy=true;error='';refresh();try{await send(type,extra);return true;}catch(e){error=e.message||'The command was not confirmed. Retry.';return false;}finally{busy=false;refresh();}}
 async function join(create=false){if(busy)return;busy=true;error='';try{await send(create?'create':'join');active=true;applied='';document.body.dataset.sharedMarine='true';await applyStage();}catch(e){error=e.message;}finally{busy=false;refresh();}}
 async function applyStage(){
  if(disposed||!active||!latest||transition)return;
  const key=`${latest.id}:${latest.stage}`;if(applied===key)return;
  transition=key;refresh();
  try{
   const record=marineVoyageRecord(latest);
   if(record.stage==='aboard'&&!ctx.oceanMode?.active&&ctx.boatMode?.active&&ctx.boatMode.transportEntityId===record.ship.transportEntityId){ctx.boatMode.moored=true;applied=key;return;}
   if(ctx.boatMode?.active)ctx.suspendBoatModeForOceanTransfer?.();
   const started=await ctx.startOceanMode({launchSite:record.site,submarinePose:record.sub,voyageResume:record,sharedVoyage:true});
   if(!started)throw Error('Could not enter the shared study site. Retry joining.');
   ctx.setPaused?.(false);ctx.paused=false;
   if(record.stage==='aboard'){
    const recovered=await ctx.transferSubmarineToBoat({source:'shared-marine-authority'});
    if(!recovered)throw Error('Shared recovery could not load the vessel. Retry joining.');
    ctx.boatMode.moored=true;
   }
   applied=key;error='';
  }catch(e){error=e.message;}finally{transition='';refresh();}
 }
 function refresh(){if(disposed)return;
  const seats=latest?.seats||{},seatName=k=>seats[k]?.untilMs>clock()?(latest.crew[seats[k].uid]?.name||'Crew'):'Available';
  info.textContent=!latest?'A two-person survey aboard one anchored research ship. Claim helm and pilot, deploy, stop at the three study markers, then recover and submit the shared report.':`Room ${transport.roomCode} · ${latest.stage} · ${latest.manifest.length}/3 observations. Helm: ${seatName('helm')}. Pilot: ${seatName('pilot')}.`;
  const target=latest&&['table-garden','branch-ridge','seagrass-edge'].find(id=>!latest.manifest.some(r=>r.id===id));
  const landmark=ctx.oceanMode?.habitat?.plan.landmarks.find(l=>l.id===target),p=ctx.oceanMode?.submarine?.position;
  const guidance=landmark&&p?` Next: ${landmark.label}, ${Math.round(Math.hypot(p.x-landmark.x,p.z-landmark.z)*(ctx.METERS_PER_WORLD_UNIT||1))} m. Stop within 18 m of the marker.`:'';
  const aboardInstruction=latest?.manifest.length===3?'All three observations are aboard. Claim helm and submit the shared report.':'The parent ship stays anchored. Claim a free seat; the helm deploys once a pilot and two crewmates are present.';
  status.textContent=error||transition&&'Moving crew to the shared vessel…'||(active?(latest?.stage==='complete'?'Shared report saved. Personal Journal and Backpack are unchanged.':latest?.stage==='aboard'?aboardInstruction:latest?.manifest.length===3?'All three observations recorded. Ask the helm to recover aboard and submit the report.':owns('pilot')&&latest?.stage==='underwater'?'You pilot: W/S move, A/D turn, Space/Shift rise/dive.'+guidance:'Crew view follows the shared submarine.'+guidance):'Joining travels to the crew’s vessel; your personal saved voyage is retained.');
  reportView.hidden=!active||!latest?.manifest.length;reportView.open=latest?.stage==='complete';
  const signature=JSON.stringify([latest?.manifest,latest?.rescues.length]);if(reportBody.dataset.signature!==signature){reportBody.dataset.signature=signature;reportBody.replaceChildren();for(const item of latest?.manifest||[]){const row=document.createElement('p');row.textContent=`${{'table-garden':'Table Garden','branch-ridge':'Branch Ridge','seagrass-edge':'Seagrass Edge'}[item.id]||item.id} · authored habitat observation · ${new Date(item.atMs).toLocaleString()}`;reportBody.append(row);}if(latest?.rescues.length){const row=document.createElement('p');row.textContent=`${latest.rescues.length} crew recovery recorded; findings retained.`;reportBody.append(row);}}
  for(const b of Object.values(buttons))b.disabled=busy||!!transition;
  buttons.Create.hidden=!!latest;buttons.Join.hidden=!latest||active&&!error;
  for(const id of ['Helm','Pilot','ReleaseHelm','ReleasePilot','Deploy','Scan','Recover','Report'])buttons[id].hidden=!active;
  buttons.Helm.hidden=!active||latest?.stage==='complete'||!!seats.helm&&seats.helm.untilMs>clock();buttons.Pilot.hidden=!active||latest?.stage==='complete'||!!seats.pilot&&seats.pilot.untilMs>clock();
  buttons.ReleaseHelm.hidden=!owns('helm');buttons.ReleasePilot.hidden=!owns('pilot');
  buttons.Deploy.hidden=!active||latest?.stage!=='aboard';buttons.Deploy.disabled ||= !owns('helm');
  buttons.Scan.hidden=!active||latest?.stage!=='underwater'||!target;buttons.Scan.textContent=`Record ${landmark?.label||target||'observation'}`;
  buttons.Recover.hidden=!active||latest?.stage!=='underwater';buttons.Recover.disabled ||= !owns('helm')&&!!seats.pilot&&seats.pilot.untilMs>clock();
  buttons.Report.hidden=!active||latest?.stage!=='aboard'||latest?.manifest.length!==3;buttons.Report.disabled ||= !owns('helm');
  buttons.Leave.textContent=active?'Leave shared voyage':'Close';
 }
 button('Create','Create shared research voyage',()=>join(true));button('Join','Join / reconnect to shared voyage',()=>join());
 button('Helm','Claim helm',()=>act('claim',{seat:'helm'}));button('Pilot','Claim submarine pilot',()=>act('claim',{seat:'pilot'}));
 button('ReleaseHelm','Release helm',()=>act('release',{seat:'helm'}));button('ReleasePilot','Release pilot',()=>act('release',{seat:'pilot'}));
 button('Deploy','Deploy shared submarine',()=>act('deploy'));button('Scan','Record observation',()=>act('scan',{target:['table-garden','branch-ridge','seagrass-edge'].find(id=>!latest.manifest.some(r=>r.id===id))}));
 button('Recover','Recover crew and submarine',()=>act('recover'));button('Report','Submit shared survey report',()=>act('report'));button('Leave','Close',()=>leave());
 async function leave({restore=true}={}){
  if(busy||transition)return;
  busy=true;controlFault=true;
  const wasActive=active;
  if(active){for(const seat of ['helm','pilot'])if(latest?.seats?.[seat]?.uid===transport.uid)try{await send('release',{seat});}catch{}}
  active=false;disposed=true;unsubscribe();clearInterval(timer);panel.remove();style.remove();delete document.body.dataset.sharedMarine;const personal=ctx.oceanVoyage?.restorePersonal?.();ctx.sharedMarine=null;
  // Return to the retained personal journey when one exists; otherwise stop
  // shared movement at the title instead of saving a duplicate local vessel.
  if(!wasActive||!restore)return;
  if(personal||ctx.oceanVoyage?.saved)await ctx.oceanVoyage.resume(personal);else {if(ctx.boatMode?.active)ctx.suspendBoatModeForOceanTransfer?.();ctx.stopOceanMode?.();ctx.setPaused?.(true);ctx.openGlobeSelector?.();}
 }
 const api={get active(){return active},get canPilot(){return owns('pilot')&&latest?.stage==='underwater'},snapshot:()=>({active,state:latest,error,transition}),open(){panel.hidden=false},leave,
  tick(dt){
   if(!active||!latest||disposed)return;
   if(!transport.isCurrent()){controlFault=true;error='Room connection changed. Rejoin before continuing.';refresh();return;}
   if(ctx.boatMode?.active){ctx.boatMode.moored=true;ctx.boat.speed=0;}
   if(ctx.oceanMode?.active&&!api.canPilot){const sub=ctx.oceanMode.submarine,p=sampleMarinePresentation(samples,clock())||latest.submarine.pose,f=1-Math.exp(-12*dt);for(const k of ['x','y','z'])sub.position[k]+=(p[k]-sub.position[k])*f;sub.yaw+=Math.atan2(Math.sin(p.yaw-sub.yaw),Math.cos(p.yaw-sub.yaw))*f;sub.speed=sub.verticalSpeed=sub.turnSpeed=0;}
  }};
 ctx.sharedMarine=api;
 const unsubscribe=transport.subscribe(accept,e=>{controlFault=true;error=e.message||'Connection lost. Shared controls are stopped.';refresh();});
 const timer=setInterval(()=>{if(disposed)return;
  if(active&&applied&&!transition&&!busy&&latest && (latest.stage==='underwater'?!ctx.oceanMode?.active:!ctx.boatMode?.active)){void leave({restore:false});return;}
  refresh();if(!active||busy||transition||!transport.isCurrent()||Date.now()-lastSent<2500)return;
  if(!owns('helm')&&!owns('pilot'))return;lastSent=Date.now();
  const sub=ctx.oceanMode?.submarine;const pilot=api.canPilot&&ctx.oceanMode?.active;
  void send(pilot?'pose':'heartbeat',pilot?{pose:{x:sub.position.x,y:sub.position.y,z:sub.position.z,yaw:sub.yaw}}:{}).catch(e=>{controlFault=true;error=e.message;refresh();});
 },500);
 refresh();return api;
}
