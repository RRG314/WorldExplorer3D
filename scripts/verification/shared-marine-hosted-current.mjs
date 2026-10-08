// Staging-only HTTP authority/rules acceptance. SDK subscription and gameplay
// acceptance are separate gates; these fixtures do not claim room-creation UI.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const project='we3d-staging-20260712';
const config=JSON.parse(await readFile('config/firebase.staging.json','utf8'));
assert.equal(config.projectId,project);
assert.notEqual(process.env.WE3D_VERIFY_PRODUCTION,'1');
const cli=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/firebase-tools/package.json');
const {Client}=cli('./lib/apiv2'),auth=cli('./lib/auth'),{requireAuth}=cli('./lib/requireAuth');
const operator=auth.getGlobalDefaultAccount();await requireAuth({project,user:operator?.user,tokens:operator?.tokens});
const adminDb=new Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
const adminAuth=new Client({urlPrefix:'https://identitytoolkit.googleapis.com',auth:true});
const base=`/v1/projects/${project}/databases/(default)/documents`;
const roomCode=('T'+randomBytes(3).toString('hex').slice(0,5)).toUpperCase();
const roomPath=`rooms/${roomCode}`,marinePath=`${roomPath}/expeditions/marine`;
const users=[],ownedPaths=[];
const out='output/verification/product-plan/shared-marine-hosted';await mkdir(out,{recursive:true});
const report={ok:false,project,scope:'Actual hosted Functions and Firestore security rules with three disposable authenticated HTTP clients; admission records are explicit operator fixtures. SDK delivery and full game journey are separate emulator gates.',cases:[],cleanupErrors:[]};
const value=v=>v===null?{nullValue:null}:typeof v==='string'?{stringValue:v}:typeof v==='boolean'?{booleanValue:v}:typeof v==='number'?(Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v}):Array.isArray(v)?{arrayValue:{values:v.map(value)}}:{mapValue:{fields:fields(v)}};
const fields=v=>Object.fromEntries(Object.entries(v).map(([k,v])=>[k,value(v)]));
const timestamp=ms=>({timestampValue:new Date(ms).toISOString()});
async function fixture(path,data){if(!ownedPaths.includes(path))ownedPaths.push(path);await adminDb.patch(`${base}/${path}`,{fields:data});}
async function request(url,{user,body,method=body?'POST':'GET'}={}){
 const response=await fetch(url,{method,headers:{'content-type':'application/json',...(user?{authorization:`Bearer ${user.token}`}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 return {status:response.status,body:await response.json()};
}
const command=(type,revision=0,extra={})=>({type,revision,requestId:randomUUID(),...extra});
const post=(user,cmd)=>request(`https://us-central1-${project}.cloudfunctions.net/mutateSharedExpedition`,{user,body:{roomCode,domain:'marine',command:cmd}});
const doc=(user,path,body)=>request(`https://firestore.googleapis.com${base}/${path}`,{user,body,method:body?'PATCH':'GET'});
async function seat(user,expired=false){const now=Date.now();await fixture(`${roomPath}/players/${user.uid}`,{...fields({uid:user.uid,displayName:user.name,role:'member',mode:'walk',joinCode:roomCode,frame:{kind:'earth',locLat:-18.2861,locLon:147.7},pose:{x:0,y:0,z:0,yaw:0,pitch:0,vx:0,vy:0,vz:0}}),joinedAt:timestamp(now-60000),lastSeenAt:timestamp(now-10000),expiresAt:timestamp(expired?now-1:now+90000)});}
try{
 for(const name of ['captain','pilot','outsider']){
  const response=await request(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${config.apiKey}`,{body:{email:`release-marine-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url'),returnSecureToken:true}});
  assert.equal(response.status,200,`Disposable ${name} signup failed`);users.push({uid:response.body.localId,token:response.body.idToken,name});
 }
 const [captain,pilot,outsider]=users;
 await fixture(roomPath,fields({code:roomCode,ownerUid:captain.uid,visibility:'private',maxPlayers:6,world:{kind:'earth',lat:-18.2861,lon:147.7}}));
 await seat(captain,true);await seat(pilot);
 assert.equal((await post(null,command('create'))).status,401);
 assert.equal((await post(captain,command('create'))).status,409);
 assert.equal((await post(outsider,command('create'))).status,403);
 report.cases.push('Unsigned, expired-seat and outsider mutations denied');
 await seat(captain);ownedPaths.push(marinePath);
 const created=await post(captain,command('create'));assert.equal(created.status,200);assert.equal(created.body.state.stage,'aboard');
 const joined=await post(pilot,command('join'));assert.equal(joined.status,200);
 const claimCommand=command('claim',joined.body.state.controlRevision,{seat:'pilot'});
 const claimed=await post(pilot,claimCommand);assert.equal(claimed.status,200);
 const replay=await post(pilot,claimCommand);assert.equal(replay.status,200);assert.equal(replay.body.state.revision,claimed.body.state.revision);
 assert.equal((await post(captain,command('claim',claimed.body.state.controlRevision,{seat:'pilot'}))).status,409);
 assert.equal((await post(captain,command('deploy',0))).status,409);
 report.cases.push('Real hosted crew create/join, exclusive pilot, stale revision and idempotent replay');
 assert.equal((await doc(captain,marinePath)).status,200);assert.equal((await doc(pilot,marinePath)).status,200);
 assert.equal((await doc(outsider,marinePath)).status,403);
 assert.equal((await doc(pilot,marinePath,{fields:fields({revision:999,manifest:[{id:'forged'}]})})).status,403);
 report.cases.push('Hosted Firestore admits crew reads and denies outsider reads and forged voyage writes');
 const presence=await doc(pilot,`${roomPath}/players/${pilot.uid}`);assert.equal(presence.status,200);
 const updated={...presence.body.fields,mode:value('ocean'),frame:value({kind:'ocean',locLat:-18.2861,locLon:147.7,interiorKey:'marine:hosted-check:underwater',interiorFloorId:'',interiorFloorLevel:0}),pose:value({x:0,y:-12,z:-65,yaw:0,pitch:0,vx:0,vy:0,vz:0}),lastSeenAt:timestamp(Date.now())};
 assert.equal((await doc(pilot,`${roomPath}/players/${pilot.uid}`,{fields:updated})).status,200);
 report.cases.push('Hosted rules accept admitted Ocean presence');
 const retained=await doc(captain,marinePath);assert.equal(retained.body.fields.revision.doubleValue??Number(retained.body.fields.revision.integerValue),claimed.body.state.revision);
 report.cases.push('Rejected writes preserve the accepted server revision');report.ok=true;
}catch(error){report.failure=String(error.message||error);process.exitCode=1;}
finally{
 for(const path of ownedPaths.reverse())try{await adminDb.delete(`${base}/${path}`);}catch{report.cleanupErrors.push(`Fixture cleanup failed: ${path}`);}
 for(const user of users)try{await adminAuth.post(`/v1/projects/${project}/accounts:delete`,{localId:user.uid});}catch{report.cleanupErrors.push(`Disposable ${user.name} (${user.uid}) cleanup failed`);}
 if(report.cleanupErrors.length){report.ok=false;process.exitCode=1;}
 report.completedAt=new Date().toISOString();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
