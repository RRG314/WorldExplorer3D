// One-time operator action, explicitly authorized by the owner in this task.
// Uses existing Firebase CLI IAM credentials, not a forged application identity.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {stableId,assertCaptureTransition,normalizeReviewedAlignment}=require('../../functions/reality-capture-authority');
const cli=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/firebase-tools/package.json');
const operator=cli('./lib/auth').getGlobalDefaultAccount();
const project='worldexplorer3d-d9b83',captureId='capture_bb2ff178804fb34b1b1ced436970f9d7';
await cli('./lib/requireAuth').requireAuth({project,user:operator?.user,tokens:operator?.tokens});
const {Client}=cli('./lib/apiv2');
const db=new Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
const storage=new Client({urlPrefix:'https://storage.googleapis.com',auth:true});
const root=`projects/${project}/databases/(default)/documents`;
function decode(v){if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if(v.arrayValue)return(v.arrayValue.values||[]).map(decode);if(v.integerValue!==undefined)return Number(v.integerValue);return v.stringValue??v.doubleValue??v.booleanValue??v.timestampValue??null;}
function encode(v){if(v===null)return{nullValue:null};if(Array.isArray(v))return{arrayValue:{values:v.map(encode)}};if(typeof v==='object')return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};if(typeof v==='number')return{doubleValue:v};if(typeof v==='boolean')return{booleanValue:v};return{stringValue:String(v)};}
async function read(name,transaction){try{return(await db.get('/v1/'+name,{queryParams:transaction?{transaction}:{}})).body;}catch(e){if(e.status===404||e.context?.response?.statusCode===404)return null;throw e;}}
const capName=`${root}/realityCaptures/${captureId}`;
const original=await read(capName),capture=decode({mapValue:{fields:original.fields}});
if(capture.status==='approved'){console.log('Already approved; no writes.');process.exit(0);}
const hybrid=capture.hybridSubmission;
if(capture.captureKind!=='exterior'||capture.publicContributionRequested!==true||hybrid?.revision!==1||hybrid.status!=='review_required')throw Error('Unexpected target state; stopping.');
assertCaptureTransition(capture.status,'approved');
const {body:asset}=await storage.get(`/storage/v1/b/${project}.firebasestorage.app/o/${encodeURIComponent(hybrid.modelPath)}`,{queryParams:{generation:String(hybrid.modelGeneration)}});
if(String(asset.generation)!==String(hybrid.modelGeneration)||Number(asset.size)<=0)throw Error('Model generation mismatch');
const representationId=stableId('patch-representation',capture.building.sourceBuildingId,captureId);
const manifestName=`${root}/buildingPatchManifests/${stableId('building-patches',capture.building.sourceBuildingId)}`;
const {body:{transaction}}=await db.post(`/v1/${root}:beginTransaction`,{});
const latest=await read(capName,transaction);
if(latest.updateTime!==original.updateTime)throw Error('Capture changed during review');
const old=await read(manifestName,transaction),previous=old?decode({mapValue:{fields:old.fields}}).regions||[]:[];
const regions=hybrid.patches.map(p=>{const a=hybrid.footprint[p.wall],b=hybrid.footprint[(p.wall+1)%hybrid.footprint.length];const one=[a.x,a.z].map(n=>n.toFixed(2)).join(','),two=[b.x,b.z].map(n=>n.toFixed(2)).join(',');return{captureId,edge:[one,two].sort().join('|'),left:one<two?p.region[0]:1-p.region[2],right:one<two?p.region[2]:1-p.region[0],bottom:p.region[1]*hybrid.heightMeters,top:p.region[3]*hybrid.heightMeters};});
const retained=previous.filter(p=>p.captureId!==captureId);
if(retained.some(a=>regions.some(b=>a.edge===b.edge&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>.001&&Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom)>.01)))throw Error('Existing approved patches overlap');
if(retained.length+regions.length>128)throw Error('Patch budget exceeded');
const actor=`operator:${operator.user.email}`,alignment=normalizeReviewedAlignment({},'exterior');
function write(name,data,timestamp,mask){return{update:{name,fields:encode(data).mapValue.fields},...(mask?{updateMask:{fieldPaths:Object.keys(data)}}:{}),updateTransforms:[{fieldPath:timestamp,setToServerValue:'REQUEST_TIME'}]};}
const writes=[
 write(capName,{status:'approved',review:{decision:'approved',note:'Latest exterior approved for live game testing by explicit owner request.',alignment,moderatorUid:actor,moderatorName:'Authorized Firebase operator'},hybridSubmission:{...hybrid,status:'approved'}},'updatedAt',true),
 write(`${root}/buildingRepresentations/${representationId}`,{representationId,captureId,captureKind:'exterior',canonicalBuilding:capture.building,modelPath:hybrid.modelPath,modelGeneration:hybrid.modelGeneration,sha256:hybrid.sha256,representationKind:'facade-patches',revision:hybrid.revision,footprint:hybrid.footprint,patchHeightMeters:hybrid.heightMeters,patchCount:hybrid.patches.length,alignment,status:'approved',visibility:'public',captureSchemaVersion:capture.captureSchemaVersion,processingPipelineVersion:capture.processingPipelineVersion||'',approvedBy:actor},'approvedAt'),
 write(manifestName,{sourceBuildingId:capture.building.sourceBuildingId,regions:[...retained,...regions]},'updatedAt'),
 write(`${root}/adminActivity/${stableId('operator-approval',captureId,'1')}`,{actorUid:actor,actorName:'Authorized Firebase operator',actionType:'reality_capture.approved',targetType:'reality_capture',targetId:captureId,title:'Exterior approved by owner request',summary:'Revision 1 published for live game testing',createdAtMs:Date.now()},'createdAt')
];
await db.post(`/v1/${root}:commit`,{transaction,writes});
const verified=decode({mapValue:{fields:(await read(capName)).fields}});
console.log(JSON.stringify({captureId,status:verified.status,representationId,patches:regions.length,lat:capture.building.lat,lon:capture.building.lon}));
