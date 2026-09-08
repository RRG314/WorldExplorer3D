// Read-only cloud evidence for the single explicitly requested staging replay.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='output/verification/reconstruction-cost-test';
const state=JSON.parse(await readFile(dir+'/run.json','utf8'));
if(state.project!=='we3d-staging-20260712'||!state.execution)throw Error('Expected staging replay journal.');
const cli=createRequire('/opt/homebrew/lib/node_modules/firebase-tools/package.json');
const a=cli('./lib/auth').getGlobalDefaultAccount();await cli('./lib/requireAuth').requireAuth({project:state.project,user:a.user,tokens:a.tokens});
const {Client}=cli('./lib/apiv2');const client=urlPrefix=>new Client({urlPrefix,auth:true});
const decode=v=>v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):v?.arrayValue?(v.arrayValue.values||[]).map(decode):v?.stringValue??v?.timestampValue??v?.integerValue??v?.doubleValue??v?.booleanValue??null;
const db=client('https://firestore.googleapis.com');
const base='/v1/projects/'+state.project+'/databases/(default)/documents/realityCaptures/';
const record=decode({mapValue:(await db.get(base+state.captureId)).body});
const execution=(await client('https://run.googleapis.com').get('/v2/'+state.execution)).body;
const end=execution.completionTime||new Date().toISOString();
const filter='metric.type="run.googleapis.com/container/billable_instance_time" AND resource.type="cloud_run_job" AND resource.labels.job_name="capture-meshroom" AND resource.labels.location="us-central1"';
// Include the final sampling interval after job completion. This job must remain
// isolated from other executions during the measurement window.
const params=new URLSearchParams({filter,'interval.startTime':state.requestedAt,'interval.endTime':new Date().toISOString(),pageSize:'1000'});
let metrics,metricError;
try{metrics=(await client('https://monitoring.googleapis.com').get('/v3/projects/'+state.project+'/timeSeries?'+params)).body;}catch(e){metricError=e.message;}
const points=(metrics?.timeSeries||[]).flatMap(s=>s.points||[]);
const billableSeconds=points.reduce((sum,p)=>sum+Number(p.value.doubleValue||0),0);
const wallSeconds=execution.completionTime?(Date.parse(end)-Date.parse(execution.startTime))/1000:null;
const evidence={captureId:state.captureId,execution:state.execution,status:record.status,collectedAt:new Date().toISOString(),startTime:execution.startTime,completionTime:execution.completionTime,wallSeconds,photoCount:record.inputManifest?.length,inputBytes:record.inputManifest?.reduce((s,x)=>s+Number(x.size||0),0),processed:record.processed,metricError,metrics,billableSecondsReportedSoFar:billableSeconds,computeRateUsdPerSecond:0.0002907,computeEstimateFromReportedMetric:billableSeconds*.0002907,computeEstimateFromExecutionWallTime:wallSeconds===null?null:wallSeconds*.0002907,pricingSource:'https://cloud.google.com/run/pricing',limitations:'List-price compute estimate, not posted invoice. Metrics can lag 120 seconds; check final points. Isolated job interval, not per-execution metric labels. Excludes storage, supporting services and credits.'};
evidence.sourceCaptureUnchanged=(await db.get(base+state.sourceCaptureId)).body.updateTime===state.sourceUpdateTime;
if(record.processed?.optimizedModelPath&&process.argv.includes('--download')){
 const g=client('https://storage.googleapis.com'),path='/storage/v1/b/'+state.project+'.firebasestorage.app/o/'+encodeURIComponent(record.processed.optimizedModelPath);
 const meta=(await g.get(path)).body;
 const r=await g.get(path+'?alt=media&generation='+meta.generation,{responseType:'stream',resolveOnHTTPError:true});
 if(r.status>=400)throw Error('Private model download failed: '+r.status);
 const chunks=[];for await(const chunk of r.body)chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
 await writeFile(dir+'/result.glb',bytes,{mode:0o600});evidence.model={bytes:bytes.length,generation:meta.generation,sha256:createHash('sha256').update(bytes).digest('hex')};
}
await writeFile(dir+'/evidence.json',JSON.stringify(evidence,null,2),{mode:0o600});
console.log(JSON.stringify({...evidence,metrics:undefined,processed:record.processed?{modelInspection:record.processed.modelInspection}:null}));
