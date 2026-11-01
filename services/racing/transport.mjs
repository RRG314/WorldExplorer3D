import http from 'node:http';
import {WebSocketServer} from 'ws';
import {createRaceAuthority} from './authority.mjs';

// The only service scheduler. Browser rendering/prediction remains on the
// existing gameplay frame; Firestore remains the room and result control plane.
export function createRaceServer({authenticate,store,origins,now=()=>Date.now(),tickMs=1000/60,peerTimeoutMs=15000}){
 if(!Array.isArray(origins)||!origins.length)throw Error('race_origins_required');
 const authority=createRaceAuthority({store,now}),clients=new Set(),polls=new Map();let stopping=false;
 const server=http.createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.writeHead(req.url==='/health'&&!stopping?200:404,{'Content-Type':'application/json'});res.end(JSON.stringify({ready:!stopping}));});
 const wss=new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
 server.on('upgrade',(req,socket,head)=>{
  if(stopping||clients.size>=40||req.url!=='/race'||!origins.includes(req.headers.origin)){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
 });
 wss.on('connection',ws=>{
  let client=null,authenticating=false,lastWindow=now(),messages=0,chain=Promise.resolve(),closed=false,queued=0,verifyAgain=null,lastVerified=now(),verifying=false;
  let lastPong=now(),nextPing=now()+5000;
  ws.on('pong',()=>{lastPong=now();});
  clients.add(ws);const deadline=setTimeout(()=>ws.close(1008,'race_auth_required'),5000);
  const send=payload=>{if(ws.readyState===1){if(ws.bufferedAmount>128*1024){ws.close(1013,'race_connection_slow');return;}ws.send(JSON.stringify(payload));}};
  ws.on('error',()=>{});
  ws.on('message',(bytes,isBinary)=>{
   const at=now();if(at-lastWindow>=1000){lastWindow=at;messages=0;}
   if(isBinary||++messages>40){ws.close(1008,'race_message_limit');return;}
   if(!client){
    if(authenticating){ws.close(1008,'race_auth_pending');return;}authenticating=true;
    void (async()=>{
     let input;try{input=JSON.parse(bytes.toString());}catch{throw Error('race_auth_required');}
     if(!input||input.type!=='authenticate'||Object.keys(input).some(k=>!['type','idToken','appCheckToken'].includes(k))||
       typeof input.idToken!=='string'||!input.idToken||input.idToken.length>5000||typeof input.appCheckToken!=='string'||!input.appCheckToken||input.appCheckToken.length>3000)throw Error('race_auth_required');
     const verified=await authenticate(input);if(closed)return;
     if(!verified?.uid||!Number.isFinite(verified.expiresAtMs)||verified.expiresAtMs<=now())throw Error('race_auth_expired');
     client={uid:verified.uid,expiresAtMs:verified.expiresAtMs,isOpen:()=>!closed&&ws.readyState===1,send,close:reason=>ws.close(1008,reason),race:null};clearTimeout(deadline);send({type:'authenticated',uid:client.uid});
     verifyAgain=()=>authenticate(input);
    })().catch(()=>ws.close(1008,'race_auth_rejected'));return;
   }
   if(at>=client.expiresAtMs){ws.close(1008,'race_auth_expired');return;}
   // Commands from one socket retain order across async admission/storage.
   if(queued>=32){ws.close(1008,'race_message_limit');return;}
   queued++;const raw=bytes.toString();chain=chain.then(()=>{if(!closed)return authority.command(client,raw);}).catch(error=>send({type:'error',reason:/^race_|^invalid_|^obsolete_/.test(error.message)?error.message:'race_request_failed'})).finally(()=>queued--);
  });
  polls.set(ws,()=>{
   if(!client||closed)return;
   if(now()>=client.expiresAtMs){ws.close(1008,'race_auth_expired');return;}
   if(now()-lastPong>peerTimeoutMs){ws.terminate();return;}
   if(now()>=nextPing&&ws.readyState===1){nextPing=now()+5000;ws.ping();}
   if(!verifying&&verifyAgain&&now()-lastVerified>=30000){verifying=true;lastVerified=now();
    void verifyAgain().then(result=>{if(!closed&&(result.uid!==client.uid||result.expiresAtMs<=now()))ws.close(1008,'race_auth_expired');},()=>ws.close(1008,'race_auth_rejected')).finally(()=>{verifying=false;});}
  });
  ws.on('close',()=>{closed=true;clearTimeout(deadline);clients.delete(ws);polls.delete(ws);if(client)authority.detach(client);});
 });
 const timer=setInterval(()=>{for(const poll of polls.values())poll();authority.tick();for(const ws of clients)if(ws.readyState!==1)clients.delete(ws);},tickMs);
 async function close(){stopping=true;clearInterval(timer);await authority.close();for(const ws of clients)ws.close(1001,'race_service_stopping');wss.close();await new Promise(resolve=>server.close(resolve));}
 return {server,authority,close};
}
