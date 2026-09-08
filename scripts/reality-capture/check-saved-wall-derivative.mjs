// Read-only staging evidence. Does not submit, approve, or start reconstruction.
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const project='we3d-staging-20260712';
const captureId='capture_d7a83f7f2adf291ac8d76e04a7cb3636';
const cli=createRequire('/opt/homebrew/lib/node_modules/firebase-tools/package.json');
const require=createRequire(import.meta.url);
const {decodeHybridPreview,normalizeHybridPreview}=require('../../functions/reality-capture-hybrid');
const {createPatchGlb}=require('../../functions/reality-capture-patch-derivative');
const account=cli('./lib/auth').getGlobalDefaultAccount();
await cli('./lib/requireAuth').requireAuth({project,user:account.user,tokens:account.tokens});
const {Client}=cli('./lib/apiv2');
const db=new Client({urlPrefix:'https://firestore.googleapis.com',auth:true});
const storage=new Client({urlPrefix:'https://storage.googleapis.com',auth:true});
function decode(v){
  if(v?.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));
  if(v?.arrayValue)return (v.arrayValue.values||[]).map(decode);
  if(v?.integerValue!==undefined)return Number(v.integerValue);
  return v?.stringValue??v?.timestampValue??v?.doubleValue??v?.booleanValue??null;
}
const doc=(await db.get(`/v1/projects/${project}/databases/(default)/documents/realityCaptures/${captureId}`)).body;
const capture={...decode({mapValue:doc}),captureId};
const preview=decodeHybridPreview(capture.hybridPreview);
if(!preview?.patches.length)throw Error('No saved wall photos.');
normalizeHybridPreview(capture,{...preview,baseRevision:preview.revision});
const glb=await createPatchGlb(capture,preview,async photo=>{
  const response=await storage.get(`/storage/v1/b/${project}.firebasestorage.app/o/${encodeURIComponent(photo.name)}?alt=media&generation=${photo.generation}`,{responseType:'stream',resolveOnHTTPError:true});
  if(response.status>=400)throw Error(`Private source read failed: ${response.status}`);
  const chunks=[];for await(const chunk of response.body)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);
});
const dir='output/verification/saved-house-walls';await mkdir(dir,{recursive:true});
await writeFile(`${dir}/walls.glb`,glb,{mode:0o600});
const jsonSize=glb.readUInt32LE(12);const model=JSON.parse(glb.subarray(20,20+jsonSize).toString());
const summary={captureId,revision:preview.revision,patches:preview.patches.length,meshes:model.meshes.length,images:model.images.length,bytes:glb.length,buildingId:capture.building.sourceBuildingId,sourceUpdateTime:doc.updateTime,cloudWrites:0,gpuJobs:0};
await writeFile(`${dir}/evidence.json`,JSON.stringify(summary,null,2),{mode:0o600});console.log(JSON.stringify(summary));
