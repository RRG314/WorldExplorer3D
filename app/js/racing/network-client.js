import {RACE_PHYSICS_VERSION,isCurrentRacePhysicsVersion} from './record-rules.js';

// A connection belongs to one account, world and room. Retry is pumped by the
// existing gameplay update; there is no additional browser frame/timer loop.
export function createRaceConnection({uid,endpoint,credentials,join,isCurrent,WebSocketClass=globalThis.WebSocket,
 physicsVersion=RACE_PHYSICS_VERSION,
 now=()=>Date.now(),onSnapshot=()=>{},onError=()=>{},onConnection=()=>{}}) {
 const url=new URL(endpoint);
 if(!isCurrentRacePhysicsVersion(physicsVersion))throw Error('race_physics_version_changed');
 const loopback=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.pathname!=='/race'||url.search||url.hash||url.username||url.password||!(url.protocol==='wss:'||url.protocol==='ws:'&&loopback))throw Error('race_secure_service_required');
 let socket=null,revision=0,disposed=false,connecting=false,nextAttempt=0,attempts=0,latest=null,receivedAt=0,joined=false,sequence=0,lastSent=-Infinity;
 const active=()=>!disposed&&isCurrent();
 function send(message){if(active()&&socket?.readyState===1){socket.send(JSON.stringify(message));return true;}return false;}
 function stop(reason='race_connection_closed'){
  if(disposed)return;send({type:'leave'});disposed=true;revision++;socket?.close(1000,reason.slice(0,100));socket=null;joined=false;onConnection('closed');
 }
 async function connect(){
  if(!active()||connecting||now()<nextAttempt)return;
  // Frames keep pumping while Auth/App Check refresh over the network. Own
  // that wait before yielding; an old/zero deadline otherwise cancels the
  // credential request on the next frame, before a socket can even open.
  connecting=true;nextAttempt=now()+10000;const request=++revision;
  try {
   const identity=await credentials();if(!active()||request!==revision)return;
   const ws=new WebSocketClass(url.href);socket=ws;
   ws.addEventListener('open',()=>{if(!active()||request!==revision){ws.close();return;}ws.send(JSON.stringify({type:'authenticate',...identity}));});
   ws.addEventListener('message',event=>{
    if(!active()||request!==revision)return;
    try {
     if(typeof event.data!=='string'||event.data.length>256*1024)throw Error('invalid_race_snapshot');
     const message=JSON.parse(event.data);
     if(message.type==='authenticated'){if(message.uid!==uid)throw Error('race_account_changed');send({type:'join',...join,...(latest?{sessionId:latest.id}:{})});return;}
     if(message.type==='error'){onError(message.reason);return;}
     if(!['joined','snapshot'].includes(message.type))return;
     const state=message.snapshot;
     if(state?.physicsVersion!==physicsVersion||state.courseId!==join.courseId||!Array.isArray(state.players)||state.players.length>4||!state.players.some(p=>p.uid===uid)||
      !Number.isFinite(state.serverAtMs)||latest&&state.id===latest.id&&state.serverAtMs<latest.serverAtMs)throw Error('invalid_race_snapshot');
     if(latest&&latest.id!==state.id)throw Error('race_session_replaced');
     const newlyJoined=!joined;latest=state;receivedAt=now();joined=true;connecting=false;attempts=0;sequence=Math.max(sequence,(state.players.find(p=>p.uid===uid).lastInputSequence||0)+1);
     if(newlyJoined)onConnection('connected');onSnapshot(state,message.course||null);
    }catch(error){onError(error.message);stop('race_protocol_error');}
   });
   ws.addEventListener('error',()=>{});
   ws.addEventListener('close',()=>{if(!active()||request!==revision)return;socket=null;joined=false;connecting=false;nextAttempt=now()+Math.min(2000,500*++attempts);onConnection('reconnecting');});
   nextAttempt=now()+5000;
  }catch{if(active()&&request===revision){connecting=false;nextAttempt=now()+1000;attempts++;onConnection('reconnecting');}}
 }
 return Object.freeze({connect,stop,send,snapshot:()=>latest,receivedAt:()=>receivedAt,connected:()=>joined,isFresh:()=>joined&&now()-receivedAt<=500,
  pump(){if(!active()){stop('race_session_changed');return;}
   if(joined&&now()-receivedAt>5000){const previous=socket;revision++;socket=null;joined=false;connecting=false;nextAttempt=now()+500;attempts++;previous?.close();onConnection('reconnecting');}
   if(connecting&&now()>=nextAttempt){socket?.close();socket=null;connecting=false;revision++;attempts++;}
   if(attempts>=6){onError('race_reconnect_expired');stop('race_reconnect_expired');return;}if(!socket&&!connecting)void connect();},
  control(actions){if(!joined||!['countdown','running'].includes(latest?.phase)||now()-lastSent<50)return false;
   const player=latest.players.find(p=>p.uid===uid);if(player?.dnf||player?.progress?.finished)return false;
   const controls={steer:actions.steer||0,throttle:actions.throttle||0,reverse:actions.reverse||0,brake:actions.brake||0,serviceBrake:actions.serviceBrake||0};
   if(send({type:'control',sequence:sequence++,actions:controls})){lastSent=now();return true;}return false;}
 });
}
