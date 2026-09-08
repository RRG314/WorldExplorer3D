// One owner-authorized staging replay of an existing frozen input manifest.
// No upload duplication, production action, auto-retry, or public publication.
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const project='we3d-staging-20260712',sourceId='capture_be8fe76770d9db092d58f314f236be0b';
const out='output/verification/reconstruction-cost-test',statePath=out+'/run.json';
const cli=createRequire('/opt/homebrew/lib/node_modules/firebase-tools/package.json');
const account=cli('./lib/auth').getGlobalDefaultAccount();await cli('./lib/requireAuth').requireAuth({project,user:account?.user,tokens:account?.tokens});
const {Client}=cli('./lib/apiv2');const db=new Client({urlPrefix:'https://firestore.googleapis.com',auth:true}),run=new Client({urlPrefix:'https://run.googleapis.com',auth:true});
const base='/v1/projects/'+project+'/databases/(default)/documents',job='/v2/projects/'+project+'/locations/us-central1/jobs/capture-meshroom';
let state=await readFile(statePath,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(process.argv[2]==='start'){
  if(state)throw Error('A cost-test record already exists; inspect status instead of starting another paid run.');
  const [source,lease,config]=await Promise.all([db.get(base+'/realityCaptures/'+sourceId),db.get(base+'/captureProcessing/control'),run.get(job)]);
  if(lease.body.fields.captureId?.stringValue)throw Error('A reconstruction is already active.');
  const f=source.body.fields;if(f.status?.stringValue!=='review_required'||f.inputManifest?.arrayValue?.values?.length!==21)throw Error('Unexpected source capture state.');
  const t=config.body.template.template;
  if(t.maxRetries!==0||t.timeout!=='1800s'||t.containers[0].resources.limits.cpu!=='4'||t.containers[0].resources.limits.memory!=='16Gi')throw Error('Unexpected cost or retry configuration.');
  const id='capture_'+randomBytes(16).toString('hex'),now=new Date().toISOString(),fields={};
  for(const key of ['ownerUid','ownerDisplayName','captureSchemaVersion','captureKind','building','buildingDetails','exteriorScope','room','consent','limits','inputManifest','uploadSummary','processingPipelineVersion'])if(f[key])fields[key]=f[key];
  Object.assign(fields,{captureId:{stringValue:id},status:{stringValue:'queued'},capturePrivacy:{stringValue:'PRIVATE'},accessMode:{stringValue:'PRIVATE'},spaceId:{stringValue:''},publicContributionRequested:{booleanValue:false},createdAt:{timestampValue:now},updatedAt:{timestampValue:now},queuedAt:{timestampValue:now},testRun:{mapValue:{fields:{purpose:{stringValue:'owner-authorized reconstruction cost replay'},sourceCaptureId:{stringValue:sourceId},reusesFrozenSourceManifest:{booleanValue:true}}}}});
  state={project,captureId:id,sourceCaptureId:sourceId,sourceUpdateTime:source.body.updateTime,requestedAt:now,configuration:{image:t.containers[0].image,limits:t.containers[0].resources.limits,timeout:t.timeout,maxRetries:t.maxRetries},scope:'reconstruction-only; originals referenced, not copied; source capture unchanged'};
  await mkdir(out,{recursive:true});await writeFile(statePath,JSON.stringify(state,null,2));
  // A failed/uncertain creation leaves the journal; never silently run twice.
  await db.post(base+':commit',{writes:[{update:{name:base.slice(4)+'/realityCaptures/'+id,fields},currentDocument:{exists:false}}]});
  console.log(JSON.stringify({started:true,captureId:id,photos:21,queuedAt:now}));
}else if(process.argv[2]==='status'){
  if(!state)throw Error('No test started.');
  const [record,executions]=await Promise.all([db.get(base+'/realityCaptures/'+state.captureId),run.get(job+'/executions?pageSize=10')]);
  const f=record.body.fields;
  const listed=executions.body.executions?.find(e=>e.template?.containers?.some(c=>c.env?.some(v=>v.name==='CAPTURE_ID'&&v.value===state.captureId)));
  const execution=listed ? (await run.get('/v2/'+listed.name)).body : null;
  const info={captureId:state.captureId,status:f.status?.stringValue,attemptId:f.processingAttemptId?.stringValue,execution:execution?.name,startTime:execution?.startTime,completionTime:execution?.completionTime,succeededCount:execution?.succeededCount,failedCount:execution?.failedCount,hasModel:!!f.processed?.mapValue?.fields?.optimizedModelPath,inspection:f.processed?.mapValue?.fields?.modelInspection,failure:f.failure};
  if(execution)state.execution=execution.name;state.lastStatus=info;await writeFile(statePath,JSON.stringify(state,null,2));console.log(JSON.stringify(info));
}else throw Error('Use start or status.');
