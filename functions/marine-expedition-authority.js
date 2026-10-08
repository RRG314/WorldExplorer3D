'use strict';
// First shared marine contract: one anchored Coral Shelf research vessel and
// one submarine. This record never grants personal inventory or Journal credit.
const {createHash}=require('node:crypto');
const SITE=Object.freeze({lat:-18.2861,lon:147.7,name:'Coral Shelf · authored study'});
const TARGETS=Object.freeze({'table-garden':{x:-38,z:66},'branch-ridge':{x:36,z:112},'seagrass-edge':{x:-46,z:157}});
const LEASE_MS=15000;
function fail(message,status=409){throw Object.assign(new Error(message),{status});}
function finitePose(p){return p && ['x','y','z','yaw'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k])) && Math.hypot(p.x,p.z)<=1200 && p.y<=-1 && p.y>=-210 && Math.abs(p.yaw)<=10000;}
function mutateMarineExpedition(current,{roomCode,uid,displayName='Explorer',command={},activeUids=[],nowMs=Date.now(),newId}={}) {
 if(!activeUids.includes(uid))fail('An active room seat is required.',403);
 const type=String(command.type||''),requestId=String(command.requestId||'');
 if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(requestId))fail('A valid command identity is required.',422);
 const encoded=JSON.stringify(command);if(encoded.length>2048)fail('Marine command is too large.',422);
 const hash=createHash('sha256').update(encoded).digest('hex');
 const receipt=current?.receipts?.find(r=>r.uid===uid&&r.id===requestId);
 if(receipt){if(receipt.hash!==hash)fail('This command identity was already used for another request.',422);return current;}
 let state;
 if(type==='create'){
  if(current)fail('This room already has a marine expedition. Join its crew.');
  if(typeof newId!=='string'||!newId)fail('Expedition identity unavailable.',422);
  state={type:'SharedMarineExpedition',version:1,id:newId,roomCode,revision:0,controlRevision:0,createdAtMs:nowMs,updatedAtMs:nowMs,stage:'aboard',deployment:0,site:{...SITE},
   ship:{id:`ship:${newId}`,catalogId:'ocean-research-vessel',anchor:{lat:SITE.lat,lon:SITE.lon},yaw:0},
   submarine:{id:`sub:${newId}`,pose:{x:0,y:-12,z:-65,yaw:0},poseAtMs:nowMs,speed:0},
   crew:{[uid]:{name:String(displayName).slice(0,48),joinedAtMs:nowMs}},seats:{helm:{uid,untilMs:nowMs+LEASE_MS},pilot:null},manifest:[],rescues:[],receipts:[]};
 }else{
  if(!current||current.type!=='SharedMarineExpedition'||current.roomCode!==roomCode)fail('No marine expedition exists in this room.',404);
  state=JSON.parse(JSON.stringify(current));
  if(type!=='join'&&!state.crew[uid])fail('Join this marine crew first.',403);
  if(type!=='join'&&type!=='heartbeat'&&type!=='pose'&&Number(command.revision)!==state.controlRevision)fail('The voyage changed. Refresh and try again.');
  const live=seat=>seat && seat.untilMs>nowMs && activeUids.includes(seat.uid);
  const owns=seat=>live(state.seats[seat]) && state.seats[seat].uid===uid;
  if(type==='join'){
   if(!state.crew[uid] && Object.keys(state.crew).length>=12)fail('The marine crew is full.');
   state.crew[uid] ||= {name:String(displayName).slice(0,48),joinedAtMs:nowMs};
  }else if(type==='claim'){
   if(state.stage==='complete')fail('This survey is complete. Its report is retained.');
   if(!['helm','pilot'].includes(command.seat))fail('Choose helm or submarine pilot.',422);
   const seat=state.seats[command.seat];if(live(seat)&&seat.uid!==uid)fail('Another active crewmate holds this seat.');
   state.seats[command.seat]={uid,untilMs:nowMs+LEASE_MS};
  }else if(type==='release'){
   if(!['helm','pilot'].includes(command.seat)||state.seats[command.seat]?.uid!==uid)fail('You do not hold this seat.',403);
   state.seats[command.seat]=null;
  }else if(type==='heartbeat'){
   if(!owns('helm')&&!owns('pilot'))fail('Your control lease has expired. Claim an available seat.');
  }else if(type==='deploy'){
   if(!owns('helm'))fail('Only the helm can deploy the shared submarine.',403);
   if(state.stage!=='aboard'||!live(state.seats.pilot))fail('An aboard voyage and active submarine pilot are required.');
   if(Object.keys(state.crew).filter(id=>activeUids.includes(id)).length<2)fail('Two active crewmates are required to deploy.');
   state.stage='underwater';state.deployment++;state.submarine.poseAtMs=nowMs;state.submarine.speed=0;
  }else if(type==='pose'){
   if(state.stage!=='underwater'||!owns('pilot'))fail('Only the active submarine pilot can move this craft.',403);
   if(command.deployment!==state.deployment)fail('This submarine deployment has ended.');
   const p=command.pose,old=state.submarine.pose;
   if(!finitePose(p))fail('Submarine pose is outside this expedition.',422);
   const elapsed=Math.max(.001,Math.min(5,(nowMs-state.submarine.poseAtMs)/1000));
   const distance=Math.hypot(p.x-old.x,p.y-old.y,p.z-old.z);
   if(distance>elapsed*34+2)fail('Submarine movement exceeds its travel envelope.',422);
   state.submarine={...state.submarine,pose:{x:p.x,y:p.y,z:p.z,yaw:p.yaw},poseAtMs:nowMs,speed:distance/elapsed};
  }else if(type==='scan'){
   const target=TARGETS[command.target];
   if(!target)fail('Unknown study site.',422);
   if(state.stage!=='underwater'||!live(state.seats.pilot)||nowMs-state.submarine.poseAtMs>5000)fail('Wait for a connected pilot and current submarine position.');
   const p=state.submarine.pose;
   if(Math.hypot(p.x-target.x,p.z-target.z)*1.1132>18||state.submarine.speed>.6)fail('Stop the shared submarine within 18 m of the study marker.');
   if(!state.manifest.some(r=>r.id===command.target))state.manifest.push({id:command.target,by:uid,atMs:nowMs,truthType:'authored',kind:'shared-habitat-observation'});
  }else if(type==='recover'){
   if(state.stage!=='underwater')fail('The submarine is already aboard.');
   if(!owns('helm')&&live(state.seats.pilot))fail('Ask the helm to recover, or wait for the pilot lease to expire.',403);
   const rescue=!live(state.seats.pilot);
   if(rescue){if(state.rescues.length>=24)fail('This expedition has reached its rescue history limit.');state.rescues.push({id:requestId,by:uid,atMs:nowMs,reason:'pilot-unavailable'});}
   state.stage='aboard';state.submarine.pose={x:0,y:-12,z:-65,yaw:0};state.submarine.poseAtMs=nowMs;state.submarine.speed=0;
  }else if(type==='report'){
   if(!owns('helm'))fail('Only the helm can submit the shared report.',403);
   if(state.stage!=='aboard'||state.manifest.length!==3)fail('Recover aboard with all three shared observations first.');
   state.stage='complete';state.report={by:uid,atMs:nowMs,observations:3};state.seats={helm:null,pilot:null};
  }else fail('Unknown marine command.',422);
  for(const seat of Object.values(state.seats))if(live(seat)&&seat.uid===uid)seat.untilMs=nowMs+LEASE_MS;
 }
 // Pose/lease publications do not invalidate discrete crew decisions.
 // Structural commands still compare a shared revision in this transaction.
 state.revision++;if(type!=='pose'&&type!=='heartbeat')state.controlRevision++;state.updatedAtMs=nowMs;
 state.receipts=[...state.receipts,{id:requestId,uid,hash}].slice(-64);
 return state;
}
module.exports={mutateMarineExpedition,SITE,TARGETS,LEASE_MS};
