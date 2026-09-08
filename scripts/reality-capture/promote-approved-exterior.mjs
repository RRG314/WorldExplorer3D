// Explicit one-contribution promotion. Never removes staging data, imports users,
// bypasses approval, or overwrites a destination document/object.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const id=process.argv[2],apply=process.argv.includes('--apply');
if(!/^capture_[a-f0-9]{32}$/.test(id||''))throw Error('Exact approved capture ID required');
const source='we3d-staging-20260712',target='worldexplorer3d-d9b83';
const cli=createRequire(execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim()+'/firebase-tools/package.json');
const auth=cli('./lib/auth'),{requireAuth}=cli('./lib/requireAuth'),{Client}=cli('./lib/apiv2');
const operator=auth.getGlobalDefaultAccount();await requireAuth({project:source,user:operator?.user,tokens:operator?.tokens});
const db=new Client({urlPrefix:'https://firestore.googleapis.com',auth:true}),identity=new Client({urlPrefix:'https://identitytoolkit.googleapis.com',auth:true}),storage=new Client({urlPrefix:'https://storage.googleapis.com',auth:true});
const root=p=>`projects/${p}/databases/(default)/documents`;
const capture=(await db.get(`/v1/${root(source)}/realityCaptures/${id}`)).body;
const f=capture.fields,owner=f.ownerUid.stringValue;
if(f.captureKind.stringValue!=='exterior'||f.status.stringValue!=='approved'||f.publicContributionRequested.booleanValue!==true)throw Error('Approved public exterior required');
const user=(await identity.post(`/v1/projects/${source}/accounts:lookup`,{localId:[owner]})).body.users?.[0];
if(!user?.email)throw Error('Source identity missing');
const users=(await identity.post(`/v1/projects/${target}/accounts:lookup`,{email:[user.email]})).body.users||[];
if(users.length!==1)throw Error('Unique existing production account required');
const targetOwner=users[0].localId;
const reps=(await db.post(`/v1/${root(source)}:runQuery`,{structuredQuery:{from:[{collectionId:'buildingRepresentations'}],where:{fieldFilter:{field:{fieldPath:'captureId'},op:'EQUAL',value:{stringValue:id}}}}})).body.filter(x=>x.document).map(x=>x.document);
if(reps.length!==1||reps[0].fields.status.stringValue!=='approved'||reps[0].fields.representationKind.stringValue!=='facade-patches')throw Error('One approved manual revision required');
const collections=(await db.post(`/v1/${capture.name}:listCollectionIds`,{})).body.collectionIds||[];
if(collections.some(c=>c!=='photos'))throw Error('Unexpected child collection: inspect before promotion');
let photos=[],pageToken;
do{const r=(await db.get(`/v1/${capture.name}/photos`,{queryParams:{pageSize:100,...(pageToken?{pageToken}:{})}})).body;photos.push(...(r.documents||[]));pageToken=r.nextPageToken;}while(pageToken);
const sourcePrefix=`reality-captures/${owner}/${id}/`,targetPrefix=`reality-captures/${targetOwner}/${id}/`,sourceBucket=`${source}.firebasestorage.app`,targetBucket=`${target}.firebasestorage.app`;
let objects=[];pageToken=undefined;
do{const r=(await storage.get(`/storage/v1/b/${sourceBucket}/o`,{queryParams:{prefix:sourcePrefix,...(pageToken?{pageToken}:{})}})).body;objects.push(...(r.items||[]));pageToken=r.nextPageToken;}while(pageToken);
if(!objects.length||!objects.some(o=>o.name===reps[0].fields.modelPath.stringValue&&o.generation===reps[0].fields.modelGeneration.stringValue))throw Error('Approved immutable derivative missing');
const {stableId}=createRequire(import.meta.url)('../../functions/reality-capture-authority.js');
const buildingId=f.building.mapValue.fields.sourceBuildingId.stringValue;
const manifest=(await db.get(`/v1/${root(source)}/buildingPatchManifests/${stableId('building-patches',buildingId)}`)).body;
const regions=manifest.fields.regions.arrayValue.values||[];
if(regions.some(v=>v.mapValue.fields.captureId.stringValue!==id))throw Error('Shared manifest requires an explicit merge plan');
const documents=[capture,...photos,...reps,manifest];
// All destination metadata must be absent before copying anything.
for(const doc of documents){try{await db.get(`/v1/${doc.name.replace(root(source),root(target))}`);throw Error('Destination record exists; stop without overwriting');}catch(e){if(e.status!==404&&e.context?.response?.statusCode!==404&&!String(e.message).includes('404'))throw e;}}
console.log(JSON.stringify({apply,captureId:id,objects:objects.length,photos:photos.length,documents:documents.length,bytes:objects.reduce((n,o)=>n+Number(o.size),0),ownerMapped:true}));
if(!apply)process.exit(0);
const generations=new Map();
for(const o of objects){
 const name=o.name.replace(sourcePrefix,targetPrefix),metadata={...(o.metadata||{})};delete metadata.firebaseStorageDownloadTokens;
 if(metadata.ownerUid===owner)metadata.ownerUid=targetOwner;
 let copied;
 try{copied=(await storage.get(`/storage/v1/b/${targetBucket}/o/${encodeURIComponent(name)}`)).body;}catch(e){if(!String(e.message).includes('404')&&e.status!==404&&e.context?.response?.statusCode!==404)throw e;}
 if(!copied){let token;do{const r=(await storage.post(`/storage/v1/b/${sourceBucket}/o/${encodeURIComponent(o.name)}/rewriteTo/b/${targetBucket}/o/${encodeURIComponent(name)}`,{metadata,cacheControl:'private, no-store'},{queryParams:{sourceGeneration:o.generation,ifGenerationMatch:'0',...(token?{rewriteToken:token}:{})}})).body;copied=r.resource;token=r.rewriteToken;if(r.done)break;}while(token);}
 if(!copied||copied.size!==o.size||copied.crc32c!==o.crc32c||copied.md5Hash!==o.md5Hash||copied.metadata?.firebaseStorageDownloadTokens)throw Error('Destination media validation failed');
 if(generations.has(o.generation)&&generations.get(o.generation)!==copied.generation)throw Error('Ambiguous generation remap');
 generations.set(o.generation,copied.generation);
}
function remap(v){if(Array.isArray(v))return v.map(remap);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,remap(x)]));if(typeof v!=='string')return v;if(v===owner)return targetOwner;if(generations.has(v))return generations.get(v);return v.replaceAll(sourcePrefix,targetPrefix).replaceAll(sourceBucket,targetBucket).replaceAll(root(source),root(target));}
const writes=documents.map(doc=>({update:{name:doc.name.replace(root(source),root(target)),fields:remap(doc.fields)},currentDocument:{exists:false}}));
await db.post(`/v1/projects/${target}/databases/(default)/documents:commit`,{writes});
console.log('Approved exterior and protected media promoted atomically; staging unchanged.');
